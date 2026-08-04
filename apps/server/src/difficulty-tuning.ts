import type { PlayerSnapshot } from '@project-maze/shared';
import { MazeGame } from './game.js';

type RuntimeBot = {
  reactionMs: number;
  aimError: number;
  fleeHealth: number;
  preferredDistance: number;
  decisionAt: number;
};
type RuntimePlayer = PlayerSnapshot & { bot: RuntimeBot | null };
interface DifficultyInternals { players: Map<string, RuntimePlayer>; }

/**
 * Keeps bot identities intact while removing superhuman reaction and aim values.
 * This remains isolated until bot personalities move into their own server system.
 */
export function tuneDifficulty<T extends MazeGame>(game: T): T {
  const internals = game as unknown as DifficultyInternals;
  let index = 0;
  for (const player of internals.players.values()) {
    const bot = player.bot;
    if (!bot) continue;
    bot.reactionMs = 280 + (index % 5) * 55;
    bot.aimError = Math.max(0.14, bot.aimError * 1.75);
    bot.fleeHealth = Math.max(bot.fleeHealth, index % 3 === 0 ? 0.38 : 0.3);
    bot.preferredDistance += index % 2 === 0 ? 35 : -20;
    bot.decisionAt = Date.now() + bot.reactionMs;
    index += 1;
  }
  return game;
}
