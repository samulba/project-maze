import { CLASS_DEFINITIONS, GAME, type PlayerClass } from '@project-maze/shared';

/**
 * Bild des Tanks für die Klassenwahl.
 *
 * Sams Befund vom 06.08.: „Es fehlen auch Bilder, wenn man die Tanks auswählen
 * will." Er hatte recht – die Karten trugen einen Rollennamen und vier Balken,
 * aber nichts, was den Tank zeigt. Wer auf Level 10 wählt, sieht seit jeher
 * Zahlen und keine Form.
 *
 * Gezeichnet wird aus **denselben Werten wie im Spiel** (`CLASS_DEFINITIONS`,
 * `GAME.playerRadius`), mit der Rohr-Geometrie aus `renderer.ts`. Das ist der
 * Punkt: Die Vorschau kann nicht hübscher lügen als das Original, und wenn zwei
 * Klassen hier gleich aussehen, sehen sie im Spiel auch gleich aus. Ein
 * gezeichnetes Wunschbild hätte genau das verdeckt.
 *
 * Bewusst kein Canvas und kein Pixi: Ein Inline-SVG kostet keinen zweiten
 * Renderkontext je Karte, skaliert von selbst und folgt über `currentColor` der
 * Farbe, die die Karte ohnehin trägt.
 */

/** Bildkante in SVG-Einheiten; der Tank steht mittig auf (0,0). */
const VIEW = 96;

/** Rohrhöhe nach Zweig – wie in `drawClassBarrels`. */
const barrelHeight = (branch: string): number => (branch === 'precision' ? 12 : branch === 'impact' ? 16 : 14);

/** Ein Rohr als Polygon, um `angle` gedreht. Spiegelt die Renderer-Rechnung. */
function barrelPolygon(start: number, length: number, height: number, angle: number): string {
  const corners: [number, number][] = [
    [start, -height / 2],
    [start + length, -height / 2],
    [start + length, height / 2],
    [start, height / 2]
  ];
  return corners
    .map(([x, y]) => `${(x * Math.cos(angle) - y * Math.sin(angle)).toFixed(1)},${(x * Math.sin(angle) + y * Math.cos(angle)).toFixed(1)}`)
    .join(' ');
}

/**
 * SVG-Markup für eine Klasse. Der Aufrufer setzt die Farbe über `color` am
 * Elternelement; Rumpf und Rohre nehmen sie über `currentColor` auf.
 */
export function classPreviewSvg(playerClass: PlayerClass): string {
  const definition = CLASS_DEFINITIONS[playerClass];
  const radius = GAME.playerRadius;
  const height = barrelHeight(definition.branch);
  const start = definition.branch === 'impact' ? 1 : 4;

  const barrels: string[] = [];
  if (definition.barrelCount > 0) {
    if (definition.barrelAngles) {
      for (const angle of definition.barrelAngles) {
        barrels.push(`<polygon points="${barrelPolygon(start, definition.barrelLength, height, angle)}"/>`);
      }
    } else {
      for (let index = 0; index < definition.barrelCount; index += 1) {
        // Dieselbe Verteilung wie im Renderer: der Spread verteilt die Rohre
        // symmetrisch um die Zielrichtung, ×44 ist dort der Umrechnungsfaktor.
        const offset = definition.barrelCount === 1 ? 0 : (index / (definition.barrelCount - 1) - 0.5) * definition.barrelSpread;
        const y = offset * 44;
        barrels.push(
          `<rect x="${start}" y="${(y - height / 2).toFixed(1)}" width="${definition.barrelLength}" height="${height}" rx="${definition.branch === 'precision' ? 3 : 4}"/>`
        );
      }
    }
  }

  // Drohnen umkreisen den Tank – ohne sie sähe ein Controller aus wie ein
  // wehrloser Rumpf, obwohl seine ganze Stärke außen fliegt.
  const drones: string[] = [];
  for (let index = 0; index < Math.min(definition.droneCount, 8); index += 1) {
    const angle = (index / Math.max(1, Math.min(definition.droneCount, 8))) * Math.PI * 2 - Math.PI / 2;
    const distance = radius + 15;
    drones.push(
      `<circle cx="${(Math.cos(angle) * distance).toFixed(1)}" cy="${(Math.sin(angle) * distance).toFixed(1)}" r="4.5" class="class-preview-drone"/>`
    );
  }

  // Die Zielrichtung zeigt nach rechts; das Bild wird leicht gedreht, damit die
  // Rohre nicht exakt waagerecht stehen und die Form besser lesbar ist.
  return [
    `<svg viewBox="${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}" aria-hidden="true" focusable="false">`,
    `<g transform="rotate(-30)">`,
    `<g class="class-preview-barrels">${barrels.join('')}</g>`,
    `<circle cx="0" cy="0" r="${radius}" class="class-preview-hull"/>`,
    drones.join(''),
    `</g></svg>`
  ].join('');
}
