import { afterEach, describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, type Vector2 } from '@project-maze/shared';
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  achievementProgressFor,
  drainUnlockedAchievements,
  tuneAchievements,
  unlockedAchievementsFor,
  type AchievementId
} from './achievements';
import { ACHIEVEMENT_CATALOG } from '@project-maze/shared/gameplay';
import { arenaGuardianIdFor, fracturedWallIdsFor, tuneArenaEvents } from './arena-events';
import { tuneArenaSystems } from './arena-systems';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { tuneProgression } from './progression-tuning';
import { hardenSimulation } from './simulation-hardening';
import { WALLS, resetDisabledWalls, segmentCrossesWalls } from './world';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

afterEach(resetDisabledWalls);

const createGame = (enabled = true): MazeGame =>
  tuneAchievements(
    tuneArenaEvents(
      tuneArenaSystems(
        tuneLoadoutSystem(
          tuneProgression(
            tuneClassMechanics(tuneDrones(tuneCombatScaling(hardenSimulation(new MazeGame(0)))))
          )
        )
      )
    ),
    enabled
  );

/** Zwei kampfbereite Spieler an bekannten Positionen. */
function duel(game: MazeGame, at: Vector2 = { x: 3000, y: 2000 }): {
  internals: Internals;
  hunterId: string;
  preyId: string;
  hunter: any;
  prey: any;
} {
  const internals = game as unknown as Internals;
  const hunterId = game.addPlayer('Hunter');
  const preyId = game.addPlayer('Prey');
  const hunter = internals.players.get(hunterId);
  const prey = internals.players.get(preyId);
  for (const player of [hunter, prey]) {
    player.level = 20;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
  }
  hunter.position = { ...at };
  prey.position = { x: at.x + 80, y: at.y };
  return { internals, hunterId, preyId, hunter, prey };
}

/** Erlegt das Opfer und lässt es sofort wieder antreten – für Serien. */
function slay(internals: Internals, prey: any, hunterId: string, now: number): void {
  prey.dead = false;
  prey.invulnerable = false;
  prey.invulnerableUntil = 0;
  internals.killPlayer(prey, hunterId, now, 'Arena');
}

/** Läuft die Event-Rotation ab, bis die gesuchte Art aktiv ist. */
function advanceToEvent(game: MazeGame, viewerId: string, kind: string, start: number): { event: any; now: number } {
  let now = start;
  for (let index = 0; index < 900; index += 1) {
    now += 1_000;
    game.step(1 / 40, now);
    const event = (game.snapshot(viewerId, now) as any).arenaEvent;
    if (event?.kind === kind && event.phase === 'active') return { event, now };
  }
  throw new Error(`Arena-Event "${kind}" wurde nicht aktiv`);
}

describe('achievement catalog', () => {
  it('deckt jede ID genau einmal ab und beschreibt sie lesbar', () => {
    expect(ACHIEVEMENTS.map((achievement) => achievement.id)).toEqual([...ACHIEVEMENT_IDS]);
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENT_IDS.length);
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.name.length).toBeGreaterThan(2);
      expect(achievement.description.length).toBeGreaterThan(10);
    }
  });
});

