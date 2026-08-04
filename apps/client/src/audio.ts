import type { PlayerClass } from '@project-maze/shared';

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  shot(playerClass: PlayerClass): void {
    if (playerClass === 'sniper') {
      this.tone(150, 62, 0.11, 0.36, 'sawtooth');
      this.noise(0.075, 0.2, 1250);
    } else if (playerClass === 'shooter') {
      this.tone(210, 105, 0.055, 0.21, 'square');
      this.noise(0.035, 0.08, 1900);
    }
  }

  damage(): void {
    this.tone(92, 48, 0.13, 0.28, 'sawtooth');
    this.noise(0.1, 0.16, 520);
  }

  kill(): void {
    this.tone(330, 520, 0.12, 0.18, 'triangle', 0);
    this.tone(480, 720, 0.15, 0.13, 'sine', 0.055);
  }

  level(): void {
    this.tone(440, 660, 0.12, 0.12, 'sine', 0);
    this.tone(660, 880, 0.14, 0.1, 'sine', 0.08);
  }

  death(): void {
    this.tone(180, 42, 0.42, 0.3, 'sawtooth');
    this.noise(0.32, 0.18, 420);
  }

  private tone(startFrequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType, delay = 0): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number, frequency: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state !== 'running') return;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }
}
