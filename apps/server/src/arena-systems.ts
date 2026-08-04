import crypto from 'node:crypto';
import {
  GAME,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import type { ArenaEventSnapshot, GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { distanceSquared } from './physics.js';
import { createShape, isFree } from './world.js';

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface ArenaInternals {
  players: Map<string, RuntimePlayer>;
  shapes: Map<string, ShapeSnapshot>;
  damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
  awardXp(player: RuntimePlayer, amount: number): void;
}

interface ArenaState {
  eliteShapeIds: Set<string>;
  eventBonusShapeIds: Set<string>;
  nextEliteAt: number;
  event: ArenaEventSnapshot | null;
  nextEventAt: number;
  eventSpawnAt: number;
  eventId: number;
  bountyTargetId: string | null;
  bountyValue: number;
  lastBountyCheckAt: number;
  recentClaims: Map<string, number>;
}

const states = new WeakMap<MazeGame, ArenaState>();
const stateFor = (game: MazeGame): ArenaState => {
  const existing = states.get(game);
  if (existing) return existing;
  const now = Date.now();
  const created: ArenaState = {
    eliteShapeIds: new Set(),
    eventBonusShapeIds: new Set(),
    nextEliteAt: now + 18_000,
    event: null,
    nextEventAt: now + 65_000,
    eventSpawnAt: 0,
    eventId: 0,
    bountyTargetId: null,
    bountyValue: 0,
    lastBountyCheckAt: 0,
    recentClaims: new Map()
  };
  states.set(game, created);
  return created;
};

const eventCenter = (): Vector2 => ({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 });

function shapePositionInZone(center: Vector2, radius: number): Vector2 | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    const position = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance
    };
    if (isFree(position, 34)) return position;
  }
  return null;
}

function promoteElite(state: ArenaState, shape: ShapeSnapshot): void {
  if (state.eliteShapeIds.has(shape.id)) return;
  const eliteRadius = shape.radius * 1.55;
  if (!isFree(shape.position, eliteRadius + 4)) return;
  state.eliteShapeIds.add(shape.id);
  shape.radius = eliteRadius;
  shape.maxHealth = Math.round(shape.maxHealth * 4);
  shape.health = shape.maxHealth;
  shape.velocity.x *= 0.55;
  shape.velocity.y *= 0.55;
}

