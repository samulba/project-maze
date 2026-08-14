import { CLASS_DEFINITIONS, GAME, type ClassDefinition, type PlayerClass } from './index.js';

/**
 * Lauf-Geometrie – **eine Quelle für Server und Client** (Sams Spieltest vom
 * 14.08., Punkt 6).
 *
 * > „Diese ganzen SPAM-Tanks: da schaut es, wie es aus dem ROHR am Anfang
 * > rauskommt, komisch aus, weil man die Kugel schon vorm Rohr sieht etc.! Und
 * > das Design, wie die Rohre bei einigen Tanks sind, obwohl die anders
 * > schießen, ist komisch."
 *
 * Beides waren **auseinandergelaufene Kopien derselben Geometrie**, und zwar
 * drei Stück:
 *
 * | Stelle | Was sie rechnete |
 * |---|---|
 * | `game.ts` (`barrelOffset`, `fireBarrel`) | Winkelfächer, Mündung bei `playerRadius + barrelLength` |
 * | `renderer.ts` (`drawClassBarrels`) | **Parallele Balken, seitlich versetzt** (`y = offset * 44`), Mündung bei `4 + barrelLength` |
 * | `class-preview.ts` (`classSilhouetteMarkup`) | dasselbe noch einmal, mit eigener Rohrbreite |
 *
 * Daraus folgten genau Sams beide Beobachtungen:
 *
 * 1. **Das Rohr passt nicht zum Schuss.** Storm zeigte sechs parallele Rohre
 *    nebeneinander und feuerte einen 24°-Fächer aus der Mitte. Das Feld
 *    `barrels` (Pro-Lauf-Profile, z. B. Flanker) las die Zeichnung überhaupt
 *    nicht – der Renderer zeigte vier gleiche Rohre, wo der Server zwei nach
 *    vorn und zwei nach hinten feuert.
 * 2. **Die Kugel steht vor dem Rohr.** Gezeichnet endete das Rohr bei
 *    `4 + barrelLength` (Core: 40 px), die Kugel entstand bei
 *    `playerRadius + barrelLength` (58 px) – 18 px Luft zwischen Rohrende und
 *    Kugel, bei jeder Klasse, jeden Schuss.
 *
 * Hier steht die Geometrie einmal. Wer sie ändert, ändert Schuss und Bild
 * gemeinsam – ein Auseinanderlaufen ist danach nicht mehr möglich, ohne diese
 * Datei anzufassen.
 */

/** Ein einzelner Lauf, wie er gezeichnet wird und wie aus ihm geschossen wird. */
export interface Lauf {
  /** Winkel relativ zur Zielrichtung, in Radiant. */
  winkel: number;
  /** Abstand vom Panzermittelpunkt, an dem der Lauf beginnt. */
  start: number;
  /** Abstand vom Panzermittelpunkt, an dem er endet – hier tritt die Kugel aus. */
  muendung: number;
  /** Schadensfaktor dieses Laufs (Pro-Lauf-Profile), Standard 1. */
  schadensfaktor: number;
  /** Tempofaktor dieses Laufs, Standard 1. */
  tempofaktor: number;
}

/** Was für die MÜNDUNG nötig ist – Winkel plus Rohrlänge, weiterhin ohne `branch`. */
type Muendungsdefinition = Pick<ClassDefinition, 'barrelLength'> & Winkeldefinition;
type Laufdefinition = Pick<ClassDefinition, 'branch'> & Muendungsdefinition;

/**
 * Wo ein Lauf am Rumpf ansetzt. Impact-Klassen sitzen tiefer im Körper – das
 * ist Formsprache aus `appearance.ts` und stand bisher zweimal als nackte Zahl
 * in Renderer und Vorschau.
 */
export const laufStart = (definition: Pick<ClassDefinition, 'branch'>): number =>
  (definition.branch === 'impact' ? 1 : 4);

/**
 * **Wie viel kürzer ein Lauf am Rand des Fächers ist.**
 *
 * Sam, 14.08.: „TANK DESIGNS an sich finde ich schauen leider alle noch echt
 * kake aus." Ein Teil davon sind die Fächerklassen: Sechs gleich lange Rohre,
 * die aus einem Punkt strahlen, sehen aus wie ein Besen, nicht wie ein Panzer.
 * In Diep.io ist der Spreadshot gestaffelt – mittig lang, außen kurz –, und
 * genau das macht daraus eine Form statt eines Bündels.
 *
 * Nur für den ECHTEN Fächer aus `barrelSpread`. Klassen mit gesetzten Winkeln
 * (`barrelAngles`, `barrels` – Octo, Flanker, Heckläufe) behalten volle Länge:
 * Dort ist jede Richtung eine Entscheidung, keine Streuung.
 */
export const FAECHER_STAFFELUNG = 0.3;

