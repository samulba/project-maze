import crypto from 'node:crypto';
import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  UPGRADE_IDS,
  upgradeAppliesTo,
  respawnClassFrom,
  isValidClassChoice,
  respawnLevelFrom,
  upgradePointsAtLevel,
  xpAtLevelStart,
  xpThresholdForLevel,
  type DroneSnapshot,
  type InputMessage,
  type KillEvent,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type UpgradeId,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import {
  SpatialHash,
  clampMagnitude,
  distanceSquared,
  moveVectorToward,
  normalize,
  projectileSubstepCount,
  resolveProjectilePair
} from './physics.js';
import {
  SHAPE_CONFIG,
  createShape,
  hasLineOfSight,
  isFree,
  moveCircle,
  randomSpawn,
  stepShape,
  wallsInView
} from './world.js';

interface RuntimeStats {
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

type BotStyle = 'farmer' | 'hunter' | 'kiter' | 'brawler' | 'controller';
export interface BotState {
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
  /**
   * Die Bot-Steuerung steht GEWOLLT still (Reparatur: „erst anhalten, dann
   * reparieren"). Markierung für äußere Schichten – tuneRapidBots übersetzte
   * den Halt sonst zurück in Fahrt, und die Reparatur begann nie (Befund 79).
   */
  holdsStill?: boolean;
}
interface GamePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  lastInput: number;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  bot: BotState | null;
}
interface GameProjectile extends ProjectileSnapshot { damage: number; life: number; }
interface GameDrone extends DroneSnapshot { slot: number; contactCooldown: number; }

/*
 * Vierundzwanzig Namen fuer achtzehn Bots.
 *
 * Es waren zwoelf, und die Arena haelt seit der grossen Karte achtzehn: Ueber
 * `BOT_NAMES[index % 12]` hiessen sechs Bots wie ein anderer. Sichtbar war das
 * im Killfeed -- „Vektor eliminierte Mako" zweimal nebeneinander, mit vier
 * verschiedenen Tanks. Wer sich merken will, wer ihn gerade abgeschossen hat,
 * kann das dann nicht.
 */
export const BOT_NAMES = [
  'Vektor', 'Nyx', 'Orbit', 'Kairo', 'Mako', 'Echo', 'Rift', 'Nova',
  'Flux', 'Onyx', 'Astra', 'Mira', 'Zenit', 'Puls', 'Kobalt', 'Sirius',
  'Hydra', 'Volt', 'Kepler', 'Basalt', 'Iris', 'Titan', 'Lumen', 'Delta'
];

/**
 * Ein Name, den gerade niemand traegt.
 *
 * Der Direktor spawnt ueber die ganze Laufzeit nach; sein `spawnIndex` waechst
 * unbegrenzt, und irgendwann ist jede feste Liste einmal herum. Deshalb wird
 * nicht nur modulo gerechnet, sondern nachgesehen: Ist der Name vergeben,
 * nimmt der naechste freie den Platz. Erst wenn wirklich alle vierundzwanzig
 * stehen, gibt es eine Nummer -- das ist haesslich, aber ehrlich, und es
 * passiert nur jenseits von vierundzwanzig gleichzeitigen Bots.
 */
export function botNameFor(index: number, vergeben: ReadonlySet<string>): string {
  for (let versatz = 0; versatz < BOT_NAMES.length; versatz += 1) {
    const kandidat = BOT_NAMES[(index + versatz) % BOT_NAMES.length]!;
    if (!vergeben.has(kandidat)) return kandidat;
  }
  return `Bot ${index + 1}`;
}
/**
 * Stil-Verteilung der Bots. Farmer sind die friedlichsten Gegner – sie räumen
 * Formen ab und suchen nur gelegentlich Streit. Ihr Anteil steigt bewusst von
 * 20 % auf 40 % (Feedback Sam: Dauerbeschuss ohne Verschnaufpause), zulasten
 * der beiden Sniper-Stile. Die Reihenfolge ist gemischt, damit schon die ersten
 * acht Indizes – die übliche Arenagröße – alle fünf Stile enthalten.
 */
const BOT_STYLES: BotStyle[] = [
  'farmer', 'hunter', 'kiter', 'farmer', 'brawler',
  'controller', 'farmer', 'hunter', 'brawler', 'farmer'
];

