import { CLASS_DEFINITIONS, GAME, type PlayerClass } from './index.js';

/**
 * Der Rumpf eines Panzers – **eine Base je Familie** (finaler Klassenauftrag,
 * Abschnitt 3).
 *
 * ## Der Weg hierher
 *
 * Erst trug jede der 67 Klassen ihre eigene Sonderform – 160 Panzerplatten, 48
 * Akzente, 19 Aussparungen, 8 Kronen. Sam lehnte das ab. Dann war jede Klasse
 * derselbe Kreis; das war näher am Vorbild, aber die neun Familien wurden
 * dadurch ununterscheidbar. Der finale Auftrag legt den Mittelweg fest, und
 * zwar als Zahlen:
 *
 * > „Jede der neun Hauptfamilien besitzt eine sofort erkennbare Base. Alle
 * > Unterklassen erben die Base ihrer Familie."
 *
 * Neun Formen statt 67 oder einer. Die Stufe innerhalb einer Familie zeigt
 * nicht der Rumpf, sondern die Waffe (`weapon-shape.ts`).
 *
 * ## Warum hier ein Pfad-Parser steht
 *
 * Der Auftrag gibt die Bases als SVG-Pfade mit quadratischen Bézier-Kurven an.
 * Sie hier von Hand in Polygone zu übersetzen hieße, sie beim Abtippen zu
 * verändern – und genau das ist die Fehlerquelle, die diese Runde zum fünften
 * Mal vermeiden soll. Der Parser nimmt die Pfade **wörtlich** aus dem Auftrag
 * und rechnet sie in Polygone um; wer sie ändern will, ändert den Pfad.
 */

/**
 * Die Rollen einer Zeichenfläche. `line` ist neu: Die Familienmarkierungen aus
 * dem Auftrag (Rapid-Linien, Precision-Mittelachse, Tempest-Reaktorbögen) sind
 * offene Striche, keine gefüllten Flächen.
 */
export type DrawRole = 'hull' | 'armor' | 'accent' | 'void' | 'crown';

export type DrawOp =
  | { kind: 'poly'; points: number[]; role: DrawRole }
  | { kind: 'line'; points: number[]; role: DrawRole }
  | { kind: 'circle'; x: number; y: number; r: number; role: DrawRole }
  | { kind: 'ring'; x: number; y: number; r: number; role: DrawRole };

/** Eckpunkte eines regelmäßigen Vielecks, im Uhrzeigersinn ab `rotation`. */
export function polygonPoints(sides: number, radius: number, rotation = 0): number[] {
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index / sides) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return points;
}

/** So fein wird eine quadratische Bézier-Kurve zerlegt. */
const KURVEN_SCHRITTE = 12;

/**
 * Ein SVG-Pfad zu Punkten. Beherrscht genau die Befehle, die der Auftrag
 * benutzt: `M`, `L`, `H`, `V`, `Q`, `Z` – absolut, wie dort geschrieben.
 *
 * Bewusst kein vollständiger SVG-Parser: Was nicht im Auftrag vorkommt, soll
 * auffallen statt still ignoriert zu werden.
 */
export function pfadPunkte(pfad: string, skalaX = 1, skalaY = skalaX): number[] {
  const teile = pfad.trim().replace(/,/g, ' ').match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const punkte: number[] = [];
  let x = 0;
  let y = 0;
  let index = 0;
  const zahl = (): number => Number(teile[index++]);
  const setze = (nx: number, ny: number): void => { x = nx; y = ny; punkte.push(x * skalaX, y * skalaY); };
  while (index < teile.length) {
    const befehl = teile[index++];
    switch (befehl) {
      case 'M': case 'L': setze(zahl(), zahl()); break;
      case 'H': setze(zahl(), y); break;
      case 'V': setze(x, zahl()); break;
      case 'Q': {
        const cx = zahl();
        const cy = zahl();
        const zx = zahl();
        const zy = zahl();
        const vonX = x;
        const vonY = y;
        for (let schritt = 1; schritt <= KURVEN_SCHRITTE; schritt += 1) {
          const t = schritt / KURVEN_SCHRITTE;
          const rest = 1 - t;
          setze(
            rest * rest * vonX + 2 * rest * t * cx + t * t * zx,
            rest * rest * vonY + 2 * rest * t * cy + t * t * zy
          );
        }
        break;
      }
      case 'Z': break;
      default:
        throw new Error(`Pfadbefehl nicht unterstützt: ${String(befehl)}`);
    }
  }
  return punkte;
}

const gedreht = (punkte: number[], winkel: number): number[] => {
  const cos = Math.cos(winkel);
  const sin = Math.sin(winkel);
  const raus: number[] = [];
  for (let i = 0; i < punkte.length; i += 2) {
    raus.push(punkte[i]! * cos - punkte[i + 1]! * sin, punkte[i]! * sin + punkte[i + 1]! * cos);
  }
  return raus;
};

const kreis = (r: number, x = 0, role: DrawRole = 'hull'): DrawOp => ({ kind: 'circle', x, y: 0, r, role });
const flaeche = (pfad: string, sx: number, sy = sx): DrawOp => ({ kind: 'poly', points: pfadPunkte(pfad, sx, sy), role: 'hull' });
const strich = (pfad: string, sx: number, sy = sx): DrawOp => ({ kind: 'line', points: pfadPunkte(pfad, sx, sy), role: 'accent' });

/**
 * Die neun Familien-Bases, wörtlich aus Abschnitt 3 des Auftrags.
 *
 * Die Pfade stehen unverändert so da, wie sie dort geschrieben sind – samt
 * ihrer Skalierung. Wer eine Form ändern will, ändert den Pfad und sieht dabei,
 * dass er vom Auftrag abweicht.
 */
