import type { PlayerSnapshot, Vector2 } from '@project-maze/shared';
import { MazeGame } from './game.js';

/**
 * Ein Klick, eine Salve – Dauerfeuer nur beim Halten (Sams Spieltest vom
 * 14.08., Punkt 6).
 *
 * > „Bei Klassen, die sehr viele KUGELN spammen können, muss es immer diese
 * > LOGIK geben, dass sie einmal schießen, wenn man einmal drückt! Also z.B.
 * > bei REPEATER immer die drei Kugeln […] aber halt: nur wenn ich gedrückt
 * > halte, ist auf AUTO-Modus, sonst eben nur einmal die drei, damit man
 * > kontrollierter spielen kann."
 *
 * ## Was vorher passierte
 *
 * Die Feuerentscheidung war eine einzige Zeile (`combat-tuning.ts`):
 *
 * ```ts
 * else if (stats.barrelCount > 0 && player.primary && player.cooldown <= 0)
 * ```
 *
 * Damit gab es keinen Unterschied zwischen „geklickt" und „gehalten" – es gab
 * nur „Taste ist unten". Ein normaler Mausklick dauert 80–150 ms; gemessen an
 * den Nachladezeiten der Spam-Klassen heißt das:
 *
 * | Klasse | Nachladen | Schüsse bei 150 ms Klick |
 * |---|---:|---:|
 * | rapid, voll ausgebaut | 0,090 s | 2 |
 * | gatling | 0,105 s | 2 |
 * | storm | 0,140 s | 2 |
 * | repeater (3er-Salve) | 0,26 s | 1 |
 *
 * Wer einmal klickte, bekam also je nach Klasse einen oder zwei Schuss – und
 * konnte es nicht steuern. Genau das meint Sam mit „kontrollierter spielen".
 *
 * ## Wie es jetzt läuft
 *
 * Der **Druckflanke** gehört genau eine Salve. Bleibt die Taste länger als
 * `HALTESCHWELLE_MS` unten, schaltet der Tank in den Auto-Modus und feuert wie
 * bisher weiter. Das ist die Halbautomatik, die jeder Shooter benutzt, und sie
 * gilt für **jede** Klasse mit Rohr: Bei einer Nachladezeit über 0,2 s ändert
 * sie ohnehin nichts (der zweite Schuss käme später als die Schwelle), bei den
 * schnellen ist sie genau Sams Punkt.
 *
 * Eine Salve ist dabei alles, was aus EINEM `fire`-Aufruf entsteht – also auch
 * die drei zeitversetzten Läufe des Repeaters (`burstDelay`, siehe
 * `queueBurstBarrel`). Sams „immer die drei Kugeln" ist damit erfüllt: Der
 * Klick löst die Salve aus, die Warteschlange spielt sie zu Ende.
 *
 * ## Warum `fire` abgefangen und nicht `primary` verbogen wird
 *
 * Der naheliegende Weg wäre, `player.primary` vor dem Originalschritt auf
 * `false` zu setzen. Der ist nachweislich falsch: `updateBot` läuft INNERHALB
 * von `stepPlayer` und setzt `primary` neu – für Bots wäre die Sperre wirkungslos.
 * Dieselbe Begründung steht seit dem Ladeschuss in `signature-precision.ts`,
 * und dieselbe Lösung steht hier: Der Schuss wird abgefangen und die
 * Nachladezeit zurückgenommen, als hätte es ihn nie gegeben.
 *
 * ## Wo die Schicht steht
 *
 * **Direkt um `tuneCombatScaling`**, innerhalb von `tunePrecisionSignature`.
 * Der Ladeschuss der Präzisionslinie hat seine eigene Kadenz (halten = laden,
 * loslassen = schießen) und ruft `internals.fire` selbst auf – dieser Aufruf
 * kommt an der Sperre vorbei, weil er nicht aus dem Originalschritt stammt.
 * Genau so soll es sein: Eine Klasse, deren ganzes Spiel das Halten ist, darf
 * keine Halbautomatik bekommen.
 */

/**
 * Ab wann ein Druck als „gehalten" gilt und der Auto-Modus einsetzt.
 *
 * 200 ms liegen über dem längsten normalen Mausklick (gemessen 80–150 ms) und
 * unter der Zeit, die ein Mensch für „ich halte jetzt" braucht. Der Preis ist
 * eine einmalige Verzögerung des zweiten Schusses: Ein Rapid mit 0,09 s
 * Nachladezeit feuert bei gehaltener Taste bei 0 ms und dann erst bei 200 ms,
 * ab da im vollen Takt. Das ist der Unterschied zwischen „Klick" und „Halten"
 * und kostet über eine Sekunde Dauerfeuer rund einen Schuss.
 */