/** Baut den Bot-Zustand für den Index-ten Bot. Auch der Arena-Direktor spawnt darüber. */
export function botState(index: number): BotState {
  const style = BOT_STYLES[index % BOT_STYLES.length] ?? 'farmer';
  const classPaths: Record<BotStyle, PlayerClass[]> = {
    // Klassen 4.0: jeder Pfad endet in seinem Familien-Apex (L42), und die
    // neuen Familien tauchen in der Rotation auf - Kiter passt zu SPECTER
    // (flankieren, verschwinden), der zweite Farmer-Pfad zu TEMPEST.
    farmer: ['rapid', 'twin', 'storm', 'vortex'],
    hunter: ['sniper', 'railgun', 'lancer', 'eclipse'],
    kiter: ['specter', 'wraith', 'mirage', 'eidolon'],
    brawler: ['rammer', 'crusher', 'juggernaut', 'leviathan'],
    controller: ['drone', 'warden', 'overseer', 'sovereign']
  };
  const upgradePaths: Record<BotStyle, UpgradeId[]> = {
    farmer: ['reload', 'damage', 'projectileSpeed', 'moveSpeed', 'penetration', 'maxHealth', 'regen', 'bodyDamage'],
    hunter: ['damage', 'penetration', 'projectileSpeed', 'reload', 'moveSpeed', 'maxHealth', 'regen', 'bodyDamage'],
    kiter: ['moveSpeed', 'projectileSpeed', 'damage', 'reload', 'penetration', 'maxHealth', 'regen', 'bodyDamage'],
    brawler: ['bodyDamage', 'maxHealth', 'moveSpeed', 'regen', 'damage', 'reload', 'penetration', 'projectileSpeed'],
    // Controller haben kein Rohr – Durchschlag und Kugeltempo stehen hier
    // nicht mehr, sonst bricht die Vergabeschleife bei der Ablehnung ab und
    // der Bot bleibt auf seinen Punkten sitzen.
    controller: ['damage', 'reload', 'maxHealth', 'moveSpeed', 'regen', 'bodyDamage']
  };
  return {
    style,
    targetId: null,
    targetShapeId: null,
    decisionAt: 0,
    strafe: index % 2 === 0 ? 1 : -1,
    reactionMs: 150 + (index % 5) * 35,
    aimError: style === 'hunter' ? 0.06 : style === 'brawler' ? 0.18 : 0.1,
    preferredDistance: style === 'kiter' ? 620 : style === 'brawler' ? 80 : style === 'controller' ? 390 : 430,
    fleeHealth: style === 'brawler' ? 0.1 : style === 'farmer' ? 0.48 : 0.3,
    classPath: classPaths[style],
    upgradePath: upgradePaths[style]
  };
}

function statsFor(player: GamePlayer): RuntimeStats {
  const base = CLASS_DEFINITIONS[player.playerClass];
  return {
    maxHealth: Math.round(base.maxHealth * (1 + player.upgrades.maxHealth * 0.12)),
    regen: base.regen + player.upgrades.regen * 0.62,
    acceleration: base.acceleration * (1 + player.upgrades.moveSpeed * 0.025),
    moveSpeed: base.moveSpeed * (1 + player.upgrades.moveSpeed * 0.042),
    reload: Math.max(0.075, base.reload * Math.pow(0.93, player.upgrades.reload)),
    projectileSpeed: base.projectileSpeed * (1 + player.upgrades.projectileSpeed * 0.055),
    projectileLife: base.projectileLife,
    damage: base.damage * (1 + player.upgrades.damage * 0.09),
    projectileRadius: base.projectileRadius,
    penetration: base.penetration * (1 + player.upgrades.penetration * 0.12),
    bodyDamage: base.bodyDamage * (1 + player.upgrades.bodyDamage * 0.13),
    barrelCount: base.barrelCount,
    barrelSpread: base.barrelSpread,
    barrelLength: base.barrelLength,
    barrelAngles: base.barrelAngles,
    droneCount: base.droneCount,
    droneRespawn: Math.max(0.35, base.droneRespawn * Math.pow(0.94, player.upgrades.reload))
  };
}

/** Netzform eines Spielers ohne Serverinterna. Auch der Spectator baut damit den eigenen Eintrag. */
export function playerSnapshot(player: GamePlayer): PlayerSnapshot {
  const { move: _move, aim: _aim, primary: _primary, secondary: _secondary, lastInput: _lastInput,
    cooldown: _cooldown, lastDamageAt: _lastDamageAt, invulnerableUntil: _invulnerableUntil,
    bot: _bot, ...snapshot } = player;
  return { ...snapshot, position: { ...player.position }, velocity: { ...player.velocity }, upgrades: { ...player.upgrades } };
}

export class MazeGame {
  private readonly players = new Map<string, GamePlayer>();
  private readonly projectiles = new Map<string, GameProjectile>();
  private readonly drones = new Map<string, GameDrone>();
  private readonly shapes = new Map<string, ShapeSnapshot>();
  private readonly shapeRespawns: number[] = [];
  private readonly nextDroneSpawn = new Map<string, number>();
  private readonly killfeed: KillEvent[] = [];
  private tick = 0;
  private eventId = 0;

