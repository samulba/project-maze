import { describe, expect, it } from 'vitest';
import { resolveProjectilePair } from './physics';

describe('projectile collision', () => {
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
});