describe('achievement conditions', () => {
  it('erste 5er-Serie', () => {
    const game = createGame();
    const { internals, hunterId, preyId, hunter, prey } = duel(game);
    let now = Date.now();

    for (let kill = 0; kill < 4; kill += 1) slay(internals, prey, hunterId, (now += 100));
    expect(hunter.streak).toBe(4);
    expect(unlockedAchievementsFor(game, hunterId)).not.toContain('firstStreak5');

    slay(internals, prey, hunterId, (now += 100));
    expect(unlockedAchievementsFor(game, hunterId)).toContain('firstStreak5');
    // Das Opfer bekommt selbstverständlich nichts.
    expect(unlockedAchievementsFor(game, preyId)).toHaveLength(0);
  });

  it('Guardian-Kill', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Hunter');
    const internals = game as unknown as Internals;
    const { now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const hunter = internals.players.get(viewerId);
    hunter.level = 20;
    hunter.invulnerable = false;
    hunter.invulnerableUntil = 0;

    const guardianId = arenaGuardianIdFor(game);
    expect(guardianId).toBeTruthy();
    const guardian = internals.players.get(guardianId!);

    internals.damagePlayer(guardian, guardian.maxHealth * 20, viewerId, now);
    expect(guardian.dead).toBe(true);
    expect(unlockedAchievementsFor(game, viewerId)).toContain('guardianSlayer');
    expect(achievementProgressFor(game, viewerId)!.guardianKills).toBe(1);
  });

  it('Level 45 erreicht', () => {
    const game = createGame();
    const playerId = game.addPlayer('Climber');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);

    player.level = GAME.maxLevel - 1;
    game.step(1 / 40);
    expect(unlockedAchievementsFor(game, playerId)).not.toContain('maxLevel');

    player.level = GAME.maxLevel;
    game.step(1 / 40);
    expect(unlockedAchievementsFor(game, playerId)).toContain('maxLevel');
  });

  it('drei Klassenfamilien', () => {
    const game = createGame();
    const playerId = game.addPlayer('Allrounder');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.level = GAME.maxLevel;

    expect(game.chooseClass(playerId, 'rapid')).toBe(true);
    expect(achievementProgressFor(game, playerId)!.families).toEqual(new Set(['rapid']));
    expect(unlockedAchievementsFor(game, playerId)).not.toContain('threeFamilies');

    // Familienwechsel ist nur über den Weg zurück zu `core` möglich.
    player.playerClass = 'core';
    expect(game.chooseClass(playerId, 'sniper')).toBe(true);
    expect(unlockedAchievementsFor(game, playerId)).not.toContain('threeFamilies');

    player.playerClass = 'core';
    expect(game.chooseClass(playerId, 'rammer')).toBe(true);
    expect(achievementProgressFor(game, playerId)!.families.size).toBe(3);
    expect(unlockedAchievementsFor(game, playerId)).toContain('threeFamilies');
  });

  it('zählt Aufstiege innerhalb derselben Familie nicht doppelt', () => {
    const game = createGame();
    const playerId = game.addPlayer('Spezialist');
    const internals = game as unknown as Internals;
    internals.players.get(playerId).level = GAME.maxLevel;

    for (const step of ['rapid', 'twin', 'storm'] as const) game.chooseClass(playerId, step);
    expect(CLASS_DEFINITIONS.storm.branch).toBe('rapid');
    expect(achievementProgressFor(game, playerId)!.families.size).toBe(1);
    expect(unlockedAchievementsFor(game, playerId)).not.toContain('threeFamilies');
  });

  it('Overcharge-Kill in der Zone', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const { event, now } = advanceToEvent(game, viewerId, 'overcharge', Date.now());
    const { internals, hunterId, prey } = duel(game, { ...event.center });

    slay(internals, prey, hunterId, now);
    expect(unlockedAchievementsFor(game, hunterId)).toContain('overchargeDuelist');
  });

  it('Overcharge-Kill außerhalb der Zone zählt nicht', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const { event, now } = advanceToEvent(game, viewerId, 'overcharge', Date.now());
    const outside = { x: event.center.x + event.radius + 400, y: event.center.y };
    const { internals, hunterId, prey } = duel(game, outside);

    slay(internals, prey, hunterId, now);
    expect(unlockedAchievementsFor(game, hunterId)).not.toContain('overchargeDuelist');
  });

  it('Fracture-Kill durch eine offene Wand', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const { now } = advanceToEvent(game, viewerId, 'fracture', Date.now());

    // Welche Segmente das Event öffnet, ist zufällig – die Geometrie darüber
    // nicht: quer zur Wand gelegt, kreuzt die Strecke jedes beliebige Segment.
    const open = fracturedWallIdsFor(game);
    expect(open.length).toBeGreaterThan(0);
    const wall = WALLS.find((candidate) => candidate.id === open[0])!;
    const across = wall.width < wall.height;
    const midX = wall.x + wall.width / 2;
    const midY = wall.y + wall.height / 2;
    const near = across ? { x: wall.x - 50, y: midY } : { x: midX, y: wall.y - 50 };
    const far = across
      ? { x: wall.x + wall.width + 50, y: midY }
      : { x: midX, y: wall.y + wall.height + 50 };
    expect(segmentCrossesWalls(near, far, open)).toBe(true);

    const { internals, hunterId, prey } = duel(game, near);
    prey.position = { ...far };
    slay(internals, prey, hunterId, now);
    expect(unlockedAchievementsFor(game, hunterId)).toContain('fractureFlanker');
  });

  it('Fracture-Kill ohne Wand dazwischen zählt nicht', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const { now } = advanceToEvent(game, viewerId, 'fracture', Date.now());
    const open = fracturedWallIdsFor(game);

    // Eine Strecke suchen, die nachweislich kein offenes Segment kreuzt –
    // unabhängig davon, welche Wände das Event diesmal erwischt hat.
    let near: Vector2 | null = null;
    let far: Vector2 | null = null;
    for (let step = 0; step < 40 && !near; step += 1) {
      const candidate = { x: 400 + step * 130, y: 300 };
      const partner = { x: candidate.x + 60, y: candidate.y };
      if (!segmentCrossesWalls(candidate, partner, open)) {
        near = candidate;
        far = partner;
      }
    }
    expect(near).not.toBeNull();

    const { internals, hunterId, prey } = duel(game, near!);
    prey.position = { ...far! };
    slay(internals, prey, hunterId, now);
    expect(unlockedAchievementsFor(game, hunterId)).not.toContain('fractureFlanker');
    // Der Abschuss selbst hat stattgefunden – es fehlte nur die Bresche.
    expect(internals.players.get(hunterId).kills).toBeGreaterThan(0);
  });

  it('10.000 Punkte in einem Lauf', () => {
    const game = createGame();
    const playerId = game.addPlayer('Farmer');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);

    player.score = 9_999;
    game.step(1 / 40);
    expect(unlockedAchievementsFor(game, playerId)).not.toContain('score10k');

    player.score = 10_000;
    game.step(1 / 40);
    expect(unlockedAchievementsFor(game, playerId)).toContain('score10k');
  });
});