  /**
   * Harte Obergrenze der Startpopulation – ein Schutz gegen vertippte
   * Konfiguration, keine Balance-Größe.
   *
   * Sie stand lange bei 18 und war damit identisch mit der damaligen
   * Zielpopulation. Seit die Arena auf 9000 × 6000 gewachsen ist, liegt die
   * Zielgröße selbst bei 18 (`DEFAULT_DIRECTOR_CONFIG.baseBots`) – der Deckel
   * wäre also exakt die Zielgröße gewesen und hätte jede weitere Verdichtung
   * still verschluckt, statt sie abzulehnen.
   */
  private static readonly MAX_BOTS = 40;

  constructor(botCount = 10) {
    for (let index = 0; index < GAME.shapeTargetCount; index += 1) {
      const shape = createShape(`shape-${index}`);
      this.shapes.set(shape.id, shape);
    }
    for (let index = 0; index < Math.max(0, Math.min(MazeGame.MAX_BOTS, botCount)); index += 1) {
      const vergeben = new Set([...this.players.values()].map((spieler) => spieler.name));
      this.createPlayer(botNameFor(index, vergeben), true, botState(index));
    }
  }

  addPlayer(name: string): string { return this.createPlayer(name, false, null); }
  removePlayer(id: string): void {
    this.players.delete(id);
    this.nextDroneSpawn.delete(id);
    for (const [projectileId, projectile] of this.projectiles) if (projectile.ownerId === id) this.projectiles.delete(projectileId);
    this.removeOwnerDrones(id);
  }

  applyInput(playerId: string, input: InputMessage): void {
    const player = this.players.get(playerId);
    if (!player || input.sequence <= player.lastInput) return;
    player.lastInput = input.sequence;
    if (player.dead) {
      player.move = { x: 0, y: 0 };
      player.primary = false;
      player.secondary = false;
      return;
    }
    player.move = clampMagnitude(input.move, 1);
    player.aim = clampMagnitude(input.aim, GAME.maxAimDistance);
    player.primary = input.primary;
    player.secondary = input.secondary;
    const moving = Math.hypot(player.move.x, player.move.y) > 0.12;
    if (player.invulnerable && (moving || input.primary || input.secondary)) {
      player.invulnerableUntil = 0;
      player.invulnerable = false;
    }
  }

  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean {
    const player = this.players.get(playerId);
    if (!player || player.dead || player.availablePoints <= 0 || !UPGRADE_IDS.includes(upgrade) || player.upgrades[upgrade] >= GAME.maxUpgradeLevel) return false;
    // Kein Punkt fuer etwas, das bei dieser Klasse nichts tut. Drohnenklassen
    // haben kein Rohr; Kugeltempo, Durchschlag und Reichweite werden bei ihnen
    // nirgends gelesen. Die Pruefung steht hier in der Basis, damit jede
    // Tuning-Schicht sie erbt.
    if (!upgradeAppliesTo(player.playerClass, upgrade)) return false;
    const previousMaximum = player.maxHealth;
    player.upgrades[upgrade] += 1;
    player.availablePoints -= 1;
    const stats = statsFor(player);
    player.maxHealth = stats.maxHealth;
    if (upgrade === 'maxHealth') player.health = Math.min(player.maxHealth, player.health + player.maxHealth - previousMaximum);
    return true;
  }

  chooseClass(playerId: string, target: PlayerClass): boolean {
    const player = this.players.get(playerId);
    if (!player || player.dead || !isValidClassChoice(player.playerClass, target, player.level)) return false;
    const ratio = player.health / Math.max(1, player.maxHealth);
    player.playerClass = target;
    const stats = statsFor(player);
    player.maxHealth = stats.maxHealth;
    player.health = Math.max(1, player.maxHealth * ratio);
    player.cooldown = Math.min(player.cooldown, stats.reload);
    this.removeOwnerDrones(player.id);
    this.spawnInitialDrones(player, Date.now());
    return true;
  }

  requestRespawn(playerId: string, now = Date.now()): boolean {
    const player = this.players.get(playerId);
    if (!player || !player.dead || now < player.canRespawnAt) return false;
    this.respawn(player, now);
    return true;
  }

  step(dt: number, now = Date.now()): void {
    const safeDt = Math.max(0, Math.min(0.08, dt));
    if (safeDt <= 0) return;
    this.tick += 1;
    this.spawnQueuedShapes(now);
    for (const shape of this.shapes.values()) stepShape(shape, safeDt);
    for (const player of this.players.values()) this.stepPlayer(player, safeDt, now);
    this.resolvePlayerCollisions(now);
    this.resolveShapeBodyCollisions(now);
    this.stepDrones(safeDt, now);
    this.stepProjectiles(safeDt, now);
    for (const player of this.players.values()) if (player.dead && now >= player.autoRespawnAt) this.respawn(player, now);
  }

