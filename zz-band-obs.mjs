// Misst die tatsaechliche XP-Rate je Levelband: Wieviele Sekunden braucht ein
// Bot fuer Level L -> L+1, aufgeschluesselt. Beweist oder widerlegt, ob die
// Farm-Leistung mit dem Level mitwaechst.
import WebSocket from 'ws';
import { xpThresholdForLevel, xpAtLevelStart } from '/home/user/project-maze/packages/shared/dist/index.js';

const URL = process.env.WSURL ?? 'ws://127.0.0.1:2712';
const DAUER = Number(process.env.DAUER ?? 420) * 1000;

const ws = new WebSocket(URL);
const start = Date.now();
/** id -> Map(level -> erste Zeit, zu der dieses Level gesehen wurde) */
const ersteSicht = new Map();
const letztesLevel = new Map();

ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'Bandmesser' })));
ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (!msg.leaderboard) return;
  const t = (Date.now() - start) / 1000;
  for (const e of msg.leaderboard) {
    const vor = letztesLevel.get(e.id);
    if (vor !== undefined && e.level < vor) { ersteSicht.delete(e.id); } // Tod -> neuer Lauf
    letztesLevel.set(e.id, e.level);
    let m = ersteSicht.get(e.id);
    if (!m) { m = new Map(); ersteSicht.set(e.id, m); }
    if (!m.has(e.level)) m.set(e.level, t);
  }
});

setTimeout(() => {
  // Dauer je Level ueber alle beobachteten Laeufe mitteln
  const dauern = new Map(); // level -> [sekunden]
  for (const m of ersteSicht.values()) {
    const stufen = [...m.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < stufen.length; i += 1) {
      if (stufen[i + 1][0] !== stufen[i][0] + 1) continue;
      const L = stufen[i][0];
      const s = stufen[i + 1][1] - stufen[i][1];
      if (s <= 0) continue;
      (dauern.get(L) ?? dauern.set(L, []).get(L)).push(s);
    }
  }
  console.log('Level | n | gemessene Sekunden (Median) | XP-Kosten | daraus XP/s');
  const zeilen = [...dauern.entries()].sort((a, b) => a[0] - b[0]);
  for (const [L, arr] of zeilen) {
    if (arr.length < 2) continue;
    const sorted = arr.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const kosten = xpThresholdForLevel(L) - (L <= 1 ? 0 : xpThresholdForLevel(L - 1));
    console.log(`${String(L).padStart(5)} | ${String(arr.length).padStart(2)} | ${med.toFixed(1).padStart(27)} | ${String(kosten).padStart(9)} | ${(kosten / med).toFixed(0).padStart(11)}`);
  }
  process.exit(0);
}, DAUER);
