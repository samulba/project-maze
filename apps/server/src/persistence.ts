import type { Request, Response } from 'express';
import { PLAYER_CLASS_IDS, sanitizePlayerName, type PlayerClass, type PlayerSnapshot } from '@project-maze/shared';
import { ACHIEVEMENT_CATALOG, type AchievementId } from '@project-maze/shared/gameplay';
import { achievementProgressFor, unlockedAchievementsFor } from './achievements.js';
import { verifyAuthToken } from './auth.js';
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
/** Achievement-Tabelle aus Migration 0003. */
export const ACHIEVEMENTS_TABLE = 'achievements';
/** Aggregat-View aus Migration 0003 – spart GET /profile das Nachrechnen. */
export const PROFILE_STATS_VIEW = 'profile_stats';
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_LEADERBOARD_CACHE_MS = 30_000;
const DEFAULT_LEADERBOARD_LIMIT = 50;
/** Obergrenze des Puffers; darüber werden die ältesten Runs verworfen. */
const MAX_QUEUE = 500;
/** So viele Profile bleiben gecacht – begrenzt, weil die Route öffentlich ist. */
const MAX_PROFILE_CACHE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/**
 * Ein Namenswechsel kostet so viele Token aus dem HTTP-Budget. Bei 60/min und
 * einem Vorrat von 15 sind das fünf Versuche am Stück und rund zwanzig pro
 * Minute je IP.
 *
 * Bewusst nicht strenger: Gepufferte Namen fallen je Konto zusammen
 * (`profileQueue` ist eine Map), zwanzig Änderungen in einer Minute erzeugen
 * also genau *einen* Datenbankschreibvorgang. Teuer ist nur die Token-Prüfung,
 * und die kostet Mikrosekunden. Gescheiterte Versuche zahlen denselben Preis –
 * das ist Absicht, sonst wären Token-Rateversuche gratis.
 */
export const PROFILE_WRITE_COST = 3;
/** Größere Bodys sind bei einem einzigen Textfeld immer ein Angriffsversuch. */
export const PROFILE_BODY_LIMIT = '1kb';

const CLASS_IDS = new Set<string>(PLAYER_CLASS_IDS);
/** Nimmt nur Klassen an, die der Code auch kennt – die DB hält bloß Text. */
const knownClass = (value: unknown): PlayerClass | null =>
  (typeof value === 'string' && CLASS_IDS.has(value) ? value as PlayerClass : null);
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

/** Ein freigeschaltetes Achievement eines Kontos (Migration 0003). */
export interface AchievementRecord {
  userId: string;
  achievementId: AchievementId;
}

/** Gespeichertes Achievement inklusive Zeitpunkt, wie es aus der DB kommt. */
export interface StoredAchievement {
  achievementId: AchievementId;
  unlockedAt: string;
}

/** Bestleistungen eines Kontos, aggregiert aus `profile_stats`. */
export interface ProfileStats {
  runs: number;
  bestScore: number;
  bestLevel: number;
  bestKills: number;
  bestStreak: number;
  longestRunSeconds: number;
  totalKills: number;
  /** Gesamtspielzeit über alle Runs dieses Kontos, in Sekunden. */
  totalSeconds: number;
  firstRunAt: string | null;
  lastRunAt: string | null;
  /**
   * Meistgespielte **selbst gewählte** Klasse. `core` erscheint nur, wenn nie
   * eine Klasse gewählt wurde – sonst wäre es bei fast jedem Konto `core`,
   * weil jeder Lauf dort beginnt (siehe Migration 0004).
   */
  favoriteClass: PlayerClass | null;
  favoriteClassRuns: number;
  favoriteClassSeconds: number;
}

/** Rohdaten eines Profils, so wie der Adapter sie liefert. */
export interface ProfileSnapshot {
  userId: string;
  displayName: string | null;
  memberSince: string | null;
  stats: ProfileStats | null;
  achievements: StoredAchievement[];
}

