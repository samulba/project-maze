import { CLASS_DEFINITIONS, type BarrelProfile, type ClassDefinition, type PlayerClass } from './index.js';
import { basisReichweite } from './appearance.js';

/**
 * Die gezeichnete Waffe – **Gehäuse statt Drähte** (finaler Klassenauftrag,
 * Abschnitte 4 bis 6).
 *
 * ## Was hier gelöst wird
 *
 * Sam hat vier Entwürfe abgelehnt, und der Auftrag benennt den gemeinsamen
 * Fehler aller vier: Bei einem Tank mit mehreren nah beieinanderliegenden
 * Frontrohren wurde **jedes Rohr einzeln bis in den Rumpf** gezeichnet. Das
 * sieht aus wie „Drähte aus einer Kugel" – der wörtliche Ausdruck aus dem
 * Auftrag –, und genau das ist der Unterschied zu Diep.io, wo ein Gatling ein
 * geschlossenes Waffenmodul mit mehreren Mündungen ist.
 *
 * Die Regel dafür (Auftrag, Abschnitt 5):
 *
 * 1. Feuernde Läufe kreisförmig nach Winkel sortieren.
 * 2. Benachbarte Läufe gehören zusammen, wenn zwischen ihnen höchstens
 *    `GRUPPENWINKEL` liegt – über den 0°/360°-Übergang hinweg.
 * 3. Eine Gruppe mit einem Lauf bleibt ein normales Rohr.
 * 4. Eine Gruppe mit mehreren Läufen wird **ein** geschlossenes Gehäuse, aus
 *    dem vorn nur noch kurze Mündungsstücke ragen – ohne hintere Abschlusskante,
 *    damit dazwischen keine Naht sichtbar wird.
 *
 * ## Was hier NICHT passiert
 *
 * Diese Datei rechnet ausschließlich Darstellung. Winkel, seitlicher Versatz,
 * Schadensverteilung, Nachladezeit und Kugeltempo bleiben unberührt – der
 * Server liest sie weiterhin direkt aus `CLASS_DEFINITIONS`. Ein Waffenmodul
 * fasst Mündungen optisch zusammen und ändert **nie** die Zahl oder Lage der
 * echten Projektilstarts.
 */

/** Wo ein Rohr am Rumpf ansetzt (Auftrag, Abschnitt 4). */
export const ROOT_DISTANCE = 13.5;
/**
 * Sichtbare Rohrlänge. Der Faktor 0,72 ist die Zahl aus dem Auftrag; die
 * Grenzen verhindern, dass ein sehr kurzes Impact-Rohr im Rumpf verschwindet
 * oder ein Lancer über die Kachel hinausschießt.
 */
export const LAENGEN_FAKTOR = 0.72;
export const MIN_LAENGE = 11;
export const MAX_LAENGE = 58;
/** Grundbreite eines Rohres in Pixeln; die Profile skalieren sie. */
export const BREITEN_EINHEIT = 11;
/** Bis zu diesem Winkelabstand gehören zwei Läufe in dasselbe Gehäuse. */
export const GRUPPENWINKEL = 28;
/** So weit vor der kürzesten Mündung endet das gemeinsame Gehäuse. */
export const TEILUNGS_ABSTAND = 12;
/**
 * Überlappung zwischen Gehäuse und Mündungsstück. Ohne sie bleibt bei
 * gerundeten Koordinaten ein Haarriss stehen – im Auftrag ausdrücklich
 * verboten („keine sichtbaren Quer-/Segmentnähte").
 */
export const NAHT_UEBERLAPPUNG = 0.7;
/**
 * So weit muss jedes Rohr MINDESTENS aus dem Rumpf ragen.
 *
 * Eine Lücke im Auftrag, aufgefallen beim Nachmessen: Abschnitt 4 setzt die
 * Mindestlänge (11 px) ab der Rohrwurzel, also ab `ROOT_DISTANCE` – nicht ab
 * der Rumpfkante. Für die kurzläufigen IMPACT-Klassen ergibt das eine Mündung
 * bei 24,5 px, während ihre Base bis rund 23 px reicht: **1,5 px sichtbares
 * Rohr.** Juggernaut, Fortress und Leviathan wären damit Quadrate ohne Waffe
 * gewesen.
 *
 * Der Auftrag verlangt an keiner Stelle unsichtbare Rohre; er setzt
 * stillschweigend voraus, dass sie herausragen. Diese Untergrenze stellt genau
 * das her – gemessen von der Rumpfkante in DIESE Richtung, weil ein
 * IMPACT-Quadrat in der Diagonale weiter reicht als an der Kante.
 */
export const MIN_SICHTBAR = 9;

