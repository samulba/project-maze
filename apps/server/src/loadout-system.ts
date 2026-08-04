import {
  ACTIVE_MODULE_DEFINITIONS,
  DEFAULT_ACTIVE_MODULE,
  DEFAULT_PASSIVE_MODIFIER,
  PASSIVE_MODIFIER_DEFINITIONS,
  type ActiveModuleId,
  type GameplayWorldExtension,
  type PassiveModifierId,
  type PlayerGameplaySnapshot
} from '@project-maze/shared/gameplay';
import { GAME, type InputMessage, type PlayerSnapshot, type Vector2, type WorldSnapshot } from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { clampMagnitude, distanceSquared, normalize } from './physics.js';
import { moveCircle } from './world.js';

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  invulnerableUntil: number;
  lastDamageAt: number;
  bot: unknown | null;
  passiveModifier?: PassiveModifierId;
}

interface RuntimeProjectile {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
  integrity: number;
}

interface RuntimeDrone {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
}

interface LoadoutInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  drones: Map<string, RuntimeDrone>;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

interface LoadoutState {
  activeModule: ActiveModuleId;
  passiveModifier: PassiveModifierId;
  readyAt: number;
  activeUntil: number;
  barrierHealth: number;
  barrierMaxHealth: number;
  repairStartedAt: number;
  repairLastTickAt: number;
  repairEndsAt: number;
}

interface GameLoadoutState {
  players: Map<string, LoadoutState>;
}

const states = new WeakMap<MazeGame, GameLoadoutState>();
const stateFor = (game: MazeGame): GameLoadoutState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: GameLoadoutState = { players: new Map() };
  states.set(game, created);
  return created;
};

const loadoutFor = (game: MazeGame, playerId: string): LoadoutState => {
  const state = stateFor(game);
  const existing = state.players.get(playerId);
  if (existing) return existing;
  const created: LoadoutState = {
    activeModule: DEFAULT_ACTIVE_MODULE,
    passiveModifier: DEFAULT_PASSIVE_MODIFIER,
    readyAt: 0,
    activeUntil: 0,
    barrierHealth: 0,
    barrierMaxHealth: 70,
    repairStartedAt: 0,
    repairLastTickAt: 0,
    repairEndsAt: 0
  };
  state.players.set(playerId, created);
  return created;
};

const cancelRepair = (loadout: LoadoutState): void => {
  loadout.repairStartedAt = 0;
  loadout.repairLastTickAt = 0;
  loadout.repairEndsAt = 0;
  if (loadout.activeModule === 'repair') loadout.activeUntil = 0;
};

const frontAttack = (target: RuntimePlayer, attacker: RuntimePlayer): boolean => {
  const direction = normalize({
    x: attacker.position.x - target.position.x,
    y: attacker.position.y - target.position.y
  });
  const facing = { x: Math.cos(target.angle), y: Math.sin(target.angle) };
  return direction.x * facing.x + direction.y * facing.y >= 0.28;
};

const gameplaySnapshot = (game: MazeGame, player: RuntimePlayer, now: number): PlayerGameplaySnapshot => {
  const loadout = loadoutFor(game, player.id);
  return {
    activeModule: loadout.activeModule,
    passiveModifier: loadout.passiveModifier,
    moduleReadyAt: loadout.readyAt,
    moduleActiveUntil: loadout.activeUntil,
    moduleCharge: loadout.readyAt <= now ? 1 : Math.max(0, 1 - (loadout.readyAt - now) / ACTIVE_MODULE_DEFINITIONS[loadout.activeModule].cooldownMs),
    barrierHealth: loadout.barrierHealth,
    barrierMaxHealth: loadout.barrierMaxHealth,
    repairing: loadout.repairEndsAt > now,
    bountyValue: 0
  };
};

