import type { Request, Response } from 'express';
import type { PlayerClass, PlayerSnapshot } from '@project-maze/shared';
import { MazeGame } from './game.js';

/**
 * Supabase-Persistenz als eigenständige Tuning-Schicht (Etappe 1+2).
 *
 * Harte Regeln dieses Moduls:
 *
 * 1. **Feature-Flag:** Ohne `SUPABASE_URL` *und* `SUPABASE_SERVICE_ROLE_KEY`
 *    hängt sich die Schicht gar nicht erst ein – der Server verhält sich dann
 *    exakt wie ohne dieses Modul. Auch die Bibliothek wird dann nie geladen.
 * 2. **Nie im Tick-Pfad:** Beim Tod landet ein fertiger Datensatz in einem
 *    Puffer im Arbeitsspeicher. Geschrieben wird ausschließlich in einem
 *    eigenen Intervall, außerhalb der Simulation.
 * 3. **Fehler stören das Spiel nie:** Jeder Netzwerk- oder Datenbankfehler
 *    wird gezählt und geloggt, aber niemals geworfen. Fällt Supabase aus,
 *    läuft die Arena unverändert weiter.
 */

/** Tabelle der abgeschlossenen Runs – siehe supabase/migrations. */
export const RUNS_TABLE = 'runs';
/** Profiltabelle aus Migration 0002; nur mit aktiviertem Login befüllt. */
export const PROFILES_TABLE = 'profiles';
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_LEADERBOARD_CACHE_MS = 30_000;
const DEFAULT_LEADERBOARD_LIMIT = 50;
/** Obergrenze des Puffers; darüber werden die ältesten Runs verworfen. */
const MAX_QUEUE = 500;
/** Zeilen pro Insert – hält einzelne Requests klein und schnell. */
const MAX_BATCH = 200;
/** Fehlermeldungen höchstens einmal pro Minute, damit Logs nutzbar bleiben. */
const ERROR_LOG_INTERVAL_MS = 60_000;

export interface RunRecord {
  playerName: string;
  score: number;
  level: number;
  playerClass: PlayerClass;
  kills: number;
  bestStreak: number;
  durationSeconds: number;
  /** Konto des Spielers, `null` bei Gast-Runs (Normalfall). */
  userId: string | null;
}

/** Profilzeile eines angemeldeten Kontos (Migration 0002). */
export interface ProfileRecord {
  userId: string;
  displayName: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
  level: number;
  playerClass: string;
  kills: number;
  bestStreak: number;
  durationSeconds: number;
  achievedAt: string;
}

/** Schmale Naht zur Datenbank – im Test durch eine Attrappe ersetzbar. */
export interface PersistenceClient {
  insertRuns(runs: readonly RunRecord[]): Promise<void>;
  topRuns(limit: number): Promise<LeaderboardEntry[]>;
  upsertProfiles(profiles: readonly ProfileRecord[]): Promise<void>;
}

export interface PersistenceConfig {
  url: string;
  serviceRoleKey: string;
}

export interface PersistenceOptions {
  client?: PersistenceClient;
  flushIntervalMs?: number;
  leaderboardCacheMs?: number;
  log?: (message: string) => void;
  /** Nur für Tests: erzwingt das Anhängen ohne echte ENV-Konfiguration. */
  forceEnabled?: boolean;
}

export interface PersistenceStats {
  enabled: boolean;
  queued: number;
  written: number;
  dropped: number;
  failedFlushes: number;
  lastErrorAt: number | null;
}

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface PersistenceInternals {
  players: Map<string, RuntimePlayer>;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}

interface PersistenceState {
  enabled: boolean;
  client: PersistenceClient | null;
  queue: RunRecord[];
  profileQueue: Map<string, ProfileRecord>;
  /** Spieler-ID → Konto-ID, gesetzt beim angemeldeten Join. */
  accounts: Map<string, string>;
  lifeStartedAt: Map<string, number>;
  written: number;
  dropped: number;
  failedFlushes: number;
  lastErrorAt: number | null;
  lastErrorLoggedAt: number;
  flushing: boolean;
  timer: NodeJS.Timeout | null;
  leaderboardCacheMs: number;
  cache: { entries: LeaderboardEntry[]; fetchedAt: number } | null;
  cacheInFlight: Promise<LeaderboardEntry[]> | null;
  log: (message: string) => void;
}

