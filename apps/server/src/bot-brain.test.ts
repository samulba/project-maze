import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
import {
  BOT_CLASS_PATHS,
  MAX_ATTACKERS_PER_TARGET,
  ROOKIE_PROTECTION_LEVEL,
  TIER_SEQUENCE,
  tuneBotBrain
} from './bot-brain';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';

interface Internals {
  players: Map<string, any>;
  updateBot(player: any, now: number): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

const createGame = (botCount: number): MazeGame => tuneBotBrain(tuneCombatScaling(new MazeGame(botCount)));

const botsByStyle = (internals: Internals, style: string): any[] =>
  [...internals.players.values()].filter((player) => player.bot?.style === style);

describe('bot brain', () => {
  it('protects fresh low-level players until they attack first', () => {
    const game = createGame(2);
    const humanId = game.addPlayer('Fresh');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    const hunter = botsByStyle(internals, 'hunter')[0];
    expect(hunter).toBeDefined();

    hunter.position = { x: 2800, y: 2200 };
    human.position = { x: 2900, y: 2200 };
    human.level = 1;
    human.invulnerable = false;
    human.invulnerableUntil = 0;
    for (const player of internals.players.values()) {
      if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
    }

    internals.updateBot(hunter, 10_000);
    expect(hunter.bot.targetId).toBeNull();
    expect(human.level).toBeLessThan(ROOKIE_PROTECTION_LEVEL);

    internals.damagePlayer(hunter, 5, humanId, 10_500);
    hunter.bot.decisionAt = 0;
    internals.updateBot(hunter, 11_000);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('leads moving targets instead of aiming at their current position', () => {
    const game = createGame(2);
    const humanId = game.addPlayer('Runner');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    const hunter = botsByStyle(internals, 'hunter')[0];

    hunter.position = { x: 2800, y: 2200 };
    human.position = { x: 2900, y: 2200 };
    human.velocity = { x: 0, y: 220 };
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;
    for (const player of internals.players.values()) {
      if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
    }

    internals.updateBot(hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);
    expect(hunter.aim.y).toBeGreaterThan(0);
  });

  it('limits how many bots hunt the same target', () => {
    const game = createGame(8);
    const humanId = game.addPlayer('Star');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    human.position = { x: 2800, y: 2200 };
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;

    const aggressive = [...botsByStyle(internals, 'hunter'), ...botsByStyle(internals, 'brawler')].slice(0, 3);
    expect(aggressive).toHaveLength(3);
    for (const player of internals.players.values()) {
      if (player !== human && !aggressive.includes(player)) player.position = { x: 240, y: 240 };
    }
    aggressive[0].position = { x: 2700, y: 2200 };
    aggressive[1].position = { x: 2900, y: 2300 };
    aggressive[2].position = { x: 2850, y: 2100 };

    let now = 10_000;
    for (const bot of aggressive) {
      bot.bot.decisionAt = 0;
      internals.updateBot(bot, now);
      now += 50;
    }
    const hunting = aggressive.filter((bot) => bot.bot.targetId === humanId);
    expect(hunting.length).toBeLessThanOrEqual(MAX_ATTACKERS_PER_TARGET);
    expect(hunting.length).toBeGreaterThan(0);
  });

  it('keeps a fair skill mix and only valid class paths', () => {
    const rookies = TIER_SEQUENCE.filter((tier) => tier === 'rookie').length;
    const veterans = TIER_SEQUENCE.filter((tier) => tier === 'veteran').length;
    const elites = TIER_SEQUENCE.filter((tier) => tier === 'elite').length;
    expect(rookies).toBe(2);
    expect(veterans).toBe(2);
    expect(elites).toBe(1);

    for (const paths of Object.values(BOT_CLASS_PATHS)) {
      expect(paths).toHaveLength(3);
      for (const [tier2, tier3, tier4] of paths) {
        expect(CLASS_DEFINITIONS[tier2!].parent).toBe('core');
        expect(CLASS_DEFINITIONS[tier3!].parent).toBe(tier2);
        expect(CLASS_DEFINITIONS[tier4!].parent).toBe(tier3);
      }
    }
  });
});
