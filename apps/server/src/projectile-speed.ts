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
 * | **Dämpfer** (heute `0.62`) für alle Zweige | „overall zu schnell", Precision verliert die Sonderbehandlung |
 * | **Deckel**, fällt mit dem Level | „je stärker, desto langsamer" – trifft genau die Klassen, die zu schnell sind |
 * | **Boden** | keine Kugel wird langsamer, als sie ein fliehendes Ziel noch einholt |
 *
 * Dazu ein viertes Detail: Das Upgrade steigt nur noch um 2,5 % je Punkt statt
 * um 4 %, und es rechnet **nach** dem Deckel. So bleibt der Slot in jeder
 * Klasse und auf jeder Stufe gleich viel wert (+20 %) – ein Upgrade, das der
 * Deckel auffrisst, wäre ein toter Slot.
 *
 * Die Reichweite bleibt exakt konstant: `projectileLife` wird im selben Maß
 * verlängert, wie das Tempo fällt.
 *
 * **Nachtrag dritte Runde (13.08.): Genau dieser Satz war das Problem.** Die
 * Reichweite konstant zu halten hieß, sie nie zu senken – und 1271 px für eine
 * Core-Kugel sind bei 800 px halber Bildbreite zu weit. Sam hat es dreimal
 * gemeldet, und dreimal hat ein Tempo-Paket alles verändert außer der Zahl, um
 * die es ihm ging. Seit der dritten Runde skaliert `projektilReichweite` sie
 * ausdrücklich; `speed × life` ergibt weiterhin exakt diese Reichweite, nur
 * eben eine kleinere.
 */

/*
 * Zweite Runde (01, 06.08. abends): Sam hat nach dem ersten Paket erneut „die
 * Kugeln sind noch immer zu schnell" gemeldet – tatsächlich, weil der Schalter
 * aus war und diese Werte nie gegriffen haben. Beim Umstellen auf Default-an
 * habe ich zusätzlich verschärft: Dämpfer 0,70 → 0,60, Deckel 2,6/1,8 →
 * 2,0/1,35. **Das war zur Hälfte falsch, und 02 hat es nachgemessen.**
 *
 * Der Dämpfer auf 0,60 hat *keine einzige Klasse* mehr bestimmt – alle außer
 * Precision fielen auf den Boden. Statt sie zu verlangsamen, hat er acht
 * Klassen (Core, Rapid, Twin, Repeater, Storm, Gatling, Flanker, Octo) auf
 * exakt dasselbe Tempo eingeebnet, und alle sieben Precision-Klassen ebenfalls.
 * Der Tempo-Unterschied von 1,49×, mit dem ein Lancer seine lange Nachladezeit
 * bezahlt bekommt, war weg – gegen den Nordstern „jede Familie ist am
 * Spielgefühl erkennbar".
 *
 * Deshalb steht hier jetzt 02s Gegenvorschlag: **Dämpfer zurück auf 0,70, den
 * Deckel dafür auf 1,50×.** Das kostet nichts an Langsamkeit (die Rapid-Linie
 * liegt 2,6–9,7 % über dem Boden statt darauf), gibt fünfzehn statt acht
 * verschiedenen Tempi ihre Unterscheidbarkeit zurück und hält Lancer trotzdem
 * bei −55 % gegenüber dem Stand vor Paket 14.
 *
 * Offen und an 02 zurückgegeben: Ein *harter* Deckel ebnet konstruktionsbedingt
 * alles ein, was ihn erreicht. Ein weicher (`cap + (damped − cap) × 0,15`)
 * behielte die Reihenfolge. Das ist eine Mechanikänderung und gehört gemessen,
 * nicht nebenbei eingebaut.
 *
 * Der Boden bleibt unangetastet: `min(heutiges Tempo, 1,25× Spielertempo)` –
 * keine dieser Senkungen kann eine Kugel unter das heutige Tempo ihrer Klasse
 * drücken. (Auch die dritte Runde lässt ihn stehen – der Abschlag greift nach
 * ihm, siehe `PROJECTILE_SPEED_TRIM`. Gemessen holt weiterhin **jede** der 55
 * schießenden Klassen einen Fliehenden ein; bei einem Abschlag von 0,72 wären
 * es neun nicht mehr.)
 */

