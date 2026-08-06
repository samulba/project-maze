import { allClassBalanceMetrics } from '../packages/shared/dist/balance.js';
import { CLASS_DEFINITIONS, EMPTY_UPGRADES, GAME } from '../packages/shared/dist/index.js';
import { tunedStatsFor } from '../apps/server/dist/combat-tuning.js';
import {
  FAMILY_SCALING,
  familyBuildRate,
  impactBodyDamageBonus,
  rapidReloadBonus
} from '../apps/server/dist/family-upgrades.js';
import {
  PROJECTILE_SPEED_PER_POINT,
  fastestPlayerSpeed,
  projectileSpeedCapAt,
  projectileSpeedFor
} from '../apps/server/dist/projectile-speed.js';
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

// ── Familien-Upgrades (KL4) ──────────────────────────────────────────────────
// Kennzahl: der Grenzwert des n-ten Punktes in der Waehrung der Familie,
// geteilt durch denselben Grenzwert beim besten Basis-Upgrade auf derselben
// Ausgabe. Die Basiswerte kommen aus `tunedStatsFor`, nicht aus abgeschriebenen
// Zahlen – sonst prueft der Report gegen eine zweite Wahrheit.
const REFERENCE_POINTS = 4;
/** Laenge des Standardgefechts, gegen das `signatureRate` bei RAPID gemessen wird. */
const ENGAGEMENT_SECONDS = 5;
const PROBE_CLASS = { rapid: 'storm', impact: 'rammer' };

const statsWith = (playerClass, id, level) => {
  const upgrades = EMPTY_UPGRADES();
  upgrades[id] = level;
  return tunedStatsFor({ playerClass, upgrades });
};
/** Grenzwert des n-ten Punktes eines Basis-Upgrades, gemessen an seiner Ausgabe. */
const baseMarginal = (playerClass, id, pick, n) => {
  const before = pick(statsWith(playerClass, id, n - 1));
  return pick(statsWith(playerClass, id, n)) / before - 1;
};
const fireRateOf = (stats) => 1 / stats.reload;

/** Mittleres Momentum ueber ein Gefecht, das bei 0 beginnt und in Fahrt feuert. */
const averageMomentum = (rateLevel) => {
  const build = familyBuildRate(30, rateLevel);
  const secondsToFull = 100 / build;
  return secondsToFull >= ENGAGEMENT_SECONDS
    ? build * ENGAGEMENT_SECONDS / 2
    : 100 * (1 - secondsToFull / (2 * ENGAGEMENT_SECONDS));
};

const familyRows = [
  {
    family: 'RAPID',
    slot: 'signaturePower',
    output: 'Feuerrate @100 Momentum',
    base: 'reload',
    // Feuerrate ~ 1 / (1 - Abschlag): der Deckenwert, den ein fahrender
    // Rapid-Spieler dauerhaft haelt.
    value: (n) => 1 / (1 - rapidReloadBonus(n)),
    baseMarginal: (n) => baseMarginal(PROBE_CLASS.rapid, 'reload', fireRateOf, n)
  },
  {
    family: 'RAPID',
    slot: 'signatureRate',
    output: `Feuerrate, ${ENGAGEMENT_SECONDS}-s-Gefecht ab 0`,
    base: 'reload',
    value: (n) => 1 / (1 - rapidReloadBonus(REFERENCE_POINTS) * averageMomentum(n) / 100),
    baseMarginal: (n) => baseMarginal(PROBE_CLASS.rapid, 'reload', fireRateOf, n)
  },
  {
    family: 'IMPACT',
    slot: 'signaturePower',
    output: 'Kontaktschaden vor Deckel',
    base: 'bodyDamage',
    value: (n) => 1 + impactBodyDamageBonus(n),
    baseMarginal: (n) => baseMarginal(PROBE_CLASS.impact, 'bodyDamage', (stats) => stats.bodyDamage, n)
  },
  {
    family: 'IMPACT',
    slot: 'signatureRate',
    output: 'Geladene Stoesse je Minute',
    base: 'bodyDamage',
    // Ein Aufprall zieht die Ladung leer; die Aufbaurate bestimmt damit direkt,
    // wie oft ein Stoss mit voller Wucht landet.
    value: (n) => familyBuildRate(30, n),
    baseMarginal: (n) => baseMarginal(PROBE_CLASS.impact, 'bodyDamage', (stats) => stats.bodyDamage, n)
  }
];

