import type { InputMessage } from '@project-maze/shared';
import { MazeGame } from './game.js';

/**
 * Der Geist-Tank: Wer still die Verbindung verliert, fährt und feuert weiter.
 *
 * Ein Netzverlust ohne Close-Frame – U-Bahn, Aufzug, WLAN auf LTE – fällt dem
 * Server erst beim Heartbeat auf. Bis dahin bleibt der Spieler voll simuliert,
 * und es gab **keinen Eingabe-Timeout**: `applyInput` ist der einzige
 * Schreiber von `move`, `primary` und `secondary`, und niemand setzte sie
 * zurück, wenn keine Nachrichten mehr kamen. Der Tank fuhr also mit dem
 * letzten Bewegungsvektor weiter, feuerte bei gehaltener Maus weiter, sammelte
 * XP und Kills und war für alle anderen ein ganz normaler Gegner – bis zu eine
 * Minute lang. Der echte Spieler saß derweil schon in einer neuen Verbindung
 * unter neuer ID und sah seinen alten Tank durch die Arena fahren.
 *
 * Die Regel hier ist bewusst schmal: **Stille heisst losgelassen.** Sie
 * beendet keine Verbindung, sie räumt niemanden ab, sie fasst nichts an außer
 * den drei Eingabefeldern. Alles Weitere – Trennen, Sitzung schliessen – bleibt
 * beim Heartbeat, wo es hingehört.
 *
 * Zwei Sachen daran sind kein Zufall:
 *
 * * **Nur Menschen.** Bots haben nie eine Eingabe geschickt; ihre Bewegung
 *   kommt aus `updateBot`. Ein Zeitfenster über sie hinweg würde die halbe
 *   Arena einfrieren.
 * * **Zwei Sekunden.** Der Client schickt mit `GAME.tickRate` (also 20/s),
 *   auch wenn sich nichts ändert. Selbst ein gedrosselter Hintergrund-Tab
 *   kommt noch auf etwa eine Nachricht pro Sekunde. Zwei Sekunden Stille sind
 *   damit kein langsamer Spieler, sondern eine tote Leitung.
 */
export const INPUT_IDLE_MS = 2_000;

interface IdleInternals {
  players: Map<string, { isBot: boolean; move: { x: number; y: number }; primary: boolean; klick: boolean; secondary: boolean }>;
}

/** Letzte Eingabe je Spieler-ID, pro Spielinstanz. */
const uhren = new WeakMap<MazeGame, Map<string, number>>();

const uhrFor = (game: MazeGame): Map<string, number> => {
  const vorhanden = uhren.get(game);
  if (vorhanden) return vorhanden;
  const frisch = new Map<string, number>();
  uhren.set(game, frisch);
  return frisch;
};

/** Wie lange dieser Spieler schon nichts mehr geschickt hat (für Tests). */
export function inputSilenceMs(game: MazeGame, playerId: string, now = Date.now()): number | null {
  const zuletzt = uhren.get(game)?.get(playerId);
  return zuletzt === undefined ? null : now - zuletzt;
}

export function tuneInputIdle<T extends MazeGame>(game: T, idleMs = INPUT_IDLE_MS): T {
  const internals = game as unknown as IdleInternals;
  const uhr = uhrFor(game);
  const originalApplyInput = game.applyInput.bind(game);
  const originalStep = game.step.bind(game);
  const originalRemovePlayer = game.removePlayer.bind(game);
  /*
   * Beide Seiten rechnen mit DERSELBEN Uhr -- der des Ticks.
   *
   * `applyInput` bekommt keine Zeit uebergeben; ein `Date.now()` an dieser
   * Stelle liefe gegen die Wanduhr, waehrend `step` in Tests (und im
   * Zeitraffer) eine eigene Uhr mitbringt. Die Frist waere dann sofort
   * abgelaufen oder nie -- je nachdem, welche Uhr weiter vorn steht.
   */
  let tickZeit = Date.now();

  game.applyInput = ((playerId: string, input: InputMessage): void => {
    originalApplyInput(playerId, input);
    uhr.set(playerId, tickZeit);
  }) as T['applyInput'];

  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    tickZeit = now;
    for (const [id, spieler] of internals.players) {
      if (spieler.isBot) continue;
      const zuletzt = uhr.get(id);
      // Wer noch nie etwas geschickt hat, wird ab jetzt beobachtet – sonst
      // stünde für ihn nie eine Frist, und der Fall „joint und verstummt
      // sofort" fiele durch.
      if (zuletzt === undefined) {
        uhr.set(id, now);
        continue;
      }
      if (now - zuletzt < idleMs) continue;
      spieler.move = { x: 0, y: 0 };
      spieler.primary = false;
      // Auch der Zeigerbefehl: Sonst flöge die Flotte eines abwesenden Spielers
      // weiter auf seinen letzten Mauszeiger zu (Drohnensteuerung, 14.08.).
      spieler.klick = false;
      spieler.secondary = false;
    }
  }) as T['step'];

  game.removePlayer = ((playerId: string): void => {
    uhr.delete(playerId);
    originalRemovePlayer(playerId);
  }) as T['removePlayer'];

  return game;
}
