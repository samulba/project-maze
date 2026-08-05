import { afterEach, describe, expect, it, vi } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { ACHIEVEMENT_CATALOG } from '@project-maze/shared/gameplay';
import { achievementProgressFor, tuneAchievements } from './achievements';
import {
  flushPersistence,
  leaderboard,
  leaderboardHandler,
  linkPlayerToUser,
  persistenceConfig,
  persistenceStats,
  profile,
  profileHandler,
  stopPersistence,
  tunePersistence,
  type AchievementRecord,
  type LeaderboardEntry,
  type PersistenceClient,
  type ProfileRecord,
  type ProfileSnapshot,
  type RunRecord,
  type StoredAchievement
} from './persistence';

interface Internals {
  players: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const baseGame = (): MazeGame => tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))));

class FakeClient implements PersistenceClient {
  readonly inserted: RunRecord[] = [];
  readonly profiles: ProfileRecord[] = [];
  readonly stored: AchievementRecord[] = [];
  private readonly storedKeys = new Set<string>();
  insertCalls = 0;
  profileCalls = 0;
  achievementCalls = 0;
  preloadCalls = 0;
  profileFetches = 0;
  topCalls = 0;
  failInserts = false;
  failAchievements = false;
  failReads = false;
  missingProfile = false;
  entries: LeaderboardEntry[] = [];

  async insertRuns(runs: readonly RunRecord[]): Promise<void> {
    this.insertCalls += 1;
    if (this.failInserts) throw new Error('supabase down');
    this.inserted.push(...runs);
  }

  async upsertProfiles(profiles: readonly ProfileRecord[]): Promise<void> {
    this.profileCalls += 1;
    if (this.failInserts) throw new Error('supabase down');
    this.profiles.push(...profiles);
  }

  async insertAchievements(unlocks: readonly AchievementRecord[]): Promise<void> {
    this.achievementCalls += 1;
    if (this.failAchievements) throw new Error('supabase down');
    for (const unlock of unlocks) {
      const key = `${unlock.userId}|${unlock.achievementId}`;
      if (this.storedKeys.has(key)) continue;
      this.storedKeys.add(key);
      this.stored.push(unlock);
    }
  }

  async achievementsFor(userId: string): Promise<StoredAchievement[]> {
    this.preloadCalls += 1;
    if (this.failReads) throw new Error('supabase down');
    return this.stored
      .filter((unlock) => unlock.userId === userId)
      .map((unlock) => ({ achievementId: unlock.achievementId, unlockedAt: '2026-08-05T10:00:00.000Z' }));
  }

  async profileFor(userId: string): Promise<ProfileSnapshot | null> {
    this.profileFetches += 1;
    if (this.failReads) throw new Error('supabase down');
    if (this.missingProfile) return null;
    return {
      userId,
      displayName: 'Ada Lovelace',
      memberSince: '2026-08-01T09:00:00.000Z',
      stats: {
        runs: 12,
        bestScore: 9_000,
        bestLevel: 32,
        bestKills: 14,
        bestStreak: 7,
        longestRunSeconds: 421.3,
        totalKills: 88,
        totalSeconds: 3_600,
        firstRunAt: '2026-08-01T09:00:00.000Z',
        lastRunAt: '2026-08-05T10:00:00.000Z'
      },
      achievements: await this.achievementsFor(userId)
    };
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

/** Arena mit laufender Achievement-Engine – Persistenz sitzt außen herum. */
const withAchievements = (client: PersistenceClient, options = {}): MazeGame => {
  const game = tuneAchievements(baseGame(), true);
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
      durationSeconds: 12.5,
      userId: null
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

describe('account link (Sprint B, noch nicht verdrahtet)', () => {
  const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('leaves runs as guest runs while nobody links an account', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Gast');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);
    const player = internals.players.get(playerId);
    player.score = 900;
    internals.killPlayer(player, null, now + 1_000, 'Arena');

    await flushPersistence(game);
    expect(client.inserted[0]?.userId).toBeNull();
    expect(client.profileCalls).toBe(0);
    stopPersistence(game);
  });

  it('stamps the account on the run and upserts the profile once linked', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Ada');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada Lovelace' });
    const player = internals.players.get(playerId);
    player.score = 1_500;
    internals.killPlayer(player, null, now + 2_000, 'Arena');

    await flushPersistence(game);
    expect(client.inserted[0]?.userId).toBe(USER_ID);
    expect(client.profiles).toEqual([{ userId: USER_ID, displayName: 'Ada Lovelace' }]);
    stopPersistence(game);
  });

