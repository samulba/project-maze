// Befund 71, Messung A: Ziel-Haltedauern je Stil.
// Aufbau wie im Befund: 1 Bot, 1 Mensch, FFA (freie Sicht), konstant 400 px,
// Schaden abgeschaltet (damagePlayer aussen durch No-op ersetzt, wie der
// Sucher es beschreibt), 3 Minuten Simulationszeit, feste Uhr 25-ms-Ticks.
// Methode: Der Mensch wird nach jedem Tick auf bot.position + (400, 0)
// teleportiert -> Abstand exakt 400, Sicht in FFA immer frei. Gemessen wird
// bot.targetId === menschId je Tick; eine Episode ist ein zusammenhaengender
// Lauf solcher Ticks.
// Kette: volle Produktionskette aus stack.mjs, aber OHNE Direktor (der wuerde
// die Arena sofort auf 18 Bots auffuellen; der Befund misst 1 Bot).
import { buildGame, botState, botTierFor, median } from './stack.mjs';

const STYLES = [
  ['farmer', 0], ['hunter', 1], ['kiter', 2], ['brawler', 4], ['controller', 5]
];
const DT = 0.025, TICK = 25, DUR_MS = 180_000;

for (const [style, idx] of STYLES) {
  const game = buildGame({ botCount: 0, mode: 'ffa', director: false, v2: true });
  const internals = game;
  const botId = internals.createPlayer(`Bot-${style}`, true, botState(idx));
  const humanId = game.addPlayer('Mensch');
  const bot = internals.players.get(botId);
  const human = internals.players.get(humanId);
  human.level = 25;
  human.invulnerableUntil = 0;
  // Schaden global abschalten (aeusserste Schicht) - wie in der Befund-Messung.
  internals.damagePlayer = () => {};

  let now = 1_000_000;
  const episodes = [];
  let current = 0; // Ticks der laufenden Episode
  const gaps = [];
  let gap = 0;
  for (let t = 0; t < DUR_MS / TICK; t += 1) {
    game.step(DT, now);
    now += TICK;
    human.position = { x: bot.position.x + 400, y: bot.position.y };
    human.invulnerable = false;
    human.invulnerableUntil = 0;
    human.dead = false;
    const targeted = bot.bot.targetId === humanId && !bot.dead;
    if (targeted) {
      if (current === 0 && gap > 0) { gaps.push(gap * TICK); gap = 0; }
      current += 1;
    } else {
      if (current > 0) { episodes.push(current * TICK); current = 0; }
      gap += 1;
    }
  }
  if (current > 0) episodes.push(current * TICK);
  const total = episodes.reduce((a, b) => a + b, 0);
  const under1s = episodes.filter((e) => e < 1000).length;
  console.log(JSON.stringify({
    style,
    tier: botTierFor(game, botId),
    episoden: episodes.length,
    medianMs: median(episodes),
    anteilUnter1s: episodes.length ? +(under1s / episodes.length * 100).toFixed(1) : null,
    anteilZeitVisiert: +(total / DUR_MS * 100).toFixed(1),
    medianLueckeMs: median(gaps),
    laengsteEpisodeMs: episodes.length ? Math.max(...episodes) : null
  }));
}
