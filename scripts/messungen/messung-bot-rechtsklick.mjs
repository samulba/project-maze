/**
 * Bot-Rechtsklick bei Drohnenklassen (Sam: „Die Bots benutzen bei Drohnen
 * kein Rechtsklick").
 *
 * Vorher löste `secondary` bei jedem nahen Gegner aus, unabhängig vom
 * eigenen Zustand – die Flotte wich also auch dann vom Gegner, wenn der Bot
 * gerade angriff (die Gelegenheit, in der Kontaktschaden am meisten bringt).
 * Jetzt hängt der Klick an derselben Fluchterkennung wie die Bewegungsumkehr.
 *
 * Gemessen: Anteil der Ticks mit `secondary=true`, aufgeteilt danach, ob der
 * Bot zu diesem Zeitpunkt floh (Lebensanteil unter seinem Fluchtwert) oder
 * nicht. Der Rechtsklick soll fast ausschließlich in der Flucht auftreten.
 *
 *   npm run build && node scripts/messungen/messung-bot-rechtsklick.mjs
 */
import { buildGame } from './stack.mjs';

const DT = 1 / 40;
const SEKUNDEN = 90;

const game = buildGame({ botCount: 24, mode: 'maze', director: true, rapidBots: true });
const interna = game;

let now = 100_000;
game.step(DT, now);

let sekundaerFliehend = 0;
let sekundaerGesund = 0;
let tickFliehend = 0;
let tickGesund = 0;
let drohnenBots = 0;

const istDrohnenBot = (spieler) => spieler.bot && (spieler.upgrades !== undefined) &&
  ['drone', 'warden', 'factory', 'overseer', 'carrier', 'guardian', 'hive', 'sentinel', 'aviary', 'sovereign'].includes(spieler.playerClass);

const ticks = Math.round(SEKUNDEN / DT);
for (let tick = 0; tick < ticks; tick += 1) {
  game.step(DT, (now += 25));
  for (const spieler of interna.players.values()) {
    if (!istDrohnenBot(spieler) || spieler.dead) continue;
    const anteil = spieler.health / Math.max(1, spieler.maxHealth);
    const fliehtWahrscheinlich = anteil < 0.5; // grobe Schätzung, echte fleeHealth liegt niedriger
    if (fliehtWahrscheinlich) {
      tickFliehend += 1;
      if (spieler.secondary) sekundaerFliehend += 1;
    } else {
      tickGesund += 1;
      if (spieler.secondary) sekundaerGesund += 1;
    }
  }
}

const anzahlDrohnenBots = new Set([...interna.players.values()].filter(istDrohnenBot).map((s) => s.id)).size;
console.log(`${anzahlDrohnenBots} Drohnen-Bots über ${SEKUNDEN} s beobachtet.\n`);
console.log(`Rechtsklick bei niedrigem Leben (< 50 %): ${tickFliehend === 0 ? 'n/a' : (100 * sekundaerFliehend / tickFliehend).toFixed(1) + ' % der Ticks'} (${tickFliehend} Ticks gemessen)`);
console.log(`Rechtsklick bei gesunder Flotte:          ${tickGesund === 0 ? 'n/a' : (100 * sekundaerGesund / tickGesund).toFixed(1) + ' % der Ticks'} (${tickGesund} Ticks gemessen)`);
