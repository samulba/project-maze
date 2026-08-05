import {
  UPGRADE_IDS,
  type KillEvent,
  type LeaderboardEntry,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type Vector2,
  type Wall,
  type WorldSnapshot
} from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';

/**
 * Verkleinert den Snapshot, ohne eine einzige Spielregel zu verändern.
 *
 * Bei voller Arena ist der Snapshot-Versand der Flaschenhals, nicht die
 * Simulation. Zwei Hebel, beide rein auf der Übertragungsebene:
 *
 * 1. **Runden** – jede Fließkommazahl wird auf die Genauigkeit gekürzt, die der
 *    Client tatsächlich darstellen kann. `2843.2716063857124` wird zu `2843.3`.
 *    Das ist immer aktiv und für den Client transparent.
 * 2. **Nur bei Änderung senden** – Name, Klasse, Bot-Flag und Upgrade-Stand
 *    eines Spielers und Art, Radius und maximales Leben einer Form ändern sich
 *    fast nie; Wände im Sichtfeld, Bestenliste und Killfeed bleiben über viele
 *    Snapshots identisch. Alle kosten trotzdem in jedem Snapshot volle Bytes.
 *
 * Punkt 2 lässt Felder weg und braucht deshalb einen Client, der den letzten
 * Stand puffert. Bis der ausgeliefert ist, hängt er an `SNAPSHOT_DELTAS` und
 * ist standardmäßig aus – ein Server, der Felder weglässt, die der Client noch
 * nicht kennt, zeigt Spieler ohne Namen und eine leere Karte.
 */

/** Weltkoordinaten: Zehntel einer Einheit ist deutlich feiner als ein Pixel. */
export const SNAPSHOT_POSITION_DECIMALS = 1;
/** Winkel in Radiant: 0,001 rad sind rund 0,06 Grad. */
export const SNAPSHOT_ANGLE_DECIMALS = 3;

const round1 = (value: number): number => Math.round(value * 10) / 10;
const round3 = (value: number): number => Math.round(value * 1_000) / 1_000;
const roundVector = (vector: Vector2): void => {
  vector.x = round1(vector.x);
  vector.y = round1(vector.y);
};

type EncodedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;

/**
 * Der Snapshot besteht bereits aus frischen Kopien – Runden verändert also
 * niemals den Simulationszustand. Einzige Ausnahme sind die Wände: die sind
 * geteilte Objekte und werden nur als Kopie gerundet.
 */
function roundSnapshot(snapshot: EncodedSnapshot): void {
  for (const player of snapshot.players) {
    roundVector(player.position);
    roundVector(player.velocity);
    player.angle = round3(player.angle);
    player.health = round1(player.health);
    player.maxHealth = round1(player.maxHealth);
  }
  for (const projectile of snapshot.projectiles) {
    roundVector(projectile.position);
    roundVector(projectile.velocity);
    projectile.radius = round1(projectile.radius);
    projectile.integrity = round1(projectile.integrity);
    projectile.maxIntegrity = round1(projectile.maxIntegrity);
  }
  for (const drone of snapshot.drones) {
    roundVector(drone.position);
    roundVector(drone.velocity);
    drone.angle = round3(drone.angle);
    drone.health = round1(drone.health);
    drone.maxHealth = round1(drone.maxHealth);
  }
  for (const shape of snapshot.shapes) {
    roundVector(shape.position);
    roundVector(shape.velocity);
    shape.radius = round1(shape.radius);
    shape.rotation = round3(shape.rotation);
    shape.health = round1(shape.health);
    shape.maxHealth = round1(shape.maxHealth);
  }
  if (snapshot.arenaEvent) roundVector(snapshot.arenaEvent.center);
  if (snapshot.gameplay) {
    for (const key of Object.keys(snapshot.gameplay)) {
      const entry = snapshot.gameplay[key];
      if (!entry) continue;
      entry.moduleCharge = round3(entry.moduleCharge);
      entry.barrierHealth = round1(entry.barrierHealth);
      entry.barrierMaxHealth = round1(entry.barrierMaxHealth);
    }
  }
}

const roundedWall = (wall: Wall): Wall => ({
  id: wall.id,
  x: round1(wall.x),
  y: round1(wall.y),
  width: round1(wall.width),
  height: round1(wall.height)
});

/** `wallsInView` filtert ein stabiles Array – Referenzvergleich reicht und ist billig. */
const sameWalls = (a: readonly Wall[], b: readonly Wall[]): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
};

const staticSignature = (player: PlayerSnapshot): string => {
  let signature = `${player.name} ${player.playerClass} ${player.isBot ? 1 : 0}`;
  for (const id of UPGRADE_IDS) signature += ` ${player.upgrades[id]}`;
  return signature;
};

/** Die Bestenliste ist für alle Clients identisch – die Signatur genügt einmal pro Tick. */
const leaderboardSignature = (leaderboard: readonly LeaderboardEntry[]): string =>
  leaderboard.map((entry) => `${entry.id} ${entry.score} ${entry.level} ${entry.playerClass}`).join('|');

/** `KillEvent.id` wächst monoton – erste und letzte ID beschreiben den Ausschnitt eindeutig. */
const killfeedSignature = (killfeed: readonly KillEvent[]): string =>
  `${killfeed.length}:${killfeed[0]?.id ?? 0}:${killfeed[killfeed.length - 1]?.id ?? 0}`;

