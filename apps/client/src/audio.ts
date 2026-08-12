import { CLASS_DEFINITIONS, type PlayerClass, type ShapeKind } from '@project-maze/shared';
import type { ActiveModuleId } from '@project-maze/shared/gameplay';

/**
 * Klangprofil je Familie statt zweier handgepflegter Namenslisten.
 *
 * Die Listen (8 „schwere", 7 „schnelle" IDs) sind mit dem Klassenbaum nicht
 * mitgewachsen: 40 der 55 schießenden Klassen fielen auf denselben
 * Standardton zurück – SIEGE, TEMPEST, AEGIS und SPECTER komplett, und drei
 * RAPID-Klassen (vortex, vanguard, hailstorm) klangen wie ein Core statt wie
 * ihre Familie (Befund 42/67). `branch` steht an jeder Definition und kann
 * nicht veralten, wenn Klassen dazukommen.
 */
interface ShotProfile {
  frequency: number;
  duration: number;
  gain: number;
  type: OscillatorType;
  /** Tiefpass-Rauschen für die wuchtigen Familien; null = keins. */
  noise: { duration: number; gain: number; filter: number } | null;
}

const SHOT_PROFILES: Record<string, ShotProfile> = {
  core: { frequency: 175, duration: 0.06, gain: 0.026, type: 'triangle', noise: null },
  rapid: { frequency: 215, duration: 0.04, gain: 0.018, type: 'triangle', noise: null },
  precision: { frequency: 105, duration: 0.11, gain: 0.055, type: 'square', noise: { duration: 0.07, gain: 0.02, filter: 900 } },
  siege: { frequency: 88, duration: 0.13, gain: 0.05, type: 'square', noise: { duration: 0.09, gain: 0.022, filter: 620 } },
  impact: { frequency: 150, duration: 0.07, gain: 0.03, type: 'sawtooth', noise: null },
  specter: { frequency: 245, duration: 0.05, gain: 0.016, type: 'sine', noise: null },
  tempest: { frequency: 195, duration: 0.05, gain: 0.024, type: 'sawtooth', noise: null },
  aegis: { frequency: 135, duration: 0.08, gain: 0.03, type: 'triangle', noise: null },
  control: { frequency: 175, duration: 0.06, gain: 0.026, type: 'triangle', noise: null }
};

