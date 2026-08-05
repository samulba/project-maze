import { type PlayerClass } from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  isMovingFast,
  signatureStateFor,
  type SignatureRuntimePlayer
} from './signature.js';

// Der gemeinsame Unterbau liegt in `signature.ts`; hier steht nur, was Rapid
// von den anderen Familien unterscheidet.
export { SIGNATURE_MAX } from './signature.js';

/**
 * Klassen 3.0 – Signature der RAPID-Familie: **Momentum**.
 *
 * Die Idee aus dem Masterplan in einem Satz: Wer in Bewegung feuert, feuert
 * schneller; wer stehen bleibt, verliert den Vorteil. Rapid wird damit die
 * Familie, die Druck macht, statt die Familie, die am schnellsten klickt –
 * Spam aus der Deckung ist ausdrücklich der schlechtere Weg.
 *
 * Drei Zustände, jeder mit eigener Rate:
 *
 * | Zustand | Momentum |
 * |---|---|
 * | fährt **und** hält die Feuertaste | steigt (`buildPerSecond`) |
 * | steht | fällt schnell (`decayPerSecond`) |
 * | fährt, feuert aber nicht | fällt langsam (`holdDecayPerSecond`) |
 *
 * Der Aufbau hängt bewusst an `primary` und nicht am tatsächlichen Schuss:
 * Sonst hinge die Aufbaurate an der Feuerrate, und eine Gatling (0,28 s
 * Nachladezeit) bräuchte für dieselbe Ladung fünfmal so lange wie eine Rapid
 * (0,19 s) – ausgerechnet die Klasse, die am meisten aufs Feuern setzt.
 */

export interface MomentumConfig {
  /** Aufbau je Sekunde, solange in Bewegung gefeuert wird. */
  readonly buildPerSecond: number;
  /** Abbau je Sekunde im Stillstand. */
  readonly decayPerSecond: number;
  /** Abbau je Sekunde, wenn der Spieler zwar fährt, aber nicht feuert. */
  readonly holdDecayPerSecond: number;
  /** Ab diesem Anteil der eigenen Höchstgeschwindigkeit gilt „in Bewegung". */
  readonly moveThreshold: number;
  /** Nachladeabschlag bei vollem Momentum. 0.25 = −25 % Nachladezeit. */
  readonly maxReloadBonus: number;
}

export const DEFAULT_MOMENTUM: MomentumConfig = {
  // 3,3 s Dauerfeuer in Bewegung bis Vollausschlag, 2 s Stehen zurück auf null.
  // Der Aufbau ist bewusst träger als der Abbau: Anfahren kostet, Anhalten
  // kostet mehr. Beide Werte sind Kandidaten für die Telemetrie-Runde KL5.
  buildPerSecond: 30,
  decayPerSecond: 50,
  holdDecayPerSecond: 10,
  // 45 % der eigenen Höchstgeschwindigkeit. Ein strafender Tank fällt beim
  // Richtungswechsel kurz darunter – die Schwelle darf ihn nicht bestrafen.
  moveThreshold: 0.45,
  maxReloadBonus: 0.25
};

export const isRapidClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'rapid';

/**
 * Nachladefaktor bei gegebenem Momentum: 0 → 1.0 (unverändert),
 * 100 → 1 − `maxReloadBonus`. Dazwischen linear. Auch der Balance-Report
 * rechnet damit, damit dort keine zweite Zahlenquelle entsteht.
 */
export function momentumReloadScale(momentum: number, config: MomentumConfig = DEFAULT_MOMENTUM): number {
  const clamped = Math.max(0, Math.min(SIGNATURE_MAX, momentum));
  return 1 - config.maxReloadBonus * (clamped / SIGNATURE_MAX);
}

/** Effektive Feuerrate (Schuss/s) einer Nachladezeit bei gegebenem Momentum. */
export function momentumFireRate(reload: number, momentum: number, config: MomentumConfig = DEFAULT_MOMENTUM): number {
  return 1 / Math.max(0.001, reload * momentumReloadScale(momentum, config));
}

type RuntimePlayer = SignatureRuntimePlayer;

interface SignatureInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
}

