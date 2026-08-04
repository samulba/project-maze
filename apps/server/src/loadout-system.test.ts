import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { PASSIVE_MODIFIER_DEFINITIONS } from '@project-maze/shared/gameplay';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system';

interface Internals {
  players: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

const createGame = (): MazeGame => tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)));

describe('core modules and passive frames', () => {
  it('moves with Dash, blocks immediate reuse and does not grant invulnerability', () => {
    const game = createGame();
    const playerId = game.addPlayer('Dasher');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.position = { x: 3000, y: 2000 };
    expect(equipLoadout(game, playerId, 'dash', 'standard', 1000)).toBe(true);
    game.applyInput(playerId, { type: 'input', sequence: 1, move: { x: 1, y: 0 }, aim: { x: 500, y: 0 }, primary: false, secondary: false });

    const before = player.position.x;
    expect(activateModule(game, playerId, 2000)).toBe(true);
    expect(player.position.x).toBeGreaterThan(before + 80);
    expect(player.invulnerable).toBe(false);
    const after = player.position.x;
    expect(activateModule(game, playerId, 2001)).toBe(false);
    expect(player.position.x).toBe(after);
  });

  it('absorbs frontal Barrier damage but not attacks from behind', () => {
    const game = createGame();
    const targetId = game.addPlayer('Barrier');
    const attackerId = game.addPlayer('Attacker');
    const internals = game as unknown as Internals;
    const target = internals.players.get(targetId);
    const attacker = internals.players.get(attackerId);
    target.position = { x: 3000, y: 2000 };
    target.angle = 0;
    attacker.position = { x: 3100, y: 2000 };
    equipLoadout(game, targetId, 'barrier', 'standard', 1000);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    activateModule(game, targetId, 2000);
    const initial = target.health;

    internals.damagePlayer(target, 40, attackerId, 2050);
    expect(target.health).toBe(initial);
    const snapshot = game.snapshot(targetId, 2050) as any;
    expect(snapshot.gameplay[targetId].barrierHealth).toBe(30);

    attacker.position = { x: 2900, y: 2000 };
    internals.damagePlayer(target, 40, attackerId, 2100);
    expect(target.health).toBe(initial - 40);
  });

  it('heals through Repair Cycle and cancels it when damage arrives', () => {
    const game = createGame();
    const playerId = game.addPlayer('Repair');
    const attackerId = game.addPlayer('Attacker');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    equipLoadout(game, playerId, 'repair', 'standard', 1000);
    player.health = player.maxHealth * 0.45;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    player.lastDamageAt = 2000;
    expect(activateModule(game, playerId, 3000)).toBe(true);

    const before = player.health;
    game.step(1 / GAME.tickRate, 4400);
    expect(player.health).toBeGreaterThan(before);
    internals.damagePlayer(player, 5, attackerId, 4450);
    const afterDamage = player.health;
    game.step(1 / GAME.tickRate, 5200);
    expect(player.health).toBeCloseTo(afterDamage, 4);
    const snapshot = game.snapshot(playerId, 5200) as any;
    expect(snapshot.gameplay[playerId].repairing).toBe(false);
  });

  it('applies passive trade-offs through the central stat calculation', () => {
    const game = createGame();
    const playerId = game.addPlayer('Frames');
    const player = (game as unknown as Internals).players.get(playerId);
    const standard = tunedStatsFor(player);

    equipLoadout(game, playerId, 'dash', 'lightweight', 1000);
    const lightweight = tunedStatsFor(player);
    expect(lightweight.moveSpeed).toBeCloseTo(standard.moveSpeed * PASSIVE_MODIFIER_DEFINITIONS.lightweight.moveMultiplier, 4);
    expect(lightweight.maxHealth).toBeLessThan(standard.maxHealth);

    equipLoadout(game, playerId, 'dash', 'stabilizer', 2000);
    const stabilizer = tunedStatsFor(player);
    expect(stabilizer.projectileSpeed).toBeCloseTo(standard.projectileSpeed * 1.1, 4);
    expect(stabilizer.reload).toBeGreaterThan(standard.reload);
  });
});