const VOLUME_KEY = 'project-maze-volume';

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume: number;

  constructor() {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const stored = raw === null ? Number.NaN : Number(raw);
    this.volume = Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.8;
  }

  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
        const length = Math.floor(this.context.sampleRate * 0.4);
        this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      }
      void this.context.resume();
    } catch {
      this.context = null;
      this.master = null;
    }
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    window.localStorage.setItem(VOLUME_KEY, String(this.volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  shot(playerClass: PlayerClass): void {
    const branch = CLASS_DEFINITIONS[playerClass]?.branch ?? 'core';
    const profile = SHOT_PROFILES[branch] ?? SHOT_PROFILES.core!;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    this.tone(profile.frequency * jitter, profile.duration, profile.gain, profile.type);
    if (profile.noise) this.noise(profile.noise.duration, profile.noise.gain, profile.noise.filter);
  }

  /**
   * Treffer-Bestätigung: kurz, hoch, bewusst leiser als `damage` – Dauerfeuer
   * soll nicht ermüden. Vorher gab es im ganzen Client keinen Kanal für „ich
   * habe getroffen" (Befund 1).
   */
  hit(): void {
    this.tone(1180, 0.03, 0.014, 'triangle');
  }

  /**
   * Formen-Abschuss, nach Art gestaffelt: Quadrat hoch und kurz, Dreieck
   * mittig, Fünfeck tief mit Rauschanteil – hörbar dieselbe Rangfolge, die
   * die Belohnung (18/45/120) ohnehin macht. Der häufigste Vorgang des Spiels
   * war vorher komplett stumm (Befund 9).
   */
  shapeBreak(kind: ShapeKind): void {
    if (kind === 'pentagon') {
      this.tone(190, 0.09, 0.018, 'triangle');
      this.noise(0.08, 0.01, 500);
    } else if (kind === 'triangle') this.tone(330, 0.05, 0.013, 'triangle');
    else this.tone(470, 0.035, 0.011, 'triangle');
  }

  /** Klassenwahl – die größte Entscheidung eines Laufs bekommt einen Moment (Befund 10). */
  classChosen(): void {
    this.sequence([300, 450, 640], 0.08, 0.03);
  }

  /**
   * CONTROL spielt ohne Rohr und war damit komplett ohne Offensiv-Ton
   * (Befund 8): ein Klick beim Nachschub, ein kurzer Bruch beim Verlust.
   */
  droneSpawn(): void {
    this.tone(520, 0.03, 0.012, 'sine');
  }

  droneLost(): void {
    this.tone(160, 0.07, 0.02, 'sawtooth');
    this.noise(0.05, 0.01, 700);
  }

  /**
   * AEGIS-Entladung (Befund 7): tief und mit Rauschanteil – eine Druckwelle,
   * kein Schuss. Hörbar unter allem Dauerfeuer, weil sonst kein Kanal so tief
   * liegt; bewusst kurz, damit zwei Tanks im Schlagabtausch nicht dröhnen.
   */
  discharge(): void {
    this.tone(95, 0.16, 0.032, 'sine');
    this.noise(0.12, 0.014, 320);
  }

  module(module: ActiveModuleId): void {
    if (module === 'dash') this.sequence([230, 410], 0.045, 0.022, 'sawtooth');
    else if (module === 'repulse') this.sequence([190, 125], 0.07, 0.03, 'sine');
    else if (module === 'barrier') this.sequence([280, 235], 0.08, 0.025, 'triangle');
    else this.sequence([320, 410, 520], 0.07, 0.018, 'sine');
  }

  /**
   * `pan` (−1 … 1) legt den Treffer ins Stereobild (Befund 5): links getroffen,
   * links gehört. Kommt aus der Trefferrichtung im Snapshot; 0 = mittig, wie
   * bisher – etwa bei Zonenschaden ohne Angreifer.
   */
  damage(intensity = 1, pan = 0): void {
    this.tone(78, 0.12, 0.03 + Math.min(0.035, intensity * 0.012), 'sawtooth', pan);
    this.noise(0.08, 0.02, 420, pan);
  }

  kill(streak = 1): void {
    const boost = Math.min(4, Math.max(1, streak)) - 1;
    const base = 330 * (1 + boost * 0.12);
    this.sequence([base, base * 1.42, base * 2], 0.055, 0.028);
    this.noise(0.12, 0.022, 1400);
  }

  death(): void {
    this.sequence([180, 125, 82], 0.1, 0.04);
    this.noise(0.4, 0.05, 300);
  }

  // Kill-Lautstärke statt zweitleisester Klang im Spiel (Befund 10).
  level(): void { this.sequence([420, 560, 760], 0.06, 0.028); }

  eventHorn(): void {
    this.sequence([160, 160, 240], 0.16, 0.03, 'square');
  }

  bounty(): void {
    this.sequence([520, 660, 520, 780], 0.06, 0.02, 'triangle');
  }

  private sequence(frequencies: number[], duration: number, gain: number, type: OscillatorType = 'sine'): void {
    frequencies.forEach((frequency, index) => window.setTimeout(() => this.tone(frequency, duration, gain, type), index * duration * 700));
  }

  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType, pan = 0): void {
    const context = this.context;
    const target = this.destination(pan);
    if (!context || !target) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(target);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {}
  }

  private noise(duration: number, gainValue: number, filterFrequency: number, pan = 0): void {
    const context = this.context;
    const target = this.destination(pan);
    if (!context || !target || !this.noiseBuffer) return;
    try {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFrequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      source.connect(filter).connect(gain).connect(target);
      source.start();
      source.stop(context.currentTime + duration);
    } catch {}
  }

  /**
   * Ziel-Knoten für einen Klang: mittig direkt der Master, seitlich ein
   * StereoPanner davor. Der Panner ist ein Wegwerf-Knoten je Klang – Web-Audio-
   * Knoten sind genau dafür gebaut, und der Garbage Collector räumt sie nach
   * dem Ausklingen ab. Fehlt die API (alte WebViews), bleibt es beim Master.
   */
  private destination(pan: number): AudioNode | null {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return null;
    if (!pan || typeof context.createStereoPanner !== 'function') return master;
    try {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(master);
      return panner;
    } catch {
      return master;
    }
  }
}