const states = new WeakMap<MazeGame, PersistenceState>();

const createState = (): PersistenceState => ({
  enabled: false,
  client: null,
  queue: [],
  profileQueue: new Map(),
  accounts: new Map(),
  lifeStartedAt: new Map(),
  written: 0,
  dropped: 0,
  failedFlushes: 0,
  lastErrorAt: null,
  lastErrorLoggedAt: 0,
  flushing: false,
  timer: null,
  leaderboardCacheMs: DEFAULT_LEADERBOARD_CACHE_MS,
  cache: null,
  cacheInFlight: null,
  log: () => {}
});

const stateFor = (game: MazeGame): PersistenceState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = createState();
  states.set(game, created);
  return created;
};

/**
 * Liest die Konfiguration aus der Umgebung. Beide Werte müssen gesetzt sein –
 * eine halbe Konfiguration ist ein Betriebsfehler und wird als „aus" gewertet.
 */
export function persistenceConfig(): PersistenceConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

const integerEnvironment = (name: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function noteError(state: PersistenceState, scope: string, error: unknown, now = Date.now()): void {
  state.lastErrorAt = now;
  if (now - state.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
  state.lastErrorLoggedAt = now;
  state.log(`${scope}: ${errorMessage(error)}`);
}

/**
 * Supabase-Adapter. Die Bibliothek wird erst hier dynamisch geladen, damit ein
 * Server ohne Persistenz sie nicht einmal in den Speicher zieht.
 */
export function createSupabaseClient(config: PersistenceConfig): PersistenceClient {
  const clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(
    config.url,
    config.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ));

  return {
    async insertRuns(runs) {
      const client = await clientPromise;
      const { error } = await client.from(RUNS_TABLE).insert(runs.map((run) => ({
        player_name: run.playerName,
        score: run.score,
        level: run.level,
        player_class: run.playerClass,
        kills: run.kills,
        best_streak: run.bestStreak,
        duration_seconds: run.durationSeconds,
        user_id: run.userId
      })));
      if (error) throw new Error(error.message);
    },
    async upsertProfiles(profiles) {
      const client = await clientPromise;
      const { error } = await client.from(PROFILES_TABLE).upsert(
        profiles.map((profile) => ({ user_id: profile.userId, display_name: profile.displayName })),
        { onConflict: 'user_id' }
      );
      if (error) throw new Error(error.message);
    },
    async topRuns(limit) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(RUNS_TABLE)
        .select('player_name, score, level, player_class, kills, best_streak, duration_seconds, created_at')
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row, index) => ({
        rank: index + 1,
        playerName: String(row.player_name ?? ''),
        score: Number(row.score ?? 0),
        level: Number(row.level ?? 1),
        playerClass: String(row.player_class ?? 'core'),
        kills: Number(row.kills ?? 0),
        bestStreak: Number(row.best_streak ?? 0),
        durationSeconds: Number(row.duration_seconds ?? 0),
        achievedAt: String(row.created_at ?? '')
      }));
    }
  };
}

function enqueue(state: PersistenceState, run: RunRecord): void {
  if (state.queue.length >= MAX_QUEUE) {
    state.queue.shift();
    state.dropped += 1;
  }
  state.queue.push(run);
}

/**
 * Schreibt den Puffer weg. Läuft nie parallel zu sich selbst; scheitert der
 * Insert, wandern die Zeilen zurück an den Anfang der Warteschlange.
 */
