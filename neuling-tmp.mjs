/**
 * Simuliert einen NEULING: joint, sucht die naechste Form, faehrt hin, feuert.
 * Kein Kampf gegen Spieler, kein Upgrade-Verteilen (ein Neuling weiss noch
 * nicht, was die Zahlen bedeuten). Protokolliert Level/Score/HP im Sekundentakt.
 */
import WebSocket from 'ws';

const URL = process.env.URL ?? 'ws://127.0.0.1:2701';
const DAUER = Number(process.env.DAUER ?? 600);
const UPGRADE = process.env.UPGRADE === 'true';
const NAME = process.env.NAME ?? 'Neuling';

const socket = new WebSocket(URL);
let selfId = null;
let self = null;
let shapes = [];
let started = 0;
const events = [];
const levelAt = new Map();
let lastLevel = 1;
let lastDead = false;
let deaths = 0;
let sentUpgrades = 0;
let firstClassChosen = false;
let seq = 0;

const log = (t, text) => events.push({ t: Number(t.toFixed(1)), text });

socket.on('open', () => { started = Date.now(); socket.send(JSON.stringify({ type: 'join', name: NAME })); });

socket.on('message', (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.type === 'welcome') { selfId = String(m.selfId); log(0, `welcome selfId=${m.selfId}`); return; }
  if (m.type === 'error') { log((Date.now()-started)/1000, `SERVERFEHLER: ${m.message}`); return; }
  if (m.type !== 'snapshot') return;
  const t = (Date.now() - started) / 1000;
  const me = m.players.find((p) => String(p.id) === String(m.selfId ?? selfId));
  if (!me) return;
  self = me;
  shapes = m.shapes ?? [];
  if (me.level > lastLevel) {
    for (let l = lastLevel + 1; l <= me.level; l++) if (!levelAt.has(l)) levelAt.set(l, t);
    log(t, `LEVEL ${me.level} (score ${me.score}, class ${me.playerClass})`);
    lastLevel = me.level;
  }
  if (me.dead && !lastDead) { deaths++; log(t, `TOD #${deaths} durch "${me.killerName}" auf Level ${me.deathLevel} -> Neustart Level ${me.respawnLevel}, Score ${me.score}`); }
  if (!me.dead && lastDead) { log(t, `RESPAWN auf Level ${me.level}, Klasse ${me.playerClass}, Punkte ${me.availablePoints}, Score ${me.score}`); lastLevel = me.level; }
  lastDead = me.dead;
});

socket.on('close', (c) => { fertig(c); });

function fertig(code) {
  const zeilen = [];
  zeilen.push(`# Neuling-Lauf (${NAME}) close=${code ?? '-'}`);
  for (const e of events) zeilen.push(`${String(e.t).padStart(6)}s  ${e.text}`);
  zeilen.push('--- Level-Zeitpunkte ---');
  for (const [l, t] of [...levelAt.entries()].sort((a,b)=>a[0]-b[0])) zeilen.push(`Level ${l}: ${t.toFixed(1)}s`);
  console.log(zeilen.join('\n'));
  process.exit(0);
}

// Steuerschleife: 20 Hz
const timer = setInterval(() => {
  if (!self || socket.readyState !== 1) return;
  const t = (Date.now() - started) / 1000;
  if (t > DAUER) { clearInterval(timer); fertig('ende'); return; }

  if (self.dead) {
    socket.send(JSON.stringify({ type: 'respawn' }));
    return;
  }
  // erste Klassenwahl annehmen, sobald moeglich (Neuling klickt die erste Karte)
  if (self.level >= 5 && self.playerClass === "core") {
    socket.send(JSON.stringify({ type: 'chooseClass', playerClass: 'rapid' }));
    firstClassChosen = true;
    if (!firstClassChosen) { firstClassChosen = true; log(t, 'Klasse gewaehlt: rapid'); }
  }
  if (UPGRADE && self.availablePoints > 0 && sentUpgrades < 200) {
    sentUpgrades++;
    socket.send(JSON.stringify({ type: 'upgrade', upgrade: ['damage','reload','maxHealth','moveSpeed'][sentUpgrades % 4] }));
  }

  // naechste Form suchen
  let best = null; let bestD = Infinity;
  for (const s of shapes) {
    const d = Math.hypot(s.position.x - self.position.x, s.position.y - self.position.y);
    if (d < bestD) { bestD = d; best = s; }
  }
  let move = { x: 0, y: 0 };
  let aim = { x: 650, y: 0 };
  if (best) {
    const dx = best.position.x - self.position.x;
    const dy = best.position.y - self.position.y;
    const len = Math.hypot(dx, dy) || 1;
    aim = { x: (dx/len) * 650, y: (dy/len) * 650 };
    if (bestD > 220) move = { x: dx/len, y: dy/len };
  }
  seq++;
  socket.send(JSON.stringify({ type: 'input', sequence: seq, move, aim, primary: true, secondary: false }));
}, 50);