/*
 * Dritte Runde (13.08. abends). Sam, wörtlich: „das sag ich dir so oft aber da
 * ändert sich nie was – die BULLETS fliegen zu WEIT direkt von Anfang an, also
 * die ‚normalen', zu schnell, zu viel und zu klein, bzw. wenn man mehr levelt
 * müssen die etwas größer werden wie in Diep.io."
 *
 * **Er hat buchstäblich recht, und die Messung zeigt auch, warum.** Der
 * Reichweiten-Deckel aus Stufe 2 (1400 px) hat für die normalen Klassen
 * **nie gegriffen** – er hat nur die Präzisionslinie beschnitten:
 *
 * ```
 * Klasse     Lv     Tempo  Reichweite  in halben Bildbreiten
 * core        1       574        1271                  1,59
 * core       60       574        1271                  1,59   ← unverändert
 * twin        1       595        1233                  1,54
 * sniper      1       840        1400                  1,75   ← Deckel greift
 * ```
 *
 * Eine halbe Bildbreite sind 800 px. Eine Core-Kugel fliegt also **das
 * 1,6-fache dessen, was der Getroffene überhaupt sehen kann** – und zwar auf
 * Stufe 1 genauso wie auf Stufe 60. Der Deckel war die richtige Idee an der
 * falschen Stelle: Er schneidet oben ab, wo die Multiplikation entgleist, aber
 * er senkt nicht die Grundreichweite, über die Sam spricht.
 *
 * Ebenso der Radius: `projectileRadius` war eine reine Klassenkonstante
 * zwischen 5,5 und 11 px – gegen einen Panzerradius von 22. Die Kugel war ein
 * Viertel des Panzers und **wuchs mit keinem einzigen Level**.
 *
 * Deshalb hier drei neue Regeln, jede gegen genau einen seiner Punkte:
 *
 * | Sams Wort | Regel |
 * |---|---|
 * | „zu weit" | `PROJECTILE_RANGE_SCALE` auf die Grundreichweite, danach der weiche Deckel |
 * | „zu schnell" | `PROJECTILE_SPEED_TRIM` – Abschlag ganz am Ende, damit er nicht einebnet |
 * | „zu klein" / „größer beim Leveln" | `projectileRadiusFor` – Grundgröße hoch, plus Levelrampe |
 *
 * „Zu viel" bekommt keine eigene Regel: Wie viele Kugeln gleichzeitig in der
 * Luft sind, ist `Feuerrate × Flugzeit`. Die halbierte Reichweite halbiert die
 * Flugzeit und damit die Zahl der Kugeln im Bild – gemessen in
 * `messung-projektile.mjs`. Erst wenn das nicht reicht, ist die Feuerrate dran;
 * die ist der teurere Eingriff, weil an ihr die halbe Klassenbalance hängt.
 */

/**
 * **Abschlag ganz am Ende** – Sams „zu schnell", ohne die Klassen einzuebnen.
 *
 * Der naheliegende Weg wäre gewesen, den Dämpfer zu senken. Gemessen ist das
 * falsch, und zwar aus einem Grund, den die zweite Runde schon einmal teuer
 * gelernt hat: Ein kleinerer Dämpfer drückt immer mehr Klassen auf den
 * **Boden**, und der Boden ist für alle derselbe Wert. Bei Dämpfer 0,62 hatten
 * nur noch 42 der 55 schießenden Klassen ein eigenes Tempo statt 54 – dreizehn
 * Klassen teilten sich eines mit einer anderen.
 *
 * Der Abschlag greift **nach** Dämpfer, Deckel und Boden und trifft damit alle
 * gleich prozentual. Die Reihenfolge und die Abstände bleiben vollständig
 * erhalten, alles wird langsamer. Gemessen: Core von 574 auf 488 px/s, die
 * Ausweichzeit auf 400 px von 0,70 s auf 0,82 s – bei unveränderter
 * Unterscheidbarkeit.
 */
