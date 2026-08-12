import type { Request, RequestHandler, Response } from 'express';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, type PlayerClass } from '@project-maze/shared';
import { authStatus, verifyAuthToken } from './auth.js';
import { MazeGame } from './game.js';
import { leaderboard, persistenceStats } from './persistence.js';
import { sessionsClient, sessionsStats, type ClassDayRow, type DailyRow } from './sessions.js';

/**
 * Admin-Portal – Serverteil.
 *
 * Sams Auftrag: „damit ich immer im überblick habe ob wir neue spieler haben
 * etc". Das Portal beantwortet drei Fragen, und die Routen hier sind nach ihnen
 * geschnitten:
 *
 * 1. **Läuft es gerade?** Spieler online, Tick-Gesundheit, Fehlerzähler,
 *    ausgelieferter Stand, Feature-Schalter. Kommt aus dem Prozess selbst.
 * 2. **Wachsen wir?** Spieler je Tag, davon neu, Sitzungen, Spielzeit, Konten.
 *    Kommt aus `sessions`/`devices` (Migration 0005).
 * 3. **Wie wird gespielt?** Klassennutzung, erreichte Level, Rundendauer.
 *    Kommt aus `runs`.
 *
 * ## Zugang
 *
 * Google-Login plus Allowlist: `ADMIN_USER_IDS` enthält die Konto-IDs, die
 * hereindürfen. Ist die Liste leer, kommt **niemand** hinein – eine leere
 * Allowlist ist eine geschlossene Tür, keine offene.
 *
 * Das Henne-Ei-Problem („welche ID ist meine?") löst `GET /admin/api/session`:
 * Die Route braucht selbst keine Adminrechte und nennt jedem angemeldeten
 * Konto seine eigene ID. Damit kann Sam sich einmal anmelden, seine ID ablesen
 * und sie in Railway eintragen.
 */

/** Kommagetrennte Konto-IDs mit Zugang zum Portal. */
export const ADMIN_IDS_ENV = 'ADMIN_USER_IDS';
/** So lange gelten Datenbankantworten als frisch. Das Portal pollt. */
const DEFAULT_CACHE_MS = 15_000;
/** Größte Zeitspanne, die eine Anfrage aufmachen darf. */
const MAX_DAYS = 180;
const DEFAULT_DAYS = 30;
/** Obergrenze der Spielerliste – die Antwort soll klein bleiben. */
const MAX_PLAYER_ROWS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Liest die Allowlist. Ungültige Einträge werden verworfen statt zu einem
 * Zugang zu führen, der nie greift – ein Tippfehler in einer UUID soll auffallen.
 */
export function adminUserIds(raw = process.env[ADMIN_IDS_ENV]): Set<string> {
  const ids = new Set<string>();
  for (const part of (raw ?? '').split(',')) {
    const value = part.trim().toLowerCase();
    if (UUID_PATTERN.test(value)) ids.add(value);
  }
  return ids;
}

