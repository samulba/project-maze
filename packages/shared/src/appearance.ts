import { GAME, type PlayerClass } from './index.js';

/**
 * Der Rumpf eines Panzers – **ein Kreis, für jede Klasse derselbe.**
 *
 * Sam, 16.08., mit dem Diep.io-Klassenbaum als Beleg: „mach die Rümpfe auch,
 * alle als Kreis wie bei Diep."
 *
 * ## Warum das eine Vereinfachung ist und keine Verarmung
 *
 * Hier standen 67 einzeln gezeichnete Silhouetten: Sechsecke, gestreckte
 * Rümpfe, Rauten, Frontrammen, Stützfüße, Schildbögen, Reaktorkerne, Kronen,
 * Höfe – zusammen 160 Panzerplatten, 48 Akzente, 19 Aussparungen und 8 Kronen.
 * Der Aufwand war echt. Das Ergebnis war es nicht: Sam hat die Designs
 * dreimal abgelehnt.
 *
 * Der Grund steht in seinem Bild. **Diep.io zeichnet für jeden Panzer denselben
 * Kreis.** Die gesamte Unterscheidbarkeit liegt in den Rohren – Zahl, Winkel,
 * seitlicher Versatz, Länge, Trapez. Wir hatten es genau andersherum: ein
 * überladener Rumpf, und dahinter 46 von 67 Klassen mit exakt einem Rohr.
 *
 * Seit dem Rohr-Vokabular (`barrels.ts`, 16.08.) tragen **66 von 67 Klassen
 * eine eigene Rohr-Silhouette**. Damit ist die Abwechslung dort, wo sie
 * hingehört, und der Rumpf darf das sein, was er im Vorbild ist: eine ruhige
 * Fläche, gegen die sich die Rohre abheben.
 *
 * ## Die einzige Ausnahme
 *
 * Die Smasher-Linie. In Diep.io ist sie die eine Familie ohne Rohr – und
 * deshalb die einzige, die ihre Identität über den Körper trägt: ein
 * stacheliges Vieleck. Bei uns ist das genau eine Klasse (`smasher`, die
 * einzige IMPACT-Klasse mit `barrelCount: 0`). Ohne diese Ausnahme wäre sie ein
 * vollkommen merkmalsloser Kreis, weil sie auch kein Rohr hat, das sie
 * unterscheiden könnte.
 *
 * ## Warum der Radius jetzt `GAME.playerRadius` ist
 *
 * Er war je Klasse zwischen 20 und 24 px gewählt, während die Trefferabfrage
 * seit jeher mit `GAME.playerRadius` (22) rechnet. Ein Rammer wurde also mit
 * 24 px gezeichnet und mit 22 px getroffen. Gezeichneter und wirksamer Körper
 * sind ab jetzt dieselbe Zahl.
 */

/**
 * Die Rollen, die eine Zeichenfläche annehmen kann. `armor`, `accent`, `void`
 * und `crown` stammen aus den alten Silhouetten und werden von keiner Klasse
 * mehr belegt – der Renderer beherrscht sie weiterhin, damit eine spätere
 * Sonderform (wie `smasher`) sie ohne Umbau nutzen kann.
 */
export type DrawRole = 'hull' | 'armor' | 'accent' | 'void' | 'crown';

export type DrawOp =
  | { kind: 'poly'; points: number[]; role: DrawRole }
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

/** Stacheln auf den Ecken eines Vielecks – nur für die Smasher-Linie. */
function spikes(count: number, rInner: number, length: number, rotation = 0): DrawOp[] {
  const ops: DrawOp[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = rotation + (index / count) * Math.PI * 2;
    const halbeBreite = (Math.PI / count) * 0.55;
    const spitze = { x: Math.cos(angle) * (rInner + length), y: Math.sin(angle) * (rInner + length) };
    const links = { x: Math.cos(angle - halbeBreite) * rInner, y: Math.sin(angle - halbeBreite) * rInner };
    const rechts = { x: Math.cos(angle + halbeBreite) * rInner, y: Math.sin(angle + halbeBreite) * rInner };
    ops.push({ kind: 'poly', points: [links.x, links.y, spitze.x, spitze.y, rechts.x, rechts.y], role: 'armor' });
  }
  return ops;
}

/** Der Rumpf jeder normalen Klasse: ein Kreis in Trefferradiusgröße. */
const KREIS: DrawOp[] = [{ kind: 'circle', x: 0, y: 0, r: GAME.playerRadius, role: 'hull' }];

/**
 * Die Smasher-Linie – die einzige Klasse ohne Rohr und damit die einzige, die
 * ihre Identität aus dem Körper zieht. Sechseck mit Stacheln, wie im Vorbild.
 */
const SMASHER: DrawOp[] = [
  ...spikes(6, GAME.playerRadius, 7, Math.PI / 6),
  { kind: 'poly', points: polygonPoints(6, GAME.playerRadius, Math.PI / 6), role: 'hull' }
];

/**
 * Der Rumpf einer Klasse.
 *
 * Bewusst eine Funktion mit zwei Fällen statt einer Tabelle mit 67 Zeilen: Eine
 * Tabelle, in der 66 Zeilen wörtlich dasselbe sagen, lädt dazu ein, sie wieder
 * auseinanderlaufen zu lassen. Wer eine zweite Sonderform braucht, schreibt sie
 * hier hin – und sieht dabei, dass sie eine Ausnahme ist.
 */
export const hullGeometry = (playerClass: PlayerClass): DrawOp[] =>
  (playerClass === 'smasher' ? SMASHER : KREIS);
