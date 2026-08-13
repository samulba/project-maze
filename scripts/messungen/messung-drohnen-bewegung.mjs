/**
 * Drohnen-Rework 2: Geschwindigkeit, Wandtod, Zielwechsel (Sam, 13.08.).
 *
 * „Drohnen brauchen noch ein Rework – die Bewegung ist noch nicht so clean,
 * Rechtsklick und Auto-Modus gehen wesentlich smoother." / „Drohnen bewegen
 * sich noch zu schnell." / „Alles was gegen Wände geht sollte kaputtgehen
 * (Drohnen etc.)."
 *
 * Drei Messungen, je eine gegen einen Punkt:
 *
 * 1. **Tempo-Verhältnis**: Drohnentempo geteilt durch das Tempo des eigenen
 *    Besitzers. Vorher 1,38–2,20× – eine Drohne war schneller als ein
 *    Rennwagen neben einem Familienauto.
 * 2. **Wandtod-Kandidaten**: Wie oft bremst eine geradeaus fliegende Drohne
 *    im echten Labyrinth so hart ab, dass es ein Kopf-auf-Wand-Treffer ist,
 *    gegenüber einem harmlosen Streifschuss beim Navigieren?
 * 3. **Zielflackern**: Bleibt die Flotte bei einem Ziel, wenn zwei Gegner
 *    etwa gleich weit entfernt sind – oder springt sie hin und her?
 *
 *   npm run build && node scripts/messungen/messung-drohnen-bewegung.mjs
 */
import { buildGame } from './stack.mjs';
import { CLASS_DEFINITIONS, EMPTY_UPGRADES } from '../../packages/shared/dist/index.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';
import { droneArchetypes } from '../../apps/server/dist/drone-tuning.js';
import { isFree, setArenaMode } from '../../apps/server/dist/world.js';

const DT = 1 / 40;

// ---------------------------------------------------------------- 1
console.log('=== 1. Tempo-Verhältnis Drohne : Besitzer ===');
const archetypes = droneArchetypes();
const statsFor = (id, level = 20) => tunedStatsFor({
  playerClass: id, level, passiveModifier: 'standard', upgrades: EMPTY_UPGRADES(),
  bot: null, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, primary: false, secondary: false,
  cooldown: 0, lastDamageAt: 0, invulnerableUntil: 0
});
const verhaeltnisse = [];
console.log('Klasse'.padEnd(11), 'DrohnTempo'.padStart(11), 'SpielerTempo'.padStart(13), 'Verhältnis'.padStart(11));
for (const id of Object.keys(archetypes)) {
  const owner = statsFor(id);
  const arch = archetypes[id];
  const verhaeltnis = arch.speed / owner.moveSpeed;
  verhaeltnisse.push(verhaeltnis);
  console.log(id.padEnd(11), String(Math.round(arch.speed)).padStart(11), String(Math.round(owner.moveSpeed)).padStart(13), verhaeltnis.toFixed(2).padStart(11));
}
console.log(`Spanne: ${Math.min(...verhaeltnisse).toFixed(2)}x bis ${Math.max(...verhaeltnisse).toFixed(2)}x`);

// ---------------------------------------------------------------- 2
console.log('\n=== 2. Wandkontakte im echten Labyrinth (drone-Klasse, ohne Kommando) ===');
setArenaMode('maze');
const game = buildGame({ botCount: 0, mode: 'maze', director: false });
const interna = game;
interna.shapes.clear();
const id = game.addPlayer('Messsonde');
const spieler = interna.players.get(id);
spieler.level = 20;
spieler.playerClass = 'drone';
spieler.invulnerable = false;
spieler.invulnerableUntil = 0;
// Zufällig über die Karte verteilte Startpunkte, damit die Drohnen echte
// Gänge und Ecken durchqueren statt immer denselben Startort.
let seed = 20260813;
const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let versuche = 0;
let kopfAufWand = 0;
let streifschuesse = 0;
let gesamtTicks = 0;
for (let lauf = 0; lauf < 40; lauf += 1) {
  let start;
  do { start = { x: 200 + zufall() * 8600, y: 200 + zufall() * 5600 }; } while (!isFree(start, 40));
  spieler.position = { ...start };
  interna.removeOwnerDrones(id);
  interna.spawnInitialDrones(spieler, 100_000);
  spieler.aim = { x: (zufall() - 0.5) * 1200, y: (zufall() - 0.5) * 1200 };
  spieler.primary = true;
  let now = 100_000;
  for (let tick = 0; tick < 60; tick += 1) {
    const vorPositionen = new Map([...interna.drones.values()].map((d) => [d.id, { ...d.velocity }]));
    game.step(DT, (now += 25));
    for (const drohne of interna.drones.values()) {
      const vor = vorPositionen.get(drohne.id);
      if (!vor) continue;
      const vorTempo = Math.hypot(vor.x, vor.y);
      const nachTempo = Math.hypot(drohne.velocity.x, drohne.velocity.y);
      if (vorTempo < 120) continue; // kein nennenswertes Tempo, keine Kollisionsfrage
      gesamtTicks += 1;
      if (nachTempo < vorTempo * 0.3) kopfAufWand += 1;
      else if (nachTempo < vorTempo * 0.85) streifschuesse += 1;
    }
  }
  versuche += 1;
}
console.log(`${versuche} Läufe, ${gesamtTicks} Tempo-Vergleiche mit nennenswertem Tempo (>120 px/s).`);
console.log(`Kopf-auf-Wand-Kandidaten (Restgeschw. < 30 %): ${kopfAufWand} (${(100 * kopfAufWand / gesamtTicks).toFixed(2)} %)`);
console.log(`Streifschüsse (30–85 % Restgeschw., normales Navigieren): ${streifschuesse} (${(100 * streifschuesse / gesamtTicks).toFixed(2)} %)`);