/** Öffentliche Antwort von `GET /profile/:userId`. */
export interface PublicProfile {
  userId: string;
  displayName: string | null;
  memberSince: string | null;
  stats: ProfileStats;
  achievements: { id: AchievementId; name: string; description: string; unlockedAt: string }[];
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
  insertAchievements(unlocks: readonly AchievementRecord[]): Promise<void>;
  achievementsFor(userId: string): Promise<StoredAchievement[]>;
  profileFor(userId: string): Promise<ProfileSnapshot | null>;
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
  achievementsQueued: number;
  achievementsWritten: number;
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
  achievementQueue: AchievementRecord[];
  /** Konto-ID → bereits gespeicherte Achievements (vorgeladen + geschrieben). */
  knownAchievements: Map<string, Set<AchievementId>>;
  /** Vorgeladene Unlocks, die noch in die Engine gespiegelt werden müssen. */
  pendingSeed: Map<string, AchievementId[]>;
  achievementsWritten: number;
  /** Spieler-ID → Konto-ID, gesetzt beim angemeldeten Join. */
  accounts: Map<string, string>;
  lifeStartedAt: Map<string, number>;
  /**
   * Spieler-ID → Sitzungs-Kills beim Start des aktuellen Lebens. Die Engine
   * setzt `kills` beim Respawn nie zurück (Kopfgeld-Auswahl liest den
   * Sitzungsstand); ein `runs`-Eintrag gilt aber laut Schema „Spawn bis Tod".
   * Ohne die Basis zählte jede Zeile die Vorleben mit – bei n Leben summiert
   * `profile_stats.total_kills` dann das (n+1)/2-Fache (Befund 58; dieselbe
   * Falle ist in sessions.ts:521 für die Admin-Tabelle dokumentiert).
   */
  killsAtLifeStart: Map<string, number>;
  written: number;
  dropped: number;
  failedFlushes: number;
  lastErrorAt: number | null;
  lastErrorLoggedAt: number;
  flushing: boolean;
  /** Laufender Flush – wer flush() ruft, bekommt ihn statt eines No-ops. */
  flushPromise: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  leaderboardCacheMs: number;
  cache: { entries: LeaderboardEntry[]; fetchedAt: number } | null;
  cacheInFlight: Promise<LeaderboardEntry[]> | null;
  /** Profil-Cache je Konto; `null` merkt sich auch „kenne ich nicht". */
  profileCache: Map<string, { profile: PublicProfile | null; fetchedAt: number }>;
  profileInFlight: Map<string, Promise<PublicProfile | null>>;
  log: (message: string) => void;
}

const states = new WeakMap<MazeGame, PersistenceState>();

