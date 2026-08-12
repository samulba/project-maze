// Befund 76: Signature-Verteilung der Bots über 6 min Maze-Betrieb, 18 Bots,
// feste Uhr (step 25 ms), sekündliche Abtastung; dazu Anteil der Ticks mit primary=true.
//
// Schichtung wie apps/server/src/index.ts (innen -> außen), mit den Env-DEFAULTS:
//   SPECTATOR_ENABLED=false, PROJECTILE_SPEED_V2=true, FAMILY_UPGRADES_ENABLED=true,
//   alle SIGNATURE_*_ENABLED=true, PERKS_ENABLED=true, BOT_PACING_ENABLED=true,
//   SIGNATURE_RAPID_ENABLED=true (tuneRapidBots), ARENA_DIRECTOR_ENABLED=true,
//   DASH_TRAVEL_ENABLED=true, REPULSE_TRAVEL_ENABLED=false, BOT_COUNT=18, ARENA_MODE=maze.
// Weggelassen (reine I/O-/Netz-Schichten ohne Wirkung auf Bot-Verhalten):
//   tuneRoyale (im Maze-Modus inert, currentArenaMode()!=='royale'), tuneAchievements,
//   tuneDebugRules, tuneTelemetry, tunePersistence, tuneSessions, tuneSnapshotEncoding,
//   tuneInputAck, tuneInputIdle, tuneSpectator(false) wäre no-op.
import { setArenaMode } from '../../apps/server/dist/world.js';
setArenaMode('maze'); // MUSS vor dem Bau der Arena stehen (index.ts:394)

const D = '../../apps/server/dist';
const { MazeGame } = await import(`${D}/game.js`);
const { hardenSimulation } = await import(`${D}/simulation-hardening.js`);
const { tuneProjectileSpeed } = await import(`${D}/projectile-speed.js`);
const { tuneCombatScaling } = await import(`${D}/combat-tuning.js`);
const { tuneHitDirection } = await import(`${D}/hit-direction.js`);
const { tuneFamilyUpgrades } = await import(`${D}/family-upgrades.js`);
const { DEFAULT_CHARGE, tunePrecisionSignature } = await import(`${D}/signature-precision.js`);
const { DEFAULT_MOMENTUM, tuneRapidSignature, tuneRapidBots } = await import(`${D}/signature-rapid.js`);
const { DEFAULT_WUCHT, tuneImpactSignature } = await import(`${D}/signature-impact.js`);
const { DEFAULT_HEAT, tuneTempestSignature } = await import(`${D}/signature-tempest.js`);
const { DEFAULT_STEALTH, tuneSpecterSignature } = await import(`${D}/signature-specter.js`);
const { DEFAULT_SCHILD, tuneAegisSignature } = await import(`${D}/signature-aegis.js`);
const { DEFAULT_STELLUNG, tuneSiegeSignature } = await import(`${D}/signature-siege.js`);
const { tuneDrones } = await import(`${D}/drone-tuning.js`);
const { DEFAULT_BUDGET, tuneControlSignature } = await import(`${D}/signature-control.js`);
const { tuneClassMechanics } = await import(`${D}/class-mechanics.js`);
const { tunePerks } = await import(`${D}/perks.js`);
const { DEFAULT_BOT_PACING, tuneBotBrain } = await import(`${D}/bot-brain.js`);
const { tuneArenaDirector } = await import(`${D}/arena-director.js`);
const { tuneProgression } = await import(`${D}/progression-tuning.js`);
const { tuneLoadoutSystem } = await import(`${D}/loadout-system.js`);
const { tuneArenaSystems } = await import(`${D}/arena-systems.js`);
const { tuneArenaEvents } = await import(`${D}/arena-events.js`);
const { signatureStateFor, classBranch } = await import(`${D}/signature.js`);

const FAMILIES = ['rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis'];
// Alle tune* geben dieselbe Instanz zurück – Schichtung daher sequenziell,
// exakt in der Reihenfolge von index.ts (innen -> außen):
let game = hardenSimulation(new MazeGame(18));
game = tuneProjectileSpeed(game, true);            // PROJECTILE_SPEED_V2 (default an)
game = tuneCombatScaling(game);
game = tuneHitDirection(game);
game = tuneFamilyUpgrades(game, FAMILIES);         // FAMILY_UPGRADES_ENABLED (default an)
game = tunePrecisionSignature(game, true, DEFAULT_CHARGE, true);
game = tuneRapidSignature(game, true, DEFAULT_MOMENTUM, true);
game = tuneImpactSignature(game, true, DEFAULT_WUCHT, true);
game = tuneTempestSignature(game, true, DEFAULT_HEAT, true);
game = tuneSpecterSignature(game, true, DEFAULT_STEALTH, true);
game = tuneAegisSignature(game, true, DEFAULT_SCHILD, true);
game = tuneSiegeSignature(game, true, DEFAULT_STELLUNG, true);
game = tuneDrones(game);
game = tuneControlSignature(game, true, DEFAULT_BUDGET, true);
game = tuneClassMechanics(game);
game = tunePerks(game, true);                      // PERKS_ENABLED (default an)
game = tuneBotBrain(game, DEFAULT_BOT_PACING);     // BOT_PACING_ENABLED (default an)
game = tuneRapidBots(game, true);                  // SIGNATURE_RAPID_ENABLED (default an)
game = tuneArenaDirector(game, true);              // ARENA_DIRECTOR_ENABLED (default an)
game = tuneProgression(game);
game = tuneLoadoutSystem(game, true, false);       // DASH_TRAVEL an, REPULSE_TRAVEL aus (defaults)
game = tuneArenaSystems(game);
game = tuneArenaEvents(game);

const internals = game;
const samples = { specter: [], impact: [], rapid: [], tempest: [] };
let primaryTicks = 0, botTicks = 0;
let now = 1_000_000;
const DT = 0.025, STEPS = 6 * 60 * 40; // 6 min

for (let i = 1; i <= STEPS; i++) {
  game.step(DT, now);
  now += 25;
  // Feueranteil je Simulationstick über alle lebenden Bots
  for (const p of internals.players.values()) {
    if (!p.isBot || p.dead) continue;
    botTicks += 1;
    if (p.primary) primaryTicks += 1;
  }
  if (i % 40 === 0) { // sekündlich
    for (const p of internals.players.values()) {
      if (!p.isBot || p.dead) continue;
      const fam = classBranch(p.playerClass);
      if (fam in samples) samples[fam].push(signatureStateFor(game, fam).get(p.id) ?? 0);
    }
  }
}

const stats = (arr) => {
  if (arr.length === 0) return 'keine Proben';
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `n=${s.length} mean=${mean.toFixed(1)} median=${q(0.5).toFixed(1)} p90=${q(0.9).toFixed(1)} max=${s[s.length - 1].toFixed(1)} | Anteil>=95: ${(100 * s.filter(v => v >= 95).length / s.length).toFixed(2)} %`;
};
for (const fam of Object.keys(samples)) console.log(fam.padEnd(8), stats(samples[fam]));
console.log(`primary=true: ${primaryTicks} von ${botTicks} Bot-Ticks = ${(100 * primaryTicks / botTicks).toFixed(1)} %`);
const styles = {};
for (const p of internals.players.values()) if (p.isBot) styles[p.bot?.style] = (styles[p.bot?.style] ?? 0) + 1;
console.log('Bestand am Ende:', JSON.stringify(styles), 'Spieler gesamt:', internals.players.size);
