/**
 * Grundlinie der Karte – vor dem Generator-Umbau (Stufe 3, Bericht 26).
 *
 * Sams Befund vom 13.08.: „die Map ist noch zu wenig Maze […] dickere Wände,
 * mehr Wände" – und dazu „zwei Mainspots". Bevor daran gedreht wird, braucht
 * es Zahlen, gegen die sich der Umbau messen lässt. Vier davon gab es bisher
 * nirgends:
 *
 * 1. **Erreichbarkeit**: Zerfällt die begehbare Fläche? (Die einzige Zahl, die
 *    ein Generator-Umbau still kaputtmachen kann, ohne dass es auffällt.)
 * 2. **Deckung**: Anteil der Wandfläche, Zahl und Dicke der Wände.
 * 3. **Wandabstand**: Wie weit ist man typischerweise von der nächsten Deckung
 *    entfernt? Das ist die eigentliche Zahl hinter „zu wenig Maze" – in einem
 *    Labyrinth ist Deckung immer in Reichweite, auf einem Feld nie.
 * 4. **Sichtweite**: Wie weit reicht der Blick, bevor eine Wand ihn stoppt?
 *
 *   npm run build && node scripts/messungen/messung-karte.mjs
 */
import { GAME } from '../../packages/shared/dist/index.js';
import {
  RASTER, berichte, probenRadius, pruefeErreichbarkeit
} from '../../apps/server/dist/map-reachability.js';
import { WALLS, hasLineOfSight, isFree, setArenaMode } from '../../apps/server/dist/world.js';

setArenaMode('maze');

// Feste Folge statt Math.random, damit die Zahlen wiederholbar sind.
let seed = 20250813;
const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const quantil = (werte, q) => werte[Math.min(werte.length - 1, Math.floor(q * werte.length))];

console.log(`Karte ${GAME.worldWidth} x ${GAME.worldHeight}, Sichtfenster ${GAME.visibleWorldWidth} x ${GAME.visibleWorldHeight}, Panzerradius ${GAME.playerRadius}\n`);

// ------------------------------------------------------------------ 1
console.log('=== 1. Erreichbarkeit ===');
for (const [name, radius] of [
  ['nackter Panzerradius', GAME.playerRadius],
  ['mit Aufschlag (so prüft der Test)', probenRadius(GAME.playerRadius)],
  ['doppelte Panzerbreite', GAME.playerRadius * 2]
]) {
  const ergebnis = pruefeErreichbarkeit({
    breite: GAME.worldWidth, hoehe: GAME.worldHeight, raster: RASTER,
    frei: (punkt) => isFree(punkt, radius)
  });
  const anteil = ergebnis.begehbar / (ergebnis.spalten * ergebnis.zeilen);
  console.log(`${name.padEnd(34)} r=${String(Math.round(radius)).padStart(3)}  ${berichte(ergebnis)}`);
  console.log(`${''.padEnd(34)}        begehbar ${(anteil * 100).toFixed(1)} % der Rasterfläche`);
}

// ------------------------------------------------------------------ 2
console.log('\n=== 2. Deckung ===');
const wandflaeche = WALLS.reduce((summe, w) => summe + w.width * w.height, 0);
const dicken = [...new Set(WALLS.map((w) => Math.min(w.width, w.height)))].sort((a, b) => a - b);
const laengen = WALLS.map((w) => Math.max(w.width, w.height)).sort((a, b) => a - b);
console.log(`Wände: ${WALLS.length}  (${WALLS.filter((w) => w.id.startsWith('v')).length} senkrecht, `
  + `${WALLS.filter((w) => w.id.startsWith('h')).length} waagerecht, ${WALLS.filter((w) => w.id.startsWith('l')).length} gesetzt)`);
console.log(`Wandfläche: ${(100 * wandflaeche / (GAME.worldWidth * GAME.worldHeight)).toFixed(2)} % der Karte`);
console.log(`Wanddicken: ${dicken.join(', ')} px   (Panzerdurchmesser ${GAME.playerRadius * 2} px)`);
console.log(`Wandlängen: Median ${quantil(laengen, 0.5)} px, kürzeste ${laengen[0]}, längste ${laengen.at(-1)}`);
console.log(`Wände je Million Pixel: ${(WALLS.length / ((GAME.worldWidth * GAME.worldHeight) / 1e6)).toFixed(2)}`);

// ------------------------------------------------------------------ 3
console.log('\n=== 3. Wandabstand: wie weit ist die nächste Deckung? ===');
const abstaende = [];
while (abstaende.length < 4000) {
  const punkt = { x: 100 + zufall() * (GAME.worldWidth - 200), y: 100 + zufall() * (GAME.worldHeight - 200) };
  if (!isFree(punkt, GAME.playerRadius)) continue;
  let naechste = Infinity;
  for (const w of WALLS) {
    const dx = Math.max(w.x - punkt.x, 0, punkt.x - (w.x + w.width));
    const dy = Math.max(w.y - punkt.y, 0, punkt.y - (w.y + w.height));
    naechste = Math.min(naechste, Math.hypot(dx, dy));
  }
  abstaende.push(naechste);
}
abstaende.sort((a, b) => a - b);
const halbeBreite = GAME.visibleWorldWidth / 2;
console.log(`Median ${Math.round(quantil(abstaende, 0.5))} px  p75 ${Math.round(quantil(abstaende, 0.75))}  `
  + `p90 ${Math.round(quantil(abstaende, 0.9))}  max ${Math.round(abstaende.at(-1))}`);
console.log(`Anteil der Karte weiter als eine halbe Bildbreite (${halbeBreite} px) von jeder Deckung entfernt: `
  + `${(100 * abstaende.filter((a) => a > halbeBreite).length / abstaende.length).toFixed(1)} %`);
console.log(`Anteil weiter als 400 px von jeder Deckung: ${(100 * abstaende.filter((a) => a > 400).length / abstaende.length).toFixed(1)} %`);

// ------------------------------------------------------------------ 4
console.log('\n=== 4. Sichtweite: wie weit reicht der Blick? ===');
const sichten = [];
while (sichten.length < 3000) {
  const von = { x: 100 + zufall() * (GAME.worldWidth - 200), y: 100 + zufall() * (GAME.worldHeight - 200) };
  if (!isFree(von, GAME.playerRadius)) continue;
  const winkel = zufall() * Math.PI * 2;
  let weit = 0;
  for (let d = 40; d <= 3000; d += 40) {
    const bis = { x: von.x + Math.cos(winkel) * d, y: von.y + Math.sin(winkel) * d };
    if (bis.x < 0 || bis.y < 0 || bis.x > GAME.worldWidth || bis.y > GAME.worldHeight) break;
    if (!hasLineOfSight(von, bis)) break;
    weit = d;
  }
  sichten.push(weit);
}
sichten.sort((a, b) => a - b);
console.log(`Median ${quantil(sichten, 0.5)} px  p75 ${quantil(sichten, 0.75)}  p90 ${quantil(sichten, 0.9)}  max ${sichten.at(-1)}`);
console.log(`Anteil der Blicke, die über die halbe Bildbreite hinausreichen: `
  + `${(100 * sichten.filter((s) => s > halbeBreite).length / sichten.length).toFixed(1)} %`);
