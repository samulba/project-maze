import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import {
  DEFAULT_DIRECTOR_CONFIG,
  arenaDirectorStatus,
  botLevelFor,
  medianOf,
  pickDespawnCandidate,
  targetBotCount,
  tuneArenaDirector
} from './arena-director';
import { tuneBotBrain } from './bot-brain';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { hardenSimulation } from './simulation-hardening';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
}

const config = DEFAULT_DIRECTOR_CONFIG;

const createGame = (botCount: number, enabled = true): MazeGame =>
  tuneArenaDirector(
    tuneBotBrain(tuneClassMechanics(tuneDrones(tuneCombatScaling(hardenSimulation(new MazeGame(botCount)))))),
    enabled
  );

const botsOf = (game: MazeGame): any[] =>
  [...(game as unknown as Internals).players.values()].filter((player) => player.isBot && player.bot !== null);
const humansOf = (game: MazeGame): any[] =>
  [...(game as unknown as Internals).players.values()].filter((player) => !player.isBot);

/**
 * Parkt alle Menschen in der einen und alle Bots in der anderen Ecke – einzeln
 * aufgereiht, damit sie sich nicht gegenseitig rammen, und ohne Formen in der
 * Nähe. Nur so ist jeder lebende Bot ein zulässiger Despawn-Kandidat und die
 * Population konvergiert deterministisch statt zufällig.
 */
function park(game: MazeGame): void {
  const internals = game as unknown as Internals;
  for (const [id, shape] of internals.shapes) {
    if (shape.position.x > 3_400 && shape.position.y > 2_800) internals.shapes.delete(id);
    if (shape.position.x < 1_200 && shape.position.y < 1_200) internals.shapes.delete(id);
  }
  humansOf(game).forEach((human, index) => {
    human.position = { x: 200 + index * 70, y: 200 };
    human.velocity = { x: 0, y: 0 };
  });
  botsOf(game).forEach((bot, index) => {
    bot.position = { x: 5_700 - index * 70, y: 3_700 };
    bot.velocity = { x: 0, y: 0 };
    bot.lastDamageAt = 0;
  });
}

/** Schiebt die Uhr über beliebig viele Phasing-Fenster. */
function settle(game: MazeGame, start: number, windows = 20): number {
  let now = start;
  for (let index = 0; index < windows; index += 1) {
    now += config.phaseIntervalMs;
    park(game);
    game.step(1 / 40, now);
  }
  return now;
}

describe('Zielgröße der Population', () => {
  it('gibt einem Menschen eine volle Arena und nimmt je weiterem zwei Bots weg', () => {
    expect(targetBotCount(1)).toBe(11);
    expect(targetBotCount(2)).toBe(9);
    expect(targetBotCount(3)).toBe(7);
    expect(targetBotCount(4)).toBe(5);
  });

  it('hält die Untergrenze ein, egal wie voll die Arena wird', () => {
    expect(targetBotCount(5)).toBe(4);
    expect(targetBotCount(12)).toBe(4);
    expect(targetBotCount(GAME.maxPlayers)).toBe(config.minimumBots);
  });

  it('hält die leere Arena bevölkert, damit der erste Spieler nicht wartet', () => {
    expect(targetBotCount(0)).toBe(targetBotCount(1));
  });

  it('fällt zwischen zwei Stufen nie unter die Untergrenze oder über die Obergrenze', () => {
    for (let humans = 0; humans <= GAME.maxPlayers; humans += 1) {
      const target = targetBotCount(humans);
      expect(target).toBeGreaterThanOrEqual(config.minimumBots);
      expect(target).toBeLessThanOrEqual(config.baseBots);
    }
  });
});

describe('Startlevel neuer Bots', () => {
  it('bildet den Median auch bei gerader Anzahl', () => {
    expect(medianOf([5])).toBe(5);
    expect(medianOf([1, 9])).toBe(5);
    expect(medianOf([3, 1, 9, 7])).toBe(5);
    expect(medianOf([])).toBe(0);
  });

  it('liegt spürbar unter dem Median der Menschen', () => {
    expect(botLevelFor([20, 20, 20])).toBe(17);
    expect(botLevelFor([40])).toBe(34);
    const median = 30;
    expect(botLevelFor([10, median, 50])).toBeLessThan(median);
  });

  it('bleibt in gültigen Grenzen', () => {
    expect(botLevelFor([])).toBe(1);
    expect(botLevelFor([1])).toBe(1);
    expect(botLevelFor([GAME.maxLevel])).toBeLessThanOrEqual(GAME.maxLevel);
    expect(botLevelFor([GAME.maxLevel])).toBeGreaterThanOrEqual(1);
  });
});

