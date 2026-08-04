import type { PlayerSnapshot } from '@project-maze/shared';
import { MazeGame } from './game.js';

type RuntimePlayer = PlayerSnapshot & { score: number };
interface ProgressionInternals {
  awardXp(player: RuntimePlayer, amount: number): void;
}

const XP_MULTIPLIER = 5;

/** Speeds up progression without inflating leaderboard score. */
export function tuneProgression<T extends MazeGame>(game: T): T {
  const internals = game as unknown as ProgressionInternals;
  const originalAwardXp = internals.awardXp.bind(internals);
  internals.awardXp = (player: RuntimePlayer, amount: number): void => {
    const scoreBefore = player.score;
    const baseReward = Math.max(0, Math.round(amount));
    originalAwardXp(player, baseReward * XP_MULTIPLIER);
    player.score = scoreBefore + baseReward;
  };
  return game;
}
