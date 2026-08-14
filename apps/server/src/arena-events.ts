import {
  GAME,
  xpAtLevelStart,
  xpThresholdForLevel,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type UpgradeLevels,
  type Vector2,
  type Wall,
  type WorldSnapshot
} from '@project-maze/shared';
import type { GameplayWorldExtension, PassiveModifierId } from '@project-maze/shared/gameplay';
import { activeArenaEventFor, type ServerArenaEvent, type ServerArenaEventKind } from './arena-systems.js';
import { ROOKIE_PROTECTION_LEVEL } from './bot-brain.js';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { distanceSquared, normalize } from './physics.js';
import {
  FRACTURABLE_WALL_IDS,
  circleHitsWall,
  hasLineOfSight,
  isFree,
  setWallDisabled,
  wallById
} from './world.js';

/**
 * Overcharge: Projektile in der Zone tragen einen Überladungspuffer, der bei
 * Projektil-Kollisionen zuerst verbraucht wird. Kugeln löschen sich dadurch
 * nicht mehr gegenseitig aus, sondern streifen sich – sie werden abgelenkt und
 * verlieren Tempo. Der Schaden bleibt unverändert: Das Event verschiebt nur,
 * wer sich hinter einer Kugelwand verstecken kann.
 */
export const OVERCHARGE_BUFFER_RATIO = 0.75;
/** Ablenkung eines gestreiften Projektils in Radiant (rund 8°). */
export const OVERCHARGE_DEFLECTION = 0.14;
/** Tempo, das ein gestreiftes Projektil behält. */
export const OVERCHARGE_SPEED_RETENTION = 0.94;

/**
 * Hunter Signal: Ein neutraler Elite-Guardian bewacht die Zone. Er gehört
 * niemandem, verteidigt sich gegen jeden und verschwindet mit dem Event.
 */
/** Muss zum Client-Namensschild passen ("⚔ GUARDIAN") – Killfeed, Death-Screen und Killcam zeigen diesen Namen. */
export const GUARDIAN_NAME = 'GUARDIAN';
/** Anteil des Schadens, den der Guardian tatsächlich erhält (entspricht rund 3,3-fachem Leben). */
export const GUARDIAN_DAMAGE_TAKEN = 0.3;
/** Bonus-XP zusätzlich zur normalen Kill-Belohnung. */
export const GUARDIAN_REWARD = 600;
/** Fester Bau des Guardians – er levelt nicht und farmt nicht. */
export const GUARDIAN_CLASS_PATH: readonly PlayerClass[] = ['drone', 'guardian'];
export const GUARDIAN_UPGRADES: UpgradeLevels = {
  maxHealth: 8,
  regen: 5,
  moveSpeed: 2,
  reload: 5,
  damage: 6,
  projectileSpeed: 0,
  penetration: 0,
  bodyDamage: 4,
  // Der Guardian gehört zur Control-Familie, deren Signature noch nicht steht.
  // Bis dahin wären Punkte hier wirkungslos.
  signatureRate: 0,
  signaturePower: 0,
  // Klassen 4.0: neue Slots – der Guardian nutzt sie nicht, der Typ verlangt sie.
  projectileRange: 0,
  moduleCooldown: 0
};

const GUARDIAN_AGGRO_RADIUS = 760;
/** Der Guardian verlässt seine Zone nicht – er lässt sich nicht aus der Arena locken. */
const GUARDIAN_LEASH_RADIUS = 430;
const GUARDIAN_PREFERRED_DISTANCE = 250;
/**
 * Feuerreichweite des Guardians – eine eigene Zahl, seit `GAME.maxAimDistance`
 * eine andere Aufgabe hat.
 *
 * Hier stand `GAME.maxAimDistance + 60`, also 710. Als die Zeigerreichweite für
 * die Drohnensteuerung auf 920 stieg (Sams Punkt 8 vom 14.08.), wäre der
 * Guardian still auf 980 px Feuerreichweite mitgewachsen – eine Balance-Änderung
 * als Nebenwirkung eines Steuerungs-Fixes. 710 ist der Stand, der gemessen wurde.
 */
