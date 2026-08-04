import {
  CLASS_DEFINITIONS,
  GAME,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import { MazeGame } from './game.js';
import { SpatialHash, distanceSquared, projectileSubstepCount, resolveProjectilePair } from './physics.js';
import { SHAPE_CONFIG, isFree } from './world.js';

type RuntimePlayer = PlayerSnapshot & { bot?: unknown };
type RuntimeProjectile = ProjectileSnapshot & { damage: number; life: number };
type RuntimeShape = ShapeSnapshot;
interface GameInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  shapes: Map<string, RuntimeShape>;
  __auditDelta?: number;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  damageShape(shape: RuntimeShape, damage: number, ownerId: string, now: number): void;
  fire(...args: unknown[]): void;
  resolvePlayerCollisions(now: number): void;
  resolveShapeBodyCollisions(now: number): void;
  resolveProjectileCollisions(): void;
  stepProjectiles(dt: number, now: number): void;
}

const projectileHits = new WeakMap<object, Set<string>>();
const hitSet = (projectile: object): Set<string> => {
  const existing = projectileHits.get(projectile);
  if (existing) return existing;
  const created = new Set<string>();
  projectileHits.set(projectile, created);
  return created;
};
const bodyDamage = (player: RuntimePlayer): number => {
  const definition = CLASS_DEFINITIONS[player.playerClass];
  return definition.bodyDamage * (1 + player.upgrades.bodyDamage * 0.13);
};
const inFixedView = (position: Vector2, center: Vector2, padding = 0): boolean =>
  Math.abs(position.x - center.x) <= GAME.visibleWorldWidth / 2 + padding &&
  Math.abs(position.y - center.y) <= GAME.visibleWorldHeight / 2 + padding;

/**
 * Isolates final physics/network hardening from the gameplay class while the
 * simulation is still being split into smaller systems for the next alpha.
 */