export function equipLoadout(
  game: MazeGame,
  playerId: string,
  activeModule: ActiveModuleId,
  passiveModifier: PassiveModifierId,
  now = Date.now()
): boolean {
  const internals = game as unknown as LoadoutInternals;
  const player = internals.players.get(playerId);
  if (!player || (!player.dead && !player.invulnerable)) return false;

  const loadout = loadoutFor(game, playerId);
  const previousMaximum = Math.max(1, player.maxHealth);
  const healthRatio = player.health / previousMaximum;
  loadout.activeModule = activeModule;
  loadout.passiveModifier = passiveModifier;
  loadout.activeUntil = 0;
  loadout.barrierHealth = 0;
  cancelRepair(loadout);
  loadout.readyAt = Math.max(loadout.readyAt, now + 750);
  player.passiveModifier = passiveModifier;

  const nextStats = tunedStatsFor(player);
  player.maxHealth = nextStats.maxHealth;
  player.health = player.dead ? 0 : Math.max(1, Math.min(player.maxHealth, player.maxHealth * healthRatio));
  return true;
}

export function activateModule(game: MazeGame, playerId: string, now = Date.now()): boolean {
  const internals = game as unknown as LoadoutInternals;
  const player = internals.players.get(playerId);
  if (!player || player.dead) return false;

  const loadout = loadoutFor(game, playerId);
  const definition = ACTIVE_MODULE_DEFINITIONS[loadout.activeModule];
  if (now < loadout.readyAt || now < loadout.activeUntil) return false;

  let dashDirection: Vector2 | null = null;
  if (loadout.activeModule === 'dash') {
    const movement = clampMagnitude(player.move, 1);
    dashDirection = Math.hypot(movement.x, movement.y) > 0.12 ? normalize(movement) : normalize(player.aim);
    if (Math.hypot(dashDirection.x, dashDirection.y) < 0.01) return false;
  }
  if (loadout.activeModule === 'repair' && player.health >= player.maxHealth - 0.5) return false;

  player.invulnerable = false;
  player.invulnerableUntil = 0;
  loadout.readyAt = now + definition.cooldownMs;
  loadout.activeUntil = now + definition.activeMs;

  if (loadout.activeModule === 'dash' && dashDirection) {
    const moved = moveCircle(player.position, { x: dashDirection.x * 1_050, y: dashDirection.y * 1_050 }, 0.18, GAME.playerRadius);
    player.position = moved.position;
    player.velocity = { x: dashDirection.x * 480, y: dashDirection.y * 480 };
    player.primary = false;
    player.secondary = false;
    player.cooldown = Math.max(player.cooldown, 0.32);
    return true;
  }

  if (loadout.activeModule === 'repulse') {
    const radius = 195;
    for (const target of internals.players.values()) {
      if (target.id === player.id || target.dead || distanceSquared(target.position, player.position) > radius * radius) continue;
      const direction = normalize({ x: target.position.x - player.position.x, y: target.position.y - player.position.y });
      const strength = 520 * (1 - Math.min(1, Math.sqrt(distanceSquared(target.position, player.position)) / radius) * 0.4);
      target.velocity.x += direction.x * strength;
      target.velocity.y += direction.y * strength;
    }
    for (const drone of internals.drones.values()) {
      if (drone.ownerId === player.id || distanceSquared(drone.position, player.position) > radius * radius) continue;
      const direction = normalize({ x: drone.position.x - player.position.x, y: drone.position.y - player.position.y });
      drone.velocity.x += direction.x * 720;
      drone.velocity.y += direction.y * 720;
    }
    for (const projectile of internals.projectiles.values()) {
      if (projectile.ownerId === player.id || distanceSquared(projectile.position, player.position) > radius * radius) continue;
      const direction = normalize({ x: projectile.position.x - player.position.x, y: projectile.position.y - player.position.y });
      const speed = Math.max(260, Math.hypot(projectile.velocity.x, projectile.velocity.y) * 0.82);
      projectile.velocity = { x: direction.x * speed, y: direction.y * speed };
      projectile.integrity -= 9;
    }
    return true;
  }

  if (loadout.activeModule === 'barrier') {
    loadout.barrierMaxHealth = 70;
    loadout.barrierHealth = loadout.barrierMaxHealth;
    player.primary = false;
    player.secondary = false;
    return true;
  }

  loadout.repairStartedAt = now;
  loadout.repairLastTickAt = now;
  loadout.repairEndsAt = now + definition.activeMs;
  player.primary = false;
  player.secondary = false;
  return true;
}

