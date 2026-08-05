import {
  DEFAULT_CHOICE,
  DEFAULT_TIER,
  QUALITY_LABELS,
  QualityProbe,
  autoTier,
  effectiveTier,
  isQualityChoice,
  readChoice,
  type QualityChoice,
  type QualityTier
} from './quality';

const STORAGE_KEY = 'project-maze-quality';

export interface QualityHost {
  setQuality(tier: QualityTier): void;
}

/**
 * Grafik-Auswahl und Vollbild im Startscreen (R1/R4).
 *
 * Die Automatik misst im laufenden Spiel und stuft eine Stufe hoch oder runter.
 * Sobald jemand selbst wählt, misst sie weiter, greift aber nicht mehr ein –
 * eine Automatik, die eine getroffene Entscheidung überschreibt, wäre ein
 * Fehler und kein Komfort.
 */
export class QualityControl {
  private readonly select: HTMLSelectElement;
  private readonly fullscreen: HTMLButtonElement;
  private readonly probe = new QualityProbe();
  private choice: QualityChoice = DEFAULT_CHOICE;
  private automatic: QualityTier = DEFAULT_TIER;
  private lastFrame = performance.now();

  constructor(
    root: HTMLElement,
    private readonly host: QualityHost,
    private readonly playing: () => boolean,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage
  ) {
    this.select = root.querySelector<HTMLSelectElement>('#quality-select')!;
    this.fullscreen = root.querySelector<HTMLButtonElement>('#fullscreen-toggle')!;
    this.choice = readChoice(this.readStored());

    for (const wert of ['auto', 'high', 'mid', 'low'] as QualityChoice[]) {
      const option = document.createElement('option');
      option.value = wert;
      option.textContent = QUALITY_LABELS[wert];
      this.select.append(option);
    }
    this.select.value = this.choice;
    this.select.addEventListener('change', () => {
      const gewaehlt = this.select.value;
      this.choice = isQualityChoice(gewaehlt) ? gewaehlt : DEFAULT_CHOICE;
      this.store(this.choice);
      this.apply();
    });

    this.setupFullscreen();
    this.apply();
    requestAnimationFrame(this.frame);
  }

  /** Stufe, mit der der Renderer starten soll (Antialias und Auflösung). */
  static initialTier(storage: Pick<Storage, 'getItem'> = window.localStorage): QualityTier {
    let gespeichert: string | null = null;
    try {
      gespeichert = storage.getItem(STORAGE_KEY);
    } catch {
      /* Privater Modus ohne Speicher: Automatik. */
    }
    return effectiveTier(readChoice(gespeichert), DEFAULT_TIER);
  }

  private readStored(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private store(choice: QualityChoice): void {
    try {
      this.storage.setItem(STORAGE_KEY, choice);
    } catch {
      /* Ohne Speicher gilt die Wahl nur für diese Sitzung. */
    }
  }

  private apply(): void {
    this.host.setQuality(effectiveTier(this.choice, this.automatic));
  }

  private readonly frame = (jetzt: number): void => {
    const delta = (jetzt - this.lastFrame) / 1000;
    this.lastFrame = jetzt;
    requestAnimationFrame(this.frame);
    // Erst im Spiel messen: Der Startscreen zeichnet fast nichts, seine
    // Bildrate sagt nichts über das Gefecht aus.
    if (!this.playing() || document.hidden) {
      this.probe.reset();
      return;
    }
    const fps = this.probe.push(delta);
    if (fps === null) return;
    const naechste = autoTier(fps, this.automatic);
    if (naechste === this.automatic) return;
    this.automatic = naechste;
    if (this.choice === 'auto') this.apply();
  };

  /**
   * Vollbild über die Fullscreen-API. F11 macht der Browser selbst – der
   * Renderer hört auf beide Wege (`resize` und `fullscreenchange`).
   * Ohne API-Unterstützung bleibt der Knopf aus, statt ins Leere zu führen.
   */
  private setupFullscreen(): void {
    const moeglich = typeof document.documentElement.requestFullscreen === 'function';
    this.fullscreen.hidden = !moeglich;
    if (!moeglich) return;
    const beschriften = (): void => {
      this.fullscreen.textContent = document.fullscreenElement ? 'VOLLBILD BEENDEN' : 'VOLLBILD';
    };
    this.fullscreen.addEventListener('click', () => {
      void (document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
      ).catch(() => {
        /* Vom Browser abgelehnt (Berechtigung, iframe): Knopf bleibt, Zustand unverändert. */
      });
    });
    document.addEventListener('fullscreenchange', beschriften);
    beschriften();
  }
}
