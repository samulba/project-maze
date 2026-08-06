import { type PlayerClass } from '@project-maze/shared';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  signatureStateFor,
  type SignatureRuntimePlayer,
  type SignatureState
} from './signature.js';

// Der gemeinsame Unterbau liegt in `signature.ts`; hier steht nur, was Tempest
// von den anderen Familien unterscheidet.
export { SIGNATURE_MAX } from './signature.js';

/**
 * Klassen 4.0 – Signature der TEMPEST-Familie: **Hitze**.
 *
 * Feuern heizt den Reaktor, und ein heißer Reaktor schlägt härter – bis er
 * glüht. Drei Regeln bauen daraus ein Burst-Fenster mit Preis:
 *
 * 1. **Jede Salve heizt** (+`heatPerShot`). Eine Salve ist ein `fire`-Aufruf,
 *    egal wie viele Läufe sie hat – sonst würde eine Inferno (drei Läufe)
 *    dreimal so schnell überhitzen wie eine Surge, und die Mehrlauf-Klassen
 *    wären ausgerechnet in ihrer eigenen Familie die Verlierer.
 * 2. **Hitze zahlt auf den Projektilschaden ein** (bis +`maxBonus`). Die Salve
 *    nutzt den Stand, den sie VORFINDET – wie beim Momentum: erst schießen,
 *    dann fortschreiben. Die neunte Salve ist damit die härteste, nicht die
 *    erste nach der Abkühlung.
 * 3. **Bei 100 überhitzt der Reaktor**: `overheatLockSeconds` Zwangspause,
 *    danach ist er kalt (0). Wer knapp unter der Kante bleibt und rechtzeitig
 *    ablässt (`decayDelaySeconds` Feuerpause, dann −`decayPerSecond`/s),
 *    behält den Bonus – das Hitzemanagement ist die eigentliche Kunst der
 *    Familie, nicht das Dauerfeuer.
 */

export interface HeatConfig {
  /** Aufheizung je Salve – je `fire`-Aufruf, nicht je Lauf. */
  readonly heatPerShot: number;
  /** Abkühlung je Sekunde, sobald die Feuerpause lang genug war. */
  readonly decayPerSecond: number;
  /** Erst nach dieser Feuerpause beginnt die Abkühlung. */
  readonly decayDelaySeconds: number;
  /** Schadensaufschlag bei voller Hitze. 0.40 = +40 % Projektilschaden. */
  readonly maxBonus: number;
  /** Dauer der Feuersperre nach einer Überhitzung. */
  readonly overheatLockSeconds: number;
}

export const DEFAULT_HEAT: HeatConfig = {
  // Neun Salven bis zur Überhitzung (12 × 9 = 108 ≥ 100). Die Abkühlpause von
  // 0,4 s liegt über der Nachladezeit von Tempest (0,34 s) und Scorch (0,26 s):
  // Wer durchzieht, kühlt nie – die Entscheidung „ablassen oder riskieren"
  // stellt sich also wirklich. Kandidaten für die Telemetrie-Runde KL5.
  heatPerShot: 12,
  decayPerSecond: 20,
  decayDelaySeconds: 0.4,
  maxBonus: 0.4,
  overheatLockSeconds: 1.2
};

export const isTempestClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'tempest';

/**
 * Schadensfaktor bei gegebener Hitze: 0 → 1.0 (unverändert),
 * 100 → 1 + `maxBonus`. Dazwischen linear, außerhalb 0..100 gedeckelt.
 */
export function heatDamageScale(heat: number, config: HeatConfig = DEFAULT_HEAT): number {
  const clamped = Math.max(0, Math.min(SIGNATURE_MAX, heat));
  return 1 + config.maxBonus * (clamped / SIGNATURE_MAX);
}

type RuntimePlayer = SignatureRuntimePlayer;

/** Nur was der Feuer-Haken anfasst – alle übrigen Stats laufen unverändert durch. */
interface FireStats {
  damage: number;
}

interface TempestInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  fire(player: RuntimePlayer, stats: FireStats): void;
}

/**
 * Zwei Uhren je Spieler, die der gemeinsame Unterbau nicht kennt:
 *
 * - `sinceFire` steuert den **verzögerten** Zerfall – die Hitze fällt erst,
 *   wenn die Feuerpause `decayDelaySeconds` überschritten hat.
 * - `lockRemaining` beantwortet die eine Frage, die der Cooldown nicht
 *   beantwortet: Wann wird der Reaktor wieder kalt? Der Cooldown gehört der
 *   Nachladelogik und wird von jedem Schuss überschrieben – er taugt als
 *   Sperre, aber nicht als Gedächtnis. Die Uhr zählt mit exakt derselben
 *   Arithmetik herunter wie der Cooldown, damit beide im selben Tick enden.
 */
interface HeatClock {
  sinceFire: number;
  lockRemaining: number;
}

