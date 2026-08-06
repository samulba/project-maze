import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import type { HullForm, HullGeometrie, HullStrich } from './class-hull';

/**
 * Die Formsprache der Klassen – **erst ein System, dann 29 Formen**.
 *
 * Sam, verbindlich im MASTERPLAN: „Mir ist extrem wichtig, dass die Tanks
 * wirklich unique Designs haben und man ALLE voneinander unterscheiden kann und
 * alle irgendwie irgendwo special sind." Der heutige Stand misst sich als
 * `umrissDubletten()`: **19 von 29 Klassen teilen sich sieben Umrisse.**
 *
 * Der Fehler wäre, jetzt 29 Formen zu erfinden. Dann hat man ein Sammelsurium,
 * das beim nächsten Klassenzuwachs auseinanderfällt. Stattdessen drei Regeln:
 *
 * 1. **Die Familie erkennt man am Grundkörper.** Vier Körper, vier Silhouetten,
 *    ohne Farbe unterscheidbar:
 *    - *Dauerfeuer* – **der Pfeil**: spitz nach vorn, hinten gekerbt.
 *    - *Präzision* – **die Spindel**: lang und schmal auf der Schussachse.
 *    - *Kontrolle* – **der Träger**: rund, mit Buchten für die Drohnen im Rand.
 *    - *Panzerung* – **der Amboss**: breite Front, nach hinten schmal.
 *    - *Core* bleibt der schlichte Kreis. Er ist das einzige Fahrzeug, das
 *      noch nichts ist, und das soll man ihm ansehen.
 * 2. **Die Stufe erkennt man daran, was dazukommt.** Ring 1 ist der nackte
 *    Grundkörper. Ring 2 legt Platten an die Flanken. Ring 3 setzt Ausleger an
 *    die Ecken und wächst noch einmal. Damit ist der Baum lesbar, bevor das Rad
 *    ihn zeigt: Ein später Tank *sieht* später aus.
 * 3. **Jede Klasse hat genau ein Merkmal, das nur sie hat** – beschreibbar
 *    ohne Zahlen. Das ist der einzige Teil, der nicht ableitbar ist, und der
 *    einzige, der pro Klasse von Hand entschieden wird.
 *
 * **Stand: acht Klassen, nicht 29.** Auftrag von 01: „Sechs Beispiele als
 * Screenshot an mich, bevor du alle 29 baust … Erst bei seinem Ja der Rest."
 * Regeln 1 und 2 gelten hier schon für alle 29 – sie sind gerechnet. Regel 3
 * steht für je eine frühe und eine späte Klasse pro Familie; die übrigen 21
 * tragen bis zur Freigabe nur Familie und Stufe. Deshalb hängt das Ganze an
 * einem Schalter, der **aus** ist.
 */

/** Ring im Baum: 0 = Core, 1 = Level 10, 2 = Level 24, 3 = Level 38. */
export function stufeVon(playerClass: PlayerClass): 0 | 1 | 2 | 3 {
  const level = CLASS_DEFINITIONS[playerClass].unlockLevel;
  if (level <= 1) return 0;
  if (level <= 10) return 1;
  if (level <= 24) return 2;
  return 3;
}

/** Ring 1 ist der Maßstab; jede Stufe wächst spürbar, aber nicht maßlos. */
const WACHSTUM: Record<0 | 1 | 2 | 3, number> = { 0: 1, 1: 1, 2: 1.08, 3: 1.16 };

const skaliert = (punkte: readonly number[], faktor: number): number[] => punkte.map((wert) => Math.round(wert * faktor * 10) / 10);
const gespiegelt = (punkte: readonly number[]): number[] => {
  // Spiegelung an der Schussachse: jede zweite Zahl ist ein y.
  const werte = [...punkte];
  for (let index = 1; index < werte.length; index += 2) werte[index] = -(werte[index] ?? 0);
  return werte;
};

/* ------------------------------------------------------------------ *
 * Regel 1: die vier Grundkörper
 * ------------------------------------------------------------------ */

/** Der Pfeil – Dauerfeuer. Spitze vorn, zurückgezogene Flanken, Kerbe hinten. */
const PFEIL = [26, 0, 2, -13, -15, -18, -7, 0, -15, 18, 2, 13];

/** Die Spindel – Präzision. Alles liegt auf der Linie, auf der geschossen wird. */
const SPINDEL = [30, 0, 13, -8, -13, -10, -21, -6, -21, 6, -13, 10, 13, 8];

/** Der Amboss – Panzerung. Breite, flache Front, nach hinten schmal. */
const AMBOSS = [23, -20, 23, 20, -5, 16, -18, 0, -5, -16];