  snapshot(selfId: string, now = Date.now()): WorldSnapshot {
    const self = this.players.get(selfId);
    const center = self?.position ?? { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
    const radiusSquared = GAME.viewRadius * GAME.viewRadius;
    const players = [...this.players.values()].filter((player) => player.id === selfId || distanceSquared(player.position, center) <= radiusSquared).map(playerSnapshot);
    const projectiles = [...this.projectiles.values()].filter((projectile) => distanceSquared(projectile.position, center) <= radiusSquared).map(({ damage: _damage, life: _life, ...projectile }) => ({ ...projectile, position: { ...projectile.position }, velocity: { ...projectile.velocity } }));
    const drones = [...this.drones.values()].filter((drone) => distanceSquared(drone.position, center) <= radiusSquared).map(({ slot: _slot, contactCooldown: _contactCooldown, ...drone }) => ({ ...drone, position: { ...drone.position }, velocity: { ...drone.velocity } }));
    const shapes = [...this.shapes.values()].filter((shape) => distanceSquared(shape.position, center) <= radiusSquared).map((shape) => ({ ...shape, position: { ...shape.position }, velocity: { ...shape.velocity } }));
    // Befund 19: Die Liste trägt Ränge, und der Betrachter steht immer drin –
    // acht Plätze, die ein Neuling nie erreicht, sagten ihm zehn Minuten lang
    // nur „du kommst hier nicht vor". Ist er nicht unter den Top 8, hängt
    // seine Zeile mit echtem Rang als neunte an (der Arras.io-Trick).
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score);
    const leaderboard = sorted.slice(0, 8).map(({ id, name, score, level, playerClass, isBot }, index) => ({ id, name, score, level, playerClass, isBot, rank: index + 1 }));
    if (self && !leaderboard.some((entry) => entry.id === selfId)) {
      const rank = sorted.findIndex((player) => player.id === selfId);
      if (rank >= 0) {
        const { id, name, score, level, playerClass, isBot } = self;
        leaderboard.push({ id, name, score, level, playerClass, isBot, rank: rank + 1 });
      }
    }
    return { type: 'snapshot', selfId, tick: this.tick, serverTime: now, players, projectiles, drones, shapes, walls: wallsInView(center), leaderboard, killfeed: this.killfeed.slice(-6) };
  }

  get humanCount(): number { return [...this.players.values()].filter((player) => !player.isBot).length; }
  get entityCounts(): Record<string, number> { return { players: this.players.size, projectiles: this.projectiles.size, drones: this.drones.size, shapes: this.shapes.size }; }

  private createPlayer(name: string, isBot: boolean, bot: BotState | null): string {
    const id = crypto.randomUUID();
    const base = CLASS_DEFINITIONS.core;
    const player: GamePlayer = {
      id, name, playerClass: 'core', position: this.safeSpawn(), velocity: { x: 0, y: 0 }, angle: 0,
      health: base.maxHealth, maxHealth: base.maxHealth, level: 1, xp: 0, xpForNextLevel: xpThresholdForLevel(1),
      availablePoints: 0, upgrades: EMPTY_UPGRADES(), score: 0, kills: 0, deaths: 0, streak: 0, bestStreak: 0, invulnerable: true,
      isBot, dead: false, deathLevel: 1, respawnLevel: 1, canRespawnAt: 0, autoRespawnAt: 0, killerName: '',
      move: { x: 0, y: 0 }, aim: { x: GAME.maxAimDistance, y: 0 }, primary: false, secondary: false,
      lastInput: -1, cooldown: 0, lastDamageAt: Date.now(), invulnerableUntil: Date.now() + GAME.respawnInvulnerabilityMs, bot
    };
    this.players.set(id, player);
    return id;
  }

