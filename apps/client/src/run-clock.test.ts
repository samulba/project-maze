import { describe, expect, it } from 'vitest';
import { runDurationText, runSeconds } from './run-clock';

describe('Laufzeit eines Runs', () => {
  const start = 1_000_000;

  it('steht still, sobald der Run zu Ende ist', () => {
    const ende = start + 90_000;
    // Derselbe Tod, sechs Minuten spaeter noch einmal angesehen: gleiche Zahl.
    expect(runSeconds(start, ende, ende)).toBe(90);
    expect(runSeconds(start, ende, ende + 360_000)).toBe(90);
    expect(runDurationText(runSeconds(start, ende, ende + 360_000))).toBe('1m 30s');
  });

  it('laeuft weiter, solange der Run laeuft', () => {
    expect(runSeconds(start, null, start + 12_000)).toBe(12);
    expect(runSeconds(start, null, start + 42_000)).toBe(42);
  });

  it('bleibt bei einer Uhr, die zurueckspringt, bei null', () => {
    expect(runSeconds(start, null, start - 5_000)).toBe(0);
  });

  it('schreibt Sekunden unter einer Minute ohne Minutenteil', () => {
    expect(runDurationText(0)).toBe('0s');
    expect(runDurationText(59)).toBe('59s');
    expect(runDurationText(60)).toBe('1m 0s');
    expect(runDurationText(605)).toBe('10m 5s');
  });
});
