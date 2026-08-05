import { afterEach, describe, expect, it } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { equipLoadout, tuneLoadoutSystem } from './loadout-system';
import { renderMetricsText, telemetryReport, tuneTelemetry } from './telemetry';

interface Internals {
  players: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (): MazeGame =>
  tuneTelemetry(tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)))));

const findMetric = (text: string, prefix: string): string[] =>
  text.split('\n').filter((line) => line.startsWith(prefix));

afterEach(() => {
  delete process.env.TELEMETRY_ENABLED;
  delete process.env.METRICS_TOKEN;
});

describe('telemetry', () => {
  it('counts class picks with the subject the pick belongs to', () => {
    const game = createGame();
    const playerId = game.addPlayer('Pilot');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.level = 26;

    expect(game.chooseClass(playerId, 'rapid')).toBe(true);
    expect(game.chooseClass(playerId, 'twin')).toBe(true);
    expect(game.chooseClass(playerId, 'lancer')).toBe(false);

    const report = telemetryReport(game);
    const rapid = report.classes.find((entry) => entry.id === 'rapid');
    const twin = report.classes.find((entry) => entry.id === 'twin');
    expect(rapid?.picks).toBe(1);
    expect(twin?.picks).toBe(1);
    expect(report.totals.classPicks).toBe(2);
    expect(rapid?.pickRate).toBeCloseTo(0.5, 5);
    expect(telemetryReport(game, { subject: 'bot' }).totals.classPicks).toBe(0);
  });

  it('records module and frame picks whenever a loadout changes', () => {
    const game = createGame();
    const playerId = game.addPlayer('Tinkerer');
    const now = Date.now();

    game.snapshot(playerId, now);
    expect(equipLoadout(game, playerId, 'barrier', 'reinforced', now)).toBe(true);
    game.snapshot(playerId, now + 10);
    expect(equipLoadout(game, playerId, 'barrier', 'lightweight', now + 20)).toBe(true);
    game.snapshot(playerId, now + 30);

    const report = telemetryReport(game);
    expect(report.modules.find((entry) => entry.id === 'dash')?.picks).toBe(1);
    expect(report.modules.find((entry) => entry.id === 'barrier')?.picks).toBe(1);
    expect(report.frames.find((entry) => entry.id === 'standard')?.picks).toBe(1);
    expect(report.frames.find((entry) => entry.id === 'reinforced')?.picks).toBe(1);
    expect(report.frames.find((entry) => entry.id === 'lightweight')?.picks).toBe(1);
    expect(report.totals.framePicks).toBe(3);
  });

  it('attributes kills, deaths and lifetime to class, module and frame', () => {
    const game = createGame();
    const hunterId = game.addPlayer('Hunter');
    const preyId = game.addPlayer('Prey');
    const internals = game as unknown as Internals;
    const now = Date.now();

    equipLoadout(game, hunterId, 'repulse', 'lightweight', now);
    equipLoadout(game, preyId, 'repair', 'reinforced', now);
    game.snapshot(hunterId, now);
    game.snapshot(preyId, now);
    game.step(1 / 40, now);

    internals.killPlayer(internals.players.get(preyId), hunterId, now + 9_000, 'Arena');

    const report = telemetryReport(game);
    expect(report.classes.find((entry) => entry.id === 'core')?.kills).toBe(1);
    expect(report.classes.find((entry) => entry.id === 'core')?.deaths).toBe(1);
    expect(report.modules.find((entry) => entry.id === 'repulse')?.kills).toBe(1);
    expect(report.modules.find((entry) => entry.id === 'repulse')?.deaths).toBe(0);
    expect(report.modules.find((entry) => entry.id === 'repair')?.deaths).toBe(1);
    expect(report.frames.find((entry) => entry.id === 'lightweight')?.kills).toBe(1);
    expect(report.frames.find((entry) => entry.id === 'reinforced')?.deaths).toBe(1);

    const core = report.classes.find((entry) => entry.id === 'core');
    expect(core?.lives).toBe(1);
    expect(core?.averageLifetimeSeconds).toBeGreaterThan(8);
    expect(core?.averageLifetimeSeconds).toBeLessThan(10);
  });

  it('never counts a death twice when a dead tank is killed again', () => {
    const game = createGame();
    const preyId = game.addPlayer('Prey');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    const prey = internals.players.get(preyId);
    internals.killPlayer(prey, null, now + 1_000, 'Arena');
    internals.killPlayer(prey, null, now + 2_000, 'Arena');

    expect(telemetryReport(game).totals.deaths).toBe(1);
    expect(telemetryReport(game).totals.lives).toBe(1);
  });

  it('keeps the loadout ledger complete without a human observer', () => {
    const game = tuneTelemetry(tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(2)))));
    const now = Date.now();
    for (let tick = 0; tick < 12; tick += 1) game.step(1 / 40, now + tick * 300);

    const report = telemetryReport(game, { subject: 'bot' });
    expect(report.totals.modulePicks).toBeGreaterThanOrEqual(2);
    expect(report.totals.framePicks).toBeGreaterThanOrEqual(2);
  });

  it('starts a fresh life after a respawn', () => {
    const game = createGame();
    const playerId = game.addPlayer('Phoenix');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    internals.killPlayer(internals.players.get(playerId), null, now + 4_000, 'Arena');
    expect(game.requestRespawn(playerId, now + 60_000)).toBe(true);
    game.step(1 / 40, now + 60_000);
    internals.killPlayer(internals.players.get(playerId), null, now + 61_000, 'Arena');

    const core = telemetryReport(game).classes.find((entry) => entry.id === 'core');
    expect(core?.lives).toBe(2);
    expect(core?.longestLifetimeSeconds).toBeGreaterThanOrEqual(4);
    expect(core?.longestLifetimeSeconds).toBeLessThan(5);
  });

  it('forgets everything about a player who leaves the arena', () => {
    const game = createGame();
    const playerId = game.addPlayer('Guest');
    const now = Date.now();
    game.snapshot(playerId, now);
    game.step(1 / 40, now);
    game.removePlayer(playerId);
    game.step(1 / 40, now + 25);

    expect(telemetryReport(game).totals.lives).toBe(0);
    expect(telemetryReport(game).population.humans).toBe(0);
  });

  it('exports only anonymous aggregates', () => {
    const game = createGame();
    const playerId = game.addPlayer('Klarname');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.snapshot(playerId, now);
    game.step(1 / 40, now);
    internals.killPlayer(internals.players.get(playerId), null, now + 1_000, 'Arena');

    const serialized = JSON.stringify(telemetryReport(game));
    const metrics = renderMetricsText(game, now + 1_000);
    for (const payload of [serialized, metrics]) {
      expect(payload).not.toContain('Klarname');
      expect(payload).not.toContain(playerId);
    }
  });

  it('renders Prometheus text with help, type and non-zero samples only', () => {
    const game = createGame();
    const playerId = game.addPlayer('Reporter');
    const internals = game as unknown as Internals;
    const now = Date.now();
    internals.players.get(playerId).level = 12;
    game.chooseClass(playerId, 'rapid');

    const text = renderMetricsText(game, now);
    expect(text).toContain('# HELP maze_class_picks_total');
    expect(text).toContain('# TYPE maze_class_picks_total counter');
    expect(findMetric(text, 'maze_class_picks_total{')).toEqual(['maze_class_picks_total{class="rapid",subject="human"} 1']);
    expect(text).toContain('maze_players{subject="human"} 1');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('leaves the game untouched when telemetry is disabled', () => {
    process.env.TELEMETRY_ENABLED = 'false';
    const game = tuneTelemetry(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))));
    const playerId = game.addPlayer('Ghost');
    const internals = game as unknown as Internals;
    internals.players.get(playerId).level = 12;
    game.chooseClass(playerId, 'rapid');

    expect(telemetryReport(game).totals.classPicks).toBe(0);
  });
});
