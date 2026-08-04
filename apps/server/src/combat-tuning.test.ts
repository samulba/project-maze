import { describe, expect, it } from 'vitest';
import { EMPTY_UPGRADES, type PlayerClass, type UpgradeLevels } from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning';

type TunedPlayer = Parameters<typeof tunedStatsFor>[0];

function player(playerClass: PlayerClass, upgrades: UpgradeLevels = EMPTY_UPGRADES()): TunedPlayer {
  return { playerClass, upgrades } as TunedPlayer;
}

const sustainedDps = (stats: ReturnType<typeof tunedStatsFor>): number =>
  stats.barrelCount * stats.damage / Math.max(0.001, stats.reload);

describe('normalized combat upgrade scaling', () => {
  it('keeps full damage and reload investment below a 2.5x DPS multiplier', () => {
    for (const playerClass of ['core', 'rapid', 'storm', 'gatling', 'phantom'] as const) {
      const base = tunedStatsFor(player(playerClass));
      const upgrades = EMPTY_UPGRADES();
      upgrades.damage = 8;
      upgrades.reload = 8;
      const maximum = tunedStatsFor(player(playerClass, upgrades));
      expect(sustainedDps(maximum) / sustainedDps(base)).toBeLessThan(2.5);
    }
  });

  it('keeps movement investment meaningful without creating unreachable tanks', () => {
    const base = tunedStatsFor(player('rapid'));
    const upgrades = EMPTY_UPGRADES();
    upgrades.moveSpeed = 8;
    const maximum = tunedStatsFor(player('rapid', upgrades));
    expect(maximum.moveSpeed / base.moveSpeed).toBeGreaterThan(1.2);
    expect(maximum.moveSpeed / base.moveSpeed).toBeLessThan(1.3);
  });

  it('keeps maximum health growth below double base health', () => {
    const base = tunedStatsFor(player('fortress'));
    const upgrades = EMPTY_UPGRADES();
    upgrades.maxHealth = 8;
    const maximum = tunedStatsFor(player('fortress', upgrades));
    expect(maximum.maxHealth / base.maxHealth).toBeGreaterThan(1.65);
    expect(maximum.maxHealth / base.maxHealth).toBeLessThan(1.8);
  });
});
