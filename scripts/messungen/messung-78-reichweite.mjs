// Befund 78: Kugelreichweite (projectileSpeed × projectileLife) je zitierter Klasse
// via tunedStatsFor, gegen preferredDistance und Feuerdeckel gestellt.
// Produktionsnah: PROJECTILE_SPEED_V2 ist Opt-out (default an) -> Schalter setzen.
import { setProjectileSpeedEnabled } from '../../apps/server/dist/projectile-speed.js';
import { tunedStatsFor } from '../../apps/server/dist/combat-tuning.js';
import { EMPTY_UPGRADES } from '../../packages/shared/dist/index.js';

setProjectileSpeedEnabled(true); // wie tuneProjectileSpeed(game, PROJECTILE_SPEED_V2=true) in index.ts

const fake = (playerClass, level, frame) => ({
  playerClass, level, upgrades: EMPTY_UPGRADES(), passiveModifier: frame, bot: null,
  move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, primary: false, secondary: false,
  cooldown: 0, lastDamageAt: 0, invulnerableUntil: 0
});

// Bot-Stil -> preferredDistance (game.ts:168) und Feuerdeckel-Basis (bot-brain.ts:535)
const rows = [
  // [Pfadname, Klassen, Stil, frame laut BOT_LOADOUTS]
  ['hunter: sniper>ballista>siegebreaker>eclipse', ['sniper','ballista','siegebreaker','eclipse'], 'hunter', 'stabilizer'],
  ['farmer: rapid>repeater>gatling>vortex', ['rapid','repeater','gatling','vortex'], 'farmer', 'standard'],
  ['kiter: arbalest>deadeye / eclipse', ['arbalest','deadeye','eclipse'], 'kiter', 'lightweight']
];
const pref = { hunter: 430, farmer: 430, kiter: 620 };
const capBase = { hunter: 900, farmer: 900, kiter: 1150 };

for (const [name, classes, style, frame] of rows) {
  console.log(`\n== ${name} (Stil ${style}, prefDist ${pref[style]}, Deckelbasis ${capBase[style]}) ==`);
  for (const cls of classes) {
    for (const useFrame of ['standard', frame]) {
      if (useFrame !== 'standard' && frame === 'standard') continue;
      const s = tunedStatsFor(fake(cls, 40, useFrame));
      const range = s.projectileSpeed * s.projectileLife;
      const cap = Math.min(capBase[style], range * 0.92 + 60);
      console.log(
        `${cls.padEnd(13)} frame=${useFrame.padEnd(10)} speed=${s.projectileSpeed.toFixed(1).padStart(7)} life=${s.projectileLife.toFixed(3)} ` +
        `range=${range.toFixed(0).padStart(5)} px | Feuerdeckel=${cap.toFixed(0).padStart(4)} px | prefDist/range=${(100 * pref[style] / range).toFixed(1)} %`
      );
    }
  }
}

// Gegenprobe: Level-Abhängigkeit (Behauptung rechnet "Level 40")
const l1 = tunedStatsFor(fake('eclipse', 1, 'standard'));
const l40 = tunedStatsFor(fake('eclipse', 40, 'standard'));
console.log(`\neclipse Reichweite L1=${(l1.projectileSpeed * l1.projectileLife).toFixed(0)} px, L40=${(l40.projectileSpeed * l40.projectileLife).toFixed(0)} px (V2 hält speed×life konstant)`);
