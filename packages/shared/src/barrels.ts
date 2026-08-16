import { CLASS_DEFINITIONS, GAME, type BarrelProfile, type ClassDefinition, type PlayerClass } from './index.js';

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
  /**
   * Seitlicher Versatz in Pixeln, senkrecht zur Richtung – **die Zahl, die bis
   * zum 16.08. fehlte.** Ohne sie strahlen mehrere Rohre zwangsläufig aus einem
   * Punkt, und ein Twin (zwei parallele Rohre nebeneinander) ist weder
   * zeichenbar noch schießbar.
   */
  versatz: number;
  /** Abstand vom Panzermittelpunkt, an dem der Lauf beginnt. */
  start: number;
  /** Abstand vom Panzermittelpunkt, an dem er endet – hier tritt die Kugel aus. */
  muendung: number;
  /** Breite an der Wurzel, in Pixeln. */
  breite: number;
  /**
   * Breite an der Mündung, in Pixeln. Größer als `breite` heißt Trapez – in
   * Diep.io die Machine Gun und jeder Drohnen-Launcher.
   */
  muendungsbreite: number;
  /** Schadensfaktor dieses Laufs (Pro-Lauf-Profile), Standard 1. */
  schadensfaktor: number;
  /** Tempofaktor dieses Laufs, Standard 1. */
  tempofaktor: number;
  /** Feuert dieses Rohr (`waffe`) oder speit es Drohnen aus (`starter`)? */
  art: 'waffe' | 'starter';
}

/** Was für die MÜNDUNG nötig ist – Winkel plus Rohrlänge, weiterhin ohne `branch`. */
type Muendungsdefinition = Pick<ClassDefinition, 'barrelLength'> & Winkeldefinition;
type Laufdefinition = Breitendefinition & Muendungsdefinition;
/** Mit Launchern – alles, was gezeichnet wird. */
type Zeichendefinition = Laufdefinition & { launchers?: BarrelProfile[] | undefined };
/**
 * Länge eines Launchers, wenn die Klasse gar keine Rohrlänge trägt. Die
 * Drohnenklassen stehen auf `barrelLength: 0`, weil sie nicht feuern – ihre
 * Launcher brauchen trotzdem ein Maß.
 */
export const STARTER_LAENGE = 24;

/**
 * Wo ein Lauf am Rumpf ansetzt. Impact-Klassen sitzen tiefer im Körper – das
 * ist Formsprache aus `appearance.ts` und stand bisher zweimal als nackte Zahl
 * in Renderer und Vorschau.
 */
export const laufStart = (definition: Pick<ClassDefinition, 'branch'>): number =>
  (definition.branch === 'impact' ? 1 : 4);

/**
 * Die GRUNDBREITE eines Rohres – aus `barrel-geometry.ts` des Clients hierher
 * gezogen (16.08.).
 *
 * Sie muss hier stehen, seit ein Lauf-Profil sie skalieren darf (`breite`,
 * `muendungsbreite`) und der Versatz in Rohrbreiten gerechnet wird: Eine
 * Breite, die nur der Client kennt, kann kein Profil verschieben.
 *
 * Die Regel selbst ist unverändert und stammt aus Sams Runden C2 und C3:
 *
 * > C2: „Bei den Tanks könnte man die Schussröhre etwas dicker machen, von Tank
 * > zu Tank unterschiedlich – außer Sniper."
 * > C3: „Bei Sniper ist ein mini dünnes Rohr, aber lang, dafür eine richtig
 * > fette Kugel – die passt da ja gar nicht durch."
 *
 * Also: Grundstufe je Familie, plus ein Zuschlag nach Rohrlänge, mindestens so
 * breit, dass die eigene Kugel hindurchpasst – und Sniper bleibt das dünnste
 * Rohr im Spiel.
 */
const FAMILIENSTUFE = (branch: ClassDefinition['branch']): number =>
  (branch === 'precision' ? 12 : branch === 'impact' ? 16 : 14);