async function flush(state: PersistenceState): Promise<void> {
  if (!state.enabled || !state.client || state.flushing) return;
  if (state.queue.length === 0 && state.profileQueue.size === 0) return;
  state.flushing = true;
  const batch = state.queue.splice(0, MAX_BATCH);
  const profiles = [...state.profileQueue.values()].slice(0, MAX_BATCH);
  try {
    // Profile zuerst: Ein Run mit user_id braucht die Zeile nicht, aber die
    // Reihenfolge hält die Profilkarte im Death-Screen aktuell.
    if (profiles.length > 0) {
      await state.client.upsertProfiles(profiles);
      for (const profile of profiles) state.profileQueue.delete(profile.userId);
    }
    if (batch.length > 0) {
      await state.client.insertRuns(batch);
      state.written += batch.length;
    }
  } catch (error) {
    state.failedFlushes += 1;
    noteError(state, 'Supabase-Schreibzugriff fehlgeschlagen', error);
    // Zurück in die Warteschlange, aber ohne sie über die Obergrenze zu treiben.
    const room = Math.max(0, MAX_QUEUE - state.queue.length);
    const kept = batch.slice(Math.max(0, batch.length - room));
    state.dropped += batch.length - kept.length;
    state.queue.unshift(...kept);
  } finally {
    state.flushing = false;
  }
}

/** Leert den Puffer sofort – für den geordneten Shutdown. */
export async function flushPersistence(game: MazeGame): Promise<void> {
  const state = stateFor(game);
  if (!state.enabled) return;
  // Ein laufender Flush darf zu Ende gehen, bevor der Rest hinterherkommt.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (state.queue.length === 0 && state.profileQueue.size === 0) return;
    await flush(state);
  }
}

/**
 * Verknüpft einen Spielplatz mit einem verifizierten Konto. **Wird noch von
 * niemandem aufgerufen** – die Join-Message trägt das Token erst, wenn
 * `packages/shared` erweitert ist (siehe Vorschlag im Statusblock). Bis dahin
 * bleibt `runs.user_id` überall NULL.
 *
 * Ohne aktive Persistenz ist der Aufruf ein No-op.
 */
export function linkPlayerToUser(
  game: MazeGame,
  playerId: string,
  user: { userId: string; displayName?: string | null } | null
): void {
  const state = stateFor(game);
  if (!state.enabled) return;
  if (!user) {
    state.accounts.delete(playerId);
    return;
  }
  state.accounts.set(playerId, user.userId);
  const displayName = user.displayName?.trim().slice(0, 18);
  if (displayName) state.profileQueue.set(user.userId, { userId: user.userId, displayName });
}

export function persistenceStats(game: MazeGame): PersistenceStats {
  const state = stateFor(game);
  return {
    enabled: state.enabled,
    queued: state.queue.length,
    written: state.written,
    dropped: state.dropped,
    failedFlushes: state.failedFlushes,
    lastErrorAt: state.lastErrorAt
  };
}

export async function leaderboard(game: MazeGame, limit = DEFAULT_LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
  const state = stateFor(game);
  if (!state.enabled || !state.client) return [];
  const now = Date.now();
  if (state.cache && now - state.cache.fetchedAt < state.leaderboardCacheMs) return state.cache.entries;
  // Parallele Anfragen teilen sich einen einzigen Datenbank-Roundtrip.
  if (state.cacheInFlight) return state.cacheInFlight;

  const client = state.client;
  state.cacheInFlight = client.topRuns(limit)
    .then((entries) => {
      state.cache = { entries, fetchedAt: Date.now() };
      return entries;
    })
    .catch((error: unknown) => {
      noteError(state, 'Leaderboard-Abfrage fehlgeschlagen', error);
      // Lieber leicht veraltete Daten ausliefern als einen Fehler zeigen.
      if (state.cache) return state.cache.entries;
      throw error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => { state.cacheInFlight = null; });
  return state.cacheInFlight;
}

/**
 * Express-Handler für `GET /leaderboard`. Ohne konfigurierte Persistenz
 * antwortet die Route mit 404 – genau wie `/metrics` ohne Telemetrie.
 */
export function leaderboardHandler(game: MazeGame): (request: Request, response: Response) => void {
  return (request: Request, response: Response): void => {
    const state = stateFor(game);
    if (!state.enabled) {
      response.status(404).json({ error: 'Leaderboard ist nicht konfiguriert.' });
      return;
    }
    const requested = Number.parseInt(String(request.query.limit ?? ''), 10);
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(DEFAULT_LEADERBOARD_LIMIT, requested))
      : DEFAULT_LEADERBOARD_LIMIT;

    void leaderboard(game, limit)
      .then((entries) => {
        const cachedAt = state.cache?.fetchedAt ?? Date.now();
        response.setHeader('Cache-Control', `public, max-age=${Math.round(state.leaderboardCacheMs / 1000)}`);
        response.json({
          entries: entries.slice(0, limit),
          cachedAt: new Date(cachedAt).toISOString(),
          cacheSeconds: Math.round(state.leaderboardCacheMs / 1000)
        });
      })
      .catch(() => {
        response.status(503).json({ error: 'Leaderboard gerade nicht verfügbar.' });
      });
  };
}