/**
 * Der Träger – Kontrolle. Ein runder Rumpf mit Buchten im Rand.
 *
 * Gerechnet statt gezeichnet: Die Zahl der Buchten kommt aus der Drohnenzahl
 * der Klasse. Damit sieht man einem Controller an, wie viele Drohnen er führt,
 * ohne eine einzige davon im Bild zu haben – und eine neue Kontrollklasse
 * bekommt ihre Form geschenkt.
 */
function traeger(radius: number, buchten: number, tiefe: number): number[] {
  const punkte: number[] = [];
  const schritte = 72;
  for (let index = 0; index < schritte; index += 1) {
    const winkel = (index / schritte) * Math.PI * 2;
    // Abstand zur nächsten Bucht, in Vielfachen des Buchtabstands.
    const anteil = (winkel / (Math.PI * 2)) * buchten;
    const naehe = Math.abs(anteil - Math.round(anteil));
    const r = naehe < 0.16 ? radius - tiefe : radius;
    punkte.push(Math.round(Math.cos(winkel) * r * 10) / 10, Math.round(Math.sin(winkel) * r * 10) / 10);
  }
  return punkte;
}

/** Grundkörper einer Klasse, schon auf ihre Stufe skaliert. */
function grundkoerper(playerClass: PlayerClass): HullGeometrie {
  const definition = CLASS_DEFINITIONS[playerClass];
  const faktor = WACHSTUM[stufeVon(playerClass)];
  switch (definition.branch) {
    case 'rapid': return { form: 'zug', punkte: skaliert(PFEIL, faktor) };
    case 'precision': return { form: 'zug', punkte: skaliert(SPINDEL, faktor) };
    case 'impact': return { form: 'zug', punkte: skaliert(AMBOSS, faktor) };
    case 'control':
      return { form: 'zug', punkte: traeger(21 * faktor, Math.max(4, Math.min(8, definition.droneCount)), 4.5) };
    default: return { form: 'kreis', x: 0, y: 0, r: 22 };
  }
}

/* ------------------------------------------------------------------ *
 * Regel 2: was die Stufe dazulegt
 * ------------------------------------------------------------------ */

/**
 * Ein Band auf dem Rand des Trägers – Panzerung, die dem runden Rumpf folgt.
 *
 * Für Kontrolle gerechnet statt gezeichnet, damit sie zum Rumpf passt, egal wie
 * viele Buchten er hat.
 */
function bogenBand(innen: number, aussen: number, von: number, bis: number): number[] {
  const punkte: number[] = [];
  const schritte = 8;
  for (let index = 0; index <= schritte; index += 1) {
    const winkel = von + ((bis - von) * index) / schritte;
    punkte.push(Math.round(Math.cos(winkel) * aussen * 10) / 10, Math.round(Math.sin(winkel) * aussen * 10) / 10);
  }
  for (let index = schritte; index >= 0; index -= 1) {
    const winkel = von + ((bis - von) * index) / schritte;
    punkte.push(Math.round(Math.cos(winkel) * innen * 10) / 10, Math.round(Math.sin(winkel) * innen * 10) / 10);
  }
  return punkte;
}

/**
 * Flankenplatten (Ring 2 und 3) und Ausleger (nur Ring 3).
 *
 * Alle Teile **überlappen den Rumpf**. Die erste Fassung setzte dünne Dreiecke
 * daneben; im Blindtest las sich das als zufällige Stacheln und nicht als
 * Panzerung. Was angebaut ist, muss auch angebaut aussehen.
 */
function stufenZubehoer(playerClass: PlayerClass): HullGeometrie[] {
  const stufe = stufeVon(playerClass);
  if (stufe < 2) return [];
  const branch = CLASS_DEFINITIONS[playerClass].branch;
  const faktor = WACHSTUM[stufe];
  const teile: HullGeometrie[] = [];

  if (branch === 'control') {
    // Zwei Panzerbänder auf dem Rand, oben und unten, mit Lücke für die Buchten.
    for (const richtung of [-1, 1]) {
      teile.push({ form: 'zug', punkte: bogenBand(19 * faktor, 25 * faktor, richtung * 0.5, richtung * 2.1) });
    }
    if (stufe === 3) {
      for (const richtung of [-1, 1]) {
        teile.push({ form: 'zug', punkte: bogenBand(20 * faktor, 29 * faktor, richtung * 2.5, richtung * 3.0) });
      }
    }
    return teile;
  }

  // Viereckige Platten, die auf der Flanke aufliegen: zwei Punkte im Rumpf,
  // zwei außerhalb.
  const platte = branch === 'precision' ? [10, -7, -12, -9, -14, -16, 8, -13]
    : branch === 'impact' ? [21, -17, 21, -22, 4, -19, 2, -13]
      : [2, -12, -15, -17, -17, -24, 0, -19];
  teile.push({ form: 'zug', punkte: skaliert(platte, faktor) });
  teile.push({ form: 'zug', punkte: skaliert(gespiegelt(platte), faktor) });

  if (stufe === 3) {
    const ausleger = branch === 'precision' ? [-13, -9, -25, -12, -28, -6, -19, -5]
      : branch === 'impact' ? [-5, -15, -14, -25, -22, -17, -14, -8]
        : [-15, -18, -23, -19, -21, -11, -14, -9];
    teile.push({ form: 'zug', punkte: skaliert(ausleger, faktor) });
    teile.push({ form: 'zug', punkte: skaliert(gespiegelt(ausleger), faktor) });
  }
  return teile;
}

