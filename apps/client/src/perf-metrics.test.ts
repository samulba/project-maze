import { describe, expect, it } from 'vitest';
import { PerfWindow, deviceClassFrom, fpsAtPercentile } from './perf-metrics';

const UMGEBUNG = {
  dpr: 2,
  viewportW: 1920,
  viewportH: 1080,
  deviceClass: 'high' as const,
  quality: 'webgl' as const
};

/** `anzahl` Frames mit fester Dauer. */
const gleichmaessig = (anzahl: number, dauer: number): number[] =>
  Array.from({ length: anzahl }, () => dauer);

describe('Perzentile der Framedauer', () => {
  it('liefert bei gleichmäßigen Frames genau die Bildrate', () => {
    const frames = gleichmaessig(100, 16.67);
    expect(Math.round(fpsAtPercentile(frames, 0.5))).toBe(60);
    expect(Math.round(fpsAtPercentile(frames, 0.95))).toBe(60);
  });

  it('das 95er-Perzentil ist der LANGSAME Rand, also die kleinere Bildrate', () => {
    // 90 flüssige Frames, 10 Ruckler.
    const frames = [...gleichmaessig(90, 16.67), ...gleichmaessig(10, 200)];
    const median = fpsAtPercentile(frames, 0.5);
    const rand = fpsAtPercentile(frames, 0.95);
    expect(Math.round(median)).toBe(60);
    expect(Math.round(rand)).toBe(5);
    expect(rand).toBeLessThan(median);
  });
});

describe('Messfenster', () => {
  it('meldet nichts, solange zu wenige Frames da sind', () => {
    const fenster = new PerfWindow();
    for (const dauer of gleichmaessig(29, 16.67)) fenster.push(dauer);
    expect(fenster.usable).toBe(false);
    expect(fenster.report(UMGEBUNG)).toBeNull();
  });

  it('verwirft Frames, die keine sind', () => {
    const fenster = new PerfWindow();
    fenster.push(0);
    fenster.push(-5);
    fenster.push(9000);
    expect(fenster.samples).toBe(0);
  });

  it('zählt Ruckler über 100 ms', () => {
    const fenster = new PerfWindow();
    for (const dauer of gleichmaessig(40, 16.67)) fenster.push(dauer);
    fenster.push(150);
    fenster.push(320);
    fenster.push(99);
    expect(fenster.report(UMGEBUNG)?.frameHangs).toBe(2);
  });

  it('meldet nichts mehr, wenn der Tab im Hintergrund war', () => {
    const fenster = new PerfWindow();
    for (const dauer of gleichmaessig(60, 16.67)) fenster.push(dauer);
    expect(fenster.usable).toBe(true);
    fenster.spoil();
    expect(fenster.usable).toBe(false);
    expect(fenster.report(UMGEBUNG)).toBeNull();
    fenster.reset();
    for (const dauer of gleichmaessig(60, 16.67)) fenster.push(dauer);
    expect(fenster.report(UMGEBUNG)).not.toBeNull();
  });

  it('hält fpsP95 <= fpsP50 – auch bei nur einem Frame Unterschied', () => {
    const fenster = new PerfWindow();
    for (const dauer of gleichmaessig(31, 16.67)) fenster.push(dauer);
    const bericht = fenster.report(UMGEBUNG);
    expect(bericht).not.toBeNull();
    expect(bericht!.fpsP95).toBeLessThanOrEqual(bericht!.fpsP50);
  });

  it('bleibt in den Grenzen, die der Server erzwingt', () => {
    const schnell = new PerfWindow();
    // 1000 fps sind physikalisch Unfug, aber ein Testbrowser kann sie melden.
    for (const dauer of gleichmaessig(60, 1)) schnell.push(dauer);
    const oben = schnell.report({ ...UMGEBUNG, dpr: 12, viewportW: 99_999, viewportH: 1 });
    expect(oben).toEqual({
      fpsP50: 240,
      fpsP95: 240,
      frameHangs: 0,
      dpr: 8,
      viewportW: 20_000,
      viewportH: 120,
      deviceClass: 'high',
      quality: 'webgl'
    });

    const langsam = new PerfWindow();
    for (const dauer of gleichmaessig(60, 4_000)) langsam.push(dauer);
    const unten = langsam.report({ ...UMGEBUNG, dpr: 0.1 });
    expect(unten?.fpsP50).toBe(1);
    expect(unten?.dpr).toBe(0.5);
  });
});

describe('Geräteklasse', () => {
  it('kennt sich selbst nicht, wenn der Browser nichts verrät', () => {
    expect(deviceClassFrom(undefined, undefined, 1)).toBe('unknown');
    expect(deviceClassFrom(undefined, 0, 1)).toBe('unknown');
  });

  it('stuft nach Speicher, Kernen und Pixeldichte ein', () => {
    expect(deviceClassFrom(16, 12, 2)).toBe('high');
    expect(deviceClassFrom(8, 8, 1)).toBe('high');
    expect(deviceClassFrom(4, 4, 1)).toBe('mid');
    expect(deviceClassFrom(2, 2, 1)).toBe('low');
  });

  it('kommt ohne deviceMemory aus (Safari, Firefox)', () => {
    expect(deviceClassFrom(undefined, 10, 2)).toBe('high');
    expect(deviceClassFrom(undefined, 4, 1)).toBe('mid');
    // Unbekannter Speicher zählt als Mittelfeld (1 Punkt) – zwei Kerne ohne
    // hohe Pixeldichte reichen damit trotzdem nur für „low".
    expect(deviceClassFrom(undefined, 2, 1)).toBe('low');
  });
});