  private safeSpawn(): Vector2 {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = randomSpawn();
      const clearPlayers = [...this.players.values()].every((player) => player.dead || distanceSquared(player.position, candidate) > 250 * 250);
      const clearShapes = [...this.shapes.values()].every((shape) => distanceSquared(shape.position, candidate) > 80 * 80);
      if (clearPlayers && clearShapes) return candidate;
    }
    return randomSpawn();
  }

  private stepPlayer(player: GamePlayer, dt: number, now: number): void {
    if (player.dead) return;
    if (player.bot) this.updateBot(player, now);
    const stats = statsFor(player);
    player.maxHealth = stats.maxHealth;
    player.invulnerable = now < player.invulnerableUntil;
    const desired = { x: player.move.x * stats.moveSpeed, y: player.move.y * stats.moveSpeed };
    player.velocity = moveVectorToward(player.velocity, desired, stats.acceleration * dt);
    const moved = moveCircle(player.position, player.velocity, dt, GAME.playerRadius);
    player.position = moved.position;
    player.velocity = moved.velocity;
    if (Math.hypot(player.aim.x, player.aim.y) > 0.01) player.angle = Math.atan2(player.aim.y, player.aim.x);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (now - player.lastDamageAt > 4000 && player.health < player.maxHealth) player.health = Math.min(player.maxHealth, player.health + stats.regen * dt);
    if (stats.droneCount > 0) this.maintainDrones(player, stats, now);
    else if (player.primary && player.cooldown <= 0) {
      this.fire(player, stats);
      player.cooldown = stats.reload;
    }
  }

  private fire(player: GamePlayer, stats: RuntimeStats): void {
    const baseAngle = Math.atan2(player.aim.y, player.aim.x);
    for (let barrel = 0; barrel < stats.barrelCount; barrel += 1) {
      const offset = stats.barrelAngles
        ? stats.barrelAngles[barrel] ?? 0
        : stats.barrelCount === 1 ? 0 : (barrel / (stats.barrelCount - 1) - 0.5) * stats.barrelSpread;
      const angle = baseAngle + offset;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const position = { x: player.position.x + direction.x * (GAME.playerRadius + stats.barrelLength), y: player.position.y + direction.y * (GAME.playerRadius + stats.barrelLength) };
      const id = crypto.randomUUID();
      this.projectiles.set(id, { id, ownerId: player.id, position, velocity: { x: direction.x * stats.projectileSpeed, y: direction.y * stats.projectileSpeed }, radius: stats.projectileRadius, integrity: stats.penetration, maxIntegrity: stats.penetration, damage: stats.damage, life: stats.projectileLife });
    }
  }

  private stepProjectiles(dt: number, now: number): void {
    const maximumSpeed = Math.max(0, ...[...this.projectiles.values()].map((projectile) => Math.hypot(projectile.velocity.x, projectile.velocity.y)));
    const substeps = projectileSubstepCount(maximumSpeed, dt, GAME.projectileStepDistance);
    const subDt = dt / substeps;
    for (let step = 0; step < substeps; step += 1) {
      for (const projectile of [...this.projectiles.values()]) {
        projectile.life -= subDt;
        if (projectile.life <= 0) { this.projectiles.delete(projectile.id); continue; }
        const next = { x: projectile.position.x + projectile.velocity.x * subDt, y: projectile.position.y + projectile.velocity.y * subDt };
        if (!isFree(next, projectile.radius)) { this.projectiles.delete(projectile.id); continue; }
        projectile.position = next;
        const shape = [...this.shapes.values()].find((candidate) => distanceSquared(candidate.position, projectile.position) <= Math.pow(candidate.radius + projectile.radius, 2));
        if (shape) {
          this.damageShape(shape, projectile.damage, projectile.ownerId, now);
          projectile.integrity -= shape.maxHealth * 0.18;
          if (projectile.integrity <= 0) this.projectiles.delete(projectile.id);
          continue;
        }
        const target = [...this.players.values()].find((candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== projectile.ownerId && distanceSquared(candidate.position, projectile.position) <= Math.pow(GAME.playerRadius + projectile.radius, 2));
        if (target) {
          this.damagePlayer(target, projectile.damage, projectile.ownerId, now);
          projectile.integrity -= target.maxHealth * 0.18;
          if (projectile.integrity <= 0) this.projectiles.delete(projectile.id);
        }
      }
      this.resolveProjectileCollisions();
    }
  }

  private resolveProjectileCollisions(): void {
    const hash = new SpatialHash<GameProjectile>(64);
    hash.rebuild(this.projectiles.values());
    const checked = new Set<string>();
    for (const projectile of [...this.projectiles.values()]) {
      for (const other of hash.query(projectile.position, projectile.radius + 16)) {
        if (projectile.id === other.id || projectile.ownerId === other.ownerId) continue;
        const key = projectile.id < other.id ? `${projectile.id}:${other.id}` : `${other.id}:${projectile.id}`;
        if (checked.has(key)) continue;
        checked.add(key);
        if (distanceSquared(projectile.position, other.position) <= Math.pow(projectile.radius + other.radius, 2)) resolveProjectilePair(projectile, other);
      }
    }
    for (const projectile of [...this.projectiles.values()]) if (projectile.integrity <= 0) this.projectiles.delete(projectile.id);
  }

  /**
   * Körperschaden eines Tanks – **eine ersetzbare Stelle statt einer zweiten
   * Formel.**
   *
   * `resolvePlayerCollisions` wird von keiner Schicht ersetzt, nur umschlossen
   * (perks, impact, specter, hardening). Innen stand deshalb weiter die alte
   * Kurve aus `statsFor` (+13 % je Punkt), während der ganze übrige Server
   * längst mit `tunedStatsFor` rechnete (+10 %). Gemessen an zwei Juggernauts
   * auf Level 60 mit zehn Punkten in `bodyDamage`: 11,040 zugefügter Schaden
   * gegen 9,600 nach der gültigen Kurve – 15 % zu viel, und der Slot war damit
   * je Punkt 30 % stärker als das Balance-Modell annimmt.
   *
   * Als Methode kann `tuneCombatScaling` sie ersetzen wie jede andere Regel,
   * ohne dass `game.ts` etwas über die Tuning-Schichten wissen muss.
   */
  protected bodyDamageOf(player: GamePlayer): number {
    return statsFor(player).bodyDamage;
  }

  private resolvePlayerCollisions(now: number): void {
    const players = [...this.players.values()].filter((player) => !player.dead);
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
        const aPosition = { x: a.position.x - normal.x * push, y: a.position.y - normal.y * push };
        const bPosition = { x: b.position.x + normal.x * push, y: b.position.y + normal.y * push };
        if (isFree(aPosition, GAME.playerRadius)) a.position = aPosition;
        if (isFree(bPosition, GAME.playerRadius)) b.position = bPosition;
        if (!a.invulnerable && !b.invulnerable) {
          this.damagePlayer(a, this.bodyDamageOf(b) * 0.08, b.id, now);
          this.damagePlayer(b, this.bodyDamageOf(a) * 0.08, a.id, now);
        }
      }
    }
  }

  private resolveShapeBodyCollisions(now: number): void {
    for (const player of this.players.values()) {
      if (player.dead || player.invulnerable) continue;
      for (const shape of this.shapes.values()) {
        if (distanceSquared(player.position, shape.position) > Math.pow(GAME.playerRadius + shape.radius, 2)) continue;
        this.damagePlayer(player, SHAPE_CONFIG[shape.kind].bodyDamage * 0.08, null, now);
        this.damageShape(shape, this.bodyDamageOf(player) * 0.08, player.id, now);
      }
    }
  }

  private spawnInitialDrones(owner: GamePlayer, now: number): void {
    const stats = statsFor(owner);
    for (let slot = 0; slot < stats.droneCount; slot += 1) this.spawnDrone(owner, slot);
    if (stats.droneCount > 0) this.nextDroneSpawn.set(owner.id, now + stats.droneRespawn * 1000);
  }

  private maintainDrones(owner: GamePlayer, stats: RuntimeStats, now: number): void {
    const owned = [...this.drones.values()].filter((drone) => drone.ownerId === owner.id);
    const occupied = new Set(owned.map((drone) => drone.slot));
    if (owned.length >= stats.droneCount) return;
    const next = this.nextDroneSpawn.get(owner.id) ?? 0;
    if (now < next) return;
    const slot = Array.from({ length: stats.droneCount }, (_, index) => index).find((candidate) => !occupied.has(candidate));
    if (slot !== undefined) this.spawnDrone(owner, slot);
    this.nextDroneSpawn.set(owner.id, now + stats.droneRespawn * 1000);
  }

  private spawnDrone(owner: GamePlayer, slot: number): void {
    const id = crypto.randomUUID();
    const maximum = 36 + owner.upgrades.maxHealth * 5;
    this.drones.set(id, { id, ownerId: owner.id, position: { ...owner.position }, velocity: { x: 0, y: 0 }, angle: 0, health: maximum, maxHealth: maximum, slot, contactCooldown: 0 });
  }

  private stepDrones(dt: number, now: number): void {
    for (const drone of [...this.drones.values()]) {
      const owner = this.players.get(drone.ownerId);
      if (!owner || owner.dead) { this.drones.delete(drone.id); continue; }
      const stats = statsFor(owner);
      drone.contactCooldown = Math.max(0, drone.contactCooldown - dt);
      const aim = clampMagnitude(owner.aim, GAME.maxAimDistance);
      const orbitAngle = now / 850 + drone.slot * Math.PI * 2 / Math.max(1, stats.droneCount);
      const orbit = { x: owner.position.x + Math.cos(orbitAngle) * 82, y: owner.position.y + Math.sin(orbitAngle) * 82 };
      let target = orbit;
      if (owner.secondary) target = { x: owner.position.x - aim.x, y: owner.position.y - aim.y };
      else if (owner.primary) target = { x: owner.position.x + aim.x, y: owner.position.y + aim.y };
      const direction = normalize({ x: target.x - drone.position.x, y: target.y - drone.position.y });
      drone.velocity = moveVectorToward(drone.velocity, { x: direction.x * 450, y: direction.y * 450 }, 1500 * dt);
      const moved = moveCircle(drone.position, drone.velocity, dt, 12);
      drone.position = moved.position;
      drone.velocity = moved.velocity;
      drone.angle = Math.atan2(drone.velocity.y, drone.velocity.x);
      if (drone.contactCooldown > 0) continue;
      const shape = [...this.shapes.values()].find((candidate) => distanceSquared(candidate.position, drone.position) <= Math.pow(candidate.radius + 12, 2));
      if (shape) {
        this.damageShape(shape, stats.damage, owner.id, now);
        drone.health -= SHAPE_CONFIG[shape.kind].bodyDamage;
        drone.contactCooldown = stats.reload;
      } else {
        const targetPlayer = [...this.players.values()].find((candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== owner.id && distanceSquared(candidate.position, drone.position) <= Math.pow(GAME.playerRadius + 12, 2));
        if (targetPlayer) {
          this.damagePlayer(targetPlayer, stats.damage, owner.id, now);
          drone.health -= statsFor(targetPlayer).bodyDamage * 0.5;
          drone.contactCooldown = stats.reload;
        }
      }
      if (drone.health <= 0) {
        this.drones.delete(drone.id);
        this.nextDroneSpawn.set(owner.id, now + stats.droneRespawn * 1000);
      }
    }
  }

  private removeOwnerDrones(ownerId: string): void {
    for (const [id, drone] of this.drones) if (drone.ownerId === ownerId) this.drones.delete(id);
  }

  private damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void {
    shape.health -= Math.max(0, damage);
    if (shape.health > 0) return;
    this.shapes.delete(shape.id);
    this.shapeRespawns.push(now + 1400 + Math.random() * 2200);
    const owner = this.players.get(ownerId);
    if (owner) this.awardXp(owner, SHAPE_CONFIG[shape.kind].reward);
  }

  private damagePlayer(target: GamePlayer, damage: number, attackerId: string | null, now: number): void {
    if (target.dead || target.invulnerable) return;
    target.health -= Math.max(0, damage);
    target.lastDamageAt = now;
    if (target.health <= 0) this.killPlayer(target, attackerId, now, 'Arena');
  }

  private killPlayer(target: GamePlayer, attackerId: string | null, now: number, environmentName: string): void {
    if (target.dead) return;
    const attacker = attackerId ? this.players.get(attackerId) : undefined;
    target.dead = true;
    target.health = 0;
    target.velocity = { x: 0, y: 0 };
    target.primary = false;
    target.secondary = false;
    target.deaths += 1;
    target.deathLevel = target.level;
    target.respawnLevel = respawnLevelFrom(target.level);
    target.canRespawnAt = now + GAME.respawnDelayMs;
    // Menschen entscheiden selbst, wann (und ob) sie zurückkommen – der
    // Zwangs-Respawn nach 7 s gilt nur noch für Bots. Die 10 Minuten sind ein
    // AFK-Fangnetz, kein Spielelement (und bewusst endlich: JSON kennt kein
    // Infinity, ein zu großer Wert würde im Snapshot zu null zerfallen).
    target.autoRespawnAt = now + (target.isBot ? GAME.autoRespawnDelayMs : 600_000);
    target.killerName = attacker?.name ?? environmentName;
    target.invulnerable = false;
    target.streak = 0;
    this.removeOwnerDrones(target.id);
    for (const [id, projectile] of this.projectiles) if (projectile.ownerId === target.id) this.projectiles.delete(id);
    if (attacker && attacker.id !== target.id) {
      attacker.kills += 1;
      attacker.streak += 1;
      attacker.bestStreak = Math.max(attacker.bestStreak, attacker.streak);
      this.awardXp(attacker, 130 + target.level * 18);
      this.killfeed.push({ id: ++this.eventId, killer: attacker.name, victim: target.name, at: now, streak: attacker.streak });
      if (this.killfeed.length > 12) this.killfeed.shift();
    }
  }

  private respawn(player: GamePlayer, now: number): void {
    const retainedLevel = Math.max(1, player.respawnLevel);
    // Zurueck auf den Anfang: Der zweite Run ist eine neue Entscheidung, keine
    // Fortsetzung der alten (Sams Befund vom 07.08.). Bots waehlen gleich
    // wieder ihren Pfad - fuer sie aendert sich damit nichts.
    player.playerClass = respawnClassFrom(player.playerClass);
    player.position = this.safeSpawn();
    player.velocity = { x: 0, y: 0 };
    player.level = retainedLevel;
    player.xp = xpAtLevelStart(retainedLevel);
    player.xpForNextLevel = xpThresholdForLevel(retainedLevel);
    player.availablePoints = upgradePointsAtLevel(retainedLevel);
    player.upgrades = EMPTY_UPGRADES();
    player.score = Math.floor(player.score * 0.45);
    player.streak = 0;
    player.bestStreak = 0;
    player.dead = false;
    player.health = statsFor(player).maxHealth;
    player.maxHealth = player.health;
    player.invulnerable = true;
    player.invulnerableUntil = now + GAME.respawnInvulnerabilityMs;
    player.lastDamageAt = now;
    player.canRespawnAt = 0;
    player.autoRespawnAt = 0;
    player.killerName = '';
    if (player.bot) {
      this.spendBotPoints(player);
      this.advanceBotClass(player);
    }
    this.spawnInitialDrones(player, now);
  }

  private awardXp(player: GamePlayer, amount: number): void {
    if (player.dead) return;
    const rounded = Math.max(0, Math.round(amount));
    player.score += rounded;
    if (player.level >= GAME.maxLevel) return;
    player.xp += rounded;
    while (player.level < GAME.maxLevel && player.xp >= player.xpForNextLevel) {
      player.level += 1;
      player.availablePoints += 1;
      player.xpForNextLevel = xpThresholdForLevel(player.level);
    }
    if (player.bot) {
      this.spendBotPoints(player);
      this.advanceBotClass(player);
    }
  }

  private spendBotPoints(player: GamePlayer): void {
    if (!player.bot) return;
    for (const upgrade of player.bot.upgradePath) {
      // Der Abbruch bei Ablehnung ist keine Feinheit: Die Schleife bricht sonst
      // nur über ihre beiden Bedingungen ab. Lehnt `applyUpgrade` ab, ohne einen
      // Punkt zu verbrauchen – mit der Familiensperre aus KL4 ist das
      // erreichbar –, dreht sie endlos und der Server steht.
      while (player.availablePoints > 0 && player.upgrades[upgrade] < GAME.maxUpgradeLevel) {
        if (!this.applyUpgrade(player.id, upgrade)) break;
      }
      if (player.availablePoints <= 0) break;
    }
  }

  private advanceBotClass(player: GamePlayer): void {
    if (!player.bot) return;
    for (const desired of player.bot.classPath) if (isValidClassChoice(player.playerClass, desired, player.level)) this.chooseClass(player.id, desired);
  }

  private updateBot(player: GamePlayer, now: number): void {
    const bot = player.bot;
    if (!bot) return;
    if (now >= bot.decisionAt) {
      const enemy = [...this.players.values()].filter((candidate) => !candidate.dead && candidate.id !== player.id && distanceSquared(candidate.position, player.position) < 1050 * 1050 && hasLineOfSight(player.position, candidate.position)).sort((a, b) => distanceSquared(a.position, player.position) - distanceSquared(b.position, player.position))[0];
      if (enemy && (bot.style === 'hunter' || bot.style === 'brawler' || Math.random() > 0.45)) {
        bot.targetId = enemy.id;
        bot.targetShapeId = null;
      } else {
        const shape = [...this.shapes.values()].filter((candidate) => hasLineOfSight(player.position, candidate.position)).sort((a, b) => distanceSquared(a.position, player.position) - distanceSquared(b.position, player.position))[0];
        bot.targetShapeId = shape?.id ?? null;
        bot.targetId = null;
      }
      if (Math.random() < 0.25) bot.strafe *= -1;
      bot.decisionAt = now + bot.reactionMs * (0.8 + Math.random() * 0.5);
    }
    const enemy = bot.targetId ? this.players.get(bot.targetId) : undefined;
    const shape = bot.targetShapeId ? this.shapes.get(bot.targetShapeId) : undefined;
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
    const error = (Math.random() - 0.5) * bot.aimError;
    const cosine = Math.cos(error);
    const sine = Math.sin(error);
    const aimDirection = { x: direction.x * cosine - direction.y * sine, y: direction.x * sine + direction.y * cosine };
    const aimLength = Math.min(GAME.maxAimDistance, Math.max(120, distance));
    player.aim = { x: aimDirection.x * aimLength, y: aimDirection.y * aimLength };
    const healthRatio = player.health / Math.max(1, player.maxHealth);
    const radial = healthRatio < bot.fleeHealth ? -1 : distance > bot.preferredDistance + 80 ? 1 : distance < bot.preferredDistance - 80 ? -0.7 : 0.05;
    player.move = normalize({ x: direction.x * radial - direction.y * bot.strafe * 0.55, y: direction.y * radial + direction.x * bot.strafe * 0.55 });
    const droneClass = statsFor(player).droneCount > 0;
    player.secondary = Boolean(droneClass && enemy && distance < 230);
    player.primary = !player.secondary && distance < (bot.style === 'kiter' ? 1150 : 820);
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
