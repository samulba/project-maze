import { describe, expect, it } from 'vitest';
import { RECOIL_LIMIT, type RecoilState, startRecoil, stepRecoil } from './recoil';

const fresh = (): RecoilState => ({ offset: 0, velocity: 0 });

/** Lässt die Feder `seconds` lang mit fester Bildrate laufen. */
function run(state: RecoilState, seconds: number, delta = 1 / 60): number[] {
  const trace: number[] = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += delta) {
    stepRecoil(state, delta);
    trace.push(state.offset);
  }
  return trace;
}

describe('Rückstoß-Feder', () => {
  it('steht still, solange nicht geschossen wurde', () => {
    const state = fresh();
    expect(stepRecoil(state, 1 / 60)).toBe(false);
    expect(state).toEqual({ offset: 0, velocity: 0 });
  });

  it('geht beim Schuss zurück und federt danach nach vorn über die Ruhelage', () => {
    const state = fresh();
    startRecoil(state);
    expect(state.offset).toBe(1);

    const trace = run(state, 0.5);
    // Zurück: die ersten Bilder bleiben deutlich ausgelenkt.
    expect(trace[0]).toBeGreaterThan(0.9);
    // Vor: irgendwann schwingt das Rohr über die Ruhelage hinaus.
    expect(Math.min(...trace)).toBeLessThan(-0.02);
    // Und die Ausschläge werden kleiner, nicht größer.
    expect(Math.max(...trace.slice(20))).toBeLessThan(trace[0]!);
  });

  it('kommt innerhalb einer Sekunde exakt zur Ruhe', () => {
    const state = fresh();
    startRecoil(state);
    run(state, 1);
    expect(state.offset).toBe(0);
    expect(state.velocity).toBe(0);
    expect(stepRecoil(state, 1 / 60)).toBe(false);
  });

  it('bleibt auch bei großen Zeitschritten begrenzt und beruhigt sich', () => {
    // 50 ms ist der Deckel des Renderers – der schlimmste Fall im Betrieb.
    const state = fresh();
    startRecoil(state);
    const trace = run(state, 3, 0.05);
    for (const offset of trace) expect(Math.abs(offset)).toBeLessThanOrEqual(RECOIL_LIMIT);
    expect(state.offset).toBe(0);
  });

  it('ein zweiter Schuss setzt die Feder neu, statt sich aufzuaddieren', () => {
    const state = fresh();
    startRecoil(state);
    run(state, 0.1);
    startRecoil(state);
    expect(state.offset).toBe(1);
    expect(state.velocity).toBe(0);
  });
});