const GUARDIAN_FIRE_RANGE = 710;
const GUARDIAN_DECISION_MS = 320;
/** So lange gilt ein Angreifer als Bedrohung (und verliert seinen Anfängerschutz). */
const GUARDIAN_THREAT_MS = 8_000;

/**
 * Fracture: Für die Dauer der aktiven Phase brechen einige generierte
 * Wandsegmente auf. Sie sind passierbar, blocken keine Projektile und keine
 * Sichtlinien – die Arena bekommt kurzzeitig neue Wege. Feste `l*`-Wände
 * bleiben immer stehen, damit das Layout wiedererkennbar bleibt.
 */
export const FRACTURE_MIN_WALLS = 2;
export const FRACTURE_MAX_WALLS = 4;
/** Sicherheitsabstand, ab dem eine Wandfläche als belegt gilt. */
export const FRACTURE_CLEARANCE = 6;

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

interface RuntimeProjectile extends ProjectileSnapshot {
  damage: number;
  life: number;
}

interface RuntimeDrone {
  id: string;
  position: Vector2;
  gameplayRadius?: number;
}

interface EventInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  drones: Map<string, RuntimeDrone>;
  shapes: Map<string, ShapeSnapshot>;
  resolveProjectileCollisions(): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
  awardXp(player: RuntimePlayer, amount: number): void;
  chooseClass(playerId: string, target: PlayerClass): boolean;
}

interface FractureState {
  /** Event-ID, für die bereits aufgebrochen wurde. */
  openedForEventId: number;
  openWallIds: Set<string>;
}

interface EventState {
  guardianId: string | null;
  /** Event-ID, für die bereits ein Guardian erzeugt wurde (kein Respawn im selben Event). */
  spawnedForEventId: number;
  targetId: string | null;
  decisionAt: number;
  threats: Map<string, number>;
  fracture: FractureState;
}

const states = new WeakMap<MazeGame, EventState>();
const stateFor = (game: MazeGame): EventState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: EventState = {
    guardianId: null,
    spawnedForEventId: 0,
    targetId: null,
    decisionAt: 0,
    threats: new Map(),
    fracture: { openedForEventId: 0, openWallIds: new Set() }
  };
  states.set(game, created);
  return created;
};

const overchargeBuffers = new WeakMap<RuntimeProjectile, number>();
const bufferFor = (projectile: RuntimeProjectile): number => {
  const existing = overchargeBuffers.get(projectile);
  if (existing !== undefined) return existing;
  const created = Math.max(0, projectile.maxIntegrity) * OVERCHARGE_BUFFER_RATIO;
  overchargeBuffers.set(projectile, created);
  return created;
};

/** Deterministische Streifrichtung – gleiches Projektil, gleiche Ablenkung. */
const deflectionSign = (id: string): number => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return hash % 2 === 0 ? 1 : -1;
};

const grazeProjectile = (projectile: RuntimeProjectile): void => {
  const angle = OVERCHARGE_DEFLECTION * deflectionSign(projectile.id);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const { x, y } = projectile.velocity;
  projectile.velocity = {
    x: (x * cosine - y * sine) * OVERCHARGE_SPEED_RETENTION,
    y: (x * sine + y * cosine) * OVERCHARGE_SPEED_RETENTION
  };
};

const inEventZone = (position: Vector2, event: ServerArenaEvent): boolean =>
  distanceSquared(position, event.center) <= event.radius * event.radius;

const activeEventOfKind = (game: MazeGame, kind: ServerArenaEventKind): ServerArenaEvent | null => {
  const event = activeArenaEventFor(game);
  return event && event.kind === kind && event.phase === 'active' ? event : null;
};

