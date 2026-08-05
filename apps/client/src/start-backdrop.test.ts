import { describe, expect, it } from 'vitest';
import { createBackdropShapes, shapeCountFor, wrapShape, type BackdropShape } from './start-backdrop';

/** Deterministische Quelle – Zufall darf ein Testergebnis nie verändern. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

const cycling = (): (() => number) => {
  let step = 0;
  return () => {
    step += 1;
    return (step * 0.137) % 1;
  };
};

describe('createBackdropShapes', () => {
  it('places every shape inside the given area', () => {
    const shapes = createBackdropShapes(800, 600, 12, cycling());
    expect(shapes).toHaveLength(12);
    for (const shape of shapes) {
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.x).toBeLessThanOrEqual(800);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeLessThanOrEqual(600);
    }
  });

  it('only builds shapes the arena also knows: triangle, square, pentagon', () => {
    for (const shape of createBackdropShapes(800, 600, 24, cycling())) {
      expect(shape.sides).toBeGreaterThanOrEqual(3);
      expect(shape.sides).toBeLessThanOrEqual(5);
    }
  });

  it('keeps every shape faint enough to stay a backdrop', () => {
    for (const shape of createBackdropShapes(800, 600, 24, cycling())) {
      expect(shape.alpha).toBeGreaterThan(0);
      expect(shape.alpha).toBeLessThanOrEqual(0.08);
    }
  });

  it('drifts slowly – the motion must not draw attention', () => {
    for (const shape of createBackdropShapes(800, 600, 24, cycling())) {
      const speed = Math.hypot(shape.driftX, shape.driftY);
      expect(speed).toBeLessThanOrEqual(18);
      expect(Math.abs(shape.spin)).toBeLessThanOrEqual(0.16);
    }
  });

  it('is reproducible for a given random source', () => {
    const first = createBackdropShapes(800, 600, 5, sequence([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
    const second = createBackdropShapes(800, 600, 5, sequence([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]));
    expect(first).toEqual(second);
  });

  it('returns nothing when asked for nothing', () => {
    expect(createBackdropShapes(800, 600, 0, cycling())).toEqual([]);
  });
});

describe('wrapShape', () => {
  const base = (overrides: Partial<BackdropShape>): BackdropShape => ({
    x: 0, y: 0, radius: 20, sides: 4, rotation: 0, spin: 0,
    driftX: 0, driftY: 0, color: '#fff', alpha: 0.05, ...overrides
  });

  it('re-enters on the opposite edge', () => {
    const left = base({ x: -100, y: 300 });
    wrapShape(left, 800, 600);
    expect(left.x).toBeGreaterThan(800);

    const bottom = base({ x: 400, y: 700 });
    wrapShape(bottom, 800, 600);
    expect(bottom.y).toBeLessThan(0);
  });

  it('leaves shapes inside the area untouched', () => {
    const inside = base({ x: 400, y: 300 });
    wrapShape(inside, 800, 600);
    expect(inside).toEqual(base({ x: 400, y: 300 }));
  });
});

describe('shapeCountFor', () => {
  it('scales with the area but stays within sane bounds', () => {
    expect(shapeCountFor(390, 700)).toBeLessThan(shapeCountFor(1920, 1080));
    expect(shapeCountFor(1, 1)).toBeGreaterThanOrEqual(6);
    expect(shapeCountFor(6000, 4000)).toBeLessThanOrEqual(18);
  });
});
