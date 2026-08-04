import { describe, expect, it } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  damageShape(shape: any, damage: number, ownerId: string, now: number): void;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (): MazeGame => tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))));

describe('arena systems', () => {
  it('promotes rare elite shapes and grants a bonus when they are destroyed', () => {
    const game = createGame();
    const playerId = game.addPlayer('Farmer');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now + 19_000);
    const snapshot = game.snapshot(playerId, now + 19_000) as any;
    expect(snapshot.eliteShapeIds.length).toBeGreaterThan(0);

    const eliteId = snapshot.eliteShapeIds[0] as string;
    const elite = internals.shapes.get(eliteId);
    const player = internals.players.get(playerId);
    const before = player.score;
    internals.damageShape(elite, elite.health + 1, playerId, now + 19_100);
    expect(player.score - before).toBeGreaterThanOrEqual(260);
  });

  it('runs Core Surge through warning and active phases', () => {
    const game = createGame();
    const playerId = game.addPlayer('Observer');
    const now = Date.now();
    game.step(1 / 40, now + 66_000);
    const warning = game.snapshot(playerId, now + 66_000) as any;
    expect(warning.arenaEvent?.kind).toBe('coreSurge');
    expect(warning.arenaEvent?.phase).toBe('warning');

    game.step(1 / 40, warning.arenaEvent.startsAt + 1);
    const active = game.snapshot(playerId, warning.arenaEvent.startsAt + 1) as any;
    expect(active.arenaEvent?.phase).toBe('active');
  });

  it('marks a dominant player and awards the bounty only once per claim pair', () => {
    const game = createGame();
    const hunterId = game.addPlayer('Hunter');
    const targetId = game.addPlayer('Leader');
    const internals = game as unknown as Internals;
    const hunter = internals.players.get(hunterId);
    const target = internals.players.get(targetId);
    target.level = 20;
    target.kills = 5;
    target.score = 4_000;
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    const now = Date.now();

    game.step(1 / 40, now + 2_000);
    const snapshot = game.snapshot(hunterId, now + 2_000) as any;
    expect(snapshot.bountyTargetId).toBe(targetId);
    expect(snapshot.bountyValue).toBeGreaterThan(0);

    const before = hunter.score;
    internals.killPlayer(target, hunterId, now + 2_100, 'Arena');
    expect(hunter.score - before).toBeGreaterThanOrEqual(snapshot.bountyValue);
    const after = game.snapshot(hunterId, now + 2_100) as any;
    expect(after.bountyTargetId).toBeNull();
  });
});