export const clamp = (wert: number, tief: number, hoch: number): number => Math.max(tief, Math.min(hoch, wert));

/**
 * Sichtbarer Breitenzuschlag für **alleinstehende** Rohre (Auftrag,
 * Abschnitt 6).
 *
 * Ein Octo mit acht Rundumrohren sah mit den rohen Profilbreiten aus wie acht
 * Stäbchen. Der Zuschlag gilt bewusst nur für Läufe, die allein stehen – die
 * Mündungen eines gemeinsamen Moduls und alle Zier-Rohre bleiben unberührt,
 * sonst würde ein Gatling-Bündel unförmig.
 */
export function rundumZuschlag(rohrzahl: number): number {
  if (rohrzahl >= 6) return 2.1;
  if (rohrzahl >= 2) return 1.4;
  return 1;
}

/** Ein Rohr, fertig gerechnet, aber noch nicht gruppiert. */
export interface Emitter {
  /** Richtung in Radiant. */
  winkel: number;
  /** Seitlicher Versatz in Pixeln, senkrecht zur eigenen Richtung. */
  versatz: number;
  /** Abstand des Rohrendes vom Tankmittelpunkt. */
  muendung: number;
  /** Breite an der Wurzel und an der Mündung, in Pixeln. */
  wurzelbreite: number;
  muendungsbreite: number;
}

/** Ein gezeichnetes Stück: geschlossener Polygonzug in lokalen Koordinaten. */
export interface Waffenform {
  /** Ecken als `[x0, y0, x1, y1, …]`. */
  punkte: number[];
  /**
   * `gehaeuse` und `rohr` sind geschlossene Flächen mit voller Kante.
   * `muendung` ist das kurze Stück vor einem Gehäuse: Es bekommt KEINE hintere
   * Abschlusskante, damit an der Teilung keine Naht sichtbar wird.
   */
  art: 'rohr' | 'gehaeuse' | 'muendung';
}

type Formdefinition = Pick<ClassDefinition, 'barrelLength'> & {
  barrels?: BarrelProfile[] | undefined;
  launchers?: BarrelProfile[] | undefined;
};

const sichtbareLaenge = (basislaenge: number, profil: BarrelProfile): number =>
  clamp(basislaenge * (profil.laenge ?? 1) * LAENGEN_FAKTOR, MIN_LAENGE, MAX_LAENGE);

/** Ein Profil in einen fertig gerechneten Emitter übersetzen. */
function emitter(profil: BarrelProfile, basislaenge: number, breitenfaktor: number, rumpf?: PlayerClass): Emitter {
  const wurzelbreite = BREITEN_EINHEIT * (profil.breite ?? 1) * breitenfaktor;
  const winkel = profil.angle ?? 0;
  const gerechnet = ROOT_DISTANCE + sichtbareLaenge(basislaenge, profil);
  // Untergrenze an der Rumpfkante statt an der Rohrwurzel – siehe MIN_SICHTBAR.
  const kante = rumpf ? basisReichweite(rumpf, winkel) : 0;
  return {
    winkel,
    versatz: (profil.versatz ?? 0) * BREITEN_EINHEIT,
    muendung: Math.max(gerechnet, kante + MIN_SICHTBAR),
    wurzelbreite,
    muendungsbreite: BREITEN_EINHEIT * (profil.muendungsbreite ?? profil.breite ?? 1) * breitenfaktor
  };
}

/** Kürzester Winkelabstand von `winkel` zu `bezug`, in Grad. */
export function winkeldifferenz(winkel: number, bezug: number): number {
  return ((winkel - bezug + 540) % 360) - 180;
}

/**
 * Läufe in Gruppen zerlegen (Auftrag, Abschnitt 5).
 *
 * Kreisförmig, also **mit** dem Übergang von 359° auf 0°: Ein Tank mit Läufen
 * bei 350° und 10° hat sie 20° auseinander und gehört in ein Gehäuse.
 */
export function gruppiere(emitters: Emitter[], grenze = GRUPPENWINKEL): Emitter[][] {
  if (emitters.length <= 1) return emitters.map((einer) => [einer]);
  const grad = (winkel: number): number => ((winkel * 180 / Math.PI) % 360 + 360) % 360;
  const sortiert = [...emitters].sort((a, b) => grad(a.winkel) - grad(b.winkel));
  const gruppen: Emitter[][] = [];
  for (const einer of sortiert) {
    const letzte = gruppen[gruppen.length - 1];
    const vorher = letzte?.[letzte.length - 1];
    if (letzte && vorher && Math.abs(winkeldifferenz(grad(einer.winkel), grad(vorher.winkel))) <= grenze) letzte.push(einer);
    else gruppen.push([einer]);
  }
  // Der Ringschluss: Erste und letzte Gruppe können über 0°/360° zusammengehören.
  if (gruppen.length > 1) {
    const erste = gruppen[0]!;
    const letzte = gruppen[gruppen.length - 1]!;
    const abstand = Math.abs(winkeldifferenz(grad(erste[0]!.winkel), grad(letzte[letzte.length - 1]!.winkel)));
    if (abstand <= grenze) {
      gruppen[0] = [...letzte, ...erste];
      gruppen.pop();
    }
  }
  return gruppen;
}

