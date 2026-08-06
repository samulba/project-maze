import {
  CLASS_DEFINITIONS,
  GAME,
  PLAYER_CLASS_IDS,
  type ClassDefinition,
  type UpgradeLevels
} from '@project-maze/shared';
import { PASSIVE_MODIFIER_DEFINITIONS, PASSIVE_MODIFIER_IDS } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';

/**
 * Projektiltempo 2.0 – Sams Befund „die Kugeln sind viel zu schnell, und je
 * stärker der Gegner, desto unfairer".
 *
 * Die naheliegende Antwort – ein kräftigerer Dämpfer auf alles – habe ich
 * durchgerechnet und **verworfen**. Der Grund steht in einer einzigen Zahl: Ein
 * Fortress-Projektil fliegt heute mit 450 px/s, der schnellste Spieler der
 * Arena fährt 447 px/s. Die langsamen Klassen haben **keinen Spielraum nach
 * unten** – ein globaler Dämpfer macht ihre Kugeln unfähig, ein fliehendes Ziel
 * überhaupt einzuholen, und Weglaufen zur dominanten Strategie.
 *
 * Das Problem ist nicht das mittlere Tempo, sondern die **Spreizung**: Zwischen
 * Fortress (1,01× Spielertempo) und Lancer mit vollem Upgrade (4,36×) liegt
 * Faktor vier. Unfair ist das obere Ende – und das Upgrade, das jede Klasse um
 * 32 % nach oben schiebt.
 *
 * Deshalb drei Regeln statt eines Dämpfers, jede mit einer eigenen Aufgabe:
 *
 * | Regel | Aufgabe |
 * |---|---|
 * | **Dämpfer** `0.70` für alle Zweige | „overall zu schnell", Precision verliert die Sonderbehandlung |
 * | **Deckel**, fällt mit dem Level | „je stärker, desto langsamer" – trifft genau die Klassen, die zu schnell sind |
 * | **Boden** | keine Kugel wird langsamer, als sie ein fliehendes Ziel noch einholt |
 *
 * Dazu ein viertes Detail: Das Upgrade steigt nur noch um 2,5 % je Punkt statt
 * um 4 %, und es rechnet **nach** dem Deckel. So bleibt der Slot in jeder
 * Klasse und auf jeder Stufe gleich viel wert (+20 %) – ein Upgrade, das der
 * Deckel auffrisst, wäre ein toter Slot.
 *
 * Die Reichweite bleibt exakt konstant: `projectileLife` wird im selben Maß
 * verlängert, wie das Tempo fällt. Das ist das etablierte Muster – und es
 * nimmt dem Upgrade den heutigen, unbeabsichtigten Reichweitenbonus. Der war
 * ohnehin fast wertlos: Zielen lässt sich nur bis `maxAimDistance` (650 px),
 * sehen nur bis `viewRadius` (1100 px), und schon eine Core-Kugel fliegt heute
 * 1271 px weit.
 */

/*
 * Zweite Runde (01, 06.08. abends): Sam hat nach dem ersten Paket erneut „die
 * Kugeln sind noch immer zu schnell" gemeldet – aller Wahrscheinlichkeit nach,
 * ohne dass die Werte hier je gegriffen haben, weil der Schalter aus war. Mit
 * dem Umstellen auf Default-an kommt deshalb gleich eine Stufe mehr: Dämpfer
 * 0,70 → 0,60, Deckel 2,6/1,8 → 2,0/1,35.
 *
 * Der Boden schützt das dabei, was 02s Analyse geschützt haben wollte: Er ist
 * `min(heutiges Tempo, 1,25× Spielertempo)`, also macht keine dieser Senkungen
 * eine langsame Klasse unfähig, ein fliehendes Ziel einzuholen – sie kann eine
 * Kugel nie unter das heutige Tempo drücken. Die Senkung wirkt dort, wo sie
 * wirken soll: am oberen Ende.
 */

