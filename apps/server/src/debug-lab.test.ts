import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import {
  applyDebugBuild,
  clearDebugDummies,
  clearDebugProjectiles,
  healDebugPlayer,
  setDebugBotsPaused,
  setDebugGodMode,
  spawnDebugDummy,
  tuneDebugRules
} from './debug-lab';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  drones: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  updateBot(player: any, now: number): void;
}

const createGame = (bots = 0): MazeGame => tuneDebugRules(tuneDrones(tuneCombatScaling(new MazeGame(bots))));

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

  it('blocks incoming damage while local god mode is active', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Attacker');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const target = internals.players.get(targetId);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    const initial = target.health;

    setDebugGodMode(game, targetId, true);
    internals.damagePlayer(target, 40, attackerId, Date.now());
    expect(target.health).toBe(initial);
    setDebugGodMode(game, targetId, false);
    internals.damagePlayer(target, 40, attackerId, Date.now() + 1);
    expect(target.health).toBe(initial - 40);
  });

  it('pauses bot decisions without deleting bot identities', () => {
    const game = createGame(1);
    const internals = game as unknown as Internals;
    const bot = [...internals.players.values()].find((player) => player.bot);
    expect(bot).toBeTruthy();
    bot.move = { x: 1, y: 1 };
    bot.primary = true;
    bot.secondary = true;

    setDebugBotsPaused(game, true);
    internals.updateBot(bot, Date.now());
    expect(bot.move).toEqual({ x: 0, y: 0 });
    expect(bot.primary).toBe(false);
    expect(bot.secondary).toBe(false);
    expect(bot.isBot).toBe(true);
  });

  it('spawns and clears a server-authoritative target tank', () => {
    const game = createGame();
    const ownerId = game.addPlayer('Tester');
    const internals = game as unknown as Internals;
    const owner = internals.players.get(ownerId);
    owner.position = { x: 3000, y: 2000 };
    owner.angle = 0;

    const dummyId = spawnDebugDummy(game, ownerId, 'fortress');
    expect(dummyId).not.toBeNull();
    const dummy = internals.players.get(dummyId as string);
    expect(dummy.playerClass).toBe('fortress');
    expect(dummy.level).toBe(GAME.maxLevel);
    expect(dummy.isBot).toBe(true);
    expect(dummy.bot).toBeNull();
    expect(Math.hypot(dummy.position.x - owner.position.x, dummy.position.y - owner.position.y)).toBeGreaterThan(200);

    clearDebugDummies(game);
    expect(internals.players.has(dummyId as string)).toBe(false);
  });

  it('rebuilds destroyed targets at the same position and class', () => {
    const game = createGame();
    const ownerId = game.addPlayer('Tester');
    const internals = game as unknown as Internals;
    const owner = internals.players.get(ownerId);
    owner.position = { x: 3000, y: 2000 };
    owner.angle = 0;
    const now = Date.now();
    const dummyId = spawnDebugDummy(game, ownerId, 'bulwark', now) as string;
    const dummy = internals.players.get(dummyId);
    const position = { ...dummy.position };

    internals.damagePlayer(dummy, dummy.maxHealth * 2, ownerId, now + 10);
    expect(dummy.dead).toBe(true);
    game.step(1 / GAME.tickRate, now + 1300);

    expect(dummy.dead).toBe(false);
    expect(dummy.playerClass).toBe('bulwark');
    expect(dummy.health).toBe(dummy.maxHealth);
    expect(dummy.position.x).toBeCloseTo(position.x, 4);
    expect(dummy.position.y).toBeCloseTo(position.y, 4);
  });
});
