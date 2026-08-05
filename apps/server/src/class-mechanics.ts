import {
  CLASS_DEFINITIONS,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type Vector2
} from '@project-maze/shared';
import { MazeGame } from './game.js';

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  velocity: Vector2;
}
interface RuntimeProjectile extends ProjectileSnapshot {
  damage: number;
  life: number;
}
interface RuntimeStats {
  damage: number;
  projectileSpeed: number;
  penetration: number;
  barrelSpread: number;
}
interface MechanicsInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  fire(player: RuntimePlayer, stats: RuntimeStats): void;
}

const PRECISION_RECOIL: Partial<Record<PlayerClass, number>> = {
  sniper: 20,
  hunter: 16,
  railgun: 34,
  phantom: 26,
  lancer: 52,
  arbalest: 18,
  deadeye: 24
};

/** Deadeye: Bonusschaden gegen schwer verwundete Ziele (Exekution). */
const EXECUTION_THRESHOLD = 0.3;
const EXECUTION_BONUS = 1.25;

const FIRE_RECOIL: Partial<Record<PlayerClass, number>> = {
  core: 3,
  rapid: 2,
  twin: 2.5,
  repeater: 3,
  storm: 4,
  gatling: 5,
  sniper: 7,
  hunter: 6,
  railgun: 14,
  phantom: 10,
  lancer: 20,
  arbalest: 9,
  deadeye: 12,
  rammer: 2,
  crusher: 2,
  bulwark: 4,
  juggernaut: 2,
  fortress: 5,
  flanker: 2.5,
  octo: 3,
  blitz: 2,
  comet: 2
};

interface GatlingState {
  heat: number;
  lastShotAt: number;
}

const gatlingStates = new Map<string, GatlingState>();

const frontalArmor = (playerClass: PlayerClass): number => {
  if (playerClass === 'fortress') return 0.38;
  if (playerClass === 'bulwark') return 0.26;
  return 0;
};

const directionFrom = (from: Vector2, to: Vector2): Vector2 => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 0.001 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
};

/** Adds readable branch mechanics without weakening server authority. */
export function tuneClassMechanics<T extends MazeGame>(game: T): T {
  const internals = game as unknown as MechanicsInternals;

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    const attacker = attackerId ? internals.players.get(attackerId) : undefined;
    let adjustedDamage = damage;

    const armor = frontalArmor(target.playerClass);
    if (armor > 0 && attacker) {
      const toAttacker = directionFrom(target.position, attacker.position);
      const forward = { x: Math.cos(target.angle), y: Math.sin(target.angle) };
      const frontDot = forward.x * toAttacker.x + forward.y * toAttacker.y;
      if (frontDot > 0.25) adjustedDamage *= 1 - armor;
    }
    if (target.playerClass === 'juggernaut') adjustedDamage *= 0.92;
    if (
      attacker?.playerClass === 'deadeye' &&
      target.health <= target.maxHealth * EXECUTION_THRESHOLD
    ) adjustedDamage *= EXECUTION_BONUS;

    const healthBefore = target.health;
    originalDamagePlayer(target, adjustedDamage, attackerId, now);

    if (!attacker || target.dead || target.health >= healthBefore) return;
    const impulse = PRECISION_RECOIL[attacker.playerClass] ?? 0;
    if (impulse <= 0) return;
    const away = directionFrom(attacker.position, target.position);
    target.velocity.x += away.x * impulse;
    target.velocity.y += away.y * impulse;
  };

  const originalFire = internals.fire.bind(internals);
  internals.fire = (player: RuntimePlayer, stats: RuntimeStats): void => {
    const existing = new Set(internals.projectiles.keys());
    let firingStats = stats;

    if (player.playerClass === 'gatling') {
      const now = Date.now();
      const previous = gatlingStates.get(player.id);
      const heat = previous && now - previous.lastShotAt <= 720
        ? Math.min(1, previous.heat + 0.2)
        : 0.2;
      gatlingStates.set(player.id, { heat, lastShotAt: now });
      firingStats = {
        ...stats,
        barrelSpread: stats.barrelSpread * (1 - heat * 0.55)
      };
    } else {
      gatlingStates.delete(player.id);
    }

    originalFire(player, firingStats);

    const aimLength = Math.hypot(player.aim.x, player.aim.y);
    const direction = aimLength < 0.001
      ? { x: Math.cos(player.angle), y: Math.sin(player.angle) }
      : { x: player.aim.x / aimLength, y: player.aim.y / aimLength };
    const recoil = FIRE_RECOIL[player.playerClass] ?? 0;
    player.velocity.x -= direction.x * recoil;
    player.velocity.y -= direction.y * recoil;

    const movementSpeed = Math.hypot(player.velocity.x, player.velocity.y);
    for (const [id, projectile] of internals.projectiles) {
      if (existing.has(id)) continue;
      if (player.playerClass === 'phantom' && movementSpeed > CLASS_DEFINITIONS.phantom.moveSpeed * 0.55) {
        projectile.damage *= 1.1;
        projectile.integrity *= 1.08;
        projectile.maxIntegrity *= 1.08;
      }
      if (player.playerClass === 'hunter') {
        projectile.velocity.x += player.velocity.x * 0.14;
        projectile.velocity.y += player.velocity.y * 0.14;
      }
      if (player.playerClass === 'lancer') projectile.life *= 1.08;
      if (player.playerClass === 'storm') {
        projectile.integrity *= 1.18;
        projectile.maxIntegrity *= 1.18;
      }
    }
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    gatlingStates.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
