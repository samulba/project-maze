/**
 * Factory-Minions (D8) – Sam: „Factory ist noch keine Factory, sondern
 * einfach Mini-Drohnen." In Diep.io trägt ein Factory-Minion ein eigenes
 * Geschütz – nicht nur einen größeren Körper mit demselben Kontaktverhalten
 * wie jede andere Drohnenklasse.
 *
 * Gemessen wird der Schaden je Sekunde bei mehreren Abständen, für die
 * beiden Klassen mit `minionWaffe` (factory, carrier) und zum Vergleich eine
 * reine Kontaktklasse gleicher Größenordnung (guardian). Entscheidend ist
 * der Bereich JENSEITS der Kontaktdistanz (~40–60 px) aber INNERHALB der
 * Waffenreichweite (factory 299 px, carrier 318 px): Dort soll eine echte
 * Minion-Klasse jetzt Schaden machen, eine reine Kontaktklasse weiterhin
 * null.
 *
 *   npm run build && node scripts/messungen/messung-drohnen-minions.mjs
 */
import { buildGame } from './stack.mjs';
import { messpunkt } from '../../apps/server/dist/messfeld.js';

const DT = 0.025;
const TICK = 25;
const OFFENES_FELD = messpunkt({ links: 200, rechts: 700, oben: 300, unten: 300 });
const SEKUNDEN = 8;
const ABSTAENDE = [80, 150, 250, 350, 450];
const KLASSEN = ['factory', 'carrier', 'guardian'];

function messe(klasse, abstand) {
  const game = buildGame({ botCount: 0, mode: 'ffa', director: false });
  const interna = game;
  interna.shapes.clear();

  const besitzerId = game.addPlayer('Controller');
  const besitzer = interna.players.get(besitzerId);
  besitzer.level = 45;
  besitzer.position = { ...OFFENES_FELD };
  besitzer.invulnerable = false;
  besitzer.invulnerableUntil = 0;
  besitzer.playerClass = klasse;
  interna.removeOwnerDrones(besitzerId);
  interna.spawnInitialDrones(besitzer, 100_000);

  const gegnerId = game.addPlayer('Gegner');
  const gegner = interna.players.get(gegnerId);
  gegner.level = 45;
  gegner.invulnerable = false;
  gegner.invulnerableUntil = 0;

  let now = 100_000;
  game.step(DT, now);

  let schaden = 0;
  let projektilTreffer = 0;
  const ticks = Math.round(SEKUNDEN / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    besitzer.position = { ...OFFENES_FELD };
    besitzer.velocity = { x: 0, y: 0 };
    besitzer.primary = false;
    besitzer.secondary = false;
    besitzer.aim = { x: 0, y: 0 };
    gegner.position = { x: OFFENES_FELD.x + abstand, y: OFFENES_FELD.y };
    gegner.velocity = { x: 0, y: 0 };
    gegner.invulnerable = false;
    const projektileVorher = interna.projectiles.size;
    const vorher = gegner.health;
    game.step(DT, (now += TICK));
    if (interna.projectiles.size > projektileVorher) projektilTreffer += 1;
    if (gegner.health < vorher) schaden += vorher - gegner.health;
    gegner.health = gegner.maxHealth;
    gegner.dead = false;
  }

  return { dps: Math.round((schaden / SEKUNDEN) * 10) / 10 };
}

console.log(`${SEKUNDEN} s je Zelle, Gegner ruht auf fixem Abstand.\n`);
console.log('Klasse'.padEnd(11), ABSTAENDE.map((a) => `${a}px`.padStart(12)).join(''));
for (const klasse of KLASSEN) {
  const zellen = ABSTAENDE.map((abstand) => `${messe(klasse, abstand).dps} dps`.padStart(12));
  console.log(klasse.padEnd(11), zellen.join(''));
}
