/**
 * Client-Perf-Telemetrie (R5). Spezifikation: `docs/status/chat-04/08-client-perf-telemetrie.md`.
 *
 * Gemessen werden Framedauern aus `requestAnimationFrame`, nicht ein
 * gemittelter FPS-Zähler: Ein Mittelwert versteckt genau die Ruckler, um die
 * es geht. Der Server nimmt einen Bericht pro Minute, anonym und ohne Token.
 *
 * Der Messteil ist bewusst frei von Browser-Zugriffen, damit er ohne DOM
 * prüfbar bleibt – `PerfWindow` bekommt Zahlen und gibt Zahlen zurück.
 */

export type DeviceClass = 'low' | 'mid' | 'high' | 'unknown';
export type RenderQuality = 'webgl' | 'webgl-kompat' | 'webgpu' | 'unknown';

export interface PerfReport {
  fpsP50: number;
  fpsP95: number;
  frameHangs: number;
  dpr: number;
  viewportW: number;
  viewportH: number;
  deviceClass: DeviceClass;
  quality: RenderQuality;
}

/** Ein Frame über 100 ms ist für das Auge ein Ruckler. */
const HANG_MS = 100;
/** Alles darüber ist kein Frame mehr, sondern eine Pause (Tab-Wechsel, Schlaf). */
const MAX_FRAME_MS = 5_000;
/** Ohne genug Stichproben ist jede Perzentil-Aussage geraten. */
const MIN_SAMPLES = 30;

const clampInt = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(value)));

/**
 * Bildrate am gewünschten Perzentil der **Framedauer**.
 *
 * Achtung, das ist der Punkt, an dem man sich vertut: Das 95. Perzentil der
 * Framedauer ist der langsame Rand, also die *kleinere* Bildrate. Deshalb gilt
 * immer `fpsP95 <= fpsP50`.
 */
export function fpsAtPercentile(frames: readonly number[], quantile: number): number {
  const sorted = [...frames].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  const duration = sorted[index] ?? 0;
  return duration > 0 ? 1000 / duration : 0;
}

/**
 * Ein Messfenster. Sammelt Framedauern, bis ein Bericht fällig ist – und
 * verwirft sich selbst, sobald der Tab im Hintergrund war: Browser drosseln
 * dort `requestAnimationFrame` auf etwa 1 Hz, das ergäbe erfundene 1-fps-Berichte.
 */
export class PerfWindow {
  private frames: number[] = [];
  private hangs = 0;
  private spoiled = false;

  /** Framedauer in Millisekunden. Unplausibles wird still verworfen. */
  push(deltaMs: number): void {
    if (!(deltaMs > 0) || deltaMs >= MAX_FRAME_MS) return;
    this.frames.push(deltaMs);
    if (deltaMs > HANG_MS) this.hangs += 1;
  }

  /** Der Tab war im Hintergrund – dieses Fenster taugt nicht mehr. */
  spoil(): void {
    this.spoiled = true;
  }

  reset(): void {
    this.frames = [];
    this.hangs = 0;
    this.spoiled = false;
  }

  get samples(): number {
    return this.frames.length;
  }

  get usable(): boolean {
    return !this.spoiled && this.frames.length >= MIN_SAMPLES;
  }

  /**
   * Fertiger Bericht oder `null`, wenn das Fenster nichts taugt. Alle Werte
   * liegen in den Grenzen, die der Server erzwingt – ein Bericht, den er mit
   * 400 ablehnt, wäre eine still verlorene Messung.
   */
  report(umgebung: {
    dpr: number;
    viewportW: number;
    viewportH: number;
    deviceClass: DeviceClass;
    quality: RenderQuality;
  }): PerfReport | null {
    if (!this.usable) return null;
    const median = fpsAtPercentile(this.frames, 0.5);
    const langsam = fpsAtPercentile(this.frames, 0.95);
    return {
      fpsP50: clampInt(median, 1, 240),
      // Der langsame Rand darf nie über dem Median liegen – bei sehr wenigen
      // Stichproben können beide auf denselben Frame zeigen.
      fpsP95: Math.min(clampInt(median, 1, 240), clampInt(langsam, 1, 240)),
      frameHangs: clampInt(this.hangs, 0, 100_000),
      dpr: Math.max(0.5, Math.min(8, Math.round(umgebung.dpr * 100) / 100)),
      viewportW: clampInt(umgebung.viewportW, 160, 20_000),
      viewportH: clampInt(umgebung.viewportH, 120, 20_000),
      deviceClass: umgebung.deviceClass,
      quality: umgebung.quality
    };
  }
}

