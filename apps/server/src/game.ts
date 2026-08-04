import crypto from 'node:crypto';
import {
  GAME,
  UPGRADE_IDS,
  xpThresholdForLevel,
  type DroneSnapshot,
  type InputMessage,
  type KillEvent,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type UpgradeId,
  type UpgradeLevels,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import { createShape, isFree, randomSpawn, SHAPE_REWARDS, WALLS } from './world.js';

interface BaseClassStats {
  maxHealth: number;
  regen: number;
  moveSpeed: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  damage: number;
  projectileRadius: number;
}

interface BotState {
  targetPlayerId: string | null;
  targetShapeId: string | null;
  strafe: number;
  rethinkAt: number;
}

interface GamePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  shooting: boolean;
  lastInput: number;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  bot: BotState | null;
}

interface GameProjectile extends ProjectileSnapshot {
  velocity: Vector2;
  damage: number;
  life: number;
}

interface GameDrone extends DroneSnapshot {
  slot: number;
  hitCooldown: number;
}

const CLASS_STATS: Record<PlayerClass, BaseClassStats> = {
  shooter: { maxHealth: 100, regen: 1.8, moveSpeed: 255, reload: 0.21, projectileSpeed: 780, projectileLife: 1.5, damage: 18, projectileRadius: 7 },
  sniper: { maxHealth: 84, regen: 1.4, moveSpeed: 226, reload: 0.76, projectileSpeed: 1180, projectileLife: 2.15, damage: 48, projectileRadius: 8 },
  drone: { maxHealth: 108, regen: 2.1, moveSpeed: 238, reload: 0.48, projectileSpeed: 0, projectileLife: 0, damage: 15, projectileRadius: 0 }
};

const EMPTY_UPGRADES = (): UpgradeLevels => ({ maxHealth: 0, regen: 0, moveSpeed: 0, reload: 0, damage: 0, projectileSpeed: 0 });

const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 0.0001) return { x: 0, y: 0 };
  return { x: vector.x / Math.max(1, length), y: vector.y / Math.max(1, length) };
};

