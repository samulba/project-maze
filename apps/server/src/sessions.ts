import { sanitizePlayerName } from '@project-maze/shared';
import { MazeGame } from './game.js';
import { persistenceConfig, type PersistenceConfig } from './persistence.js';
import type { KohortenGeraet } from './retention.js';

/**
 * Sitzungserfassung – die Datenbasis des Admin-Portals.
 *
 * ## Warum es dieses Modul gibt
 *
 * `persistence.ts` speichert **abgeschlossene Runs mit Score > 0**. Für ein
 * Leaderboard ist das genau richtig; für die Frage „haben wir neue Spieler?"
 * ist es blind: Wer hereinschaut und ohne Punkte wieder geht, kommt darin nicht
 * vor, und zwei Runs desselben Gastes sind nicht als derselbe Mensch erkennbar.
 *
 * Hier wird deshalb der **Besuch** erfasst, nicht die Leistung: Wann kam
 * jemand, wie lange blieb er, wie oft ist er gestorben, war er angemeldet – und
 * war er schon einmal da. Letzteres über eine Zufalls-ID, die der Browser sich
 * selbst gibt (`device_id`, siehe Migration 0005). Keine IP, kein User-Agent,
 * kein Fingerabdruck.
 *
 * ## Die drei Regeln aus `persistence.ts` gelten unverändert
 *
 * 1. **Feature-Flag:** Ohne Supabase-Konfiguration hängt sich die Schicht nicht
 *    ein. Der Server verhält sich dann exakt wie ohne dieses Modul.
 * 2. **Nie im Tick-Pfad:** Beim Verlassen landet ein fertiger Datensatz in
 *    einem Puffer; geschrieben wird in einem eigenen Intervall.
 * 3. **Fehler stören das Spiel nie:** Jeder Datenbankfehler wird gezählt und
 *    geloggt, nie geworfen.
 *
 * ## Warum beim Verlassen und nicht beim Betreten geschrieben wird
 *
 * Erst dann steht die Dauer fest, und erst dann weiß der Server, was in dem
 * Besuch passiert ist – eine Zeile statt zwei Schreibvorgängen. Der Preis: Ein
 * abstürzender Server verliert die gerade laufenden Sitzungen. Das ist bewusst
 * so gewählt; ein Absturz ist selten, und die Alternative wäre ein Schreib-
 * vorgang beim Join, also genau im Pfad, der schnell sein muss.
 */

/** Tabelle der Besuche – siehe supabase/migrations/0005_sessions.sql. */
export const SESSIONS_TABLE = 'sessions';
/** Aggregat je Browser, per Trigger aus `sessions` gepflegt. */
export const DEVICES_TABLE = 'devices';
/** Tageswerte für das Portal. */
export const ADMIN_DAILY_VIEW = 'admin_daily';
/** Klassennutzung je Tag. */
export const ADMIN_CLASS_DAILY_VIEW = 'admin_class_daily';

const DEFAULT_FLUSH_INTERVAL_MS = 15_000;
/** Obergrenze des Puffers; darüber fallen die ältesten Sitzungen weg. */
const MAX_QUEUE = 500;
/** Zeilen je Insert. */
const MAX_BATCH = 200;
const ERROR_LOG_INTERVAL_MS = 60_000;
/**
 * Kürzere Besuche werden nicht gespeichert. Ein Reconnect nach einem
 * Verbindungsabbruch erzeugt sonst zwei „Spieler" aus einem – und ein Besuch
 * von zwei Sekunden ist keine Sitzung, sondern ein Ladefehler.
 */
export const MIN_SESSION_SECONDS = 5;
/** Format der Geräte-ID, wie der Client sie erzeugt (Hex oder UUID). */
const DEVICE_ID_PATTERN = /^[0-9a-zA-Z_-]{8,64}$/;

/** Nimmt nur an, was wie eine selbst erzeugte Zufalls-ID aussieht. */
export const validDeviceId = (value: unknown): string | null =>
  (typeof value === 'string' && DEVICE_ID_PATTERN.test(value) ? value : null);

export interface SessionRecord {
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  deviceId: string;
  userId: string | null;
  playerName: string;
  runs: number;
  kills: number;
  bestScore: number;
  bestLevel: number;
}

