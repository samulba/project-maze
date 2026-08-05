import type { WorldSnapshot } from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { AchievementQueue, achievementInfo } from './achievements';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;

/**
 * Zeigt frisch freigeschaltete Achievements als kleines Popup in der linken
 * Spalte – dieselbe Ecke wie der Killfeed, aus der Mitte heraus. Der Server
 * schickt `freshAchievements` nur, wenn wirklich etwas dazugekommen ist.
 */
export class AchievementPopups {
  private readonly queue = new AchievementQueue();
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private shownId: string | null = null;

  constructor(root: HTMLElement) {
    this.card = document.createElement('div');
    this.card.className = 'achievement-popup';
    this.card.hidden = true;
    this.card.setAttribute('role', 'status');
    this.card.innerHTML = `
      <span class="achievement-badge" aria-hidden="true">★</span>
      <span class="achievement-body">
        <b class="achievement-eyebrow">FREIGESCHALTET</b>
        <strong data-achievement-name></strong>
        <small data-achievement-text></small>
      </span>`;
    this.title = this.card.querySelector<HTMLElement>('[data-achievement-name]')!;
    this.text = this.card.querySelector<HTMLElement>('[data-achievement-text]')!;

    // In die linke Spalte, direkt unter den Killfeed – gleiche Ecke, gleiche
    // Lesereihenfolge, nichts liegt im Spielfeld.
    const column = root.querySelector<HTMLElement>('.top-left') ?? root.querySelector<HTMLElement>('#hud') ?? root;
    column.append(this.card);
  }

  update(snapshot: WorldSnapshot, now = performance.now()): void {
    this.queue.push((snapshot as ExtendedSnapshot).freshAchievements);
    this.render(now);
  }

  /** Verbindung weg: Wartendes verwerfen, Sichtbares sofort schließen. */
  reset(): void {
    // queue.reset() statt clearPending(): Sonst überlebt `current` in der
    // Warteschlange und das alte Popup taucht nach schnellem Reconnect wieder auf.
    this.queue.reset();
    this.hide();
  }

  private render(now: number): void {
    const id = this.queue.tick(now);
    if (id === null) {
      if (this.shownId !== null) this.hide();
      return;
    }
    if (id === this.shownId) return;
    const info = achievementInfo(id);
    if (!info) return;
    this.shownId = id;
    this.title.textContent = info.name;
    this.text.textContent = info.description;
    this.card.hidden = false;
    // Neustart der Einblend-Animation, auch wenn direkt das nächste Popup folgt.
    this.card.classList.remove('enter');
    void this.card.offsetWidth;
    this.card.classList.add('enter');
  }

  private hide(): void {
    this.shownId = null;
    this.card.hidden = true;
    this.card.classList.remove('enter');
  }
}