/** Form, Größe und maximales Leben einer Form ändern sich nur bei der Elite-Beförderung. */
const shapeSignature = (shape: ShapeSnapshot): string =>
  `${shape.kind} ${shape.radius} ${shape.maxHealth}`;

interface ViewerState {
  /** Statik-Signatur je Spieler, den dieser Client im letzten Snapshot gesehen hat. */
  statics: Map<string, string>;
  /** Statik-Signatur je Form im letzten Snapshot dieses Clients. */
  shapes: Map<string, string>;
  /** Zuletzt an diesen Client gesendete Wandliste (Originalreferenzen). */
  walls: readonly Wall[] | null;
  leaderboard: string | null;
  killfeed: string | null;
}

interface EncodingState {
  viewers: Map<string, ViewerState>;
  /** Tick, für den die Bestenlisten-Signatur zuletzt berechnet wurde. */
  tick: number;
  leaderboard: string;
}

const states = new WeakMap<MazeGame, EncodingState>();
const stateFor = (game: MazeGame): EncodingState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: EncodingState = { viewers: new Map(), tick: -1, leaderboard: '' };
  states.set(game, created);
  return created;
};
const viewerFor = (state: EncodingState, selfId: string): ViewerState => {
  const existing = state.viewers.get(selfId);
  if (existing) return existing;
  const created: ViewerState = {
    statics: new Map(),
    shapes: new Map(),
    walls: null,
    leaderboard: null,
    killfeed: null
  };
  state.viewers.set(selfId, created);
  return created;
};

/**
 * Lässt Name, Klasse, Bot-Flag und Upgrades weg, solange dieser Client sie
 * unverändert kennt. Betritt ein Spieler das Sichtfeld neu, fehlt er in
 * `statics` und wird automatisch wieder vollständig übertragen.
 */
function stripPlayerStatics(viewer: ViewerState, snapshot: EncodedSnapshot): void {
  const next = new Map<string, string>();
  snapshot.players = snapshot.players.map((player) => {
    const signature = staticSignature(player);
    next.set(player.id, signature);
    if (viewer.statics.get(player.id) !== signature) return player;
    const { name: _name, playerClass: _class, isBot: _bot, upgrades: _upgrades, ...rest } = player;
    return rest as PlayerSnapshot;
  });
  viewer.statics = next;
}

/** Dasselbe für Formen: Art, Radius und maximales Leben nur bei Änderung. */
function stripShapeStatics(viewer: ViewerState, snapshot: EncodedSnapshot): void {
  const next = new Map<string, string>();
  snapshot.shapes = snapshot.shapes.map((shape) => {
    const signature = shapeSignature(shape);
    next.set(shape.id, signature);
    if (viewer.shapes.get(shape.id) !== signature) return shape;
    const { kind: _kind, radius: _radius, maxHealth: _maxHealth, ...rest } = shape;
    return rest as ShapeSnapshot;
  });
  viewer.shapes = next;
}

/** Lässt die Wandliste weg, solange sie sich für diesen Client nicht geändert hat. */
function stripWalls(viewer: ViewerState, snapshot: EncodedSnapshot): void {
  const walls = snapshot.walls;
  if (viewer.walls && sameWalls(viewer.walls, walls)) {
    delete (snapshot as Partial<WorldSnapshot>).walls;
    return;
  }
  viewer.walls = walls;
  snapshot.walls = walls.map(roundedWall);
}

/**
 * Verkleinert ausgehende Snapshots. `deltas` schaltet die Felder zu, die einen
 * puffernden Client voraussetzen; das Runden läuft immer.
 */
export function tuneSnapshotEncoding<T extends MazeGame>(game: T, deltas = false): T {
  const state = stateFor(game);
  const originalSnapshot = game.snapshot.bind(game);

  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as EncodedSnapshot;
    roundSnapshot(snapshot);
    if (!deltas) {
      snapshot.walls = snapshot.walls.map(roundedWall);
      return snapshot;
    }

    const viewer = viewerFor(state, selfId);
    stripPlayerStatics(viewer, snapshot);
    stripShapeStatics(viewer, snapshot);
    stripWalls(viewer, snapshot);

    if (state.tick !== snapshot.tick) {
      state.tick = snapshot.tick;
      state.leaderboard = leaderboardSignature(snapshot.leaderboard);
    }
    if (viewer.leaderboard === state.leaderboard) delete (snapshot as Partial<WorldSnapshot>).leaderboard;
    else viewer.leaderboard = state.leaderboard;

    const killfeed = killfeedSignature(snapshot.killfeed);
    if (viewer.killfeed === killfeed) delete (snapshot as Partial<WorldSnapshot>).killfeed;
    else viewer.killfeed = killfeed;

    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    state.viewers.delete(id);
    for (const viewer of state.viewers.values()) viewer.statics.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/**
 * Verwirft den gemerkten Stand eines Clients, sodass der nächste Snapshot
 * wieder vollständig ist. Nötig, wenn ein Snapshot nicht beim Client ankommt –
 * sonst fehlten ihm Felder, die der Server bereits als übertragen verbucht hat.
 */
export function resetSnapshotBaseline(game: MazeGame, selfId: string): void {
  states.get(game)?.viewers.delete(selfId);
}
