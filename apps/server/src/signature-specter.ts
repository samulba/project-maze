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

// Der gemeinsame Unterbau liegt in `signature.ts`; hier steht nur, was Specter
// von den anderen Familien unterscheidet.
export { SIGNATURE_MAX } from './signature.js';

/**
 * Klassen 4.0 – Signature der SPECTER-Familie: **Tarnung**.
 *
 * Die Idee in einem Satz: Wer eine Weile weder schießt noch rempelt, lädt
 * Tarnung auf – und der erste Schuss aus voller Tarnung trifft härter. Specter
 * wird damit die Familie der Flanke und des Timings, nicht die des Dauerfeuers.
 *
 * Drei bewusste Abgrenzungen zu Momentum/Wucht:
 *
 * 1. **Bewegung ist erlaubt.** Die Tarnung hängt nur an Ruhe im Gefecht
 *    (kein Schuss, kein Körperkontakt), nicht am Stillstand. Ein Camping-Zwang
 *    wäre das Gegenteil eines Flanken-Werkzeugs.
 * 2. **Der Aufbau startet verzögert** (`quietDelaySeconds`): Nicht der Moment
 *    der letzten Störung zählt, sondern ob seither genug Ruhe vergangen ist.
 *    Ohne die Verzögerung könnte ein Specter zwischen zwei Schüssen einer
 *    langsamen Klasse nebenbei Tarnung „farmen".
 * 3. **Erlittener Beschuss bricht die Tarnung nicht.** Wer einen Schleicher
 *    aus der Distanz anschießt, soll ihn dadurch nicht entwerten können – nur
 *    die eigenen Aktionen des Specters (Schuss, Rempler) enttarnen ihn.
 */

export interface StealthConfig {
  /** Aufbau je Sekunde, sobald die Ruhephase erfüllt ist. */
  readonly buildPerSecond: number;
  /** So lange muss nach der letzten Störung Ruhe herrschen, ehe Aufbau beginnt. */
  readonly quietDelaySeconds: number;
  /** Sofortabzug bei erlittenem ODER ausgeteiltem Körperkontakt-Schaden. */
  readonly contactPenalty: number;
  /** Ab dieser Tarnung trägt der nächste Schuss den Erstschlag-Bonus. */
  readonly ambushThreshold: number;
  /** Schadensaufschlag des Erstschlags. 0.35 = ×1,35. */
  readonly ambushBonus: number;
}

export const DEFAULT_STEALTH: StealthConfig = {
  // 2,5 s Ruhe bis Vollausschlag – plus die 1,2 s Anlauf davor. Ein Erstschlag
  // kostet damit rund 3,7 s Zurückhaltung; das ist der Preis des Bonus.
  buildPerSecond: 40,
  quietDelaySeconds: 1.2,
  // Ein Rempler kostet mehr als eine halbe Ladung: Tarnung und Rammen sollen
  // sich gegenseitig ausschließen, sonst wäre Revenant beides gleichzeitig.
  contactPenalty: 60,
  // Knapp unter dem Deckel statt genau 100: Ein einzelner Rundungs- oder
  // Tick-Rest darf den Erstschlag nicht verhindern.
  ambushThreshold: 95,
  ambushBonus: 0.35
};

export const isSpecterClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'specter';

/**
 * Schadensfaktor eines Schusses bei gegebener Tarnung: unterhalb der Schwelle
 * 1.0, ab der Schwelle 1 + `ambushBonus`. Bewusst eine Stufe statt einer
 * Rampe – der Erstschlag ist ein Alles-oder-nichts-Moment, keine Skala.
 * Auch der Balance-Report rechnet damit, damit keine zweite Zahlenquelle entsteht.
 */
export function ambushDamageScale(stealth: number, config: StealthConfig = DEFAULT_STEALTH): number {
  return stealth >= config.ambushThreshold ? 1 + config.ambushBonus : 1;
}

type RuntimePlayer = SignatureRuntimePlayer;

