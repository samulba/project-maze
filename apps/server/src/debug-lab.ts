import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  UPGRADE_IDS,
  upgradePointsAtLevel,
  xpAtLevelStart,
  xpThresholdForLevel,
  type PlayerClass,
  type PlayerSnapshot,
  type UpgradeId
} from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';

export type DebugPreset = 'blank' | 'balanced' | 'offense' | 'defense' | 'mobility';
export interface DebugBuildRequest {
  playerClass: PlayerClass;
  level: number;
  preset: DebugPreset;
}

interface RuntimePlayer extends PlayerSnapshot {
  cooldown: number;
  primary: boolean;
  secondary: boolean;
  invulnerableUntil: number;
  lastDamageAt: number;
}
interface DebugInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, { ownerId: string }>;
  removeOwnerDrones(ownerId: string): void;
  spawnInitialDrones(owner: RuntimePlayer, now: number): void;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  chooseClass(playerId: string, target: PlayerClass): boolean;
}

const PRESET_ORDER: Record<Exclude<DebugPreset, 'blank'>, UpgradeId[]> = {
  balanced: ['damage', 'reload', 'moveSpeed', 'maxHealth', 'penetration', 'regen', 'projectileSpeed', 'bodyDamage'],
  offense: ['damage', 'reload', 'penetration', 'projectileSpeed', 'moveSpeed', 'maxHealth', 'regen', 'bodyDamage'],
  defense: ['maxHealth', 'regen', 'bodyDamage', 'moveSpeed', 'damage', 'reload', 'penetration', 'projectileSpeed'],
  mobility: ['moveSpeed', 'projectileSpeed', 'reload', 'maxHealth', 'damage', 'regen', 'penetration', 'bodyDamage']
};

function lineage(target: PlayerClass): PlayerClass[] {
  const result: PlayerClass[] = [];
  let current: PlayerClass | null = target;
  while (current && current !== 'core') {
    result.unshift(current);
    current = CLASS_DEFINITIONS[current].parent;
  }
  return result;
}

export function applyDebugBuild(game: MazeGame, playerId: string, request: DebugBuildRequest, now = Date.now()): boolean {
  const internals = game as unknown as DebugInternals;
  const player = internals.players.get(playerId);
  if (!player) return false;

  const level = Math.max(CLASS_DEFINITIONS[request.playerClass].unlockLevel, Math.min(GAME.maxLevel, Math.floor(request.level)));
  internals.removeOwnerDrones(player.id);
  for (const [id, projectile] of internals.projectiles) if (projectile.ownerId === player.id) internals.projectiles.delete(id);

  player.dead = false;
  player.playerClass = 'core';
  player.level = level;
  player.xp = xpAtLevelStart(level);
  player.xpForNextLevel = xpThresholdForLevel(level);
  player.upgrades = EMPTY_UPGRADES();
  player.availablePoints = upgradePointsAtLevel(level);
  player.primary = false;
  player.secondary = false;
  player.cooldown = 0;
  player.velocity = { x: 0, y: 0 };
  player.canRespawnAt = 0;
  player.autoRespawnAt = 0;
  player.killerName = '';
  player.invulnerable = true;
  player.invulnerableUntil = now + 900;
  player.lastDamageAt = now;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;

  for (const nextClass of lineage(request.playerClass)) internals.chooseClass(player.id, nextClass);

  if (request.preset !== 'blank') {
    const order = PRESET_ORDER[request.preset];
    let index = 0;
    while (player.availablePoints > 0 && index < GAME.maxLevel * UPGRADE_IDS.length) {
      const upgrade = order[index % order.length];
      if (upgrade && player.upgrades[upgrade] < GAME.maxUpgradeLevel) internals.applyUpgrade(player.id, upgrade);
      index += 1;
      if (order.every((id) => player.upgrades[id] >= GAME.maxUpgradeLevel)) break;
    }
  }

  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  internals.removeOwnerDrones(player.id);
  internals.spawnInitialDrones(player, now);
  return true;
}

export function healDebugPlayer(game: MazeGame, playerId: string): boolean {
  const internals = game as unknown as DebugInternals;
  const player = internals.players.get(playerId);
  if (!player || player.dead) return false;
  player.health = player.maxHealth;
  player.lastDamageAt = Date.now();
  return true;
}

export function clearDebugProjectiles(game: MazeGame): void {
  const internals = game as unknown as DebugInternals;
  internals.projectiles.clear();
}
