import { describe, expect, it } from 'vitest';
import {
  AIM_TUNING,
  MOVE_TUNING,
  floatingOrigin,
  smoothDirection,
  stickEngaged,
  stickMagnitude,
  type StickTuning
} from './stick-math';

const tuning: StickTuning = {
  deadzone: 0.1,
  curve: 1.5,
  fullThrottleAt: 0.8,
  engage: 0.3,
  release: 0.15,
  smoothing: 0.5
};

describe('stickMagnitude', () => {
  it('ignores deflection inside the deadzone', () => {
    expect(stickMagnitude(0, tuning)).toBe(0);
    expect(stickMagnitude(0.1, tuning)).toBe(0);
    expect(stickMagnitude(0.101, tuning)).toBeGreaterThan(0);
  });

  it('reaches full deflection before the physical edge', () => {
    expect(stickMagnitude(0.8, tuning)).toBe(1);
    expect(stickMagnitude(1, tuning)).toBe(1);
    expect(stickMagnitude(2, tuning)).toBe(1);
  });

  it('rises monotonically between deadzone and plateau', () => {
    let previous = -1;
    for (let ratio = 0; ratio <= 1.0001; ratio += 0.02) {
      const value = stickMagnitude(ratio, tuning);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it('keeps a curve above 1 finer than linear near the centre', () => {
    const midpoint = (tuning.deadzone + tuning.fullThrottleAt) / 2;
    expect(stickMagnitude(midpoint, tuning)).toBeLessThan(0.5);
  });

  it('never returns a negative magnitude for negative input', () => {
    expect(stickMagnitude(-1, tuning)).toBe(0);
  });
});

describe('stickEngaged', () => {
  it('needs a deliberate push to engage', () => {
    expect(stickEngaged(0.29, false, tuning)).toBe(false);
    expect(stickEngaged(0.3, false, tuning)).toBe(true);
  });

  it('keeps firing through micro corrections once engaged', () => {
    expect(stickEngaged(0.2, true, tuning)).toBe(true);
    expect(stickEngaged(0.16, true, tuning)).toBe(true);
    expect(stickEngaged(0.15, true, tuning)).toBe(false);
  });

  it('does not flicker while resting exactly on the engage threshold', () => {
    let engaged = stickEngaged(tuning.engage, false, tuning);
    expect(engaged).toBe(true);
    for (let step = 0; step < 6; step += 1) {
      engaged = stickEngaged(tuning.engage - 0.001, engaged, tuning);
      expect(engaged).toBe(true);
    }
  });

  it('uses a real hysteresis band in both shipped tunings', () => {
    for (const shipped of [MOVE_TUNING, AIM_TUNING]) {
      expect(shipped.release).toBeLessThan(shipped.engage);
      expect(shipped.deadzone).toBeLessThan(shipped.fullThrottleAt);
    }
  });
});

describe('smoothDirection', () => {
  const east = { x: 1, y: 0 };
  const north = { x: 0, y: -1 };

  it('takes the raw direction when there is no history', () => {
    expect(smoothDirection(null, north, 0, tuning)).toEqual(north);
  });

  it('reacts instantly at full deflection', () => {
    expect(smoothDirection(east, north, 1, tuning)).toEqual(north);
    expect(smoothDirection(east, north, tuning.fullThrottleAt, tuning)).toEqual(north);
  });

  it('damps jitter near the centre but keeps moving towards the target', () => {
    const smoothed = smoothDirection(east, north, 0, tuning);
    expect(smoothed.x).toBeGreaterThan(0);
    expect(smoothed.y).toBeLessThan(0);
    expect(Math.hypot(smoothed.x, smoothed.y)).toBeCloseTo(1, 6);
  });

  it('converges on the target direction over repeated updates', () => {
    let direction = east;
    for (let step = 0; step < 30; step += 1) direction = smoothDirection(direction, north, 0.2, tuning);
    expect(direction.x).toBeCloseTo(0, 3);
    expect(direction.y).toBeCloseTo(-1, 3);
  });

  it('falls back to the raw direction when the blend cancels itself out', () => {
    // Genau gegenläufige Richtungen bei halber Trägheit ergeben den Nullvektor.
    const west = { x: -1, y: 0 };
    expect(smoothDirection(west, east, 0, { ...tuning, smoothing: 0.5 })).toEqual(east);
  });

  it('still converges with an extreme smoothing setting', () => {
    let direction = east;
    for (let step = 0; step < 200; step += 1) {
      direction = smoothDirection(direction, north, 0, { ...tuning, smoothing: 1 });
    }
    expect(direction.y).toBeLessThan(-0.99);
  });
});

describe('floatingOrigin', () => {
  const bounds = { left: 100, top: 200, width: 168, height: 168 };

  it('places the stick where the thumb landed', () => {
    expect(floatingOrigin({ x: 180, y: 280 }, bounds, 46)).toEqual({ x: 180, y: 280 });
  });

  it('keeps full travel reachable in every direction', () => {
    const origin = floatingOrigin({ x: 104, y: 366 }, bounds, 46);
    expect(origin.x).toBe(146);
    expect(origin.y).toBe(322);
  });

  it('centres the stick when the zone is smaller than the travel', () => {
    const tight = { left: 0, top: 0, width: 60, height: 60 };
    expect(floatingOrigin({ x: 5, y: 55 }, tight, 46)).toEqual({ x: 30, y: 30 });
  });
});
