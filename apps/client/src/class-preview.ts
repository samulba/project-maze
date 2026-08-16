import { CLASS_DEFINITIONS, GAME, type PlayerClass } from '@project-maze/shared';
import { hullGeometry, type DrawOp } from '@project-maze/shared/appearance';
import { waffenformenVon } from '@project-maze/shared/weapon-shape';

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

/**
 * Rand um die Silhouette, in Weltpixeln. Der Ausschnitt wird um den ECHTEN
 * Umriss gelegt (siehe `rahmen`), nicht um eine feste Zahl – seit die Rohre bis
 * zur wirklichen Mündung reichen, ist ein Tank je nach Klasse zwischen 44 und
 * 92 px lang, und ein fester Ausschnitt zeigt entweder Briefmarken oder
 * abgeschnittene Rohre.
 */
const RAND = 6;


const points = (values: number[]): string => {
  const parts: string[] = [];
  for (let index = 0; index < values.length; index += 2) parts.push(`${values[index]!.toFixed(1)},${values[index + 1]!.toFixed(1)}`);
  return parts.join(' ');
};

/** Ein Zeichenbefehl als SVG-Element – die Rollen sind in CSS gestylt. */
function opMarkup(op: DrawOp): string {
  // Offener Strich (Familienmarkierung, Auftrag Abschnitt 3): eine Polyline,
  // keine Fläche – gefüllt wäre jede davon ein Klecks.
  if (op.kind === 'line') return `<polyline points="${points(op.points)}" class="cp-linie cp-${op.role}"/>`;
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
  // Dieselben Polygone wie im Spiel (`shared/weapon-shape.ts`): Gehäuse und
  // kurze Mündungen statt einzelner Rohre. Läuft die Wahlkarte hier auseinander,
  // ist das ein Fehler und kein Stilmittel.
  const barrels = waffenformenVon(playerClass).map(
    (form) => `<polygon points="${points(form.punkte)}" class="cp-barrel cp-${form.art}"/>`
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

/**
 * Der Ausschnitt um eine Silhouette: quadratisch, um den echten Umriss zentriert.
 *
 * Vorher stand hier ein fester 96er-Ausschnitt und eine Drehung um −30°. Beides
 * war einmal richtig und ist es seit dem 14.08. nicht mehr: Die Rohre reichen
 * jetzt bis zur wirklichen Mündung (`shared/barrels.ts`), und damit ragte ein
 * Lancer aus der Kachel, während ein Smasher darin verloren ging. Die Drehung
 * kam obendrauf – ein schräg hängender Tank sieht aus, als wäre er umgefallen.
 *
 * Jetzt schaut jeder Tank nach rechts, wie in Diep.io, und der Ausschnitt folgt
 * dem, was wirklich gezeichnet wird: Rumpf UND Rohre.
 */
function rahmen(playerClass: PlayerClass): { x: number; y: number; groesse: number } {
  let links: number = -GAME.playerRadius;
  let rechts: number = GAME.playerRadius;
  let oben: number = -GAME.playerRadius;
  let unten: number = GAME.playerRadius;
  const punkt = (x: number, y: number): void => {
    links = Math.min(links, x); rechts = Math.max(rechts, x);
    oben = Math.min(oben, y); unten = Math.max(unten, y);
  };
  for (const op of hullGeometry(playerClass)) {
    if (op.kind === 'poly' || op.kind === 'line') {
      for (let index = 0; index < op.points.length; index += 2) punkt(op.points[index]!, op.points[index + 1]!);
    } else {
      punkt(op.x - op.r, op.y - op.r);
      punkt(op.x + op.r, op.y + op.r);
    }
  }
  // Auch die Drohnenpunkte: Sie liegen bei `playerRadius + 15` und ragten
  // sonst aus der Kachel heraus – bei jeder Control-Klasse (Sam, 14.08.).
  if (CLASS_DEFINITIONS[playerClass].droneCount > 0) {
    const weite = GAME.playerRadius + 15 + 4.5;
    punkt(-weite, -weite);
    punkt(weite, weite);
  }
  for (const form of waffenformenVon(playerClass)) {
    for (let index = 0; index < form.punkte.length; index += 2) punkt(form.punkte[index]!, form.punkte[index + 1]!);
  }
  // Quadratisch, damit ein langer Tank nicht breiter gezeigt wird als ein
  // runder hoch – sonst wären die Rümpfe von Kachel zu Kachel verschieden groß.
  const groesse = Math.max(rechts - links, unten - oben) + RAND * 2;
  return { x: (links + rechts) / 2 - groesse / 2, y: (oben + unten) / 2 - groesse / 2, groesse };
}

/** Komplettes SVG für eine Karte; Farbe kommt über `color` vom Elternelement. */
export function classPreviewSvg(playerClass: PlayerClass): string {
  const { x, y, groesse } = rahmen(playerClass);
  return [
    `<svg viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${groesse.toFixed(1)} ${groesse.toFixed(1)}" aria-hidden="true" focusable="false">`,
    classSilhouetteMarkup(playerClass),
    `</svg>`
  ].join('');
}
