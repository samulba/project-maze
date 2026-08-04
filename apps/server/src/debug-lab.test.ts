import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { applyDebugBuild, clearDebugProjectiles, healDebugPlayer } from './debug-lab';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  drones: Map<string, any>;
}

const createGame = (): MazeGame => tuneDrones(tuneCombatScaling(new MazeGame(0)));

describe('local balance lab', () => {
  it('loads a legal final-class build and spends preset points', () => {
    const game = createGame();
    const playerId = game.addPlayer('Tester');
    expect(applyDebugBuild(game, playerId, { playerClass: 'carrier', level: 1, preset: 'balanced' })).toBe(true);
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    const spent = Object.values(player.upgrades).reduce((sum: number, value) => sum + Number(value), 0);

    expect(player.level).toBe(CLASS_DEFINITIONS.carrier.unlockLevel);
    expect(player.playerClass).toBe('carrier');
    expect(spent).toBe(player.level - 1);
    expect(player.availablePoints).toBe(0);
    expect([...internals.drones.values()].filter((drone) => drone.ownerId === playerId)).toHaveLength(CLASS_DEFINITIONS.carrier.droneCount);
  });

  it('resets previous heavy-class health when returning to a blank Core build', () => {
    const game = createGame();
    const playerId = game.addPlayer('Tester');
    applyDebugBuild(game, playerId, { playerClass: 'fortress', level: GAME.maxLevel, preset: 'defense' });
    applyDebugBuild(game, playerId, { playerClass: 'core', level: 10, preset: 'blank' });
    const player = (game as unknown as Internals).players.get(playerId);

    expect(player.playerClass).toBe('core');
    expect(player.level).toBe(10);
    expect(player.maxHealth).toBe(CLASS_DEFINITIONS.core.maxHealth);
    expect(player.health).toBe(player.maxHealth);
    expect(player.availablePoints).toBe(9);
  });

  it('heals and clears projectiles without touching player identity', () => {
    const game = createGame();
    const playerId = game.addPlayer('Tester');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.health = 5;
    internals.projectiles.set('one', { ownerId: playerId });
    internals.projectiles.set('two', { ownerId: 'other' });

    expect(healDebugPlayer(game, playerId)).toBe(true);
    expect(player.health).toBe(player.maxHealth);
    clearDebugProjectiles(game);
    expect(internals.projectiles.size).toBe(0);
    expect(player.id).toBe(playerId);
  });
});
