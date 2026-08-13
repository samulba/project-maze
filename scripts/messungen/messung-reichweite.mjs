/**
 * Wie weit fliegt eine Kugel WIRKLICH – und wie viel Zeit bleibt zum Ausweichen?
 *
 * Sams Befund vom 13.08.: „die Schüsse gehen noch immer zu weit und sind von
 * Anfang an zu schnell." Bevor daran gedreht wird, brauchen wir drei Zahlen,
 * die es bisher nirgends gab:
 *
 * 1. **Nennreichweite** (`projectileSpeed × projectileLife`) je Klasse, im
 *    Verhältnis zu dem, was der Spieler überhaupt sieht: Das Fenster ist
 *    1600 × 900, die halbe Breite also 800 px. Alles darüber heißt: Der
 *    Schütze steht beim Abdrücken außerhalb des Bildes seines Opfers.
 * 2. **Realisierte Reichweite im Labyrinth.** Sam spielt Maze, nicht freies
 *    Feld. Eine Kugel, die nach 700 px an einer Wand stirbt, ist keine
 *    2400-px-Kugel. Gemessen wird die freie Sichtlinie über viele zufällige
 *    Punkte und Richtungen.
 * 3. **Ausweichzeit des Verteidigers**: Wie lange ist die Kugel von der
 *    Mündung bis zum Ziel unterwegs? Das ist die Zahl hinter „zu schnell" –
 *    aus der Sicht dessen, der getroffen wird.
 *
 *   npm run build && node scripts/messungen/messung-reichweite.mjs
 */
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, GAME, EMPTY_UPGRADES } from '../../packages/shared/dist/index.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';
import { setProjectileSpeedEnabled } from '../../apps/server/dist/projectile-speed.js';
import { setArenaMode, hasLineOfSight, isFree } from '../../apps/server/dist/world.js';

setProjectileSpeedEnabled(true); // PROJECTILE_SPEED_V2 ist Opt-out, also an

const HALBE_BREITE = GAME.visibleWorldWidth / 2;
const HALBE_HOEHE = GAME.visibleWorldHeight / 2;

const spieler = (playerClass, level, upgrades = {}, frame = 'standard') => ({
  playerClass, level, passiveModifier: frame,
  upgrades: { ...EMPTY_UPGRADES(), ...upgrades },
  bot: null, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 },
  primary: false, secondary: false, cooldown: 0, lastDamageAt: 0, invulnerableUntil: 0
});

const schuetzen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].barrelCount > 0);

// ---------------------------------------------------------------- 1 + 3
const zeilen = schuetzen.map((id) => {
  const s = tunedStatsFor(spieler(id, 20));
  const reichweite = s.projectileSpeed * s.projectileLife;
  return {
    id,
    tempo: Math.round(s.projectileSpeed),
    reichweite: Math.round(reichweite),
    inBreiten: reichweite / HALBE_BREITE,
    // Flugzeit bis zum eigenen Bildrand – so lange hat der Getroffene Zeit.
    flugzeitRand: HALBE_BREITE / s.projectileSpeed,
    // ... und über eine typische Kampfdistanz von 400 px.
    flugzeit400: 400 / s.projectileSpeed
  };
}).sort((a, b) => b.reichweite - a.reichweite);

console.log('=== 1. Nennreichweite (Level 20, keine Upgrades) ===');
console.log(`Sichtfenster ${GAME.visibleWorldWidth}x${GAME.visibleWorldHeight}, halbe Breite ${HALBE_BREITE} px, halbe Hoehe ${HALBE_HOEHE} px\n`);
console.log('Klasse'.padEnd(14), 'Tempo'.padStart(6), 'Reichw.'.padStart(8), 'halbeBreiten'.padStart(13), 'bisRand'.padStart(9), 'auf400px'.padStart(9));
for (const z of [...zeilen.slice(0, 8), null, ...zeilen.slice(-5)]) {
  if (!z) { console.log('   ...'); continue; }
  console.log(
    z.id.padEnd(14),
    String(z.tempo).padStart(6),
    String(z.reichweite).padStart(8),
    z.inBreiten.toFixed(2).padStart(13),
    `${z.flugzeitRand.toFixed(2)}s`.padStart(9),
    `${z.flugzeit400.toFixed(2)}s`.padStart(9)
  );
}
const ueber = zeilen.filter((z) => z.inBreiten > 1);
console.log(`\nKlassen, die weiter schiessen als der Spieler sieht: ${ueber.length} von ${zeilen.length}`);
console.log(`Spanne: ${zeilen.at(-1).inBreiten.toFixed(2)}x bis ${zeilen[0].inBreiten.toFixed(2)}x halbe Bildbreite`);
const schnellste = [...zeilen].sort((a, b) => a.flugzeit400 - b.flugzeit400)[0];
const langsamste = [...zeilen].sort((a, b) => b.flugzeit400 - a.flugzeit400)[0];
console.log(`Ausweichzeit auf 400 px: ${schnellste.flugzeit400.toFixed(2)}s (${schnellste.id}) bis ${langsamste.flugzeit400.toFixed(2)}s (${langsamste.id})`);

