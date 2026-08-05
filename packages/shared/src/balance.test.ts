import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from './index';
import { allClassBalanceMetrics, classBalanceMetrics } from './balance';

describe('class balance metrics', () => {
  it('produces finite metrics for every class', () => {
    const metrics = allClassBalanceMetrics();
    expect(metrics).toHaveLength(PLAYER_CLASS_IDS.length);
    for (const entry of metrics) {
      expect(Number.isFinite(entry.projectileDps)).toBe(true);
      expect(Number.isFinite(entry.projectileRange)).toBe(true);
      expect(Number.isFinite(entry.effectiveDurability)).toBe(true);
      expect(Number.isFinite(entry.mobility)).toBe(true);
      expect(Number.isFinite(entry.dronePressure)).toBe(true);
      expect(Number.isFinite(entry.bodyThreat)).toBe(true);
    }
  });

  it('prevents accidental extreme sustained bullet damage', () => {
    for (const id of PLAYER_CLASS_IDS) {
      const tank = CLASS_DEFINITIONS[id];
      if (tank.branch === 'impact' || tank.barrelCount === 0) continue;
      expect(classBalanceMetrics(id).forwardProjectileDps).toBeLessThanOrEqual(100);
      expect(classBalanceMetrics(id).projectileDps).toBeLessThanOrEqual(180);
    }
  });

  it('keeps drone pressure below the hard safety ceiling', () => {
    for (const id of ['drone', 'warden', 'factory', 'overseer', 'carrier', 'guardian', 'hive'] as const) {
      expect(classBalanceMetrics(id).dronePressure).toBeLessThanOrEqual(170);
    }
  });

  it('counts only forward barrels for rear-covering layouts', () => {
    expect(classBalanceMetrics('flanker').forwardProjectileDps).toBeLessThan(classBalanceMetrics('flanker').projectileDps);
    expect(classBalanceMetrics('octo').forwardProjectileDps).toBeLessThan(classBalanceMetrics('octo').projectileDps);
    expect(classBalanceMetrics('twin').forwardProjectileDps).toBe(classBalanceMetrics('twin').projectileDps);
  });

  it('keeps final impact classes meaningfully distinct', () => {
    const juggernaut = classBalanceMetrics('juggernaut');
    const fortress = classBalanceMetrics('fortress');
    expect(juggernaut.bodyThreat).toBeGreaterThan(fortress.bodyThreat);
    expect(fortress.effectiveDurability).toBeGreaterThan(juggernaut.effectiveDurability);
  });
});
