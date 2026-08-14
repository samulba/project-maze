import { CLASS_DEFINITIONS, GAME, type PlayerClass } from '@project-maze/shared';
import { hullGeometry, type DrawOp } from '@project-maze/shared/appearance';
import { laeufeVon, type Lauf } from '@project-maze/shared/barrels';
import { barrelHeightFor } from './barrel-geometry';

/**
 * Bild des Tanks für Wahlkarten, Rad und Death-Screen.
 *
 * Seit Welle B zeichnet die Vorschau aus DERSELBEN Geometrie wie der Renderer
 * (`@project-maze/shared/appearance`) – vorher war jeder Rumpf hier ein Kreis,
 * und die Vorschau zeigte die Klassen ähnlicher, als sie sind. Die Rohre
 * kommen weiterhin aus `CLASS_DEFINITIONS`, mit der Geometrie aus dem Spiel.
 *
 * Bewusst kein Canvas und kein Pixi: Ein Inline-SVG kostet keinen zweiten
 * Renderkontext je Karte, skaliert von selbst und folgt über `currentColor`
 * der Farbe, die die Karte ohnehin trägt.
 */

const VIEW = 96;

function barrelPolygon(lauf: Lauf, height: number): string {
  const corners: [number, number][] = [
    [lauf.start, -height / 2],
    [lauf.muendung, -height / 2],
    [lauf.muendung, height / 2],
    [lauf.start, height / 2]
  ];
  return corners
    .map(([x, y]) => `${(x * Math.cos(lauf.winkel) - y * Math.sin(lauf.winkel)).toFixed(1)},${(x * Math.sin(lauf.winkel) + y * Math.cos(lauf.winkel)).toFixed(1)}`)
    .join(' ');
}

const points = (values: number[]): string => {
  const parts: string[] = [];
  for (let index = 0; index < values.length; index += 2) parts.push(`${values[index]!.toFixed(1)},${values[index + 1]!.toFixed(1)}`);
  return parts.join(' ');
};

/** Ein Zeichenbefehl als SVG-Element – die Rollen sind in CSS gestylt. */
function opMarkup(op: DrawOp): string {
  if (op.kind === 'poly') return `<polygon points="${points(op.points)}" class="cp-${op.role}"/>`;
  if (op.kind === 'ring') return `<circle cx="${op.x}" cy="${op.y}" r="${op.r}" class="cp-ring cp-${op.role}"/>`;
  return `<circle cx="${op.x}" cy="${op.y}" r="${op.r}" class="cp-${op.role}"/>`;
}

/** Nur die Silhouette (Rumpf + Rohre), z. B. für Rad-Knoten und Blindtest. */
export function classSilhouetteMarkup(playerClass: PlayerClass): string {
  const definition = CLASS_DEFINITIONS[playerClass];
  /*
   * Rohre aus `shared/barrels.ts` und Breite aus `barrel-geometry.ts` – bis zum
   * 14.08. rechnete diese Datei beides noch einmal selbst, mit drei festen
   * Breiten für über fünfzig Klassen und mit parallelen Balken statt des
   * Winkelfächers, den der Server wirklich feuert. Die Wahlkarte zeigte damit
   * einen anderen Tank, als man danach spielte (Sams Punkt 6).
   */
  const height = barrelHeightFor(definition, playerClass);
  const barrels = laeufeVon(playerClass).map(
    (lauf) => `<polygon points="${barrelPolygon(lauf, height)}" class="cp-barrel"/>`
  );

  const drones: string[] = [];
  const droneCount = Math.min(definition.droneCount, 8);
  for (let index = 0; index < droneCount; index += 1) {
    const angle = (index / Math.max(1, droneCount)) * Math.PI * 2 - Math.PI / 2;
    const distance = GAME.playerRadius + 15;
    drones.push(
      `<circle cx="${(Math.cos(angle) * distance).toFixed(1)}" cy="${(Math.sin(angle) * distance).toFixed(1)}" r="4.5" class="cp-drone"/>`
    );
  }

  return [
    `<g class="cp-barrels">${barrels.join('')}</g>`,
    hullGeometry(playerClass).map(opMarkup).join(''),
    drones.join('')
  ].join('');
}

/** Komplettes SVG für eine Karte; Farbe kommt über `color` vom Elternelement. */
export function classPreviewSvg(playerClass: PlayerClass): string {
  return [
    `<svg viewBox="${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}" aria-hidden="true" focusable="false">`,
    `<g transform="rotate(-30)">`,
    classSilhouetteMarkup(playerClass),
    `</g></svg>`
  ].join('');
}