/**
 * Grobe Geräteklasse aus drei Hinweisen. `deviceMemory` gibt es nur in
 * Chromium; fehlt es, entscheiden Kerne und Pixeldichte allein. Wird einmal
 * beim Start bestimmt, nicht je Bericht.
 */
export function deviceClassFrom(
  memory: number | undefined,
  cores: number | undefined,
  pixelRatio: number
): DeviceClass {
  if (memory === undefined && !cores) return 'unknown';
  const score =
    (memory === undefined ? 1 : memory >= 8 ? 2 : memory >= 4 ? 1 : 0)
    + (!cores ? 1 : cores >= 8 ? 2 : cores >= 4 ? 1 : 0)
    + ((pixelRatio || 1) >= 2 ? 1 : 0);
  return score >= 4 ? 'high' : score >= 2 ? 'mid' : 'low';
}

export function currentDeviceClass(): DeviceClass {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return deviceClassFrom(memory, navigator.hardwareConcurrency, window.devicePixelRatio || 1);
}

export interface PerfReporterOptions {
  /** Basis-URL des Servers, ohne abschließenden Schrägstrich. */
  baseUrl: string;
  /** Grafikweg, den der Renderer tatsächlich hochbekommen hat. */
  quality: () => RenderQuality;
  /** Läuft gerade eine Runde? Vorher wird gar nicht erst gemessen. */
  playing: () => boolean;
  /** Erst nach dieser Zeit in der Arena zählt die Messung (Shader, Ladezeit). */
  warmupMs?: number;
  intervalMs?: number;
}

/**
 * Verdrahtet Messung und Versand. Gibt eine Funktion zum Abschalten zurück –
 * gebraucht wird sie im Spiel nicht, aber ohne sie ließe sich das Ganze im
 * Test nicht sauber wieder loswerden.
 */
export function startPerfReporting(options: PerfReporterOptions): () => void {
  const warmup = options.warmupMs ?? 60_000;
  const interval = options.intervalMs ?? 60_000;
  const fenster = new PerfWindow();
  const geraeteklasse = currentDeviceClass();
  let laufBeginn: number | null = null;
  let letzterFrame = performance.now();
  let naechsterBericht = 0;
  let aktiv = true;

  const sichtbarkeit = (): void => {
    // Beim Weggehen UND beim Zurückkommen verwerfen: Der erste Frame nach dem
    // Wechsel ist Müll, und die gedrosselten Frames davor sind es auch.
    fenster.spoil();
    letzterFrame = performance.now();
  };
  document.addEventListener('visibilitychange', sichtbarkeit);

  const frame = (jetzt: number): void => {
    if (!aktiv) return;
    const delta = jetzt - letzterFrame;
    letzterFrame = jetzt;
    requestAnimationFrame(frame);

    if (!options.playing()) {
      laufBeginn = null;
      fenster.reset();
      return;
    }
    if (laufBeginn === null) {
      laufBeginn = jetzt;
      naechsterBericht = jetzt + warmup + interval;
      fenster.reset();
      return;
    }
    // Aufwärmphase: Frames zählen erst, wenn Shader und Nachladen durch sind.
    if (jetzt - laufBeginn < warmup) return;
    if (document.hidden) {
      fenster.spoil();
      return;
    }
    fenster.push(delta);
    if (jetzt < naechsterBericht) return;
    naechsterBericht = jetzt + interval;
    const bericht = fenster.report({
      dpr: window.devicePixelRatio || 1,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      deviceClass: geraeteklasse,
      quality: options.quality()
    });
    fenster.reset();
    if (bericht) sende(options.baseUrl, bericht);
  };
  requestAnimationFrame(frame);

  return () => {
    aktiv = false;
    document.removeEventListener('visibilitychange', sichtbarkeit);
  };
}

/** Fehler werden verschluckt: Telemetrie darf nie ein Spielproblem verursachen. */
function sende(baseUrl: string, bericht: PerfReport): void {
  void fetch(`${baseUrl}/client-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify(bericht)
  }).catch(() => {});
}