export const PROJECTILE_SPEED_TRIM = 0.85;

/** Dämpfer auf das Rohtempo, für alle Zweige gleich. */
export const PROJECTILE_SPEED_DAMPER = 0.7;
/** Deckel als Vielfaches des schnellsten Spielers – auf Level 1 … */
export const PROJECTILE_SPEED_CAP_HIGH = 2.0;
/** … und auf `GAME.maxLevel`. Dazwischen linear. */
export const PROJECTILE_SPEED_CAP_LOW = 1.5;
/**
 * Untergrenze als Vielfaches des schnellsten Spielers. Eine Kugel unter diesem
 * Verhältnis holt ein fliehendes Ziel praktisch nicht mehr ein.
 */
export const PROJECTILE_SPEED_FLOOR = 1.25;
/**
 * **Weichheit des Deckels.** Ein harter Deckel (`min(damped, cap)`) ebnet
 * konstruktionsbedingt alles ein, was ihn erreicht: Vor dieser Änderung feuerten
 * alle sieben Precision-Klassen exakt gleich schnell, obwohl ihr Rohtempo
 * zwischen 1100 und 1640 px/s liegt. Für Lancer war dieser Unterschied das
 * Gegengeschäft zu seiner Nachladezeit von 1,30 s.
 *
 * Stattdessen wird nur der **Überschuss** über dem Deckel gestaucht:
 * `cap + (damped − cap) × 0,06`. Die Reihenfolge bleibt, der Abstand schrumpft.
 *
 * Warum 0,06 und nicht die zuerst vorgeschlagenen 0,15 – gemessen an den beiden
 * Zielgrößen aus dem Auftrag:
 *
 * | Faktor | verschiedene Tempi | Ausweich-Index @300 (Lancer) |
 * |---|---|---|
 * | 0 (hart) | 15 | 1,26 |
 * | 0,04 | **21** | 1,12 |
 * | **0,06** | **21** | **1,06** |
 * | 0,08 | 21 | 0,99 |
 * | 0,15 | 21 | 0,79 |
 *
 * Die Ordnung ist schon ab 0,04 vollständig zurück – **alle 21 schießenden
 * Klassen haben dann wieder ihr eigenes Tempo**, mehr Weichheit kauft dafür
 * nichts. Was sie kauft, ist Tempo an der Spitze, und dort steht die Zusage aus
 * Paket 17: ausweichbar auf **jeder** Distanz, also Index ≥ 1. Zwischen 0,08 und
 * 0,10 fällt der Index unter 1. 0,06 liegt in der Mitte des Plateaus, auf dem
 * beides gilt.
 */
export const PROJECTILE_SPEED_CAP_SOFTNESS = 0.06;
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
 * **Grundreichweite mal diesem Faktor.** Sams „zu weit direkt von Anfang an".
 *
 * Der Bezugspunkt ist die halbe Bildbreite (800 px): Was weiter fliegt, trifft
 * jemanden, der den Schützen nicht sehen kann. Eine Core-Kugel lag bei 1271 px
 * – dem 1,59-fachen. Mit 0,50 sind es 636 px, also 0,79 Bildbreiten: Der
 * Schütze muss ins Bild seines Opfers, um es zu treffen.
 */
export const PROJECTILE_RANGE_SCALE = 0.5;
/**
 * Weicher Deckel auf die skalierte Reichweite, damit die Präzisionslinie ihren
 * Vorteil behält, ohne ihn ins Absurde zu treiben. Hart gedeckelt hätten alle
 * sieben Precision-Klassen exakt dieselbe Reichweite – derselbe Einebnungs-
 * fehler, den der Tempo-Deckel schon einmal gemacht hat (siehe oben).
 */
export const PROJECTILE_RANGE_SOFT_CAP = 800;
export const PROJECTILE_RANGE_SOFT_CAP_SOFTNESS = 0.11;

