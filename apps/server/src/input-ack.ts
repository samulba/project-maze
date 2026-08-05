import type { WorldSnapshot } from '@project-maze/shared';
import { MazeGame } from './game.js';

/**
 * Input-Quittung für die clientseitige Vorhersage.
 *
 * Der Client sagt seine eigene Bewegung voraus, statt auf die Antwort zu
 * warten. Damit er danach aufräumen kann, muss er wissen, welche seiner
 * Eingaben im empfangenen Zustand schon steckt: Alles davor wirft er weg,
 * alles danach rechnet er auf der Serverposition erneut nach.
 *
 * Entscheidend ist dabei das *Wann*. `applyInput` läuft sofort beim Eintreffen
 * der Nachricht, integriert wird aber erst im nächsten Tick. Zwischen Tick und
 * Snapshot eintreffende Eingaben sind also angenommen, aber noch nicht in der
 * Position enthalten. Würden wir hier einfach `lastInput` melden, verwürfe der
 * Client eine Eingabe, die der Server noch gar nicht gerechnet hat – und genau
 * das erzeugt das Ruckeln, das die Vorhersage beseitigen soll.
 *
 * Deshalb wird die Sequenznummer im Tick festgehalten und bis zum nächsten Tick
 * unverändert gemeldet: Was hier steht, steckt garantiert in den Positionen
 * desselben Snapshots.
 */

/** Noch keine Eingabe verarbeitet – der Client hat alles nachzurechnen. */
export const NO_INPUT_PROCESSED = -1;

/** Feld, das `WorldSnapshot` noch fehlt (Vorschlag steht im Statusblock). */
interface InputAckExtension {
  lastProcessedInput: number;
}

interface AckInternals {
  players: Map<string, { id: string; lastInput: number }>;
}

const states = new WeakMap<MazeGame, Map<string, number>>();
const stateFor = (game: MazeGame): Map<string, number> => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = new Map<string, number>();
  states.set(game, created);
  return created;
};

/** Sequenznummer, die für diesen Spieler zuletzt in einen Tick eingeflossen ist. */
export function lastProcessedInputFor(game: MazeGame, playerId: string): number {
  return states.get(game)?.get(playerId) ?? NO_INPUT_PROCESSED;
}

/**
 * Hängt die Quittung an. Gehört nach ganz außen: `selfId` ist dort der
 * tatsächliche Empfänger – auch dann, wenn der Snapshot inhaltlich aus einer
 * fremden Perspektive gebaut wurde (Zuschauermodus). Quittiert wird immer die
 * eigene Eingabe, niemals die des beobachteten Spielers.
 */
export function tuneInputAck<T extends MazeGame>(game: T): T {
  const internals = game as unknown as AckInternals;
  const processed = stateFor(game);

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    // Ein Schritt der Länge null bewegt nichts – dann ist auch nichts zu quittieren.
    if (dt <= 0) return;
    for (const player of internals.players.values()) processed.set(player.id, player.lastInput);
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<InputAckExtension>;
    snapshot.lastProcessedInput = processed.get(selfId) ?? NO_INPUT_PROCESSED;
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    processed.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
