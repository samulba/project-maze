/**
 * Pro-Lauf-Profile (Klassen 4.2, Stufe 4, Schritt 2) – Storm über die volle
 * Produktions-Tuning-Kette (nicht nur tuneCombatScaling wie in den Unit-
 * Tests): prüft, dass keine der ~25 anderen Schichten (Perks, Signaturen,
 * Familien-Upgrades) die pro-Lauf-Werte überschreibt oder verwirft.
 *
 *   npm run build && node scripts/messungen/messung-pro-lauf-profile.mjs
 */
import { buildGame } from './stack.mjs';
import { applyDebugBuild } from '../../apps/server/dist/debug-lab.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';

const DT = 1 / 40;

const game = buildGame({ botCount: 0, mode: 'ffa', director: false });
const id = game.addPlayer('Storm-Test');
applyDebugBuild(game, id, { playerClass: 'storm', level: 45, preset: 'balanced' });
const spieler = game.players.get(id);
spieler.invulnerable = false;
spieler.invulnerableUntil = 0;
spieler.position = { x: 3000, y: 3000 };
spieler.velocity = { x: 0, y: 0 };
spieler.move = { x: 0, y: 0 };
spieler.aim = { x: 400, y: 0 };
spieler.cooldown = 0;
spieler.primary = true;

const stats = tunedStatsFor(spieler);
console.log(`Storm L45 (balanced): damage=${stats.damage.toFixed(2)} projectileSpeed=${stats.projectileSpeed.toFixed(1)} barrelCount=${stats.barrelCount}`);

const now = Date.now();
game.step(DT, now);
spieler.primary = false;

const schuesse = [...game.projectiles.values()].filter((p) => p.ownerId === id);
console.log(`\n${schuesse.length} Projektile durch die volle Produktions-Kette:`);
let gesamtschaden = 0;
for (const p of schuesse.sort((a, b) => a.damage - b.damage)) {
  const tempo = Math.hypot(p.velocity.x, p.velocity.y);
  gesamtschaden += p.damage;
  console.log(`  Schaden ${p.damage.toFixed(2).padStart(7)}  (${(p.damage / stats.damage).toFixed(2)}x)   Tempo ${tempo.toFixed(1).padStart(7)}  (${(tempo / stats.projectileSpeed).toFixed(2)}x)`);
}
console.log(`\nGesamtschaden Salve: ${gesamtschaden.toFixed(2)} — nominal (damage*barrelCount): ${(stats.damage * stats.barrelCount).toFixed(2)}`);
console.log(gesamtschaden.toFixed(4) === (stats.damage * stats.barrelCount).toFixed(4) ? 'OK: identisch.' : 'ABWEICHUNG!');
