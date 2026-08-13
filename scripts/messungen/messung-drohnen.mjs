/**
 * Drohnen-Rework, Stufe 1: Tun die Drohnen jetzt etwas?
 *
 * Sams Befund aus dem Spieltest vom 13.08.: „das macht ja gar keinen Sinn,
 * dass sie einfach um dich schweben und dann nix passiert." Die
 * Bestandsaufnahme hat ihn wörtlich bestätigt: Ein Gegner 200 px entfernt,
 * kein Kommando, acht Sekunden – **null Schaden**. Es gab im ganzen Server
 * keine Zeile, in der eine Drohne selbst ein Ziel suchte.
 *
 * Dieses Skript misst denselben Aufbau nach dem Umbau. Gemessen wird der
 * Schaden am Gegner je Sekunde, für jede der zehn Drohnenklassen, bei
 * mehreren Abständen – ohne jedes Kommando (also genau der Fall, den Sam
 * beschreibt).
 *
 *   npm run build && node scripts/messungen/messung-drohnen.mjs
 *
 * Der Gegner wird je Tick auf seine Position und auf volles Leben gesetzt:
 * Gemessen werden soll die Schadensrate, nicht wie schnell er stirbt.
 */
import { buildGame } from './stack.mjs';
import { messpunkt } from '../../apps/server/dist/messfeld.js';

const DT = 0.025;
const TICK = 25;
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Der Gegner
// steht bis zu 600 px rechts, die Flotte muss die Bahn dorthin frei haben.
const OFFENES_FELD = messpunkt({ links: 200, rechts: 700, oben: 300, unten: 300 });
const SEKUNDEN = 8;
const ABSTAENDE = [200, 400, 600];
const KLASSEN = ['drone', 'warden', 'factory', 'overseer', 'carrier', 'guardian', 'hive', 'sentinel', 'aviary', 'sovereign'];

function messe(klasse, abstand) {
  const game = buildGame({ botCount: 0, mode: 'ffa', director: false });
  const interna = game;
  // Formen entfernen: Sie sind gültige Ziele und würden die Messung stören.
  interna.shapes.clear();

  const besitzerId = game.addPlayer('Controller');
  const besitzer = interna.players.get(besitzerId);
  besitzer.level = 45;
  besitzer.position = { ...OFFENES_FELD };
  besitzer.invulnerable = false;
  besitzer.invulnerableUntil = 0;
  // Klasse direkt setzen statt über chooseClass: Die Klassen liegen auf
  // verschiedenen Pfaden des Baums, und gemessen werden soll der Drohnenkörper,
  // nicht der Aufstiegsweg. Danach die Flotte neu aufstellen, wie es
  // chooseClass auch täte.
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
  const ticks = Math.round(SEKUNDEN / DT);
  for (let tick = 0; tick < ticks; tick += 1) {
    // Beide festhalten – gemessen wird die Rate, nicht die Jagd.
    besitzer.position = { ...OFFENES_FELD };
    besitzer.velocity = { x: 0, y: 0 };
    besitzer.primary = false;
    besitzer.secondary = false;
    besitzer.aim = { x: 0, y: 0 };
    gegner.position = { x: OFFENES_FELD.x + abstand, y: OFFENES_FELD.y };
    gegner.velocity = { x: 0, y: 0 };
    gegner.invulnerable = false;
    const vorher = gegner.health;
    game.step(DT, (now += TICK));
    if (gegner.health < vorher) schaden += vorher - gegner.health;
    gegner.health = gegner.maxHealth;
    gegner.dead = false;
  }

  const drohnen = [...interna.drones.values()].filter((d) => d.ownerId === besitzerId);
  const mittlererAbstand = drohnen.length === 0 ? NaN : drohnen.reduce(
    (summe, d) => summe + Math.hypot(d.position.x - gegner.position.x, d.position.y - gegner.position.y), 0
  ) / drohnen.length;

  return {
    dps: Math.round((schaden / SEKUNDEN) * 10) / 10,
    flotte: drohnen.length,
    abstandZumGegner: Math.round(mittlererAbstand)
  };
}

console.log(`Ohne jedes Kommando, ${SEKUNDEN} s je Zelle. Vor dem Umbau: 0,0 DPS in JEDER Zelle.\n`);
console.log('Klasse'.padEnd(11), ABSTAENDE.map((a) => `${a}px`.padStart(18)).join(''));
for (const klasse of KLASSEN) {
  const zellen = ABSTAENDE.map((abstand) => {
    const ergebnis = messe(klasse, abstand);
    if (!ergebnis) return 'n/a'.padStart(18);
    return `${ergebnis.dps} dps (d ${ergebnis.abstandZumGegner})`.padStart(18);
  });
  console.log(klasse.padEnd(11), zellen.join(''));
}
