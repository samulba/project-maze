/**
 * Schalter für die Client-Prediction im Startscreen (N2).
 *
 * Die Vorhersage ändert das Bewegungsgefühl grundlegend – sie steht deshalb
 * nach Regel 3 hinter einem Schalter mit **Standard aus**. Der Schalter sitzt
 * im Client statt in einer ENV-Variable, weil er damit ohne Deploy umlegbar ist
 * und sich beide Zustände direkt hintereinander vergleichen lassen; genau das
 * braucht eine Beurteilung, die am Ende „fühlt sich besser an" lautet.
 *
 * Er greift sofort, auch mitten im Spiel: Wer abschaltet, sieht ab dem nächsten
 * Snapshot wieder die interpolierte Serverposition.
 */

const STORAGE_KEY = 'project-maze-prediction';

/** Regel 3: Alles Riskante hinter einem Flag, Default aus. */
export const DEFAULT_PREDICTION = false;

/** Gespeicherte Wahl. Alles außer `on`/`off` fällt auf den Standard zurück. */
export function readPredictionChoice(raw: string | null): boolean {
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  return DEFAULT_PREDICTION;
}

export class PredictionToggle {
  private readonly input: HTMLInputElement;
  private value = DEFAULT_PREDICTION;

  constructor(
    root: HTMLElement,
    private readonly onChange: (enabled: boolean) => void,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage
  ) {
    this.input = root.querySelector<HTMLInputElement>('#prediction-toggle')!;
    this.value = readPredictionChoice(this.read());
    this.input.checked = this.value;
    this.input.addEventListener('change', () => {
      this.value = this.input.checked;
      this.store(this.value);
      this.onChange(this.value);
    });
    this.onChange(this.value);
  }

  get enabled(): boolean { return this.value; }

  private read(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private store(enabled: boolean): void {
    try {
      this.storage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      /* Ohne Speicher gilt die Wahl nur für diese Sitzung. */
    }
  }
}
