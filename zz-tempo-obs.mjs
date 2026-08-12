// Haengt sich als Zuschauer-Client an eine laufende Arena und protokolliert,
// wie schnell die Bots leveln. Bots farmen mit echter KI -- das ist die
// empirische Farm-Rate, nicht meine Schaetzung.
import WebSocket from 'ws';

const URL = process.env.WSURL ?? 'ws://127.0.0.1:2711';
const DAUER = Number(process.env.DAUER ?? 180) * 1000;

const ws = new WebSocket(URL);
const start = Date.now();
const historie = [];
let welcome = null;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'join', name: 'Beobachter' }));
});

ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.type === 'welcome') { welcome = msg; return; }
  if (msg.type !== 'snapshot' && msg.type !== 'state') return;
  const lb = msg.leaderboard ?? msg.state?.leaderboard;
  if (!lb) return;
  const t = (Date.now() - start) / 1000;
  historie.push({ t, top: lb.slice(0, 8).map((e) => ({ n: e.name, l: e.level, s: e.score, c: e.playerClass })) });
});

setTimeout(() => {
  const punkte = [5, 15, 30, 60, 90, 120, 150, 175].map((z) => historie.filter((h) => h.t <= z).pop()).filter(Boolean);
  for (const p of punkte) {
    console.log(`t=${p.t.toFixed(0)}s  ` + p.top.map((e) => `${e.n}:L${e.l}/${e.s}`).join('  '));
  }
  const letzte = historie[historie.length - 1];
  if (letzte) {
    console.log('\nZuletzt:', JSON.stringify(letzte.top, null, 1));
    const maxL = Math.max(...letzte.top.map((e) => e.l));
    console.log(`Nach ${letzte.t.toFixed(0)} s: hoechstes Bot-Level ${maxL}, hoechster Score ${Math.max(...letzte.top.map((e)=>e.s))}`);
  }
  process.exit(0);
}, DAUER);
