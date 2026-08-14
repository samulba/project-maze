import type { PlayerClass } from './index';

/**
 * Rumpf-Geometrie aller Klassen (Klassen 4.0, Welle B) – EINE Quelle.
 *
 * Vorher zeichnete `renderer.ts` die Rümpfe in einem privaten switch und die
 * Wahlkarten-Vorschau jeden Rumpf als Kreis: Die Vorschau zeigte die Klassen
 * ähnlicher, als sie sind, und der Blindtest (MASTERPLAN „Klassen-Identität")
 * war gegen zwei verschiedene Wahrheiten nicht führbar.
 *
 * Hier entsteht die Silhouette als Liste primitiver Zeichenbefehle. Renderer
 * (Pixi) und Vorschau (SVG) interpretieren DIESELBEN Befehle – wenn zwei
 * Klassen hier gleich aussehen, sehen sie überall gleich aus, und genau das
 * prüft der Blindtest.
 *
 * Formsprache (verbindlich):
 * - Jede Familie hat einen GRUNDKÖRPER: RAPID Kreis · PRECISION gestrecktes
 *   Sechseck · CONTROL Sechseck mit Orbit · IMPACT gepanzertes Rechteck/Keil ·
 *   SPECTER Diamant · TEMPEST Dreieck mit Reaktorkern · Core schlichter Kreis.
 * - Die STUFE wächst sichtbar: mehr Platten, Finnen, Zacken, größere Kerne.
 * - Der APEX trägt zusätzlich den Kronenring.
 * - Jede Klasse hat mindestens ein Merkmal, das nur sie trägt.
 */

export type DrawRole = 'hull' | 'armor' | 'accent' | 'void' | 'crown';

export type DrawOp =
  | { kind: 'poly'; points: number[]; role: DrawRole }
  | { kind: 'circle'; x: number; y: number; r: number; role: DrawRole }
  | { kind: 'ring'; x: number; y: number; r: number; role: DrawRole };

/** Regelmäßiges Polygon um (0,0); Rotation 0 = Spitze in Schussrichtung (+x). */
export function polygonPoints(sides: number, radius: number, rotation = 0): number[] {
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + (index * Math.PI * 2) / sides;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return points;
}

/** In Schussrichtung gestrecktes Sechseck – die Precision-Grundform. */
const stretchedHex = (length: number, width: number): number[] => [
  length, 0,
  length * 0.45, -width,
  -length * 0.75, -width,
  -length, 0,
  -length * 0.75, width,
  length * 0.45, width
];

/** Diamant (Rhombus), vorn länger als hinten – die Specter-Grundform. */
const diamond = (front: number, back: number, width: number): number[] => [
  front, 0, 0, -width, -back, 0, 0, width
];

/** Panzerplatten als kurze Trapeze auf dem Umfang – das Impact-/Stufen-Merkmal. */
function plates(count: number, rInner: number, rOuter: number, arc = 0.3, rotation = 0): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let index = 0; index < count; index += 1) {
    const middle = rotation + (index * Math.PI * 2) / count;
    const a = middle - arc, b = middle + arc;
    ops.push({
      kind: 'poly',
      role: 'armor',
      points: [
        Math.cos(a) * rInner, Math.sin(a) * rInner,
        Math.cos(a) * rOuter, Math.sin(a) * rOuter,
        Math.cos(b) * rOuter, Math.sin(b) * rOuter,
        Math.cos(b) * rInner, Math.sin(b) * rInner
      ]
    });
  }
  return ops;
}

/** Zacken nach außen – Igel, Brecher, Endstufen. */
function spikes(count: number, rInner: number, length: number, rotation = 0): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let index = 0; index < count; index += 1) {
    const middle = rotation + (index * Math.PI * 2) / count;
    const a = middle - 0.16, b = middle + 0.16;
    ops.push({
      kind: 'poly',
      role: 'armor',
      points: [
        Math.cos(a) * rInner, Math.sin(a) * rInner,
        Math.cos(middle) * (rInner + length), Math.sin(middle) * (rInner + length),
        Math.cos(b) * rInner, Math.sin(b) * rInner
      ]
    });
  }
  return ops;
}

