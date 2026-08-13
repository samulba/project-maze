/**
 * Kandidaten für die Labyrinth-Maße nebeneinander vermessen (Stufe 3).
 *
 * Der erste Anlauf mit 800/140/0,32 war nachweislich schlechter als die alte
 * Karte: 36 Wände, 88 % begehbar, und die Sichtweiten wurden **länger** statt
 * kürzer (57,5 % statt 46,4 % der Blicke über eine halbe Bildbreite). Drei
 * Zahlen hängen zusammen – Bahn, Wanddicke, Verflechtung –, und Raten hat
 * schon einmal danebengelegen. Also messen.
 *
 * Gemessen wird für jeden Kandidaten dasselbe wie in `messung-karte.mjs`:
 * Erreichbarkeit, Deckung, begehbarer Anteil, Sichtweiten.
 *
 *   npm run build && node scripts/messungen/messung-karten-raster.mjs
 */
import { GAME } from '../../packages/shared/dist/index.js';
import { pruefeErreichbarkeit, probenRadius } from '../../apps/server/dist/map-reachability.js';
import { circleHitsWall, erzeugeLabyrinth, segmentIntersectsWall } from '../../apps/server/dist/world.js';

const RASTER = 40;          // gröber als im Test: hier zählt der Vergleich, nicht die letzte Stelle
const HALBE_BREITE = GAME.visibleWorldWidth / 2;
const quantil = (werte, q) => werte[Math.min(werte.length - 1, Math.floor(q * werte.length))];

/** Dieselbe Frage wie `isFree`, aber gegen eine beliebige Wandliste. */
const freiIn = (waende) => (punkt, radius) =>
  punkt.x >= radius && punkt.y >= radius
  && punkt.x <= GAME.worldWidth - radius && punkt.y <= GAME.worldHeight - radius
  && !waende.some((w) => circleHitsWall(punkt, radius, w));

function vermesse(mass) {
  const { waende, plaetze, spalten, zeilen } = erzeugeLabyrinth(mass);
  const frei = freiIn(waende);

  const erreichbar = pruefeErreichbarkeit({
    breite: GAME.worldWidth, hoehe: GAME.worldHeight, raster: RASTER,
    frei: (punkt) => frei(punkt, probenRadius(GAME.playerRadius, RASTER))
  });

  const wandflaeche = waende.reduce((summe, w) => summe + w.width * w.height, 0);

  let seed = 20250813;
  const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sichten = [];
  let versuche = 0;
  while (sichten.length < 1500 && versuche < 60_000) {
    versuche += 1;
    const von = { x: 100 + zufall() * (GAME.worldWidth - 200), y: 100 + zufall() * (GAME.worldHeight - 200) };
    if (!frei(von, GAME.playerRadius)) continue;
    const winkel = zufall() * Math.PI * 2;
    let weit = 0;
    for (let d = 40; d <= 3000; d += 40) {
      const bis = { x: von.x + Math.cos(winkel) * d, y: von.y + Math.sin(winkel) * d };
      if (bis.x < 0 || bis.y < 0 || bis.x > GAME.worldWidth || bis.y > GAME.worldHeight) break;
      if (waende.some((w) => segmentIntersectsWall(von, bis, w))) break;
      weit = d;
    }
    sichten.push(weit);
  }
  sichten.sort((a, b) => a - b);

  return {
    waende: waende.length,
    gebiete: erreichbar.gebiete.length,
    deckung: 100 * wandflaeche / (GAME.worldWidth * GAME.worldHeight),
    begehbar: 100 * erreichbar.begehbar / (erreichbar.spalten * erreichbar.zeilen),
    gang: mass.bahn - mass.dicke,
    zellen: `${spalten}x${zeilen}`,
    platz: Math.round(plaetze[0].bereich.width),
    sichtMedian: quantil(sichten, 0.5),
    sichtP90: quantil(sichten, 0.9),
    weitBlicke: 100 * sichten.filter((s) => s > HALBE_BREITE).length / sichten.length
  };
}

console.log('Alte Karte zum Vergleich:  89 Waende,  4.53 % Deckung,  90.3 % begehbar,  Sicht-Median 760,  46.4 % weite Blicke\n');
console.log(
  'bahn'.padStart(5), 'dicke'.padStart(6), 'verfl'.padStart(6), '|',
  'Gang'.padStart(5), 'Zellen'.padStart(7), 'Waende'.padStart(7), 'Geb'.padStart(4),
  'Deckung'.padStart(8), 'begehbar'.padStart(9), 'SichtMed'.padStart(9), 'SichtP90'.padStart(9), 'weit%'.padStart(6), 'Platz'.padStart(6)
);

