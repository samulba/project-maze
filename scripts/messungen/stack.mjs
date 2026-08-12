// Produktionsnahe Tuning-Kette, Reihenfolge exakt wie apps/server/src/index.ts
// (Zeilen 396-533), innen -> aussen. Weggelassen (und warum):
//  - tuneSnapshotEncoding / tuneSessions / tunePersistence / tuneTelemetry /
//    tuneDebugRules / tuneAchievements / tuneInputAck / tuneInputIdle:
//    reine Snapshot-/Netz-/IO-Schichten, fassen weder updateBot noch Zielwahl
//    noch Ballistik an; Persistenz/Telemetrie braeuchten externe Dienste.
//  - tuneRoyale: haengt in Produktion immer in der Kette, wirkt aber nur bei
//    ARENA_MODE=royale (arena-royale.ts:355). Wird hier trotzdem eingehaengt.
// Env-Defaults laut index.ts (alle Opt-out, also AN, sofern nicht anders
// vermerkt): BOT_PACING_ENABLED, ARENA_DIRECTOR_ENABLED, alle 8 Signatures,
// FAMILY_UPGRADES, PERKS, PROJECTILE_SPEED_V2, DASH_TRAVEL.
// AUS per Default: SPECTATOR (opt-in), REPULSE_TRAVEL (opt-in).
import { MazeGame, botState, botNameFor } from '../../apps/server/dist/game.js';
import { hardenSimulation } from '../../apps/server/dist/simulation-hardening.js';
import { tuneSpectator } from '../../apps/server/dist/spectator.js';
import { tuneProjectileSpeed } from '../../apps/server/dist/projectile-speed.js';
import { tuneCombatScaling } from '../../apps/server/dist/combat-tuning.js';
import { tuneHitDirection } from '../../apps/server/dist/hit-direction.js';
import { tuneFamilyUpgrades } from '../../apps/server/dist/family-upgrades.js';
import { tunePrecisionSignature, DEFAULT_CHARGE } from '../../apps/server/dist/signature-precision.js';
import { tuneRapidSignature, tuneRapidBots, DEFAULT_MOMENTUM } from '../../apps/server/dist/signature-rapid.js';
import { tuneImpactSignature, DEFAULT_WUCHT } from '../../apps/server/dist/signature-impact.js';
import { tuneTempestSignature, DEFAULT_HEAT } from '../../apps/server/dist/signature-tempest.js';
import { tuneSpecterSignature, DEFAULT_STEALTH } from '../../apps/server/dist/signature-specter.js';
import { tuneAegisSignature, DEFAULT_SCHILD } from '../../apps/server/dist/signature-aegis.js';
import { tuneSiegeSignature, DEFAULT_STELLUNG } from '../../apps/server/dist/signature-siege.js';
import { tuneDrones } from '../../apps/server/dist/drone-tuning.js';
import { tuneControlSignature, DEFAULT_BUDGET } from '../../apps/server/dist/signature-control.js';
import { tuneClassMechanics } from '../../apps/server/dist/class-mechanics.js';
import { tunePerks } from '../../apps/server/dist/perks.js';
import { tuneBotBrain, DEFAULT_BOT_PACING, botTierFor } from '../../apps/server/dist/bot-brain.js';
import { tuneArenaDirector } from '../../apps/server/dist/arena-director.js';
import { tuneProgression } from '../../apps/server/dist/progression-tuning.js';
import { tuneLoadoutSystem } from '../../apps/server/dist/loadout-system.js';
import { tuneArenaSystems } from '../../apps/server/dist/arena-systems.js';
import { tuneArenaEvents } from '../../apps/server/dist/arena-events.js';
import { tuneRoyale, DEFAULT_ROYALE } from '../../apps/server/dist/arena-royale.js';
import { setArenaMode } from '../../apps/server/dist/world.js';

export { MazeGame, botState, botNameFor, botTierFor, DEFAULT_BOT_PACING, setArenaMode };

const BRANCHES = ['rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis'];

/**
 * options: { botCount, mode: 'maze'|'ffa', director: bool, v2: bool }
 * setArenaMode MUSS vor dem Konstruktor stehen (Kommentar index.ts:387-393).
 */
export function buildGame({ botCount = 18, mode = 'maze', director = true, v2 = true, rapidBots = true } = {}) {
  setArenaMode(mode);
  let g = hardenSimulation(new MazeGame(botCount));
  g = tuneSpectator(g, false);
  g = tuneProjectileSpeed(g, v2);
  g = tuneCombatScaling(g);
  g = tuneHitDirection(g, true);
  g = tuneFamilyUpgrades(g, BRANCHES);
  g = tunePrecisionSignature(g, true, DEFAULT_CHARGE, true);
  g = tuneRapidSignature(g, true, DEFAULT_MOMENTUM, true);
  g = tuneImpactSignature(g, true, DEFAULT_WUCHT, true);
  g = tuneTempestSignature(g, true, DEFAULT_HEAT, true);
  g = tuneSpecterSignature(g, true, DEFAULT_STEALTH, true);
  g = tuneAegisSignature(g, true, DEFAULT_SCHILD, true);
  g = tuneSiegeSignature(g, true, DEFAULT_STELLUNG, true);
  g = tuneDrones(g);
  g = tuneControlSignature(g, true, DEFAULT_BUDGET, true);
  g = tuneClassMechanics(g);
  g = tunePerks(g, true);
  g = tuneBotBrain(g, DEFAULT_BOT_PACING);
  // rapidBots=false laesst die Schicht weg (A/B-Messung Befund 79); in
  // Produktion haengt sie (SIGNATURE_RAPID_ENABLED, Opt-out -> an).
  g = tuneRapidBots(g, rapidBots);
  g = tuneArenaDirector(g, director);
  g = tuneProgression(g);
  g = tuneLoadoutSystem(g, true, false);
  g = tuneArenaSystems(g);
  g = tuneArenaEvents(g);
  g = tuneRoyale(g, DEFAULT_ROYALE);
  return g;
}

export const median = (xs) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
