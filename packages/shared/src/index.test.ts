import { describe, expect, it } from 'vitest';
import { availableClassChoices, classAvailableAtLevel, respawnLevelFrom, sanitizePlayerName, upgradePointsAtLevel } from './index';

describe('progression and input rules', () => {
  it('keeps half the level on death', () => {
    expect(respawnLevelFrom(40)).toBe(20);
    expect(respawnLevelFrom(25)).toBe(12);
    expect(respawnLevelFrom(3)).toBe(1);
  });

  it('unlocks only direct children', () => {
    expect(availableClassChoices('core', 11)).toEqual([]);
    expect(availableClassChoices('core', 12)).toEqual(['rapid', 'sniper', 'drone', 'rammer']);
    expect(availableClassChoices('rapid', 25)).toEqual(['twin']);
  });

  it('falls back to a legal ancestor after respawn', () => {
    expect(classAvailableAtLevel('lancer', 20)).toBe('sniper');
    expect(classAvailableAtLevel('overseer', 6)).toBe('core');
  });

  it('sanitizes player names', () => {
    expect(sanitizePlayerName('  <Sam>\n Liba  ')).toBe('Sam Liba');
    expect(sanitizePlayerName('<>')).toBe('');
    expect(sanitizePlayerName('12345678901234567890')).toHaveLength(18);
  });

  it('restores one point per retained level after level one', () => {
    expect(upgradePointsAtLevel(1)).toBe(0);
    expect(upgradePointsAtLevel(20)).toBe(19);
    expect(upgradePointsAtLevel(999)).toBe(44);
  });
});