export function hardenSimulation<T extends MazeGame>(game: T): T {
  const internals = game as unknown as GameInternals;

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    internals.__auditDelta = Math.max(0, Math.min(0.08, dt));
    originalStep(dt, now);
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now);
    const self = snapshot.players.find((player) => player.id === selfId);
    if (!self) return snapshot;
    const center = self.position;
    snapshot.players = snapshot.players.filter((player) => player.id === selfId || inFixedView(player.position, center, 48));
    snapshot.projectiles = snapshot.projectiles.filter((projectile) => inFixedView(projectile.position, center, 48));
    snapshot.drones = snapshot.drones.filter((drone) => inFixedView(drone.position, center, 48));
    snapshot.shapes = snapshot.shapes.filter((shape) => inFixedView(shape.position, center, 48));
    return snapshot;
  }) as T['snapshot'];

  const originalFire = internals.fire.bind(internals);
  internals.fire = (...args: unknown[]): void => {
    const existing = new Set(internals.projectiles.keys());
    originalFire(...args);
    for (const [id, projectile] of internals.projectiles) if (!existing.has(id)) hitSet(projectile);
  };

  internals.resolvePlayerCollisions = (now: number): void => {
    const dt = internals.__auditDelta ?? 1 / GAME.tickRate;
    const players = [...internals.players.values()].filter((player) => !player.dead);
    for (let index = 0; index < players.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < players.length; otherIndex += 1) {
        const a = players[index];
        const b = players[otherIndex];
        if (!a || !b) continue;
        const delta = { x: b.position.x - a.position.x, y: b.position.y - a.position.y };
        const distance = Math.max(0.001, Math.hypot(delta.x, delta.y));
        const overlap = GAME.playerRadius * 2 - distance;
        if (overlap <= 0) continue;
        const normal = { x: delta.x / distance, y: delta.y / distance };
        const push = overlap * 0.5;
        const nextA = { x: a.position.x - normal.x * push, y: a.position.y - normal.y * push };
        const nextB = { x: b.position.x + normal.x * push, y: b.position.y + normal.y * push };
        if (isFree(nextA, GAME.playerRadius)) a.position = nextA;
        if (isFree(nextB, GAME.playerRadius)) b.position = nextB;
        if (!a.invulnerable && !b.invulnerable) {
          internals.damagePlayer(a, bodyDamage(b) * dt * 3.2, b.id, now);
          internals.damagePlayer(b, bodyDamage(a) * dt * 3.2, a.id, now);
        }
      }
    }
  };

  internals.resolveShapeBodyCollisions = (now: number): void => {
    const dt = internals.__auditDelta ?? 1 / GAME.tickRate;
    for (const player of internals.players.values()) {
      if (player.dead || player.invulnerable) continue;
      for (const shape of internals.shapes.values()) {
        if (distanceSquared(player.position, shape.position) > Math.pow(GAME.playerRadius + shape.radius, 2)) continue;
        internals.damagePlayer(player, SHAPE_CONFIG[shape.kind].bodyDamage * dt * 3.2, null, now);
        internals.damageShape(shape, bodyDamage(player) * dt * 3.2, player.id, now);
      }
    }
  };

  internals.stepProjectiles = (dt: number, now: number): void => {
    const maximumSpeed = Math.max(0, ...[...internals.projectiles.values()].map((projectile) => Math.hypot(projectile.velocity.x, projectile.velocity.y)));
    const substeps = projectileSubstepCount(maximumSpeed, dt, GAME.projectileStepDistance);
    const subDt = dt / substeps;
    for (let step = 0; step < substeps; step += 1) {
      for (const projectile of [...internals.projectiles.values()]) {
        projectile.life -= subDt;
        if (projectile.life <= 0) { internals.projectiles.delete(projectile.id); continue; }
        const next = { x: projectile.position.x + projectile.velocity.x * subDt, y: projectile.position.y + projectile.velocity.y * subDt };
        if (!isFree(next, projectile.radius)) { internals.projectiles.delete(projectile.id); continue; }
        projectile.position = next;
        const hits = hitSet(projectile);
        const shape = [...internals.shapes.values()].find((candidate) => distanceSquared(candidate.position, projectile.position) <= Math.pow(candidate.radius + projectile.radius, 2));
        if (shape) {
          const key = `shape:${shape.id}`;
          if (!hits.has(key)) {
            hits.add(key);
            internals.damageShape(shape, projectile.damage, projectile.ownerId, now);
            projectile.integrity -= shape.maxHealth * 0.18;
          }
          if (projectile.integrity <= 0) internals.projectiles.delete(projectile.id);
          continue;
        }
        const target = [...internals.players.values()].find((candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== projectile.ownerId && distanceSquared(candidate.position, projectile.position) <= Math.pow(GAME.playerRadius + projectile.radius, 2));
        if (target) {
          const key = `player:${target.id}`;
          if (!hits.has(key)) {
            hits.add(key);
            internals.damagePlayer(target, projectile.damage, projectile.ownerId, now);
            projectile.integrity -= target.maxHealth * 0.18;
          }
          if (projectile.integrity <= 0) internals.projectiles.delete(projectile.id);
        }
      }
      internals.resolveProjectileCollisions();
    }
  };

  internals.resolveProjectileCollisions = (): void => {
    const hash = new SpatialHash<RuntimeProjectile>(64);
    hash.rebuild(internals.projectiles.values());
    const checked = new Set<string>();
    for (const projectile of [...internals.projectiles.values()]) {
      for (const other of hash.query(projectile.position, projectile.radius + 16)) {
        if (projectile.id === other.id || projectile.ownerId === other.ownerId) continue;
        const pair = projectile.id < other.id ? `${projectile.id}:${other.id}` : `${other.id}:${projectile.id}`;
        const hits = hitSet(projectile);
        const otherHits = hitSet(other);
        if (checked.has(pair) || hits.has(`projectile:${other.id}`) || otherHits.has(`projectile:${projectile.id}`)) continue;
        checked.add(pair);
        if (distanceSquared(projectile.position, other.position) <= Math.pow(projectile.radius + other.radius, 2)) {
          hits.add(`projectile:${other.id}`);
          otherHits.add(`projectile:${projectile.id}`);
          resolveProjectilePair(projectile, other);
        }
      }
    }
    for (const projectile of [...internals.projectiles.values()]) if (projectile.integrity <= 0) internals.projectiles.delete(projectile.id);
  };

  return game;
}
