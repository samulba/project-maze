import type { PlayerClass, PlayerSnapshot } from '@project-maze/shared';
import { MazeGame } from './game.js';

type RuntimeBot = {
  style: 'farmer' | 'hunter' | 'kiter' | 'brawler' | 'controller';
  reactionMs: number;
  aimError: number;
  fleeHealth: number;
  preferredDistance: number;
  decisionAt: number;
  classPath: PlayerClass[];
};
type RuntimePlayer = PlayerSnapshot & { bot: RuntimeBot | null };
interface DifficultyInternals { players: Map<string, RuntimePlayer>; }

function alternateClassPath(bot: RuntimeBot, index: number): PlayerClass[] {
  const alternate = index % 2 === 1;
  if (bot.style === 'farmer') return alternate ? ['rapid', 'repeater', 'gatling'] : ['rapid', 'twin', 'storm'];
  if (bot.style === 'hunter') return alternate ? ['sniper', 'hunter', 'phantom'] : ['sniper', 'railgun', 'lancer'];
  if (bot.style === 'kiter') return alternate ? ['sniper', 'hunter', 'phantom'] : ['sniper', 'railgun', 'lancer'];
  if (bot.style === 'controller') return alternate ? ['drone', 'factory', 'carrier'] : ['drone', 'warden', 'overseer'];
  return alternate ? ['rammer', 'bulwark', 'fortress'] : ['rammer', 'crusher', 'juggernaut'];
}

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
    bot.classPath = alternateClassPath(bot, index);
    bot.decisionAt = Date.now() + bot.reactionMs;
    index += 1;
  }
  return game;
}