export function tuneLoadoutSystem<T extends MazeGame>(game: T): T {
  const internals = game as unknown as LoadoutInternals;

  const originalApplyInput = game.applyInput.bind(game);
  game.applyInput = ((playerId: string, input: InputMessage): void => {
    originalApplyInput(playerId, input);
    const player = internals.players.get(playerId);
    if (!player) return;
    const loadout = loadoutFor(game, playerId);
    const now = Date.now();
    const moving = Math.hypot(input.move.x, input.move.y) > 0.18;
    if (loadout.repairEndsAt > now && (moving || input.primary || input.secondary)) cancelRepair(loadout);
    if (loadout.activeModule === 'barrier' && loadout.activeUntil > now) {
      player.primary = false;
      player.secondary = false;
    }
    if (loadout.activeModule === 'dash' && loadout.activeUntil > now) player.primary = false;
  }) as T['applyInput'];

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    const loadout = loadoutFor(game, target.id);
    if (loadout.repairEndsAt > now) cancelRepair(loadout);

    let remainingDamage = Math.max(0, damage);
    const attacker = attackerId ? internals.players.get(attackerId) : undefined;
    if (
      attacker &&
      loadout.activeModule === 'barrier' &&
      loadout.activeUntil > now &&
      loadout.barrierHealth > 0 &&
      frontAttack(target, attacker)
    ) {
      const absorbed = Math.min(loadout.barrierHealth, remainingDamage);
      loadout.barrierHealth -= absorbed;
      remainingDamage -= absorbed;
      if (loadout.barrierHealth <= 0) loadout.activeUntil = 0;
    }

    if (attacker) {
      const attackerLoadout = loadoutFor(game, attacker.id);
      if (attackerLoadout.activeModule === 'dash' && attackerLoadout.activeUntil > now) remainingDamage *= 0.25;
    }
    if (remainingDamage > 0) originalDamagePlayer(target, remainingDamage, attackerId, now);
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    for (const player of internals.players.values()) {
      const loadout = loadoutFor(game, player.id);
      player.passiveModifier = loadout.passiveModifier;
      if (loadout.activeModule === 'barrier' && loadout.activeUntil <= now) loadout.barrierHealth = 0;
      if (player.dead || loadout.repairEndsAt <= now) {
        if (loadout.repairEndsAt > 0 && loadout.repairEndsAt <= now) cancelRepair(loadout);
        continue;
      }
      const windupEndsAt = loadout.repairStartedAt + 800;
      if (now <= windupEndsAt) continue;
      const from = Math.max(windupEndsAt, loadout.repairLastTickAt);
      const elapsedMs = Math.max(0, now - from);
      loadout.repairLastTickAt = now;
      const healTotal = 28 + player.maxHealth * 0.08;
      const healDuration = Math.max(1, loadout.repairEndsAt - windupEndsAt);
      player.health = Math.min(player.maxHealth, player.health + healTotal * elapsedMs / healDuration);
    }
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    const gameplay: Record<string, PlayerGameplaySnapshot> = {};
    for (const player of snapshot.players) {
      const runtime = internals.players.get(player.id);
      if (runtime) gameplay[player.id] = gameplaySnapshot(game, runtime, now);
    }
    snapshot.gameplay = gameplay;
    snapshot.eliteShapeIds ??= [];
    snapshot.arenaEvent ??= null;
    snapshot.bountyTargetId ??= null;
    snapshot.bountyValue ??= 0;
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stateFor(game).players.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

export function passiveModifierFor(game: MazeGame, playerId: string): PassiveModifierId {
  return loadoutFor(game, playerId).passiveModifier;
}

export function modifierDefinition(id: PassiveModifierId) {
  return PASSIVE_MODIFIER_DEFINITIONS[id];
}