/**
 * Hängt die Persistenz an. Ohne Konfiguration wird das Spiel unverändert
 * zurückgegeben – kein Hook, kein Timer, keine geladene Bibliothek.
 */
export function tunePersistence<T extends MazeGame>(game: T, options: PersistenceOptions = {}): T {
  const config = persistenceConfig();
  if (!config && !options.forceEnabled && !options.client) return game;

  const internals = game as unknown as PersistenceInternals;
  const state = stateFor(game);
  if (state.enabled) return game;

  state.enabled = true;
  state.log = options.log ?? ((message: string) => console.error(`[persistence] ${message}`));
  state.leaderboardCacheMs = options.leaderboardCacheMs
    ?? integerEnvironment('LEADERBOARD_CACHE_MS', DEFAULT_LEADERBOARD_CACHE_MS, 1_000, 600_000);
  state.client = options.client ?? (config ? createSupabaseClient(config) : null);

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    if (target.dead) {
      originalKillPlayer(target, attackerId, now, environmentName);
      return;
    }
    // Alles vor dem Tod ablesen: killPlayer setzt Streak und Zustand zurück.
    const isBot = target.isBot;
    const record: RunRecord = {
      playerName: target.name,
      score: Math.max(0, Math.round(target.score)),
      level: Math.max(1, Math.round(target.level)),
      playerClass: target.playerClass,
      kills: Math.max(0, Math.round(target.kills)),
      bestStreak: Math.max(0, Math.round(Math.max(target.bestStreak, target.streak))),
      durationSeconds: 0,
      userId: state.accounts.get(target.id) ?? null
    };
    const startedAt = state.lifeStartedAt.get(target.id);
    state.lifeStartedAt.delete(target.id);

    originalKillPlayer(target, attackerId, now, environmentName);

    // Bots gehören nicht in ein globales Leaderboard, Nullrunden auch nicht.
    if (isBot || record.score <= 0) return;
    record.durationSeconds = startedAt === undefined
      ? 0
      : Math.round(Math.max(0, now - startedAt) / 100) / 10;
    enqueue(state, record);
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    // Reine Buchhaltung im Arbeitsspeicher: kein Netzwerk, kein await.
    for (const player of internals.players.values()) {
      if (player.dead) state.lifeStartedAt.delete(player.id);
      else if (!state.lifeStartedAt.has(player.id)) state.lifeStartedAt.set(player.id, now);
    }
    if (state.lifeStartedAt.size > internals.players.size) {
      for (const id of state.lifeStartedAt.keys()) if (!internals.players.has(id)) state.lifeStartedAt.delete(id);
    }
  }) as T['step'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    state.lifeStartedAt.delete(id);
    state.accounts.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  const flushIntervalMs = options.flushIntervalMs
    ?? integerEnvironment('PERSISTENCE_FLUSH_MS', DEFAULT_FLUSH_INTERVAL_MS, 500, 120_000);
  state.timer = setInterval(() => { void flush(state); }, flushIntervalMs);
  // Der Puffer darf den Prozess nicht am Leben halten.
  state.timer.unref();

  return game;
}

/** Stoppt den Flush-Timer – für Tests und den geordneten Shutdown. */
export function stopPersistence(game: MazeGame): void {
  const state = stateFor(game);
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