const kandidaten = [];
for (const bahn of [400, 480, 600, 800]) {
  for (const dicke of [80, 120, 160, 200, 240]) {
    if (dicke > bahn * 0.45) continue;       // sonst ist der Gang enger als die Wand dick
    if (bahn - dicke < 220) continue;         // fünf Panzerbreiten sind die Untergrenze
    for (const verflechtung of [0, 0.12, 0.25]) {
      kandidaten.push({ bahn, dicke, verflechtung });
    }
  }
}

for (const mass of kandidaten) {
  const m = vermesse(mass);
  console.log(
    String(mass.bahn).padStart(5), String(mass.dicke).padStart(6), mass.verflechtung.toFixed(2).padStart(6), '|',
    String(m.gang).padStart(5), m.zellen.padStart(7), String(m.waende).padStart(7), String(m.gebiete).padStart(4),
    `${m.deckung.toFixed(1)} %`.padStart(8), `${m.begehbar.toFixed(1)} %`.padStart(9),
    String(m.sichtMedian).padStart(9), String(m.sichtP90).padStart(9),
    `${m.weitBlicke.toFixed(1)}`.padStart(6), String(m.platz).padStart(6)
  );
}

/**
 * Die Verflechtung hat genau eine Aufgabe: Sackgassen beseitigen. Also wird sie
 * daran gemessen und nicht am Gefühl. Eine Sackgasse ist eine Zelle mit genau
 * einem offenen Nachbarn – wer da hineinläuft, muss denselben Weg zurück.
 */
console.log('\n=== Verflechtung: wie viele Sackgassen bleiben? (bahn 480, dicke 160) ===');
console.log('verfl'.padStart(6), 'Waende'.padStart(7), 'Sackgassen'.padStart(11), 'Anteil'.padStart(8), 'Deckung'.padStart(8), 'weit%'.padStart(6));
for (const verflechtung of [0, 0.06, 0.12, 0.2, 0.3, 0.45]) {
  const mass = { bahn: 480, dicke: 160, verflechtung };
  const { waende, spalten, zeilen } = erzeugeLabyrinth(mass);
  const frei = freiIn(waende);
  const kanteX = (spalte) => (spalte >= spalten ? GAME.worldWidth : spalte * mass.bahn);
  const kanteY = (zeile) => (zeile >= zeilen ? GAME.worldHeight : zeile * mass.bahn);
  const mitte = (spalte, zeile) => ({
    x: (kanteX(spalte) + kanteX(spalte + 1)) / 2,
    y: (kanteY(zeile) + kanteY(zeile + 1)) / 2
  });
  // Passierbar heißt: der ganze Weg zwischen zwei Zellmitten ist frei.
  const passierbar = (a, b) => {
    const schritte = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 20);
    for (let i = 0; i <= schritte; i += 1) {
      const t = i / schritte;
      if (!frei({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, GAME.playerRadius)) return false;
    }
    return true;
  };
  let sackgassen = 0;
  for (let zeile = 0; zeile < zeilen; zeile += 1) {
    for (let spalte = 0; spalte < spalten; spalte += 1) {
      const hier = mitte(spalte, zeile);
      let nachbarn = 0;
      if (spalte > 0 && passierbar(hier, mitte(spalte - 1, zeile))) nachbarn += 1;
      if (spalte + 1 < spalten && passierbar(hier, mitte(spalte + 1, zeile))) nachbarn += 1;
      if (zeile > 0 && passierbar(hier, mitte(spalte, zeile - 1))) nachbarn += 1;
      if (zeile + 1 < zeilen && passierbar(hier, mitte(spalte, zeile + 1))) nachbarn += 1;
      if (nachbarn <= 1) sackgassen += 1;
    }
  }
  const m = vermesse(mass);
  console.log(
    verflechtung.toFixed(2).padStart(6), String(waende.length).padStart(7),
    String(sackgassen).padStart(11), `${(100 * sackgassen / (spalten * zeilen)).toFixed(1)} %`.padStart(8),
    `${m.deckung.toFixed(1)} %`.padStart(8), m.weitBlicke.toFixed(1).padStart(6)
  );
}
