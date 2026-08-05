import {
  GAME,
  type PlayerClass,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';
import type { ActiveModuleId, PassiveModifierId } from '@project-maze/shared/gameplay';
import { bountyTargetIdFor } from './arena-systems.js';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { activateModule, equipLoadout } from './loadout-system.js';
import { distanceSquared, normalize } from './physics.js';
import { hasLineOfSight } from './world.js';

export type BotSkillTier = 'rookie' | 'veteran' | 'elite';
type BotStyle = 'farmer' | 'hunter' | 'kiter' | 'brawler' | 'controller';

export interface TierProfile {
  reactionMs: number;
  aimError: number;
  /** Anteil der Zielbewegung, der beim Vorhalten berücksichtigt wird. */
  leadFactor: number;
  dodgeChance: number;
}

export const TIER_PROFILES: Record<BotSkillTier, TierProfile> = {
  rookie: { reactionMs: 430, aimError: 0.17, leadFactor: 0.35, dodgeChance: 0 },
  veteran: { reactionMs: 300, aimError: 0.1, leadFactor: 0.7, dodgeChance: 0.45 },
  elite: { reactionMs: 215, aimError: 0.055, leadFactor: 0.95, dodgeChance: 0.75 }
};

/** 40 % Rookie, 40 % Veteran, 20 % Elite – die Arena bleibt eine faire Mischung. */
export const TIER_SEQUENCE: readonly BotSkillTier[] = ['rookie', 'veteran', 'rookie', 'veteran', 'elite'];

export interface BotLoadout {
  module: ActiveModuleId;
  frame: PassiveModifierId;
}

export const BOT_LOADOUTS: Record<BotStyle, BotLoadout> = {
  farmer: { module: 'repair', frame: 'standard' },
  hunter: { module: 'dash', frame: 'stabilizer' },
  kiter: { module: 'dash', frame: 'lightweight' },
  brawler: { module: 'repulse', frame: 'reinforced' },
  controller: { module: 'repulse', frame: 'standard' }
};

export const BOT_CLASS_PATHS: Record<BotStyle, PlayerClass[][]> = {
  farmer: [
    ['rapid', 'twin', 'storm'],
    ['rapid', 'repeater', 'gatling'],
    ['rapid', 'flanker', 'octo']
  ],
  hunter: [
    ['sniper', 'railgun', 'lancer'],
    ['sniper', 'hunter', 'phantom'],
    ['sniper', 'arbalest', 'deadeye']
  ],
  kiter: [
    ['sniper', 'hunter', 'phantom'],
    ['sniper', 'arbalest', 'deadeye'],
    ['sniper', 'railgun', 'lancer']
  ],
  brawler: [
    ['rammer', 'crusher', 'juggernaut'],
    ['rammer', 'bulwark', 'fortress'],
    ['rammer', 'blitz', 'comet']
  ],
  controller: [
    ['drone', 'warden', 'overseer'],
    ['drone', 'factory', 'carrier'],
    ['drone', 'guardian', 'hive']
  ]
};

/** Frische Spieler unter diesem Level werden nicht aktiv gejagt. */
export const ROOKIE_PROTECTION_LEVEL = 8;
/** Höchstens so viele Bots verfolgen gleichzeitig dasselbe Ziel. */
export const MAX_ATTACKERS_PER_TARGET = 2;

interface BotState {
  style: BotStyle;
  targetId: string | null;
  targetShapeId: string | null;
  decisionAt: number;
  strafe: number;
  reactionMs: number;
  aimError: number;
  preferredDistance: number;
  fleeHealth: number;
  classPath: PlayerClass[];
  upgradePath: UpgradeId[];
}

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  passiveModifier?: PassiveModifierId;
  bot: BotState | null;
}

interface RuntimeProjectile {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
}

interface BrainInternals {
  players: Map<string, RuntimePlayer>;
  shapes: Map<string, ShapeSnapshot>;
  projectiles: Map<string, RuntimeProjectile>;
  drones: Map<string, { ownerId: string; position: Vector2 }>;
  updateBot(player: RuntimePlayer, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

interface BotBrain {
  tier: BotSkillTier;
  equipped: boolean;
  lastAttackerId: string | null;
  lastAttackedAt: number;
  currentAimError: number;
  targetAcquiredAt: number;
  lastPosition: Vector2;
  lastMoveCheckAt: number;
  detourUntil: number;
  detourSign: number;
  nextModuleTryAt: number;
  holdUntil: number;
}

interface GameBrainState {
  brains: Map<string, BotBrain>;
  counter: number;
}

const states = new WeakMap<MazeGame, GameBrainState>();
const stateFor = (game: MazeGame): GameBrainState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: GameBrainState = { brains: new Map(), counter: 0 };
  states.set(game, created);
  return created;
};

const rotate = (vector: Vector2, angle: number): Vector2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine };
};

/**
 * Ersetzt die eingebaute Bot-Steuerung durch faire, menschlichere Gegner:
 * Vorhalte-Zielen mit Streuung, Skill-Tiers, Wand-Ausweichen, Projektil-Dodge,
 * Modul-/Frame-Nutzung über dieselben Wege wie echte Spieler und eine
 * Zielwahl mit Anfängerschutz und Anti-Gang-up.
 */
