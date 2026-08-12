/**
 * Misst, wie schnell in der echten Arena Level/Score wachsen.
 * Haengt sich als Client an und liest die In-Game-Bestenliste (Level+Score
 * aller Spieler) im Sekundentakt.
 */
import WebSocket from 'ws';

const URL = process.env.URL ?? 'http://127.0.0.1:2701';
const SEKUNDEN = Number(process.env.SEKUNDEN ?? 180);
const wsUrl = URL.replace(/^http/, 'ws');
const socket = new WebSocket(wsUrl);

const start = Date.now();
const verlauf = [];
let letzte = null;

socket.on('open', () => socket.send(JSON.stringify({ type: 'join', name: 'FarmProbe' })));
socket.on('message', (roh) => {
  const n = JSON.parse(String(roh));
  if (n.type !== 'snapshot') return;
  if (Array.isArray(n.leaderboard) && n.leaderboard.length > 0) letzte = n.leaderboard;
});

const timer = setInterval(() => {
  if (!letzte) return;
  const t = Math.round((Date.now() - start) / 1000);
  const level = letzte.map((e) => e.level);
  const score = letzte.map((e) => e.score);
  verlauf.push({ t, maxLevel: Math.max(...level), maxScore: Math.max(...score), top3Level: level.slice(0, 3), top3Score: score.slice(0, 3) });
}, 5000);

setTimeout(() => {
  clearInterval(timer);
  for (const z of verlauf) {
    console.log(`t=${String(z.t).padStart(3)}s  maxLvl=${String(z.maxLevel).padStart(2)}  maxScore=${String(z.maxScore).padStart(6)}  top3Lvl=${z.top3Level.join(',')}  top3Score=${z.top3Score.join(',')}`);
  }
  socket.close();
  process.exit(0);
}, SEKUNDEN * 1000);
