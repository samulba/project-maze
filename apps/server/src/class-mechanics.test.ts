import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { applyDebugBuild } from './debug-lab';
import { MazeGame } from './game';

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  fire(player: any, stats: any): void;
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

  it('tightens Gatling spread while continuous fire is maintained', () => {
    const game = createGame();
    const playerId = game.addPlayer('Gatling');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'gatling', 38);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };
    const stats = tunedStatsFor(player);

    internals.fire(player, stats);
    const firstSpread = Math.max(...[...internals.projectiles.values()].map((projectile) => Math.abs(projectile.velocity.y)));
    internals.projectiles.clear();
    internals.fire(player, stats);
    const secondSpread = Math.max(...[...internals.projectiles.values()].map((projectile) => Math.abs(projectile.velocity.y)));

    expect(secondSpread).toBeLessThan(firstSpread);
    expect(secondSpread).toBeGreaterThan(0);
  });

  it('passt Storms Kugelwand-Integrität an, ohne den Direktschaden zu erhöhen', () => {
    const game = createGame();
    const playerId = game.addPlayer('Storm');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'storm', 38);
    const stats = tunedStatsFor(player);

    internals.fire(player, stats);
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(4);
    for (const projectile of projectiles) {
      expect(projectile.damage).toBeCloseTo(stats.damage, 5);
      // 0.95: Der Tempo-Dämpfer hält ~25 % mehr Storm-Kugeln gleichzeitig in
      // der Luft – der gesenkte Faktor gleicht den Neben-Buff der Wand aus.
      expect(projectile.integrity).toBeCloseTo(stats.penetration * 0.95, 5);
      expect(projectile.maxIntegrity).toBeCloseTo(stats.penetration * 0.95, 5);
    }
  });

  it('fires Flanker barrels forward and backward', () => {
    const game = createGame();
    const playerId = game.addPlayer('Flanker');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'flanker', 24);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };

    internals.fire(player, tunedStatsFor(player));
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(2);
    const directions = projectiles.map((projectile) => Math.sign(projectile.velocity.x)).sort();
    expect(directions).toEqual([-1, 1]);
  });

  it('covers every direction with Octo barrels', () => {
    const game = createGame();
    const playerId = game.addPlayer('Octo');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'octo', 38);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };

    internals.fire(player, tunedStatsFor(player));
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(8);
    const angles = projectiles.map((projectile) => Math.atan2(projectile.velocity.y, projectile.velocity.x));
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const from = -Math.PI + quadrant * Math.PI / 2;
      expect(angles.some((angle) => angle >= from - 0.01 && angle <= from + Math.PI / 2 + 0.01)).toBe(true);
    }
  });

  it('grants Deadeye bonus damage only against heavily wounded targets', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Deadeye');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'deadeye', 38);
    const target = preparePlayer(game, targetId, 'core', 10);
    attacker.position = { x: 2900, y: 2000 };
    target.position = { x: 3000, y: 2000 };

    target.health = target.maxHealth;
    internals.damagePlayer(target, 10, attackerId, Date.now());
    expect(target.maxHealth - target.health).toBeCloseTo(10, 4);

    target.health = target.maxHealth * 0.2;
    const before = target.health;
    internals.damagePlayer(target, 10, attackerId, Date.now() + 1);
    expect(before - target.health).toBeCloseTo(12.5, 4);
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