describe('Despawn-Auswahl', () => {
  const bot = (id: string, x: number, lastDamageAt = 0, dead = false): any =>
    ({ id, position: { x, y: 0 }, dead, lastDamageAt, isBot: true, bot: {} });
  const human = (x: number): any => ({ id: `h${x}`, position: { x, y: 0 }, dead: false, isBot: false });

  it('nimmt zuerst einen toten Bot – egal wo er liegt', () => {
    const candidates = [bot('nah', 100), bot('tot', 120, 0, true), bot('fern', 9_000)];
    expect(pickDespawnCandidate(candidates, [human(0)], 100_000)?.id).toBe('tot');
  });

  it('verschont Bots in Sichtweite eines Menschen', () => {
    const candidates = [bot('nah', 400), bot('mittel', 1_200)];
    expect(pickDespawnCandidate(candidates, [human(0)], 100_000)).toBeNull();
  });

  it('nimmt den entferntesten Bot jenseits der Sichtweite', () => {
    const candidates = [bot('nah', 400), bot('fern', 3_000), bot('sehrFern', 5_000)];
    expect(pickDespawnCandidate(candidates, [human(0)], 100_000)?.id).toBe('sehrFern');
  });

  it('lässt einen Bot im Gefecht stehen, auch wenn er weit weg ist', () => {
    const now = 100_000;
    const fighting = bot('kaempft', 5_000, now - 1_000);
    expect(pickDespawnCandidate([fighting], [human(0)], now)).toBeNull();
    // Nach dem Gefechtsfenster darf er gehen.
    expect(pickDespawnCandidate([fighting], [human(0)], now + config.combatMs)?.id).toBe('kaempft');
  });

  it('behandelt tote Menschen nicht als Beobachter', () => {
    const watcher = { ...human(400), dead: true };
    expect(pickDespawnCandidate([bot('nah', 400)], [watcher], 100_000)?.id).toBe('nah');
  });
});

describe('Phasing im laufenden Spiel', () => {
  it('ändert die Population höchstens einmal je Fenster', () => {
    const game = createGame(0);
    const start = 1_000_000;
    expect(botsOf(game)).toHaveLength(0);

    game.step(1 / 40, start);
    expect(botsOf(game)).toHaveLength(1);

    // Innerhalb des Fensters passiert nichts mehr, egal wie oft gesteppt wird.
    for (let index = 1; index <= 20; index += 1) game.step(1 / 40, start + index * 100);
    expect(botsOf(game)).toHaveLength(1);

    game.step(1 / 40, start + config.phaseIntervalMs);
    expect(botsOf(game)).toHaveLength(2);
  });

  it('füllt eine leere Arena bis zur Zielgröße auf und hält dann still', () => {
    const game = createGame(0);
    const now = settle(game, 1_000_000);
    expect(botsOf(game)).toHaveLength(targetBotCount(0));

    game.step(1 / 40, now + config.phaseIntervalMs * 2);
    expect(botsOf(game)).toHaveLength(targetBotCount(0));
  });

  it('baut Bots ab, wenn Menschen dazukommen, und wieder auf, wenn sie gehen', () => {
    const game = createGame(11);
    let now = settle(game, 1_000_000, 1);
    expect(botsOf(game)).toHaveLength(11);

    const humanIds = [game.addPlayer('A'), game.addPlayer('B'), game.addPlayer('C')];
    expect(targetBotCount(3)).toBe(7);
    now = settle(game, now);
    expect(botsOf(game)).toHaveLength(7);

    for (const id of humanIds) game.removePlayer(id);
    now = settle(game, now);
    expect(botsOf(game)).toHaveLength(targetBotCount(0));
  });

  it('braucht für jeden Schritt ein eigenes Fenster', () => {
    const game = createGame(11);
    const start = 1_000_000;
    settle(game, start, 1);
    game.addPlayer('A');
    game.addPlayer('B');
    game.addPlayer('C');

    // Vier Bots zu viel: nach zwei Fenstern dürfen erst zwei weg sein.
    let now = start + config.phaseIntervalMs;
    for (let index = 0; index < 2; index += 1) {
      park(game);
      game.step(1 / 40, now);
      now += config.phaseIntervalMs;
    }
    expect(botsOf(game)).toHaveLength(9);
  });

  it('entfernt keinen Bot, solange alle in Sichtweite eines Menschen sind', () => {
    const game = createGame(11);
    settle(game, 1_000_000, 1);
    const humanId = game.addPlayer('Beobachter');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    human.position = { x: 3_000, y: 2_000 };

    let now = 2_000_000;
    for (let index = 0; index < 6; index += 1) {
      human.position = { x: 3_000, y: 2_000 };
      for (const bot of botsOf(game)) {
        bot.position = { x: 3_050, y: 2_000 };
        bot.dead = false;
        bot.lastDamageAt = now;
      }
      now += config.phaseIntervalMs;
      game.step(1 / 40, now);
    }
    // Zielgröße wäre 11, aber es sind 11 – niemand musste weichen.
    expect(botsOf(game)).toHaveLength(11);
    expect(arenaDirectorStatus(game).target).toBe(11);
  });
});

