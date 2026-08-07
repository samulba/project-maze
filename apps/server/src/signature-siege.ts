import { type PlayerClass } from '@project-maze/shared';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  signatureStateFor,
  type SignatureRuntimePlayer
} from './signature.js';

// Der gemeinsame Unterbau liegt in `signature.ts`; hier steht nur, was Siege
// von den anderen Familien unterscheidet.
export { SIGNATURE_MAX } from './signature.js';

/**
 * Klassen 4.1 – Signature der SIEGE-Familie: **Stellung**.
 *
 * Die Idee in einem Satz: Wer steht, wird zur Kanone. Stellung ist das exakte
 * Gegenteil von Momentum (RAPID) – dort zahlt Fahrt, hier zahlt Stillstand.
 * Das ist bewusst dieselbe Mechanik mit umgekehrtem Vorzeichen: Zwei Familien,
 * die sich auf demselben Spielfeld gegenseitig bestrafen, ergeben eine echte
 * Positionsentscheidung statt zweier unabhängiger Buffs.
 *
 * Drei Festlegungen, die die Familie ausmachen:
 *
 * 1. **Umstellen kostet.** Der Abbau ist mit `decayPerSecond` doppelt so schnell
 *    wie der Aufbau. Wer die Stellung verlässt, zahlt den doppelten Preis für
 *    das Wiederaufbauen – „mal eben umsetzen" ist keine Gratis-Option, und ein
 *    Siege, der ständig kitet, hat effektiv gar keine Signature.
 * 2. **Die Schwelle misst die tatsächliche Geschwindigkeit, nicht die Eingabe.**
 *    `standstillSpeed` ist absolut (Weltmeilen je Sekunde), nicht wie bei Rapid
 *    ein Anteil der Höchstgeschwindigkeit: Eingegraben ist eingegraben, egal ob
 *    der Panzer 210 oder 232 laufen könnte. Wer von einer fremden Wirkung
 *    weggestoßen wird, verliert die Stellung ebenfalls – auch das ist gewollt.
 * 3. **Die Wirkung hängt an der Salve, nicht an den Stats.** Schaden und
 *    Lebenszeit werden auf die im Feuertick neu entstandenen eigenen Projektile
 *    geschrieben (Muster: Erstschlag in `signature-specter.ts`), nicht über
 *    `tunedStatsFor`. Damit trägt die abgefeuerte Salve exakt den Füllstand, den
 *    der Spieler beim Abdrücken hatte – auch dann noch, wenn er im selben Tick
 *    losfährt und die Stellung verliert.
 *
 * Anders als der Erstschlag verbraucht das Feuern die Stellung **nicht**: Ein
 * eingegrabener Ragnarok hält seinen Vorteil, solange er steht. Der Preis ist
 * die Unbeweglichkeit selbst – und die ist in einer Arena mit Rammern und
 * Flankierern hoch genug.
 */

export interface StellungConfig {
  /** Aufbau je Sekunde im Stillstand. */
  readonly buildPerSecond: number;
  /** Abbau je Sekunde in Bewegung – bewusst das Doppelte des Aufbaus. */
  readonly decayPerSecond: number;
  /** Unterhalb dieser tatsächlichen Geschwindigkeit gilt der Spieler als stehend. */
  readonly standstillSpeed: number;
  /** Schadensaufschlag der Salve bei voller Stellung. 0.45 = ×1,45. */
  readonly maxDamageBonus: number;
  /** Aufschlag auf die Projektil-Lebenszeit bei voller Stellung. 0.5 = ×1,5. */
  readonly maxRangeBonus: number;
}

export const DEFAULT_STELLUNG: StellungConfig = {
  // 2,86 s Stehen bis Vollausschlag, 1,43 s Fahren zurück auf null. Kandidaten
  // für die Telemetrie-Runde: Der Aufbau muss länger dauern als eine typische
  // Nachladezeit (0,62–1,25 s), sonst wäre die Stellung nach jedem Schuss
  // ohnehin wieder voll und die Entscheidung „stehen bleiben" fiele weg.
  buildPerSecond: 35,
  decayPerSecond: 70,
  // 20 ≈ 9 % der langsamsten Siege-Klasse (Trebuchet, 210). Das Austrudeln nach
  // dem Anhalten unterschreitet die Schwelle innerhalb eines Ticks, das
  // Nachschieben durch die Kollisionsauflösung ebenfalls – nur echtes Fahren
  // bleibt darüber.
  standstillSpeed: 20,
  maxDamageBonus: 0.45,
  maxRangeBonus: 0.5
};