interface SpecterInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, { ownerId: string; damage: number }>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  resolvePlayerCollisions(now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

/** Schreibt einen Füllstand samt gerundetem Snapshot-Wert. */
const setStealth = (state: SignatureState, player: RuntimePlayer, value: number): void => {
  state.set(player.id, value);
  player.signature = Math.round(value);
};

/**
 * Hängt Tarnung an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, `signature` taucht in keinem
 * Snapshot auf und kein Schuss trägt einen Bonus.
 */
export function tuneSpecterSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: StealthConfig = DEFAULT_STEALTH
): T {
  if (!enabled) return game;
  const internals = game as unknown as SpecterInternals;
  const stealth = signatureStateFor(game, 'specter');
  /**
   * Ruhe-Uhr je Spieler: frühester Zeitpunkt (ms), ab dem wieder aufgebaut
   * wird. Kein Eintrag heißt „nie gestört" – ein frisch gespawnter Specter
   * beginnt sofort zu laden, denn die Uhr misst den Abstand zur letzten
   * Störung, nicht die Zeit seit dem Spawn.
   */
  const quietUntil = new Map<string, number>();
  /** Nur Schaden aus `resolvePlayerCollisions` ist Körperkontakt. */
  let inBodyContact = false;
  /** Wer in diesem Tick Kontakt hatte – der Abzug gilt einmal je Tick. */
  const touched = new Set<string>();

  const disturb = (player: RuntimePlayer, now: number): void => {
    quietUntil.set(player.id, now + config.quietDelaySeconds * 1000);
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    const inFamily = isSpecterClass(player.playerClass);
    // Vor dem Tick merken: `stepPlayer` zählt den Cooldown herunter und setzt
    // ihn nur beim Schuss wieder hoch. Ein gestiegener Cooldown ist damit das
    // eindeutige Zeichen „in diesem Tick wurde gefeuert".
    const cooldownBefore = player.cooldown;
    // Der Erstschlag nutzt die Tarnung, die der Spieler beim Abdrücken hatte.
    // Der Projektil-Bestand wird nur festgehalten, wenn ein Erstschlag über-
    // haupt möglich ist – für jeden anderen Tick wäre das reine Verschwendung.
    const armed = inFamily && !player.dead && (stealth.get(player.id) ?? 0) >= config.ambushThreshold;
    const before = armed ? new Set(internals.projectiles.keys()) : null;
    originalStepPlayer(player, dt, now);

    if (inFamily && !player.dead && player.cooldown > cooldownBefore) {
      if (before) {
        // Alle in diesem Tick entstandenen eigenen Projektile sind DIE eine
        // Salve des Erstschlags – bei Mehrlauf-Klassen trägt damit jeder Lauf
        // den Bonus, aber eben nur dieses eine Mal: Der Schuss selbst setzt
        // die Tarnung gleich darunter auf 0.
        for (const [id, projectile] of internals.projectiles) {
          if (!before.has(id) && projectile.ownerId === player.id) {
            projectile.damage *= 1 + config.ambushBonus;
          }
        }
      }
      // Jeder eigene Schuss enttarnt sofort und stellt die Ruhe-Uhr neu.
      disturb(player, now);
      setStealth(stealth, player, 0);
    }

    let rate = 0;
    if (inFamily && !player.dead) {
      rate = now >= (quietUntil.get(player.id) ?? 0) ? config.buildPerSecond : 0;
    } else {
      // Tod und Familienwechsel löschen auch die Ruhe-Uhr: Ein Respawn soll
      // nicht die Störung seines vorigen Lebens abwarten müssen.
      quietUntil.delete(player.id);
    }
    advanceSignature(stealth, player, dt, inFamily, rate);
  };

  const originalResolve = internals.resolvePlayerCollisions.bind(internals);
  internals.resolvePlayerCollisions = (now: number): void => {
    inBodyContact = true;
    touched.clear();
    try {
      originalResolve(now);
    } finally {
      inBodyContact = false;
    }
    // Abzug erst nach der Auflösung: Ein Rempler erzeugt ZWEI Schadensereignisse
    // (erlitten und ausgeteilt), und wer in einem Tick zwei Gegner streift,
    // erzeugt vier – bezahlt wird trotzdem genau einmal −60 je Tick.
    for (const id of touched) {
      const player = internals.players.get(id);
      if (!player) continue;
      setStealth(stealth, player, Math.max(0, (stealth.get(id) ?? 0) - config.contactPenalty));
      disturb(player, now);
    }
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (
    target: RuntimePlayer,
    damage: number,
    attackerId: string | null,
    now: number
  ): void => {
    // Nur Treffer vormerken, die auch ankommen: Bei toten oder unverwundbaren
    // Zielen steigt `damagePlayer` aus, ein Abzug dafür wäre unverdient.
    if (inBodyContact && !target.dead && !target.invulnerable) {
      if (isSpecterClass(target.playerClass)) touched.add(target.id);
      const attacker = attackerId ? internals.players.get(attackerId) : undefined;
      if (attacker && isSpecterClass(attacker.playerClass)) touched.add(attacker.id);
    }
    originalDamagePlayer(target, damage, attackerId, now);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stealth.delete(id);
    quietUntil.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function stealthFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'specter').get(playerId) ?? 0;
}
