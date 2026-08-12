// Befund 71, Messung B: volle Arena. 18 Bots, Maze, Level-25-Mensch, 5 min.
// Volle Produktionskette inkl. Direktor, echter Schaden (Bot-gegen-Bot-Kills
// und calmUntil bleiben also realistisch). Der Mensch wird nach jedem Tick
// geheilt; stirbt er in einem Tick-Burst trotzdem, wird er sofort wieder
// eingesetzt und gezaehlt. Er wandert per Wegpunkt-Steuerung durchs Maze und
// schiesst nicht (wie in der Befund-Messung: der Mensch ist passives Ziel).
// Gemessen je Tick: Zahl lebender Bots mit bot.targetId === menschId.
import { buildGame, median } from './stack.mjs';

const DT = 0.025, TICK = 25, DUR_MS = 300_000;
const game = buildGame({ botCount: 18, mode: 'maze', director: true, v2: true });
const internals = game;
const humanId = game.addPlayer('Mensch');
const human = internals.players.get(humanId);
human.level = 25;
human.invulnerableUntil = 0;

let now = 1_000_000;
let waypoint = { x: 4500, y: 3000 };
let lastPos = { ...human.position };
let lastMoveCheck = now;
const pickWaypoint = () => ({ x: 500 + Math.random() * 8000, y: 500 + Math.random() * 5000 });

let deaths = 0;
const counts = [0, 0, 0, 0, 0, 0]; // Ticks mit n Angreifern (Deckel: 2, Puffer bis 5)
// Episoden je Bot-ID
const open = new Map(); // botId -> Tickzahl der laufenden Episode
const episodes = [];
let acquisitions = 0;

for (let t = 0; t < DUR_MS / TICK; t += 1) {
  // Mensch steuern
  const dx = waypoint.x - human.position.x, dy = waypoint.y - human.position.y;
  const d = Math.hypot(dx, dy);
  if (d < 120) waypoint = pickWaypoint();
  human.move = d > 0 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
  human.primary = false;

  game.step(DT, now);
  now += TICK;

  // Mensch am Leben halten
  human.invulnerable = false;
  human.invulnerableUntil = 0;
  if (human.dead) {
    deaths += 1;
    internals.respawn(human, now);
    human.level = 25;
    human.invulnerableUntil = 0;
    waypoint = pickWaypoint();
  }
  human.health = human.maxHealth;

  // Steckt er fest? (alle 2 s pruefen)
  if (now - lastMoveCheck > 2000) {
    if (Math.hypot(human.position.x - lastPos.x, human.position.y - lastPos.y) < 30) waypoint = pickWaypoint();
    lastPos = { ...human.position };
    lastMoveCheck = now;
  }

  // Angreifer zaehlen
  let n = 0;
  const nowTargeting = new Set();
  for (const p of internals.players.values()) {
    if (!p.bot || p.dead) continue;
    if (p.bot.targetId === humanId) { n += 1; nowTargeting.add(p.id); }
  }
  counts[Math.min(n, 5)] += 1;
  // Episoden fortschreiben
  for (const id of nowTargeting) {
    if (!open.has(id)) { open.set(id, 0); acquisitions += 1; }
    open.set(id, open.get(id) + 1);
  }
  for (const [id, ticks] of [...open]) {
    if (!nowTargeting.has(id)) { episodes.push(ticks * TICK); open.delete(id); }
  }
}
for (const ticks of open.values()) episodes.push(ticks * TICK);

const totalTicks = DUR_MS / TICK;
const under1s = episodes.filter((e) => e < 1000).length;
console.log(JSON.stringify({
  dauerMin: DUR_MS / 60000,
  menschTode: deaths,
  anteilZeitOhneAngreifer: +(counts[0] / totalTicks * 100).toFixed(1),
  anteilZeitEinAngreifer: +(counts[1] / totalTicks * 100).toFixed(1),
  anteilZeitZweiPlus: +((totalTicks - counts[0] - counts[1]) / totalTicks * 100).toFixed(1),
  episoden: episodes.length,
  zielaufnahmen: acquisitions,
  medianEpisodeMs: median(episodes),
  anteilEpisodenUnter1s: +(under1s / episodes.length * 100).toFixed(1)
}, null, 1));
