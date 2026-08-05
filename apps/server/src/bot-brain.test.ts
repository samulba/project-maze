import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
import {
  BOT_CLASS_PATHS,
  DEFAULT_BOT_PACING,
  MAX_ATTACKERS_PER_TARGET,
  ROOKIE_PROTECTION_LEVEL,
  TIER_SEQUENCE,
  type BotPacingConfig,
  tuneBotBrain
} from './bot-brain';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame, botState } from './game';

interface Internals {
  players: Map<string, any>;
  updateBot(player: any, now: number): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (botCount: number, pacing: BotPacingConfig | null = DEFAULT_BOT_PACING): MazeGame =>
  tuneBotBrain(tuneCombatScaling(new MazeGame(botCount)), pacing);

const botsByStyle = (internals: Internals, style: string): any[] =>
  [...internals.players.values()].filter((player) => player.bot?.style === style);

/**
 * Ein Jäger, ein Mensch, freies Feld – alle anderen weit außer Reichweite.
 * Die Koordinaten liegen nachweislich frei und in Sichtlinie zueinander; der
 * Jäger ist der einzige Stil mit Angriffslust 1.0 und damit der einzige, der
 * ohne Zufall entscheidet (Teamplan-Regel 8).
 */
const duel = (pacing: BotPacingConfig | null = DEFAULT_BOT_PACING) => {
  const game = createGame(2, pacing);
  const internals = game as unknown as Internals;
  const humanId = game.addPlayer('Ziel');
  const human = internals.players.get(humanId);
  const hunter = botsByStyle(internals, 'hunter')[0];
  const victim = botsByStyle(internals, 'farmer')[0];

  hunter.position = { x: 2800, y: 2200 };
  human.position = { x: 2900, y: 2200 };
  human.level = 20;
  human.invulnerable = false;
  human.invulnerableUntil = 0;
  for (const player of internals.players.values()) {
    if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
  }
  return { game, internals, humanId, human, hunter, victim };
};

/** Erzwingt eine frische Zielentscheidung, statt auf das Reaktionsfenster zu warten. */
const decide = (internals: Internals, bot: any, now: number): void => {
  bot.bot.decisionAt = 0;
  internals.updateBot(bot, now);
};

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

