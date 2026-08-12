// Befund 72: Bots kaufen nie maxHealth/regen.
// Teil A: je Stil den effektiven Bot-Upgrade-Pfad und die Mindestpunkte fuer
//         den ersten maxHealth-Punkt mit dem ECHTEN spendBotPoints ausmessen.
// Teil B: tunedStatsFor-Vergleich (10 Punkte vs 0) fuer vortex/eclipse/gatling.
// Teil C: Arena-Lauf 18 Bots, feste Uhr, ~6 min: wird upgrades.maxHealth/regen je >0?
import { buildGame } from './stack.mjs';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';
import { GAME, EMPTY_UPGRADES, upgradePointsAtLevel } from '../../packages/shared/dist/index.js';

const DT = 0.025, MS = 25;

// ---------- Teil A ----------
console.log('== Teil A: effektiver Pfad + Mindestpunkte fuer maxHealth (echter spendBotPoints) ==');
{
  const game = buildGame({ rapidBots: true });
  let now = Date.now();
  game.step(DT, now); now += MS; // Gehirne anlegen (Klassenpfade werden zugewiesen)
  const internals = game; // JS: private Methoden sind erreichbar
  const players = [...internals.players.values()].filter((p) => p.bot);

  const styles = ['farmer', 'hunter', 'kiter', 'brawler', 'controller'];
  for (const style of styles) {
    const p = players.find((q) => q.bot.style === style);
    if (!p) { console.log(style, ': kein Bot gefunden'); continue; }
    // Bot in einen Zustand versetzen, in dem nichts ablehnt ausser der Pfadlogik:
    // Apex-Klasse des zugewiesenen Pfads, damit Branch offen und nicht 'core'.
    p.dead = false;
    p.playerClass = p.bot.classPath[p.bot.classPath.length - 1];
    // Effektiven Pfad rekonstruieren: Punkt fuer Punkt vergeben und notieren,
    // welcher Slot waechst.
    p.upgrades = EMPTY_UPGRADES();
    const sequence = [];
    for (let k = 0; k < 120; k += 1) {
      const before = { ...p.upgrades };
      p.availablePoints = 1;
      internals.spendBotPoints(p);
      const changed = Object.keys(p.upgrades).find((u) => p.upgrades[u] !== before[u]);
      if (!changed) break;
      sequence.push(changed);
    }
    const blocks = [];
    for (const u of sequence) {
      if (blocks.length && blocks[blocks.length - 1].u === u) blocks[blocks.length - 1].n += 1;
      else blocks.push({ u, n: 1 });
    }
    const idx = blocks.findIndex((b) => b.u === 'maxHealth');
    const pointsBefore = blocks.slice(0, idx < 0 ? blocks.length : idx).reduce((s, b) => s + b.n, 0);
    const neededPoints = idx < 0 ? Infinity : pointsBefore + 1;
    const neededLevel = neededPoints + 1; // upgradePointsAtLevel = level - 1
    console.log(`${style}: Pfad = ${blocks.map((b) => `${b.u}x${b.n}`).join(' > ')}`);
    console.log(`  maxHealth an Blockindex ${idx} | noetige Punkte ${neededPoints} | noetiges Level ${neededLevel} | maxLevel ${GAME.maxLevel} -> ${neededLevel > GAME.maxLevel ? 'UNERREICHBAR' : 'erreichbar'}`);
  }
  console.log(`Kontrolle upgradePointsAtLevel(60) = ${upgradePointsAtLevel(60)}`);
}

// ---------- Teil B ----------
console.log('\n== Teil B: tunedStatsFor, 10 Punkte maxHealth/regen vs 0 (Level 40, standard-Frame) ==');
for (const cls of ['vortex', 'eclipse', 'gatling']) {
  const mk = (mh, rg) => tunedStatsFor({ playerClass: cls, level: 40, passiveModifier: 'standard', upgrades: { ...EMPTY_UPGRADES(), maxHealth: mh, regen: rg } });
  const voll = mk(10, 10), leer = mk(0, 0);
  console.log(`${cls}: maxHealth ${voll.maxHealth} vs ${leer.maxHealth} | regen ${voll.regen.toFixed(1)} vs ${leer.regen.toFixed(1)}`);
}

// ---------- Teil C ----------
console.log('\n== Teil C: Arena-Lauf 18 Bots, feste Uhr, 6 min ==');
{
  const game = buildGame({ rapidBots: true });
  let now = Date.now();
  const start = now;
  const everPositive = new Map(); // id -> {maxHealth, regen}
  const minutes = 6;
  const ticks = minutes * 60 * 40;
  for (let t = 0; t < ticks; t += 1) {
    game.step(DT, now); now += MS;
    if (t % 40 === 0) {
      for (const p of game.players.values()) {
        if (!p.bot) continue;
        const e = everPositive.get(p.id) ?? { maxHealth: 0, regen: 0, level: 0, style: p.bot.style };
        e.maxHealth = Math.max(e.maxHealth, p.upgrades.maxHealth);
        e.regen = Math.max(e.regen, p.upgrades.regen);
        e.level = Math.max(e.level, p.level);
        everPositive.set(p.id, e);
      }
    }
  }
  const entries = [...everPositive.values()];
  const levels = entries.map((e) => e.level);
  console.log(`Laufzeit ${minutes} min fester Uhr | beobachtete Bots (inkl. Director-Nachschub): ${entries.length}`);
  console.log(`Levelspanne am Ende der Beobachtung: ${Math.min(...levels)} .. ${Math.max(...levels)}`);
  const withHp = entries.filter((e) => e.maxHealth > 0);
  const withRegen = entries.filter((e) => e.regen > 0);
  console.log(`Bots mit upgrades.maxHealth > 0: ${withHp.length} (${withHp.map((e) => `${e.style}@L${e.level}:hp${e.maxHealth}`).join(', ') || '-'})`);
  console.log(`Bots mit upgrades.regen    > 0: ${withRegen.length} (${withRegen.map((e) => `${e.style}@L${e.level}:rg${e.regen}`).join(', ') || '-'})`);
  const byStyle = {};
  for (const e of entries) {
    byStyle[e.style] ??= { n: 0, maxLevel: 0, hp: 0 };
    byStyle[e.style].n += 1;
    byStyle[e.style].maxLevel = Math.max(byStyle[e.style].maxLevel, e.level);
    byStyle[e.style].hp += e.maxHealth > 0 ? 1 : 0;
  }
  console.log('je Stil:', JSON.stringify(byStyle));
}
