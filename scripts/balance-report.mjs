import { allClassBalanceMetrics } from '../packages/shared/dist/balance.js';
import { CLASS_DEFINITIONS } from '../packages/shared/dist/index.js';

const number = (value) => value.toFixed(1).padStart(7, ' ');
const rows = allClassBalanceMetrics().sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));

console.log('\nPROJECT MAZE — CLASS BALANCE REPORT\n');
console.log('T  CLASS         ROLE        DPS   BURST   RANGE     EHP     MOVE   DRONES   BODY');
console.log('─'.repeat(88));
for (const entry of rows) {
  const definition = CLASS_DEFINITIONS[entry.id];
  console.log([
    String(entry.tier),
    definition.label.padEnd(13, ' '),
    definition.branch.padEnd(10, ' '),
    number(entry.projectileDps),
    number(entry.burstDamage),
    number(entry.projectileRange),
    number(entry.effectiveDurability),
    number(entry.mobility),
    number(entry.dronePressure),
    number(entry.bodyThreat)
  ].join(' '));
}
console.log('\nDPS is sustained projectile damage. Drone and Impact classes are judged mainly by DRONES/BODY.\n');
