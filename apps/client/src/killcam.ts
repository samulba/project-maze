import { GAME, type PlayerSnapshot, type Vector2, type WorldSnapshot } from '@project-maze/shared';

/**
 * Killcam: rein clientseitiger Rückblick auf die letzten Sekunden vor dem eigenen Tod.
 * Der Server sendet dafür nichts Zusätzliches – der Client puffert die Snapshots,
 * die er ohnehin empfängt, und spielt sie im Death-Screen verlangsamt ab.
 */

export interface KillcamActor {
  id: string;
  name: string;
  x: number;
  y: number;
  angle: number;
  radius: number;
  dead: boolean;
  health: number;
  maxHealth: number;
}

export interface KillcamShot {
  x: number;
  y: number;
  radius: number;
  ownerId: string;
}

export interface KillcamFrame {
  /** Serverzeit des Snapshots – bestimmt die Abspielgeschwindigkeit. */
  time: number;
  actors: KillcamActor[];
  shots: KillcamShot[];
}

/** Aufgezeichnetes Fenster in Millisekunden. */
export const KILLCAM_WINDOW_MS = 4200;
/** Höchstzahl gepufferter Frames – begrenzt den Speicher bei hoher Snapshot-Rate. */
export const KILLCAM_MAX_FRAMES = 220;
/** So viele Gegner werden je Frame gespeichert (die nächsten am Spieler). */
const MAX_ACTORS_PER_FRAME = 10;
/** So viele Projektile werden je Frame gespeichert. */
const MAX_SHOTS_PER_FRAME = 26;
/** Radius um den Spieler, innerhalb dessen aufgezeichnet wird. */
const RECORD_RADIUS = Math.max(GAME.visibleWorldWidth, GAME.visibleWorldHeight) * 0.75;

const distanceSquared = (a: Vector2, b: Vector2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Ringpuffer der letzten Sekunden. Speichert nur, was in der Nähe des Spielers
 * passiert ist – der Rest ist für einen Rückblick ohnehin nicht sichtbar.
 */
export class KillcamRecorder {
  private frames: KillcamFrame[] = [];
  private walls: WorldSnapshot['walls'] = [];

  record(snapshot: WorldSnapshot): void {
    const self = snapshot.players.find((player) => player.id === snapshot.selfId);
    if (!self) return;
    // Wände ändern sich im Aufzeichnungsfenster kaum – ein Verweis auf den
    // letzten Stand reicht als Kulisse und kostet nichts.
    this.walls = snapshot.walls;

    const actors = snapshot.players
      .filter((player) => player.id === self.id || distanceSquared(player.position, self.position) <= RECORD_RADIUS ** 2)
      .sort((a, b) => distanceSquared(a.position, self.position) - distanceSquared(b.position, self.position))
      .slice(0, MAX_ACTORS_PER_FRAME)
      .map((player) => toActor(player));

    const shots = snapshot.projectiles
      .filter((projectile) => distanceSquared(projectile.position, self.position) <= RECORD_RADIUS ** 2)
      .sort((a, b) => distanceSquared(a.position, self.position) - distanceSquared(b.position, self.position))
      .slice(0, MAX_SHOTS_PER_FRAME)
      .map((projectile) => ({
        x: projectile.position.x,
        y: projectile.position.y,
        radius: projectile.radius,
        ownerId: projectile.ownerId
      }));

    this.frames.push({ time: snapshot.serverTime, actors, shots });
    this.trim(snapshot.serverTime);
  }

  /** Entfernt alles, was älter als das Aufzeichnungsfenster ist. */
  private trim(now: number): void {
    let firstKept = 0;
    while (firstKept < this.frames.length && now - (this.frames[firstKept]?.time ?? now) > KILLCAM_WINDOW_MS) {
      firstKept += 1;
    }
    if (firstKept > 0) this.frames = this.frames.slice(firstKept);
    if (this.frames.length > KILLCAM_MAX_FRAMES) this.frames = this.frames.slice(-KILLCAM_MAX_FRAMES);
  }

  /** Kopie des Puffers – der Recorder läuft während der Wiedergabe weiter. */
  takeFrames(): KillcamFrame[] {
    return this.frames.slice();
  }

  takeWalls(): WorldSnapshot['walls'] {
    return this.walls;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  clear(): void {
    this.frames = [];
    this.walls = [];
  }
}

function toActor(player: PlayerSnapshot): KillcamActor {
  return {
    id: player.id,
    name: player.name,
    x: player.position.x,
    y: player.position.y,
    angle: player.angle,
    radius: GAME.playerRadius,
    dead: player.dead,
    health: player.health,
    maxHealth: player.maxHealth
  };
}

/**
 * Der Snapshot nennt nur den Namen des Killers, nicht seine Id. Bei gleichen Namen
 * (Bots teilen sich Namen) gewinnt der Kandidat, der dem Opfer im letzten Frame
 * am nächsten war – das ist praktisch immer der, der auch getroffen hat.
 */
export function resolveKillerId(frames: KillcamFrame[], victimId: string, killerName: string): string | null {
  const wanted = killerName.trim().toLowerCase();
  if (!wanted || wanted === 'arena') return null;

  let best: { id: string; distance: number } | null = null;
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (!frame) continue;
    const victim = frame.actors.find((actor) => actor.id === victimId);
    for (const actor of frame.actors) {
      if (actor.id === victimId || actor.name.trim().toLowerCase() !== wanted) continue;
      const distance = victim ? Math.hypot(actor.x - victim.x, actor.y - victim.y) : 0;
      if (!best || distance < best.distance) best = { id: actor.id, distance };
    }
    // Der letzte Frame, in dem der Killer überhaupt auftaucht, entscheidet.
    if (best) return best.id;
  }
  return null;
}

/**
 * Schneidet den Puffer auf das Fenster vor dem Tod zu und wirft leere Aufnahmen weg.
 * Frames ohne den Killer bleiben erhalten – die Kamera fällt dann auf das Opfer zurück.
 */
export function buildReplay(frames: KillcamFrame[], victimId: string, windowMs: number): KillcamFrame[] {
  const last = frames[frames.length - 1];
  if (!last) return [];
  const from = last.time - windowMs;
  const clipped = frames.filter((frame) => frame.time >= from);
  const usable = clipped.filter((frame) => frame.actors.some((actor) => actor.id === victimId));
  return usable.length >= 2 ? usable : [];
}
