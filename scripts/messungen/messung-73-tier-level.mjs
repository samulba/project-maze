// Befund 73: Tier haengt am Spawn-Zaehler, nicht am Level.
// (a) Code-Beleg wird im Bericht gefuehrt (bot-brain.ts:251, :338).
// (b) Messung: 18 Bots, Maze, keine Menschen, volle Produktionskette inkl.
//     Direktor. Levelspanne nach 3,5 und 4,5 min; dazu je Bot Tier und
//     Profilwerte (bot.reactionMs/aimError werden in brainFor aus dem
//     Tier-Profil gesetzt) am Anfang und am Ende - inkl. ueber Tode hinweg.
import { buildGame, botTierFor } from './stack.mjs';
import { TIER_PROFILES } from '../../apps/server/dist/bot-brain.js';

const DT = 0.025, TICK = 25;
const game = buildGame({ botCount: 18, mode: 'maze', director: true, v2: true });
const internals = game;

let now = 1_000_000;
const bots = () => [...internals.players.values()].filter((p) => p.bot);

// Einen Tick laufen lassen, damit alle Gehirne existieren.
game.step(DT, now); now += TICK;
const start = bots().map((p) => ({
  id: p.id, name: p.name, tier: botTierFor(game, p.id), level: p.level,
  reactionMs: p.bot.reactionMs, aimError: p.bot.aimError
}));

const levelsAt = {};
const sample = (label) => {
  const ls = bots().map((p) => p.level);
  levelsAt[label] = { min: Math.min(...ls), max: Math.max(...ls), spanne: Math.max(...ls) - Math.min(...ls) };
};

let deathsSeen = 0;
const wasDead = new Map();
for (let t = 1; t <= (4.5 * 60000) / TICK; t += 1) {
  game.step(DT, now); now += TICK;
  for (const p of bots()) {
    const prev = wasDead.get(p.id) ?? false;
    if (p.dead && !prev) deathsSeen += 1;
    wasDead.set(p.id, p.dead);
  }
  if (t === (3.5 * 60000) / TICK) sample('nach3.5min');
}
sample('nach4.5min');

const end = bots().map((p) => ({
  id: p.id, name: p.name, tier: botTierFor(game, p.id), level: p.level,
  reactionMs: p.bot.reactionMs, aimError: p.bot.aimError
}));

// Tier/Profil-Konstanz je Bot (nur Bots, die es am Anfang schon gab)
const startById = new Map(start.map((s) => [s.id, s]));
let tierChanged = 0, profileChanged = 0, levelChanged = 0;
for (const e of end) {
  const s = startById.get(e.id);
  if (!s) continue;
  if (s.tier !== e.tier) tierChanged += 1;
  if (s.reactionMs !== e.reactionMs || s.aimError !== e.aimError) profileChanged += 1;
  if (s.level !== e.level) levelChanged += 1;
}

const tierMix = {};
for (const e of end) tierMix[e.tier] = (tierMix[e.tier] ?? 0) + 1;

console.log(JSON.stringify({
  levelsAt,
  botTodesEreignisse: deathsSeen,
  botsAmEnde: end.length,
  tierWechsel: tierChanged,
  profilWechsel: profileChanged,
  botsMitLevelaenderung: levelChanged,
  tierMix,
  beispiele: end.slice(0, 6).map((e) => ({
    name: e.name, tier: e.tier, level: e.level,
    profil: TIER_PROFILES[e.tier]
  }))
}, null, 1));