export function tuneBotBrain<T extends MazeGame>(game: T): T {
  const internals = game as unknown as BrainInternals;
  const state = stateFor(game);

  const brainFor = (player: RuntimePlayer): BotBrain => {
    const existing = state.brains.get(player.id);
    if (existing) return existing;
    const bot = player.bot!;
    const index = state.counter += 1;
    const tier = TIER_SEQUENCE[index % TIER_SEQUENCE.length] ?? 'rookie';
    const profile = TIER_PROFILES[tier];
    bot.reactionMs = profile.reactionMs;
    bot.aimError = profile.aimError;
    bot.classPath = BOT_CLASS_PATHS[bot.style][index % 3] ?? bot.classPath;
    const created: BotBrain = {
      tier,
      equipped: false,
      lastAttackerId: null,
      lastAttackedAt: 0,
      currentAimError: 0,
      targetAcquiredAt: 0,
      lastPosition: { ...player.position },
      lastMoveCheckAt: 0,
      detourUntil: 0,
      detourSign: 1,
      nextModuleTryAt: 0,
      holdUntil: 0
    };
    state.brains.set(player.id, created);
    return created;
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    originalDamagePlayer(target, damage, attackerId, now);
    if (!target.bot || !attackerId || attackerId === target.id) return;
    const brain = state.brains.get(target.id);
    if (brain) {
      brain.lastAttackerId = attackerId;
      brain.lastAttackedAt = now;
      brain.holdUntil = 0;
    }
  };

  const countTargeters = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const candidate of internals.players.values()) {
      const targetId = candidate.bot?.targetId;
      if (!candidate.dead && targetId) counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    return counts;
  };

  internals.updateBot = (player: RuntimePlayer, now: number): void => {
    const bot = player.bot;
    if (!bot) return;
    const brain = brainFor(player);
    const profile = TIER_PROFILES[brain.tier];
    const stats = tunedStatsFor(player);
    const isDroneClass = stats.droneCount > 0;

    if (!brain.equipped && (player.invulnerable || player.dead)) {
      const loadout = BOT_LOADOUTS[bot.style];
      brain.equipped = equipLoadout(game, player.id, loadout.module, loadout.frame, now);
    }

    if (now - brain.lastMoveCheckAt > 350) {
      const moved = Math.hypot(player.position.x - brain.lastPosition.x, player.position.y - brain.lastPosition.y);
      const intending = Math.hypot(player.move.x, player.move.y) > 0.3;
      if (intending && moved < 7 && brain.detourUntil < now) {
        brain.detourUntil = now + 700;
        brain.detourSign = Math.random() < 0.5 ? 1 : -1;
      }
      brain.lastPosition = { ...player.position };
      brain.lastMoveCheckAt = now;
    }

    if (now >= bot.decisionAt) {
      const targetCounts = countTargeters();
      const bountyId = bountyTargetIdFor(game);
      let bestEnemy: RuntimePlayer | null = null;
      let bestScore = -Infinity;
      for (const candidate of internals.players.values()) {
        if (candidate.id === player.id || candidate.dead || candidate.invulnerable) continue;
        const squared = distanceSquared(candidate.position, player.position);
        if (squared > 1050 * 1050 || !hasLineOfSight(player.position, candidate.position)) continue;
        const attackedMe = brain.lastAttackerId === candidate.id && now - brain.lastAttackedAt < 6_000;
        if (candidate.level < ROOKIE_PROTECTION_LEVEL && !attackedMe) continue;
        const alreadyHunted = (targetCounts.get(candidate.id) ?? 0) >= MAX_ATTACKERS_PER_TARGET;
        if (alreadyHunted && bot.targetId !== candidate.id && !attackedMe) continue;
        let score = 900 - Math.sqrt(squared);
        score -= Math.abs(candidate.level - player.level) * 14;
        if (attackedMe) score += 500;
        if (candidate.id === bountyId) score += 260;
        if (score > bestScore) {
          bestScore = score;
          bestEnemy = candidate;
        }
      }

      const wasAttacked = brain.lastAttackerId !== null && now - brain.lastAttackedAt < 6_000;
      const aggressive = bot.style === 'hunter' || bot.style === 'brawler' || wasAttacked || Math.random() > 0.4;
      if (bestEnemy && aggressive) {
        if (bot.targetId !== bestEnemy.id) brain.targetAcquiredAt = now;
        bot.targetId = bestEnemy.id;
        bot.targetShapeId = null;
      } else {
        const shape = [...internals.shapes.values()]
          .filter((candidate) => hasLineOfSight(player.position, candidate.position))
          .sort((a, b) => distanceSquared(a.position, player.position) - distanceSquared(b.position, player.position))[0];
        bot.targetShapeId = shape?.id ?? null;
        bot.targetId = null;
      }
      brain.currentAimError = (Math.random() - 0.5) * 2 * profile.aimError;
      if (Math.random() < 0.22) bot.strafe *= -1;
      bot.decisionAt = now + bot.reactionMs * (0.75 + Math.random() * 0.5);
    }

    const enemy = bot.targetId ? internals.players.get(bot.targetId) : undefined;
    const shape = bot.targetShapeId ? internals.shapes.get(bot.targetShapeId) : undefined;
    const enemyDistance = enemy ? Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y) : Infinity;
    const healthRatio = player.health / Math.max(1, player.maxHealth);

    if (!player.invulnerable && now >= brain.nextModuleTryAt) {
      const loadout = BOT_LOADOUTS[bot.style];
      let wantsModule = false;
      if (loadout.module === 'repair') wantsModule = healthRatio < 0.68 && enemyDistance > 650;
      else if (loadout.module === 'dash') wantsModule = healthRatio < bot.fleeHealth && enemyDistance < 600;
      else if (loadout.module === 'repulse') {
        const nearbyDrones = [...internals.drones.values()]
          .filter((drone) => drone.ownerId !== player.id && distanceSquared(drone.position, player.position) < 150 * 150).length;
        wantsModule = nearbyDrones >= 2 || enemyDistance < 130;
      }
      if (wantsModule && activateModule(game, player.id, now)) {
        if (loadout.module === 'repair') brain.holdUntil = now + 3_800;
        brain.nextModuleTryAt = now + 1_200;
      } else if (wantsModule) {
        brain.nextModuleTryAt = now + 900;
      }
    }

    if (brain.holdUntil > now && enemyDistance > 520) {
      player.move = { x: 0, y: 0 };
      player.primary = false;
      player.secondary = false;
      return;
    }
    brain.holdUntil = 0;

    const target = enemy?.position ?? shape?.position;
    if (!target) {
      const angle = now / 1800 + player.id.length;
      player.move = { x: Math.cos(angle), y: Math.sin(angle) };
      player.primary = false;
      player.secondary = false;
      return;
    }

    const delta = { x: target.x - player.position.x, y: target.y - player.position.y };
    const distance = Math.hypot(delta.x, delta.y);
    const direction = normalize(delta);

    let aimPoint = { ...target };
    if (enemy && stats.projectileSpeed > 0) {
      const travelTime = distance / Math.max(1, stats.projectileSpeed);
      aimPoint = {
        x: target.x + enemy.velocity.x * travelTime * profile.leadFactor,
        y: target.y + enemy.velocity.y * travelTime * profile.leadFactor
      };
    }
    const aimDelta = { x: aimPoint.x - player.position.x, y: aimPoint.y - player.position.y };
    const aimDirection = rotate(normalize(aimDelta), brain.currentAimError);
    const aimLength = Math.min(GAME.maxAimDistance, Math.max(120, Math.hypot(aimDelta.x, aimDelta.y)));
    player.aim = { x: aimDirection.x * aimLength, y: aimDirection.y * aimLength };

    const badlyOutmatched = enemy !== undefined && enemy.level - player.level > 12 && healthRatio < 0.75;
    const fleeing = healthRatio < bot.fleeHealth || badlyOutmatched;
    const radial = fleeing ? -1 : distance > bot.preferredDistance + 80 ? 1 : distance < bot.preferredDistance - 80 ? -0.7 : 0.05;
    let move = normalize({
      x: direction.x * radial - direction.y * bot.strafe * 0.55,
      y: direction.y * radial + direction.x * bot.strafe * 0.55
    });

    if (profile.dodgeChance > 0 && Math.random() < profile.dodgeChance) {
      for (const projectile of internals.projectiles.values()) {
        if (projectile.ownerId === player.id) continue;
        if (distanceSquared(projectile.position, player.position) > 300 * 300) continue;
        const toBot = normalize({ x: player.position.x - projectile.position.x, y: player.position.y - projectile.position.y });
        const heading = normalize(projectile.velocity);
        if (heading.x * toBot.x + heading.y * toBot.y < 0.85) continue;
        const side = Math.sign(heading.x * toBot.y - heading.y * toBot.x) || 1;
        move = normalize({ x: move.x - heading.y * side * 1.4, y: move.y + heading.x * side * 1.4 });
        break;
      }
    }

    if (brain.detourUntil > now) move = rotate(move, Math.PI / 2 * brain.detourSign);
    player.move = move;

    if (isDroneClass) {
      player.secondary = Boolean(enemy && distance < 230);
      player.primary = !player.secondary && distance < 900;
      return;
    }
    player.secondary = false;
    const range = Math.min(bot.style === 'kiter' ? 1150 : 900, stats.projectileSpeed * stats.projectileLife * 0.92 + 60);
    const reactionReady = !enemy || now - brain.targetAcquiredAt >= profile.reactionMs * 0.5;
    player.primary = distance < range && reactionReady;
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stateFor(game).brains.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Sichtbarer Skill-Tier eines Bots (für Tests und Debug-Anzeigen). */
export function botTierFor(game: MazeGame, playerId: string): BotSkillTier | null {
  return states.get(game)?.brains.get(playerId)?.tier ?? null;
}
