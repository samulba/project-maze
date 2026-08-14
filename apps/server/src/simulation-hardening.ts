import {
  CLASS_DEFINITIONS,
  ENTITY_CULL_HALF,
  GAME,
  type DroneSnapshot,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import { MazeGame } from './game.js';
import { SpatialHash, distanceSquared, projectileSubstepCount, resolveProjectilePair } from './physics.js';
import { SHAPE_CONFIG, isFree } from './world.js';

type RuntimePlayer = PlayerSnapshot & { bot?: unknown; velocity: Vector2 };
type RuntimeProjectile = ProjectileSnapshot & { damage: number; life: number; plantAtLife?: number };
type RuntimeShape = ShapeSnapshot;
type RuntimeDrone = DroneSnapshot & { gameplayRadius?: number | undefined };
interface GameInternals {
  players: Map<string, RuntimePlayer>;
  /**
   * Die Grobraster der Basis (`game.ts`), einmal je Tick gebaut. Diese Schicht
   * ERSETZT `stepProjectiles`; sie muss deshalb dieselben Raster benutzen und
   * darf sich kein zweites bauen – sonst stünde derselbe Treffer zweimal im
   * Code, mit zwei Zeitpunkten und zwei Ständen.
   */
  formenraster: { finde(position: Vector2, radius: number, passt?: (kandidat: RuntimeShape) => boolean): RuntimeShape | undefined };
  drohnenraster: { finde(position: Vector2, radius: number, passt?: (kandidat: RuntimeDrone) => boolean): RuntimeDrone | undefined };
  gegnerAmPunkt(position: Vector2, radius: number, ownerId: string): RuntimePlayer | undefined;
  projectiles: Map<string, RuntimeProjectile>;
  shapes: Map<string, RuntimeShape>;
  drones: Map<string, RuntimeDrone>;
  __auditDelta?: number;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  damageShape(shape: RuntimeShape, damage: number, ownerId: string, now: number): void;
  damageDrone(drone: RuntimeDrone, damage: number, now: number): void;
  fire(...args: unknown[]): void;
  resolvePlayerCollisions(now: number): void;
  /** Naht aus der Basis; `tuneCombatScaling` ersetzt sie durch die gueltige Kurve. */
  bodyDamageOf(player: RuntimePlayer): number;
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
/** Blitz/Comet/Smasher: Körperschaden skaliert mit dem aktuellen Tempo (0,6× im Stand bis 1,35× bei Vollgas). */
const MOMENTUM_CLASSES = new Set(['blitz', 'comet', 'smasher']);
const momentumMultiplier = (player: RuntimePlayer): number => {
  if (!MOMENTUM_CLASSES.has(player.playerClass)) return 1;
  const definition = CLASS_DEFINITIONS[player.playerClass];
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  const ratio = Math.min(1, speed / Math.max(1, definition.moveSpeed));
  return 0.6 + ratio * 0.75;
};
/**
 * Körperschaden eines Tanks – **gelesen, nicht noch einmal gerechnet.**
 *
 * Hier stand die Aufwertungskurve ein drittes Mal woertlich im Code (`+10 %
 * je Punkt`), neben `tunedStatsFor` in `combat-tuning.ts` und der alten
 * Fassung in `game.ts` (`+13 %`). Weil diese Schicht `resolvePlayerCollisions`
 * ERSETZT, entschied ausgerechnet die Kopie hier ueber jeden Rammtreffer –
 * und dass sie mit der gueltigen Kurve uebereinstimmte, war eine Verabredung
 * ohne Vertrag. Jetzt fragt sie die Naht `bodyDamageOf`, die `tuneCombatScaling`
 * besetzt; ohne diese Schicht antwortet die Basis wie eh und je.
 */
const bodyDamage = (internals: GameInternals, player: RuntimePlayer): number =>
  internals.bodyDamageOf(player) * momentumMultiplier(player);
/** Trefferradius einer Drohne – dieselbe Regel wie in `game.ts`. */
const droneRadius = (drone: RuntimeDrone): number => drone.gameplayRadius ?? 12;
/**
 * Der Entitaeten-Ausschnitt. Die Kanten stehen in `shared`
 * (`ENTITY_CULL_HALF`), damit der Client dieselbe Zahl lesen kann -- er leitet
 * daraus ab, wie breit er hoechstens zeigen darf.
 */
const inFixedView = (position: Vector2, center: Vector2): boolean =>
  Math.abs(position.x - center.x) <= ENTITY_CULL_HALF.width &&
  Math.abs(position.y - center.y) <= ENTITY_CULL_HALF.height;

/**
 * Isolates final physics/network hardening from the gameplay class while the
 * simulation is still being split into smaller systems for the next alpha.
 *
 * ## Achtung: Diese Schicht ERSETZT, sie umschliesst nicht
 *
 * `resolvePlayerCollisions`, `resolveShapeBodyCollisions`, `stepProjectiles`
 * und `resolveProjectileCollisions` werden komplett neu geschrieben, ohne das
 * Original zu binden. Damit gilt hier dieselbe Pflicht wie in
 * `combat-tuning.ts`: **Jede Regel, die in `MazeGame` steht, muss hier
 * mitgeschrieben werden** – und wer eine weitere Methode ersetzt, vergleicht
 * sie vorher Zeile fuer Zeile mit der Basis und schreibt einen Test, der durch
 * die Kette geht.
 *
 * Stand 12.08., einzeln nachgesehen:
 *
 * * `resolvePlayerCollisions` – getreue Uebersetzung; `dt * 3.2` ist bei 40 Hz
 *   exakt die 0,08 der Basis. Der Koerperschaden kommt seit dem 12.08. ueber
 *   die Naht `bodyDamageOf` statt aus einer eigenen Kopie der Kurve.
 * * `resolveShapeBodyCollisions` – dieselbe Uebersetzung, dieselbe Konstante.
 * * `stepProjectiles` / `resolveProjectileCollisions` – Obermenge der Basis
 *   (Integritaet, Durchschlag, Sichtfenster-Cull).
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
    snapshot.players = snapshot.players.filter((player) => player.id === selfId || inFixedView(player.position, center));
    snapshot.projectiles = snapshot.projectiles.filter((projectile) => inFixedView(projectile.position, center));
    // Eigene Drohnen werden NIE weggeschnitten (Sams Drohnen-Rework, Stufe 1).
    // Das Schnittfenster ist 848 x 498 px, die Drohnen duerfen aber bis zu
    // 650 px in jede Richtung vom Tank weg – gemessen verschwanden die EIGENEN
    // Drohnen ab 500 px senkrecht aus dem Bild, waehrend sie weiterkaempften.
    // Wer seine Flotte nicht sieht, kann sie nicht fuehren; jede Verbesserung
    // an Reichweite oder Zielsuche waere unsichtbar geblieben.
    snapshot.drones = snapshot.drones.filter((drone) => drone.ownerId === selfId || inFixedView(drone.position, center));
    snapshot.shapes = snapshot.shapes.filter((shape) => inFixedView(shape.position, center));
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
          internals.damagePlayer(a, bodyDamage(internals, b) * dt * 3.2, b.id, now);
          internals.damagePlayer(b, bodyDamage(internals, a) * dt * 3.2, a.id, now);
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
        internals.damageShape(shape, bodyDamage(internals, player) * dt * 3.2, player.id, now);
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
        // Stehendes Projektil (Trapper): siehe game.ts, dieselbe Regel.
        // Stehendes Projektil (Trapper): siehe game.ts, dieselbe Regel.
        if (projectile.plantAtLife !== undefined && projectile.life <= projectile.plantAtLife) {
          projectile.velocity = { x: 0, y: 0 };
        }
        const next = { x: projectile.position.x + projectile.velocity.x * subDt, y: projectile.position.y + projectile.velocity.y * subDt };
        if (!isFree(next, projectile.radius)) { internals.projectiles.delete(projectile.id); continue; }
        projectile.position = next;
        const hits = hitSet(projectile);
        const shape = internals.formenraster.finde(projectile.position, projectile.radius);
        if (shape) {
          const key = `shape:${shape.id}`;
          if (!hits.has(key)) {
            hits.add(key);
            internals.damageShape(shape, projectile.damage, projectile.ownerId, now);
            projectile.integrity -= shape.maxHealth * 0.18;
          }
          if (projectile.integrity <= 0 || shape.health > 0) internals.projectiles.delete(projectile.id);
          continue;
        }
        /*
         * Drohnen sind Ziele – Sam, 14.08.: „Man kann keine Drohnen kaputt
         * schießen!!! Das ist viel zu OP!"
         *
         * Diese Schicht ERSETZT `stepProjectiles`; die neue Drohnenprüfung in
         * `game.ts` wäre also unerreichbar geblieben, wenn sie nicht auch hier
         * stünde. Genau diese Fehlerklasse beschreibt der Kopf dieser Datei.
         *
         * VOR dem Spieler geprüft: Eine Flotte um ihren Besitzer herum ist in
         * Diep.io ein Schild, und ein Schild, das man durchschießt, ist keins.
         */
        const drone = internals.drohnenraster.finde(projectile.position, projectile.radius, (candidate) => candidate.ownerId !== projectile.ownerId);
        if (drone) {
          const key = `drone:${drone.id}`;
          if (!hits.has(key)) {
            hits.add(key);
            internals.damageDrone(drone, projectile.damage, now);
            projectile.integrity -= drone.maxHealth * 0.18;
          }
          if (projectile.integrity <= 0 || drone.health > 0) internals.projectiles.delete(projectile.id);
          continue;
        }
        const target = internals.gegnerAmPunkt(projectile.position, projectile.radius, projectile.ownerId);
        if (target) {
          const key = `player:${target.id}`;
          if (!hits.has(key)) {
            hits.add(key);
            internals.damagePlayer(target, projectile.damage, projectile.ownerId, now);
            projectile.integrity -= target.maxHealth * 0.18;
          }
          if (projectile.integrity <= 0 || target.health > 0) internals.projectiles.delete(projectile.id);
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
