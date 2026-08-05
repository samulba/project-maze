import type { PlayerSnapshot, WorldSnapshot } from '@project-maze/shared';
import { MazeGame, playerSnapshot } from './game.js';

/**
 * Zuschauen nach dem Tod.
 *
 * Wer stirbt, sieht bis zum Respawn live seinem Killer zu, statt auf eine
 * Aufzeichnung zu starren. Umgesetzt an genau einer Stelle: Der Snapshot für
 * einen Toten wird aus der Perspektive des Killers gebaut. Das heißt, er wird
 * mit dessen ID erzeugt – dadurch greifen Sichtfenster, Culling und
 * Wandauswahl unverändert und automatisch richtig, und der Zuschauer bekommt
 * garantiert nichts zu sehen, was der Killer nicht auch sieht. Es gibt keinen
 * zweiten Culling-Pfad, der auseinanderlaufen könnte.
 *
 * `selfId` bleibt dabei die eigene ID. Der Tote ist weiterhin „er selbst" –
 * HUD, Death-Screen, Respawn-Knopf und Achievements arbeiten unverändert
 * weiter. Nur die Kamera folgt einem anderen Tank, und dafür steht
 * `spectatorTargetId` im Snapshot.
 *
 * Ohne `SPECTATOR_ENABLED` wird die Schicht nicht angehängt: Der Server
 * verhält sich exakt wie vorher. Sie braucht einen Client, der die Kamera auf
 * `spectatorTargetId` zentriert – sonst stünde die Kamera weiter auf der
 * Leiche, während die Entitäten um den Killer herum liegen, und der Bildschirm
 * bliebe leer.
 */

/** Feld, das `GameplayWorldExtension` noch fehlt (Vorschlag steht im Statusblock). */
interface SpectatorWorldExtension {
  /** Tank, aus dessen Perspektive dieser Snapshot gebaut wurde, sonst null. */
  spectatorTargetId: string | null;
}

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface SpectatorInternals {
  players: Map<string, RuntimePlayer>;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}

/** Killer je Gefallenem. Rein im Arbeitsspeicher und nur bis zum nächsten Tod gültig. */
const states = new WeakMap<MazeGame, Map<string, string>>();
const stateFor = (game: MazeGame): Map<string, string> => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = new Map<string, string>();
  states.set(game, created);
  return created;
};

/**
 * Wem der Tote gerade zusieht. Der Killer muss noch da und am Leben sein –
 * sonst bleibt es bei der eigenen Todesposition, wie ohne Zuschauermodus.
 */
export function spectatorTargetFor(game: MazeGame, viewerId: string): string | null {
  const internals = game as unknown as SpectatorInternals;
  const viewer = internals.players.get(viewerId);
  if (!viewer || !viewer.dead) return null;
  const killerId = stateFor(game).get(viewerId);
  if (!killerId || killerId === viewerId) return null;
  const killer = internals.players.get(killerId);
  if (!killer || killer.dead) return null;
  return killer.id;
}

/**
 * Hängt den Zuschauermodus an. Muss direkt um `hardenSimulation` liegen: Alle
 * äußeren Schichten sollen bereits den korrigierten Snapshot sehen, damit
 * Gameplay-Daten, Arena-Felder und Encoding zum Toten passen und nicht zum
 * Killer.
 */
export function tuneSpectator<T extends MazeGame>(game: T, enabled = false): T {
  if (!enabled) return game;
  const internals = game as unknown as SpectatorInternals;
  const killers = stateFor(game);

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const wasDead = target.dead;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (wasDead || !target.dead) return;
    // Umgebungstod und Selbstabschuss haben keinen Killer, dem man zusehen könnte.
    if (attackerId && attackerId !== target.id) killers.set(target.id, attackerId);
    else killers.delete(target.id);
  };

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const targetId = spectatorTargetFor(game, selfId);
    if (!targetId) {
      const own = originalSnapshot(selfId, now) as WorldSnapshot & Partial<SpectatorWorldExtension>;
      own.spectatorTargetId = null;
      return own;
    }

    // Der entscheidende Kniff: mit der ID des Killers bauen. Sichtfenster,
    // Culling und Wandauswahl sind damit exakt die des Killers.
    const snapshot = originalSnapshot(targetId, now) as WorldSnapshot & Partial<SpectatorWorldExtension>;
    snapshot.selfId = selfId;
    snapshot.spectatorTargetId = targetId;

    // Der Tote selbst muss im Snapshot stehen – sonst findet der Client sein
    // eigenes `self` nicht und zeigt weder Death-Screen noch Respawn.
    if (!snapshot.players.some((player) => player.id === selfId)) {
      const viewer = internals.players.get(selfId);
      if (viewer) snapshot.players.push(playerSnapshot(viewer as never));
    }
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    killers.delete(id);
    for (const [victimId, killerId] of killers) if (killerId === id) killers.delete(victimId);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