// Ein Slot ist schon dann auffaellig, wenn er auf **einer** Stufe aus dem
// Fenster faellt – der Deckenwert allein wuerde einen toten ersten Punkt
// verstecken.
const verdict = (ratios) => {
  if (ratios.some((value) => value > 1.2)) return 'DOMINANT';
  if (ratios.some((value) => value < 0.5)) return 'TOT';
  return 'OK';
};
const ratioAt = (row, n) => (row.value(n) / row.value(n - 1) - 1) / row.baseMarginal(n);
const POINTS = [1, REFERENCE_POINTS, GAME.maxUpgradeLevel];

console.log('\nFAMILIEN-UPGRADES — DOMINANZPRUEFUNG (FAMILY_UPGRADES_ENABLED)\n');
console.log(`Grenzwert des n-ten Punktes in der Waehrung der Familie, geteilt durch denselben`);
console.log(`Grenzwert beim besten Basis-Upgrade auf derselben Ausgabe. Der jeweils andere`);
console.log(`Slot steht dabei auf ${REFERENCE_POINTS} Punkten.   < 0.50 TOT · 0.50–1.20 OK · > 1.20 DOMINANT\n`);
console.log('FAMILIE    SLOT             AUSGABE                        P1     P4     P8   BASIS        URTEIL');
console.log('─'.repeat(100));
for (const row of familyRows) {
  const ratios = POINTS.map((n) => ratioAt(row, n));
  console.log([
    row.family.padEnd(10, ' '),
    row.slot.padEnd(16, ' '),
    row.output.padEnd(28, ' '),
    ...ratios.map((value) => `${value.toFixed(2)}x`.padStart(6, ' ')),
    '  ' + row.base.padEnd(12, ' '),
    verdict(ratios)
  ].join(' '));
}
console.log('\nPRECISION  beide            — Signature steht noch nicht, Slots gesperrt');
console.log('CONTROL    beide            — Signature steht noch nicht, Slots gesperrt');
console.log(`\nSockel + Punkte (Variante B): RAPID ${FAMILY_SCALING.rapid.powerBase} + ${FAMILY_SCALING.rapid.powerPerPoint}/Punkt,`
  + ` IMPACT ${FAMILY_SCALING.impact.powerBase} + ${FAMILY_SCALING.impact.powerPerPoint}/Punkt,`
  + ` Aufbau ×(1 + ${FAMILY_SCALING.buildPerPoint}·n).`);
console.log('Zwei Zahlen brauchen einen Satz Erklaerung:');
console.log('• IMPACT signaturePower steht **vor** dem Anteilsdeckel. Der Deckel nimmt den');
console.log('  Ueberschuss in genau den Duellen wieder weg, in denen er zaehlt – gegen den');
console.log('  duennsten Gegner derselben Stufe laufen fuenf der sieben Klassen hinein');
console.log('  (Tabelle oben). Der reale Wert liegt darunter, die Zeit bis zum Tod bleibt');
console.log('  auf jeder Stufe innerhalb des erlaubten Viertels (Test).');
console.log('• RAPID signatureRate misst sich an einer Ausgabe, die es nur halb trifft:');
console.log('  Schneller volles Momentum hebt die Decke nicht, es kommt nur frueher dort an.');
console.log('  In DPS gerechnet ist der Slot damit tot; sein Wert liegt im Wiedereinstieg');
console.log('  nach Respawn und Deckung, den diese Kennzahl nicht sieht.');