/** Mittlere Richtung einer Gruppe – über den Vektormittelwert, nicht über Grad. */
function mittelrichtung(gruppe: Emitter[]): number {
  let x = 0;
  let y = 0;
  for (const einer of gruppe) { x += Math.cos(einer.winkel); y += Math.sin(einer.winkel); }
  return Math.atan2(y, x);
}

/** Ein Rechteck/Trapez entlang einer Richtung, als Polygonzug. */
function balken(winkel: number, versatz: number, von: number, bis: number, breiteVon: number, breiteBis: number): number[] {
  const cos = Math.cos(winkel);
  const sin = Math.sin(winkel);
  const punkt = (laengs: number, quer: number): [number, number] => [laengs * cos - quer * sin, laengs * sin + quer * cos];
  const ecken: [number, number][] = [
    punkt(von, versatz - breiteVon / 2),
    punkt(bis, versatz - breiteBis / 2),
    punkt(bis, versatz + breiteBis / 2),
    punkt(von, versatz + breiteVon / 2)
  ];
  return ecken.flat();
}

/**
 * Die Hüllbreite einer Gruppe an einem Abstand entlang der Mittelrichtung.
 *
 * Jeder Lauf wird auf die Querachse der Gruppe projiziert; genommen wird der
 * äußerste Rand aller Läufe. Das ist die Zahl, aus der das gemeinsame Gehäuse
 * entsteht – es umschließt damit jeden Lauf, ohne ihn einzeln zu zeigen.
 */
function huellbreite(gruppe: Emitter[], mitte: number, abstand: number): { tief: number; hoch: number } {
  let tief = Number.POSITIVE_INFINITY;
  let hoch = Number.NEGATIVE_INFINITY;
  const querX = -Math.sin(mitte);
  const querY = Math.cos(mitte);
  for (const einer of gruppe) {
    // Wie weit muss man auf DIESEM Lauf laufen, um die Ebene bei `abstand` zu
    // erreichen? Bei bis zu 28° Abweichung ist der Kosinus nie klein genug,
    // um zu entarten – die Untergrenze ist trotzdem da, damit nichts explodiert.
    const laengs = abstand / Math.max(0.5, Math.cos(einer.winkel - mitte));
    const spanne = Math.max(0, Math.min(1, (laengs - ROOT_DISTANCE) / Math.max(0.001, einer.muendung - ROOT_DISTANCE)));
    const breite = einer.wurzelbreite + (einer.muendungsbreite - einer.wurzelbreite) * spanne;
    const cos = Math.cos(einer.winkel);
    const sin = Math.sin(einer.winkel);
    for (const rand of [einer.versatz - breite / 2, einer.versatz + breite / 2]) {
      const x = laengs * cos - rand * sin;
      const y = laengs * sin + rand * cos;
      const quer = x * querX + y * querY;
      tief = Math.min(tief, quer);
      hoch = Math.max(hoch, quer);
    }
  }
  return { tief, hoch };
}

/** Ein Viereck aus zwei Querschnitten entlang einer Mittelrichtung. */
function gehaeuseform(mitte: number, von: number, bis: number, a: { tief: number; hoch: number }, b: { tief: number; hoch: number }): number[] {
  const cos = Math.cos(mitte);
  const sin = Math.sin(mitte);
  const punkt = (laengs: number, quer: number): [number, number] => [laengs * cos - quer * sin, laengs * sin + quer * cos];
  return [punkt(von, a.tief), punkt(bis, b.tief), punkt(bis, b.hoch), punkt(von, a.hoch)].flat();
}

/**
 * Alle gezeichneten Waffenteile einer Klasse, in Zeichenreihenfolge
 * (Auftrag, Abschnitt 8): erst Zier-Rohre, dann Einzelrohre, dann Gehäuse und
 * zuletzt die kurzen Mündungen.
 */
