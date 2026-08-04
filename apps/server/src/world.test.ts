import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { WALLS, createShape, hasLineOfSight, isFree, moveCircle, randomSpawn } from './world';

describe('world generation and collision', () => {
  it('creates a larger playable maze', () => {
    expect(GAME.worldWidth).toBeGreaterThanOrEqual(6000);
    expect(WALLS.length).toBeGreaterThan(20);
  });

  it('returns legal spawns and shapes', () => {
    for (let index = 0; index < 50; index += 1) {
      const spawn = randomSpawn();
      expect(isFree(spawn, 36)).toBe(true);
      const shape = createShape(`shape-${index}`);
      expect(isFree(shape.position, shape.radius)).toBe(true);
    }
  });

  it('keeps fast-moving circles in a legal position', () => {
    const start = randomSpawn(() => 0.02);
    const result = moveCircle(start, { x: 5000, y: 0 }, 0.25, 22);
    expect(isFree(result.position, 22)).toBe(true);
  });

  it('blocks line of sight through a wall', () => {
    const candidate = WALLS[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(hasLineOfSight(
      { x: candidate.x - 20, y: candidate.y + candidate.height / 2 },
      { x: candidate.x + candidate.width + 20, y: candidate.y + candidate.height / 2 }
    )).toBe(false);
  });
});