/**
 * Fließkomma-Schutz: 16 Ticks à 0,025 s müssen als „0,4 s erreicht" gelten
 * und 48 Ticks als „1,2 s vorbei", obwohl die Summen um wenige ULP daneben
 * liegen. Ohne Toleranz hinge das Verhalten an Rundungsresten.
 */
const EPSILON = 1e-9;

/** Schreibt einen Füllstand samt gerundetem Snapshot-Wert. */
const setHeat = (state: SignatureState, player: RuntimePlayer, value: number): void => {
  state.set(player.id, value);
  player.signature = Math.round(value);
};

/**
 * Hängt Hitze an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, `signature` taucht in keinem
 * Snapshot auf, kein Schuss wird verstärkt und nichts sperrt das Feuern.
 */
export function tuneTempestSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: HeatConfig = DEFAULT_HEAT
): T {
  if (!enabled) return game;
  const internals = game as unknown as TempestInternals;
  const heat = signatureStateFor(game, 'tempest');
  const clocks = new Map<string, HeatClock>();
  /**
   * Wer in diesem Tick gefeuert bzw. überhitzt hat. Rapid erkennt den Schuss
   * am gestiegenen Cooldown – NACH dem Tick. Für die Hitze reicht das nicht:
   * Der Bonus muss in die Projektile genau dieser Salve, und die sind nach dem
   * Tick längst in der Welt. Deshalb hängt Tempest direkt am `fire`-Aufruf und
   * meldet über diese Marken an den Tick zurück.
   */
  let firedId: string | null = null;
  let overheatedId: string | null = null;

  const originalFire = internals.fire.bind(internals);
  internals.fire = (player: RuntimePlayer, stats: FireStats): void => {
    if (!isTempestClass(player.playerClass)) {
      originalFire(player, stats);
      return;
    }
    // Die Salve nutzt den Stand, den sie vorfindet – erst danach wird geheizt.
    const before = heat.get(player.id) ?? 0;
    originalFire(player, { ...stats, damage: stats.damage * heatDamageScale(before, config) });
    firedId = player.id;
    const raw = before + config.heatPerShot;
    setHeat(heat, player, Math.min(SIGNATURE_MAX, raw));
    if (raw >= SIGNATURE_MAX) overheatedId = player.id;
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    // Die Sperr-Uhr läuft VOR dem Original-Tick ab, damit der erste Schuss
    // nach der Sperre den kalten Reaktor sieht – im selben Tick, in dem der
    // Cooldown ihn wieder feuern lässt. Liefe sie danach, bekäme dieser Schuss
    // fälschlich den vollen Bonus der eingefrorenen 100.
    const clock = clocks.get(player.id);
    if (clock && clock.lockRemaining > 0) {
      clock.lockRemaining = Math.max(0, clock.lockRemaining - dt);
      if (clock.lockRemaining <= EPSILON) {
        clock.lockRemaining = 0;
        clock.sinceFire = Number.POSITIVE_INFINITY;
        setHeat(heat, player, 0);
      }
    }
    firedId = null;
    overheatedId = null;
    originalStepPlayer(player, dt, now);

    const inFamily = isTempestClass(player.playerClass);
    if (!inFamily || player.dead) {
      // Uhren mit aufräumen – der Unterbau kennt nur den Füllstand.
      clocks.delete(player.id);
      advanceSignature(heat, player, dt, inFamily, 0);
      return;
    }
    let ticker = clocks.get(player.id);
    if (!ticker) {
      // Wer nie gefeuert hat, darf sofort abkühlen – bei Hitze 0 ist das egal,
      // aber die Uhr soll keinen erfundenen „letzten Schuss" behaupten.
      ticker = { sinceFire: Number.POSITIVE_INFINITY, lockRemaining: 0 };
      clocks.set(player.id, ticker);
    }

    let rate = 0;
    if (overheatedId === player.id) {
      // Sperren über den vorhandenen Nachlademechanismus: `stepPlayer` feuert
      // nur bei Cooldown ≤ 0, also genügt es, ihn hochzusetzen – Bots, Client
      // und alle anderen Schichten verstehen das ohne neuen Sonderfall.
      // `max` statt Zuweisung, damit eine kurz konfigurierte Sperre die
      // reguläre Nachladezeit nie unterbietet.
      player.cooldown = Math.max(player.cooldown, config.overheatLockSeconds);
      ticker.lockRemaining = player.cooldown;
      ticker.sinceFire = 0;
    } else if (firedId === player.id) {
      ticker.sinceFire = 0;
    } else if (ticker.lockRemaining > 0) {
      // Während der Sperre bleibt die Anzeige auf 100 stehen: Der Reaktor
      // glüht sichtbar, statt scheinbar abzukühlen und trotzdem stumm zu
      // sein. Kalt wird er in einem Schritt, wenn die Sperre endet.
    } else {
      ticker.sinceFire += dt;
      if (ticker.sinceFire >= config.decayDelaySeconds - EPSILON) rate = -config.decayPerSecond;
    }
    advanceSignature(heat, player, dt, inFamily, rate);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    heat.delete(id);
    clocks.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function heatFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'tempest').get(playerId) ?? 0;
}