export function laengenfaktor(definition: Winkeldefinition, lauf: number): number {
  if (definition.barrels || definition.barrelAngles || definition.barrelCount <= 1) return 1;
  // −1 außen links, 0 in der Mitte, +1 außen rechts.
  const lage = (lauf / (definition.barrelCount - 1)) * 2 - 1;
  return 1 - FAECHER_STAFFELUNG * Math.abs(lage);
}

/**
 * Wo der Lauf endet – **hier tritt die Kugel aus, und hier hört die Zeichnung
 * auf.**
 *
 * `playerRadius + barrelLength` ist der Punkt, an dem der Server die Kugel
 * schon immer entstehen ließ. Gezeichnet wurde bis zum 14.08. nur
 * `4 + barrelLength`, und die Differenz war exakt Sams Lücke „man sieht die
 * Kugel schon vorm Rohr". Von den beiden Zahlen ist diese die richtige: Sie
 * macht die Rohre außerdem so lang, wie sie in Diep.io sind.
 *
 * `lauf` staffelt den Fächer (siehe `laengenfaktor`). Ohne Angabe gilt der
 * längste, mittlere Lauf.
 */
export function muendungsabstand(definition: Muendungsdefinition, lauf = -1): number {
  const faktor = lauf < 0 ? 1 : laengenfaktor(definition, lauf);
  return GAME.playerRadius + definition.barrelLength * faktor;
}

/**
 * Wo der MITTELPUNKT einer Kugel entsteht.
 *
 * Nicht an der Mündung, sondern ein gutes Stück davor: Läge er auf der
 * Mündung, stünde die ganze Kugel sichtbar vor dem Rohr – das ist der zweite
 * Teil von Sams Punkt, und er ist seit dem Radius-Paket vom 13.08. deutlicher
 * geworden (`PROJECTILE_RADIUS_SCALE`, Kugeln sind seither 35 % dicker und
 * wachsen mit dem Level).
 *
 * 0,65 Radien im Rohr heißt: Beim Erscheinen schaut gut ein Drittel der Kugel
 * heraus, der Rest kommt im nächsten Bild nach. Die Untergrenze
 * `playerRadius * 0.75` fängt die kurzläufigen Impact-Klassen ab, damit keine
 * Kugel im eigenen Rumpf erscheint.
 */
export function projektilStart(definition: Muendungsdefinition, projektilradius: number, lauf = -1): number {
  return Math.max(GAME.playerRadius * 0.75, muendungsabstand(definition, lauf) - projektilradius * 0.65);
}

/**
 * Was für die WINKEL nötig ist – bewusst ohne `branch`, damit der Server, der
 * in `RuntimeStats` nur seine Laufwerte trägt, dieselbe Funktion benutzen kann.
 * Die beiden optionalen Felder tragen `| undefined` ausdrücklich: Unter
 * `exactOptionalPropertyTypes` passt `RuntimeStats` sonst nicht auf ein `Pick`
 * der Klassendefinition.
 */
interface Winkeldefinition {
  barrelCount: number;
  barrelSpread: number;
  barrelAngles?: number[] | undefined;
  barrels?: Array<{ angle: number; damageScale?: number | undefined; speedScale?: number | undefined }> | undefined;
}

/**
 * **Der Winkel jedes Laufs** – die Zahl, an der Sams „das Design passt nicht
 * zum Schuss" hängt.
 *
 * Die Rangfolge ist die des Servers, wörtlich übernommen aus dem alten
 * `barrelOffset`: `barrels` schlägt `barrelAngles`, `barrelAngles` schlägt den
 * Fächer aus `barrelSpread`. `game.ts` ruft jetzt diese Funktion auf, statt sie
 * ein zweites Mal hinzuschreiben – und der Renderer zeichnet aus demselben
 * Ergebnis.
 */
export function laufwinkel(definition: Winkeldefinition, lauf: number): number {
  if (definition.barrels) return definition.barrels[lauf]?.angle ?? 0;
  if (definition.barrelAngles) return definition.barrelAngles[lauf] ?? 0;
  if (definition.barrelCount === 1) return 0;
  return (lauf / (definition.barrelCount - 1) - 0.5) * definition.barrelSpread;
}

/**
 * Die Läufe einer Klasse – Winkel, Länge und Pro-Lauf-Faktoren, fertig zum
 * Zeichnen.
 */
export function laeufe(definition: Laufdefinition): Lauf[] {
  if (definition.barrelCount <= 0) return [];
  const start = laufStart(definition);
  return Array.from({ length: definition.barrelCount }, (_, index) => ({
    winkel: laufwinkel(definition, index),
    start,
    muendung: muendungsabstand(definition, index),
    schadensfaktor: definition.barrels?.[index]?.damageScale ?? 1,
    tempofaktor: definition.barrels?.[index]?.speedScale ?? 1
  }));
}

/** Bequemer Zugriff über die Klassen-Id – für Renderer und Vorschau. */
export const laeufeVon = (playerClass: PlayerClass): Lauf[] => laeufe(CLASS_DEFINITIONS[playerClass]);
