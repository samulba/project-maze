import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { ACHIEVEMENT_CATALOG, type AchievementId, type AchievementInfo } from '@project-maze/shared/gameplay';
import type { OriginLike } from './start-leaderboard';

/**
 * Profil auf dem Startscreen (K2). Server: `GET /profile/:userId` und
 * `POST /profile` (siehe `docs/status/chat-04/07-profil-backend.md`).
 *
 * Reine Logik – Prüfen, Rechnen, Formatieren. Die Darstellung liegt in
 * `profile-panel.ts`, damit beides ohne DOM prüfbar bleibt.
 */

export interface ProfileStats {
  runs: number;
  bestScore: number;
  bestLevel: number;
  bestKills: number;
  bestStreak: number;
  longestRunSeconds: number;
  totalKills: number;
  totalSeconds: number;
  firstRunAt: string | null;
  lastRunAt: string | null;
  favoriteClass: PlayerClass | null;
  favoriteClassRuns: number;
  favoriteClassSeconds: number;
}

export interface UnlockedAchievement {
  id: AchievementId;
  name: string;
  description: string;
  unlockedAt: string;
}

export interface PublicProfile {
  userId: string;
  displayName: string | null;
  memberSince: string | null;
  stats: ProfileStats;
  achievements: UnlockedAchievement[];
}

/** Ein Eintrag der Galerie: der Katalog, angereichert um den eigenen Stand. */
export interface GalleryEntry extends AchievementInfo {
  unlockedAt: string | null;
}

/** Gleiche Adresslogik wie Bestenliste und WebSocket. */
export function profileUrl(origin: OriginLike, dev: boolean, userId: string): string {
  const base = dev ? `${origin.protocol}//${origin.hostname}:2567` : `${origin.protocol}//${origin.host}`;
  return `${base}/profile/${encodeURIComponent(userId)}`;
}

export function profileUpdateUrl(origin: OriginLike, dev: boolean): string {
  const base = dev ? `${origin.protocol}//${origin.hostname}:2567` : `${origin.protocol}//${origin.host}`;
  return `${base}/profile`;
}

const zahl = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const textOderNull = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/**
 * Nimmt nur an, was auch anzeigbar ist. Fehlende Zahlen werden zu 0 – ein
 * frisches Konto ohne Lauf hat schlicht überall Nullen, das ist kein Fehler.
 * Fehlt dagegen die Struktur selbst, bleibt das Panel aus.
 */
export function usableProfile(payload: unknown): PublicProfile | null {
  const roh = payload as Partial<PublicProfile> | null;
  if (!roh || typeof roh !== 'object') return null;
  if (typeof roh.userId !== 'string' || roh.userId.length === 0) return null;
  const stats = (roh.stats ?? {}) as Partial<ProfileStats>;
  const klasse = stats.favoriteClass;
  return {
    userId: roh.userId,
    displayName: textOderNull(roh.displayName),
    memberSince: textOderNull(roh.memberSince),
    stats: {
      runs: zahl(stats.runs),
      bestScore: zahl(stats.bestScore),
      bestLevel: zahl(stats.bestLevel),
      bestKills: zahl(stats.bestKills),
      bestStreak: zahl(stats.bestStreak),
      longestRunSeconds: zahl(stats.longestRunSeconds),
      totalKills: zahl(stats.totalKills),
      totalSeconds: zahl(stats.totalSeconds),
      firstRunAt: textOderNull(stats.firstRunAt),
      lastRunAt: textOderNull(stats.lastRunAt),
      // Eine Klasse, die dieser Client nicht kennt (Server neuer als Bundle),
      // wird verworfen statt als roher Bezeichner angezeigt.
      favoriteClass: typeof klasse === 'string' && klasse in CLASS_DEFINITIONS ? (klasse as PlayerClass) : null,
      favoriteClassRuns: zahl(stats.favoriteClassRuns),
      favoriteClassSeconds: zahl(stats.favoriteClassSeconds)
    },
    achievements: Array.isArray(roh.achievements)
      ? roh.achievements.filter((eintrag): eintrag is UnlockedAchievement =>
        Boolean(eintrag) && typeof eintrag.id === 'string' && eintrag.id in ACHIEVEMENT_CATALOG)
      : []
  };
}

/**
 * Volle Galerie: jedes Achievement aus dem Katalog, freigeschaltete zuerst
 * markiert. Nur die eigenen Freischaltungen zu zeigen wäre eine Liste, keine
 * Galerie – man sieht dann nicht, was es noch zu holen gibt.
 */
export function achievementGallery(unlocked: readonly UnlockedAchievement[]): GalleryEntry[] {
  const stand = new Map(unlocked.map((eintrag) => [eintrag.id, eintrag.unlockedAt]));
  return (Object.keys(ACHIEVEMENT_CATALOG) as AchievementId[]).map((id) => ({
    ...ACHIEVEMENT_CATALOG[id],
    unlockedAt: stand.get(id) ?? null
  }));
}

/** „seit August 2026", oder `null`, wenn der Server kein Datum kennt. */
export function formatMemberSince(iso: string | null): string | null {
  if (!iso) return null;
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return null;
  return `seit ${datum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`;
}

/**
 * Spielzeit über alle Läufe. Anders als `formatDuration` (ein einzelner Lauf,
 * Minuten und Sekunden) geht es hier um Stunden – Sekunden wären nur Rauschen.
 */
export function formatPlaytime(seconds: number): string {
  const gesamt = Math.max(0, Math.round(seconds));
  if (gesamt < 60) return `${gesamt}s`;
  const minuten = Math.floor(gesamt / 60);
  if (minuten < 60) return `${minuten}m`;
  return `${Math.floor(minuten / 60)}h ${String(minuten % 60).padStart(2, '0')}m`;
}

/** Lieblingsklasse als Zeile, oder `null`, solange keine feststeht. */
export function favoriteClassLine(stats: ProfileStats): string | null {
  if (!stats.favoriteClass) return null;
  const definition = CLASS_DEFINITIONS[stats.favoriteClass];
  const laeufe = stats.favoriteClassRuns;
  return laeufe > 0 ? `${definition.label} · ${laeufe} ${laeufe === 1 ? 'Lauf' : 'Läufe'}` : definition.label;
}

/**
 * Meldung zu einer Antwort auf `POST /profile`. Der Server ist wortkarg
 * (`202`, `400`, `401`, `404`, `429`) – hier steht, was das für den Spieler
 * bedeutet.
 */
export function updateMessage(status: number): { ok: boolean; title: string; text: string } {
  if (status === 202) return { ok: true, title: 'Name geändert', text: 'Dein Anzeigename wird gespeichert.' };
  if (status === 400) return { ok: false, title: 'Name nicht möglich', text: 'Der Name ist leer oder enthält nur Sonderzeichen.' };
  if (status === 401) return { ok: false, title: 'Nicht angemeldet', text: 'Melde dich neu an und versuche es noch einmal.' };
  if (status === 429) return { ok: false, title: 'Zu schnell', text: 'Zu viele Änderungen. Warte einen Moment.' };
  return { ok: false, title: 'Nicht gespeichert', text: 'Der Server hat den Namen gerade nicht angenommen.' };
}