export interface AdminIdentity {
  authEnabled: boolean;
  /** Anzahl gültiger Einträge in der Allowlist – nie die IDs selbst. */
  allowlistSize: number;
  userId: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

/**
 * Wer ist das? Wirft nie und verrät nichts: Ohne gültiges Token bleibt `userId`
 * leer, mit gültigem Token nennt die Antwort genau die eigene ID.
 */
export async function identify(request: Request): Promise<AdminIdentity> {
  const status = authStatus();
  const allowed = adminUserIds();
  const header = request.header('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const user = token ? await verifyAuthToken(token) : null;
  return {
    authEnabled: status.enabled,
    allowlistSize: allowed.size,
    userId: user?.userId ?? null,
    displayName: user?.displayName ?? null,
    isAdmin: user !== null && allowed.has(user.userId.toLowerCase())
  };
}

/**
 * Torwächter für alles außer `/admin/api/session`.
 *
 * Die Fehlermeldungen sind bewusst unterschiedlich und ausführlich: Dieses
 * Portal hat genau einen Benutzer, und wenn der nicht hereinkommt, soll er
 * lesen können warum – ein pauschales 403 hätte hier niemanden geschützt,
 * sondern nur Sam eine halbe Stunde gekostet.
 */
export const adminGuard: RequestHandler = (request, response, next) => {
  void identify(request).then((identity) => {
    if (identity.isAdmin) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    if (!identity.authEnabled) {
      response.status(503).json({
        error: 'auth-disabled',
        message: 'Der Login ist auf diesem Server aus. AUTH_ENABLED=true setzen und neu starten.'
      });
      return;
    }
    if (!identity.userId) {
      response.status(401).json({ error: 'not-signed-in', message: 'Nicht angemeldet.' });
      return;
    }
    if (identity.allowlistSize === 0) {
      response.status(403).json({
        error: 'allowlist-empty',
        message: `Es ist kein Admin eingetragen. Deine Konto-ID ist ${identity.userId} – trage sie in ${ADMIN_IDS_ENV} ein.`,
        userId: identity.userId
      });
      return;
    }
    response.status(403).json({
      error: 'not-admin',
      message: `Dieses Konto hat keinen Zugang. Deine Konto-ID ist ${identity.userId}.`,
      userId: identity.userId
    });
  }).catch(() => {
    response.status(500).json({ error: 'auth-failed', message: 'Prüfung fehlgeschlagen.' });
  });
};

/** Live-Angaben, die nur `index.ts` kennt (Feature-Schalter, Rate-Limits …). */
export interface AdminLiveSource {
  (): Record<string, unknown>;
}

export interface AdminOptions {
  game: MazeGame;
  live: AdminLiveSource;
  cacheMs?: number;
}

interface Summary {
  players: number;
  newPlayers: number;
  sessions: number;
  accounts: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  avgSessionSeconds: number;
}

const leer = (): Summary => ({
  players: 0, newPlayers: 0, sessions: 0, accounts: 0,
  runs: 0, kills: 0, totalSeconds: 0, avgSessionSeconds: 0
});

/**
 * Fasst Tageszeilen zusammen.
 *
 * **Wichtig – und der Grund für den Kommentar:** `players` ist über mehrere
 * Tage eine **Summe der Tageswerte**, keine Anzahl unterschiedlicher Menschen.
 * Wer an drei Tagen spielt, zählt dreimal. Für „wie viele verschiedene Leute
 * waren diesen Monat da" wäre ein `count(distinct …)` über den ganzen Zeitraum
 * nötig; das kann die Tages-View nicht liefern, und eine zweite View dafür
 * wäre eine zweite Wahrheit. Das Portal schreibt deshalb „Spielertage" dran.
 * Einzig `newPlayers` ist über jeden Zeitraum exakt: Ein Gerät ist genau an
 * einem Tag neu.
 */
export function summarize(rows: readonly DailyRow[]): Summary {
  const summary = leer();
  for (const row of rows) {
    summary.players += row.players;
    summary.newPlayers += row.newPlayers;
    summary.sessions += row.sessions;
    summary.accounts += row.accounts;
    summary.runs += row.runs;
    summary.kills += row.kills;
    summary.totalSeconds += row.totalSeconds;
  }
  summary.avgSessionSeconds = summary.sessions > 0
    ? Math.round(summary.totalSeconds / summary.sessions * 10) / 10
    : 0;
  return summary;
}

export interface ClassUsage {
  playerClass: string;
  label: string;
  branch: string;
  runs: number;
  share: number;
  avgLevel: number;
  avgScore: number;
  avgSeconds: number;
  kills: number;
  bestScore: number;
  bestLevel: number;
}

const CLASS_IDS = new Set<string>(PLAYER_CLASS_IDS);

/**
 * Rechnet Tagessummen je Klasse in Mittelwerte um. Aus Summen zu mitteln ist
 * der Grund, warum die View Summen liefert: Der Mittelwert von Tagesmittel-
 * werten wäre falsch gewichtet (ein Tag mit zwei Runs zählte so viel wie einer
 * mit zweihundert).
 */
export function foldClassUsage(rows: readonly ClassDayRow[]): ClassUsage[] {
  const merged = new Map<string, ClassDayRow>();
  for (const row of rows) {
    if (!CLASS_IDS.has(row.playerClass)) continue;
    const current = merged.get(row.playerClass);
    if (!current) {
      merged.set(row.playerClass, { ...row });
      continue;
    }
    current.runs += row.runs;
    current.levelSum += row.levelSum;
    current.scoreSum += row.scoreSum;
    current.kills += row.kills;
    current.seconds += row.seconds;
    current.bestScore = Math.max(current.bestScore, row.bestScore);
    current.bestLevel = Math.max(current.bestLevel, row.bestLevel);
  }
  const total = [...merged.values()].reduce((sum, row) => sum + row.runs, 0);
  return [...merged.values()]
    .map((row) => {
      const definition = CLASS_DEFINITIONS[row.playerClass as PlayerClass];
      return {
        playerClass: row.playerClass,
        label: definition?.label ?? row.playerClass,
        branch: definition?.branch ?? 'core',
        runs: row.runs,
        share: total > 0 ? Math.round(row.runs / total * 1000) / 10 : 0,
        avgLevel: row.runs > 0 ? Math.round(row.levelSum / row.runs * 10) / 10 : 0,
        avgScore: row.runs > 0 ? Math.round(row.scoreSum / row.runs) : 0,
        avgSeconds: row.runs > 0 ? Math.round(row.seconds / row.runs * 10) / 10 : 0,
        kills: row.kills,
        bestScore: row.bestScore,
        bestLevel: row.bestLevel
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

/** Klassen, die noch nie jemand gespielt hat – für Sam die interessantere Hälfte. */
export function unusedClasses(usage: readonly ClassUsage[]): string[] {
  const seen = new Set(usage.filter((entry) => entry.runs > 0).map((entry) => entry.playerClass));
  return PLAYER_CLASS_IDS.filter((id) => !seen.has(id)).map((id) => CLASS_DEFINITIONS[id].label);
}

const dayParameter = (raw: unknown): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.max(1, Math.min(MAX_DAYS, parsed));
};

/**
 * Zeilen ab einem Stichtag – **nach Zeit verglichen, nicht nach Zeichen**.
 *
 * Der naheliegende Weg `row.day >= abIso` ist genau hier eine Falle, und sie
 * hat zugeschlagen: PostgREST liefert `timestamptz` als
 * `2026-08-11T00:00:00+00:00`, `toISOString()` schreibt
 * `2026-08-11T00:00:00.000Z`. Zeichenweise verglichen ist `+` (43) kleiner als
 * `.` (46) – die Zeile von HEUTE fällt damit aus dem Filter für heute heraus.
 *
 * Die Folge war eine Anzeige, die jeden Tag „0 Spieler heute" zeigte, direkt
 * neben einem Zeitraum-Wert, der denselben Tag mitzählt (dort filtert Postgres,
 * nicht JavaScript). Wer die Kacheln liest, schliesst daraus das Falsche über
 * genau die Frage, für die es das Portal gibt.
 *
 * Unlesbare Zeitstempel fallen heraus statt hinein: Lieber eine Zeile zu wenig
 * als eine Kachel, die Müll addiert.
 */
export function zeilenAb<T extends { day: string }>(zeilen: readonly T[], abIso: string): T[] {
  const grenze = Date.parse(abIso);
  if (!Number.isFinite(grenze)) return [...zeilen];
  return zeilen.filter((zeile) => {
    const zeitpunkt = Date.parse(zeile.day);
    return Number.isFinite(zeitpunkt) && zeitpunkt >= grenze;
  });
}

/** Mitternacht UTC vor `days` Tagen – der Startpunkt jeder Zeitraumabfrage. */
export function sinceIso(days: number, now = Date.now()): string {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString();
};

interface CacheEntry { value: unknown; fetchedAt: number }

/**
 * Baut die Routen. `live` kommt von außen, damit dieses Modul nichts über die
 * Feature-Schalter und den Rate-Limiter aus `index.ts` wissen muss.
 */
export function createAdminRoutes(options: AdminOptions): {
  session: RequestHandler;
  overview: RequestHandler;
  players: RequestHandler;
} {
  const { game, live } = options;
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const cache = new Map<string, CacheEntry>();

  const cached = async <T>(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> => {
    const hit = cache.get(key);
    if (hit && now - hit.fetchedAt < cacheMs) return hit.value as T;
    const value = await load();
    cache.set(key, { value, fetchedAt: now });
    // Der Cache wächst nur mit der Zahl der Zeiträume, die jemand anfragt –
    // aber ein Deckel kostet nichts und schließt die Frage.
    if (cache.size > 32) cache.delete([...cache.keys()][0]!);
    return value;
  };

  const session: RequestHandler = (request, response) => {
    void identify(request).then((identity) => {
      response.setHeader('Cache-Control', 'no-store');
      response.json(identity);
    }).catch(() => {
      response.status(500).json({ error: 'auth-failed' });
    });
  };

  const overview: RequestHandler = (request: Request, response: Response) => {
    const days = dayParameter(request.query['days']);
    response.setHeader('Cache-Control', 'no-store');
    void (async () => {
      const client = sessionsClient(game);
      const base = {
        live: live(),
        persistence: persistenceStats(game),
        sessions: sessionsStats(game),
        days
      };
      if (!client) {
        // Ohne Datenbank ist das Portal nicht kaputt, sondern nur halb: Der
        // Live-Teil steht, der Verlauf fehlt. Genau das sagt die Antwort.
        response.json({
          ...base,
          database: false,
          hint: 'Ohne SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY gibt es keinen Verlauf – nur die Live-Werte.',
          daily: [], today: leer(), window: leer(), classes: [], unusedClasses: [], top: []
        });
        return;
      }
      const [daily, classes, top] = await Promise.all([
        cached(`daily:${days}`, () => client.daily(sinceIso(days))),
        cached(`classes:${days}`, () => client.classDaily(sinceIso(days))),
        cached('top', () => leaderboard(game, 10))
      ]);
      const heute = sinceIso(1);
      const usage = foldClassUsage(classes);
      response.json({
        ...base,
        database: true,
        daily,
        today: summarize(zeilenAb(daily, heute)),
        window: summarize(daily),
        classes: usage,
        unusedClasses: unusedClasses(usage),
        top
      });
    })().catch((error: unknown) => {
      response.status(502).json({
        error: 'database-failed',
        message: error instanceof Error ? error.message : String(error)
      });
    });
  };

  const players: RequestHandler = (request: Request, response: Response) => {
    const limitRaw = Number.parseInt(String(request.query['limit'] ?? ''), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_PLAYER_ROWS, limitRaw)) : 50;
    const sort = request.query['sort'] === 'new' ? 'first_seen' : 'last_seen';
    response.setHeader('Cache-Control', 'no-store');
    void (async () => {
      const client = sessionsClient(game);
      if (!client) {
        response.json({ database: false, players: [], total: 0 });
        return;
      }
      const [rows, total] = await Promise.all([
        cached(`devices:${sort}:${limit}`, () => client.devices(sort, limit)),
        cached('devices:count', () => client.countDevices())
      ]);
      response.json({ database: true, players: rows, total });
    })().catch((error: unknown) => {
      response.status(502).json({
        error: 'database-failed',
        message: error instanceof Error ? error.message : String(error)
      });
    });
  };

  return { session, overview, players };
}