/** Dämpfer auf das Rohtempo, für alle Zweige gleich. */
export const PROJECTILE_SPEED_DAMPER = 0.6;
/** Deckel als Vielfaches des schnellsten Spielers – auf Level 1 … */
export const PROJECTILE_SPEED_CAP_HIGH = 2.0;
/** … und auf `GAME.maxLevel`. Dazwischen linear. */
export const PROJECTILE_SPEED_CAP_LOW = 1.35;
/**
 * Untergrenze als Vielfaches des schnellsten Spielers. Eine Kugel unter diesem
 * Verhältnis holt ein fliehendes Ziel praktisch nicht mehr ein.
 */
export const PROJECTILE_SPEED_FLOOR = 1.25;
/** Zuwachs je Punkt im `projectileSpeed`-Slot (heute 0.04). */
export const PROJECTILE_SPEED_PER_POINT = 0.025;
/**
 * Bezugsflugzeit für den Vorhalt der Bots. Wird die Kugel langsamer, wächst die
 * Flugzeit – und mit ihr der absolute Vorhaltfehler eines Bots, der nur
 * teilweise vorhält. Ohne Ausgleich träfen Bots still schlechter, und das
 * Pacing verschöbe sich, ohne dass jemand daran gedreht hätte.
 */
export const BOT_LEAD_REFERENCE_FLIGHT = 0.35;

/**
 * Tempo des schnellsten überhaupt baubaren Spielers. Einmal aus den
 * Klassendefinitionen gerechnet statt als Zahl abgeschrieben – sonst wandert
 * der Bezugspunkt beim nächsten Balance-Eingriff still weg.
 */
export const fastestPlayerSpeed = ((): number => {
  let fastest = 0;
  for (const id of PLAYER_CLASS_IDS) {
    const base = CLASS_DEFINITIONS[id];
    for (const modifierId of PASSIVE_MODIFIER_IDS) {
      const modifier = PASSIVE_MODIFIER_DEFINITIONS[modifierId];
      fastest = Math.max(
        fastest,
        base.moveSpeed * (1 + GAME.maxUpgradeLevel * 0.03) * modifier.moveMultiplier
      );
    }
  }
  return fastest;
})();

/** Heutiges Tempo einer Klasse ohne Upgrades – der Stand vor dieser Änderung. */
const legacySpeed = (base: ClassDefinition): number =>
  base.projectileSpeed * (base.branch === 'precision' ? 0.9 : 0.75);

/** Obergrenze des Grundtempos auf einer Levelstufe. */
export function projectileSpeedCapAt(level: number): number {
  const clamped = Math.max(1, Math.min(GAME.maxLevel, level));
  const ramp = (clamped - 1) / (GAME.maxLevel - 1);
  return fastestPlayerSpeed * (PROJECTILE_SPEED_CAP_HIGH - (PROJECTILE_SPEED_CAP_HIGH - PROJECTILE_SPEED_CAP_LOW) * ramp);
}

/**
 * Grundtempo nach Dämpfer, Deckel und Boden – ohne das Upgrade.
 *
 * Der Boden ist bewusst **nie höher als das heutige Tempo der Klasse**: Diese
 * Änderung darf keine Kugel schneller machen, als sie heute ist. Impact-Klassen
 * liegen schon heute unter dem Boden; für sie ändert sich damit gar nichts.
 */
export function projectileBaseSpeed(base: ClassDefinition, level: number): number {
  if (base.projectileSpeed <= 0) return 0;
  const damped = base.projectileSpeed * PROJECTILE_SPEED_DAMPER;
  const floor = Math.min(legacySpeed(base), fastestPlayerSpeed * PROJECTILE_SPEED_FLOOR);
  return Math.max(Math.min(damped, projectileSpeedCapAt(level)), floor);
}

