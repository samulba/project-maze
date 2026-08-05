import type { PlayerClass } from '@project-maze/shared';
import type { ActiveModuleId } from '@project-maze/shared/gameplay';

const HEAVY_CLASSES = new Set<PlayerClass>(['sniper', 'railgun', 'lancer', 'phantom', 'bulwark', 'fortress', 'arbalest', 'deadeye']);
const RAPID_CLASSES = new Set<PlayerClass>(['rapid', 'twin', 'repeater', 'storm', 'gatling', 'flanker', 'octo']);

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
    const heavy = HEAVY_CLASSES.has(playerClass);
    const rapid = RAPID_CLASSES.has(playerClass);
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    this.tone((heavy ? 105 : rapid ? 215 : 175) * jitter, heavy ? 0.11 : rapid ? 0.04 : 0.06, heavy ? 0.055 : rapid ? 0.018 : 0.026, heavy ? 'square' : 'triangle');
    if (heavy) this.noise(0.07, 0.02, 900);
  }

  module(module: ActiveModuleId): void {
    if (module === 'dash') this.sequence([230, 410], 0.045, 0.022, 'sawtooth');
    else if (module === 'repulse') this.sequence([190, 125], 0.07, 0.03, 'sine');
    else if (module === 'barrier') this.sequence([280, 235], 0.08, 0.025, 'triangle');
    else this.sequence([320, 410, 520], 0.07, 0.018, 'sine');
  }

  damage(intensity = 1): void {
    this.tone(78, 0.12, 0.03 + Math.min(0.035, intensity * 0.012), 'sawtooth');
    this.noise(0.08, 0.02, 420);
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

  level(): void { this.sequence([420, 560, 760], 0.06, 0.022); }

  eventHorn(): void {
    this.sequence([160, 160, 240], 0.16, 0.03, 'square');
  }

  bounty(): void {
    this.sequence([520, 660, 520, 780], 0.06, 0.02, 'triangle');
  }

  private sequence(frequencies: number[], duration: number, gain: number, type: OscillatorType = 'sine'): void {
    frequencies.forEach((frequency, index) => window.setTimeout(() => this.tone(frequency, duration, gain, type), index * duration * 700));
  }

  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, context.currentTime);
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {}
  }

  private noise(duration: number, gainValue: number, filterFrequency: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.noiseBuffer) return;
    try {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFrequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(gainValue, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      source.connect(filter).connect(gain).connect(master);
      source.start();
      source.stop(context.currentTime + duration);
    } catch {}
  }
}
