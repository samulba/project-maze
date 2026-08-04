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
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { isFree } from './world.js';

export type DebugPreset = 'blank' | 'balanced' | 'offense' | 'defense' | 'mobility';
export interface DebugBuildRequest {
  playerClass: PlayerClass;
  level: number;
  preset: DebugPreset;
}

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  cooldown: number;
  primary: boolean;
  secondary: boolean;
  invulnerableUntil: number;
  lastDamageAt: number;
  bot: unknown | null;
}
interface DebugInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, { ownerId: string }>;
  removeOwnerDrones(ownerId: string): void;
  spawnInitialDrones(owner: RuntimePlayer, now: number): void;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  chooseClass(playerId: string, target: PlayerClass): boolean;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  updateBot(player: RuntimePlayer, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}
interface DummyRespawn {
  at: number;
  position: Vector2;
  angle: number;
  playerClass: PlayerClass;
}
interface DebugState {
  godPlayers: Set<string>;
  dummyIds: Set<string>;
  dummyRespawns: Map<string, DummyRespawn>;
  botsPaused: boolean;
}

const states = new WeakMap<MazeGame, DebugState>();
const stateFor = (game: MazeGame): DebugState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: DebugState = {
    godPlayers: new Set(),
    dummyIds: new Set(),
    dummyRespawns: new Map(),
    botsPaused: false
  };
  states.set(game, created);
  return created;
};

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

/** Adds local-only testing rules without changing production balance. */
export function tuneDebugRules<T extends MazeGame>(game: T): T {
  const internals = game as unknown as DebugInternals;
  const state = stateFor(game);

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    if (state.godPlayers.has(target.id)) return;
    originalDamagePlayer(target, damage, attackerId, now);
  };

  const originalUpdateBot = internals.updateBot.bind(internals);
  internals.updateBot = (player: RuntimePlayer, now: number): void => {
    if (state.botsPaused) {
      player.move = { x: 0, y: 0 };
      player.primary = false;
      player.secondary = false;
      return;
    }
    originalUpdateBot(player, now);
  };

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const isDummy = state.dummyIds.has(target.id);
    const respawn = isDummy ? {
      at: now + 1200,
      position: { ...target.position },
      angle: target.angle,
      playerClass: target.playerClass
    } satisfies DummyRespawn : null;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (!respawn) return;
    target.canRespawnAt = now + 86_400_000;
    target.autoRespawnAt = now + 86_400_000;
    state.dummyRespawns.set(target.id, respawn);
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    for (const [id, respawn] of state.dummyRespawns) {
      if (now < respawn.at) continue;
      const dummy = internals.players.get(id);
      if (!dummy) {
        state.dummyRespawns.delete(id);
        state.dummyIds.delete(id);
        continue;
      }
      applyDebugBuild(game, id, { playerClass: respawn.playerClass, level: GAME.maxLevel, preset: 'balanced' }, now);
      dummy.position = { ...respawn.position };
      dummy.angle = respawn.angle;
      dummy.velocity = { x: 0, y: 0 };
      dummy.move = { x: 0, y: 0 };
      dummy.aim = { x: 0, y: 0 };
      dummy.invulnerable = false;
      dummy.invulnerableUntil = 0;
      state.dummyRespawns.delete(id);
    }
  }) as T['step'];

  return game;
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
  player.move = { x: 0, y: 0 };
  player.aim = { x: GAME.maxAimDistance, y: 0 };
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

export function setDebugGodMode(game: MazeGame, playerId: string, enabled: boolean): boolean {
  const player = (game as unknown as DebugInternals).players.get(playerId);
  if (!player) return false;
  const state = stateFor(game);
  if (enabled) state.godPlayers.add(playerId);
  else state.godPlayers.delete(playerId);
  if (enabled) player.health = player.maxHealth;
  return true;
}

export function setDebugBotsPaused(game: MazeGame, paused: boolean): void {
  stateFor(game).botsPaused = paused;
}

function dummyPosition(owner: RuntimePlayer, index: number): Vector2 {
  const distances = [280, 360, 440];
  for (const distance of distances) {
    for (let offset = 0; offset < 8; offset += 1) {
      const angle = owner.angle + (offset + index) * Math.PI / 4;
      const candidate = {
        x: Math.max(50, Math.min(GAME.worldWidth - 50, owner.position.x + Math.cos(angle) * distance)),
        y: Math.max(50, Math.min(GAME.worldHeight - 50, owner.position.y + Math.sin(angle) * distance))
      };
      if (isFree(candidate, GAME.playerRadius)) return candidate;
    }
  }
  return { ...owner.position };
}

export function spawnDebugDummy(game: MazeGame, ownerId: string, playerClass: PlayerClass, now = Date.now()): string | null {
  const internals = game as unknown as DebugInternals;
  const owner = internals.players.get(ownerId);
  if (!owner) return null;
  const state = stateFor(game);
  const dummyId = game.addPlayer(`TARGET · ${CLASS_DEFINITIONS[playerClass].label}`);
  const dummy = internals.players.get(dummyId);
  if (!dummy) return null;
  dummy.isBot = true;
  dummy.bot = null;
  applyDebugBuild(game, dummyId, { playerClass, level: GAME.maxLevel, preset: 'balanced' }, now);
  dummy.position = dummyPosition(owner, state.dummyIds.size);
  dummy.angle = Math.atan2(owner.position.y - dummy.position.y, owner.position.x - dummy.position.x);
  dummy.aim = { x: 0, y: 0 };
  dummy.move = { x: 0, y: 0 };
  dummy.primary = false;
  dummy.secondary = false;
  dummy.invulnerable = false;
  dummy.invulnerableUntil = 0;
  state.dummyIds.add(dummyId);
  return dummyId;
}

export function clearDebugDummies(game: MazeGame): void {
  const state = stateFor(game);
  for (const id of state.dummyIds) game.removePlayer(id);
  state.dummyIds.clear();
  state.dummyRespawns.clear();
}