  it('clamps an over-long display name and drops the link on leave', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Ada');
    game.step(1 / 40, Date.now());

    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Eine viel zu lange Anzeige' });
    await flushPersistence(game);
    expect(client.profiles[0]?.displayName).toHaveLength(18);

    game.removePlayer(playerId);
    const rejoinId = game.addPlayer('Ada');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);
    const player = internals.players.get(rejoinId);
    player.score = 700;
    internals.killPlayer(player, null, now + 1_000, 'Arena');

    await flushPersistence(game);
    // Neuer Spielplatz, kein übernommenes Konto.
    expect(client.inserted[0]?.userId).toBeNull();
    stopPersistence(game);
  });

  it('is a no-op while persistence is switched off', () => {
    const game = tunePersistence(baseGame());
    const playerId = game.addPlayer('Ada');
    expect(() => linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' })).not.toThrow();
    expect(persistenceStats(game).enabled).toBe(false);
  });
});

describe('achievement persistence', () => {
  const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const OTHER_USER = '9c858901-8a57-4791-81fe-4c455b099bc9';

  /** Treibt einen Spieler auf eine Fünferserie – schaltet `firstStreak5` frei. */
  const earnStreak = (game: MazeGame, playerId: string, now: number): void => {
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.streak = 5;
    player.score = 2_000;
    game.step(1 / 40, now);
  };

  it('writes a new unlock exactly once, buffered and outside the tick', async () => {
    const client = new FakeClient();
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await Promise.resolve();

    earnStreak(game, playerId, now + 25);
    // Der Tick selbst schreibt nichts.
    expect(client.achievementCalls).toBe(0);

    await flushPersistence(game);
    expect(client.stored).toEqual([{ userId: USER_ID, achievementId: 'firstStreak5' }]);
    expect(persistenceStats(game).achievementsWritten).toBe(1);

    // Zweiter Durchlauf: Die Engine kennt es noch, geschrieben wird nichts mehr.
    game.step(1 / 40, now + 50);
    await flushPersistence(game);
    expect(client.stored).toHaveLength(1);
    expect(client.achievementCalls).toBe(1);
    stopPersistence(game);
  });

  it('ignores achievements of players without a linked account', async () => {
    const client = new FakeClient();
    const game = withAchievements(client);
    const playerId = game.addPlayer('Gast');
    const now = Date.now();
    game.step(1 / 40, now);
    earnStreak(game, playerId, now + 25);

    await flushPersistence(game);
    expect(client.stored).toHaveLength(0);
    expect(client.achievementCalls).toBe(0);
    stopPersistence(game);
  });

  it('preloads stored unlocks so a returning account earns nothing twice', async () => {
    const client = new FakeClient();
    await client.insertAchievements([{ userId: USER_ID, achievementId: 'firstStreak5' }]);
    client.achievementCalls = 0;

    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    // Das Vorladen läuft asynchron; ein Tick später ist es eingespielt.
    await new Promise((resolve) => setTimeout(resolve, 5));
    game.step(1 / 40, now + 25);

    earnStreak(game, playerId, now + 50);
    await flushPersistence(game);

    expect(client.preloadCalls).toBe(1);
    expect(client.achievementCalls).toBe(0);
    expect(client.stored).toHaveLength(1);
    stopPersistence(game);
  });

  it('seeds the engine so an old achievement fires no fresh popup', async () => {
    const client = new FakeClient();
    await client.insertAchievements([{ userId: USER_ID, achievementId: 'firstStreak5' }]);
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    game.step(1 / 40, now + 25);

    const progress = achievementProgressFor(game, playerId);
    expect(progress?.unlocked.has('firstStreak5')).toBe(true);
    // Vorgeladenes wird nicht gefeiert.
    expect(progress?.fresh).not.toContain('firstStreak5');
    stopPersistence(game);
  });

  it('keeps accounts apart', async () => {
    const client = new FakeClient();
    await client.insertAchievements([{ userId: OTHER_USER, achievementId: 'firstStreak5' }]);
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    earnStreak(game, playerId, now + 25);
    await flushPersistence(game);

    expect(client.stored.filter((entry) => entry.userId === USER_ID)).toHaveLength(1);
    expect(client.stored.filter((entry) => entry.userId === OTHER_USER)).toHaveLength(1);
    stopPersistence(game);
  });

  it('collects a last unlock when the player leaves', async () => {
    const client = new FakeClient();
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await Promise.resolve();
    earnStreak(game, playerId, now + 25);

    game.removePlayer(playerId);
    await flushPersistence(game);

    expect(client.stored).toHaveLength(1);
    stopPersistence(game);
  });

  it('retries a failed write instead of losing the unlock', async () => {
    const client = new FakeClient();
    client.failAchievements = true;
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await Promise.resolve();
    earnStreak(game, playerId, now + 25);

    await flushPersistence(game);
    expect(persistenceStats(game).achievementsQueued).toBe(1);
    expect(persistenceStats(game).failedFlushes).toBeGreaterThan(0);
    expect(persistenceStats(game).achievementsWritten).toBe(0);

    client.failAchievements = false;
    await flushPersistence(game);
    expect(client.stored).toEqual([{ userId: USER_ID, achievementId: 'firstStreak5' }]);
    expect(persistenceStats(game).achievementsQueued).toBe(0);
    stopPersistence(game);
  });

  it('never lets a failed preload disturb the arena', async () => {
    const client = new FakeClient();
    client.failReads = true;
    const game = withAchievements(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);

    expect(() => linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 5));
    earnStreak(game, playerId, now + 25);

    // Ohne Vorladung wird der Unlock trotzdem geschrieben.
    client.failReads = false;
    await flushPersistence(game);
    expect(client.stored).toHaveLength(1);
    stopPersistence(game);
  });

  it('does nothing at all while the achievement engine is off', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Ada');
    const now = Date.now();
    game.step(1 / 40, now);
    linkPlayerToUser(game, playerId, { userId: USER_ID, displayName: 'Ada' });
    await Promise.resolve();
    earnStreak(game, playerId, now + 25);

    await flushPersistence(game);
    expect(client.stored).toHaveLength(0);
    stopPersistence(game);
  });
});

