import { ACHIEVEMENT_CATALOG, type AchievementId, type AchievementInfo } from '@project-maze/shared/gameplay';

/**
 * Warteschlange für Achievement-Popups. Reine Logik – die Darstellung liegt in
 * `achievement-popups.ts`.
 *
 * Mehrere Freischaltungen können im selben Snapshot ankommen (etwa Level 45 und
 * 10.000 Punkte durch denselben Kill). Sie werden nacheinander gezeigt, statt
 * sich zu überlagern.
 */

/** Standzeit eines Popups in Millisekunden. */
export const ACHIEVEMENT_POPUP_MS = 4600;
/** Pause zwischen zwei Popups, damit der Wechsel sichtbar ist. */
export const ACHIEVEMENT_GAP_MS = 260;
/**
 * Obergrenze der Warteschlange. Der Katalog ist klein, aber ein fehlerhafter
 * Server soll den Client nicht mit Popups zumauern.
 */
export const ACHIEVEMENT_QUEUE_MAX = 8;

export function achievementInfo(id: AchievementId): AchievementInfo | null {
  return ACHIEVEMENT_CATALOG[id] ?? null;
}

export class AchievementQueue {
  private readonly pending: AchievementId[] = [];
  /** Schon gezeigt – ein Reconnect darf dieselbe Freischaltung nicht wiederholen. */
  private readonly seen = new Set<AchievementId>();
  private current: AchievementId | null = null;
  private currentUntil = 0;
  private nextAllowedAt = 0;

  /** Nimmt frische Freischaltungen an; Unbekanntes und Doppeltes fällt raus. */
  push(ids: readonly AchievementId[] | undefined): void {
    if (!ids) return;
    for (const id of ids) {
      if (!achievementInfo(id)) continue;
      if (this.seen.has(id) || this.pending.includes(id) || this.current === id) continue;
      if (this.pending.length >= ACHIEVEMENT_QUEUE_MAX) break;
      this.pending.push(id);
    }
  }

  /**
   * Schiebt die Warteschlange weiter. Gibt zurück, was jetzt zu sehen sein
   * soll – `null` bedeutet: nichts anzeigen.
   */
  tick(now: number): AchievementId | null {
    if (this.current !== null) {
      if (now < this.currentUntil) return this.current;
      this.current = null;
      this.nextAllowedAt = now + ACHIEVEMENT_GAP_MS;
    }
    if (now < this.nextAllowedAt) return null;
    const next = this.pending.shift();
    if (next === undefined) return null;
    this.current = next;
    this.currentUntil = now + ACHIEVEMENT_POPUP_MS;
    this.seen.add(next);
    return next;
  }

  /** Wartende Popups verwerfen – nach einem Verbindungsabbruch sind sie veraltet. */
  clearPending(): void {
    this.pending.length = 0;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get showing(): AchievementId | null {
    return this.current;
  }
}
