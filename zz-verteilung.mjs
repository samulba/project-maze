import WebSocket from 'ws';
const ws = new WebSocket(process.env.WSURL ?? 'ws://127.0.0.1:2712');
ws.on('open', () => ws.send(JSON.stringify({ type: 'join', name: 'Neuling' })));
let n = 0;
ws.on('message', (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (!m.leaderboard) return;
  if (++n < 40) return;
  const lv = m.leaderboard.map((e) => e.level).sort((a, b) => a - b);
  const med = lv[Math.floor(lv.length / 2)];
  console.log('Eintraege im Leaderboard:', lv.length);
  console.log('Level:', lv.join(' '));
  console.log('Median:', med, 'Max:', lv[lv.length - 1], 'Min:', lv[0]);
  console.log('Anteil >= L20:', (lv.filter((x) => x >= 20).length / lv.length * 100).toFixed(0) + ' %');
  process.exit(0);
});