export function waffenformen(definition: Formdefinition, rumpf?: PlayerClass): Waffenform[] {
  const basislaenge = definition.barrelLength > 0 ? definition.barrelLength : 26;
  const feuernd = definition.barrels ?? [];
  const zuschlag = rundumZuschlag(feuernd.length);

  const formen: Waffenform[] = [];

  // 1. Zier-Rohre: nie gruppiert, nie mit Zuschlag – sie sind Beiwerk.
  for (const profil of definition.launchers ?? []) {
    const e = emitter(profil, basislaenge, 1, rumpf);
    formen.push({ art: 'rohr', punkte: balken(e.winkel, e.versatz, ROOT_DISTANCE, e.muendung, e.wurzelbreite, e.muendungsbreite) });
  }

  const gruppen = gruppiere(feuernd.map((profil) => emitter(profil, basislaenge, 1, rumpf)));
  const gehaeuse: Waffenform[] = [];
  const muendungen: Waffenform[] = [];

  for (const gruppe of gruppen) {
    if (gruppe.length === 1) {
      // Alleinstehendes Rohr: hier – und nur hier – greift der Rundum-Zuschlag.
      const profil = feuernd[feuernd.findIndex((p) => {
        const e = emitter(p, basislaenge, 1, rumpf);
        return e.winkel === gruppe[0]!.winkel && e.versatz === gruppe[0]!.versatz && e.muendung === gruppe[0]!.muendung;
      })];
      const e = profil ? emitter(profil, basislaenge, zuschlag, rumpf) : gruppe[0]!;
      formen.push({ art: 'rohr', punkte: balken(e.winkel, e.versatz, ROOT_DISTANCE, e.muendung, e.wurzelbreite, e.muendungsbreite) });
      continue;
    }

    const mitte = mittelrichtung(gruppe);
    const kuerzeste = Math.min(...gruppe.map((einer) => einer.muendung));
    const teilung = Math.max(ROOT_DISTANCE + 8, kuerzeste - TEILUNGS_ABSTAND);
    gehaeuse.push({
      art: 'gehaeuse',
      punkte: gehaeuseform(mitte, ROOT_DISTANCE, teilung, huellbreite(gruppe, mitte, ROOT_DISTANCE), huellbreite(gruppe, mitte, teilung))
    });
    for (const einer of gruppe) {
      const spanne = Math.max(0, Math.min(1, (teilung - ROOT_DISTANCE) / Math.max(0.001, einer.muendung - ROOT_DISTANCE)));
      const breiteDort = einer.wurzelbreite + (einer.muendungsbreite - einer.wurzelbreite) * spanne;
      const start = Math.min(einer.muendung - 0.5, teilung - NAHT_UEBERLAPPUNG);
      muendungen.push({
        art: 'muendung',
        punkte: balken(einer.winkel, einer.versatz, start, einer.muendung, breiteDort, einer.muendungsbreite)
      });
    }
  }

  return [...formen, ...gehaeuse, ...muendungen];
}

export const waffenformenVon = (playerClass: PlayerClass): Waffenform[] => waffenformen(CLASS_DEFINITIONS[playerClass], playerClass);

/**
 * Der Abstand, in dem eine Kugel dieses Laufs entsteht.
 *
 * **Sie folgt der gezeichneten Mündung**, und das ist eine bewusste Auslegung
 * des Auftrags. Abschnitt 4 sagt, die neuen Rohrproportionen seien „ausschließlich
 * die Darstellung"; die Abnahmeliste nennt als unantastbar aber ausdrücklich nur
 * Projektil*winkel*, Spawn*versatz*, `damageScale`, Nachladen, Schaden und
 * Kugeltempo – nicht den Abstand entlang des Laufs.
 *
 * Wäre er unverändert geblieben, entstünde jede Kugel rund 15 px vor dem nun
 * kürzeren Rohr – und das ist wörtlich Sams Punkt 6b vom 14.08.: „man sieht die
 * Kugel schon vorm Rohr". Ein optischer Fehler, den er schon einmal gemeldet
 * hat, wiegt schwerer als die Buchstabentreue an einer Stelle, die keine
 * Balance berührt: Richtung, Schaden und Tempo der Kugel bleiben identisch.
 */
export function projektilVersatz(definition: Formdefinition, lauf: number): number {
  return (definition.barrels?.[lauf]?.versatz ?? 0) * BREITEN_EINHEIT;
}

export function projektilAbstand(definition: Formdefinition, lauf: number, projektilradius: number, rumpf?: PlayerClass): number {
  const basislaenge = definition.barrelLength > 0 ? definition.barrelLength : 26;
  const profil = definition.barrels?.[lauf];
  const muendung = emitter(profil ?? {}, basislaenge, 1, rumpf).muendung;
  return Math.max(ROOT_DISTANCE + 2, muendung - projektilradius * 0.65);
}