/** Tempo inklusive Upgrade. Das Upgrade rechnet **nach** dem Deckel. */
export function projectileSpeedFor(base: ClassDefinition, level: number, speedPoints: number): number {
  const points = Math.max(0, Math.min(GAME.maxUpgradeLevel, speedPoints));
  return projectileBaseSpeed(base, level) * (1 + PROJECTILE_SPEED_PER_POINT * points);
}

/**
 * Lebensdauer zum neuen Tempo. `speed × life` bleibt exakt die Reichweite der
 * Klassendefinition – auf jeder Stufe und mit jedem Upgrade.
 */
export function projectileLifeFor(base: ClassDefinition, speed: number): number {
  if (speed <= 0) return base.projectileLife;
  return (base.projectileSpeed * base.projectileLife) / speed;
}

/**
 * Vorhalt eines Bots, gegen die Flugzeit ausgeglichen.
 *
 * Ein Bot hält nur zu `leadFactor` vor; sein absoluter Fehler ist
 * `Zieltempo × Flugzeit × (1 − leadFactor)` und wächst damit linear mit der
 * Flugzeit. Der Ausgleich hebt den Faktor genau so weit an, dass der Fehler
 * derselbe bleibt wie bei der Bezugsflugzeit – und **nur** in diese Richtung:
 * Bei kurzen Flugzeiten bleibt alles, wie es war.
 */
export function compensatedLeadFactor(leadFactor: number, travelTime: number): number {
  if (!Number.isFinite(travelTime) || travelTime <= 0) return leadFactor;
  const share = Math.min(1, BOT_LEAD_REFERENCE_FLIGHT / travelTime);
  return 1 - (1 - leadFactor) * share;
}

/**
 * Prozessweiter Schalter.
 *
 * Anders als die übrigen Features ist das hier **keine** Schicht um `MazeGame`:
 * Das Tempo entsteht in `tunedStatsFor`, einer reinen Funktion, die von `fire`,
 * der Bot-Zielrechnung, den Debug-Werkzeugen und dem Balance-Report aus
 * aufgerufen wird – teils ohne Bezug auf ein Spiel. Ein Monkey-Patch an einer
 * dieser Stellen würde die anderen still auseinanderlaufen lassen: Der Bot
 * hielte auf ein Tempo vor, mit dem seine Kugel gar nicht fliegt.
 *
 * Der Preis ist ein prozessweiter Schalter statt eines Spielzustands. Ein
 * Serverprozess betreibt genau eine Arena, das ist unkritisch – **in Tests
 * dagegen darf nie ein Spiel mit Schalter und eines ohne gleichzeitig
 * lebendig gemessen werden.** `withProjectileSpeed` in den Tests erzwingt das.
 */
let enabled = false;

export const projectileSpeedEnabled = (): boolean => enabled;

/**
 * Setzt den Schalter und gibt den vorherigen Stand zurück – damit Tests ihn
 * zuverlässig wiederherstellen können.
 */
export function setProjectileSpeedEnabled(next: boolean): boolean {
  const previous = enabled;
  enabled = next;
  return previous;
}

/**
 * Hängt das neue Tempo ein. Steht der Vollständigkeit halber in der
 * Schichtkette in `index.ts`, damit die Reihenfolge dort weiter alles zeigt,
 * was das Spielgefühl verändert – die Wirkung entsteht aber über den Schalter,
 * nicht über einen Patch am Spiel.
 */
export function tuneProjectileSpeed<T extends MazeGame>(game: T, active = false): T {
  setProjectileSpeedEnabled(active);
  return game;
}

/** Tempo und Lebensdauer für `tunedStatsFor` – eine Stelle, ein Schalter. */
export function projectileFlightFor(
  base: ClassDefinition,
  level: number,
  upgrades: UpgradeLevels,
  legacySpeedValue: number,
  legacyLife: number
): { speed: number; life: number } {
  if (!enabled) return { speed: legacySpeedValue, life: legacyLife };
  const speed = projectileSpeedFor(base, level, upgrades.projectileSpeed);
  return { speed, life: projectileLifeFor(base, speed) };
}