function pickEliteCandidate(internals: ArenaInternals, state: ArenaState, preferCenter: boolean): ShapeSnapshot | null {
  const center = eventCenter();
  const candidates = [...internals.shapes.values()].filter((shape) => {
    if (state.eliteShapeIds.has(shape.id) || !isFree(shape.position, shape.radius * 1.55 + 4)) return false;
    if (!preferCenter) return true;
    return distanceSquared(shape.position, center) <= 720 * 720;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function spawnEventShape(internals: ArenaInternals): string | null {
  const center = eventCenter();
  const position = shapePositionInZone(center, 560);
  if (!position) return null;
  const shape = createShape(crypto.randomUUID());
  shape.position = position;
  shape.velocity.x *= 0.7;
  shape.velocity.y *= 0.7;
  internals.shapes.set(shape.id, shape);
  return shape.id;
}

function updateEvent(internals: ArenaInternals, state: ArenaState, now: number): void {
  if (!state.event && now >= state.nextEventAt) {
    const startsAt = now + 10_000;
    state.event = {
      id: ++state.eventId,
      kind: 'coreSurge',
      phase: 'warning',
      startsAt,
      endsAt: startsAt + 40_000,
      center: eventCenter(),
      radius: 620
    };
    state.eventSpawnAt = startsAt;
    return;
  }

  if (!state.event) return;
  if (state.event.phase === 'warning' && now >= state.event.startsAt) state.event.phase = 'active';
  if (now >= state.event.endsAt) {
    for (const id of state.eventBonusShapeIds) internals.shapes.delete(id);
    state.eventBonusShapeIds.clear();
    state.event = null;
    state.nextEventAt = now + 120_000;
    state.eventSpawnAt = 0;
    return;
  }
  if (state.event.phase !== 'active' || now < state.eventSpawnAt) return;

  state.eventSpawnAt = now + 2_400;
  if (state.eventBonusShapeIds.size < 42) {
    for (let index = 0; index < 3; index += 1) {
      const id = spawnEventShape(internals);
      if (id) state.eventBonusShapeIds.add(id);
    }
  }
  if (state.eliteShapeIds.size < 4 && Math.random() < 0.45) {
    const candidate = pickEliteCandidate(internals, state, true);
    if (candidate) promoteElite(state, candidate);
  }
}

function bountyCandidate(internals: ArenaInternals): RuntimePlayer | null {
  const eligible = [...internals.players.values()]
    .filter((player) => !player.dead && player.level >= 10 && player.kills >= 3 && player.score >= 1_500)
    .sort((a, b) => (b.kills * 550 + b.score) - (a.kills * 550 + a.score));
  return eligible[0] ?? null;
}

function updateBounty(internals: ArenaInternals, state: ArenaState, now: number): void {
  if (now - state.lastBountyCheckAt < 1_000) return;
  state.lastBountyCheckAt = now;

  for (const [key, expiresAt] of state.recentClaims) if (expiresAt <= now) state.recentClaims.delete(key);
  const current = state.bountyTargetId ? internals.players.get(state.bountyTargetId) : undefined;
  if (current && !current.dead) {
    state.bountyValue = Math.min(1_200, 250 + current.kills * 85 + Math.floor(current.score * 0.06));
    return;
  }

  const next = bountyCandidate(internals);
  state.bountyTargetId = next?.id ?? null;
  state.bountyValue = next ? Math.min(1_200, 250 + next.kills * 85 + Math.floor(next.score * 0.06)) : 0;
}

/** Adds world-level objectives without changing the one-button combat model. */
export function tuneArenaSystems<T extends MazeGame>(game: T): T {
  const internals = game as unknown as ArenaInternals;
  const state = stateFor(game);

  const originalDamageShape = internals.damageShape.bind(internals);
  internals.damageShape = (shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void => {
    const elite = state.eliteShapeIds.has(shape.id);
    const destroyed = shape.health - Math.max(0, damage) <= 0;
    originalDamageShape(shape, damage, ownerId, now);
    if (!elite || !destroyed) return;
    state.eliteShapeIds.delete(shape.id);
    state.eventBonusShapeIds.delete(shape.id);
    const owner = internals.players.get(ownerId);
    if (owner && !owner.dead) internals.awardXp(owner, 260);
  };

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const bountyValue = target.id === state.bountyTargetId ? state.bountyValue : 0;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (bountyValue <= 0 || !attackerId || attackerId === target.id) return;
    const attacker = internals.players.get(attackerId);
    const claimKey = `${attackerId}:${target.id}`;
    if (attacker && !state.recentClaims.has(claimKey)) {
      internals.awardXp(attacker, bountyValue);
      state.recentClaims.set(claimKey, now + 120_000);
    }
    state.bountyTargetId = null;
    state.bountyValue = 0;
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    for (const id of state.eliteShapeIds) if (!internals.shapes.has(id)) state.eliteShapeIds.delete(id);
    for (const id of state.eventBonusShapeIds) if (!internals.shapes.has(id)) state.eventBonusShapeIds.delete(id);

    const eliteLimit = state.event?.phase === 'active' ? 4 : 3;
    if (now >= state.nextEliteAt && state.eliteShapeIds.size < eliteLimit) {
      const candidate = pickEliteCandidate(internals, state, state.event?.phase === 'active');
      if (candidate) promoteElite(state, candidate);
      state.nextEliteAt = now + (state.event?.phase === 'active' ? 8_000 : 22_000);
    }

    updateEvent(internals, state, now);
    updateBounty(internals, state, now);
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    snapshot.eliteShapeIds = snapshot.shapes.filter((shape) => state.eliteShapeIds.has(shape.id)).map((shape) => shape.id);
    snapshot.arenaEvent = state.event ? { ...state.event, center: { ...state.event.center } } : null;
    snapshot.bountyTargetId = state.bountyTargetId;
    snapshot.bountyValue = state.bountyValue;
    const targetGameplay = state.bountyTargetId && snapshot.gameplay ? snapshot.gameplay[state.bountyTargetId] : undefined;
    if (targetGameplay) targetGameplay.bountyValue = state.bountyValue;
    return snapshot;
  }) as T['snapshot'];

  return game;
}