/**
 * Grundgröße der Kugel mal diesem Faktor – Sams „zu klein". Eine Core-Kugel
 * hatte 7 px Radius gegen 22 px Panzerradius, war also nicht einmal ein
 * Drittel so dick wie das, was sie trifft.
 */
export const PROJECTILE_RADIUS_SCALE = 1.35;
/**
 * Zuwachs des Radius von Stufe 1 bis `GAME.maxLevel` – Sams „wenn man mehr
 * levelt müssen die etwas größer werden wie in Diep.io". Vorher war der Radius
 * eine reine Klassenkonstante und auf Stufe 60 exakt so groß wie auf Stufe 1.
 */
export const PROJECTILE_RADIUS_PER_LEVEL = 0.55;

/** Alle Stellschrauben an einem Ort – damit sie sich vermessen lassen. */
export interface Projektilmass {
  daempfer: number;
  boden: number;
  deckelHoch: number;
  deckelTief: number;
  abschlag: number;
  reichweiteSkala: number;
  reichweiteDeckel: number;
  reichweiteWeichheit: number;
  radiusSkala: number;
  radiusProLevel: number;
}

export const PROJEKTIL: Projektilmass = {
  daempfer: PROJECTILE_SPEED_DAMPER,
  boden: PROJECTILE_SPEED_FLOOR,
  deckelHoch: PROJECTILE_SPEED_CAP_HIGH,
  deckelTief: PROJECTILE_SPEED_CAP_LOW,
  abschlag: PROJECTILE_SPEED_TRIM,
  reichweiteSkala: PROJECTILE_RANGE_SCALE,
  reichweiteDeckel: PROJECTILE_RANGE_SOFT_CAP,
  reichweiteWeichheit: PROJECTILE_RANGE_SOFT_CAP_SOFTNESS,
  radiusSkala: PROJECTILE_RADIUS_SCALE,
  radiusProLevel: PROJECTILE_RADIUS_PER_LEVEL
};

/**
 * Tempo des schnellsten überhaupt baubaren Spielers. Einmal aus den
 * Klassendefinitionen gerechnet statt als Zahl abgeschrieben – sonst wandert
 * der Bezugspunkt beim nächsten Balance-Eingriff still weg.
 */
/**
 * Bezugs-Ausbaustufe fuer Deckel und Boden - BEWUSST auf 8 verankert, nicht an
 * `GAME.maxUpgradeLevel` gekoppelt. Als das Cap mit Klassen 4.0 auf 10 stieg,
 * waere der Bezugspunkt still mitgewandert: Der Boden haette sechs Klassen
 * (Core, Repeater, die halbe Tempest-Linie) um bis zu 12 px/s BESCHLEUNIGT -
 * exakt gegen Sams Auftrag, und der Diversitaets-Test hat es gefangen, weil
 * alle sechs auf demselben Bodenwert landeten. Ob der Bezugspunkt dem neuen
 * Cap folgen soll, ist eine Balance-Entscheidung fuer die Messrunde (Welle C),
 * kein Nebeneffekt.
 */
const REFERENCE_UPGRADE_POINTS = 8;

export const fastestPlayerSpeed = ((): number => {
  let fastest = 0;
  for (const id of PLAYER_CLASS_IDS) {
    const base = CLASS_DEFINITIONS[id];
    for (const modifierId of PASSIVE_MODIFIER_IDS) {
      const modifier = PASSIVE_MODIFIER_DEFINITIONS[modifierId];
      fastest = Math.max(
        fastest,
        base.moveSpeed * (1 + REFERENCE_UPGRADE_POINTS * 0.03) * modifier.moveMultiplier
      );
    }
  }
  return fastest;
})();

/** Heutiges Tempo einer Klasse ohne Upgrades – der Stand vor dieser Änderung. */
const legacySpeed = (base: ClassDefinition): number =>
  base.projectileSpeed * (base.branch === 'precision' ? 0.9 : 0.75);

/** Anteil auf der Levelrampe: 0 auf Stufe 1, 1 auf `GAME.maxLevel`. */
export const levelrampe = (level: number): number =>
  (Math.max(1, Math.min(GAME.maxLevel, level)) - 1) / (GAME.maxLevel - 1);

