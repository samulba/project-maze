import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling } from './combat-tuning';
import { applyDebugBuild } from './debug-lab';
import { MazeGame } from './game';

interface Internals {
  players: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

const createGame = (): MazeGame => tuneClassMechanics(tuneCombatScaling(new MazeGame(0)));

function preparePlayer(game: MazeGame, id: string, playerClass: any, level: number): any {
  applyDebugBuild(game, id, { playerClass, level, preset: 'blank' });
  const player = (game as unknown as Internals).players.get(id);
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  return player;
}

describe('class mechanics', () => {
  it('reduces frontal damage for Bulwark but not rear damage', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Attacker');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'core', 10);
    const target = preparePlayer(game, targetId, 'bulwark', 24);
    target.position = { x: 3000, y: 2000 };
    target.angle = 0;
    attacker.position = { x: 3100, y: 2000 };
    const maximum = target.maxHealth;

    internals.damagePlayer(target, 100, attackerId, Date.now());
    expect(maximum - target.health).toBeCloseTo(74, 4);

    target.health = maximum;
    attacker.position = { x: 2900, y: 2000 };
    internals.damagePlayer(target, 100, attackerId, Date.now() + 1);
    expect(maximum - target.health).toBeCloseTo(100, 4);
  });

  it('gives precision classes readable hit knockback', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Lancer');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'lancer', 38);
    const target = preparePlayer(game, targetId, 'core', 10);
    attacker.position = { x: 2900, y: 2000 };
    target.position = { x: 3000, y: 2000 };
    target.velocity = { x: 0, y: 0 };

    internals.damagePlayer(target, 10, attackerId, Date.now());
    expect(target.velocity.x).toBeGreaterThan(45);
    expect(Math.abs(target.velocity.y)).toBeLessThan(0.001);
  });

  it('keeps all class mechanic numbers finite', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Attacker');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'phantom', GAME.maxLevel);
    const target = preparePlayer(game, targetId, 'fortress', GAME.maxLevel);
    attacker.position = { x: 3000, y: 2000 };
    target.position = { x: 3100, y: 2000 };
    target.angle = Math.PI;
    internals.damagePlayer(target, 30, attackerId, Date.now());
    expect(Number.isFinite(target.health)).toBe(true);
    expect(Number.isFinite(target.velocity.x)).toBe(true);
    expect(Number.isFinite(target.velocity.y)).toBe(true);
  });
});