// ── Projektiltempo 2.0 (PROJECTILE_SPEED_V2) ─────────────────────────────────
// AUSWEICH-INDEX: Wie weit kommt ein ausweichendes Ziel seitlich, waehrend die
// Kugel fliegt – gemessen in Trefferbreiten. Unter 1 ist nicht ausweichbar.
const REACTION_SECONDS = 0.25;
const evasiveTarget = (() => {
  const upgrades = EMPTY_UPGRADES();
  upgrades.moveSpeed = GAME.maxUpgradeLevel;
  return tunedStatsFor({ playerClass: 'rapid', upgrades });
})();
const sidestep = (seconds) => {
  if (seconds <= 0) return 0;
  const ramp = evasiveTarget.moveSpeed / evasiveTarget.acceleration;
  return seconds <= ramp
    ? 0.5 * evasiveTarget.acceleration * seconds * seconds
    : 0.5 * evasiveTarget.moveSpeed * ramp + evasiveTarget.moveSpeed * (seconds - ramp);
};
const dodgeIndex = (definition, speed, distance) =>
  sidestep(distance / speed - REACTION_SECONDS) / (GAME.playerRadius + definition.projectileRadius);
const legacyProjectileSpeed = (definition, points) =>
  definition.projectileSpeed * (definition.branch === 'precision' ? 0.9 : 0.75) * (1 + points * 0.04);

console.log('\nPROJEKTILTEMPO 2.0 — AUSWEICHBARKEIT (PROJECTILE_SPEED_V2)\n');
console.log(`Voll ausgebautes Tempo-Upgrade, Level ${GAME.maxLevel}. Ausweich-Index = seitliche Strecke eines`);
console.log(`ausweichenden Ziels waehrend der Flugzeit, in Trefferbreiten, nach ${REACTION_SECONDS}s Reaktion.`);
console.log(`Unter 1.0 ist die Kugel nicht ausweichbar. Bezug: schnellster Spieler ${fastestPlayerSpeed.toFixed(0)} px/s,`);
console.log(`Deckel ${projectileSpeedCapAt(1).toFixed(0)} px/s auf Level 1 → ${projectileSpeedCapAt(GAME.maxLevel).toFixed(0)} px/s auf Level ${GAME.maxLevel}.\n`);
console.log('KLASSE        ZWEIG        HEUTE     NEU   AEND    V/SPIELER      IDX@300      IDX@450');
console.log('─'.repeat(92));
for (const entry of rows) {
  const definition = CLASS_DEFINITIONS[entry.id];
  if (definition.projectileSpeed <= 0) continue;
  const before = legacyProjectileSpeed(definition, GAME.maxUpgradeLevel);
  const after = projectileSpeedFor(definition, GAME.maxLevel, GAME.maxUpgradeLevel);
  console.log([
    definition.label.padEnd(13, ' '),
    definition.branch.padEnd(11, ' '),
    before.toFixed(0).padStart(7, ' '),
    after.toFixed(0).padStart(8, ' '),
    `${((after / before - 1) * 100).toFixed(0)}%`.padStart(7, ' '),
    `${(before / fastestPlayerSpeed).toFixed(2)}→${(after / fastestPlayerSpeed).toFixed(2)}x`.padStart(13, ' '),
    `${dodgeIndex(definition, before, 300).toFixed(2)}→${dodgeIndex(definition, after, 300).toFixed(2)}`.padStart(13, ' '),
    `${dodgeIndex(definition, before, 450).toFixed(2)}→${dodgeIndex(definition, after, 450).toFixed(2)}`.padStart(13, ' ')
  ].join(' '));
}
console.log('\nDrei Regeln, drei Aufgaben: Daempfer gegen „overall zu schnell", ein mit dem Level');
console.log('fallender Deckel gegen „je staerker der Gegner, desto unfairer", und ein Boden, unter');
console.log('den keine Kugel faellt – ein Fortress-Projektil liegt schon heute bei 1.01x Spielertempo');
console.log('und holt ein fliehendes Ziel kaum ein. Klassen unter dem Boden bleiben unveraendert.');
console.log(`Das Upgrade steigt um ${(PROJECTILE_SPEED_PER_POINT * 100).toFixed(1)} % je Punkt statt um 4 % und rechnet nach dem Deckel –`);
console.log('vor ihm waere es fuer jede Precision-Klasse wirkungslos. Die Reichweite bleibt konstant.');

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
