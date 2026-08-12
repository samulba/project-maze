import { ARENA_MODES, GAME, respawnLevelFrom, type PlayerSnapshot, type WorldSnapshot } from '@project-maze/shared';
import type { GameplayWorldExtension, RoyaleZoneSnapshot } from '@project-maze/shared/gameplay';
import { recordRoyaleWin } from './achievements.js';
import { arenaGuardianIdFor } from './arena-events.js';
import { MazeGame } from './game.js';
import { currentArenaMode, isFree } from './world.js';

/**
 * Battle Royale: schrumpfende Zone, Ausscheiden und Runden.
 *
 * ## Der Ablauf
 *
 * Die Zone zieht sich in Stufen zusammen und lässt draußen Leben verlieren.
 * Wer stirbt, ist **für diese Runde raus** – kein Respawn. Lebt nur noch einer,
 * ist die Runde entschieden; nach einer kurzen Pause fängt alles von vorne an,
 * und alle sind wieder dabei.
 *
 * ## Warum die Zone hält statt durchgehend zu schrumpfen
 *
 * Eine gleichmäßig schrumpfende Zone ist ein Timer, dem man beim Ablaufen
 * zusieht. Der Wechsel aus *schrumpft* und *hält* erzeugt die Taktung, die
 * Battle Royale ausmacht: In der Haltephase kann man kämpfen und sich
 * einrichten, in der Schrumpfphase muss man sich entscheiden. Deshalb sind es
 * Stufen und kein linearer Verlauf.
 *
 * ## Warum der Schaden mit jeder Stufe steigt
 *
 * Am Anfang ist Draußenstehen eine Entscheidung mit Preis – man holt noch eine
 * Form und läuft dann. Am Ende muss es tödlich sein, sonst gewinnt, wer den
 * Rand als Versteck benutzt. Deshalb wächst `damagePerSecond` je Stufe.
 *
 * ## Warum das Zentrum wandert
 *
 * Ein Kreis, der immer auf die Kartenmitte schrumpft, macht die Mitte zur
 * einzigen sinnvollen Position – ab Sekunde eins. Ein leicht versetztes Ziel je
 * Stufe hält die Frage offen, wohin man läuft, und entwertet keinen Kartenteil
 * dauerhaft.
 */

export interface RoyaleConfig {
  /** Radius zu Rundenbeginn – deckt die ganze Karte ab. */
  readonly startRadius: number;
  /** Darunter schrumpft die Zone nicht weiter. */
  readonly minRadius: number;
  /** Anteil, den ein Schrumpfschritt vom aktuellen Radius wegnimmt. */
  readonly shrinkFactor: number;
  /** Wie lange eine Verengung dauert. */
  readonly shrinkMs: number;
  /** Ruhephase zwischen zwei Verengungen. */
  readonly holdMs: number;
  /** Vorlauf, bevor die erste Verengung beginnt. */
  readonly graceMs: number;
  /** Schaden je Sekunde außerhalb auf Stufe 1. */
  readonly baseDamagePerSecond: number;
  /** Aufschlag je weiterer Stufe. */
  readonly damagePerStage: number;
  /** Wie weit das neue Zentrum je Stufe höchstens wandert (Anteil des Radius). */
  readonly driftFactor: number;
  /** Pause zwischen entschiedener Runde und Neustart. */
  readonly roundBreakMs: number;
}

export const DEFAULT_ROYALE: RoyaleConfig = {
  // Startradius deckt die Karte sicher ab – die halbe Diagonale plus Rand.
  startRadius: Math.hypot(GAME.worldWidth, GAME.worldHeight) / 2,
  minRadius: 420,
  shrinkFactor: 0.72,
  shrinkMs: 30_000,
  holdMs: 45_000,
  graceMs: 40_000,
  baseDamagePerSecond: 4,
  damagePerStage: 3.5,
  driftFactor: 0.22,
  roundBreakMs: 12_000
};