export const isSiegeClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'siege';

/** Füllstand als Anteil 0..1, gegen Werte außerhalb 0..100 abgesichert. */
const fillOf = (stellung: number): number => Math.max(0, Math.min(SIGNATURE_MAX, stellung)) / SIGNATURE_MAX;

/**
 * Schadensfaktor der Salve: 0 → 1.0 (unverändert), 100 → 1 + `maxDamageBonus`.
 * Dazwischen linear. Auch der Balance-Report rechnet damit, damit hier keine
 * zweite Zahlenquelle entsteht.
 */
export function siegeDamageScale(stellung: number, config: StellungConfig = DEFAULT_STELLUNG): number {
  return 1 + config.maxDamageBonus * fillOf(stellung);
}

/**
 * Faktor auf die Projektil-Lebenszeit – und damit auf die Reichweite, denn das
 * Tempo bleibt unangetastet. Dieselbe Rampe wie beim Schaden, eigener Deckel:
 * Reichweite ist die Belohnung fürs Stehen, Tempo wäre eine andere Waffe.
 */
export function siegeRangeScale(stellung: number, config: StellungConfig = DEFAULT_STELLUNG): number {
  return 1 + config.maxRangeBonus * fillOf(stellung);
}

type RuntimePlayer = SignatureRuntimePlayer;

/** Nur was die Schicht anfasst – alle übrigen Projektilfelder bleiben unberührt. */
interface RuntimeProjectile {
  ownerId: string;
  damage: number;
  life: number;
}

interface SiegeInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
}

/**
 * Hängt Stellung an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, `signature` taucht in keinem
 * Snapshot auf und keine Salve trägt einen Aufschlag.
 */
export function tuneSiegeSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: StellungConfig = DEFAULT_STELLUNG
): T {
  if (!enabled) return game;
  const internals = game as unknown as SiegeInternals;
  const stellung = signatureStateFor(game, 'siege');

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    const inFamily = isSiegeClass(player.playerClass);
    // Vor dem Tick merken: `stepPlayer` zählt den Cooldown herunter und setzt
    // ihn nur beim Schuss wieder hoch. Ein gestiegener Cooldown ist damit das
    // eindeutige Zeichen „in diesem Tick wurde gefeuert".
    const cooldownBefore = player.cooldown;
    // Die Salve nutzt den Füllstand, den der Spieler beim Abdrücken hatte –
    // erst danach wird fortgeschrieben. Der Projektil-Bestand wird nur
    // festgehalten, wenn es überhaupt etwas zu verstärken gibt; für jeden
    // anderen Tick wäre das reine Verschwendung.
    const charged = inFamily && !player.dead ? stellung.get(player.id) ?? 0 : 0;
    const before = charged > 0 ? new Set(internals.projectiles.keys()) : null;
    originalStepPlayer(player, dt, now);

    if (before && !player.dead && player.cooldown > cooldownBefore) {
      // Alle in diesem Tick entstandenen eigenen Projektile SIND die eine
      // Salve – bei Mehrlauf-Klassen (Bombard 2, Howitzer 3) trägt damit jedes
      // Rohr denselben Aufschlag, statt ihn unter sich aufzuteilen.
      const damageScale = siegeDamageScale(charged, config);
      const rangeScale = siegeRangeScale(charged, config);
      for (const [id, projectile] of internals.projectiles) {
        if (before.has(id) || projectile.ownerId !== player.id) continue;
        projectile.damage *= damageScale;
        // Die Lebenszeit ist der Reichweiten-Regler: Das Projektil fliegt
        // gleich schnell, aber länger. Ein schnelleres Projektil würde die
        // Vorhaltezeit ändern – das ist eine andere Waffe, kein Aufschlag.
        projectile.life *= rangeScale;
      }
    }

    let rate = 0;
    if (inFamily && !player.dead) {
      // Gemessen wird die Geschwindigkeit NACH dem Tick, wie bei Momentum und
      // Wucht: `moveCircle` nullt blockierte Achsen, und wer gegen eine Wand
      // drückt, steht tatsächlich – der soll seine Stellung auch behalten.
      rate = Math.hypot(player.velocity.x, player.velocity.y) < config.standstillSpeed
        ? config.buildPerSecond
        : -config.decayPerSecond;
    }
    advanceSignature(stellung, player, dt, inFamily, rate);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stellung.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function stellungFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'siege').get(playerId) ?? 0;
}
