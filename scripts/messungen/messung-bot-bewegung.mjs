/**
 * Bot-Bewegung – Sam: „Die Bots bewegen sich sehr komisch und sehr random
 * und bothaft und nicht wie echte Spieler."
 *
 * Drei Zahlen, um die Ursache einzugrenzen statt sie zu erraten:
 *
 *  1. Anteil der Bot-Ticks OHNE Ziel (weder Gegner noch Form) – dort läuft nur
 *     die kreisförmige Leerlauf-Drift (bot-brain.ts, `Math.cos(now/1800)`).
 *     Ein Kreis ist geometrisch perfekt und für jeden Zuschauer sofort als
 *     Skript erkennbar – kein Mensch fährt so, und im engen neuen Labyrinth
 *     (Stufe 3) ist ein Gang ohne sichtbare Form nichts Seltenes.
 *  2. Wie oft sich `bot.strafe` pro Sekunde umdreht (Sprungweite der
 *     Bewegungsrichtung durch Kampf-Strafing, unabhängig vom Kampfgeschehen
 *     ausgewürfelt).
 *  3. Mittlere Richtungsänderung von `player.move` pro Tick (°) – ein grober
 *     Vergleichswert für „ruckartig" gegen „geschmeidig", der auch die
 *     90°-Umweg-Drehungen aus dem Anti-Stuck-Ausweich mit einfängt.
 *
 *   npm run build && node scripts/messungen/messung-bot-bewegung.mjs
 */
import { buildGame } from './stack.mjs';

const DT = 1 / 40;
const SEKUNDEN = 90;
const TICKS = Math.round(SEKUNDEN / DT);

const game = buildGame({ botCount: 24, mode: 'maze', director: true, rapidBots: true });
const interna = game;

let now = 100_000;
game.step(DT, now);

const bots = () => [...interna.players.values()].filter((p) => p.bot && !p.dead);

let ohneZielTicks = 0;
let gesamtTicks = 0;
let strafeWechsel = 0;
const letzterStrafe = new Map();
let winkelSumme = 0;
let winkelAnzahl = 0;
let scharfeWinkel = 0;
const letzterWinkel = new Map();

for (let tick = 0; tick < TICKS; tick += 1) {
  game.step(DT, (now += 25));
  for (const spieler of bots()) {
    gesamtTicks += 1;
    if (!spieler.bot.targetId && !spieler.bot.targetShapeId) ohneZielTicks += 1;

    const vorherStrafe = letzterStrafe.get(spieler.id);
    if (vorherStrafe !== undefined && Math.sign(vorherStrafe) !== Math.sign(spieler.bot.strafe) && spieler.bot.strafe !== 0) {
      strafeWechsel += 1;
    }
    letzterStrafe.set(spieler.id, spieler.bot.strafe);

    const laenge = Math.hypot(spieler.move.x, spieler.move.y);
    if (laenge > 0.05) {
      const winkel = Math.atan2(spieler.move.y, spieler.move.x);
      const vorher = letzterWinkel.get(spieler.id);
      if (vorher !== undefined) {
        let diff = Math.abs(winkel - vorher);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        winkelSumme += diff;
        winkelAnzahl += 1;
        if (diff > Math.PI / 2) scharfeWinkel += 1;
      }
      letzterWinkel.set(spieler.id, winkel);
    }
  }
}

console.log(`${SEKUNDEN} s, 24 Bots, echtes Labyrinth.\n`);
console.log(`Bot-Ticks ohne jedes Ziel (Leerlauf-Kreisdrift): ${(100 * ohneZielTicks / gesamtTicks).toFixed(1)} % von ${gesamtTicks}`);
console.log(`Strafe-Richtungswechsel: ${strafeWechsel} in ${SEKUNDEN} s über alle Bots (${(strafeWechsel / SEKUNDEN).toFixed(2)}/s gesamt, ${(strafeWechsel / SEKUNDEN / 24).toFixed(3)}/s je Bot)`);
console.log(`Mittlere Richtungsänderung von move pro Tick: ${(winkelSumme / winkelAnzahl * 180 / Math.PI).toFixed(1)}°`);
console.log(`Ticks mit Richtungssprung > 90°: ${(100 * scharfeWinkel / winkelAnzahl).toFixed(2)} % aller bewegten Ticks`);