interface RoyalePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface RoyaleInternals {
  players: Map<string, RoyalePlayer>;
  damagePlayer(target: RoyalePlayer, damage: number, attackerId: string | null, now: number): void;
  respawn(player: RoyalePlayer, now: number): void;
}

interface RoyaleState {
  center: { x: number; y: number };
  radius: number;
  fromRadius: number;
  targetRadius: number;
  fromCenter: { x: number; y: number };
  targetCenter: { x: number; y: number };
  stage: number;
  phase: RoyaleZoneSnapshot['phase'];
  /** Wann die laufende Phase endet. */
  phaseEndsAt: number;
  startedAt: number;
  /** Rest-Schaden unter 1 HP, damit auch kleine Ticks irgendwann wehtun. */
  schuld: Map<string, number>;
  /**
   * Die Konfiguration dieser Arena. Sie steht mit im Zustand, weil
   * `royaleZoneFor` sonst den Schaden aus der Standardkonfiguration meldet –
   * die Anzeige wuerde dann etwas anderes sagen als der Server rechnet, sobald
   * jemand eine eigene Konfiguration verwendet.
   */
  config: RoyaleConfig;
  /** Runde entschieden – es lebt hoechstens noch einer. */
  roundOver: boolean;
  /** Wann die naechste Runde startet; 0, solange die aktuelle laeuft. */
  nextRoundAt: number;
  winnerName: string | null;
}

const states = new WeakMap<MazeGame, RoyaleState>();

const kartenMitte = (): { x: number; y: number } => ({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 });

function stateFor(game: MazeGame, config: RoyaleConfig, now: number): RoyaleState {
  const vorhanden = states.get(game);
  if (vorhanden) return vorhanden;
  const mitte = kartenMitte();
  const frisch: RoyaleState = {
    center: { ...mitte },
    radius: config.startRadius,
    fromRadius: config.startRadius,
    targetRadius: config.startRadius,
    fromCenter: { ...mitte },
    targetCenter: { ...mitte },
    stage: 0,
    phase: 'wartet',
    phaseEndsAt: now + config.graceMs,
    startedAt: now,
    schuld: new Map(),
    config,
    roundOver: false,
    nextRoundAt: 0,
    winnerName: null
  };
  states.set(game, frisch);
  return frisch;
}

/** Schaden je Sekunde außerhalb auf der gegebenen Stufe. */
export const royaleDamagePerSecond = (stage: number, config: RoyaleConfig = DEFAULT_ROYALE): number =>
  config.baseDamagePerSecond + config.damagePerStage * Math.max(0, stage - 1);

/**
 * Nächstes Zentrum: um bis zu `driftFactor × Zielradius` versetzt, aber immer
 * so, dass der neue Kreis vollständig im alten liegt. Sonst könnte ein Spieler
 * mitten in der Zone stehen und plötzlich draußen sein, ohne sich bewegt zu
 * haben – das fühlt sich nach Willkür an, nicht nach Regel.
 */
export function nextZoneCenter(
  center: { x: number; y: number },
  radius: number,
  targetRadius: number,
  zufall: () => number = Math.random,
  config: RoyaleConfig = DEFAULT_ROYALE
): { x: number; y: number } {
  const spielraum = Math.max(0, Math.min(radius - targetRadius, targetRadius * config.driftFactor));
  const winkel = zufall() * Math.PI * 2;
  const abstand = Math.sqrt(zufall()) * spielraum;
  return { x: center.x + Math.cos(winkel) * abstand, y: center.y + Math.sin(winkel) * abstand };
}

/**
 * Aktueller Stand der Zone für Anzeige und Tests.
 *
 * `now` ist ein Parameter und kein `Date.now()` im Rumpf, weil der Snapshot
 * ohnehin eine Uhrzeit mitbringt: Die beiden Restzeiten dürfen nicht gegen eine
 * andere Uhr gerechnet werden als der Rest desselben Snapshots.
 */