/** Obergrenze des Grundtempos auf einer Levelstufe. */
export function projectileSpeedCapAt(level: number, mass: Projektilmass = PROJEKTIL): number {
  return fastestPlayerSpeed * (mass.deckelHoch - (mass.deckelHoch - mass.deckelTief) * levelrampe(level));
}

/**
 * Weicher Deckel: unterhalb unverändert, oberhalb wird nur der Überschuss
 * durchgelassen. Zwei verschiedene Rohwerte bleiben damit zwei verschiedene
 * Werte, statt beide auf dem Deckel zu landen.
 */
export function weichGedeckelt(wert: number, deckel: number, weichheit: number): number {
  return wert <= deckel ? wert : deckel + (wert - deckel) * weichheit;
}

/**
 * Reichweite einer Klasse: Grundreichweite mal Skala, dann weich gedeckelt.
 *
 * Das ist die Zahl, an der Sams „zu weit" hängt – nicht das Tempo. Wie schnell
 * eine Kugel fliegt, entscheidet über die Ausweichzeit; wie weit sie fliegt,
 * entscheidet, ob man von jemandem getroffen wird, den man gar nicht sieht.
 */
export function projektilReichweite(base: ClassDefinition, mass: Projektilmass = PROJEKTIL): number {
  const nominal = base.projectileSpeed * base.projectileLife;
  if (nominal <= 0) return 0;
  return weichGedeckelt(nominal * mass.reichweiteSkala, mass.reichweiteDeckel, mass.reichweiteWeichheit);
}

/**
 * Radius der Kugel auf einer Levelstufe – Sams „zu klein" und „müssen beim
 * Leveln größer werden".
 */
export function projectileRadiusFor(base: ClassDefinition, level: number, mass: Projektilmass = PROJEKTIL): number {
  if (base.projectileRadius <= 0) return 0;
  const gewachsen = base.projectileRadius * mass.radiusSkala * (1 + mass.radiusProLevel * levelrampe(level));
  // Nie dicker als der Panzer, der sie verschiesst. Fortress waere sonst auf
  // Stufe 60 bei 23 px gelandet – eine Kugel groesser als ihr eigener Lauf
  // sieht nicht nach Wucht aus, sondern nach Fehler.
  return Math.min(gewachsen, GAME.playerRadius);
}

/**
 * Grundtempo nach Dämpfer, Deckel und Boden – ohne das Upgrade.
 *
 * Der Boden ist bewusst **nie höher als das heutige Tempo der Klasse**: Diese
 * Änderung darf keine Kugel schneller machen, als sie heute ist. Impact-Klassen
 * liegen schon heute unter dem Boden; für sie ändert sich damit gar nichts.
 */
export function projectileBaseSpeed(base: ClassDefinition, level: number, mass: Projektilmass = PROJEKTIL): number {
  if (base.projectileSpeed <= 0) return 0;
  const damped = base.projectileSpeed * mass.daempfer;
  const floor = Math.min(legacySpeed(base), fastestPlayerSpeed * mass.boden);
  // Der Abschlag ganz zum Schluss: Er soll alle gleich treffen, nicht den
  // Boden verschieben – sonst ebnet er wieder ein (siehe PROJECTILE_SPEED_TRIM).
  return Math.max(softCapped(damped, projectileSpeedCapAt(level, mass)), floor) * mass.abschlag;
}

/**
 * Deckel, der die Reihenfolge behält: unterhalb unverändert, oberhalb wird nur
 * der Überschuss durchgelassen. Aus zwei Klassen mit verschiedenem Rohtempo
 * werden damit wieder zwei verschiedene Werte statt zweimal derselbe.
 */
export function softCapped(speed: number, cap: number): number {
  return weichGedeckelt(speed, cap, PROJECTILE_SPEED_CAP_SOFTNESS);
}

