import { describe, expect, it } from 'vitest';
import { MazeGame } from './game';
import { tuneProgression } from './progression-tuning';

describe('progression tuning', () => {
  it('multiplies XP while preserving the base leaderboard score', () => {
    const game = tuneProgression(new MazeGame(0));
    const playerId = game.addPlayer('Tester');
    const internals = game as unknown as {
      players: Map<string, { xp: number; score: number; dead: boolean }>;
      awardXp(player: { xp: number; score: number; dead: boolean }, amount: number): void;
    };
    const player = internals.players.get(playerId);
    expect(player).toBeDefined();
    if (!player) return;
    internals.awardXp(player, 20);
    expect(player.xp).toBe(100);
    expect(player.score).toBe(20);
  });

  it('does not grant delayed rewards to a dead player', () => {
    const game = tuneProgression(new MazeGame(0));
    const playerId = game.addPlayer('Tester');
    const internals = game as unknown as {
      players: Map<string, { xp: number; score: number; dead: boolean }>;
      awardXp(player: { xp: number; score: number; dead: boolean }, amount: number): void;
    };
    const player = internals.players.get(playerId);
    expect(player).toBeDefined();
    if (!player) return;
    player.dead = true;
    internals.awardXp(player, 20);
    expect(player.xp).toBe(0);
    expect(player.score).toBe(0);
  });
});