export function royaleZoneFor(game: MazeGame, now = Date.now()): RoyaleZoneSnapshot | null {
  const state = states.get(game);
  if (!state) return null;
  const internals = game as unknown as RoyaleInternals;
  /*
   * Die Vorwarnung gilt nur, wenn wirklich noch eine Verengung kommt: nicht
   * während einer laufenden, nicht in der Rundenpause und nicht mehr, sobald
   * der Mindestradius erreicht ist. Dort hält die Zone in Zyklen weiter – ein
   * Countdown wäre dann ein Versprechen, das nie eingelöst wird.
   */
  const nochEineVerengung =
    !state.roundOver && state.phase !== 'schrumpft' && state.radius > state.config.minRadius + 0.001;
  return {
    center: { ...state.center },
    radius: state.radius,
    targetRadius: state.targetRadius,
    phase: state.phase,
    /*
     * Mindestens 1 ms, solange ueberhaupt noch eine Verengung kommt.
     *
     * Die Phase wechselt in `step`, der Snapshot entsteht unabhaengig davon.
     * Zwischen „Phase abgelaufen" und „Phase gewechselt" liegt bis zu ein Tick –
     * und eine glatte 0 heisst fuer den Client „keine Verengung mehr", also
     * „ENDPHASE". Fuer einen Frame stuende dort die Endphase, waehrend die Zone
     * noch auf vollem Radius steht. Lieber „ENGER IN 1 S": Das ist in diesem
     * Moment sogar wahr.
     */
    nextShrinkInMs: nochEineVerengung ? Math.max(1, state.phaseEndsAt - now) : 0,
    damagePerSecond: royaleDamagePerSecond(state.stage, state.config),
    stage: state.stage,
    alive: lebende(internals, arenaGuardianIdFor(game)).length,
    roundOver: state.roundOver,
    winnerName: state.winnerName,
    nextRoundInMs: state.roundOver ? Math.max(0, state.nextRoundAt - now) : 0
  };
}

/**
 * Wer zaehlt als Ueberlebender – und wer ausdruecklich nicht.
 *
 * Der Guardian des Hunter-Signal-Events ist ein **echter Eintrag in
 * `players`** (`arena-events.ts`: `game.addPlayer(GUARDIAN_NAME)`), damit er
 * getroffen werden kann wie jeder Tank. Fuer die Runde ist er trotzdem kein
 * Teilnehmer, sondern Inventar der Arena – ein neutrales Monster, das mit dem
 * Event kommt und geht.
 *
 * Zaehlt man ihn mit, geht dreierlei schief, und alles drei ist sichtbar:
 *
 * 1. Die Leiste sagt „NOCH 12", obwohl nur elf Leute spielen.
 * 2. Der letzte lebende Mensch bekommt seinen Sieg nicht: `<= 1` wird nicht
 *    erreicht, solange das Monster lebt – die Runde haengt, bis das Event
 *    ausläuft.
 * 3. Und im schlimmsten Fall gewinnt der Guardian: Sterben die letzten
 *    Menschen, waehrend er lebt, bleibt genau einer uebrig – er. Auf dem
 *    Bildschirm stuende dann „SIEGER: GUARDIAN".
 */
const lebende = (internals: RoyaleInternals, guardianId: string | null): RoyalePlayer[] =>
  [...internals.players.values()].filter((player) => !player.dead && player.id !== guardianId);

/**
 * Startet eine neue Runde: Zone auf Anfang, alle wieder ins Spiel.
 *
 * Der Zonenzustand wird dabei **ersetzt statt zurückgesetzt** – jedes Feld
 * einzeln zurückzudrehen ist die Sorte Arbeit, bei der beim nächsten neuen Feld
 * genau eines vergessen wird.
 */
