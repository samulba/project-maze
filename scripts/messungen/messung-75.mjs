// Befund 75: Bot-Bestand deterministisch, 12 Archetypen, SIEGE/AEGIS fehlen.
// Enumeration mit dem echten Code: Arena bauen, einen Tick laufen lassen
// (Gehirne entstehen), dann Stil/Tier/Klassenpfad je Bot auslesen.
// Zweiter Bau als Determinismus-Gegenprobe.
import { buildGame } from './stack.mjs';
import { botTierFor, BOT_CLASS_PATHS } from '../../apps/server/dist/bot-brain.js';
import { CLASS_DEFINITIONS } from '../../packages/shared/dist/index.js';

const DT = 0.025, MS = 25;

function enumerate() {
  const game = buildGame({ rapidBots: true });
  let now = Date.now();
  game.step(DT, now);
  const rows = [];
  let i = 0;
  for (const p of game.players.values()) {
    if (!p.bot) continue;
    const path = p.bot.classPath;
    const family = CLASS_DEFINITIONS[path[path.length - 1]].branch;
    rows.push({
      i: i++, name: p.name, style: p.bot.style,
      tier: botTierFor(game, p.id), path: path.join('>'), family
    });
  }
  return rows;
}

const a = enumerate();
const b = enumerate();

console.log('== Bestand (Bau 1) ==');
for (const r of a) console.log(`#${String(r.i).padStart(2)} ${r.style.padEnd(10)} ${String(r.tier).padEnd(7)} ${r.family.padEnd(8)} ${r.path}`);

const key = (r) => `${r.style}|${r.tier}|${r.path}`;
const counts = new Map();
for (const r of a) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
const dups = [...counts.entries()].filter(([, n]) => n > 1);
console.log(`\nverschiedene Archetypen (Stil|Tier|Pfad): ${counts.size} von ${a.length}`);
console.log(`exakt doppelt besetzte Paare: ${dups.length}`);
for (const [k, n] of dups) console.log(`  ${n}x ${k}`);

const familiesPresent = new Set(a.map((r) => r.family));
// Auch Zwischenklassen der Pfade zaehlen (Familie kann innerhalb des Pfads wechseln? pruefen):
const familiesAll = new Set();
for (const r of a) for (const c of r.path.split('>')) familiesAll.add(CLASS_DEFINITIONS[c].branch);
const EIGHT = ['rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis'];
console.log(`\nvertretene Familien (Apex): ${[...familiesPresent].sort().join(', ')}`);
console.log(`vertretene Familien (alle Pfadklassen): ${[...familiesAll].sort().join(', ')}`);
console.log(`fehlende Familien: ${EIGHT.filter((f) => !familiesAll.has(f)).join(', ') || '-'}`);

console.log('\n== Kopplungen Periode 5/10 ==');
const tiersByStyle = {};
for (const r of a) (tiersByStyle[r.style] ??= new Set()).add(r.tier);
for (const [s, t] of Object.entries(tiersByStyle)) console.log(`  ${s}: Tiers {${[...t].join(', ')}}`);

console.log('\n== Pfade in BOT_CLASS_PATHS, die nie gezogen werden ==');
for (const [style, paths] of Object.entries(BOT_CLASS_PATHS)) {
  const drawn = new Set(a.filter((r) => r.style === style).map((r) => r.path));
  for (const p of paths) {
    const j = p.join('>');
    const fam = CLASS_DEFINITIONS[p[p.length - 1]].branch;
    if (!drawn.has(j)) console.log(`  ${style}: NICHT gezogen: ${j} (${fam})`);
  }
}

console.log('\n== Determinismus: Bau 2 identisch? ==');
const same = a.length === b.length && a.every((r, i) => key(r) === key(b[i]));
console.log(same ? 'IDENTISCH (Bit fuer Bit dieselbe Belegung)' : 'ABWEICHEND');
if (!same) for (let i = 0; i < a.length; i += 1) if (key(a[i]) !== key(b[i])) console.log(`  #${i}: ${key(a[i])}  vs  ${key(b[i])}`);