/**
 * Hängt Momentum an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, und `signature` taucht in keinem
 * Snapshot auf.
 */
export function tuneRapidSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: MomentumConfig = DEFAULT_MOMENTUM
): T {
  if (!enabled) return game;
  const internals = game as unknown as SignatureInternals;
  const momentum = signatureStateFor(game, 'rapid');

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    // Vor dem Tick merken: `stepPlayer` zählt den Cooldown herunter und setzt
    // ihn nur beim Schuss wieder hoch. Ein gestiegener Cooldown ist damit das
    // eindeutige Zeichen „in diesem Tick wurde gefeuert".
    const cooldownBefore = player.cooldown;
    originalStepPlayer(player, dt, now);

    const inFamily = isRapidClass(player.playerClass);
    // Der Schuss dieses Ticks nutzt das Momentum, das der Spieler beim Abdrücken
    // hatte – erst danach wird fortgeschrieben.
    if (inFamily && !player.dead && player.cooldown > cooldownBefore) {
      player.cooldown *= momentumReloadScale(momentum.get(player.id) ?? 0, config);
    }

    // Rate nur berechnen, wenn sie gebraucht wird – `tunedStatsFor` ist für
    // jeden Nicht-Rapid-Spieler reine Verschwendung.
    let rate = 0;
    if (inFamily && !player.dead) {
      const moving = isMovingFast(player, tunedStatsFor(player).moveSpeed, config.moveThreshold);
      rate = !moving
        ? -config.decayPerSecond
        : player.primary
          ? config.buildPerSecond
          : -config.holdDecayPerSecond;
    }
    advanceSignature(momentum, player, dt, inFamily, rate);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    momentum.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Unterhalb dieser Bewegungsabsicht gilt ein Bot als stehend. */
export const RAPID_BOT_MIN_MOVE = 0.2;

interface BotInternals {
  updateBot(player: RuntimePlayer, now: number): void;
}

/**
 * Bewegungsregel für Rapid-Bots: **nie stehen bleiben.**
 *
 * Die Bot-Steuerung kennt Momentum nicht. Sie hält an, wenn sie sich abseits
 * des Gefechts repariert – für jede andere Familie richtig, für Rapid aber der
 * teuerste Moment überhaupt: Der Füllstand fällt im Stand fünfmal schneller als
 * in Fahrt, und der Bot geht danach mit leerem Konto zurück ins Gefecht.
 *
 * Deshalb eine eigene, äußere Schicht: `tuneBotBrain` ersetzt `updateBot`
 * vollständig, eine innere Änderung würde einfach überschrieben. Hier wird nur
 * die letzte Entscheidung nachgebessert – gefeuert wird weiterhin nicht, die
 * Reparatur bricht also nicht ab.
 *
 * Steht am selben Schalter wie die Mechanik: Ohne Signature keine Sonderregel.
 */
export function tuneRapidBots<T extends MazeGame>(game: T, enabled = false): T {
  if (!enabled) return game;
  const internals = game as unknown as BotInternals;
  const originalUpdateBot = internals.updateBot.bind(internals);

  internals.updateBot = (player: RuntimePlayer, now: number): void => {
    originalUpdateBot(player, now);
    if (!player.bot || player.dead || !isRapidClass(player.playerClass)) return;
    // Spawnschutz nicht aushebeln: Die Bot-Steuerung beendet ihn, sobald sie
    // handelt. Wer noch geschützt dasteht, soll das auch dürfen.
    if (player.invulnerable) return;
    if (Math.hypot(player.move.x, player.move.y) >= RAPID_BOT_MIN_MOVE) return;

    const speed = Math.hypot(player.velocity.x, player.velocity.y);
    if (speed > 1) {
      player.move = { x: player.velocity.x / speed, y: player.velocity.y / speed };
      return;
    }
    // Ohne Richtung im Kreis – dieselbe Ausweichbewegung, die die Bot-Steuerung
    // ohne Ziel fährt, damit acht Bots nicht synchron dieselbe Bahn ziehen.
    const angle = now / 1800 + player.id.length;
    player.move = { x: Math.cos(angle), y: Math.sin(angle) };
  };

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function momentumFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'rapid').get(playerId) ?? 0;
}