// Voller Ausbau: Reichweiten-Slot x1,60 plus Stabilizer-Rahmen
const voll = tunedStatsFor(spieler('lancer', 60, { projectileRange: 10, projectileSpeed: 10 }, 'stabilizer'));
console.log(`Extremfall lancer L60, Reichweiten-Slot voll, Stabilizer: ${Math.round(voll.projectileSpeed * voll.projectileLife)} px = ${(voll.projectileSpeed * voll.projectileLife / HALBE_BREITE).toFixed(2)}x halbe Bildbreite`);

// ---------------------------------------------------------------- 2
console.log('\n=== 2. Realisierte Reichweite im Labyrinth ===');
for (const modus of ['maze', 'ffa']) {
  setArenaMode(modus);
  const messungen = [];
  let versuche = 0;
  // Feste Folge statt Math.random, damit die Zahl wiederholbar ist.
  let seed = 12345;
  const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  while (messungen.length < 4000 && versuche < 200_000) {
    versuche += 1;
    const von = { x: 100 + zufall() * (GAME.worldWidth - 200), y: 100 + zufall() * (GAME.worldHeight - 200) };
    if (!isFree(von, GAME.playerRadius)) continue;
    const winkel = zufall() * Math.PI * 2;
    // Wie weit kommt man in dieser Richtung, bis eine Wand im Weg steht?
    let weit = 0;
    for (let d = 40; d <= 3000; d += 40) {
      const bis = { x: von.x + Math.cos(winkel) * d, y: von.y + Math.sin(winkel) * d };
      if (bis.x < 0 || bis.y < 0 || bis.x > GAME.worldWidth || bis.y > GAME.worldHeight) break;
      if (!hasLineOfSight(von, bis)) break;
      weit = d;
    }
    messungen.push(weit);
  }
  messungen.sort((a, b) => a - b);
  const p = (q) => messungen[Math.min(messungen.length - 1, Math.floor(q * messungen.length))];
  console.log(
    `${modus.padEnd(6)} n=${messungen.length}  Median ${p(0.5)} px  p75 ${p(0.75)}  p90 ${p(0.9)}  max ${messungen.at(-1)}` +
    `  |  Anteil ueber ${HALBE_BREITE} px: ${(100 * messungen.filter((m) => m > HALBE_BREITE).length / messungen.length).toFixed(1)} %`
  );
}

// ---------------------------------------------------------------- Lecks
console.log('\n=== 3. Das Stabilizer-Leck ===');
const ohne = tunedStatsFor(spieler('twin', 20));
const mit = tunedStatsFor(spieler('twin', 20, {}, 'stabilizer'));
console.log(`twin standard:   Tempo ${ohne.projectileSpeed.toFixed(1)}, Leben ${ohne.projectileLife.toFixed(3)}, Reichweite ${Math.round(ohne.projectileSpeed * ohne.projectileLife)}`);
console.log(`twin stabilizer: Tempo ${mit.projectileSpeed.toFixed(1)}, Leben ${mit.projectileLife.toFixed(3)}, Reichweite ${Math.round(mit.projectileSpeed * mit.projectileLife)}`);
console.log(`-> Der Rahmen verspricht schnellere Kugeln, gibt aber zusaetzlich ${((mit.projectileSpeed * mit.projectileLife) / (ohne.projectileSpeed * ohne.projectileLife) * 100 - 100).toFixed(1)} % Reichweite.`);
