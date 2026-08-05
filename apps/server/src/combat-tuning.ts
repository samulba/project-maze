import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  UPGRADE_IDS,
  classAvailableAtLevel,
  isValidClassChoice,
  upgradePointsAtLevel,
  xpAtLevelStart,
  xpThresholdForLevel,
  type PlayerClass,
  type PlayerSnapshot,
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';
import {
  PASSIVE_MODIFIER_DEFINITIONS,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { moveVectorToward } from './physics.js';
import { moveCircle } from './world.js';

interface TunedStats {
  maxHealth: number;
  regen: number;
  acceleration: number;
  moveSpeed: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  damage: number;
  projectileRadius: number;
  penetration: number;
  bodyDamage: number;
  barrelCount: number;
  barrelSpread: number;
  barrelLength: number;
  barrelAngles?: number[] | undefined;
  droneCount: number;
  droneRespawn: number;
}

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  bot: unknown | null;
  passiveModifier?: PassiveModifierId;
}

interface CombatInternals {
  players: Map<string, RuntimePlayer>;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  chooseClass(playerId: string, target: PlayerClass): boolean;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  respawn(player: RuntimePlayer, now: number): void;
  updateBot(player: RuntimePlayer, now: number): void;
  maintainDrones(owner: RuntimePlayer, stats: TunedStats, now: number): void;
  fire(player: RuntimePlayer, stats: TunedStats): void;
  removeOwnerDrones(ownerId: string): void;
  spawnInitialDrones(owner: RuntimePlayer, now: number): void;
  spendBotPoints(player: RuntimePlayer): void;
  advanceBotClass(player: RuntimePlayer): void;
  safeSpawn(): Vector2;
}

export function tunedStatsFor(player: RuntimePlayer): TunedStats {
  const base = CLASS_DEFINITIONS[player.playerClass];
  const modifier = PASSIVE_MODIFIER_DEFINITIONS[player.passiveModifier ?? 'standard'];
  return {
    maxHealth: Math.round(base.maxHealth * (1 + player.upgrades.maxHealth * 0.09) * modifier.healthMultiplier),
    regen: base.regen + player.upgrades.regen * 0.5,
    acceleration: base.acceleration * (1 + player.upgrades.moveSpeed * 0.018) * modifier.moveMultiplier,
    moveSpeed: base.moveSpeed * (1 + player.upgrades.moveSpeed * 0.03) * modifier.moveMultiplier,
    reload: Math.max(0.09, base.reload * modifier.reloadMultiplier * Math.pow(0.95, player.upgrades.reload)),
    projectileSpeed: base.projectileSpeed * (1 + player.upgrades.projectileSpeed * 0.04) * modifier.projectileSpeedMultiplier,
    projectileLife: base.projectileLife,
    damage: base.damage * (1 + player.upgrades.damage * 0.07),
    projectileRadius: base.projectileRadius,
    penetration: base.penetration * (1 + player.upgrades.penetration * 0.085),
    bodyDamage: base.bodyDamage * (1 + player.upgrades.bodyDamage * 0.1),
    barrelCount: base.barrelCount,
    barrelSpread: base.barrelSpread,
    barrelLength: base.barrelLength,
    barrelAngles: base.barrelAngles,
    droneCount: base.droneCount,
    droneRespawn: Math.max(0.4, base.droneRespawn * Math.pow(0.96, player.upgrades.reload))
  };
}

/** Replaces exponential snowball scaling while keeping the existing upgrade UI. */
export function tuneCombatScaling<T extends MazeGame>(game: T): T {
  const internals = game as unknown as CombatInternals;

  internals.applyUpgrade = (playerId: string, upgrade: UpgradeId): boolean => {
    const player = internals.players.get(playerId);
    if (!player || player.dead || player.availablePoints <= 0 || !UPGRADE_IDS.includes(upgrade) || player.upgrades[upgrade] >= GAME.maxUpgradeLevel) return false;
    const previousMaximum = player.maxHealth;
    player.upgrades[upgrade] += 1;
    player.availablePoints -= 1;
    const stats = tunedStatsFor(player);
    player.maxHealth = stats.maxHealth;
    if (upgrade === 'maxHealth') player.health = Math.min(player.maxHealth, player.health + player.maxHealth - previousMaximum);
    return true;
  };

  internals.chooseClass = (playerId: string, target: PlayerClass): boolean => {
    const player = internals.players.get(playerId);
    if (!player || player.dead || !isValidClassChoice(player.playerClass, target, player.level)) return false;
    const healthRatio = player.health / Math.max(1, player.maxHealth);
    player.playerClass = target;
    const stats = tunedStatsFor(player);
    player.maxHealth = stats.maxHealth;
    player.health = Math.max(1, player.maxHealth * healthRatio);
    player.cooldown = Math.min(player.cooldown, stats.reload);
    internals.removeOwnerDrones(player.id);
    internals.spawnInitialDrones(player, Date.now());
    return true;
  };

  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    if (player.dead) return;
    if (player.bot) internals.updateBot(player, now);
    const stats = tunedStatsFor(player);
    const previousMaximum = Math.max(1, player.maxHealth);
    if (stats.maxHealth !== player.maxHealth) {
      const healthRatio = player.health / previousMaximum;
      player.maxHealth = stats.maxHealth;
      player.health = Math.max(1, Math.min(player.maxHealth, player.maxHealth * healthRatio));
    }
    player.invulnerable = now < player.invulnerableUntil;
    const desired = { x: player.move.x * stats.moveSpeed, y: player.move.y * stats.moveSpeed };
    player.velocity = moveVectorToward(player.velocity, desired, stats.acceleration * dt);
    const moved = moveCircle(player.position, player.velocity, dt, GAME.playerRadius);
    player.position = moved.position;
    player.velocity = moved.velocity;
    if (Math.hypot(player.aim.x, player.aim.y) > 0.01) player.angle = Math.atan2(player.aim.y, player.aim.x);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (now - player.lastDamageAt > 3500 && player.health < player.maxHealth) {
      player.health = Math.min(player.maxHealth, player.health + stats.regen * dt);
    }
    if (stats.droneCount > 0) internals.maintainDrones(player, stats, now);
    else if (player.primary && player.cooldown <= 0) {
      internals.fire(player, stats);
      player.cooldown = stats.reload;
    }
  };

  internals.respawn = (player: RuntimePlayer, now: number): void => {
    const retainedLevel = Math.max(1, player.respawnLevel);
    player.playerClass = classAvailableAtLevel(player.playerClass, retainedLevel);
    player.position = internals.safeSpawn();
    player.velocity = { x: 0, y: 0 };
    player.level = retainedLevel;
    player.xp = xpAtLevelStart(retainedLevel);
    player.xpForNextLevel = xpThresholdForLevel(retainedLevel);
    player.availablePoints = upgradePointsAtLevel(retainedLevel);
    player.upgrades = EMPTY_UPGRADES();
    player.score = Math.floor(player.score * 0.5);
    player.streak = 0;
    player.bestStreak = 0;
    player.dead = false;
    player.health = tunedStatsFor(player).maxHealth;
    player.maxHealth = player.health;
    player.invulnerable = true;
    player.invulnerableUntil = now + GAME.respawnInvulnerabilityMs;
    player.lastDamageAt = now;
    player.canRespawnAt = 0;
    player.autoRespawnAt = 0;
    player.killerName = '';
    if (player.bot) {
      internals.spendBotPoints(player);
      internals.advanceBotClass(player);
    }
    internals.spawnInitialDrones(player, now);
  };

  return game;
}