/** Tempo inklusive Upgrade. Das Upgrade rechnet **nach** dem Deckel. */
export function projectileSpeedFor(base: ClassDefinition, level: number, speedPoints: number, mass: Projektilmass = PROJEKTIL): number {
  const points = Math.max(0, Math.min(GAME.maxUpgradeLevel, speedPoints));
  return projectileBaseSpeed(base, level, mass) * (1 + PROJECTILE_SPEED_PER_POINT * points);
}

/**
 * Lebensdauer zum Tempo, so dass `tempo × leben` genau `projektilReichweite`
 * ergibt – auf jeder Stufe und mit jedem Upgrade.
 *
 * Vorher stand hier die *nominale* Reichweite der Klassendefinition. Genau
 * darin lag Sams Befund: Das Tempo wurde gedämpft, die Lebenszeit im selben
 * Maß verlängert, und die Reichweite blieb damit **unverändert bei 1271 px**.
 * Alle Tempo-Pakete konnten an ihr nichts ändern, weil sie sie ausdrücklich
 * konstant hielten.
 */
export function projectileLifeFor(base: ClassDefinition, speed: number, mass: Projektilmass = PROJEKTIL): number {
  if (speed <= 0) return base.projectileLife;
  return projektilReichweite(base, mass) / speed;
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
 * Wie weit eine Kugel höchstens fliegt (Sams Spieltest vom 13.08.: „die
 * Schüsse gehen noch immer zu weit").
 *
 * Vorher gab es keine Obergrenze – und deshalb konnten sich vier Faktoren
 * unbemerkt aufmultiplizieren: der Reichweiten-Slot (×1,60 bei Vollausbau),
 * der Stabilizer-Rahmen (×1,10), die Klassenwerte und die Levelskalierung.
 * Gemessen kam ein Lancer auf Level 60 mit vollem Reichweiten-Slot und
 * Stabilizer auf **7825 px** – das Sichtfenster ist 1600 px breit. Er traf
 * also aus fast fünf Bildschirmbreiten Entfernung, während sein Opfer ihn
 * nicht einmal sehen konnte.
 *
 * 1400 px sind 1,75 halbe Bildbreiten. Die Zahl ist bewusst so gewählt, dass
 * sie **oben abschneidet statt unten zu drücken**: Auf Level 20 ohne Upgrades
 * betrifft sie nur die zehn Ausreißer der Präzisionslinie, ab Level 40 mit
 * ausgebautem Reichweiten-Slot dann fast alle – genau dort, wo die
 * Multiplikation aus dem Ruder lief.
 *
 * Über `PROJECTILE_RANGE_CAP` verstellbar; `0` schaltet den Deckel ab und
 * stellt exakt den Stand davor her.
 */
export const DEFAULT_RANGE_CAP = 1200;
let rangeCap = DEFAULT_RANGE_CAP;

export const projectileRangeCap = (): number => rangeCap;

/** Setzt den Deckel und gibt den vorherigen zurück – wie beim Tempo-Schalter. */
export function setProjectileRangeCap(next: number): number {
  const previous = rangeCap;
  rangeCap = Number.isFinite(next) && next > 0 ? next : 0;
  return previous;
}

/**
 * Deckelt die Lebenszeit so, dass `tempo × leben` den Deckel nicht übersteigt.
 *
 * Gedeckelt wird die LEBENSZEIT, nicht das Tempo: Das Tempo entscheidet, wie
 * lange ein Getroffener zum Ausweichen hat, und daran soll dieser Eingriff
 * nichts ändern. Eine schnelle Kugel fliegt danach genauso schnell – nur nicht
 * mehr so lange.
 */
export function cappedLife(life: number, speed: number): number {
  if (rangeCap <= 0 || speed <= 0) return life;
  return Math.min(life, rangeCap / speed);
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
  legacyLife: number,
  mass: Projektilmass = PROJEKTIL
): { speed: number; life: number } {
  if (!enabled) return { speed: legacySpeedValue, life: legacyLife };
  const speed = projectileSpeedFor(base, level, upgrades.projectileSpeed, mass);
  return { speed, life: projectileLifeFor(base, speed, mass) };
}
