import crypto from 'node:crypto';
import {
  CLASS_DEFINITIONS,
  GAME,
  type DroneSnapshot,
  type PlayerClass,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type Vector2
} from '@project-maze/shared';
import {
  PASSIVE_MODIFIER_DEFINITIONS,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { clampMagnitude, distanceSquared, moveVectorToward, normalize } from './physics.js';
import { SHAPE_CONFIG, moveCircle } from './world.js';

interface DroneArchetype {
  health: number;
  speed: number;
  acceleration: number;
  radius: number;
  orbitRadius: number;
}

const DRONE_ARCHETYPES: Partial<Record<PlayerClass, DroneArchetype>> = {
  drone: { health: 36, speed: 440, acceleration: 1450, radius: 12, orbitRadius: 82 },
  warden: { health: 32, speed: 480, acceleration: 1650, radius: 10.5, orbitRadius: 88 },
  factory: { health: 54, speed: 390, acceleration: 1250, radius: 13.5, orbitRadius: 86 },
  overseer: { health: 28, speed: 510, acceleration: 1780, radius: 9.5, orbitRadius: 94 },
  carrier: { health: 72, speed: 350, acceleration: 1050, radius: 15.5, orbitRadius: 92 },
  guardian: { health: 62, speed: 380, acceleration: 1200, radius: 13, orbitRadius: 62 },
  hive: { health: 18, speed: 530, acceleration: 1900, radius: 7.5, orbitRadius: 100 }
};

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  passiveModifier?: PassiveModifierId;
}
interface RuntimeDrone extends DroneSnapshot {
  slot: number;
  contactCooldown: number;
  gameplayRadius?: number;
}
interface DroneInternals {
  players: Map<string, RuntimePlayer>;
  drones: Map<string, RuntimeDrone>;
  shapes: Map<string, ShapeSnapshot>;
  nextDroneSpawn: Map<string, number>;
  spawnDrone(owner: RuntimePlayer, slot: number): void;
  stepDrones(dt: number, now: number): void;
  damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

const archetypeFor = (playerClass: PlayerClass): DroneArchetype => DRONE_ARCHETYPES[playerClass] ?? DRONE_ARCHETYPES.drone!;
const modifierFor = (player: RuntimePlayer) => PASSIVE_MODIFIER_DEFINITIONS[player.passiveModifier ?? 'standard'];
const damageFor = (player: RuntimePlayer): number => CLASS_DEFINITIONS[player.playerClass].damage * (1 + player.upgrades.damage * 0.07);
const reloadFor = (player: RuntimePlayer): number => Math.max(
  0.09,
  CLASS_DEFINITIONS[player.playerClass].reload * modifierFor(player).reloadMultiplier * Math.pow(0.95, player.upgrades.reload)
);
const bodyDamageFor = (player: RuntimePlayer): number => CLASS_DEFINITIONS[player.playerClass].bodyDamage * (1 + player.upgrades.bodyDamage * 0.1);

/** Gives each control-class branch its own physical drone identity. */
export function tuneDrones<T extends MazeGame>(game: T): T {
  const internals = game as unknown as DroneInternals;

  internals.spawnDrone = (owner: RuntimePlayer, slot: number): void => {
    const id = crypto.randomUUID();
    const archetype = archetypeFor(owner.playerClass);
    const maximum = archetype.health * (1 + owner.upgrades.maxHealth * 0.08) * modifierFor(owner).healthMultiplier;
    internals.drones.set(id, {
      id,
      ownerId: owner.id,
      position: { ...owner.position },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: maximum,
      maxHealth: maximum,
      slot,
      contactCooldown: 0,
      gameplayRadius: archetype.radius
    });
  };

  internals.stepDrones = (dt: number, now: number): void => {
    for (const drone of [...internals.drones.values()]) {
      const owner = internals.players.get(drone.ownerId);
      if (!owner || owner.dead) {
        internals.drones.delete(drone.id);
        continue;
      }

      const definition = CLASS_DEFINITIONS[owner.playerClass];
      const archetype = archetypeFor(owner.playerClass);
      const modifier = modifierFor(owner);
      const radius = drone.gameplayRadius ?? archetype.radius;
      const reload = reloadFor(owner);
      const damage = damageFor(owner);
      drone.contactCooldown = Math.max(0, drone.contactCooldown - dt);

      const aim = clampMagnitude(owner.aim, GAME.maxAimDistance);
      const orbitAngle = now / 850 + drone.slot * Math.PI * 2 / Math.max(1, definition.droneCount);
      const orbit = {
        x: owner.position.x + Math.cos(orbitAngle) * archetype.orbitRadius,
        y: owner.position.y + Math.sin(orbitAngle) * archetype.orbitRadius
      };
      let target = orbit;
      if (owner.secondary) target = { x: owner.position.x - aim.x, y: owner.position.y - aim.y };
      else if (owner.primary) target = { x: owner.position.x + aim.x, y: owner.position.y + aim.y };

      const direction = normalize({ x: target.x - drone.position.x, y: target.y - drone.position.y });
      const travelMultiplier = modifier.moveMultiplier * modifier.projectileSpeedMultiplier;
      const speed = archetype.speed * travelMultiplier;
      drone.velocity = moveVectorToward(
        drone.velocity,
        { x: direction.x * speed, y: direction.y * speed },
        archetype.acceleration * travelMultiplier * dt
      );
      const moved = moveCircle(drone.position, drone.velocity, dt, radius);
      drone.position = moved.position;
      drone.velocity = moved.velocity;
      drone.angle = Math.atan2(drone.velocity.y, drone.velocity.x);
      if (drone.contactCooldown > 0) continue;

      const shape = [...internals.shapes.values()].find(
        (candidate) => distanceSquared(candidate.position, drone.position) <= Math.pow(candidate.radius + radius, 2)
      );
      if (shape) {
        internals.damageShape(shape, damage, owner.id, now);
        drone.health -= SHAPE_CONFIG[shape.kind].bodyDamage;
        drone.contactCooldown = reload;
      } else {
        const targetPlayer = [...internals.players.values()].find(
          (candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== owner.id &&
            distanceSquared(candidate.position, drone.position) <= Math.pow(GAME.playerRadius + radius, 2)
        );
        if (targetPlayer) {
          internals.damagePlayer(targetPlayer, damage, owner.id, now);
          drone.health -= bodyDamageFor(targetPlayer) * 0.5;
          drone.contactCooldown = reload;
        }
      }

      if (drone.health <= 0) {
        internals.drones.delete(drone.id);
        internals.nextDroneSpawn.set(owner.id, now + Math.max(400, definition.droneRespawn * 1000));
      }
    }
  };

  return game;
}