/** Freier Standplatz möglichst nah am Zonenzentrum – ohne Zufall, damit Tests stabil bleiben. */
function guardianSpawnPosition(event: ServerArenaEvent): Vector2 | null {
  if (isFree(event.center, GAME.playerRadius + 6)) return { ...event.center };
  for (let ring = 1; ring <= 6; ring += 1) {
    for (let step = 0; step < 12; step += 1) {
      const angle = (step / 12) * Math.PI * 2;
      const distance = ring * 55;
      const candidate = {
        x: event.center.x + Math.cos(angle) * distance,
        y: event.center.y + Math.sin(angle) * distance
      };
      if (isFree(candidate, GAME.playerRadius + 6)) return candidate;
    }
  }
  return null;
}

function pickGuardianTarget(
  internals: EventInternals,
  state: EventState,
  guardian: RuntimePlayer
): string | null {
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const candidate of internals.players.values()) {
    if (candidate.id === guardian.id || candidate.dead || candidate.invulnerable) continue;
    const squared = distanceSquared(candidate.position, guardian.position);
    if (squared > GUARDIAN_AGGRO_RADIUS * GUARDIAN_AGGRO_RADIUS) continue;
    const threatened = state.threats.has(candidate.id);
    // Frische Spieler werden nicht gejagt, solange sie den Guardian in Ruhe lassen.
    if (candidate.level < ROOKIE_PROTECTION_LEVEL && !threatened) continue;
    if (!hasLineOfSight(guardian.position, candidate.position)) continue;
    const score = (threatened ? 900 : 0) - Math.sqrt(squared);
    if (score > bestScore) {
      bestScore = score;
      bestId = candidate.id;
    }
  }
  return bestId;
}

function driveGuardian(
  internals: EventInternals,
  state: EventState,
  event: ServerArenaEvent,
  guardian: RuntimePlayer,
  now: number
): void {
  for (const [id, at] of state.threats) if (now - at > GUARDIAN_THREAT_MS) state.threats.delete(id);

  if (now >= state.decisionAt) {
    state.decisionAt = now + GUARDIAN_DECISION_MS;
    state.targetId = pickGuardianTarget(internals, state, guardian);
  }
  const candidate = state.targetId ? internals.players.get(state.targetId) : undefined;
  const target = candidate && !candidate.dead && !candidate.invulnerable ? candidate : undefined;
  if (!target) state.targetId = null;

  const toCenter = { x: event.center.x - guardian.position.x, y: event.center.y - guardian.position.y };
  const centerDistance = Math.hypot(toCenter.x, toCenter.y);
  const leashed = centerDistance > GUARDIAN_LEASH_RADIUS;
  const home = leashed ? normalize(toCenter) : { x: 0, y: 0 };

  if (!target) {
    guardian.move = leashed ? home : { x: 0, y: 0 };
    guardian.primary = false;
    guardian.secondary = false;
    return;
  }

  const delta = { x: target.position.x - guardian.position.x, y: target.position.y - guardian.position.y };
  const distance = Math.hypot(delta.x, delta.y);
  const direction = normalize(delta);
  const aimLength = Math.min(GAME.maxAimDistance, Math.max(140, distance));
  guardian.aim = { x: direction.x * aimLength, y: direction.y * aimLength };

  const radial = leashed
    ? 0
    : distance > GUARDIAN_PREFERRED_DISTANCE + 70
      ? 1
      : distance < GUARDIAN_PREFERRED_DISTANCE - 70 ? -0.8 : 0;
  guardian.move = normalize({
    x: direction.x * radial + home.x - direction.y * 0.35,
    y: direction.y * radial + home.y + direction.x * 0.35
  });
  guardian.primary = distance < GUARDIAN_FIRE_RANGE;
  guardian.secondary = false;
}

