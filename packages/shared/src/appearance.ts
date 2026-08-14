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

  // ---- RAPID (Kreis): Stufen wachsen über Finnen und Ringsegmente --------
  rapid: [hullCircle(21), ...rearFins(21, 8, 6)],
  twin: [hullCircle(22), core(4, -14), core(4, 14)],
  repeater: [hull(polygonPoints(6, 22, Math.PI / 6)), core(5)],
  storm: [hullCircle(22), ...plates(2, 22, 27, 0.5, Math.PI / 2)],
  gatling: [hull(polygonPoints(6, 22, 0)), ...plates(2, 22, 26, 0.35, Math.PI)],
  flanker: [hullCircle(21), ...rearFins(21, 10, 8), core(4)],
  octo: [hull(polygonPoints(8, 23, Math.PI / 8)), ...spikes(8, 23, 4, Math.PI / 8)],
  vortex: [hullCircle(23), ...plates(5, 23, 28, 0.28), crown(31)],

  // ---- PRECISION (gestrecktes Sechseck): länger und schwerer je Stufe ----
  sniper: [hull(stretchedHex(24, 14))],
  railgun: [hull(stretchedHex(26, 14)), ...plates(2, 15, 19, 0.5, Math.PI / 2)],
  hunter: [hull(stretchedHex(25, 13)), ...rearFins(20, 9, 6)],
  arbalest: [hull(stretchedHex(24, 16)), voidCore(4, -8)],
  lancer: [hull(stretchedHex(29, 11)), ...plates(1, 16, 21, 0.6, Math.PI)],
  phantom: [hull(stretchedHex(25, 12)), voidCore(5, -4), orbit(20)],
  deadeye: [hull(stretchedHex(25, 14)), voidCore(4, 6), core(2, 6)],
  eclipse: [hull(stretchedHex(27, 14)), voidCore(9, -5), crown(30)],

  // ---- CONTROL (Sechseck + Orbit): der Hof wächst ------------------------
  drone: [hull(polygonPoints(6, 21, 0)), orbit(27)],
  warden: [hull(polygonPoints(6, 22, 0)), orbit(28), ...plates(3, 22, 26, 0.25)],
  factory: [hull(polygonPoints(4, 23, Math.PI / 4)), orbit(29)],
  guardian: [hull(polygonPoints(6, 22, 0)), orbit(28), ...spikes(3, 22, 4)],
  overseer: [hull(polygonPoints(6, 22, 0)), orbit(27), orbit(31)],
  carrier: [hull(polygonPoints(4, 24, Math.PI / 4)), orbit(30), ...plates(2, 24, 28, 0.4, Math.PI / 2)],
  hive: [hull(polygonPoints(6, 23, 0)), voidCore(7), orbit(29)],
  sovereign: [hull(polygonPoints(6, 23, 0)), orbit(29), ...plates(6, 23, 27, 0.18), crown(33)],

  // ---- IMPACT (Rechteck/Keil): Panzer, der Form annimmt ------------------
  rammer: [hull([24, -14, 24, 14, -20, 18, -20, -18]), ...plates(1, 24, 28, 0.55, 0)],
  crusher: [hull([22, -18, 22, 18, -20, 20, -20, -20]), ...spikes(3, 24, 6, -0.5), ...spikes(3, 24, 6, 2.64)],
  bulwark: [hull(polygonPoints(5, 24, 0)), ...plates(5, 24, 28, 0.3)],
  blitz: [hull([26, 0, 6, -16, -18, -12, -18, 12, 6, 16]), ...rearFins(18, 10, 8)],
  juggernaut: [hull([22, -20, 22, 20, -22, 22, -22, -22]), ...plates(4, 26, 31, 0.28, Math.PI / 4), voidCore(6)],
  fortress: [hull(polygonPoints(4, 26, Math.PI / 4)), ...plates(4, 26, 31, 0.4, Math.PI / 4), core(7)],
  comet: [hullCircle(19), ...rearFins(19, 13, 12), { kind: 'poly', role: 'armor', points: [23, -8, 30, 0, 23, 8] }],
  leviathan: [hull([24, -22, 24, 22, -24, 24, -24, -24]), ...plates(6, 28, 33, 0.24), crown(38)],

  // ---- SPECTER (Diamant): das Dunkel bekommt Kanten ----------------------
  specter: [hull(diamond(26, 20, 15))],
  wraith: [hull(diamond(28, 18, 13)), ...rearFins(18, 8, 7)],
  shade: [hull(diamond(24, 22, 18)), voidCore(6, -4)],
  mirage: [hull(diamond(26, 20, 14)), { kind: 'poly', role: 'accent', points: diamond(18, 13, 8) }],
  revenant: [hull(diamond(26, 22, 19)), ...spikes(2, 18, 6, Math.PI / 2), voidCore(5, -6)],
  eidolon: [hull(diamond(30, 22, 16)), voidCore(7, -3), crown(30)],

  // ---- TEMPEST (Dreieck + Reaktor): das Herz glüht sichtbar --------------
  tempest: [hull(polygonPoints(3, 24, 0)), core(7, -3)],
  scorch: [hull(polygonPoints(3, 23, 0)), core(5, -8), core(5, 2)],
  surge: [hull(polygonPoints(3, 26, 0)), ...plates(1, 20, 25, 0.5, Math.PI), core(8, -4)],
  inferno: [hull(polygonPoints(3, 24, 0)), core(4, -10), core(4, 0), core(4, 8)],
  overload: [hull(polygonPoints(3, 26, 0)), voidCore(10, -4), core(5, -4)],
  cataclysm: [hull(polygonPoints(3, 26, 0)), core(8, -4), ...spikes(3, 24, 5, Math.PI / 3), crown(32)],

  // ---- SIEGE (Kastenlafette mit Stützen): je schwerer, desto breiter ------
  // Grundform: liegendes Rechteck mit zwei Stützfüßen nach hinten - eine
  // Lafette, die sich eingräbt. Niemand sonst hat diese Kontur.
  siege: [hull([20, -15, 20, 15, -18, 15, -18, -15]), ...plates(2, 18, 24, 0.34, Math.PI / 2), core(5)],
  bombard: [hull([21, -18, 21, 18, -20, 18, -20, -18]), ...plates(2, 20, 27, 0.4, Math.PI / 2), core(5, -4)],
  mortar: [hull([18, -20, 18, 20, -22, 16, -22, -16]), ...plates(2, 21, 28, 0.34, Math.PI / 2), voidCore(7, 2)],
  howitzer: [hull([22, -19, 22, 19, -21, 19, -21, -19]), ...plates(4, 21, 27, 0.24, Math.PI / 4), core(5, -3)],
  trebuchet: [hull([18, -22, 18, 22, -24, 17, -24, -17]), ...plates(2, 23, 31, 0.3, Math.PI / 2), voidCore(9, 1), core(4, 1)],
  ragnarok: [hull([22, -21, 22, 21, -23, 21, -23, -21]), ...plates(4, 23, 30, 0.26, Math.PI / 4), core(7, -3), crown(35)],

  // ---- AEGIS (Rundschild mit Frontbogen): der Bogen wächst mit der Stufe --
  // Grundform: Kreis mit vorgelagertem Schildbogen. Die Stufen legen Ringe
  // und Streben zu, der Apex traegt Krone und doppelten Bogen.
  aegis: [hullCircle(22), { kind: 'poly', role: 'armor', points: [24, -17, 30, 0, 24, 17, 19, 11, 21, 0, 19, -11] }, core(5)],
  bulwarker: [hullCircle(23), { kind: 'poly', role: 'armor', points: [25, -20, 33, 0, 25, 20, 19, 13, 22, 0, 19, -13] }, ...plates(2, 23, 27, 0.3, Math.PI)],
  reflector: [hullCircle(22), { kind: 'poly', role: 'armor', points: [24, -18, 31, 0, 24, 18, 19, 12, 21, 0, 19, -12] }, orbit(28)],
  paladin: [hullCircle(24), { kind: 'poly', role: 'armor', points: [26, -22, 36, 0, 26, 22, 20, 14, 23, 0, 20, -14] }, ...plates(3, 24, 29, 0.26, Math.PI), core(6)],
  retributor: [hullCircle(23), { kind: 'poly', role: 'armor', points: [25, -19, 32, 0, 25, 19, 19, 12, 22, 0, 19, -12] }, orbit(29), ...spikes(3, 23, 5, Math.PI)],
  sanctum: [hullCircle(24), { kind: 'poly', role: 'armor', points: [26, -21, 35, 0, 26, 21, 20, 14, 23, 0, 20, -14] }, orbit(30), core(7), crown(35)],

  // ---- Neue Zweige in bestehenden Familien -------------------------------
  vanguard: [hullCircle(22), ...plates(3, 22, 26, 0.22, 0)],
  hailstorm: [hullCircle(23), ...spikes(7, 23, 4, Math.PI / 7), core(5)],
  ballista: [hull(stretchedHex(27, 13)), ...plates(2, 14, 18, 0.35, Math.PI / 2), voidCore(4, -6)],
  siegebreaker: [hull(stretchedHex(31, 12)), ...plates(2, 15, 20, 0.45, Math.PI / 2), core(4, 8)],
  sentinel: [hull(polygonPoints(3, 23, Math.PI)), orbit(29)],
  aviary: [hull(polygonPoints(3, 22, Math.PI)), orbit(28), orbit(33), core(6)],
  rampart: [hull([20, -21, 26, 0, 20, 21, -20, 19, -20, -19]), ...plates(2, 24, 29, 0.3, Math.PI / 2)],
  behemoth: [hull([21, -23, 28, 0, 21, 23, -22, 21, -22, -21]), ...plates(4, 26, 32, 0.26), voidCore(7)],

  // ---- Klassen 4.2, Stufe 4, Schritt 3: die fehlenden Archetypen ---------
  // Smasher (IMPACT, rohrlos): flache Front statt Spitze - eine Ramme, kein
  // Keil. Kein core()/voidCore() vorn, wo bei jeder anderen Klasse das Rohr
  // säße; die Wucht liegt sichtbar auf der Frontplatte.
  smasher: [hull([24, -16, 24, 16, -18, 20, -18, -20]), ...plates(1, 24, 30, 0.55, 0), ...rearFins(18, 10, 9)],
  // Trapper (SIEGE): dieselbe Lafette wie die Familie, aber der Hohlkern
  // sitzt HINTEN statt vorn - dort, wo die Falle den Lauf verlässt und liegen
  // bleibt, statt in Schussrichtung zu verschwinden.
  trapper: [hull([19, -17, 19, 17, -21, 17, -21, -17]), ...plates(2, 19, 25, 0.3, Math.PI / 2), voidCore(7, -13)]
};

/** Zeichenbefehle einer Klasse – Renderer und Vorschau lesen NUR hier. */
export const hullGeometry = (playerClass: PlayerClass): DrawOp[] => HULLS[playerClass];
