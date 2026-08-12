// Verfolgt einzelne Spieler ueber die Leaderboard-IDs: hoechstes je erreichtes
// Level, Level-Abstuerze (= Tode), und wie lange ein "Leben" traegt.
import WebSocket from 'ws';

const URL = process.env.WSURL ?? 'ws://127.0.0.1:2712';
const DAUER = Number(process.env.DAUER ?? 600) * 1000;

const ws = new WebSocket(URL);
const start = Date.now();
/** id -> { name, maxLevel, letztes, tode, ersteSicht, laufStart, besterLauf } */
const spieler = new Map();
let globalMax = 0;
let globalMaxAt = 0;

ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'Chronist' })));
ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
  const lb = msg.leaderboard;
  if (!lb) return;
  const t = (Date.now() - start) / 1000;
  for (const e of lb) {
    let s = spieler.get(e.id);
    if (!s) { s = { name: e.name, maxLevel: e.level, letztes: e.level, tode: 0, laufStart: t, besterLauf: 0, besterLaufLevel: e.level }; spieler.set(e.id, s); }
    if (e.level < s.letztes) {
      s.tode += 1;
      const dauer = t - s.laufStart;
      if (dauer > s.besterLauf) { s.besterLauf = dauer; s.besterLaufLevel = s.letztes; }
      s.laufStart = t;
    }
    s.letztes = e.level;
    if (e.level > s.maxLevel) s.maxLevel = e.level;
    if (e.level > globalMax) { globalMax = e.level; globalMaxAt = t; }
  }
});

setTimeout(() => {
  const liste = [...spieler.values()].sort((a, b) => b.maxLevel - a.maxLevel);
  console.log(`Beobachtet ${(DAUER/1000)} s, ${spieler.size} Spieler-IDs gesehen.`);
  console.log(`Hoechstes je gesehenes Level: ${globalMax} (bei t=${globalMaxAt.toFixed(0)}s)`);
  console.log('\nName        maxLvl  Tode  laengstes Leben (s) -> Level dabei');
  for (const s of liste.slice(0, 20)) {
    console.log(`${s.name.padEnd(11)} ${String(s.maxLevel).padStart(6)} ${String(s.tode).padStart(5)} ${s.besterLauf.toFixed(0).padStart(19)} -> L${s.besterLaufLevel}`);
  }
  const mitTod = liste.filter((s) => s.tode > 0);
  if (mitTod.length) {
    const schnitt = mitTod.reduce((a, s) => a + s.besterLauf, 0) / mitTod.length;
    console.log(`\nDurchschnittlich laengstes Leben: ${schnitt.toFixed(0)} s bei ${mitTod.length} Spielern mit mind. 1 Tod`);
    const lvlSchnitt = mitTod.reduce((a, s) => a + s.besterLaufLevel, 0) / mitTod.length;
    console.log(`Durchschnittliches Level am Ende des laengsten Lebens: L${lvlSchnitt.toFixed(1)}`);
  }
  process.exit(0);
}, DAUER);