function spawnGuardian(
  game: MazeGame,
  internals: EventInternals,
  state: EventState,
  event: ServerArenaEvent,
  now: number
): string | null {
  const position = guardianSpawnPosition(event);
  if (!position) return null;
  const id = game.addPlayer(GUARDIAN_NAME);
  const guardian = internals.players.get(id);
  if (!guardian) return null;

  guardian.isBot = true;
  // Kein Bot-State: Der Guardian wird von diesem System gesteuert, nicht vom Bot-Brain.
  guardian.bot = null;
  guardian.position = position;
  guardian.velocity = { x: 0, y: 0 };
  guardian.level = GAME.maxLevel;
  guardian.xp = xpAtLevelStart(GAME.maxLevel);
  guardian.xpForNextLevel = xpThresholdForLevel(GAME.maxLevel);
  guardian.availablePoints = 0;
  guardian.upgrades = { ...GUARDIAN_UPGRADES };
  for (const step of GUARDIAN_CLASS_PATH) internals.chooseClass(id, step);
  guardian.maxHealth = tunedStatsFor(guardian).maxHealth;
  guardian.health = guardian.maxHealth;
  guardian.invulnerable = false;
  guardian.invulnerableUntil = 0;
  guardian.lastDamageAt = now;
  guardian.aim = { x: GAME.maxAimDistance, y: 0 };
  guardian.move = { x: 0, y: 0 };
  guardian.primary = false;
  guardian.secondary = false;

  state.guardianId = id;
  state.spawnedForEventId = event.id;
  state.targetId = null;
  state.decisionAt = 0;
  state.threats.clear();
  return id;
}

/** Steht noch etwas in der Wandfläche, darf die Wand nicht zurückkehren – sonst säßen Entitäten fest. */
function wallOccupied(internals: EventInternals, wall: Wall): boolean {
  for (const player of internals.players.values()) {
    if (player.dead) continue;
    if (circleHitsWall(player.position, GAME.playerRadius + FRACTURE_CLEARANCE, wall)) return true;
  }
  for (const drone of internals.drones.values()) {
    if (circleHitsWall(drone.position, (drone.gameplayRadius ?? 12) + FRACTURE_CLEARANCE, wall)) return true;
  }
  for (const shape of internals.shapes.values()) {
    if (circleHitsWall(shape.position, shape.radius + FRACTURE_CLEARANCE, wall)) return true;
  }
  return false;
}

/** Bricht 2–4 zufällige generierte Segmente auf. Feste Wände lehnt `setWallDisabled` ab. */
function openFractureWalls(state: EventState, event: ServerArenaEvent): void {
  state.fracture.openedForEventId = event.id;
  // Segmente, die aus dem Vorgänger-Event noch auf freie Fläche warten, nicht doppelt zählen.
  const pool = FRACTURABLE_WALL_IDS.filter((id) => !state.fracture.openWallIds.has(id));
  const span = FRACTURE_MAX_WALLS - FRACTURE_MIN_WALLS + 1;
  const count = FRACTURE_MIN_WALLS + Math.floor(Math.random() * span);
  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const [id] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    if (id && setWallDisabled(id, true)) state.fracture.openWallIds.add(id);
  }
}

/** Schließt jede aufgebrochene Wand, sobald ihre Fläche frei ist – belegte Wände bleiben offen. */
function restoreFractureWalls(internals: EventInternals, state: EventState): void {
  for (const id of [...state.fracture.openWallIds]) {
    const wall = wallById(id);
    if (wall && wallOccupied(internals, wall)) continue;
    setWallDisabled(id, false);
    state.fracture.openWallIds.delete(id);
  }
}

/**
 * Setzt die beiden regelverändernden Arena-Events um: Overcharge greift
 * ausschließlich in das Projektil-Kollisionsverhalten ein, Hunter Signal stellt
 * einen neutralen Elite-Guardian als PvE-Ziel in die Zone. Beides ist
 * serverautoritativ und wirkt nur innerhalb der aktiven Eventphase.
 */
