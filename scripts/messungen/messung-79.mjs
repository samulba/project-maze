// Befund 79: Rapid-Farmer koennen die Reparatur nicht ausloesen, weil
// tuneRapidBots den Stillstand wieder aufhebt.
// Messung: 18 Bots, feste Uhr, 4 min je Lauf, 3 Laeufe je Bedingung.
// Je Tick fuer jeden lebenden Farmer-Bot mit Rapid-Klasse:
//   - |velocity| <= REPAIR_MOVE_LIMIT (koennte eine Reparatur starten/halten)
//   - health < 68 % maxHealth (Wunsch-Schwelle der Bot-Steuerung)
// Alle 4 Ticks (100 ms) zusaetzlich ueber den Gameplay-Snapshot:
//   - repairing-Flag (loadout.repairEndsAt > now) + Zaehlung der Zyklen.
import { buildGame } from './stack.mjs';
import { REPAIR_MOVE_LIMIT } from '../../apps/server/dist/loadout-system.js';
import { isRapidClass } from '../../apps/server/dist/signature-rapid.js';

const DT = 0.025, MS = 25;
const MINUTES = 4;

function run(rapidBots) {
  const game = buildGame({ rapidBots });
  let now = Date.now();
  const ticks = MINUTES * 60 * 40;
  let total = 0, slow = 0, hurt = 0;
  let gpSamples = 0, gpRepairing = 0, cycles = 0;
  const wasRepairing = new Map();
  let selfId = null;
  for (const p of game.players.values()) if (p.bot) { selfId = p.id; break; }
  for (let t = 0; t < ticks; t += 1) {
    game.step(DT, now); now += MS;
    for (const p of game.players.values()) {
      if (!p.bot || p.bot.style !== 'farmer' || p.dead) continue;
      if (!isRapidClass(p.playerClass)) continue;
      total += 1;
      if (Math.hypot(p.velocity.x, p.velocity.y) <= REPAIR_MOVE_LIMIT) slow += 1;
      if (p.health < 0.68 * p.maxHealth) hurt += 1;
    }
    if (t % 4 === 0) {
      const snap = game.snapshot(selfId, now);
      for (const sp of snap.players) {
        const rt = game.players.get(sp.id);
        if (!rt?.bot || rt.bot.style !== 'farmer' || rt.dead || !isRapidClass(rt.playerClass)) continue;
        gpSamples += 1;
        const rep = snap.gameplay?.[sp.id]?.repairing === true;
        if (rep) gpRepairing += 1;
        if (rep && !wasRepairing.get(sp.id)) cycles += 1;
        wasRepairing.set(sp.id, rep);
      }
    }
  }
  return {
    slowPct: (100 * slow) / total,
    hurtPct: (100 * hurt) / total,
    repairingPct: (100 * gpRepairing) / gpSamples,
    cycles, total
  };
}

for (const rapidBots of [true, false]) {
  console.log(`== tuneRapidBots ${rapidBots ? 'AN (Produktion)' : 'AUS'} — 3 Laeufe a ${MINUTES} min ==`);
  const rs = [];
  for (let k = 0; k < 3; k += 1) {
    const r = run(rapidBots);
    rs.push(r);
    console.log(`  Lauf ${k + 1}: langsam ${r.slowPct.toFixed(2)} % | unter 68 % HP ${r.hurtPct.toFixed(2)} % | repairing ${r.repairingPct.toFixed(2)} % | Reparaturzyklen ${r.cycles} | Ticks ${r.total}`);
  }
  const mean = (f) => (rs.reduce((s, r) => s + f(r), 0) / rs.length).toFixed(2);
  console.log(`  MITTEL: langsam ${mean((r) => r.slowPct)} % | unter 68 % HP ${mean((r) => r.hurtPct)} % | repairing ${mean((r) => r.repairingPct)} % | Zyklen ${mean((r) => r.cycles)}`);
}