export const HALTESCHWELLE_MS = 200;

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  primary: boolean;
  cooldown: number;
}

interface CadenceInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  fire(player: RuntimePlayer, stats: unknown): void;
}

interface Druckzustand {
  /** Wann die Taste heruntergegangen ist – `null`, solange sie oben ist. */
  seit: number | null;
  /** Ob dieser Druck seine eine Salve schon bekommen hat. */
  salveAbgegeben: boolean;
}

const zustaende = new WeakMap<MazeGame, Map<string, Druckzustand>>();
const zustandFor = (game: MazeGame): Map<string, Druckzustand> => {
  const vorhanden = zustaende.get(game);
  if (vorhanden) return vorhanden;
  const neu = new Map<string, Druckzustand>();
  zustaende.set(game, neu);
  return neu;
};

/**
 * Nur für Tests und Betriebsanzeigen: Steht dieser Spieler gerade im
 * Auto-Modus (Taste länger als die Schwelle unten)?
 */
export function imAutoModus(game: MazeGame, playerId: string, now: number): boolean {
  const zustand = zustandFor(game).get(playerId);
  return zustand?.seit !== null && zustand?.seit !== undefined && now - zustand.seit >= HALTESCHWELLE_MS;
}

/** Hängt die Halbautomatik an. `enabled = false` stellt exakt den Stand davor her. */
export function tuneFireCadence<T extends MazeGame>(game: T, enabled = true): T {
  if (!enabled) return game;
  const internals = game as unknown as CadenceInternals;
  const zustaendeDesSpiels = zustandFor(game);

  const zustandVon = (player: RuntimePlayer): Druckzustand => {
    const vorhanden = zustaendeDesSpiels.get(player.id);
    if (vorhanden) return vorhanden;
    const neu: Druckzustand = { seit: null, salveAbgegeben: false };
    zustaendeDesSpiels.set(player.id, neu);
    return neu;
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    const zustand = zustandVon(player);
    const cooldownVorher = player.cooldown;
    // Gebunden, nicht bloß gemerkt: Ohne Schicht darüber steht in
    // `internals.fire` noch die Prototyp-Methode der Basis, die ihr `this`
    // braucht. Gemerkt wird sie erst hier, damit der Aufruf durch die ganze
    // fertige Kette geht – auch durch Schichten, die weiter außen liegen.
    const echtesFeuer = internals.fire.bind(internals);
    let unterdrueckt = false;

    internals.fire = (ziel: RuntimePlayer, stats: unknown): void => {
      // Nur der Schuss DIESES Spielers aus DIESEM Schritt geht durch die
      // Sperre. Fremde Aufrufe (etwa der Ladeschuss eines anderen Spielers
      // während desselben Ticks) bleiben unberührt.
      if (ziel !== player) {
        echtesFeuer(ziel, stats);
        return;
      }
      // Erster Feuerversuch dieses Drucks: Hier fällt die Flanke.
      if (zustand.seit === null) {
        zustand.seit = now;
        zustand.salveAbgegeben = false;
      }
      const haelt = now - zustand.seit >= HALTESCHWELLE_MS;
      if (!haelt && zustand.salveAbgegeben) {
        unterdrueckt = true;
        return;
      }
      zustand.salveAbgegeben = true;
      echtesFeuer(ziel, stats);
    };

    try {
      originalStepPlayer(player, dt, now);
    } finally {
      internals.fire = echtesFeuer;
    }

    // Die Nachladezeit zurücknehmen, als hätte es den Schuss nie gegeben –
    // sonst bezahlt der Spieler eine volle Ladephase für einen Schuss, der gar
    // nicht herauskam.
    if (unterdrueckt) player.cooldown = Math.max(0, cooldownVorher - dt);

    // Loslassen (oder Tod) beendet den Druck. Ab hier zählt der nächste wieder
    // als frische Flanke.
    if (!player.primary || player.dead) {
      zustand.seit = null;
      zustand.salveAbgegeben = false;
      return;
    }
    // Taste unten, aber noch keine Flanke gemerkt: Das ist der Fall, in dem der
    // Schritt gar nicht erst zu feuern versuchte, weil noch nachgeladen wurde.
    // Ohne diese Zeile begänne die Haltezeit erst beim ersten Schuss, und wer
    // die Taste während des Nachladens drückt, käme nie in den Auto-Modus.
    if (zustand.seit === null) zustand.seit = now;
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    zustaendeDesSpiels.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