describe('profile route', () => {
  const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('serves best results plus achievements with catalog texts', async () => {
    const client = new FakeClient();
    await client.insertAchievements([{ userId: USER_ID, achievementId: 'firstStreak5' }]);
    const game = withPersistence(client);

    const found = await profile(game, USER_ID);
    expect(found?.displayName).toBe('Ada Lovelace');
    expect(found?.stats.bestScore).toBe(9_000);
    expect(found?.stats.runs).toBe(12);
    expect(found?.achievements).toEqual([{
      id: 'firstStreak5',
      name: ACHIEVEMENT_CATALOG.firstStreak5.name,
      description: ACHIEVEMENT_CATALOG.firstStreak5.description,
      unlockedAt: '2026-08-05T10:00:00.000Z'
    }]);
    stopPersistence(game);
  });

  it('caches per account and collapses concurrent requests', async () => {
    const client = new FakeClient();
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });

    await Promise.all([profile(game, USER_ID), profile(game, USER_ID), profile(game, USER_ID)]);
    await profile(game, USER_ID);

    expect(client.profileFetches).toBe(1);
    stopPersistence(game);
  });

  it('remembers an unknown account so random ids cost no query', async () => {
    const client = new FakeClient();
    client.missingProfile = true;
    const game = withPersistence(client);

    expect(await profile(game, USER_ID)).toBeNull();
    expect(await profile(game, USER_ID)).toBeNull();
    expect(client.profileFetches).toBe(1);
    stopPersistence(game);
  });

  it('rejects a malformed id without touching the database', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const { response, state } = respond();

    profileHandler(game)({ params: { userId: 'nicht-uuid' }, query: {} } as never, response as never);

    expect(state.status).toBe(400);
    expect(client.profileFetches).toBe(0);
    stopPersistence(game);
  });

  it('answers 404 for an unknown account and 503 when Supabase is down', async () => {
    const missing = new FakeClient();
    missing.missingProfile = true;
    const gameA = withPersistence(missing);
    const a = respond();
    profileHandler(gameA)({ params: { userId: USER_ID }, query: {} } as never, a.response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(a.state.status).toBe(404);
    stopPersistence(gameA);

    const broken = new FakeClient();
    broken.failReads = true;
    const gameB = withPersistence(broken);
    const b = respond();
    profileHandler(gameB)({ params: { userId: USER_ID }, query: {} } as never, b.response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(b.state.status).toBe(503);
    stopPersistence(gameB);
  });

  it('answers 404 while persistence is switched off', () => {
    const game = tunePersistence(baseGame());
    const { response, state } = respond();
    profileHandler(game)({ params: { userId: USER_ID }, query: {} } as never, response as never);
    expect(state.status).toBe(404);
  });

  it('sends the cache header and window like the leaderboard', async () => {
    const client = new FakeClient();
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });
    const { response, state } = respond();

    profileHandler(game)({ params: { userId: USER_ID }, query: {} } as never, response as never);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(state.headers['Cache-Control']).toBe('public, max-age=30');
    expect((state.body as { cacheSeconds: number }).cacheSeconds).toBe(30);
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