const BASES: Record<string, DrawOp[]> = {
  core: [kreis(GAME.playerRadius)],

  // Weiche, stromlinienförmige Base plus zwei sehr zurückhaltende Linien.
  rapid: [
    flaeche('M 23 0 Q 18 19 1 22 Q -16 21 -25 10 Q -29 0 -25 -10 Q -16 -21 1 -22 Q 18 -19 23 0 Z', 0.8),
    strich('M -10 -12 Q 0 -17 10 -11', 0.8),
    strich('M -10 12 Q 0 17 10 11', 0.8)
  ],

  // Gerichtete, flache Präzisions-Base mit dezenter Mittelachse.
  precision: [
    flaeche('M 28 0 L 9 21 L -13 17 L -25 0 L -13 -17 L 9 -21 Z', 0.82),
    strich('M -8 0 H 14', 0.82)
  ],

  /*
   * CONTROL unterscheidet sich – wie bei Diep.io – nicht durch einen
   * Raumschiff-Rumpf, sondern ausschließlich durch Zahl, Winkel und Form der
   * kurzen Spawner sowie durch die Drohnen.
   */
  control: [kreis(GAME.playerRadius)],

  // Schwere Rounded-Square-Base. Keine D-Form, kein Zahnrad, kein Keil.
  impact: [
    flaeche('M -14 -27 H 14 Q 27 -27 27 -14 V 14 Q 27 27 14 27 H -14 Q -27 27 -27 14 V -14 Q -27 -27 -14 -27 Z', 0.86)
  ],

  // Ruhige flache Linsenform ohne Einschnitt – als einzige nicht gleichmäßig
  // skaliert (0,84 quer, 1,18 hoch), daraus entsteht die gestreckte Silhouette.
  specter: [
    flaeche('M 28 0 Q 9 18 -12 16 Q -25 10 -28 0 Q -25 -10 -12 -16 Q 9 -18 28 0 Z', 0.84, 1.18)
  ],

  // Kreis plus vier dezente Reaktorbögen bei 0/90/180/270°.
  tempest: [
    kreis(GAME.playerRadius),
    ...[0, 90, 180, 270].map((grad): DrawOp => ({
      kind: 'line',
      points: gedreht(pfadPunkte('M -6 -18 Q 0 -21 6 -18'), grad * Math.PI / 180),
      role: 'accent'
    }))
  ],

  // Klare Festungs-Base.
  siege: [
    flaeche('M 16 -25 L 25 -16 V 16 L 16 25 H -16 L -25 16 V -16 L -16 -25 Z', 0.92)
  ],

  /*
   * Runder Kern plus echter vorgelagerter Schutzbogen. Der Bogen ist Teil der
   * Base, kein Kanonen-Connector – der Auftrag sagt das ausdrücklich, weil
   * genau so ein aufgeklebter Ring vor der Kanone verboten ist.
   */
  aegis: [
    kreis(19.5, -2),
    { kind: 'poly', points: pfadPunkte('M 8 -25 Q 31 0 8 25 L 2 17 Q 17 0 2 -17 Z', 0.9), role: 'armor' }
  ]
};

/**
 * Die Smasher-Sonderform: zwölf abwechselnde Radien.
 *
 * Sie bleibt die einzige Klasse mit eigenem Körper, und der Grund ist
 * mechanisch: Sie ist die einzige ohne Rohr. Ohne Sonderform wäre sie ein
 * merkmalsloser Kreis, weil ihr auch die Waffe fehlt, die sonst unterscheidet.
 */
const SMASHER: DrawOp[] = [{
  kind: 'poly',
  role: 'hull',
  points: Array.from({ length: 12 }, (_wert, i) => {
    const winkel = i * Math.PI / 6;
    const radius = i % 2 === 0 ? 25 : 19;
    return [Math.cos(winkel) * radius, Math.sin(winkel) * radius];
  }).flat()
}];

/**
 * Der Rumpf einer Klasse: die Base ihrer Familie.
 *
 * Kein Zwischenspeicher je Klasse – die Bases sind neun Listen, und eine
 * Tabelle mit 67 Zeilen, die auf neun Werte zeigt, wäre nur eine Gelegenheit,
 * sie auseinanderlaufen zu lassen.
 */
export function hullGeometry(playerClass: PlayerClass): DrawOp[] {
  if (playerClass === 'smasher') return SMASHER;
  return BASES[CLASS_DEFINITIONS[playerClass].branch] ?? BASES.core!;
}

/**
 * Wie weit die Base einer Klasse in eine Richtung reicht, in Pixeln.
 *
 * Gebraucht von `weapon-shape.ts`: Ein Rohr muss sichtbar aus dem Rumpf ragen,
 * und wie viel davon übrig bleibt, hängt davon ab, wie groß der Rumpf in genau
 * dieser Richtung ist. Ein IMPACT-Quadrat reicht in der Diagonalen weiter als
 * an der Kante.
 */
export function basisReichweite(playerClass: PlayerClass, winkel: number): number {
  const cos = Math.cos(winkel);
  const sin = Math.sin(winkel);
  let weiteste = 0;
  for (const op of hullGeometry(playerClass)) {
    if (op.kind === 'circle' || op.kind === 'ring') {
      // Mittelpunkt kann versetzt sein (AEGIS-Kern bei x = −2).
      weiteste = Math.max(weiteste, op.x * cos + op.y * sin + op.r);
      continue;
    }
    if (op.role !== 'hull' && op.role !== 'armor') continue;
    for (let i = 0; i < op.points.length; i += 2) {
      weiteste = Math.max(weiteste, op.points[i]! * cos + op.points[i + 1]! * sin);
    }
  }
  return weiteste;
}