/** Heckfinnen (Pfeilspitze nach hinten) – Tempo-Klassen. */
const rearFins = (r: number, spread: number, length: number): DrawOp[] => ([
  { kind: 'poly', role: 'armor', points: [-r * 0.4, -spread, -r - length, -spread * 0.55, -r * 0.75, 0] },
  { kind: 'poly', role: 'armor', points: [-r * 0.4, spread, -r - length, spread * 0.55, -r * 0.75, 0] }
]);

/**
 * Seitenpods – zwei Kammern links und rechts. Das Merkmal der Zwillingslinie:
 * Wer zwei Rohre hat, hat auch zwei Kammern.
 */
const pods = (x: number, y: number, r: number): DrawOp[] => ([
  { kind: 'circle', x, y: -y, r, role: 'armor' },
  { kind: 'circle', x, y, r, role: 'armor' }
]);

/**
 * Stützfüße nach hinten – die Lafette gräbt sich ein. Nur SIEGE trägt sie, und
 * sie sind das Erkennungsmerkmal der Familie: eine Kanone, die STEHT.
 *
 * Bis zum 14.08. war jede SIEGE-Klasse ein Kasten mit einem Punkt darin, und
 * sechs Kästen nebeneinander sind sechsmal dasselbe Bild (Sam: „schauen alle
 * noch echt kake aus").
 */
const outriggers = (x: number, y: number, laenge: number, dicke: number): DrawOp[] => ([
  { kind: 'poly', role: 'armor', points: [-x, -y, -x - laenge, -y - dicke, -x - laenge, -y + dicke, -x, -y + dicke * 0.6] },
  { kind: 'poly', role: 'armor', points: [-x, y, -x - laenge, y + dicke, -x - laenge, y - dicke, -x, y - dicke * 0.6] }
]);

/**
 * Frontplatte – die Ramme. IMPACT trägt sie, und ihre Dicke IST die Stufe.
 */
const ramPlate = (x: number, halbeHoehe: number, dicke: number): DrawOp => ({
  kind: 'poly',
  role: 'armor',
  points: [x, -halbeHoehe, x + dicke, -halbeHoehe * 0.72, x + dicke, halbeHoehe * 0.72, x, halbeHoehe]
});

/**
 * Schildbogen vor dem Rumpf – AEGIS. `weite` ist der Ausschlag nach vorn,
 * `hoehe` die halbe Spannweite; die Stufe wächst in beidem.
 */
const shieldArc = (r: number, weite: number, hoehe: number): DrawOp => ({
  kind: 'poly',
  role: 'armor',
  points: [r + 2, -hoehe, r + weite, 0, r + 2, hoehe, r - 3, hoehe * 0.6, r - 1, 0, r - 3, -hoehe * 0.6]
});

const hull = (points: number[]): DrawOp => ({ kind: 'poly', points, role: 'hull' });
const hullCircle = (r: number): DrawOp => ({ kind: 'circle', x: 0, y: 0, r, role: 'hull' });
const core = (r: number, x = 0): DrawOp => ({ kind: 'circle', x, y: 0, r, role: 'accent' });
const voidCore = (r: number, x = 0): DrawOp => ({ kind: 'circle', x, y: 0, r, role: 'void' });
const orbit = (r: number): DrawOp => ({ kind: 'ring', x: 0, y: 0, r, role: 'accent' });
const crown = (r: number): DrawOp => ({ kind: 'ring', x: 0, y: 0, r, role: 'crown' });

/**
 * Die 45 Silhouetten. Reihenfolge wie `PLAYER_CLASS_IDS`; jede Zeile nennt ihr
 * Allein­stellungs­merkmal – das ist die Checkliste für den Blindtest.
 */
