import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MODULE_DEFINITIONS,
  ACTIVE_MODULE_IDS,
  PASSIVE_MODIFIER_DEFINITIONS,
  PASSIVE_MODIFIER_IDS
} from './gameplay';

describe('gameplay loadout definitions', () => {
  it('keeps the first release to four one-button modules', () => {
    expect(ACTIVE_MODULE_IDS).toEqual(['dash', 'repulse', 'barrier', 'repair']);
    for (const id of ACTIVE_MODULE_IDS) {
      const definition = ACTIVE_MODULE_DEFINITIONS[id];
      expect(definition.cooldownMs).toBeGreaterThanOrEqual(9_000);
      expect(definition.cooldownMs).toBeLessThanOrEqual(18_000);
      expect(definition.activeMs).toBeGreaterThan(0);
    }
  });

  it('contains no pure passive upgrade besides the neutral standard frame', () => {
    expect(PASSIVE_MODIFIER_IDS).toEqual(['standard', 'lightweight', 'stabilizer', 'reinforced']);
    for (const id of PASSIVE_MODIFIER_IDS) {
      const modifier = PASSIVE_MODIFIER_DEFINITIONS[id];
      if (id === 'standard') {
        expect(modifier.healthMultiplier).toBe(1);
        expect(modifier.moveMultiplier).toBe(1);
        expect(modifier.reloadMultiplier).toBe(1);
        expect(modifier.projectileSpeedMultiplier).toBe(1);
        continue;
      }
      const benefits = [
        modifier.healthMultiplier > 1,
        modifier.moveMultiplier > 1,
        modifier.reloadMultiplier < 1,
        modifier.projectileSpeedMultiplier > 1
      ].filter(Boolean).length;
      const costs = [
        modifier.healthMultiplier < 1,
        modifier.moveMultiplier < 1,
        modifier.reloadMultiplier > 1,
        modifier.projectileSpeedMultiplier < 1
      ].filter(Boolean).length;
      expect(benefits).toBeGreaterThan(0);
      expect(costs).toBeGreaterThan(0);
    }
  });
});
