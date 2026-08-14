import { CLASS_DEFINITIONS, GAME, type ClassDefinition, type PlayerSnapshot, type Vector2 } from '@project-maze/shared';
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
 * deshalb `RUECKSTOSS_TEMPO × Nachladezeit` – die Drift je Sekunde hängt damit
 * nicht an der Feuerrate, egal wie weit das Nachladen ausgebaut ist.
 *
 * (Seit der zweiten Runde vom 14.08. kommt `kugelwucht` als zweiter Faktor
 * dazu – die Drift ist nicht mehr für alle Klassen dieselbe, sondern folgt dem
 * Gewicht des Schusses. Warum, steht im nächsten Block.)
 *
 * ## Wer ihn bekommt
 *
 * Jede Klasse mit Rohr. Die alte Tabelle im Klassen-Katalog kannte nur 22 von
 * 65 Klassen – ausgerechnet sechs der zwölf schnellsten standen nicht drin,
 * also genau Sams Zielgruppe. Drohnenklassen erreichen den Feuerpfad nie und
 * bekommen folgerichtig keinen.
 */

/*
 * ## Zweite Runde (Sams Spieltest vom 14.08., Punkt 1)
 *
 * > „RÜCKSTOSS der KUGELN viel zu STARK, z.B. nicht sinnvoll eingesetzt, z.B.
 * > beim ANFANGSTANK zu stark."
 *
 * Zwei getrennte Befunde in einem Satz, und beide stimmen.
 *
 * **„Viel zu stark":** Der Stoß wird über 80 ms getragen. Bei 25 px/s und der
 * Nachladezeit einer Core (0,30 s) sind das 7,5 px in 80 ms – also kurzzeitig
 * 94 px/s gegen die eigene Laufrichtung, gut ein Drittel der Laufgeschwindigkeit
 * dieser Klasse. Dazu kommt, was die Zahl allein nicht zeigt: **Der Client sagt
 * den Rückstoß nicht vorher** (`prediction.ts`, Abschnitt 5 der Doku führt ihn
 * ausdrücklich unter „wird nicht vorhergesagt"). Jeder Schuss erzeugt damit
 * einen Korrekturzug von bis zu 17 px (Sniper) – der Panzer wird nicht nur
 * geschoben, er zappelt. Das ist der Grund, warum sich 25 px/s stärker anfühlen,
 * als sie rechnen.
 *
 * **„Nicht sinnvoll eingesetzt":** `weg = TEMPO × Nachladezeit` hängt an der
 * Feuerrate und **an sonst nichts**. Eine Klasse, die selten und schwach
 * schießt, bekam denselben Stoß wie eine, die selten und schwer schießt. Genau
 * das trifft den Anfangstank: Die Core verschießt eine kleine, mittelschnelle
 * Kugel und wurde dafür geschoben wie eine Kanone.
 *
 * Deshalb jetzt drei Regeln statt einer:
 *
 * | Regel | Aufgabe |
 * |---|---|
 * | Tempo von 25 auf 6 px/s | „viel zu stark" – die Drift liegt bei rund 2 % der Laufgeschwindigkeit statt bei 9 % |
 * | `kugelwucht` als Faktor | „nicht sinnvoll" – der Stoß folgt dem, was hinten rauskommt, nicht nur der Uhr |
 * | `MAX_STOSS_PX` | hält den Korrekturzug des Clients klein genug, dass er weich bleibt |
 */

/** Bezugs-Driftgeschwindigkeit beim Dauerfeuer, in Weltpixeln je Sekunde. */
export const RUECKSTOSS_TEMPO = 6;

/**
 * Obergrenze für einen einzelnen Stoß.
 *
 * Nicht Balance, sondern Netzcode: So groß wie dieser Wert ist der Fehler, den
 * die Client-Vorhersage je Schuss aufholen muss. Die weiche Korrektur greift
 * bis `HARD_CORRECTION_UNITS` (60 px) und ist bei 8 px in rund 135 ms
 * abgearbeitet – der Spieler sieht einen Schub, kein Zurückspringen.
 */
export const MAX_STOSS_PX = 8;

/** Kugelwerte der Core – der Bezugspunkt, gegen den `kugelwucht` misst. */
const CORE = CLASS_DEFINITIONS.core;
const BEZUGSIMPULS = CORE.projectileRadius * CORE.projectileRadius * CORE.projectileSpeed;

/**
 * Wie schwer der Schuss einer Klasse wiegt, relativ zur Core-Kugel. 1,0 heißt
 * „so viel wie der Anfangstank".
 *
 * Impuls ist Masse mal Tempo; die Masse einer Kugel steckt in ihrer Fläche
 * (`radius²`). Mehrläufige Klassen schieben mit jedem Lauf – aber nur mit der
 * **Wurzel** der Laufzahl: Ein Achtfach-Octo feuert die Hälfte seiner Läufe
 * nach hinten und zur Seite, deren Stöße heben sich teilweise auf. Linear
 * gerechnet lag jede Mehrlauf-Klasse am oberen Anschlag, und die Regel „der Stoß
 * folgt dem Schuss" wäre wieder zu „alle gleich" geworden.
 *
 * Gerechnet wird aus den **Klassenwerten**, nicht aus den ausgebauten: Der
 * Rückstoß einer Kanone ist eine Eigenschaft der Kanone. Über die Levelrampe
 * des Kugelradius (`PROJECTILE_RADIUS_SCALE`, 13.08.) wäre er sonst still mit
 * der Stufe gewachsen – auf Stufe 60 um das 3,6-fache, ohne dass irgendwo
 * stünde, dass das gewollt ist.
 *
 * Die Klammer ist bewusst eng: nach oben, damit eine Fortress-Kugel den Panzer
 * nicht durch die halbe Arena schiebt; nach unten, damit eine Gatling überhaupt
 * noch etwas spürt.
 */
export function kugelwucht(definition: Pick<ClassDefinition, 'projectileRadius' | 'projectileSpeed' | 'barrelCount'>): number {
  if (BEZUGSIMPULS <= 0 || definition.barrelCount <= 0) return 1;
  const eigen = definition.projectileRadius * definition.projectileRadius * definition.projectileSpeed
    * Math.sqrt(definition.barrelCount);
  return Math.max(0.5, Math.min(1.6, eigen / BEZUGSIMPULS));
}
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
      weg: Math.min(MAX_STOSS_PX, RUECKSTOSS_TEMPO * stats.reload * kugelwucht(CLASS_DEFINITIONS[player.playerClass])),
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