describe('achievement engine rules', () => {
  it('vergibt jedes Achievement höchstens einmal je Verbindung', () => {
    const game = createGame();
    const { internals, hunterId, prey } = duel(game);
    let now = Date.now();
    for (let kill = 0; kill < 5; kill += 1) slay(internals, prey, hunterId, (now += 100));
    expect(drainUnlockedAchievements(game, hunterId)).toContain('firstStreak5');

    // Tod beendet die Serie, die nächste Serie schaltet nichts Neues frei.
    const hunter = internals.players.get(hunterId);
    internals.killPlayer(hunter, null, (now += 100), 'Arena');
    hunter.dead = false;
    hunter.invulnerable = false;
    for (let kill = 0; kill < 6; kill += 1) slay(internals, prey, hunterId, (now += 100));
    expect(drainUnlockedAchievements(game, hunterId)).not.toContain('firstStreak5');
    expect(unlockedAchievementsFor(game, hunterId).filter((id) => id === 'firstStreak5')).toHaveLength(1);
  });

  it('vergibt nichts an Bots', () => {
    const game = tuneAchievements(
      tuneArenaEvents(
        tuneArenaSystems(
          tuneLoadoutSystem(
            tuneProgression(
              tuneClassMechanics(tuneDrones(tuneCombatScaling(hardenSimulation(new MazeGame(4)))))
            )
          )
        )
      ),
      true
    );
    const internals = game as unknown as Internals;
    const bots = [...internals.players.values()].filter((player) => player.isBot);
    expect(bots.length).toBeGreaterThan(0);

    expect(bots.length).toBeGreaterThanOrEqual(2);
    const [bot, victim] = bots;
    bot.streak = 4;
    victim.invulnerable = false;
    victim.invulnerableUntil = 0;
    victim.level = 20;
    internals.killPlayer(victim, bot.id, Date.now(), 'Arena');
    expect(bot.streak).toBeGreaterThanOrEqual(5);

    for (const botPlayer of bots) {
      botPlayer.level = GAME.maxLevel;
      botPlayer.score = 50_000;
    }
    game.step(1 / 40);
    for (const botPlayer of bots) expect(unlockedAchievementsFor(game, botPlayer.id)).toHaveLength(0);
  });

  it('gibt frisch freigeschaltete Achievements genau einmal heraus', () => {
    const game = createGame();
    const playerId = game.addPlayer('Climber');
    (game as unknown as Internals).players.get(playerId).level = GAME.maxLevel;
    game.step(1 / 40);

    expect(drainUnlockedAchievements(game, playerId)).toEqual(['maxLevel']);
    expect(drainUnlockedAchievements(game, playerId)).toEqual([]);
    // Freigeschaltet bleibt es trotzdem.
    expect(unlockedAchievementsFor(game, playerId)).toContain('maxLevel');
  });

  it('vergisst den Fortschritt, wenn die Verbindung endet', () => {
    const game = createGame();
    const playerId = game.addPlayer('Climber');
    (game as unknown as Internals).players.get(playerId).level = GAME.maxLevel;
    game.step(1 / 40);
    expect(unlockedAchievementsFor(game, playerId)).toContain('maxLevel');

    game.removePlayer(playerId);
    expect(achievementProgressFor(game, playerId)).toBeNull();
    expect(unlockedAchievementsFor(game, playerId)).toHaveLength(0);
  });

  it('bleibt ohne Flag vollständig untätig', () => {
    const game = createGame(false);
    const { internals, hunterId, preyId, prey } = duel(game);
    const player = internals.players.get(hunterId);
    player.level = GAME.maxLevel;
    player.score = 50_000;
    player.level = GAME.maxLevel;

    let now = Date.now();
    for (let kill = 0; kill < 6; kill += 1) slay(internals, prey, hunterId, (now += 100));
    game.step(1 / 40);

    expect(player.streak).toBeGreaterThanOrEqual(5);
    expect(unlockedAchievementsFor(game, hunterId)).toHaveLength(0);
    expect(drainUnlockedAchievements(game, hunterId)).toHaveLength(0);
    expect(achievementProgressFor(game, hunterId)).toBeNull();
    expect(achievementProgressFor(game, preyId)).toBeNull();
  });

  it('lässt Abschüsse und Klassenwahl unverändert laufen', () => {
    const withEngine = createGame(true);
    const without = createGame(false);
    const results: Record<string, unknown>[] = [];
    for (const game of [withEngine, without]) {
      const { internals, hunterId, prey } = duel(game);
      internals.players.get(hunterId).level = GAME.maxLevel;
      game.chooseClass(hunterId, 'rapid');
      slay(internals, prey, hunterId, 1_000);
      const hunter = internals.players.get(hunterId);
      results.push({
        playerClass: hunter.playerClass,
        kills: hunter.kills,
        streak: hunter.streak,
        score: hunter.score,
        preyDead: prey.dead,
        preyDeaths: prey.deaths
      });
    }
    expect(results[0]).toEqual(results[1]);
  });
});