export function tuneArenaEvents<T extends MazeGame>(game: T): T {
  const internals = game as unknown as EventInternals;
  const state = stateFor(game);

  const originalResolveProjectileCollisions = internals.resolveProjectileCollisions.bind(internals);
  internals.resolveProjectileCollisions = (): void => {
    const event = activeEventOfKind(game, 'overcharge');
    if (!event) {
      originalResolveProjectileCollisions();
      return;
    }

    const charged: Array<{ projectile: RuntimeProjectile; integrity: number; buffer: number }> = [];
    for (const projectile of internals.projectiles.values()) {
      if (!inEventZone(projectile.position, event)) continue;
      const buffer = bufferFor(projectile);
      if (buffer <= 0) continue;
      charged.push({ projectile, integrity: projectile.integrity, buffer });
      projectile.integrity += buffer;
    }

    originalResolveProjectileCollisions();

    for (const { projectile, integrity, buffer } of charged) {
      // Trotz Puffer zerstört – der Zusammenstoß war stärker als die Überladung.
      if (internals.projectiles.get(projectile.id) !== projectile) {
        overchargeBuffers.delete(projectile);
        continue;
      }
      const loss = Math.max(0, integrity + buffer - projectile.integrity);
      const remaining = Math.max(0, buffer - loss);
      overchargeBuffers.set(projectile, remaining);
      projectile.integrity -= remaining;
      if (projectile.integrity <= 0) {
        internals.projectiles.delete(projectile.id);
        continue;
      }
      if (loss > 0) grazeProjectile(projectile);
    }
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    const guardianId = state.guardianId;
    if (guardianId && target.id === guardianId) {
      if (attackerId && attackerId !== guardianId) state.threats.set(attackerId, now);
      originalDamagePlayer(target, Math.max(0, damage) * GUARDIAN_DAMAGE_TAKEN, attackerId, now);
      return;
    }
    // Der Guardian ist neutral, kein Anfänger-Jäger: Frische Spieler bleiben verschont.
    if (
      guardianId &&
      attackerId === guardianId &&
      target.level < ROOKIE_PROTECTION_LEVEL &&
      !state.threats.has(target.id)
    ) return;
    originalDamagePlayer(target, damage, attackerId, now);
  };

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const isGuardian = state.guardianId !== null && target.id === state.guardianId;
    const wasDead = target.dead;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (!isGuardian || wasDead || !target.dead) return;
    // Der Guardian gehört zum Event, nicht zur Arena: kein Respawn, dafür eine echte Belohnung.
    target.canRespawnAt = now + 86_400_000;
    target.autoRespawnAt = now + 86_400_000;
    const attacker = attackerId && attackerId !== target.id ? internals.players.get(attackerId) : undefined;
    if (attacker && !attacker.dead) internals.awardXp(attacker, GUARDIAN_REWARD);
  };

  const originalAwardXp = internals.awardXp.bind(internals);
  internals.awardXp = (player: RuntimePlayer, amount: number): void => {
    // Der Guardian sammelt nichts – so bleibt er aus Bestenliste und Bounty heraus.
    if (state.guardianId && player.id === state.guardianId) return;
    originalAwardXp(player, amount);
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);

    const fracture = activeEventOfKind(game, 'fracture');
    if (fracture && state.fracture.openedForEventId !== fracture.id) openFractureWalls(state, fracture);
    else if (!fracture && state.fracture.openWallIds.size > 0) restoreFractureWalls(internals, state);

    const hunt = activeEventOfKind(game, 'hunterSignal');
    if (state.guardianId) {
      const guardian = internals.players.get(state.guardianId);
      if (!guardian || guardian.dead || !hunt || hunt.id !== state.spawnedForEventId) {
        game.removePlayer(state.guardianId);
        return;
      }
      driveGuardian(internals, state, hunt, guardian, now);
      return;
    }
    if (hunt && state.spawnedForEventId !== hunt.id) spawnGuardian(game, internals, state, hunt, now);
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    const guardianId = state.guardianId;
    snapshot.arenaGuardianId = guardianId;
    if (guardianId) snapshot.leaderboard = snapshot.leaderboard.filter((entry) => entry.id !== guardianId);
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    if (state.guardianId === id) {
      state.guardianId = null;
      state.targetId = null;
      state.threats.clear();
    }
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Aktueller neutraler Guardian (für Tests und andere Systeme). */
export function arenaGuardianIdFor(game: MazeGame): string | null {
  return states.get(game)?.guardianId ?? null;
}

/** Aktuell durch Fracture aufgebrochene Wandsegmente (für Tests und Debug-Anzeigen). */
export function fracturedWallIdsFor(game: MazeGame): string[] {
  return [...(states.get(game)?.fracture.openWallIds ?? [])];
}
