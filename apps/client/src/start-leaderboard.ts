import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';

/**
 * Bestenliste auf dem Startscreen (`GET /leaderboard`).
 *
 * Der Endpunkt antwortet mit 404, solange keine Persistenz konfiguriert ist –
 * dann bleibt das Panel schlicht aus. Ein Fehlertext auf dem Startscreen wäre
 * für Spieler bedeutungslos, es ist kein Zustand, den sie beheben können.
 */

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

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  cachedAt?: string;
  cacheSeconds?: number;
}

export interface OriginLike {
  protocol: string;
  hostname: string;
  host: string;
}

/** Wie viele Einträge geholt werden (der Server deckelt selbst auf 50). */
export const LEADERBOARD_LIMIT = 50;
/** So viele stehen ohne Scrollen im Panel. */
export const LEADERBOARD_VISIBLE = 10;

/**
 * Spiegelt die Adresslogik der WebSocket-Verbindung: im Dev-Modus läuft der
 * Spielserver auf 2567 neben Vite, in Produktion auf derselben Origin.
 */
export function leaderboardUrl(origin: OriginLike, dev: boolean, limit = LEADERBOARD_LIMIT): string {
  const base = dev ? `${origin.protocol}//${origin.hostname}:2567` : `${origin.protocol}//${origin.host}`;
  return `${base}/leaderboard?limit=${limit}`;
}

const numberFormat = new Intl.NumberFormat('de-DE');

export function formatScore(score: number): string {
  return numberFormat.format(Math.max(0, Math.round(score)));
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
}

/** Serverwerte sind Strings – unbekannte Klassen dürfen die Liste nicht sprengen. */
export function classLabel(playerClass: string): string {
  const definition = CLASS_DEFINITIONS[playerClass as PlayerClass];
  return definition ? definition.label : playerClass;
}

/** Nimmt nur an, was auch anzeigbar ist – ein halbes Objekt zeigt sonst „undefined“. */
export function usableEntries(payload: unknown): LeaderboardEntry[] {
  const entries = (payload as LeaderboardResponse | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry): entry is LeaderboardEntry =>
    Boolean(entry)
    && typeof entry.playerName === 'string'
    && entry.playerName.length > 0
    && Number.isFinite(entry.score)
    && Number.isFinite(entry.rank));
}

export class StartLeaderboard {
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  /** Kurzhinweis am Navigationseintrag; seit Befund 2 nicht mehr im Panel. */
  private readonly meta: HTMLElement | null;
  /** Erklärt die leere Seite, statt sie leer zu lassen. */
  private readonly empty: HTMLElement | null;

  constructor(root: HTMLElement) {
    this.panel = root.querySelector<HTMLElement>('#start-board')!;
    this.list = this.panel.querySelector<HTMLElement>('[data-board-list]')!;
    this.meta = root.querySelector<HTMLElement>('[data-board-meta]');
    this.empty = this.panel.querySelector<HTMLElement>('[data-board-empty]');
  }

  /**
   * Lädt die Liste. Schlägt es fehl, bleibt der erklärende Satz stehen – seit
   * die Bestenliste eine eigene Seite hat, wäre eine leere Fläche ein Fehler,
   * kein dezenter Rückzug.
   */
  async load(fetchImpl: typeof fetch = fetch.bind(window)): Promise<void> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetchImpl(
        leaderboardUrl(window.location, import.meta.env.DEV, LEADERBOARD_LIMIT),
        { signal: controller.signal, headers: { accept: 'application/json' } }
      );
      /*
       * 404 heisst „gibt es hier nicht", alles andere heisst „gibt es, aber".
       *
       * Der Server antwortet nur ohne konfigurierte Persistenz mit 404
       * (`persistence.ts`). Ein leeres Ergebnis mit 200 bedeutet dagegen: Die
       * Bestenliste laeuft, es hat nur noch niemand einen Lauf beendet -- der
       * Normalfall am ersten Tag. Beides fiel hier zusammen, und der Satz
       * „auf diesem Server noch nicht eingerichtet" blieb stehen. Wer ihn
       * liest, glaubt, sein Lauf zaehle ohnehin nicht.
       */
      if (response.status === 404) return;
      if (!response.ok) return;
      const eintraege = usableEntries(await response.json());
      if (eintraege.length === 0) {
        this.zeigeLeer('Noch kein Lauf in der Bestenliste – deiner kann der erste sein.');
        return;
      }
      this.render(eintraege);
    } catch {
      /* Kein Netz, kein Endpunkt, Zeitüberschreitung: Panel bleibt aus. */
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private render(entries: LeaderboardEntry[]): void {
    if (entries.length === 0) return;
    this.list.replaceChildren();
    for (const entry of entries.slice(0, LEADERBOARD_LIMIT)) {
      const row = document.createElement('li');
      const rank = document.createElement('b');
      const name = document.createElement('span');
      const detail = document.createElement('small');
      const score = document.createElement('strong');
      rank.textContent = String(entry.rank);
      name.textContent = entry.playerName;
      detail.textContent = `${classLabel(entry.playerClass)} · L${entry.level} · ${formatDuration(entry.durationSeconds)}`;
      score.textContent = formatScore(entry.score);
      row.append(rank, name, detail, score);
      this.list.append(row);
    }
    const anzahl = Math.min(entries.length, LEADERBOARD_LIMIT);
    if (this.meta) this.meta.textContent = `TOP ${anzahl}`;
    if (this.empty) this.empty.hidden = true;
    this.panel.hidden = false;
    this.markScrollable();
  }

  /**
   * Die Bestenliste laeuft, ist aber leer. Das ist kein Fehler und keine
   * fehlende Einrichtung, sondern eine Einladung.
   */
  private zeigeLeer(text: string): void {
    if (this.empty) {
      this.empty.textContent = text;
      this.empty.hidden = false;
    }
    if (this.meta) this.meta.textContent = 'NOCH LEER';
    this.panel.hidden = false;
  }

  /** Der Verlauf am unteren Rand darf nur erscheinen, wenn es wirklich weitergeht. */
  private markScrollable(): void {
    this.panel.classList.toggle('is-scrollable', this.list.scrollHeight > this.list.clientHeight + 1);
  }
}