/**
 * Ein Platz **in** der Zone, für alle, die mitten in einer laufenden Runde
 * dazukommen.
 *
 * Ohne diese Regel war ein Beitritt in Stufe 5 oder später ein Todesurteil
 * ohne Gegenwehr: `randomSpawn` wählt aus zehn festen Punkten an Rand und
 * Ecken, die Zone steht da längst in der Mitte. Nachgemessen im Zeitraffer –
 * Stufe 5: 4263 Einheiten draußen, tot nach 5,7 s; Stufe 7: 5302 draußen, tot
 * nach 4,3 s; Stufe 8: selbst der günstigste der zehn Punkte liegt 911
 * draußen. Ein frischer Tank fährt 300 Einheiten/s und hat 110 Leben – die
 * Strecke ist ab Stufe 5 rechnerisch nicht mehr zu schaffen, mit Wänden erst
 * recht nicht. Danach greift korrekt das Ausscheiden, und der Neuling sieht
 * bis zur nächsten Runde zu, ohne einen Schuss abgegeben zu haben.
 *
 * Gewählt wird nicht die Mitte, sondern der innere Rand (55–90 % des Radius):
 * Wer neu kommt, soll im Spiel sein, aber nicht mitten in die Entscheidung
 * fallen. Der Abstand zu Lebenden ist derselbe wie in `safeSpawn` (250).
 */
function platzInDerZone(state: RoyaleState, lebendige: readonly RoyalePlayer[]): { x: number; y: number } | null {
  const frei = (kandidat: { x: number; y: number }): boolean => isFree(kandidat, GAME.playerRadius);
  const punkt = (anteil: number, winkel: number) => ({
    x: state.center.x + Math.cos(winkel) * state.radius * anteil,
    y: state.center.y + Math.sin(winkel) * state.radius * anteil
  });
  for (let versuch = 0; versuch < 80; versuch += 1) {
    const kandidat = punkt(0.55 + Math.random() * 0.35, Math.random() * Math.PI * 2);
    if (!frei(kandidat)) continue;
    const eng = lebendige.some((spieler) => {
      const dx = spieler.position.x - kandidat.x;
      const dy = spieler.position.y - kandidat.y;
      return dx * dx + dy * dy < 250 * 250;
    });
    if (!eng) return kandidat;
  }
  // Zweiter Anlauf ohne Abstandsregel: eng neben jemandem stehen ist immer
  // noch besser, als draußen zu stehen und beim Laufen zu sterben.
  for (let versuch = 0; versuch < 120; versuch += 1) {
    const kandidat = punkt(Math.random() * 0.9, Math.random() * Math.PI * 2);
    if (frei(kandidat)) return kandidat;
  }
  return null;
}

function neueRunde(internals: RoyaleInternals, state: RoyaleState, now: number): void {
  const mitte = kartenMitte();
  state.center = { ...mitte };
  state.radius = state.config.startRadius;
  state.fromRadius = state.config.startRadius;
  state.targetRadius = state.config.startRadius;
  state.fromCenter = { ...mitte };
  state.targetCenter = { ...mitte };
  state.stage = 0;
  state.phase = 'wartet';
  state.phaseEndsAt = now + state.config.graceMs;
  state.startedAt = now;
  state.schuld.clear();
  state.roundOver = false;
  state.nextRoundAt = 0;
  state.winnerName = null;
  /*
   * ALLE gehen durch den Wiedereinstieg, nicht nur die Toten.
   *
   * Vorher lief der Überlebende durch keinen Reset – und nahm damit alles mit:
   * Nachgestellt mit zwei Spielern auf Level 40 (gatling, damage-Upgrade 7,
   * Score 12000) stand in Runde 2 ein Level-41-Gatling mit vollem Ausbau gegen
   * ein Feld aus Level-20-Core-Tanks. Mit jeder gewonnenen Runde verstärkt
   * sich das. docs/GOAL.md sagt „Pause, dann alles auf Anfang", und genau das
   * ist hier gemeint.
   *
   * `respawnLevel` wird vorher für jeden neu gesetzt: Der Tod tut das ohnehin
   * (`respawnLevelFrom(level)`), für die Lebenden fehlte es. Damit gilt für
   * alle dieselbe Regel – halbes Level, Klasse zurück auf den Familienanfang,
   * Upgrades leer –, statt einer Sonderbehandlung für den Sieger.
   */
  for (const player of internals.players.values()) {
    player.respawnLevel = respawnLevelFrom(player.level);
    internals.respawn(player, now);
  }
}

