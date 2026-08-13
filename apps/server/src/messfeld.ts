import { GAME, type Vector2 } from '@project-maze/shared';
import { nearbyWalls } from './world.js';

/**
 * Sucht ein freies Messfeld auf der aktuellen Karte.
 *
 * ## Wozu
 *
 * Tests und Messskripte brauchen einen Fleck Weltkarte, auf dem sie ungestört
 * rechnen können – ein Träger hier, ein Gegner 400 px daneben, eine Flugbahn
 * nach rechts. Bisher standen dafür überall feste Zahlen wie `{ 2800, 2200 }`,
 * geerbt von einer Karte, die es so nicht mehr gibt.
 *
 * Beim Labyrinth-Umbau (Stufe 3) sind daran auf einen Schlag vier Testdateien
 * zerbrochen, und zwar mit Meldungen wie „erwartet 0, war 40,6" – also so, als
 * wäre ein Perk kaputt, obwohl nur eine Wand im Weg stand. Das ist die
 * teuerste Sorte Fehlschlag: Sie zeigt auf die falsche Stelle.
 *
 * Ein Messpunkt ist keine Konstante, sondern eine Eigenschaft der Karte. Also
 * wird er gesucht statt geschrieben.
 *
 * ## Was zugesichert wird
 *
 * Das ganze Rechteck `mitte ± (halbeBreite, halbeHoehe)` ist frei von Wänden
 * und liegt in der Welt – nicht nur der Mittelpunkt. Wer 400 px nach rechts
 * schießen will, fordert `messfeld(400, …)` und bekommt eine Bahn, die auch
 * wirklich frei ist.
 *
 * Die Suche ist deterministisch: gleiche Karte und gleiche Argumente ergeben
 * denselben Punkt, und von allen passenden gewinnt der kartenmittigste. Zwei
 * garantiert getrennte Felder holt man sich über `fernVon`.
 */

export interface Messfeldwunsch {
  /** Mindestabstand zu diesem Punkt – für ein zweites, unabhängiges Feld. */
  fernVon?: Vector2;
  mindestabstand?: number;
  /** Nur links dieser Grenze suchen – für Tests, die den Weltrand brauchen. */
  hoechstensX?: number;
}

/** Freier Platz um den Messpunkt herum, je Richtung einzeln. */
export interface Rahmen {
  links: number;
  rechts: number;
  oben: number;
  unten: number;
}

/** Rasterweite der Suche. Feiner als eine Panzerbreite, gröber als nötig. */
const SCHRITT = 20;

/** Liegt der Rahmen um den Punkt vollständig in der Welt und außerhalb jeder Wand? */
export function rahmenFrei(punkt: Vector2, rahmen: Rahmen): boolean {
  const links = punkt.x - rahmen.links;
  const rechts = punkt.x + rahmen.rechts;
  const oben = punkt.y - rahmen.oben;
  const unten = punkt.y + rahmen.unten;
  if (links < 0 || oben < 0 || rechts > GAME.worldWidth || unten > GAME.worldHeight) return false;
  const umkreis = Math.max(rahmen.links, rahmen.rechts, rahmen.oben, rahmen.unten) + 8;
  return !nearbyWalls(punkt, umkreis).some(
    (wand) => wand.x < rechts && wand.x + wand.width > links && wand.y < unten && wand.y + wand.height > oben
  );
}

/** Ein Punkt, um den herum der geforderte Rahmen frei ist. Wirft, wenn es keinen gibt. */
export function messpunkt(rahmen: Rahmen, wunsch: Messfeldwunsch = {}): Vector2 {
  const mindestabstand = wunsch.mindestabstand ?? 0;
  const kartenmitte = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
  let bester: Vector2 | undefined;
  let besteEntfernung = Infinity;
  // Bei 0 beginnen, nicht bei einem halben Schritt: Die Mitten der offenen
  // Flächen liegen auf runden Zahlen, ein versetztes Raster verfehlt das
  // größte Feld um zehn Pixel.
  for (let y = 0; y <= GAME.worldHeight; y += SCHRITT) {
    for (let x = 0; x <= GAME.worldWidth; x += SCHRITT) {
      if (wunsch.hoechstensX !== undefined && x > wunsch.hoechstensX) break;
      const zurMitte = Math.hypot(x - kartenmitte.x, y - kartenmitte.y);
      if (zurMitte >= besteEntfernung) continue;
      if (wunsch.fernVon && Math.hypot(x - wunsch.fernVon.x, y - wunsch.fernVon.y) < mindestabstand) continue;
      if (!rahmenFrei({ x, y }, rahmen)) continue;
      bester = { x, y };
      besteEntfernung = zurMitte;
    }
  }
  if (!bester) {
    throw new Error(
      `Kein freier Messpunkt mit Rahmen ${JSON.stringify(rahmen)} auf dieser Karte`
      + (wunsch.fernVon ? ` und ${mindestabstand} px Abstand zu (${wunsch.fernVon.x}, ${wunsch.fernVon.y})` : '')
    );
  }
  return bester;
}

/** Der häufige Fall: gleich viel Platz in alle Richtungen. */
export function messfeld(halbeBreite: number, halbeHoehe = halbeBreite, wunsch: Messfeldwunsch = {}): Vector2 {
  return messpunkt({ links: halbeBreite, rechts: halbeBreite, oben: halbeHoehe, unten: halbeHoehe }, wunsch);
}