/** Ein Tag aus `admin_daily`. */
export interface DailyRow {
  day: string;
  sessions: number;
  players: number;
  newPlayers: number;
  accounts: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  bestLevel: number;
}

/** Eine Klasse an einem Tag aus `admin_class_daily`. */
export interface ClassDayRow {
  day: string;
  playerClass: string;
  runs: number;
  levelSum: number;
  scoreSum: number;
  kills: number;
  seconds: number;
  bestScore: number;
  bestLevel: number;
}

/** Ein Gerät aus `devices` – im Portal die Zeile „Spieler". */
export interface DeviceRow {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  sessions: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  bestScore: number;
  bestLevel: number;
  lastUserId: string | null;
  lastName: string | null;
}

export interface SessionsClient {
  insertSessions(sessions: readonly SessionRecord[]): Promise<void>;
  daily(sinceIso: string): Promise<DailyRow[]>;
  classDaily(sinceIso: string): Promise<ClassDayRow[]>;
  devices(order: 'first_seen' | 'last_seen', limit: number): Promise<DeviceRow[]>;
  /**
   * Geräte mit erstem Besuch ab `sinceIso`, für die Wiederkehr-Rechnung.
   *
   * Vier Spalten statt `*`: Die Antwort geht über die Leitung und wird zu einer
   * Handvoll Prozentzahlen verrechnet – Bestscore und Spielername haben daran
   * keinen Anteil.
   *
   * **Aufsteigend** sortiert, und das ist keine Geschmacksfrage: Greift das
   * Limit, fallen die Zeilen am Ende weg. Bei absteigender Sortierung wären das
   * die ältesten – also genau die, die als einzige beantworten können, ob
   * jemand nach dreißig Tagen wiederkam. Aufsteigend fallen die jüngsten
   * heraus, und die tragen ohnehin nichts zur Frage bei.
   */
  cohortDevices(sinceIso: string, limit: number): Promise<KohortenGeraet[]>;
  countDevices(): Promise<number>;
  countSessions(sinceIso: string): Promise<number>;
}

export interface SessionsOptions {
  client?: SessionsClient;
  flushIntervalMs?: number;
  log?: (message: string) => void;
  /** Nur für Tests: erzwingt das Anhängen ohne echte ENV-Konfiguration. */
  forceEnabled?: boolean;
}

export interface SessionsStats {
  enabled: boolean;
  /** Sitzungen, die gerade laufen (im Speicher, noch nicht geschrieben). */
  open: number;
  queued: number;
  written: number;
  dropped: number;
  /** Zu kurz, um gezählt zu werden – siehe MIN_SESSION_SECONDS. */
  discarded: number;
  failedFlushes: number;
  lastErrorAt: number | null;
}

/** Eine laufende Sitzung. Lebt nur im Arbeitsspeicher. */
interface OpenSession {
  startedAt: number;
  deviceId: string;
  userId: string | null;
  playerName: string;
  runs: number;
  kills: number;
  bestScore: number;
  bestLevel: number;
}

interface SessionsState {
  enabled: boolean;
  client: SessionsClient | null;
  open: Map<string, OpenSession>;
  queue: SessionRecord[];
  written: number;
  dropped: number;
  discarded: number;
  failedFlushes: number;
  lastErrorAt: number | null;
  lastErrorLoggedAt: number;
  flushing: boolean;
  flushPromise: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  log: (message: string) => void;
}

const states = new WeakMap<MazeGame, SessionsState>();

const createState = (): SessionsState => ({
  enabled: false,
  client: null,
  open: new Map(),
  queue: [],
  written: 0,
  dropped: 0,
  discarded: 0,
  failedFlushes: 0,
  lastErrorAt: null,
  lastErrorLoggedAt: 0,
  flushing: false,
  flushPromise: null,
  timer: null,
  log: () => {}
});

