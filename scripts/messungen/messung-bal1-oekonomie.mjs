/**
 * Punkte-Ökonomie (BAL1) – Sam, 13.08.: „Die Tanks sind noch immer viel zu
 * unbalanced – als LVL 60 Vortex fühlt man sich unbesiegbar: mega schnell,
 * mega viel HP, riesiger Spread, alles. Überall fehlt das komplette
 * Balancing."
 *
 * Gemessen (siehe BAL2) war der Kern kein Klassenwert, sondern die Punkte
 * selbst: voll investiert bringt Schaden+Nachladen zusammen 2,84x DPS, aber
 * volles Leben nur 1,90x und volles Tempo nur 1,30x. Ein Offensiv-Build
 * lohnt sich strukturell mehr als derselbe Punkteeinsatz in Überleben oder
 * Flucht – vor allem, weil DPS aus ZWEI Feldern zusammenmultipliziert
 * (Schaden × Nachladen), Leben und Tempo aber je nur aus einem.
 *
 * Vier Koeffizienten wurden angepasst (kein Klassenwert, gilt gleich für
 * jede Klasse – "Punkte-Ökonomie glätten", nicht "Vortex nerfen"):
 *   Schaden je Punkt        0,07  -> 0,055   (combat-tuning.ts)
 *   Nachladen je Punkt      0,95  -> 0,965   (combat-tuning.ts, Exponent)
 *   Max. Leben je Punkt     0,09  -> 0,125   (combat-tuning.ts)
 *   Tempo je Punkt          0,03  -> 0,05    (movementStatsFor, shared)
 *
 *   npm run build && node scripts/messungen/messung-bal1-oekonomie.mjs
 */
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';
import { tuneProjectileSpeed } from '../../apps/server/dist/projectile-speed.js';
import { EMPTY_UPGRADES, GAME } from '../../packages/shared/dist/index.js';

tuneProjectileSpeed({}, true);

const dps = (stats) => (stats.barrelCount * stats.damage) / stats.reload;

console.log('=== Punkte-Ökonomie: voll investiert vs. blank, je Klasse (L60) ===\n');
for (const id of ['vortex', 'core', 'fortress']) {
  const blank = EMPTY_UPGRADES();
  const maxed = EMPTY_UPGRADES();
  for (const key of Object.keys(maxed)) maxed[key] = GAME.maxUpgradeLevel;

  const s0 = tunedStatsFor({ playerClass: id, level: 60, upgrades: blank });
  const s1 = tunedStatsFor({ playerClass: id, level: 60, upgrades: maxed });

  console.log(`${id}:`);
  console.log(`  DPS:   ${dps(s0).toFixed(1)} -> ${dps(s1).toFixed(1)}  (${(dps(s1) / dps(s0)).toFixed(2)}x)`);
  console.log(`  Leben: ${s0.maxHealth} -> ${s1.maxHealth}  (${(s1.maxHealth / s0.maxHealth).toFixed(2)}x)`);
  console.log(`  Tempo: ${s0.moveSpeed.toFixed(0)} -> ${s1.moveSpeed.toFixed(0)}  (${(s1.moveSpeed / s0.moveSpeed).toFixed(2)}x)\n`);
}

console.log('Vorher (gemessen, siehe BAL2-Notiz): DPS 2,84x · Leben 1,90x · Tempo 1,30x');
console.log('Jetzt:                               DPS 2,21x · Leben 2,25x · Tempo 1,50x');
console.log('\nDPS und Leben liegen jetzt praktisch gleichauf statt 0,94 Punkte auseinander;');
console.log('Tempo bleibt bewusst niedriger (Fluchtgeschwindigkeit soll kein Selbstzweck sein),');
console.log('ist aber von 1,30x auf 1,50x spürbar gewachsen.');
