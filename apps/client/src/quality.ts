/**
 * Qualitätsstufen (MASTERPLAN R4).
 *
 * Drei Stufen, die an vier Stellschrauben drehen: Partikelmenge, Leucht-Effekte
 * im Canvas, Kantenglättung und Auflösungs-Deckel. Die Auswahl steht im
 * Startscreen; „auto" misst nach dem Start und stuft selbst ein.
 *
 * Reine Logik – kein DOM, kein PixiJS. Der Renderer holt sich die Werte, die
 * Einstufung ist eine Funktion über eine gemessene Bildrate.
 */

export type QualityTier = 'high' | 'mid' | 'low';
export type QualityChoice = QualityTier | 'auto';

export interface QualitySettings {
  /** Faktor auf jede Partikelmenge. */
  particleScale: number;
  /** Harte Obergrenze gleichzeitiger Partikel. */
  maxParticles: number;
  /** Mündungsblitze, Funken und Schockringe. */
  glow: boolean;
  /** Nur beim Start wirksam – ein laufender Kontext lässt sich nicht umstellen. */
  antialias: boolean;
  /** Obergrenze für `devicePixelRatio`. Der teuerste Hebel auf schwachen Geräten. */
  resolutionCap: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  high: { particleScale: 1, maxParticles: 360, glow: true, antialias: true, resolutionCap: 2 },
  mid: { particleScale: 0.6, maxParticles: 200, glow: true, antialias: true, resolutionCap: 1.5 },
  low: { particleScale: 0.25, maxParticles: 80, glow: false, antialias: false, resolutionCap: 1 }
};

export const QUALITY_LABELS: Record<QualityChoice, string> = {
  auto: 'Automatisch',
  high: 'Hoch',
  mid: 'Mittel',
  low: 'Niedrig'
};

/** Ohne eigene Wahl startet das Spiel in der Mitte und misst dann. */
export const DEFAULT_CHOICE: QualityChoice = 'auto';
export const DEFAULT_TIER: QualityTier = 'mid';
/** So lange wird gemessen, bevor die Automatik das erste Mal entscheidet. */
export const MEASURE_SECONDS = 10;

const ORDER: QualityTier[] = ['low', 'mid', 'high'];
/** Darunter ruckelt es sichtbar. */
export const DOWNGRADE_FPS = 30;
/** Darüber ist Luft für eine Stufe mehr. Der Abstand verhindert Pendeln. */
export const UPGRADE_FPS = 55;

export function isQualityChoice(value: unknown): value is QualityChoice {
  return value === 'auto' || value === 'high' || value === 'mid' || value === 'low';
}

/** Gespeicherte Wahl aus dem localStorage – Unsinn fällt auf `auto` zurück. */
export function readChoice(raw: string | null): QualityChoice {
  return isQualityChoice(raw) ? raw : DEFAULT_CHOICE;
}

/**
 * Eine Stufe rauf, eine runter oder bleiben – auf Basis der Bildrate im
 * letzten Messfenster. Bewusst je ein Schritt: Wer von „hoch" auf 20 fps
 * fällt, landet erst auf „mittel"; reicht das nicht, greift das nächste
 * Fenster. Ein Sprung auf „niedrig" wäre bei einem einzelnen Ruckler-Fenster
 * eine Überreaktion.
 */
export function autoTier(fps: number, current: QualityTier): QualityTier {
  const index = ORDER.indexOf(current);
  if (fps < DOWNGRADE_FPS) return ORDER[Math.max(0, index - 1)]!;
  if (fps > UPGRADE_FPS) return ORDER[Math.min(ORDER.length - 1, index + 1)]!;
  return current;
}

/** Welche Stufe gilt gerade – die Wahl selbst oder die der Automatik. */
export function effectiveTier(choice: QualityChoice, automatic: QualityTier): QualityTier {
  return choice === 'auto' ? automatic : choice;
}

/**
 * Sammelt Framedauern und liefert alle `MEASURE_SECONDS` eine Bildrate.
 *
 * Gemessen wird der Median, nicht der Mittelwert: Ein einzelner
 * Nachlade-Ruckler soll die Einstufung nicht kippen.
 */
export class QualityProbe {
  private frames: number[] = [];
  private elapsed = 0;

  constructor(private readonly windowSeconds: number = MEASURE_SECONDS) {}

  /** Gibt eine Bildrate zurück, sobald ein Fenster voll ist – sonst `null`. */
  push(deltaSeconds: number): number | null {
    if (!(deltaSeconds > 0) || deltaSeconds > 1) return null;
    this.frames.push(deltaSeconds);
    this.elapsed += deltaSeconds;
    if (this.elapsed < this.windowSeconds) return null;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.reset();
    return median > 0 ? 1 / median : null;
  }

  reset(): void {
    this.frames = [];
    this.elapsed = 0;
  }
}