/** Realistische Obergrenze, damit ein Ausreißer nicht komisch aussieht. */
const MAX_BREITE = 28;
type Breitendefinition = Pick<ClassDefinition, 'branch' | 'barrelLength' | 'projectileRadius'> & { id?: string };

export function grundbreite(definition: Breitendefinition): number {
  const kugel = definition.projectileRadius * 1.7;
  // Sniper bleibt das dünnste, längste Rohr im Spiel (Sam: „außer Sniper") –
  // aber breit genug für die eigene Kugel, nicht die allgemeine Regel.
  if (definition.id === 'sniper') return Math.max(14, kugel);
  const nachLaenge = FAMILIENSTUFE(definition.branch) + 2 + Math.min(6, Math.max(0, (definition.barrelLength - 20) / 50) * 6);
  return Math.min(MAX_BREITE, Math.max(nachLaenge, kugel));
}

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
  // Ein Profil sagt seine Länge selbst – dann staffelt hier nichts mehr.
  const profil = definition.barrels?.[lauf];
  if (profil) return profil.laenge ?? 1;
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
  barrels?: BarrelProfile[] | undefined;
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
 * Der seitliche Versatz eines Laufs in Pixeln – die Zahl, die den Twin erst
 * zum Twin macht. Server und Zeichnung lesen dieselbe.
 */
export function laufversatz(definition: Breitendefinition & Winkeldefinition, lauf: number): number {
  return (definition.barrels?.[lauf]?.versatz ?? 0) * grundbreite(definition);
}

/**
 * Die Läufe einer Klasse – Winkel, Länge und Pro-Lauf-Faktoren, fertig zum
 * Zeichnen.
 */
export function laeufe(definition: Laufdefinition): Lauf[] {
  if (definition.barrelCount <= 0) return [];
  const start = laufStart(definition);
  const grund = grundbreite(definition);
  return Array.from({ length: definition.barrelCount }, (_, index) => {
    const profil = definition.barrels?.[index];
    const breite = grund * (profil?.breite ?? 1);
    return {
      winkel: laufwinkel(definition, index),
      // Der Versatz steht im Profil in ROHRBREITEN und wird hier zu Pixeln:
      // So bleiben zwei Rohre auch dann bündig, wenn die Klasse dicker wird.
      versatz: (profil?.versatz ?? 0) * grund,
      start,
      muendung: muendungsabstand(definition, index),
      breite,
      muendungsbreite: grund * (profil?.muendungsbreite ?? profil?.breite ?? 1),
      schadensfaktor: profil?.damageScale ?? 1,
      tempofaktor: profil?.speedScale ?? 1,
      art: 'waffe' as const
    };
  });
}

/**
 * Die Launcher einer Klasse – gezeichnet, nie gefeuert (siehe `launchers` in
 * `ClassDefinition`).
 */
export function starter(definition: Zeichendefinition): Lauf[] {
  const profile = definition.launchers;
  if (!profile || profile.length === 0) return [];
  const grund = grundbreite(definition);
  const laenge = definition.barrelLength > 0 ? definition.barrelLength : STARTER_LAENGE;
  return profile.map((profil) => ({
    winkel: profil.angle ?? 0,
    versatz: (profil.versatz ?? 0) * grund,
    start: laufStart(definition),
    muendung: GAME.playerRadius + laenge * (profil.laenge ?? 1),
    breite: grund * (profil.breite ?? 1),
    muendungsbreite: grund * (profil.muendungsbreite ?? profil.breite ?? 1),
    schadensfaktor: 1,
    tempofaktor: 1,
    art: 'starter' as const
  }));
}

/** Alles, was am Panzer gezeichnet wird: Waffenrohre UND Launcher. */
export const gezeichneteLaeufe = (definition: Zeichendefinition): Lauf[] => [...starter(definition), ...laeufe(definition)];

/** Bequemer Zugriff über die Klassen-Id – für Renderer und Vorschau. */
export const laeufeVon = (playerClass: PlayerClass): Lauf[] => gezeichneteLaeufe(CLASS_DEFINITIONS[playerClass]);
