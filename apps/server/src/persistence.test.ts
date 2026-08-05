import { afterEach, describe, expect, it, vi } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import {
  flushPersistence,
  leaderboard,
  leaderboardHandler,
  persistenceConfig,
  persistenceStats,
  stopPersistence,
  tunePersistence,
  type LeaderboardEntry,
  type PersistenceClient,
  type RunRecord
} from './persistence';

interface Internals {
  players: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const baseGame = (): MazeGame => tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))));

class FakeClient implements PersistenceClient {
  readonly inserted: RunRecord[] = [];
  insertCalls = 0;
  topCalls = 0;
  failInserts = false;
  failReads = false;
  entries: LeaderboardEntry[] = [];

  async insertRuns(runs: readonly RunRecord[]): Promise<void> {
    this.insertCalls += 1;
    if (this.failInserts) throw new Error('supabase down');
    this.inserted.push(...runs);
  }

  async topRuns(limit: number): Promise<LeaderboardEntry[]> {
    this.topCalls += 1;
    if (this.failReads) throw new Error('supabase down');
    return this.entries.slice(0, limit);
  }
}

const entry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  playerName: 'Ada',
  score: 9_000,
  level: 30,
  playerClass: 'storm',
  kills: 12,
  bestStreak: 5,
  durationSeconds: 240.5,
  achievedAt: '2026-08-05T10:00:00.000Z',
  ...overrides
});

const withPersistence = (client: PersistenceClient, options = {}): MazeGame => {
  const game = baseGame();
  tunePersistence(game, { client, flushIntervalMs: 100_000, log: () => {}, ...options });
  return game;
};

const respond = () => {
  const state: { status: number; body: unknown; headers: Record<string, string> } = {
    status: 200,
    body: null,
    headers: {}
  };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    setHeader(key: string, value: string) { state.headers[key] = value; return response; }
  };
  return { response, state };
};

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.restoreAllMocks();
});

describe('persistence feature flag', () => {
  it('stays completely out of the way without Supabase configuration', () => {
    expect(persistenceConfig()).toBeNull();

    const plain = baseGame();
    const step = plain.step;
    const removePlayer = plain.removePlayer;
    const killPlayer = (plain as unknown as Internals).killPlayer;

    const returned = tunePersistence(plain);

    expect(returned).toBe(plain);
    expect(plain.step).toBe(step);
    expect(plain.removePlayer).toBe(removePlayer);
    expect((plain as unknown as Internals).killPlayer).toBe(killPlayer);
    expect(persistenceStats(plain).enabled).toBe(false);
  });

  it('still simulates and kills exactly like before when disabled', () => {
    const game = tunePersistence(baseGame());
    const playerId = game.addPlayer('Solo');
    const internals = game as unknown as Internals;
    const now = Date.now();

    game.step(1 / 40, now);
    internals.killPlayer(internals.players.get(playerId), null, now + 1_000, 'Arena');

    const player = internals.players.get(playerId);
    expect(player.dead).toBe(true);
    expect(player.deaths).toBe(1);
    expect(game.requestRespawn(playerId, now + 60_000)).toBe(true);
    expect(persistenceStats(game).queued).toBe(0);
  });

  it('needs both variables – half a configuration counts as off', () => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    expect(persistenceConfig()).toBeNull();
    delete process.env.SUPABASE_URL;

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    expect(persistenceConfig()).toBeNull();

    process.env.SUPABASE_URL = 'https://project.supabase.co';
    expect(persistenceConfig()).toEqual({
      url: 'https://project.supabase.co',
      serviceRoleKey: 'service-role-key'
    });
  });

  it('answers /leaderboard with 404 while persistence is off', () => {
    const game = tunePersistence(baseGame());
    const { response, state } = respond();
    leaderboardHandler(game)({ query: {} } as never, response as never);
    expect(state.status).toBe(404);
  });
});

