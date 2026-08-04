import { allClassBalanceMetrics } from '../packages/shared/dist/balance.js';
import { CLASS_DEFINITIONS } from '../packages/shared/dist/index.js';
import {
  ACTIVE_MODULE_DEFINITIONS,
  ACTIVE_MODULE_IDS,
  PASSIVE_MODIFIER_DEFINITIONS,
  PASSIVE_MODIFIER_IDS
} from '../packages/shared/dist/gameplay.js';

const number = (value) => value.toFixed(1).padStart(7, ' ');
const percent = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`.padStart(6, ' ');
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

console.log('\nCORE MODULES\n');
console.log('MODULE             ROLE        COOLDOWN   ACTIVE');
console.log('─'.repeat(54));
for (const id of ACTIVE_MODULE_IDS) {
  const module = ACTIVE_MODULE_DEFINITIONS[id];
  console.log([
    module.label.padEnd(18, ' '),
    module.role.padEnd(10, ' '),
    `${(module.cooldownMs / 1000).toFixed(1)}s`.padStart(8, ' '),
    `${module.activeMs}ms`.padStart(8, ' ')
  ].join(' '));
}

console.log('\nPASSIVE FRAME TRADE-OFFS\n');
console.log('FRAME                  HP    MOVE  FIRE RATE  PROJECTILE');
console.log('─'.repeat(62));
for (const id of PASSIVE_MODIFIER_IDS) {
  const modifier = PASSIVE_MODIFIER_DEFINITIONS[id];
  const fireRateChange = (1 / modifier.reloadMultiplier - 1) * 100;
  console.log([
    modifier.label.padEnd(22, ' '),
    percent((modifier.healthMultiplier - 1) * 100),
    percent((modifier.moveMultiplier - 1) * 100),
    percent(fireRateChange),
    percent((modifier.projectileSpeedMultiplier - 1) * 100)
  ].join(' '));
}

console.log('\nDPS is sustained projectile damage. Drone and Impact classes are judged mainly by DRONES/BODY.');
console.log('Every non-standard frame must contain at least one benefit and one real cost.\n');
