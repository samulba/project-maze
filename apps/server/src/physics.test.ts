import { describe, expect, it } from 'vitest';
import { SpatialHash, projectileSubstepCount, resolveProjectilePair } from './physics';

describe('projectile collision and spatial queries', () => {
  it('destroys equally strong bullets', () => {
    const a = { damage: 20, integrity: 20 };
    const b = { damage: 20, integrity: 20 };
    resolveProjectilePair(a, b);
    expect(a.integrity).toBe(0);
    expect(b.integrity).toBe(0);
  });

  it('allows a stronger projectile to continue weakened', () => {
    const strong = { damage: 30, integrity: 46 };
    const weak = { damage: 14, integrity: 14 };
    resolveProjectilePair(strong, weak);
    expect(strong.integrity).toBe(32);
    expect(weak.integrity).toBe(-16);
  });

  it('substeps fast projectiles to reduce tunneling', () => {
    expect(projectileSubstepCount(1600, 1 / 40, 10)).toBe(4);
    expect(projectileSubstepCount(0, 1 / 40, 10)).toBe(1);
    expect(projectileSubstepCount(100000, 1, 1)).toBe(12);
  });

  it('returns entities from nearby spatial cells', () => {
    const hash = new SpatialHash<{ id: string; position: { x: number; y: number } }>(100);
    hash.rebuild([
      { id: 'near', position: { x: 50, y: 50 } },
      { id: 'far', position: { x: 1000, y: 1000 } }
    ]);
    expect(hash.query({ x: 60, y: 60 }, 30).map((value) => value.id)).toEqual(['near']);
  });
});
