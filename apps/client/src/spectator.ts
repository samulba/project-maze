import type { WorldSnapshot } from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;

/**
 * Hinweis, solange der Server einen Zuschauer-Blick vorgibt.
 *
 * Die Kamera folgt dem beobachteten Spieler (Renderer), `selfId` bleibt der
 * eigene Tank – Death-Screen und Respawn ändern sich dadurch nicht. Der
 * Hinweis muss über dem Death-Screen liegen, weil man beim Zuschauen tot ist.
 */
export class SpectatorBanner {
  private readonly banner: HTMLElement;
  private shownName: string | null = null;

  constructor(root: HTMLElement) {
    this.banner = document.createElement('div');
    this.banner.className = 'spectator-banner';
    this.banner.hidden = true;
    this.banner.setAttribute('role', 'status');
    (root.querySelector<HTMLElement>('#hud') ?? root).append(this.banner);
  }

  update(snapshot: WorldSnapshot): void {
    const name = spectatedName(snapshot);
    if (name === this.shownName) return;
    this.shownName = name;
    if (!name) {
      this.banner.hidden = true;
      return;
    }
    this.banner.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'DU SIEHST';
    const who = document.createElement('b');
    who.textContent = name;
    const suffix = document.createElement('span');
    suffix.textContent = 'ZU';
    this.banner.append(label, who, suffix);
    this.banner.hidden = false;
  }

  reset(): void {
    this.shownName = null;
    this.banner.hidden = true;
  }
}

/**
 * Name des beobachteten Spielers, oder `null`, wenn gerade nicht zugeschaut
 * wird. Der Zielspieler steckt garantiert in `players` – fehlt er trotzdem
 * (etwa direkt nach dem Verlassen), bleibt der Hinweis lieber aus.
 */
export function spectatedName(snapshot: WorldSnapshot): string | null {
  const name = spectatedPlayer(snapshot)?.name?.trim();
  return name ? name.toUpperCase() : null;
}

/**
 * Der beobachtete Spieler selbst – der Punkt, um den sich beim Zuschauen alles
 * dreht.
 *
 * Der Renderer zieht daraus schon die richtige Konsequenz (`camera = spectatorId
 * ?? self`). Der Radar tat es nicht: Er rechnete gegen `self.position`, also
 * gegen die eigene **Leiche**. Der Server baut den Snapshot eines Toten aber
 * aus der Perspektive des Killers – Culling und Sichtfenster hängen an dessen
 * Position. Beides zusammen ergab einen Radar, der auf einer Stelle klebt, an
 * der niemand mehr ist, und dessen Fläche leer bleibt, weil die gelieferten
 * Entitäten alle woanders sind.
 */
export function spectatedPlayer(snapshot: WorldSnapshot): WorldSnapshot['players'][number] | null {
  const targetId = (snapshot as ExtendedSnapshot).spectatorTargetId;
  if (!targetId || targetId === snapshot.selfId) return null;
  return snapshot.players.find((player) => player.id === targetId) ?? null;
}
