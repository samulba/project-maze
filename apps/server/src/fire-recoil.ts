import { GAME, type PlayerSnapshot, type Vector2 } from '@project-maze/shared';
import { MazeGame } from './game.js';
import { moveCircle } from './world.js';

/**
 * Rückstoß beim Feuern (Sams Spieltest vom 13.08.).
 *
 * Sam: „Es fehlt mir noch, vor allem bei den Klassen, die sehr viel schießen,
 * noch bisschen dieser Rückstoß von der Klasse an sich. Aber jetzt auch nicht
 * zu stark."
 *
 * Vorher gab es serverseitig **gar keinen**. Der Client versetzte den
 * Tankkörper optisch (`recoil` im Renderer), das Spiel selbst merkte davon
 * nichts – der Tank stand beim Dauerfeuer exakt still.
 *
 * ## Warum getragen und nicht als Impuls
 *
 * Der naheliegende Weg wäre `player.velocity` beim Schuss zu verändern. Der
 * ist nachgemessen falsch, weil vier Schwellen im Spiel an der
 * GESCHWINDIGKEIT hängen und alle mitkippen würden:
 *
 * * **SIEGE-Stellung** (Schwelle 20): Die Familie, deren ganzes Spiel das
 *   Stillstehen ist, würde sich durch eigenes Feuern entwaffnen – gemessen
 *   fällt ihre Stellung bei einem Impuls von 120 in vier Sekunden von 100 auf
 *   89, bei 200 auf 56.
 * * **Reparatur** (`REPAIR_MOVE_LIMIT` 40): Ein feuernder Tank könnte nicht
 *   mehr reparieren.
 * * **Stillstands-Perk** (Schwelle 12): Regeneration im Stand ginge beim
 *   Feuern aus.
 * * **Rammschaden von blitz und comet** skaliert mit dem Tempo – ihr Schaden
 *   im Stand stiege unbeabsichtigt.
 *
 * Deshalb wird der Stoß über die POSITION getragen: Die Geschwindigkeit bleibt
 * unberührt, gemessen exakt 0,000 im Stand. Dasselbe Muster benutzt der Dash
 * (`loadout-system.ts`), der seit Wochen in Produktion läuft.
 *
 * ## Warum proportional zur Nachladezeit
 *
 * Ein Festwert je Schuss belohnt schnelles Feuern doppelt: Eine Gatling mit
 * zehn Schuss pro Sekunde bekäme den zehnfachen Weg einer Kanone. Der Weg ist
 * deshalb `RUECKSTOSS_TEMPO × Nachladezeit` – die Summe pro Sekunde bleibt
 * damit konstant, egal wie weit das Nachladen ausgebaut ist. Das ist auch die
 * Antwort auf Sams „aber nicht zu stark": Der Tank driftet beim Dauerfeuer
 * rund 25 px je Sekunde, also etwa ein Zehntel seiner Laufgeschwindigkeit.
 *
 * ## Wer ihn bekommt
 *
 * Jede Klasse mit Rohr. Die alte Tabelle im Klassen-Katalog kannte nur 22 von
 * 65 Klassen – ausgerechnet sechs der zwölf schnellsten standen nicht drin,
 * also genau Sams Zielgruppe. Drohnenklassen erreichen den Feuerpfad nie und
 * bekommen folgerichtig keinen.
 */

/** Driftgeschwindigkeit beim Dauerfeuer, in Weltpixeln je Sekunde. */
export const RUECKSTOSS_TEMPO = 25;
/**
 * Über diese Zeit wird ein einzelner Stoß getragen. Kürzer als der kürzeste
 * Salvenabstand im Spiel (Rapid bei Vollausbau: 85 ms), damit sich zwei Stöße
 * nie überlagern und die Drift nicht heimlich doppelt zählt.
 */
export const TRAGEZEIT_MS = 80;

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
}

interface RecoilInternals {
  players: Map<string, RuntimePlayer>;
  fire(player: RuntimePlayer, stats: { reload: number }): void;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
}

interface Stoss {
  richtung: Vector2;
  /** Gesamtstrecke dieses Stoßes in Weltpixeln. */
  weg: number;
  bis: number;
  /** Wie viel davon schon getragen wurde – gegen Rundungsdrift. */
  getragen: number;
}

const stoesse = new WeakMap<MazeGame, Map<string, Stoss>>();
const stossFor = (game: MazeGame): Map<string, Stoss> => {
  const vorhanden = stoesse.get(game);
  if (vorhanden) return vorhanden;
  const neu = new Map<string, Stoss>();
  stoesse.set(game, neu);
  return neu;
};

/** Nur für Tests und Betriebsanzeigen: der offene Rückstoß eines Spielers. */
export function offenerRueckstoss(game: MazeGame, playerId: string): number {
  const stoss = stossFor(game).get(playerId);
  return stoss ? Math.max(0, stoss.weg - stoss.getragen) : 0;
}

/**
 * Hängt den Rückstoß an. `enabled = false` lässt die Schicht komplett weg –
 * der Server verhält sich dann exakt wie vorher.
 *
 * **Gehört ganz nach außen** (in der Kette bei `tuneLoadoutSystem`): Weiter
 * innen ginge der Stoß während eines Dashs verloren, weil die Dash-Fahrt die
 * Position aus einem vor dem Originalschritt gemerkten Punkt neu berechnet
 * und alles überschreibt, was innen dazugekommen ist.
 */
export function tuneFireRecoil<T extends MazeGame>(game: T, enabled = true): T {
  if (!enabled) return game;
  const internals = game as unknown as RecoilInternals;
  const offen = stossFor(game);

  const originalFire = internals.fire.bind(internals);
  internals.fire = (player: RuntimePlayer, stats: { reload: number }): void => {
    originalFire(player, stats);
    // Entgegen der Zielrichtung – dieselbe Richtung, aus der auch die Salve
    // herauskommt. Ohne Zielrichtung (Betrag 0) gibt es keinen Rückstoß:
    // geraten wird nicht.
    const laenge = Math.hypot(player.aim.x, player.aim.y);
    if (laenge < 0.001) return;
    const jetzt = Date.now();
    offen.set(player.id, {
      richtung: { x: -player.aim.x / laenge, y: -player.aim.y / laenge },
      weg: RUECKSTOSS_TEMPO * stats.reload,
      bis: jetzt + TRAGEZEIT_MS,
      getragen: 0
    });
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    originalStepPlayer(player, dt, now);
    const stoss = offen.get(player.id);
    if (!stoss) return;
    if (player.dead || now >= stoss.bis) {
      offen.delete(player.id);
      return;
    }
    // Linear über die Tragezeit verteilt. Der Rest wird aus `getragen`
    // gerechnet statt aus dem Zeitanteil: Bei ungleichen Ticks summierten
    // sich sonst Rundungsfehler zu spürbarer Zusatzdrift.
    const anteil = Math.min(1, (dt * 1000) / TRAGEZEIT_MS);
    const schritt = Math.min(stoss.weg * anteil, stoss.weg - stoss.getragen);
    if (schritt <= 0) return;
    stoss.getragen += schritt;
    // Über `moveCircle`, sonst schiebt der Rückstoß durch Wände.
    const bewegt = moveCircle(
      player.position,
      { x: stoss.richtung.x * schritt / dt, y: stoss.richtung.y * schritt / dt },
      dt,
      GAME.playerRadius
    );
    player.position = bewegt.position;
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    offen.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
