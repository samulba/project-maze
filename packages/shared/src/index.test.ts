import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  PLAYER_CLASS_IDS,
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

  it('unlocks all intended direct children at the tier levels', () => {
    expect(availableClassChoices('core', 9)).toEqual([]);
    expect(availableClassChoices('core', 10)).toEqual(['rapid', 'sniper', 'drone', 'rammer']);
    expect(availableClassChoices('rapid', 24)).toEqual(['twin', 'repeater']);
    expect(availableClassChoices('sniper', 24)).toEqual(['railgun', 'hunter']);
    expect(availableClassChoices('drone', 24)).toEqual(['warden', 'factory']);
    expect(availableClassChoices('rammer', 24)).toEqual(['crusher', 'bulwark']);
    expect(availableClassChoices('twin', 38)).toEqual(['storm']);
    expect(availableClassChoices('repeater', 38)).toEqual(['gatling']);
    expect(availableClassChoices('railgun', 38)).toEqual(['lancer']);
    expect(availableClassChoices('hunter', 38)).toEqual(['phantom']);
    expect(availableClassChoices('warden', 38)).toEqual(['overseer']);
    expect(availableClassChoices('factory', 38)).toEqual(['carrier']);
    expect(availableClassChoices('crusher', 38)).toEqual(['juggernaut']);
    expect(availableClassChoices('bulwark', 38)).toEqual(['fortress']);
  });

  it('contains exactly 21 unique class definitions', () => {
    expect(PLAYER_CLASS_IDS).toHaveLength(21);
    expect(new Set(PLAYER_CLASS_IDS).size).toBe(21);
    expect(Object.keys(CLASS_DEFINITIONS)).toHaveLength(21);
  });

  it('falls back to a legal ancestor after respawn', () => {
    expect(classAvailableAtLevel('lancer', 20)).toBe('sniper');
    expect(classAvailableAtLevel('phantom', 24)).toBe('hunter');
    expect(classAvailableAtLevel('carrier', 9)).toBe('core');
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
    for (const id of ['rapid', 'sniper'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(52);
      expect(dps(id)).toBeLessThanOrEqual(66);
    }
    for (const id of ['twin', 'repeater', 'hunter'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(64);
      expect(dps(id)).toBeLessThanOrEqual(82);
    }
    for (const id of ['storm', 'gatling', 'phantom'] as const) {
      expect(dps(id)).toBeGreaterThanOrEqual(78);
      expect(dps(id)).toBeLessThanOrEqual(100);
    }
    expect(dps('railgun')).toBeLessThanOrEqual(70);
    expect(dps('lancer')).toBeLessThanOrEqual(70);
  });
});