describe('Neue Bots im laufenden Spiel', () => {
  it('starten in der Nähe des Median-Levels der Menschen, aber darunter', () => {
    const game = createGame(0);
    const internals = game as unknown as Internals;
    for (const name of ['A', 'B', 'C']) {
      const id = game.addPlayer(name);
      internals.players.get(id).level = 30;
    }

    game.step(1 / 40, 1_000_000);
    const [fresh] = botsOf(game);
    expect(fresh).toBeDefined();
    expect(fresh.level).toBe(botLevelFor([30, 30, 30]));
    expect(fresh.level).toBeLessThan(30);
    // Über `respawn` eingestiegen: Punkte sind verteilt, Klasse ist aufgestiegen.
    expect(fresh.availablePoints).toBe(0);
    expect(fresh.playerClass).not.toBe('core');
    expect(fresh.health).toBe(fresh.maxHealth);
  });

  it('starten auf Level 1, solange niemand da ist', () => {
    const game = createGame(0);
    game.step(1 / 40, 1_000_000);
    expect(botsOf(game)[0].level).toBe(1);
  });

  it('bekommen einen vollständigen Bot-Zustand und werden gesteuert', () => {
    const game = createGame(0);
    game.step(1 / 40, 1_000_000);
    const [fresh] = botsOf(game);
    expect(fresh.bot).toBeTruthy();
    expect(typeof fresh.bot.style).toBe('string');
    expect(Array.isArray(fresh.bot.classPath)).toBe(true);
    expect(fresh.bot.upgradePath.length).toBeGreaterThan(0);
  });
});

describe('Fremde Bots', () => {
  it('fasst Spieler ohne Bot-Zustand nicht an (Guardian, Debug-Dummies)', () => {
    const game = createGame(11);
    const internals = game as unknown as Internals;
    settle(game, 1_000_000, 1);

    // Wie der Hunter-Signal-Guardian: isBot, aber ohne Bot-Zustand.
    const guardianId = game.addPlayer('GUARDIAN');
    const guardian = internals.players.get(guardianId);
    guardian.isBot = true;
    guardian.bot = null;
    guardian.position = { x: 5_600, y: 3_600 };

    expect(botsOf(game)).toHaveLength(11);
    settle(game, 3_000_000);
    expect(internals.players.has(guardianId)).toBe(true);
    // Der Guardian zählt weder als Mensch noch als Direktor-Bot.
    expect(arenaDirectorStatus(game).humans).toBe(0);
    expect(botsOf(game)).toHaveLength(targetBotCount(0));
  });
});

describe('Abschalter', () => {
  it('lässt die Population ohne Direktor unverändert', () => {
    const game = createGame(3, false);
    expect(botsOf(game)).toHaveLength(3);

    let now = 1_000_000;
    for (let index = 0; index < 30; index += 1) {
      now += config.phaseIntervalMs;
      game.step(1 / 40, now);
    }
    expect(botsOf(game)).toHaveLength(3);

    const humanId = game.addPlayer('A');
    for (let index = 0; index < 10; index += 1) {
      now += config.phaseIntervalMs;
      game.step(1 / 40, now);
    }
    expect(botsOf(game)).toHaveLength(3);
    game.removePlayer(humanId);
  });
});
