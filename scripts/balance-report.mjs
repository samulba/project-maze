import { allClassBalanceMetrics } from '../packages/shared/dist/balance.js';
import { CLASS_DEFINITIONS } from '../packages/shared/dist/index.js';
// Die Momentum-Zahlen kommen aus der Server-Schicht, nicht aus einer zweiten
// Konstantenquelle – sonst balanciert der Report an Werten, die im Spiel nicht
// gelten. Deshalb baut `prebalance` auch den Server.
import {
  DEFAULT_MOMENTUM,
  isRapidClass,
  momentumFireRate
} from '../apps/server/dist/signature-rapid.js';
import {
  DEFAULT_WUCHT,
  WUCHT_MAX_TTK_GAIN,
  isImpactClass,
  wuchtContactDamage
} from '../apps/server/dist/signature-impact.js';
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
console.log('T  CLASS         ROLE        DPS     FWD   BURST   RANGE     EHP     MOVE   DRONES   BODY');
console.log('─'.repeat(96));
for (const entry of rows) {
  const definition = CLASS_DEFINITIONS[entry.id];
  console.log([
    String(entry.tier),
    definition.label.padEnd(13, ' '),
    definition.branch.padEnd(10, ' '),
    number(entry.projectileDps),
    number(entry.forwardProjectileDps),
    number(entry.burstDamage),
    number(entry.projectileRange),
    number(entry.effectiveDurability),
    number(entry.mobility),
    number(entry.dronePressure),
    number(entry.bodyThreat)
  ].join(' '));
}

console.log(`\nRAPID — SIGNATURE MOMENTUM (SIGNATURE_RAPID_ENABLED, max −${(DEFAULT_MOMENTUM.maxReloadBonus * 100).toFixed(0)} % Nachladezeit)\n`);
console.log('CLASS          RELOAD    SHOTS/S @0  @50  @100    FWD DPS @0   @100    ZUWACHS');
console.log('─'.repeat(80));
for (const entry of rows.filter((row) => isRapidClass(row.id))) {
  const definition = CLASS_DEFINITIONS[entry.id];
  const shots = [0, 50, 100].map((momentum) => momentumFireRate(definition.reload, momentum));
  // FWD DPS skaliert exakt mit der Feuerrate: dieselben Läufe, derselbe Schaden.
  const dpsFull = entry.forwardProjectileDps * (shots[2] / shots[0]);
  console.log([
    definition.label.padEnd(13, ' '),
    definition.reload.toFixed(3).padStart(7, ' '),
    shots[0].toFixed(2).padStart(12, ' '),
    shots[1].toFixed(2).padStart(4, ' '),
    shots[2].toFixed(2).padStart(5, ' '),
    number(entry.forwardProjectileDps).padStart(13, ' '),
    number(dpsFull),
    percent((dpsFull / Math.max(0.001, entry.forwardProjectileDps) - 1) * 100)
  ].join(' '));
}
console.log(`\nMomentum steigt um ${DEFAULT_MOMENTUM.buildPerSecond}/s beim Feuern in Bewegung, fällt um`
  + ` ${DEFAULT_MOMENTUM.decayPerSecond}/s im Stand und um ${DEFAULT_MOMENTUM.holdDecayPerSecond}/s in Fahrt ohne Feuer.`);
console.log('Die @100-Spalte ist die Obergrenze für dauerhaft fahrende Spieler, nicht der Normalfall:');
console.log('Wer aus der Deckung feuert, steht bei @0 – exakt den Werten der Haupttabelle.');

// Duennster Tank derselben Freischaltstufe – dort greift der Anteilsdeckel.
const thinnestPeer = (playerClass) => {
  const level = CLASS_DEFINITIONS[playerClass].unlockLevel;
  return Object.values(CLASS_DEFINITIONS)
    .filter((tank) => tank.unlockLevel === level)
    .sort((a, b) => a.maxHealth - b.maxHealth)[0];
};

console.log(`\nIMPACT — SIGNATURE WUCHT (SIGNATURE_IMPACT_ENABLED, max ×${(1 + DEFAULT_WUCHT.maxBodyDamageBonus).toFixed(2)}, Deckel ${(DEFAULT_WUCHT.maxContactShare * 100).toFixed(0)} % je Kontakttick)\n`);
console.log('CLASS          BODY   KONTAKT/TICK @0    @50   @100   DUENNSTES ZIEL   HP   ANTEIL   FAKTOR');
console.log('─'.repeat(88));
for (const entry of rows.filter((row) => isImpactClass(row.id))) {
  const definition = CLASS_DEFINITIONS[entry.id];
  const victim = thinnestPeer(entry.id);
  const base = definition.bodyDamage * 0.08;
  const ticks = [0, 50, 100].map((wucht) => wuchtContactDamage(base, wucht, victim.maxHealth, definition.unlockLevel));
  console.log([
    definition.label.padEnd(13, ' '),
    definition.bodyDamage.toFixed(0).padStart(5, ' '),
    ticks[0].toFixed(2).padStart(15, ' '),
    ticks[1].toFixed(2).padStart(6, ' '),
    ticks[2].toFixed(2).padStart(6, ' '),
    '  ' + victim.label.padEnd(14, ' '),
    victim.maxHealth.toFixed(0).padStart(4, ' '),
    `${(ticks[2] / victim.maxHealth * 100).toFixed(1)} %`.padStart(8, ' '),
    `${(ticks[2] / ticks[0]).toFixed(2)}x`.padStart(8, ' ')
  ].join(' '));
}
console.log(`\nWucht steigt um ${DEFAULT_WUCHT.buildPerSecond}/s in Fahrt, faellt um ${DEFAULT_WUCHT.decayPerSecond}/s im Stand`
  + ` und wird im Kontakt mit ${DEFAULT_WUCHT.contactDrainPerSecond}/s verbraucht – eine volle Ladung haelt`
  + ` ${(100 / DEFAULT_WUCHT.contactDrainPerSecond).toFixed(2)} s Dauerkontakt.`);
console.log(`Der Anteilsdeckel greift dort, wo der Aufschlag zu hart waere: Ein Kontakttick nimmt nie mehr als`);
console.log(`${(DEFAULT_WUCHT.maxContactShare * 100).toFixed(0)} % des Maximallebens, und ein voller Anlauf verkuerzt die Zeit bis zum Tod um hoechstens ${(WUCHT_MAX_TTK_GAIN * 100).toFixed(0)} %.`);

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

console.log('\nDPS is sustained projectile damage, FWD counts only forward-facing barrels. Drone and Impact classes are judged mainly by DRONES/BODY.');
console.log('Every non-standard frame must contain at least one benefit and one real cost.\n');
