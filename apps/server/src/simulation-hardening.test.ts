import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { MazeGame } from './game';
import { hardenSimulation } from './simulation-hardening';

type MutableGame = {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  shapes: Map<string, any>;
  resolveProjectileCollisions(): void;
  stepProjectiles(dt: number, now: number): void;
  resolvePlayerCollisions(now: number): void;
};

describe('simulation hardening', () => {
  it('does not expose entities outside the fixed 16:9 viewport', () => {
    const game = hardenSimulation(new MazeGame(0));
    const selfId = game.addPlayer('Self');
    const otherId = game.addPlayer('Other');
    const internals = game as unknown as MutableGame;
    const self = internals.players.get(selfId);
    const other = internals.players.get(otherId);
    self.position = { x: 3000, y: 2000 };
    other.position = { x: 3000 + GAME.visibleWorldWidth / 2 + 120, y: 2000 };
    expect(game.snapshot(selfId).players.some((player) => player.id === otherId)).toBe(false);
  });

  it('applies damage to the same target only once per projectile', () => {
    const game = hardenSimulation(new MazeGame(0));
    const ownerId = game.addPlayer('Owner');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as MutableGame;
    const owner = internals.players.get(ownerId);
    const target = internals.players.get(targetId);
    owner.position = { x: 3000, y: 2000 };
    target.position = { x: 3050, y: 2000 };
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    // Shapes spawnen zufällig – liegt eine auf der Projektilposition, schluckt
    // sie den Treffer vor dem Spieler und der Test würde vom Zufall abhängen.
    internals.shapes.clear();
    const initialHealth = target.health;
    internals.projectiles.set('projectile', {
      id: 'projectile', ownerId, position: { ...target.position }, velocity: { x: 0, y: 0 },
      radius: 8, integrity: 1000, maxIntegrity: 1000, damage: 10, life: 5
    });
    internals.stepProjectiles(1 / GAME.tickRate, Date.now());
    internals.stepProjectiles(1 / GAME.tickRate, Date.now() + 25);
    expect(target.health).toBe(initialHealth - 10);
  });

  it('scales Blitz body damage with momentum', () => {
    const measureRamDamage = (velocityX: number): number => {
      const game = hardenSimulation(new MazeGame(0));
      const ramId = game.addPlayer('Blitz');
      const targetId = game.addPlayer('Target');
      const internals = game as unknown as MutableGame;
      const rammer = internals.players.get(ramId);
      const target = internals.players.get(targetId);
      rammer.playerClass = 'blitz';
      rammer.position = { x: 2800, y: 2200 };
      rammer.velocity = { x: velocityX, y: 0 };
      rammer.invulnerable = false;
      target.position = { x: 2800 + GAME.playerRadius * 2 - 4, y: 2200 };
      target.invulnerable = false;
      // Gleiche Zufallsquelle wie oben: Eine Shape am Messpunkt würde zusätzlichen
      // Körperschaden beisteuern und das Verhältnis verfälschen.
      internals.shapes.clear();
      const before = target.health;
      internals.resolvePlayerCollisions(Date.now());
      return before - target.health;
    };

    const standing = measureRamDamage(0);
    const fullSpeed = measureRamDamage(320);
    expect(standing).toBeGreaterThan(0);
    expect(fullSpeed / standing).toBeCloseTo(1.35 / 0.6, 1);
  });

  it('resolves a projectile pair only once', () => {
    const game = hardenSimulation(new MazeGame(0));
    const internals = game as unknown as MutableGame;
    internals.projectiles.set('a', { id: 'a', ownerId: 'one', position: { x: 100, y: 100 }, velocity: { x: 0, y: 0 }, radius: 8, integrity: 100, maxIntegrity: 100, damage: 10, life: 5 });
    internals.projectiles.set('b', { id: 'b', ownerId: 'two', position: { x: 100, y: 100 }, velocity: { x: 0, y: 0 }, radius: 8, integrity: 100, maxIntegrity: 100, damage: 10, life: 5 });
    internals.resolveProjectileCollisions();
    internals.resolveProjectileCollisions();
    expect(internals.projectiles.get('a').integrity).toBe(90);
    expect(internals.projectiles.get('b').integrity).toBe(90);
  });
});