const distanceSquared = (a: Vector2, b: Vector2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

function derivedStats(player: GamePlayer): BaseClassStats {
  const base = CLASS_STATS[player.playerClass];
  return {
    maxHealth: Math.round(base.maxHealth * (1 + player.upgrades.maxHealth * 0.13)),
    regen: base.regen + player.upgrades.regen * 0.65,
    moveSpeed: base.moveSpeed * (1 + player.upgrades.moveSpeed * 0.045),
    reload: Math.max(0.08, base.reload * Math.pow(0.94, player.upgrades.reload)),
    projectileSpeed: base.projectileSpeed * (1 + player.upgrades.projectileSpeed * 0.055),
    projectileLife: base.projectileLife,
    damage: base.damage * (1 + player.upgrades.damage * 0.09),
    projectileRadius: base.projectileRadius
  };
}

export class MazeGame {
  private readonly players = new Map<string, GamePlayer>();
  private readonly projectiles = new Map<string, GameProjectile>();
  private readonly drones = new Map<string, GameDrone>();
  private readonly shapes = new Map<string, ShapeSnapshot>();
  private readonly shapeRespawns: number[] = [];
  private readonly killfeed: KillEvent[] = [];
  private tick = 0;
  private eventId = 0;

  constructor(botCount = 7) {
    for (let i = 0; i < GAME.shapeTargetCount; i += 1) {
      const shape = createShape(`shape-${i}`);
      this.shapes.set(shape.id, shape);
    }
    const botNames = ['Vektor', 'Nyx', 'Orbit', 'Kairo', 'Mako', 'Echo', 'Rift', 'Nova', 'Flux', 'Onyx'];
    const botClasses: PlayerClass[] = ['shooter', 'sniper', 'drone'];
    for (let index = 0; index < Math.max(0, Math.min(14, botCount)); index += 1) {
      this.addBot(botNames[index % botNames.length] ?? `Bot ${index + 1}`, botClasses[index % botClasses.length] ?? 'shooter');
    }
  }

  addPlayer(name: string, playerClass: PlayerClass): string {
    return this.createPlayer(name, playerClass, false);
  }

  private addBot(name: string, playerClass: PlayerClass): string {
    return this.createPlayer(name, playerClass, true);
  }

  private createPlayer(name: string, playerClass: PlayerClass, isBot: boolean): string {
    const id = crypto.randomUUID();
    const upgrades = EMPTY_UPGRADES();
    const base = CLASS_STATS[playerClass];
    const player: GamePlayer = {
      id,
      name,
      playerClass,
      position: randomSpawn(),
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: base.maxHealth,
      maxHealth: base.maxHealth,
      level: 1,
      xp: 0,
      xpForNextLevel: xpThresholdForLevel(1),
      availablePoints: 0,
      upgrades,
      score: 0,
      kills: 0,
      deaths: 0,
      invulnerable: true,
      isBot,
      move: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
      shooting: false,
      lastInput: -1,
      cooldown: 0,
      lastDamageAt: Date.now(),
      invulnerableUntil: Date.now() + GAME.respawnInvulnerabilityMs,
      bot: isBot ? { targetPlayerId: null, targetShapeId: null, strafe: Math.random() > 0.5 ? 1 : -1, rethinkAt: 0 } : null
    };
    this.players.set(id, player);
    if (playerClass === 'drone') this.ensureDrones(player);
    return id;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    for (const [projectileId, projectile] of this.projectiles) if (projectile.ownerId === id) this.projectiles.delete(projectileId);
    for (const [droneId, drone] of this.drones) if (drone.ownerId === id) this.drones.delete(droneId);
  }

  applyInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (!player || input.sequence <= player.lastInput) return;
    player.lastInput = input.sequence;
    player.move = normalize(input.move);
    player.aim = normalize(input.aim);
    player.shooting = input.shooting;
  }

  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean {
    const player = this.players.get(playerId);
    if (!player || player.availablePoints <= 0 || !UPGRADE_IDS.includes(upgrade) || player.upgrades[upgrade] >= GAME.maxUpgradeLevel) return false;
    const oldMaxHealth = player.maxHealth;
    player.upgrades[upgrade] += 1;
    player.availablePoints -= 1;
    const stats = derivedStats(player);
    player.maxHealth = stats.maxHealth;
    if (upgrade === 'maxHealth') player.health = Math.min(player.maxHealth, player.health + (player.maxHealth - oldMaxHealth));
    return true;
  }

  step(dt: number, now = Date.now()): void {
    this.tick += 1;
    this.spawnQueuedShapes(now);
    for (const player of this.players.values()) this.stepPlayer(player, dt, now);
    this.stepDrones(dt, now);
    this.stepProjectiles(dt, now);
  }

  snapshot(selfId: string | null, now = Date.now()): WorldSnapshot {
    const players = [...this.players.values()].map((player): PlayerSnapshot => ({
      id: player.id,
      name: player.name,
      playerClass: player.playerClass,
      position: { ...player.position },
      velocity: { ...player.velocity },
      angle: player.angle,
      health: player.health,
      maxHealth: player.maxHealth,
      level: player.level,
      xp: player.xp,
      xpForNextLevel: player.xpForNextLevel,
      availablePoints: player.availablePoints,
      upgrades: { ...player.upgrades },
      score: player.score,
      kills: player.kills,
      deaths: player.deaths,
      invulnerable: player.invulnerable,
      isBot: player.isBot
    }));
    return {
      type: 'snapshot',
      selfId,
      tick: this.tick,
      serverTime: now,
      players,
      projectiles: [...this.projectiles.values()].map(({ velocity: _velocity, damage: _damage, life: _life, ...projectile }) => ({ ...projectile, position: { ...projectile.position } })),
      drones: [...this.drones.values()].map(({ slot: _slot, hitCooldown: _cooldown, ...drone }) => ({ ...drone, position: { ...drone.position } })),
      shapes: [...this.shapes.values()].map((shape) => ({ ...shape, position: { ...shape.position } })),
      walls: WALLS,
      leaderboard: players.sort((a, b) => b.score - a.score).slice(0, 8).map(({ id, name, score, level, isBot }) => ({ id, name, score, level, isBot })),
      killfeed: this.killfeed.slice(-6)
    };
  }

  get playerCount(): number {
    return this.players.size;
  }

  get humanCount(): number {
    return [...this.players.values()].filter((player) => !player.isBot).length;
  }

  private stepPlayer(player: GamePlayer, dt: number, now: number): void {
    if (player.bot) this.updateBot(player, now);
    const stats = derivedStats(player);
    player.maxHealth = stats.maxHealth;
    player.invulnerable = now < player.invulnerableUntil;
    const move = normalize(player.move);
    player.velocity = { x: move.x * stats.moveSpeed, y: move.y * stats.moveSpeed };
    const nextX = { x: player.position.x + player.velocity.x * dt, y: player.position.y };
    const nextY = { x: player.position.x, y: player.position.y + player.velocity.y * dt };
    if (isFree(nextX, GAME.playerRadius)) player.position.x = nextX.x;
    if (isFree(nextY, GAME.playerRadius)) player.position.y = nextY.y;
    if (player.aim.x !== 0 || player.aim.y !== 0) player.angle = Math.atan2(player.aim.y, player.aim.x);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (now - player.lastDamageAt > 4000 && player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + stats.regen * dt);
    if (player.playerClass !== 'drone' && player.shooting && player.cooldown <= 0 && (player.aim.x !== 0 || player.aim.y !== 0)) {
      this.fireProjectile(player, stats);
      player.cooldown = stats.reload;
    }
  }

  private fireProjectile(player: GamePlayer, stats: BaseClassStats): void {
    const aim = normalize(player.aim);
    const id = crypto.randomUUID();
    const muzzle = GAME.playerRadius + 16;
    this.projectiles.set(id, {
      id,
      ownerId: player.id,
      position: { x: player.position.x + aim.x * muzzle, y: player.position.y + aim.y * muzzle },
      velocity: { x: aim.x * stats.projectileSpeed, y: aim.y * stats.projectileSpeed },
      damage: stats.damage,
      radius: stats.projectileRadius,
      life: stats.projectileLife,
      kind: 'bullet'
    });
  }

  private stepProjectiles(dt: number, now: number): void {
    for (const projectile of [...this.projectiles.values()]) {
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
      projectile.life -= dt;
      if (projectile.life <= 0 || !isFree(projectile.position, projectile.radius)) {
        this.projectiles.delete(projectile.id);
        continue;
      }
      const shape = [...this.shapes.values()].find((candidate) => distanceSquared(candidate.position, projectile.position) <= Math.pow(candidate.radius + projectile.radius, 2));
      if (shape) {
        this.damageShape(shape, projectile.damage, projectile.ownerId, now);
        this.projectiles.delete(projectile.id);
        continue;
      }
      const target = [...this.players.values()].find((candidate) => candidate.id !== projectile.ownerId && !candidate.invulnerable && distanceSquared(candidate.position, projectile.position) <= Math.pow(GAME.playerRadius + projectile.radius, 2));
      if (target) {
        this.damagePlayer(target, projectile.damage, projectile.ownerId, now);
        this.projectiles.delete(projectile.id);
      }
    }
  }

  private ensureDrones(owner: GamePlayer): void {
    const owned = [...this.drones.values()].filter((drone) => drone.ownerId === owner.id);
    const desired = Math.min(7, 4 + Math.floor(owner.level / 8));
    for (let slot = owned.length; slot < desired; slot += 1) {
      const id = crypto.randomUUID();
      this.drones.set(id, { id, ownerId: owner.id, position: { ...owner.position }, angle: 0, health: 40, slot, hitCooldown: 0 });
    }
  }

  private stepDrones(dt: number, now: number): void {
    for (const drone of this.drones.values()) {
      const owner = this.players.get(drone.ownerId);
      if (!owner) {
        this.drones.delete(drone.id);
        continue;
      }
      drone.hitCooldown = Math.max(0, drone.hitCooldown - dt);
      const aim = normalize(owner.aim);
      const orbitAngle = now / 850 + drone.slot * (Math.PI * 2 / Math.max(1, 4 + Math.floor(owner.level / 8)));
      const orbit = { x: owner.position.x + Math.cos(orbitAngle) * 78, y: owner.position.y + Math.sin(orbitAngle) * 78 };
      const attack = { x: owner.position.x + aim.x * 420, y: owner.position.y + aim.y * 420 };
      const target = owner.shooting && (aim.x !== 0 || aim.y !== 0) ? attack : orbit;
      const direction = normalize({ x: target.x - drone.position.x, y: target.y - drone.position.y });
      const droneSpeed = 430 * (1 + owner.upgrades.projectileSpeed * 0.04);
      const next = { x: drone.position.x + direction.x * droneSpeed * dt, y: drone.position.y + direction.y * droneSpeed * dt };
      if (isFree(next, 12)) drone.position = next;
      else drone.position = { x: drone.position.x - direction.x * 10, y: drone.position.y - direction.y * 10 };
      drone.angle = Math.atan2(direction.y, direction.x);
      if (drone.hitCooldown > 0) continue;
      const shape = [...this.shapes.values()].find((candidate) => distanceSquared(candidate.position, drone.position) <= Math.pow(candidate.radius + 12, 2));
      if (shape) {
        this.damageShape(shape, derivedStats(owner).damage, owner.id, now);
        drone.hitCooldown = derivedStats(owner).reload;
        continue;
      }
      const targetPlayer = [...this.players.values()].find((candidate) => candidate.id !== owner.id && !candidate.invulnerable && distanceSquared(candidate.position, drone.position) <= Math.pow(GAME.playerRadius + 12, 2));
      if (targetPlayer) {
        this.damagePlayer(targetPlayer, derivedStats(owner).damage, owner.id, now);
        drone.hitCooldown = derivedStats(owner).reload;
      }
    }
  }

  private damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void {
    shape.health -= damage;
    if (shape.health > 0) return;
    this.shapes.delete(shape.id);
    this.shapeRespawns.push(now + 1800 + Math.random() * 2200);
    const owner = this.players.get(ownerId);
    if (owner) this.awardXp(owner, SHAPE_REWARDS[shape.kind]);
  }

  private damagePlayer(target: GamePlayer, damage: number, attackerId: string, now: number): void {
    if (target.invulnerable) return;
    target.health -= damage;
    target.lastDamageAt = now;
    if (target.health > 0) return;
    const attacker = this.players.get(attackerId);
    if (attacker && attacker.id !== target.id) {
      attacker.kills += 1;
      this.awardXp(attacker, 150 + target.level * 18);
      this.killfeed.push({ id: ++this.eventId, killer: attacker.name, victim: target.name, at: now });
      if (this.killfeed.length > 12) this.killfeed.shift();
    }
    target.deaths += 1;
    this.respawn(target, now);
  }

  private awardXp(player: GamePlayer, amount: number): void {
    player.xp += amount;
    player.score += amount;
    while (player.xp >= player.xpForNextLevel) {
      player.level += 1;
      player.availablePoints += 1;
      player.xpForNextLevel = xpThresholdForLevel(player.level);
      if (player.playerClass === 'drone') this.ensureDrones(player);
    }
    if (player.bot) this.spendBotPoints(player);
  }

  private updateBot(player: GamePlayer, now: number): void {
    const bot = player.bot;
    if (!bot) return;
    if (now >= bot.rethinkAt) {
      const enemies = [...this.players.values()].filter((candidate) => candidate.id !== player.id);
      enemies.sort((a, b) => distanceSquared(player.position, a.position) - distanceSquared(player.position, b.position));
      const nearestEnemy = enemies[0];
      const nearestDistance = nearestEnemy ? Math.sqrt(distanceSquared(player.position, nearestEnemy.position)) : Infinity;
      if (nearestEnemy && nearestDistance < 900) {
        bot.targetPlayerId = nearestEnemy.id;
        bot.targetShapeId = null;
      } else {
        const nearbyShapes = [...this.shapes.values()].sort((a, b) => distanceSquared(player.position, a.position) - distanceSquared(player.position, b.position));
        bot.targetShapeId = nearbyShapes[0]?.id ?? null;
        bot.targetPlayerId = null;
      }
      bot.strafe = Math.random() > 0.5 ? 1 : -1;
      bot.rethinkAt = now + 420 + Math.random() * 720;
    }
    const target = bot.targetPlayerId ? this.players.get(bot.targetPlayerId)?.position : bot.targetShapeId ? this.shapes.get(bot.targetShapeId)?.position : undefined;
    if (!target) {
      bot.rethinkAt = 0;
      player.move = { x: 0, y: 0 };
      player.shooting = false;
      return;
    }
    const delta = { x: target.x - player.position.x, y: target.y - player.position.y };
    const direction = normalize(delta);
    const distance = Math.hypot(delta.x, delta.y);
    const preferred = player.playerClass === 'sniper' ? 560 : player.playerClass === 'drone' ? 360 : 330;
    const radial = distance > preferred + 80 ? 1 : distance < preferred - 100 ? -0.72 : 0.08;
    const strafe = distance < 760 ? 0.58 * bot.strafe : 0;
    player.move = normalize({ x: direction.x * radial - direction.y * strafe, y: direction.y * radial + direction.x * strafe });
    player.aim = direction;
    player.shooting = distance < (player.playerClass === 'sniper' ? 1200 : 760);
  }

  private spendBotPoints(player: GamePlayer): void {
    const preferences: Record<PlayerClass, UpgradeId[]> = {
      shooter: ['damage', 'reload', 'moveSpeed', 'projectileSpeed', 'maxHealth', 'regen'],
      sniper: ['damage', 'projectileSpeed', 'reload', 'moveSpeed', 'maxHealth', 'regen'],
      drone: ['damage', 'reload', 'projectileSpeed', 'moveSpeed', 'maxHealth', 'regen']
    };
    for (const upgrade of preferences[player.playerClass]) {
      while (player.availablePoints > 0 && player.upgrades[upgrade] < GAME.maxUpgradeLevel) this.applyUpgrade(player.id, upgrade);
      if (player.availablePoints <= 0) break;
    }
  }

  private respawn(player: GamePlayer, now: number): void {
    player.position = randomSpawn();
    player.velocity = { x: 0, y: 0 };
    player.level = 1;
    player.xp = 0;
    player.xpForNextLevel = xpThresholdForLevel(1);
    player.availablePoints = 0;
    player.upgrades = EMPTY_UPGRADES();
    player.score = Math.floor(player.score * 0.35);
    player.maxHealth = CLASS_STATS[player.playerClass].maxHealth;
    player.health = player.maxHealth;
    player.lastDamageAt = now;
    player.invulnerableUntil = now + GAME.respawnInvulnerabilityMs;
    player.invulnerable = true;
    for (const [droneId, drone] of this.drones) if (drone.ownerId === player.id) this.drones.delete(droneId);
    if (player.playerClass === 'drone') this.ensureDrones(player);
  }

  private spawnQueuedShapes(now: number): void {
    this.shapeRespawns.sort((a, b) => a - b);
    while ((this.shapeRespawns[0] ?? Infinity) <= now && this.shapes.size < GAME.shapeTargetCount) {
      this.shapeRespawns.shift();
      const shape = createShape(crypto.randomUUID());
      this.shapes.set(shape.id, shape);
    }
  }
}