  it('gönnt Menschen nach einem Abschuss eine Verschnaufpause', () => {
    const { internals, humanId, hunter, victim } = duel();
    decide(internals, hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // Der Jäger holt sich einen anderen Abschuss – danach lässt er von Menschen ab.
    internals.killPlayer(victim, hunter.id, 11_000, 'Arena');
    expect(hunter.bot.targetId).toBeNull();

    decide(internals, hunter, 12_000);
    expect(hunter.bot.targetId).toBeNull();
    decide(internals, hunter, 11_000 + DEFAULT_BOT_PACING.killDisengageMs - 1);
    expect(hunter.bot.targetId).toBeNull();

    decide(internals, hunter, 11_000 + DEFAULT_BOT_PACING.killDisengageMs + 1);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('bricht eine erfolglose Jagd nach dem Timeout ab und lässt das Ziel ziehen', () => {
    const { internals, humanId, hunter } = duel();
    const start = 10_000;
    const { huntTimeoutMs, huntGiveUpMs } = DEFAULT_BOT_PACING;
    decide(internals, hunter, start);
    expect(hunter.bot.targetId).toBe(humanId);

    // Punktgenau am Limit läuft die Jagd noch.
    decide(internals, hunter, start + huntTimeoutMs);
    expect(hunter.bot.targetId).toBe(humanId);

    decide(internals, hunter, start + huntTimeoutMs + 1);
    expect(hunter.bot.targetId).toBeNull();

    // Wer entkommen ist, bleibt für diesen Bot eine Weile unsichtbar …
    decide(internals, hunter, start + huntTimeoutMs + huntGiveUpMs);
    expect(hunter.bot.targetId).toBeNull();
    // … danach darf er wieder gejagt werden.
    decide(internals, hunter, start + huntTimeoutMs + huntGiveUpMs + 2);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('stellt den Jagd-Timeout mit jedem eigenen Treffer neu', () => {
    const { internals, humanId, human, hunter } = duel();
    const start = 10_000;
    const hit = 15_000;
    const { huntTimeoutMs } = DEFAULT_BOT_PACING;
    decide(internals, hunter, start);
    expect(hunter.bot.targetId).toBe(humanId);

    internals.damagePlayer(human, 5, hunter.id, hit);
    // 8,5 s nach der Zielaufnahme, aber nur 3,5 s nach dem Treffer: bleibt dran.
    decide(internals, hunter, start + huntTimeoutMs + 500);
    expect(hunter.bot.targetId).toBe(humanId);

    decide(internals, hunter, hit + huntTimeoutMs + 1);
    expect(hunter.bot.targetId).toBeNull();
  });

  it('lässt auch Vergeltung keinen dritten Angreifer auf denselben Menschen zu', () => {
    const game = createGame(8);
    const internals = game as unknown as Internals;
    const humanId = game.addPlayer('Star');
    const human = internals.players.get(humanId);
    human.position = { x: 2800, y: 2200 };
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;

    const attackers = [...botsByStyle(internals, 'hunter'), ...botsByStyle(internals, 'brawler')].slice(0, 3);
    expect(attackers).toHaveLength(3);
    for (const player of internals.players.values()) {
      if (player !== human && !attackers.includes(player)) player.position = { x: 240, y: 240 };
    }
    // Gleiche Level und je 100 Einheiten Abstand: Der Mensch ist für alle drei
    // das nächste und bestbewertete Ziel, ganz ohne Zufall.
    const ring = [{ x: 2800, y: 2100 }, { x: 2800, y: 2300 }, { x: 2700, y: 2200 }];
    attackers.forEach((bot, index) => {
      bot.position = ring[index]!;
      bot.level = human.level;
    });

    decide(internals, attackers[0], 10_000);
    decide(internals, attackers[1], 10_050);
    expect(attackers[0].bot.targetId).toBe(humanId);
    expect(attackers[1].bot.targetId).toBe(humanId);

    // Der Dritte prallt am Deckel ab – auch nachdem der Mensch ihn getroffen hat.
    decide(internals, attackers[2], 10_100);
    expect(attackers[2].bot.targetId).not.toBe(humanId);
    internals.damagePlayer(attackers[2], 5, humanId, 10_150);
    decide(internals, attackers[2], 10_200);
    expect(attackers[2].bot.targetId).not.toBe(humanId);

    // Der Deckel darf keinen der beiden Plätze kosten: Wer drauf ist, bleibt drauf.
    decide(internals, attackers[0], 10_250);
    expect(attackers[0].bot.targetId).toBe(humanId);
  });

  it('schickt mehr Bots zum Farmen als zum Jagen', () => {
    const stylesOf = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => botState(index).style);

    // Die übliche Arena (acht Bots) enthält weiterhin jeden Stil …
    const arena = stylesOf(8);
    for (const style of ['farmer', 'hunter', 'kiter', 'brawler', 'controller']) {
      expect(arena).toContain(style);
    }
    // … aber Farmer sind die größte Gruppe, und die Sniper-Stile schrumpfen.
    expect(arena.filter((style) => style === 'farmer').length).toBe(3);
    expect(arena.filter((style) => style === 'hunter' || style === 'kiter').length).toBeLessThanOrEqual(3);

    // Über eine volle Runde der Stilfolge: 40 % Farmer statt vorher 20 %.
    const cycle = stylesOf(30);
    expect(cycle.filter((style) => style === 'farmer').length / cycle.length).toBeCloseTo(0.4, 5);

    // Und die Angriffslust passt zum Stil – Farmer gehen selten ran.
    expect(DEFAULT_BOT_PACING.styleAggression.farmer).toBeLessThan(0.4);
    expect(DEFAULT_BOT_PACING.styleAggression.hunter).toBe(1);
  });

  it('verhält sich ohne Pacing-Konfiguration exakt wie vorher', () => {
    const { internals, humanId, hunter, victim } = duel(null);
    decide(internals, hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // Keine Verschnaufpause nach dem Abschuss …
    internals.killPlayer(victim, hunter.id, 11_000, 'Arena');
    decide(internals, hunter, 12_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // … und kein Jagd-Timeout, egal wie lange die Jagd erfolglos bleibt.
    decide(internals, hunter, 10_000 + DEFAULT_BOT_PACING.huntTimeoutMs * 4);
    expect(hunter.bot.targetId).toBe(humanId);
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
