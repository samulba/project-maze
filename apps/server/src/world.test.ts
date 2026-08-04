import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { createShape, isFree, randomSpawn, WALLS } from './world';

describe('world generation', () => {
  it('creates a larger playable maze', () => { expect(GAME.worldWidth).toBeGreaterThanOrEqual(6000); expect(WALLS.length).toBeGreaterThan(20); });
  it('returns legal spawns and shapes', () => { for (let index = 0; index < 30; index += 1) { const spawn = randomSpawn(); expect(isFree(spawn, 36)).toBe(true); const shape = createShape(`shape-${index}`); expect(isFree(shape.position, shape.radius)).toBe(true); } });
});
