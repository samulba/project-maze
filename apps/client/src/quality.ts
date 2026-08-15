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
  /**
   * Schmuck an den Kugeln und Drohnen: Schweif, Streulicht, Glanzpunkt.
   *
   * Der Grund, warum es diese Schraube gibt, steht im Profil: Das JavaScript des
   * Clients kostet gemessen 46 ms je Sekunde – **drei Prozent** eines
   * 60-Hz-Budgets. Was schwache Geräte umbringt, ist nicht das Rechnen, sondern
   * die Fläche: Jede Kugel zeichnet vier Formen übereinander (Schweif,
   * Streulicht, Körper, Glanz), jede verglimmende noch zwei. Bei achtzig
   * Kugeln im Bild sind das über dreihundert gefüllte Flächen je Bild, von
   * denen genau eine je Kugel die Information trägt.
   *
   * Auf `low` bleibt der Körper. Der Rest ist Verzierung und fällt weg.
   */
  detail: boolean;
}

export const QUALITY_TIERS: Record<QualityTier, QualitySettings> = {
  high: { particleScale: 1, maxParticles: 360, glow: true, antialias: true, resolutionCap: 2, detail: true },
  mid: { particleScale: 0.6, maxParticles: 200, glow: true, antialias: true, resolutionCap: 1.5, detail: true },
  /*
   * `resolutionCap` unter 1: Das Bild wird kleiner gerechnet, als der Schirm
   * Punkte hat, und beim Anzeigen hochgezogen. 0,75 spart 44 % der Fläche –
   * der mit Abstand stärkste Hebel, den es gibt, und der einzige, der auch
   * dann noch wirkt, wenn alles andere schon aus ist.
   *
   * Vorher stand hier 1, und `pixelRatio()` klemmte zusätzlich mit
   * `Math.max(1, …)` nach unten ab: Die unterste Stufe rechnete also in voller
   * Schirmauflösung, und ein Gerät, dem `low` nicht reichte, hatte nichts mehr,
   * worauf es ausweichen konnte.
   */
  low: { particleScale: 0.25, maxParticles: 80, glow: false, antialias: false, resolutionCap: 0.75, detail: false }
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
/** So lange wird gemessen, bevor die Automatik nachjustiert. */
export const MEASURE_SECONDS = 10;
/**
 * Das ERSTE Fenster ist kurz.
 *
 * Zehn Sekunden bis zum ersten Urteil sind für ein starkes Gerät belanglos und
 * für ein schwaches die halbe Eingewöhnung: Wer mit 12 fps startet, spielt
 * zehn Sekunden lang das, was Sam als „abgehackt" beschreibt, bevor überhaupt
 * jemand hinsieht. Drei Sekunden reichen für ein belastbares Urteil – gemessen
 * wird der Median, nicht der Mittelwert, ein einzelner Ruckler kippt ihn also
 * nicht. Danach übernimmt das lange Fenster, weil dort Ruhe wichtiger ist als
 * Tempo.
 */
export const ERSTES_FENSTER_SEKUNDEN = 3;

const ORDER: QualityTier[] = ['low', 'mid', 'high'];
/** Darunter ruckelt es sichtbar. */
export const DOWNGRADE_FPS = 30;
/** Darüber ist Luft für eine Stufe mehr. Der Abstand verhindert Pendeln. */
export const UPGRADE_FPS = 55;
/**
 * Darunter ist es kein Ruckeln mehr, sondern unspielbar – dann geht es sofort
 * auf die unterste Stufe, ohne den Umweg über die mittlere.
 */
export const NOT_FPS = 20;

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
  // Zwei Stufen auf einmal, wenn es nicht knapp, sondern hoffnungslos ist.
  // Ein Schritt je Messfenster hiess: Ein Gerät mit 12 fps startet auf
  // „mittel", wartet zehn Sekunden auf „niedrig" – und hat die erste
  // Spielminute im Ruckeln verbracht. Der einzelne Schritt ist gegen
  // Pendeln gedacht, und dagegen hilft er weiter: NOT_FPS ist so tief, dass
  // dort niemand pendelt, der oben mitkommt.
  if (fps < NOT_FPS) return ORDER[0]!;
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
  /** Das erste Urteil kommt früher – siehe `ERSTES_FENSTER_SEKUNDEN`. */
  private erstesOffen = true;

  constructor(
    private readonly windowSeconds: number = MEASURE_SECONDS,
    private readonly erstesFenster: number = ERSTES_FENSTER_SEKUNDEN
  ) {}

  /** Die Länge des Fensters, das gerade läuft. */
  get fensterSekunden(): number {
    return this.erstesOffen ? Math.min(this.erstesFenster, this.windowSeconds) : this.windowSeconds;
  }

  /** Gibt eine Bildrate zurück, sobald ein Fenster voll ist – sonst `null`. */
  push(deltaSeconds: number): number | null {
    if (!(deltaSeconds > 0) || deltaSeconds > 1) return null;
    this.frames.push(deltaSeconds);
    this.elapsed += deltaSeconds;
    if (this.elapsed < this.fensterSekunden) return null;
    this.erstesOffen = false;
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