const createState = (): PersistenceState => ({
  enabled: false,
  client: null,
  queue: [],
  profileQueue: new Map(),
  achievementQueue: [],
  knownAchievements: new Map(),
  pendingSeed: new Map(),
  achievementsWritten: 0,
  accounts: new Map(),
  lifeStartedAt: new Map(),
  killsAtLifeStart: new Map(),
  written: 0,
  dropped: 0,
  failedFlushes: 0,
  lastErrorAt: null,
  lastErrorLoggedAt: 0,
  flushing: false,
  flushPromise: null,
  timer: null,
  leaderboardCacheMs: DEFAULT_LEADERBOARD_CACHE_MS,
  cache: null,
  cacheInFlight: null,
  profileCache: new Map(),
  profileInFlight: new Map(),
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
    async insertAchievements(unlocks) {
      const client = await clientPromise;
      // Doppelte sind kein Fehler: Der zusammengesetzte Primärschlüssel macht
      // den Insert idempotent, `ignoreDuplicates` lässt ihn dabei still bleiben.
      const { error } = await client.from(ACHIEVEMENTS_TABLE).upsert(
        unlocks.map((unlock) => ({ user_id: unlock.userId, achievement_id: unlock.achievementId })),
        { onConflict: 'user_id,achievement_id', ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
    },
    async achievementsFor(userId) {
      const client = await clientPromise;
      const { data, error } = await client
        .from(ACHIEVEMENTS_TABLE)
        .select('achievement_id, unlocked_at')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        achievementId: String(row.achievement_id ?? '') as AchievementId,
        unlockedAt: String(row.unlocked_at ?? '')
      }));
    },
    async profileFor(userId) {
      const client = await clientPromise;
      const [profile, stats, unlocks] = await Promise.all([
        client.from(PROFILES_TABLE).select('display_name, created_at').eq('user_id', userId).maybeSingle(),
        client.from(PROFILE_STATS_VIEW).select('*').eq('user_id', userId).maybeSingle(),
        this.achievementsFor(userId)
      ]);
      if (profile.error) throw new Error(profile.error.message);
      if (stats.error) throw new Error(stats.error.message);

      const row = stats.data as Record<string, unknown> | null;
      // Wer weder Profil noch Runs noch Achievements hat, existiert für diese
      // Route nicht – das ist ein 404 und keine leere Antwort.
      if (!profile.data && !row && unlocks.length === 0) return null;
      return {
        userId,
        displayName: profile.data ? String(profile.data.display_name ?? '') || null : null,
        memberSince: profile.data ? String(profile.data.created_at ?? '') || null : null,
        stats: row
          ? {
            runs: Number(row['runs'] ?? 0),
            bestScore: Number(row['best_score'] ?? 0),
            bestLevel: Number(row['best_level'] ?? 0),
            bestKills: Number(row['best_kills'] ?? 0),
            bestStreak: Number(row['best_streak'] ?? 0),
            longestRunSeconds: Number(row['longest_run_seconds'] ?? 0),
            totalKills: Number(row['total_kills'] ?? 0),
            totalSeconds: Number(row['total_seconds'] ?? 0),
            firstRunAt: row['first_run_at'] ? String(row['first_run_at']) : null,
            lastRunAt: row['last_run_at'] ? String(row['last_run_at']) : null,
            // Spalten aus Migration 0004; vor dem Einspielen fehlen sie einfach.
            favoriteClass: knownClass(row['favorite_class']),
            favoriteClassRuns: Number(row['favorite_class_runs'] ?? 0),
            favoriteClassSeconds: Number(row['favorite_class_seconds'] ?? 0)
          }
          : null,
        achievements: unlocks
      };
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
const knownFor = (state: PersistenceState, userId: string): Set<AchievementId> => {
  const existing = state.knownAchievements.get(userId);
  if (existing) return existing;
  const created = new Set<AchievementId>();
  state.knownAchievements.set(userId, created);
  return created;
};

/**
 * Vergleicht den Stand der Engine mit dem, was für dieses Konto schon
 * gespeichert ist, und puffert die Differenz. Reine Mengenarithmetik im
 * Arbeitsspeicher – kein Netzwerk, kein `await`.
 */
function collectAchievementUnlocks(game: MazeGame, state: PersistenceState): void {
  if (!state.enabled || state.accounts.size === 0) return;
  for (const [playerId, userId] of state.accounts) {
    const unlocked = unlockedAchievementsFor(game, playerId);
    if (unlocked.length === 0) continue;
    const known = knownFor(state, userId);
    for (const achievementId of unlocked) {
      if (known.has(achievementId)) continue;
      known.add(achievementId);
      if (state.achievementQueue.length >= MAX_QUEUE) {
        const evicted = state.achievementQueue.shift();
        // Verdrängtes gilt wieder als unbekannt – sonst würde es nie nachgeholt.
        if (evicted) state.knownAchievements.get(evicted.userId)?.delete(evicted.achievementId);
        state.dropped += 1;
      }
      state.achievementQueue.push({ userId, achievementId });
    }
  }
}

/**
 * Spiegelt bereits gespeicherte Unlocks in die Engine, damit ein
 * wiederkehrendes Konto nichts doppelt freischaltet – weder als Popup noch als
 * Datenbankzeile. Bewusst nur `unlocked`, niemals `fresh`: Alte Achievements
 * sollen nicht erneut gefeiert werden.
 *
 * Gibt `false` zurück, solange die Engine für diesen Spieler noch keinen
 * Fortschritt angelegt hat; der Aufrufer versucht es dann im nächsten Tick.
 */
function seedEngine(game: MazeGame, playerId: string, ids: readonly AchievementId[]): boolean {
  const progress = achievementProgressFor(game, playerId);
  if (!progress) return false;
  for (const id of ids) progress.unlocked.add(id);
  return true;
}

/**
 * Holt die gespeicherten Unlocks eines Kontos beim Join. Läuft im Hintergrund;
 * der Join wartet nie darauf.
 */
function preloadAchievements(game: MazeGame, state: PersistenceState, playerId: string, userId: string): void {
  const client = state.client;
  if (!client) return;
  void client.achievementsFor(userId)
    .then((stored) => {
      const known = knownFor(state, userId);
      for (const entry of stored) known.add(entry.achievementId);
      // Der Platz könnte inzwischen frei oder neu vergeben sein.
      if (state.accounts.get(playerId) !== userId || stored.length === 0) return;
      const ids = stored.map((entry) => entry.achievementId);
      if (!seedEngine(game, playerId, ids)) state.pendingSeed.set(playerId, ids);
    })
    .catch((error: unknown) => noteError(state, 'Achievement-Vorladen fehlgeschlagen', error));
}

/** Trägt nachgereichte Vorladungen ein, sobald die Engine bereit ist. */
function applyPendingSeeds(game: MazeGame, state: PersistenceState): void {
  for (const [playerId, ids] of state.pendingSeed) {
    if (!state.accounts.has(playerId) || seedEngine(game, playerId, ids)) state.pendingSeed.delete(playerId);
  }
}

const pending = (state: PersistenceState): boolean =>
  state.queue.length > 0 || state.profileQueue.size > 0 || state.achievementQueue.length > 0;

/**
 * Profile zuerst: Ein Run mit `user_id` braucht die Zeile nicht, aber die
 * Reihenfolge hält die Profilkarte im Death-Screen aktuell.
 */
async function flushProfiles(state: PersistenceState, client: PersistenceClient): Promise<void> {
  const profiles = [...state.profileQueue.values()].slice(0, MAX_BATCH);
  if (profiles.length === 0) return;
  try {
    await client.upsertProfiles(profiles);
    for (const profile of profiles) state.profileQueue.delete(profile.userId);
  } catch (error) {
    state.failedFlushes += 1;
    noteError(state, 'Profil-Upsert fehlgeschlagen', error);
  }
}

/**
 * Achievements bleiben bei einem Fehler in der Warteschlange. Der Insert ist
 * idempotent, ein zweiter Versuch kann also nichts doppeln.
 */
async function flushAchievements(state: PersistenceState, client: PersistenceClient): Promise<void> {
  const batch = state.achievementQueue.splice(0, MAX_BATCH);
  if (batch.length === 0) return;
  try {
    await client.insertAchievements(batch);
    state.achievementsWritten += batch.length;
  } catch (error) {
    state.failedFlushes += 1;
    noteError(state, 'Achievement-Insert fehlgeschlagen', error);
    const room = Math.max(0, MAX_QUEUE - state.achievementQueue.length);
    const kept = batch.slice(Math.max(0, batch.length - room));
    const discarded = batch.slice(0, batch.length - kept.length);
    state.dropped += discarded.length;
    state.achievementQueue.unshift(...kept);
    // Nur wirklich Verworfenes gilt wieder als unbekannt, damit der Sammler es
    // irgendwann nachholt. Die behaltenen Einträge liegen noch in der
    // Warteschlange – sie zu de-registrieren hieße, dass der Sammler sie im
    // nächsten Intervall ein zweites Mal hineinlegt.
    for (const unlock of discarded) state.knownAchievements.get(unlock.userId)?.delete(unlock.achievementId);
  }
}

async function flushRuns(state: PersistenceState, client: PersistenceClient): Promise<void> {
  const batch = state.queue.splice(0, MAX_BATCH);
  if (batch.length === 0) return;
  try {
    await client.insertRuns(batch);
    state.written += batch.length;
  } catch (error) {
    state.failedFlushes += 1;
    noteError(state, 'Run-Insert fehlgeschlagen', error);
    // Zurück in die Warteschlange, aber ohne sie über die Obergrenze zu treiben.
    const room = Math.max(0, MAX_QUEUE - state.queue.length);
    const kept = batch.slice(Math.max(0, batch.length - room));
    state.dropped += batch.length - kept.length;
    state.queue.unshift(...kept);
  }
}

/**
 * Schreibt die Puffer weg. Läuft nie parallel zu sich selbst; jede der drei
 * Warteschlangen scheitert für sich, damit ein Fehler die anderen nicht
 * mitreißt.
 */
function flush(state: PersistenceState): Promise<void> {
  if (!state.enabled || !state.client) return Promise.resolve();
  // Ein laufender Flush wird zurückgegeben statt übersprungen – nur so kann
  // der Shutdown wirklich auf ihn warten, statt in ein No-op zu laufen.
  if (state.flushPromise) return state.flushPromise;
  if (!pending(state)) return Promise.resolve();
  const client = state.client;
  state.flushing = true;
  state.flushPromise = (async () => {
    try {
      await flushProfiles(state, client);
      await flushAchievements(state, client);
      await flushRuns(state, client);
    } finally {
      state.flushing = false;
      state.flushPromise = null;
    }
  })();
  return state.flushPromise;
}

/** Leert die Puffer sofort – für den geordneten Shutdown. */
export async function flushPersistence(game: MazeGame): Promise<void> {
  const state = stateFor(game);
  if (!state.enabled) return;
  // Letzte Unlocks noch einsammeln, bevor der Prozess geht.
  collectAchievementUnlocks(game, state);
  // Ein laufender Flush darf zu Ende gehen, bevor der Rest hinterherkommt.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!pending(state)) return;
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
  // Kommt die Token-Prüfung erst nach dem Disconnect zurück, gibt es den
  // Spieler nicht mehr. Dann darf hier auch keine Verknüpfung mehr entstehen –
  // removePlayer für diese ID läuft nie wieder, der Eintrag bliebe für immer.
  const players = (game as unknown as { players: Map<string, unknown> }).players;
  if (!players.has(playerId)) return;
  if (!user) {
    state.accounts.delete(playerId);
    return;
  }
  const alreadyLinked = state.accounts.get(playerId) === user.userId;
  state.accounts.set(playerId, user.userId);
  const displayName = user.displayName?.trim().slice(0, 18);
  if (displayName) state.profileQueue.set(user.userId, { userId: user.userId, displayName });
  // Gespeicherte Unlocks holen, damit nichts doppelt vergeben wird.
  if (!alreadyLinked) preloadAchievements(game, state, playerId, user.userId);
}

export function persistenceStats(game: MazeGame): PersistenceStats {
  const state = stateFor(game);
  return {
    enabled: state.enabled,
    queued: state.queue.length,
    written: state.written,
    dropped: state.dropped,
    failedFlushes: state.failedFlushes,
    lastErrorAt: state.lastErrorAt,
    achievementsQueued: state.achievementQueue.length,
    achievementsWritten: state.achievementsWritten
  };
}

export async function leaderboard(game: MazeGame, limit = DEFAULT_LEADERBOARD_LIMIT): Promise<LeaderboardEntry[]> {
  const state = stateFor(game);
  if (!state.enabled || !state.client) return [];
  const now = Date.now();
  const zuschneiden = (entries: LeaderboardEntry[]): LeaderboardEntry[] =>
    entries.length <= limit ? entries : entries.slice(0, limit);
  if (state.cache && now - state.cache.fetchedAt < state.leaderboardCacheMs) return zuschneiden(state.cache.entries);
  // Parallele Anfragen teilen sich einen einzigen Datenbank-Roundtrip.
  if (state.cacheInFlight) return state.cacheInFlight.then(zuschneiden);

  const client = state.client;
  /*
   * Geholt wird IMMER die volle Länge, egal wonach gefragt wurde.
   *
   * Der Cache-Schlüssel ist die Zeit, nicht das `limit`. Wer ihn füllte,
   * bestimmte damit für 30 Sekunden die Listenlänge für alle: Ein einziges
   * `GET /leaderboard?limit=1` – ungeschützt und einen Handgriff entfernt –
   * kürzte jedem Startscreen die Bestenliste auf einen Eintrag, und der
   * Handler kann fehlende Zeilen nicht nachholen, er schneidet nur zu
   * (`entries.slice(0, limit)`). Nachgemessen mit einer Attrappe aus 50
   * Zeilen: limit=1 füllt den Cache, danach liefert limit=50 genau einen
   * Eintrag. Die volle Länge zu holen kostet eine Abfrage, die ohnehin
   * gedeckelt ist – und `limit` bleibt die Sache des Handlers.
   */
  state.cacheInFlight = client.topRuns(DEFAULT_LEADERBOARD_LIMIT)
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
  return state.cacheInFlight.then(zuschneiden);
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

const EMPTY_STATS: ProfileStats = {
  runs: 0,
  bestScore: 0,
  bestLevel: 0,
  bestKills: 0,
  bestStreak: 0,
  longestRunSeconds: 0,
  totalKills: 0,
  totalSeconds: 0,
  firstRunAt: null,
  lastRunAt: null,
  favoriteClass: null,
  favoriteClassRuns: 0,
  favoriteClassSeconds: 0
};

/** Rohdaten in die öffentliche Form bringen und mit Katalogtexten anreichern. */
function toPublicProfile(snapshot: ProfileSnapshot): PublicProfile {
  return {
    userId: snapshot.userId,
    displayName: snapshot.displayName,
    memberSince: snapshot.memberSince,
    stats: snapshot.stats ?? EMPTY_STATS,
    achievements: snapshot.achievements
      // Ein Achievement, das der Katalog nicht kennt (z. B. nach einem
      // Rückbau), wird ausgelassen statt halb dargestellt.
      .filter((entry) => entry.achievementId in ACHIEVEMENT_CATALOG)
      .map((entry) => ({
        id: entry.achievementId,
        name: ACHIEVEMENT_CATALOG[entry.achievementId].name,
        description: ACHIEVEMENT_CATALOG[entry.achievementId].description,
        unlockedAt: entry.unlockedAt
      }))
  };
}

const rememberProfile = (state: PersistenceState, userId: string, profile: PublicProfile | null): void => {
  // Die Route ist öffentlich: Der Cache bleibt beschränkt, damit zufällige
  // UUIDs den Speicher nicht aufblähen. Ältester Eintrag fliegt zuerst.
  if (state.profileCache.size >= MAX_PROFILE_CACHE) {
    const oldest = state.profileCache.keys().next();
    if (!oldest.done) state.profileCache.delete(oldest.value);
  }
  state.profileCache.set(userId, { profile, fetchedAt: Date.now() });
};

/**
 * Profil eines Kontos: Bestleistungen aus `runs` plus freigeschaltete
 * Achievements. Gecacht wie das Leaderboard – auch das „kenne ich nicht",
 * damit zufällige Anfragen die Datenbank nicht treffen.
 */
export async function profile(game: MazeGame, userId: string): Promise<PublicProfile | null> {
  const state = stateFor(game);
  if (!state.enabled || !state.client || !UUID_PATTERN.test(userId)) return null;
  const cached = state.profileCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < state.leaderboardCacheMs) return cached.profile;
  const inFlight = state.profileInFlight.get(userId);
  if (inFlight) return inFlight;

  const client = state.client;
  const request = client.profileFor(userId)
    .then((snapshot) => {
      const result = snapshot ? toPublicProfile(snapshot) : null;
      rememberProfile(state, userId, result);
      return result;
    })
    .catch((error: unknown) => {
      noteError(state, 'Profil-Abfrage fehlgeschlagen', error);
      // Lieber leicht veraltet als kaputt.
      if (cached) return cached.profile;
      throw error instanceof Error ? error : new Error(String(error));
    })
    .finally(() => { state.profileInFlight.delete(userId); });
  state.profileInFlight.set(userId, request);
  return request;
}

/**
 * Setzt den Anzeigenamen eines Kontos. Der Schreibweg ist derselbe wie überall
 * in diesem Modul: Der Name landet im Puffer und wird vom Flush-Timer
 * geschrieben – nichts wartet auf die Datenbank.
 *
 * Gibt den bereinigten Namen zurück oder `null`, wenn nach dem Bereinigen
 * nichts Brauchbares übrig bleibt.
 */
export function updateDisplayName(game: MazeGame, userId: string, rawName: string): string | null {
  const state = stateFor(game);
  if (!state.enabled || !UUID_PATTERN.test(userId)) return null;
  // Exakt dieselbe Bereinigung wie beim Join: Steuerzeichen raus, 18 Zeichen.
  const displayName = sanitizePlayerName(rawName);
  if (!displayName) return null;

  state.profileQueue.set(userId, { userId, displayName });
  // Der Profil-Cache hielte sonst bis zu 30 Sekunden den alten Namen fest.
  state.profileCache.delete(userId);
  return displayName;
}

/**
 * Express-Handler für `POST /profile`. Erwartet ein gültiges Supabase-Token im
 * `Authorization: Bearer …`-Header und `{ "displayName": "…" }` als Body.
 *
 * Antwortet mit `202`: Der Name ist angenommen und bereinigt, geschrieben wird
 * er beim nächsten Flush. Das ist ehrlicher als ein `200`, das eine
 * abgeschlossene Speicherung behaupten würde.
 */
export function profileUpdateHandler(game: MazeGame): (request: Request, response: Response) => void {
  return (request: Request, response: Response): void => {
    const state = stateFor(game);
    if (!state.enabled) {
      response.status(404).json({ error: 'Profile sind nicht konfiguriert.' });
      return;
    }
    const header = request.headers.authorization;
    const raw = (request.body as { displayName?: unknown } | undefined)?.displayName;
    if (typeof raw !== 'string') {
      response.status(400).json({ error: 'displayName fehlt.' });
      return;
    }

    // Ein ungültiges oder fehlendes Token ist 401 – auch dann, wenn der Login
    // serverseitig ganz abgeschaltet ist. Ohne Konto gibt es kein Profil.
    void verifyAuthToken(header?.startsWith('Bearer ') ? header.slice(7) : undefined)
      .then((user) => {
        if (!user) {
          response.setHeader('WWW-Authenticate', 'Bearer');
          response.status(401).json({ error: 'Anmeldung erforderlich.' });
          return;
        }
        const displayName = updateDisplayName(game, user.userId, raw);
        if (!displayName) {
          response.status(400).json({ error: 'Name enthält keine verwendbaren Zeichen.' });
          return;
        }
        response.status(202).json({ displayName, pending: true });
      })
      .catch(() => {
        response.status(503).json({ error: 'Profil gerade nicht änderbar.' });
      });
  };
}

/**
 * Express-Handler für `GET /profile/:userId`. Verhält sich wie
 * `/leaderboard`: 404 ohne Persistenz, 503 wenn Supabase nicht antwortet und
 * nichts im Cache liegt.
 */
export function profileHandler(game: MazeGame): (request: Request, response: Response) => void {
  return (request: Request, response: Response): void => {
    const state = stateFor(game);
    if (!state.enabled) {
      response.status(404).json({ error: 'Profile sind nicht konfiguriert.' });
      return;
    }
    const userId = String(request.params['userId'] ?? '');
    // Ungültige IDs kosten keine Datenbankabfrage.
    if (!UUID_PATTERN.test(userId)) {
      response.status(400).json({ error: 'Ungültige Konto-ID.' });
      return;
    }

    void profile(game, userId)
      .then((found) => {
        if (!found) {
          response.status(404).json({ error: 'Profil nicht gefunden.' });
          return;
        }
        const cachedAt = state.profileCache.get(userId)?.fetchedAt ?? Date.now();
        response.setHeader('Cache-Control', `public, max-age=${Math.round(state.leaderboardCacheMs / 1000)}`);
        response.json({
          ...found,
          cachedAt: new Date(cachedAt).toISOString(),
          cacheSeconds: Math.round(state.leaderboardCacheMs / 1000)
        });
      })
      .catch(() => {
        response.status(503).json({ error: 'Profil gerade nicht verfügbar.' });
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
      // Kills DIESES Lebens, nicht der Sitzung -- siehe killsAtLifeStart.
      kills: Math.max(0, Math.round(target.kills - (state.killsAtLifeStart.get(target.id) ?? 0))),
      bestStreak: Math.max(0, Math.round(Math.max(target.bestStreak, target.streak))),
      durationSeconds: 0,
      userId: state.accounts.get(target.id) ?? null
    };
    const startedAt = state.lifeStartedAt.get(target.id);
    state.lifeStartedAt.delete(target.id);
    state.killsAtLifeStart.delete(target.id);

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
      if (player.dead) {
        state.lifeStartedAt.delete(player.id);
        state.killsAtLifeStart.delete(player.id);
      } else if (!state.lifeStartedAt.has(player.id)) {
        state.lifeStartedAt.set(player.id, now);
        state.killsAtLifeStart.set(player.id, Math.max(0, Math.round(player.kills)));
      }
    }
    if (state.lifeStartedAt.size > internals.players.size) {
      for (const id of state.lifeStartedAt.keys()) if (!internals.players.has(id)) state.lifeStartedAt.delete(id);
      for (const id of state.killsAtLifeStart.keys()) if (!internals.players.has(id)) state.killsAtLifeStart.delete(id);
    }
    // Ein Map-Größenvergleich pro Tick; nachgereichte Vorladungen sind selten.
    if (state.pendingSeed.size > 0) applyPendingSeeds(game, state);
  }) as T['step'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    // Beim Verlassen noch einsammeln, was die Engine zuletzt vergeben hat –
    // danach ist ihr Fortschritt weg.
    collectAchievementUnlocks(game, state);
    // Auch wer nie stirbt, hinterlässt seinen Lauf: Tab schließen ist der
    // normale Ausstieg, und der beste Lauf einer Sitzung endet oft lebend --
    // das ist ausgerechnet der Spieler, der gut war (Befund 52; dieselbe
    // Lücke war in sessions.ts:539 schon erkannt, nur die Bestenliste ging
    // weiter leer aus).
    const leaving = internals.players.get(id);
    if (leaving && !leaving.isBot && !leaving.dead && Math.round(leaving.score) > 0) {
      const now = Date.now();
      const startedAt = state.lifeStartedAt.get(id);
      enqueue(state, {
        playerName: leaving.name,
        score: Math.max(0, Math.round(leaving.score)),
        level: Math.max(1, Math.round(leaving.level)),
        playerClass: leaving.playerClass,
        kills: Math.max(0, Math.round(leaving.kills - (state.killsAtLifeStart.get(id) ?? 0))),
        bestStreak: Math.max(0, Math.round(Math.max(leaving.bestStreak, leaving.streak))),
        durationSeconds: startedAt === undefined ? 0 : Math.round(Math.max(0, now - startedAt) / 100) / 10,
        userId: state.accounts.get(id) ?? null
      });
    }
    state.lifeStartedAt.delete(id);
    state.killsAtLifeStart.delete(id);
    state.accounts.delete(id);
    state.pendingSeed.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  const flushIntervalMs = options.flushIntervalMs
    ?? integerEnvironment('PERSISTENCE_FLUSH_MS', DEFAULT_FLUSH_INTERVAL_MS, 500, 120_000);
  state.timer = setInterval(() => {
    // Sammeln und schreiben laufen im selben Intervall – beides außerhalb der
    // Simulation.
    collectAchievementUnlocks(game, state);
    void flush(state);
  }, flushIntervalMs);
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
