import type { PlayerClass } from '@project-maze/shared';

export class GameAudio {
  private context: AudioContext | null = null;
  unlock(): void { try { this.context ??= new AudioContext(); void this.context.resume(); } catch { this.context = null; } }
  shot(playerClass: PlayerClass): void { const heavy = playerClass === 'sniper' || playerClass === 'railgun' || playerClass === 'lancer'; this.tone(heavy ? 105 : 185, heavy ? 0.11 : 0.055, heavy ? 0.055 : 0.026, 'square'); }
  damage(): void { this.tone(78, 0.12, 0.04, 'sawtooth'); }
  kill(): void { this.sequence([330, 470, 660], 0.055, 0.025); }
  level(): void { this.sequence([420, 560, 760], 0.06, 0.022); }
  death(): void { this.sequence([180, 125, 82], 0.1, 0.04); }
  private sequence(frequencies: number[], duration: number, gain: number): void { frequencies.forEach((frequency, index) => window.setTimeout(() => this.tone(frequency, duration, gain, 'sine'), index * duration * 700)); }
  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType): void { const context = this.context; if (!context) return; try { const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, context.currentTime); gain.gain.setValueAtTime(gainValue, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration); } catch {} }
}