/**
 * Zwei Fassungen desselben Textes: Der Server formuliert ihn aus `GAME`, der
 * Katalog in `shared` beschriftet damit Popup, Profilkarte und die Profil-API.
 * Bei „Ausgereizt" liefen sie auseinander -- Server „Erreiche Level 60.",
 * Katalog „Erreiche Level 45.", seit der Anhebung von 45 auf 60. Wer den
 * Erfolg im Profil las, wartete auf ein Ziel, das es nicht mehr gab.
 */
describe('Katalog und Serverdefinition', () => {
  it('sagen ueber jeden Erfolg dasselbe', () => {
    const abweichungen: string[] = [];
    for (const achievement of ACHIEVEMENTS) {
      const katalog = ACHIEVEMENT_CATALOG[achievement.id];
      if (katalog.name !== achievement.name) abweichungen.push(`${achievement.id}: Name`);
      if (katalog.description !== achievement.description) {
        abweichungen.push(`${achievement.id}: "${katalog.description}" vs "${achievement.description}"`);
      }
    }
    expect(abweichungen).toEqual([]);
  });
});

describe('achievement ids', () => {
  it('bleiben stabil, damit spätere Persistenz nichts verliert', () => {
    const expected: AchievementId[] = [
      'firstStreak5',
      'guardianSlayer',
      'maxLevel',
      'threeFamilies',
      'overchargeDuelist',
      'fractureFlanker',
      'score10k'
    ];
    expect([...ACHIEVEMENT_IDS]).toEqual(expected);
  });
});
