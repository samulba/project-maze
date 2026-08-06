import { type PlayerClass } from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { chargeConfigFor } from './family-upgrades.js';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  signatureStateFor,
  type SignatureRuntimePlayer
} from './signature.js';

/**
 * Klassen 3.0 – Signature der PRECISION-Familie: **Ladeschuss**.
 *
 * Halten lädt, Loslassen schießt, ein Sofortklick ist ein schwacher Schuss.
 * Damit wird aus „so schnell klicken wie möglich" ein Timing- und
 * Positionsspiel – das Ziel aus dem Masterplan.
 *
 * ## Warum die Ladung **nicht** auf das Tempo geht
 *
 * Der Masterplan lässt Schaden, Tempo und Größe steigen. Das Tempo lasse ich
 * bewusst aus: Projektiltempo 2.0 deckelt das Grundtempo, weil Precision die
 * einzige Familie war, deren Kugeln überhaupt nicht ausweichbar sind
 * (Ausweich-Index 0,00–0,15 auf 450 px). Ein Ladeschuss, der über den Deckel
 * hinausschießt, wäre genau die Kugel, über die Sam sich beschwert hat – und
 * ausgerechnet die stärkste. Die Größe übernimmt die Rolle des sichtbaren
 * „stärkeren Schusses": Sie macht den Schuss leichter zu landen, ohne ihn
 * unausweichbar zu machen.
 *
 * ## Warum der Schaden nie über den heutigen Wert steigt
 *
 * Gerechnet, nicht geschätzt: Ein voll auf Schaden ausgebauter **Lancer** trägt
 * heute 127,9 Schaden je Schuss, und der dünnste voll auf Leben ausgebaute
 * Gegner derselben Freischaltstufe hat 148 Leben – **86 %**. Jeder Ladefaktor
 * über 1,16× erzeugt einen Ein-Schuss-Tod aus voller Entfernung. Die
 * Kopfzahlen der übrigen Precision-Klassen liegen zwischen 1,69× und 3,90×;
 * die engste Klasse bestimmt die Grenze.
 *
 * Deshalb: Die Ladung führt den Schaden vom **Sofortklick-Sockel** (0,45×) auf
 * **genau den heutigen Wert** (1,0×) zurück – und keinen Deut darüber. Ein
 * Ladeschuss kann damit per Konstruktion keinen Gegner töten, den ein heutiger
 * Schuss nicht auch getötet hätte. Ein Test hält das über alle Klassen fest.
 *
 * ## Die Kadenz – und warum der volle Ausschlag nicht das Optimum ist
 *
 * Die Ladung läuft parallel zum Nachladen. Voll geladen ist der Schuss nach
 * `chargeReloadFactor × Nachladezeit`; darunter bleibt die Kadenz
 * nachladegebunden. Der Schaden erreicht seinen Höchstwert schon bei
 * `damageFullAt` (58 %) – genau dort, wo die Ladezeit der Nachladezeit
 * entspricht. Damit gilt:
 *
 * | Ladung | Kadenz | Schaden | DPS gegenüber heute |
 * |---|---|---|---|
 * | 0 % (Klick) | Nachladezeit | 0,45× | **45 %** |
 * | 58 % | Nachladezeit | 1,00× | **100 %** |
 * | 100 % | 1,72 × Nachladezeit | 1,00× + Größe + Durchschlag | 58 % |
 *
 * Der volle Ausschlag ist also **keine DPS-Steigerung, sondern ein anderer
 * Schuss**: dicker, mit mehr Durchschlag, für den Treffer durch die Lücke oder
 * durch mehrere Ziele. Das ist eine echte Entscheidung – aber es ist nicht das,
 * was der Masterplan beschreibt („voll aufgeladen ist der starke Schuss").
 * Der einzige Hebel dafür wäre Lancers Grundschaden; das ist eine
 * Balance-Entscheidung und steht im Bericht, nicht in diesem Code.
 */

export interface ChargeConfig {
  /** Ladezeit als Vielfaches der Nachladezeit. 1,72 = 1 + 0,09 × 8 (KL4-Raster). */
  readonly chargeReloadFactor: number;
  /** Schadensanteil eines ungeladenen Sofortschusses. */
  readonly minDamageScale: number;
  /** Ab dieser Ladung trägt der Schuss seinen vollen (heutigen) Schaden. */
  readonly damageFullAt: number;
  /** Größenzuwachs bei voller Ladung. */
  readonly maxRadiusScale: number;
  /** Durchschlagszuwachs bei voller Ladung. */
  readonly maxPenetrationScale: number;
}

export const DEFAULT_CHARGE: ChargeConfig = {
  // 1,72 ist kein runder Wert, sondern das KL4-Raster: Mit acht Punkten in
  // `signatureRate` (+9 % je Punkt) schrumpft die Ladezeit auf genau eine
  // Nachladezeit. So bleibt der Slot über alle acht Stufen wirksam, statt
  // nach zwei Punkten in den Nachlade-Boden zu laufen.
  chargeReloadFactor: 1.72,
  minDamageScale: 0.45,
  // 1 / 1,72: der Punkt, an dem die Ladezeit die Nachladezeit erreicht.
  damageFullAt: 0.58,
  maxRadiusScale: 1.4,
  maxPenetrationScale: 1.5
};

export const isPrecisionClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'precision';

/** Ladung 0–100 auf 0–1. */
const ratio = (charge: number): number => Math.max(0, Math.min(SIGNATURE_MAX, charge)) / SIGNATURE_MAX;

