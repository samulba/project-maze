import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  availableClassChoices,
  classAvailableAtLevel,
  respawnLevelFrom,
  sanitizePlayerName,
  upgradePointsAtLevel
} from './index';

describe('progression and input rules', () => {
  it('keeps half the level on death', () => {
    expect(respawnLevelFrom(40)).toBe(20);
    expect(respawnLevelFrom(25)).toBe(12);
    expect(respawnLevelFrom(3)).toBe(1);
  });

  it('unlocks only direct children at the new tier levels', () => {
    expect(availableClassChoices('core', 9)).toEqual([]);
    expect(availableClassChoices('core', 10)).toEqual(['rapid', 'sniper', 'drone', 'rammer']);
    expect(availableClassChoices('rapid', 23)).toEqual([]);
    expect(availableClassChoices('rapid', 24)).toEqual(['twin']);
    expect(availableClassChoices('twin', 37)).toEqual([]);
    expect(availableClassChoices('twin', 38)).toEqual(['storm']);
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

  it('keeps sustained bullet damage inside intentional role corridors', () => {
    const dps = (id: keyof typeof CLASS_DEFINITIONS): number => {
      const tank = CLASS_DEFINITIONS[id];
      return tank.barrelCount * tank.damage / Math.max(0.001, tank.reload);
    };

    expect(dps('core')).toBeGreaterThanOrEqual(48);
    expect(dps('core')).toBeLessThanOrEqual(58);
    expect(dps('rapid')).toBeGreaterThanOrEqual(52);
    expect(dps('rapid')).toBeLessThanOrEqual(66);
    expect(dps('twin')).toBeGreaterThanOrEqual(64);
    expect(dps('twin')).toBeLessThanOrEqual(82);
    expect(dps('storm')).toBeGreaterThanOrEqual(78);
    expect(dps('storm')).toBeLessThanOrEqual(100);
    expect(dps('sniper')).toBeLessThanOrEqual(66);
    expect(dps('railgun')).toBeLessThanOrEqual(70);
    expect(dps('lancer')).toBeLessThanOrEqual(70);
  });
});