export function tuneRoyale<T extends MazeGame>(game: T, config: RoyaleConfig = DEFAULT_ROYALE): T {
  const internals = game as unknown as RoyaleInternals;
  const originalStep = game.step.bind(game);
  const originalSnapshot = game.snapshot.bind(game);
  const originalAddPlayer = game.addPlayer.bind(game);

  /*
   * Wer mitten in einer laufenden Runde dazukommt, startet drinnen.
   *
   * Umschliessend, nicht ersetzend: Die Basis legt den Spieler an wie immer –
   * inklusive Spawnschutz und Abstandsregel –, danach wird nur die Position
   * korrigiert. Findet sich in der Zone kein freier Platz, bleibt der
   * ursprüngliche Spawn stehen; ein Tank in einer Wand wäre schlimmer als ein
   * Tank am Rand.
   */
  game.addPlayer = ((name: string): string => {
    const id = originalAddPlayer(name);
    if (currentArenaMode() !== 'royale') return id;
    const state = states.get(game);
    // Kein Zustand heisst: Es hat noch kein Tick stattgefunden, also laeuft
    // auch keine Runde. In der Rundenpause ist der normale Spawn richtig --
    // `neueRunde` setzt gleich ohnehin alle neu.
    if (!state || state.roundOver) return id;
    const spieler = internals.players.get(id);
    if (!spieler) return id;
    const lebendige = [...internals.players.values()].filter((p) => !p.dead && p.id !== id);
    const platz = platzInDerZone(state, lebendige);
    if (platz) spieler.position = platz;
    return id;
  }) as T['addPlayer'];

  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    // Die Schicht haengt immer in der Kette, wirkt aber nur im eigenen Modus.
    // So bleibt die Reihenfolge der Tuner unabhaengig von der Konfiguration.
    if (currentArenaMode() !== 'royale') return;
    const state = stateFor(game, config, now);

    /*
     * Ausscheiden statt Respawn – und zwar durch Zurückschieben der
     * Wiedereinstiegszeiten, nicht durch Umbau der Basis.
     *
     * `MazeGame.step` respawnt Tote automatisch, sobald `autoRespawnAt`
     * erreicht ist, und `requestRespawn` prüft `canRespawnAt`. Beide Zeiten auf
     * Unendlich zu setzen hält den Spieler draußen, ohne dass eine zweite
     * Schicht die Respawn-Regeln nachbauen müsste. Genau die Sorte Nachbau hat
     * in diesem Server schon zweimal eine Regel verschluckt.
     */
    if (!state.roundOver) {
      for (const player of internals.players.values()) {
        if (!player.dead) continue;
        player.autoRespawnAt = Number.POSITIVE_INFINITY;
        player.canRespawnAt = Number.POSITIVE_INFINITY;
      }
    }

    /*
     * Rundenende: Es lebt höchstens noch einer.
     *
     * „Höchstens" statt „genau", weil die Zone auch den Letzten holen kann –
     * eine Runde ohne Sieger ist selten, aber möglich, und sie darf den Server
     * nicht hängen lassen.
     */
    if (!state.roundOver) {
      const uebrig = lebende(internals, arenaGuardianIdFor(game));
      // Eine leere Arena ist keine entschiedene Runde, sondern gar keine.
      // `players.size` enthaelt den Guardian genauso – auch hier zaehlt nur,
      // wer wirklich mitspielt, sonst gilt eine Arena mit einem Menschen und
      // einem Monster faelschlich als besetzt.
      const teilnehmer = [...internals.players.values()].filter((p) => p.id !== arenaGuardianIdFor(game)).length;
      if (teilnehmer > 1 && uebrig.length <= 1) {
        state.roundOver = true;
        state.winnerName = uebrig[0]?.name ?? null;
        state.nextRoundAt = now + config.roundBreakMs;
        // Befund 57: Der Sieg hinterlässt eine Spur -- vorher stand der Name
        // nur für die Dauer der Rundenpause auf dem Bildschirm und danach
        // nirgends mehr.
        const sieger = uebrig[0];
        if (sieger && !sieger.isBot) recordRoyaleWin(game, sieger.id);
      }
    } else if (now >= state.nextRoundAt) {
      neueRunde(internals, state, now);
      return;
    }

    if (now >= state.phaseEndsAt) {
      if (state.phase === 'schrumpft') {
        // Verengung fertig: Werte festschreiben, dann halten.
        state.radius = state.targetRadius;
        state.center = { ...state.targetCenter };
        state.fromRadius = state.radius;
        state.fromCenter = { ...state.center };
        state.phase = 'haelt';
        state.phaseEndsAt = now + config.holdMs;
      } else if (state.radius > config.minRadius) {
        state.stage += 1;
        state.fromRadius = state.radius;
        state.fromCenter = { ...state.center };
        state.targetRadius = Math.max(config.minRadius, state.radius * config.shrinkFactor);
        state.targetCenter = nextZoneCenter(state.center, state.radius, state.targetRadius, Math.random, config);
        state.phase = 'schrumpft';
        state.phaseEndsAt = now + config.shrinkMs;
      } else {
        // Kleinster Kreis erreicht – ab hier bleibt es, wie es ist.
        state.phase = 'haelt';
        state.phaseEndsAt = now + config.holdMs;
      }
    }

    if (state.phase === 'schrumpft') {
      const anteil = 1 - Math.max(0, Math.min(1, (state.phaseEndsAt - now) / config.shrinkMs));
      state.radius = state.fromRadius + (state.targetRadius - state.fromRadius) * anteil;
      state.center = {
        x: state.fromCenter.x + (state.targetCenter.x - state.fromCenter.x) * anteil,
        y: state.fromCenter.y + (state.targetCenter.y - state.fromCenter.y) * anteil
      };
    }

    // In der Rundenpause tut die Zone nichts mehr – der Sieger soll seinen
    // Moment haben, nicht am Rand verbluten.
    if (state.stage === 0 || state.roundOver) return;
    const proSekunde = royaleDamagePerSecond(state.stage, config);
    for (const player of internals.players.values()) {
      if (player.dead) continue;
      const abstand = Math.hypot(player.position.x - state.center.x, player.position.y - state.center.y);
      if (abstand <= state.radius) { state.schuld.delete(player.id); continue; }
      /*
       * Aufsummieren statt jeden Tick zu runden: Bei 40 Ticks je Sekunde und
       * 4 Schaden je Sekunde waeren das 0,1 pro Tick. Wer das auf ganze Zahlen
       * rundet, teilt entweder gar keinen Schaden aus (abrunden) oder das
       * Vierzigfache (aufrunden). Die Restschuld loest genau das.
       */
      const offen = (state.schuld.get(player.id) ?? 0) + proSekunde * dt;
      const ganz = Math.floor(offen);
      state.schuld.set(player.id, offen - ganz);
      // `attackerId` bleibt null: Die Zone ist kein Spieler, und ein Abschuss
      // durch sie darf niemandem gutgeschrieben werden.
      if (ganz > 0) internals.damagePlayer(player, ganz, null, now);
    }
  }) as T['step'];

  game.snapshot = ((viewerId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(viewerId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    if (currentArenaMode() !== 'royale') {
      if (snapshot.royaleZone !== undefined) snapshot.royaleZone = null;
      return snapshot;
    }
    snapshot.royaleZone = royaleZoneFor(game, now);
    return snapshot;
  }) as T['snapshot'];

  return game;
}

/** Nur für Tests: setzt den Zonenzustand zurück. */
export function resetRoyale(game: MazeGame): void {
  states.delete(game);
}

/** Läuft dieser Modus mit Zone? Für Anzeigen und die Event-Rotation. */
export const royaleActive = (): boolean => currentArenaMode() === 'royale' && ARENA_MODES.royale.walls !== undefined;