/**
 * Schadensfaktor der Ladung. Quadratisch bis `damageFullAt`, danach konstant
 * 1,0 – über den heutigen Schaden geht es nie hinaus.
 *
 * Die quadratische Kurve ist Absicht: Sie macht die ersten Ladeanteile billig
 * und die letzten wertvoll, statt halbgares Antippen zu belohnen.
 */
export function chargeDamageScale(charge: number, config: ChargeConfig = DEFAULT_CHARGE): number {
  const share = Math.min(1, ratio(charge) / Math.max(0.01, config.damageFullAt));
  return config.minDamageScale + (1 - config.minDamageScale) * share * share;
}

/** Größenfaktor – linear über die ganze Ladung, das ist die sichtbare Rückmeldung. */
export function chargeRadiusScale(charge: number, config: ChargeConfig = DEFAULT_CHARGE): number {
  return 1 + (config.maxRadiusScale - 1) * ratio(charge);
}

/** Durchschlagsfaktor – linear, der Nutzen des vollen Ausschlags. */
export function chargePenetrationScale(charge: number, config: ChargeConfig = DEFAULT_CHARGE): number {
  return 1 + (config.maxPenetrationScale - 1) * ratio(charge);
}

/** Sekunden von leer bis voll für eine Klasse mit dieser Nachladezeit. */
export function chargeSeconds(reload: number, config: ChargeConfig = DEFAULT_CHARGE): number {
  return Math.max(0.05, reload * config.chargeReloadFactor);
}

type RuntimePlayer = SignatureRuntimePlayer;

interface TunedStats {
  reload: number;
  damage: number;
  projectileRadius: number;
  penetration: number;
  droneCount: number;
}

interface PrecisionInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  fire(player: RuntimePlayer, stats: TunedStats): void;
}

/**
 * Hängt den Ladeschuss an. `enabled = false` lässt die Schicht komplett weg –
 * der Server feuert dann exakt wie vorher.
 *
 * Die Schicht gehört **direkt um `tuneCombatScaling`**: Dort steht die Zeile
 * `if (player.primary && player.cooldown <= 0) fire(...)`, und genau die muss
 * für Precision ausgesetzt werden. Weiter außen läge zwischen Entscheidung und
 * Ausführung die halbe Kette; weiter innen gibt es die Entscheidung noch nicht.
 */
export function tunePrecisionSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: ChargeConfig = DEFAULT_CHARGE,
  familyUpgrades = false
): T {
  if (!enabled) return game;
  const internals = game as unknown as PrecisionInternals;
  const charge = signatureStateFor(game, 'precision');
  /** Losgelassen, wartet auf das Ende der Nachladezeit – die Eingabe geht nicht verloren. */
  const pending = new Set<string>();

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    if (!isPrecisionClass(player.playerClass)) {
      originalStepPlayer(player, dt, now);
      // Räumt das Feld auf, wenn ein Spieler die Familie verlässt.
      advanceSignature(charge, player, dt, false, 0);
      return;
    }

    // Der Originalschritt darf nicht selbst schießen: Er würde bei gehaltener
    // Taste sofort feuern, statt zu laden. Statt die Eingabe zu verbiegen –
    // die Bot-Steuerung setzt sie mitten im Schritt neu – wird der Schuss
    // abgefangen und der Cooldown zurückgenommen.
    const cooldownBefore = player.cooldown;
    const realFire = internals.fire;
    let wouldFire = false;
    internals.fire = (target: RuntimePlayer, stats: TunedStats): void => {
      if (target === player) {
        wouldFire = true;
        return;
      }
      realFire(target, stats);
    };
    try {
      originalStepPlayer(player, dt, now);
    } finally {
      internals.fire = realFire;
    }
    if (wouldFire) player.cooldown = Math.max(0, cooldownBefore - dt);

    if (player.dead) {
      pending.delete(player.id);
      advanceSignature(charge, player, dt, true, 0);
      return;
    }

    const stats = tunedStatsFor(player as never) as unknown as TunedStats;
    // KL4: `signatureRate` verkürzt die Ladezeit, `signaturePower` hebt Größe
    // und Durchschlag. Ohne Familien-Upgrades bleibt es beim Festwert.
    const active = familyUpgrades ? chargeConfigFor(config, player.upgrades) : config;
    let level = charge.get(player.id) ?? 0;
    const waiting = pending.has(player.id);
    if (player.primary && !waiting) {
      level = Math.min(SIGNATURE_MAX, level + (SIGNATURE_MAX / chargeSeconds(stats.reload, active)) * dt);
    } else if (!player.primary && level > 0) {
      // Loslassen ist die Schussanweisung. Kommt sie, während noch nachgeladen
      // wird, bleibt sie stehen, statt verloren zu gehen – über das Netz ist
      // ein Tastendruck sonst eine Frage des Timings der Pakete.
      pending.add(player.id);
    }

    const releaseNow = pending.has(player.id) || level >= SIGNATURE_MAX;
    if (releaseNow && level > 0 && player.cooldown <= 0) {
      // `internals.fire` und nicht `realFire`: Äußere Schichten (Klassen-
      // mechanik) sollen ihren Schuss behalten.
      internals.fire(player, {
        ...stats,
        damage: stats.damage * chargeDamageScale(level, active),
        projectileRadius: stats.projectileRadius * chargeRadiusScale(level, active),
        penetration: stats.penetration * chargePenetrationScale(level, active)
      });
      player.cooldown = stats.reload;
      pending.delete(player.id);
      level = 0;
    }

    charge.set(player.id, level);
    player.signature = Math.round(level);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    charge.delete(id);
    pending.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Ladestand für Tests und Betriebsanzeigen. */
export function chargeFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'precision').get(playerId) ?? 0;
}