/* ------------------------------------------------------------------ *
 * Regel 3: das eine Merkmal, das nur diese Klasse hat
 * ------------------------------------------------------------------ */

/**
 * Je Familie eine frühe und eine späte Klasse – die acht, die 01 Sam vorlegt.
 *
 * Der Text daneben ist Teil der Abnahme: Wer ein Merkmal nicht in einem Satz
 * ohne Zahlen beschreiben kann, hat keins gebaut, sondern nur verziert.
 */
export const MERKMALE: Partial<Record<PlayerClass, { text: string; formen: HullGeometrie[] }>> = {
  rapid: {
    text: 'Ein durchgehender Grat vom Heck bis in die Spitze – der schlichteste Pfeil im Feld.',
    formen: [{ form: 'zug', punkte: [24, 0, -6, -4, -12, 0, -6, 4] }]
  },
  storm: {
    text: 'Zwei weit nach hinten gezogene Flügel; kein anderer Pfeil ist hinten breiter als vorn.',
    formen: [
      { form: 'zug', punkte: [-2, -14, -19, -28, -26, -19, -14, -13] },
      { form: 'zug', punkte: [-2, 14, -19, 28, -26, 19, -14, 13] }
    ]
  },
  sniper: {
    text: 'Ein einzelnes Leitblech auf dem Rücken, wie am Heck eines Pfeils.',
    formen: [{ form: 'zug', punkte: [-2, -8, -14, -21, -20, -18, -14, -7] }]
  },
  deadeye: {
    text: 'Die Spindel ist vorn gegabelt – zwei Zinken, zwischen denen das Ziel steht.',
    formen: [
      { form: 'zug', punkte: [34, -10, 20, -3, 14, -7, 24, -13] },
      { form: 'zug', punkte: [34, 10, 20, 3, 14, 7, 24, 13] }
    ]
  },
  drone: {
    text: 'Vier offene Buchten im Rand, eine je Drohne – man sieht die Flotte, auch wenn sie fliegt.',
    formen: []
  },
  hive: {
    text: 'Ein zweiter, kleinerer Träger sitzt im Träger – Waben in der Wabe.',
    formen: [{ form: 'zug', punkte: traeger(13, 6, 3) }]
  },
  rammer: {
    text: 'Eine schmale, hochkant stehende Rammplatte, die über die ganze Front reicht.',
    formen: [{ form: 'rechteck', x: 21, y: -17, breite: 7, hoehe: 34, ecke: 2 }]
  },
  fortress: {
    text: 'Vier Ecktürme auf dem Amboss – als einziger Tank hat er eine Silhouette mit Zinnen.',
    formen: [
      { form: 'rechteck', x: 12, y: -27, breite: 11, hoehe: 12, ecke: 2 },
      { form: 'rechteck', x: 12, y: 15, breite: 11, hoehe: 12, ecke: 2 },
      { form: 'rechteck', x: -12, y: -26, breite: 10, hoehe: 12, ecke: 2 },
      { form: 'rechteck', x: -12, y: 14, breite: 10, hoehe: 12, ecke: 2 }
    ]
  }
};

const UMRISS: HullStrich = { ton: 'licht', alpha: 0.38, breite: 3 };

/**
 * Der Umriss einer Klasse nach der neuen Formsprache.
 *
 * Alles hier ist **Körper**, kein Detail: Was die Silhouette ausmacht, muss
 * auch als Fleck ohne Farbe tragen. Innenzeichnung kommt erst, wenn die Formen
 * stehen – sonst rettet man eine schwache Silhouette mit Verzierung.
 */
export function silhouette(playerClass: PlayerClass): HullForm[] {
  const teile: HullGeometrie[] = [
    grundkoerper(playerClass),
    ...stufenZubehoer(playerClass),
    ...(MERKMALE[playerClass]?.formen ?? [])
  ];
  return teile.map((teil) => ({ ...teil, ebene: 'koerper', fuellung: { ton: 'klasse' }, strich: UMRISS }));
}

/** Die acht Klassen, die schon ihr eigenes Merkmal tragen. */
export const BEISPIELE = Object.keys(MERKMALE) as PlayerClass[];