describe('run persistence', () => {
  it('records a finished run with everything the leaderboard needs', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Ada');
    const internals = game as unknown as Internals;
    const now = Date.now();

    game.step(1 / 40, now);
    const player = internals.players.get(playerId);
    player.score = 4_200;
    player.level = 21;
    player.playerClass = 'lancer';
    player.kills = 7;
    player.bestStreak = 4;
    internals.killPlayer(player, null, now + 12_500, 'Arena');

    expect(persistenceStats(game).queued).toBe(1);
    expect(client.insertCalls).toBe(0);

    await flushPersistence(game);
    expect(client.inserted).toEqual([{
      playerName: 'Ada',
      score: 4_200,
      level: 21,
      playerClass: 'lancer',
      kills: 7,
      bestStreak: 4,
      durationSeconds: 12.5
    }]);
    expect(persistenceStats(game).written).toBe(1);
    stopPersistence(game);
  });

  it('keeps bots and empty runs out of the global leaderboard', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const internals = game as unknown as Internals;
    const humanId = game.addPlayer('Zero');
    const now = Date.now();
    game.step(1 / 40, now);

    const human = internals.players.get(humanId);
    human.score = 0;
    internals.killPlayer(human, null, now + 3_000, 'Arena');

    const botGame = withPersistence(new FakeClient());
    const botInternals = botGame as unknown as Internals;
    const botId = botGame.addPlayer('Bot');
    botGame.step(1 / 40, now);
    const bot = botInternals.players.get(botId);
    bot.isBot = true;
    bot.score = 5_000;
    botInternals.killPlayer(bot, null, now + 3_000, 'Arena');

    expect(persistenceStats(game).queued).toBe(0);
    expect(persistenceStats(botGame).queued).toBe(0);
    stopPersistence(game);
    stopPersistence(botGame);
  });

  it('captures the streak before killPlayer resets it', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Streaky');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    const player = internals.players.get(playerId);
    player.score = 1_000;
    player.streak = 6;
    player.bestStreak = 6;
    internals.killPlayer(player, null, now + 1_000, 'Arena');

    await flushPersistence(game);
    expect(player.streak).toBe(0);
    expect(client.inserted[0]?.bestStreak).toBe(6);
    stopPersistence(game);
  });

  it('never lets a database outage reach the game', async () => {
    const client = new FakeClient();
    client.failInserts = true;
    const game = withPersistence(client);
    const playerId = game.addPlayer('Ada');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);
    const player = internals.players.get(playerId);
    player.score = 500;

    expect(() => internals.killPlayer(player, null, now + 1_000, 'Arena')).not.toThrow();
    await expect(flushPersistence(game)).resolves.toBeUndefined();

    const stats = persistenceStats(game);
    expect(stats.failedFlushes).toBeGreaterThan(0);
    expect(stats.written).toBe(0);
    // Der Run bleibt gepuffert und geht beim nächsten Versuch mit.
    expect(stats.queued).toBe(1);
    expect(player.dead).toBe(true);

    client.failInserts = false;
    await flushPersistence(game);
    expect(persistenceStats(game).written).toBe(1);
    expect(persistenceStats(game).queued).toBe(0);
    stopPersistence(game);
  });

  it('does not write anything while nobody dies', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const now = Date.now();
    for (let tick = 0; tick < 40; tick += 1) game.step(1 / 40, now + tick * 25);

    await flushPersistence(game);
    expect(client.insertCalls).toBe(0);
    stopPersistence(game);
  });

  it('forgets a life when the player leaves before dying', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Leaver');
    const now = Date.now();
    game.step(1 / 40, now);
    game.removePlayer(playerId);
    game.step(1 / 40, now + 25);

    await flushPersistence(game);
    expect(client.inserted).toHaveLength(0);
    stopPersistence(game);
  });
});

describe('leaderboard route', () => {
  it('serves the top runs and caches them for the configured window', async () => {
    const client = new FakeClient();
    client.entries = [entry(), entry({ rank: 2, playerName: 'Grace', score: 8_000 })];
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });

    const first = await leaderboard(game);
    const second = await leaderboard(game);

    expect(first).toHaveLength(2);
    expect(first[0]?.playerName).toBe('Ada');
    expect(second).toEqual(first);
    expect(client.topCalls).toBe(1);
    stopPersistence(game);
  });

  it('collapses concurrent requests into a single database roundtrip', async () => {
    const client = new FakeClient();
    client.entries = [entry()];
    const game = withPersistence(client);

    const [a, b, c] = await Promise.all([leaderboard(game), leaderboard(game), leaderboard(game)]);

    expect(client.topCalls).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    stopPersistence(game);
  });

  it('keeps serving the last good answer when Supabase fails', async () => {
    const client = new FakeClient();
    client.entries = [entry()];
    const game = withPersistence(client, { leaderboardCacheMs: 1 });
    await leaderboard(game);

    client.failReads = true;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const stale = await leaderboard(game);

    expect(stale[0]?.playerName).toBe('Ada');
    stopPersistence(game);
  });

  it('answers 503 when there is nothing cached and Supabase is down', async () => {
    const client = new FakeClient();
    client.failReads = true;
    const game = withPersistence(client);
    const { response, state } = respond();

    leaderboardHandler(game)({ query: {} } as never, response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(state.status).toBe(503);
    stopPersistence(game);
  });

  it('caps the limit and advertises the cache window', async () => {
    const client = new FakeClient();
    client.entries = Array.from({ length: 50 }, (_, index) => entry({ rank: index + 1, score: 9_000 - index }));
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });
    const { response, state } = respond();

    leaderboardHandler(game)({ query: { limit: '500' } } as never, response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const body = state.body as { entries: LeaderboardEntry[]; cacheSeconds: number };
    expect(body.entries).toHaveLength(50);
    expect(body.cacheSeconds).toBe(30);
    expect(state.headers['Cache-Control']).toBe('public, max-age=30');
    stopPersistence(game);
  });
});