const HULLS: Record<PlayerClass, DrawOp[]> = {
  // ---- CORE: der einzige völlig glatte Kreis -----------------------------
  core: [hullCircle(22), core(6)],

  // ---- RAPID (Kreis + Heckfinnen) ----------------------------------------
  // Familienmerkmal sind die FINNEN: Diese Linie lebt vom Tempo, und sie ist
  // die einzige, die nach hinten spitz zuläuft. Bis zum 14.08. trugen nur zwei
  // der zehn Klassen welche – die anderen waren nackte Kreise und dadurch
  // untereinander nicht zu unterscheiden.
  rapid: [hullCircle(21), ...rearFins(21, 9, 8)],
  twin: [hullCircle(21), ...pods(2, 15, 8), ...rearFins(21, 8, 6)],
  repeater: [hull(polygonPoints(6, 22, Math.PI / 6)), ...rearFins(20, 9, 7), core(5)],
  storm: [hullCircle(22), ...plates(2, 22, 29, 0.5, Math.PI / 2), ...rearFins(21, 9, 7)],
  gatling: [hull(polygonPoints(6, 22, 0)), ...pods(0, 17, 7), ...rearFins(21, 10, 9)],
  flanker: [hullCircle(21), ...rearFins(21, 12, 12), core(5)],
  octo: [hull(polygonPoints(8, 23, Math.PI / 8)), ...spikes(8, 23, 6, Math.PI / 8), core(6)],
  vortex: [hullCircle(23), ...plates(5, 23, 30, 0.28), ...rearFins(22, 10, 8), crown(33)],
  vanguard: [hullCircle(22), ramPlate(21, 15, 7), ...rearFins(21, 9, 7)],
  hailstorm: [hullCircle(23), ...spikes(7, 23, 6, Math.PI / 7), ...rearFins(22, 9, 7), core(5)],

  // ---- PRECISION (gestrecktes Sechseck) -----------------------------------
  // Familienmerkmal ist die LÄNGE: Der Rumpf streckt sich mit jeder Stufe
  // weiter nach vorn und wird dabei schmaler – ein Gewehr, kein Panzer.
  sniper: [hull(stretchedHex(25, 14)), voidCore(4, -8)],
  railgun: [hull(stretchedHex(28, 13)), ...plates(2, 14, 20, 0.5, Math.PI / 2), voidCore(4, -9)],
  hunter: [hull(stretchedHex(27, 13)), ...rearFins(19, 9, 8), core(4, -6)],
  arbalest: [hull(stretchedHex(26, 16)), ...pods(-6, 12, 6), voidCore(5, -9)],
  lancer: [hull(stretchedHex(32, 11)), ...plates(1, 15, 22, 0.55, Math.PI), voidCore(4, -11)],
  phantom: [hull(stretchedHex(27, 12)), voidCore(6, -5), orbit(21)],
  deadeye: [hull(stretchedHex(28, 13)), voidCore(5, 7), core(2, 7), ...rearFins(18, 8, 7)],
  ballista: [hull(stretchedHex(29, 13)), ...plates(2, 13, 19, 0.35, Math.PI / 2), voidCore(4, -8)],
  siegebreaker: [hull(stretchedHex(34, 12)), ...plates(2, 14, 21, 0.45, Math.PI / 2), core(4, 9), voidCore(4, -12)],
  eclipse: [hull(stretchedHex(30, 14)), voidCore(10, -6), crown(32)],

  // ---- CONTROL (Vieleck + Hof) --------------------------------------------
  // Familienmerkmal ist der HOF: ein Ring, in dem die Flotte steht. Die Zahl
  // der Ecken sagt, was für Drohnen es sind – sechs für Schwärme, vier für
  // Werften, drei für schwere Wächter.
  drone: [hull(polygonPoints(6, 21, 0)), orbit(28)],
  warden: [hull(polygonPoints(6, 22, 0)), orbit(29), ...plates(3, 22, 27, 0.25)],
  factory: [hull(polygonPoints(4, 23, Math.PI / 4)), orbit(30), ...pods(0, 16, 6)],
  guardian: [hull(polygonPoints(6, 22, 0)), orbit(29), ...spikes(3, 22, 6)],
  overseer: [hull(polygonPoints(6, 22, 0)), orbit(28), orbit(33), core(6)],
  carrier: [hull(polygonPoints(4, 24, Math.PI / 4)), orbit(31), ...plates(2, 24, 29, 0.4, Math.PI / 2), ...pods(0, 17, 6)],
  hive: [hull(polygonPoints(6, 23, 0)), voidCore(9), orbit(30), ...spikes(6, 23, 4)],
  // Drei schwere Wächter: Dreieck mit der Spitze NACH VORN. Bis zum 14.08.
  // zeigte es nach hinten (`polygonPoints(3, r, Math.PI)`) – ein Panzer, der
  // rückwärts fährt.
  sentinel: [hull(polygonPoints(3, 24, 0)), orbit(30), ...plates(3, 22, 27, 0.22)],
  aviary: [hull(polygonPoints(3, 23, 0)), orbit(29), orbit(34), core(6)],
  sovereign: [hull(polygonPoints(6, 23, 0)), orbit(30), ...plates(6, 23, 28, 0.18), crown(35)],

  // ---- IMPACT (Keil mit Frontplatte) --------------------------------------
  // Familienmerkmal ist die RAMME: eine sichtbare Platte an der Front, deren
  // Dicke die Stufe ist. Vorher war das ein `plates(1, …)`-Bogen, der auf einem
  // Rechteck kaum zu sehen war.
  rammer: [hull([24, -15, 24, 15, -20, 18, -20, -18]), ramPlate(24, 15, 6)],
  crusher: [hull([22, -18, 22, 18, -20, 20, -20, -20]), ramPlate(22, 18, 7), ...spikes(2, 21, 6, Math.PI / 2), ...spikes(2, 21, 6, -Math.PI / 2)],
  bulwark: [hull(polygonPoints(5, 24, 0)), ramPlate(21, 16, 8), ...plates(4, 24, 28, 0.3, Math.PI / 2)],
  blitz: [hull([27, 0, 8, -16, -18, -12, -18, 12, 8, 16]), ...rearFins(18, 11, 10), core(5, -4)],
  juggernaut: [hull([22, -20, 22, 20, -22, 22, -22, -22]), ramPlate(22, 20, 9), ...plates(3, 24, 30, 0.28, Math.PI / 2), voidCore(7)],
  fortress: [hull(polygonPoints(4, 26, Math.PI / 4)), ramPlate(23, 19, 9), ...plates(3, 26, 31, 0.36, Math.PI / 2), core(8)],
  comet: [hullCircle(19), ...rearFins(19, 14, 14), ramPlate(18, 10, 11)],
  rampart: [hull([20, -21, 26, 0, 20, 21, -20, 19, -20, -19]), ...plates(2, 24, 30, 0.3, Math.PI / 2), core(6)],
  behemoth: [hull([21, -23, 28, 0, 21, 23, -22, 21, -22, -21]), ...plates(4, 26, 33, 0.26), voidCore(8)],
  // Rohrlos: Die Wucht liegt sichtbar VORN auf der Frontplatte, und wo bei
  // jeder anderen Klasse das Rohr säße, ist bei ihm Panzer.
  smasher: [hull([24, -17, 24, 17, -18, 20, -18, -20]), ramPlate(24, 17, 11), ...rearFins(18, 11, 10)],
  leviathan: [hull([24, -22, 24, 22, -24, 24, -24, -24]), ramPlate(24, 22, 10), ...plates(5, 28, 34, 0.24), crown(40)],

  // ---- SPECTER (Diamant) ---------------------------------------------------
  // Familienmerkmal ist die KANTE: ein Rhombus, vorn länger als hinten. Die
  // Stufe schärft ihn – vorn spitzer, hinten kürzer.
  specter: [hull(diamond(27, 19, 15))],
  wraith: [hull(diamond(30, 17, 13)), ...rearFins(17, 8, 8)],
  shade: [hull(diamond(26, 21, 18)), voidCore(7, -5)],
  mirage: [hull(diamond(28, 19, 14)), { kind: 'poly', role: 'accent', points: diamond(17, 12, 8) }],
  revenant: [hull(diamond(28, 21, 19)), ...spikes(2, 17, 7, Math.PI / 2), voidCore(6, -7)],
  eidolon: [hull(diamond(33, 21, 16)), voidCore(8, -4), crown(32)],

  // ---- TEMPEST (Dreieck + Reaktor) ----------------------------------------
  // Familienmerkmal ist der REAKTOR: helle Kerne auf der Mittellinie. Ihre Zahl
  // und Größe sind die Stufe.
  tempest: [hull(polygonPoints(3, 25, 0)), core(7, -4)],
  scorch: [hull(polygonPoints(3, 24, 0)), core(5, -9), core(5, 1)],
  surge: [hull(polygonPoints(3, 27, 0)), ...plates(1, 20, 26, 0.5, Math.PI), core(9, -5)],
  inferno: [hull(polygonPoints(3, 25, 0)), core(4, -11), core(4, -1), core(4, 7)],
  overload: [hull(polygonPoints(3, 27, 0)), voidCore(11, -5), core(6, -5)],
  cataclysm: [hull(polygonPoints(3, 27, 0)), core(9, -5), ...spikes(3, 24, 6, Math.PI / 3), crown(33)],

  // ---- SIEGE (Lafette mit Stützfüßen) -------------------------------------
  // Familienmerkmal sind die STÜTZFÜSSE nach hinten: eine Kanone, die steht.
  // Die Länge der Füße und die Breite des Kastens sind die Stufe.
  // Die Füße setzen am HINTEREN Rand des Kastens an und ragen sichtbar heraus.
  // Im ersten Anlauf standen sie bei `x = 18` und damit innerhalb eines Rumpfes,
  // der bis −18 reicht – man sah einen Stummel, keine Lafette.
  siege: [hull([20, -15, 20, 15, -18, 15, -18, -15]), ...outriggers(14, 12, 13, 5), core(5)],
  bombard: [hull([21, -17, 21, 17, -20, 17, -20, -17]), ...outriggers(16, 14, 15, 6), core(6, -3)],
  mortar: [hull([18, -19, 18, 19, -20, 16, -20, -16]), ...outriggers(16, 14, 16, 6), voidCore(8, 2)],
  howitzer: [hull([22, -18, 22, 18, -21, 18, -21, -18]), ...outriggers(17, 15, 17, 7), core(6, -3)],
  trebuchet: [hull([18, -21, 18, 21, -22, 17, -22, -17]), ...outriggers(18, 16, 19, 7), voidCore(9, 1), core(4, 1)],
  // Falle statt Schuss: Der Hohlkern sitzt HINTEN, dort wo die Falle liegen
  // bleibt, statt in Schussrichtung zu verschwinden.
  trapper: [hull([19, -17, 19, 17, -21, 17, -21, -17]), ...outriggers(17, 13, 13, 5), voidCore(8, -12)],
  ragnarok: [hull([22, -20, 22, 20, -23, 20, -23, -20]), ...outriggers(19, 17, 20, 8), core(8, -3), crown(37)],

  // ---- AEGIS (Rundschild mit Frontbogen) ----------------------------------
  // Familienmerkmal ist der BOGEN vor dem Rumpf. Seine Weite ist die Stufe;
  // die Ringe dahinter zählen die Ausbaustufe mit.
  aegis: [hullCircle(22), shieldArc(22, 9, 17), core(5)],
  reflector: [hullCircle(22), shieldArc(22, 12, 19), orbit(29)],
  paladin: [hullCircle(24), shieldArc(24, 14, 23), ...plates(3, 24, 29, 0.26, Math.PI), core(6)],
  retributor: [hullCircle(23), shieldArc(23, 13, 20), orbit(30), ...spikes(3, 23, 6, Math.PI)],
  // Klassen-Id `bulwarker`, angezeigt als „Warder" – die zweite Stufe der
  // Familie: breiterer Bogen, erste Ringplatten.
  bulwarker: [hullCircle(23), shieldArc(23, 11, 20), ...plates(2, 23, 28, 0.3, Math.PI), core(5)],
  sanctum: [hullCircle(24), shieldArc(24, 16, 24), orbit(31), core(8), crown(37)]
};

/** Zeichenbefehle einer Klasse – Renderer und Vorschau lesen NUR hier. */
export const hullGeometry = (playerClass: PlayerClass): DrawOp[] => HULLS[playerClass];