const stateFor = (game: MazeGame): SessionsState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = createState();
  states.set(game, created);
  return created;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function noteError(state: SessionsState, scope: string, error: unknown, now = Date.now()): void {
  state.lastErrorAt = now;
  if (now - state.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  state.lastErrorLoggedAt = now;
  state.log(`${scope}: ${errorMessage(error)}`);
}

const integerEnvironment = (name: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
};

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Supabase-Adapter. Wie in `persistence.ts` wird die Bibliothek erst hier
 * dynamisch geladen – ein Server ohne Persistenz zieht sie nie in den Speicher.
 */
export function createSessionsClient(config: PersistenceConfig): SessionsClient {
  const clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(
    config.url,
    config.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ));

  return {
    async insertSessions(sessions) {
      const client = await clientPromise;
      const { error } = await client.from(SESSIONS_TABLE).insert(sessions.map((session) => ({
        started_at: session.startedAt,
        ended_at: session.endedAt,
        duration_seconds: session.durationSeconds,
        device_id: session.deviceId,
        user_id: session.userId,
        player_name: session.playerName,
        runs: session.runs,
        kills: session.kills,
        best_score: session.bestScore,
        best_level: session.bestLevel
      })));
      if (error) throw new Error(error.message);
    },
    async daily(sinceIso) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(ADMIN_DAILY_VIEW)
        .select('*')
        .gte('day', sinceIso)
        .order('day', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        day: text(row['day']),
        sessions: number(row['sessions']),
        players: number(row['players']),
        newPlayers: number(row['new_players']),
        accounts: number(row['accounts']),
        runs: number(row['runs']),
        kills: number(row['kills']),
        totalSeconds: number(row['total_seconds']),
        bestLevel: number(row['best_level'])
      }));
    },
    async classDaily(sinceIso) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(ADMIN_CLASS_DAILY_VIEW)
        .select('*')
        .gte('day', sinceIso);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        day: text(row['day']),
        playerClass: text(row['player_class']),
        runs: number(row['runs']),
        levelSum: number(row['level_sum']),
        scoreSum: number(row['score_sum']),
        kills: number(row['kills']),
        seconds: number(row['seconds']),
        bestScore: number(row['best_score']),
        bestLevel: number(row['best_level'])
      }));
    },
    async devices(order, limit) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(DEVICES_TABLE)
        .select('*')
        .order(order, { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        deviceId: text(row['device_id']),
        firstSeen: text(row['first_seen']),
        lastSeen: text(row['last_seen']),
        sessions: number(row['sessions']),
        runs: number(row['runs']),
        kills: number(row['kills']),
        totalSeconds: number(row['total_seconds']),
        bestScore: number(row['best_score']),
        bestLevel: number(row['best_level']),
        lastUserId: row['last_user_id'] ? text(row['last_user_id']) : null,
        lastName: row['last_name'] ? text(row['last_name']) : null
      }));
    },
    async cohortDevices(sinceIso, limit) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(DEVICES_TABLE)
        .select('device_id,first_seen,last_seen,sessions')
        .gte('first_seen', sinceIso)
        .order('first_seen', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row: Record<string, unknown>) => ({
        deviceId: text(row['device_id']),
        firstSeen: text(row['first_seen']),
        lastSeen: text(row['last_seen']),
        sessions: number(row['sessions'])
      }));
    },
    async countDevices() {
      const client = await clientPromise;
      const { count, error } = await client.from(DEVICES_TABLE).select('device_id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async countSessions(sinceIso) {
      const client = await clientPromise;
      const { count, error } = await client
        .from(SESSIONS_TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('started_at', sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }
  };
}

/**
 * Der Besuch beginnt. Wird aus dem Join-Pfad gerufen – ohne Geräte-ID passiert
 * nichts, denn ohne sie ließe sich der Besuch weder zählen noch wiedererkennen.
 */
export function beginSession(
  game: MazeGame,
  playerId: string,
  deviceId: string | null,
  playerName: string,
  now = Date.now()
): void {
  const state = stateFor(game);
  if (!state.enabled) return;
  const id = validDeviceId(deviceId);
  if (!id) return;
  state.open.set(playerId, {
    startedAt: now,
    deviceId: id,
    userId: null,
    playerName: sanitizePlayerName(playerName).slice(0, 18) || 'Spieler',
    runs: 0,
    kills: 0,
    bestScore: 0,
    bestLevel: 1
  });
}

/**
 * Konto nachtragen. Der Login läuft asynchron und kommt erst nach dem Join
 * zurück – dieselbe Reihenfolge wie bei `linkPlayerToUser`.
 */
export function linkSessionToUser(game: MazeGame, playerId: string, userId: string | null): void {
  const state = stateFor(game);
  const session = state.open.get(playerId);
  if (!session) return;
  session.userId = userId;
}

/**
 * Der Besuch endet. Erzeugt den Datensatz und legt ihn in den Puffer – oder
 * verwirft ihn, wenn er zu kurz war.
 */
export function endSession(game: MazeGame, playerId: string, now = Date.now()): void {
  const state = stateFor(game);
  const session = state.open.get(playerId);
  if (!session) return;
  state.open.delete(playerId);

  const durationSeconds = Math.round(Math.max(0, now - session.startedAt) / 100) / 10;
  if (durationSeconds < MIN_SESSION_SECONDS) {
    state.discarded += 1;
    return;
  }
  if (state.queue.length >= MAX_QUEUE) {
    state.queue.shift();
    state.dropped += 1;
  }
  state.queue.push({
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(now).toISOString(),
    durationSeconds,
    deviceId: session.deviceId,
    userId: session.userId,
    playerName: session.playerName,
    runs: session.runs,
    kills: session.kills,
    bestScore: session.bestScore,
    bestLevel: session.bestLevel
  });
}

export function sessionsStats(game: MazeGame): SessionsStats {
  const state = stateFor(game);
  return {
    enabled: state.enabled,
    open: state.open.size,
    queued: state.queue.length,
    written: state.written,
    dropped: state.dropped,
    discarded: state.discarded,
    failedFlushes: state.failedFlushes,
    lastErrorAt: state.lastErrorAt
  };
}

/** Der Lesezugriff des Admin-Portals; `null`, solange die Schicht aus ist. */
export function sessionsClient(game: MazeGame): SessionsClient | null {
  const state = stateFor(game);
  return state.enabled ? state.client : null;
}

async function flushOnce(state: SessionsState): Promise<void> {
  if (!state.client || state.queue.length === 0) return;
  const batch = state.queue.splice(0, MAX_BATCH);
  try {
    await state.client.insertSessions(batch);
    state.written += batch.length;
  } catch (error) {
    state.failedFlushes += 1;
    noteError(state, 'insertSessions', error);
    // Zurück in den Puffer, damit ein Netzausfall keine Sitzung kostet – aber
    // vorne, damit die Reihenfolge stimmt und der Deckel weiter greift.
    state.queue.unshift(...batch.slice(0, MAX_QUEUE - state.queue.length));
  }
}

function flush(state: SessionsState): Promise<void> {
  if (state.flushPromise) return state.flushPromise;
  const running = (async () => {
    try {
      await flushOnce(state);
    } finally {
      state.flushPromise = null;
    }
  })();
  state.flushPromise = running;
  return running;
}

/** Puffer wegschreiben – für den geordneten Shutdown. */
export async function flushSessions(game: MazeGame, now = Date.now()): Promise<void> {
  const state = stateFor(game);
  if (!state.enabled) return;
  // Wer beim Herunterfahren noch spielt, hat trotzdem einen Besuch gemacht.
  for (const playerId of [...state.open.keys()]) endSession(game, playerId, now);
  /*
   * Mehrmals versuchen – wie `flushPersistence`, und aus demselben Grund.
   *
   * `flush` gibt einen bereits LAUFENDEN Flush unverändert zurück. Läuft beim
   * SIGTERM gerade der periodische Durchlauf (alle 15 s), hat der seinen Batch
   * schon aus der Queue genommen, bevor die `endSession`-Aufrufe hier
   * überhaupt etwas hineingelegt haben. Ein einzelnes `await flush(state)`
   * wartete dann auf einen Insert, der die neuen Zeilen gar nicht enthält,
   * kehrte zurück, und der Prozess ging – mit allen laufenden Besuchen im
   * Arbeitsspeicher und einer Erfolgsmeldung im Log. Derselbe Weg deckt
   * nebenbei eine Queue über 200 Zeilen ab, die ohnehin mehrere Inserts
   * braucht.
   */
  for (let versuch = 0; versuch < 3; versuch += 1) {
    if (state.queue.length === 0) return;
    const fehlerVorher = state.failedFlushes;
    await flush(state);
    /*
     * Ein echt gescheiterter Schreibversuch beendet die Schleife.
     *
     * Sonst liefe der Shutdown bei einer toten Datenbank dreimal in denselben
     * Fehler und meldete drei statt einem -- die Zeilen bleiben ohnehin im
     * Puffer, genau dafuer ist er da. Wiederholt wird nur der Fall, um den es
     * hier geht: Der erste `flush` war schon unterwegs und hat unsere Zeilen
     * gar nicht gesehen.
     */
    if (state.failedFlushes > fehlerVorher) return;
  }
}

interface SessionInternals {
  players: Map<string, { id: string; isBot: boolean; score: number; level: number; kills: number; dead: boolean }>;
  killPlayer(target: { id: string; isBot: boolean; score: number; level: number; kills: number; dead: boolean },
    attackerId: string | null, now: number, environmentName: string): void;
}

/**
 * Hängt die Erfassung an. Wie alle Schichten: Ohne Konfiguration passiert
 * nichts, und die Reihenfolge im Stapel ist egal – dieses Modul liest nur.
 */
export function tuneSessions<T extends MazeGame>(game: T, options: SessionsOptions = {}): T {
  const config = persistenceConfig();
  if (!config && !options.forceEnabled && !options.client) return game;

  const state = stateFor(game);
  if (state.enabled) return game;
  state.enabled = true;
  state.log = options.log ?? ((message: string) => console.error(`[sessions] ${message}`));
  state.client = options.client ?? (config ? createSessionsClient(config) : null);

  const internals = game as unknown as SessionInternals;

  // Jeder Tod ist ein abgeschlossenes Leben – das ist die Zahl, die „wie oft
  // hat jemand gespielt" beantwortet, unabhängig davon ob Punkte dabei waren.
  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target, attackerId, now, environmentName): void => {
    const session = target.dead ? undefined : state.open.get(target.id);
    if (session) {
      session.runs += 1;
      /*
       * HOECHSTSTAND, nicht Summe: `player.kills` zaehlt ueber die ganze
       * Sitzung weiter -- `respawn()` setzt Score, Streak und Level zurueck,
       * die Abschuesse aber nicht. Wer bei jedem Tod addiert, summiert
       * dieselben Abschuesse erneut:
       *
       *   Leben mit 2, 3, 2 Abschuessen -> addiert 2 + 5 + 7 = 14 statt 7.
       *
       * Der Fehler waechst dreieckig mit der Zahl der Leben und landete
       * ungebremst in `sessions.kills` -- also in der Kennzahl, an der man
       * abliest, wie viel in einer Sitzung passiert ist.
       */
      session.kills = Math.max(session.kills, Math.max(0, Math.round(target.kills)));
      session.bestScore = Math.max(session.bestScore, Math.max(0, Math.round(target.score)));
      session.bestLevel = Math.max(session.bestLevel, Math.max(1, Math.round(target.level)));
    }
    originalKillPlayer(target, attackerId, now, environmentName);
  };

  // Auch wer nie stirbt, hinterlässt seinen Höchststand: Ohne diesen Schritt
  // hätte ein Spieler, der auf Level 30 aufhört, best_level 1.
  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    const session = state.open.get(id);
    const player = internals.players.get(id);
    if (session && player && !player.dead) {
      // Auch die Abschuesse: Wer geht, ohne je zu sterben, haette sonst 0 --
      // und das ist ausgerechnet der Spieler, der gut war.
      session.kills = Math.max(session.kills, Math.max(0, Math.round(player.kills)));
      session.bestScore = Math.max(session.bestScore, Math.max(0, Math.round(player.score)));
      session.bestLevel = Math.max(session.bestLevel, Math.max(1, Math.round(player.level)));
    }
    endSession(game, id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  const flushIntervalMs = options.flushIntervalMs
    ?? integerEnvironment('SESSIONS_FLUSH_MS', DEFAULT_FLUSH_INTERVAL_MS, 1_000, 300_000);
  state.timer = setInterval(() => { void flush(state); }, flushIntervalMs);
  state.timer.unref();

  return game;
}

/** Stoppt den Flush-Timer – für Tests und den geordneten Shutdown. */
export function stopSessions(game: MazeGame): void {
  const state = stateFor(game);
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
