import { afterEach, describe, expect, it, vi } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { SignJWT } from 'jose';
import { ACHIEVEMENT_CATALOG } from '@project-maze/shared/gameplay';
import { initAuth, resetAuth } from './auth';
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
  profileUpdateHandler,
  updateDisplayName,
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
        lastRunAt: '2026-08-05T10:00:00.000Z',
        favoriteClass: 'storm',
        favoriteClassRuns: 7,
        favoriteClassSeconds: 1_800
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

const AUTH_URL = 'https://abcdefghijkl.supabase.co';
const AUTH_SECRET = 'super-secret-supabase-jwt-secret-value';

/** Schaltet die Token-Prüfung mit lokalem Geheimnis scharf (wie auth.test.ts). */
const enableAuth = (): void => {
  initAuth({
    config: {
      url: AUTH_URL,
      issuer: `${AUTH_URL}/auth/v1`,
      jwksUrl: `${AUTH_URL}/auth/v1/.well-known/jwks.json`,
      sharedSecret: AUTH_SECRET
    }
  });
};

const tokenFor = (subject: string): Promise<string> => new SignJWT({ role: 'authenticated' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer(`${AUTH_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(subject)
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(AUTH_SECRET));

/**
 * Wartet, bis der Handler geantwortet hat.
 *
 * Vorher stand hier ein festes `setTimeout(10)`. Das reichte, solange die
 * Maschine nichts anderes zu tun hatte – lief daneben der UI-Prüfstand, kam
 * die asynchrone Token-Prüfung später zurück, und der Test las den
 * Anfangswert 200 statt der 202, die der Handler danach setzt. Ein Test, der
 * von der Auslastung der Maschine abhängt, ist kein Test.
 *
 * `state.body` ist bis zum ersten `json()` `null` – das ist das Signal, auf
 * das gewartet wird, statt auf eine Frist zu hoffen.
 */
const settle = async (fertig: () => boolean = () => false, grenzeMs = 3000): Promise<void> => {
  const start = Date.now();
  do {
    await new Promise((resolve) => setTimeout(resolve, 2));
  } while (!fertig() && Date.now() - start < grenzeMs);
};

/** Kurzform für den Normalfall: warten, bis genau diese Antwort steht. */
const beantwortet = (call: { state: { body: unknown } }) => (): boolean => call.state.body !== null;

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  resetAuth();
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

  // Befund 58: Die Engine setzt `kills` beim Respawn nie zurück; ein Run gilt
  // laut Schema aber "Spawn bis Tod". Leben mit 2 und 3 Kills müssen die
  // Zeilen 2 und 3 ergeben -- nicht 2 und 5.
  it('writes the kills of the life, not the running session total', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Leben');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    const player = internals.players.get(playerId);
    player.score = 1_000;
    player.kills = 2;
    internals.killPlayer(player, null, now + 1_000, 'Arena');

    // Zweites Leben: Respawn setzt `kills` nicht zurück -- die Buchhaltung
    // merkt sich beim Lebensbeginn den Sitzungsstand als Basis.
    player.dead = false;
    player.score = 2_000;
    game.step(1 / 40, now + 2_000);
    player.kills = 5;
    internals.killPlayer(player, null, now + 3_000, 'Arena');

    await flushPersistence(game);
    expect(client.inserted.map((run: any) => run.kills)).toEqual([2, 3]);
    stopPersistence(game);
  });

  // Befund 52: Tab schließen ist der normale Ausstieg. Wer lebend geht,
  // hinterlässt trotzdem seinen Lauf -- sessions.ts kannte die Lücke schon,
  // nur die Bestenliste ging weiter leer aus.
  it('records the run of a player who leaves alive', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Geher');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    const player = internals.players.get(playerId);
    player.score = 15_000;
    player.level = 38;
    player.playerClass = 'gatling';
    player.kills = 9;
    player.bestStreak = 5;
    game.removePlayer(playerId);

    await flushPersistence(game);
    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0]).toMatchObject({
      playerName: 'Geher',
      score: 15_000,
      level: 38,
      playerClass: 'gatling',
      kills: 9,
      bestStreak: 5,
      userId: null
    });
    stopPersistence(game);
  });

  it('does not write a second row when a dead player disconnects', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    const playerId = game.addPlayer('Tot');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now);

    const player = internals.players.get(playerId);
    player.score = 900;
    internals.killPlayer(player, null, now + 1_000, 'Arena');
    game.removePlayer(playerId);

    await flushPersistence(game);
    expect(client.inserted).toHaveLength(1);
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
    // Das Vorladen läuft asynchron – gewartet wird auf SEIN Ergebnis, nicht auf
    // eine Frist. Eine feste Wartezeit misst die Auslastung der Maschine mit.
    await settle(() => client.preloadCalls > 0);
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
    await settle(() => client.preloadCalls > 0);
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
    await settle(() => client.preloadCalls > 0);

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
    // Auch der gescheiterte Lesevorgang zaehlt als Versuch – darauf wird gewartet.
    await settle(() => client.preloadCalls > 0);
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
    await settle(beantwortet(a));
    expect(a.state.status).toBe(404);
    stopPersistence(gameA);

    const broken = new FakeClient();
    broken.failReads = true;
    const gameB = withPersistence(broken);
    const b = respond();
    profileHandler(gameB)({ params: { userId: USER_ID }, query: {} } as never, b.response as never);
    await settle(beantwortet(b));
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
    await settle(() => state.body !== null);

    expect(state.headers['Cache-Control']).toBe('public, max-age=30');
    expect((state.body as { cacheSeconds: number }).cacheSeconds).toBe(30);
    stopPersistence(game);
  });
});

describe('profile write (POST /profile)', () => {
  const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  const post = (game: MazeGame, body: unknown, authorization?: string) => {
    const call = respond();
    profileUpdateHandler(game)(
      { body, headers: authorization ? { authorization } : {} } as never,
      call.response as never
    );
    return call;
  };

  it('sanitizes the name exactly like the join message', () => {
    const client = new FakeClient();
    const game = withPersistence(client);

    expect(updateDisplayName(game, USER_ID, '  Ada   Lovelace  ')).toBe('Ada Lovelace');
    expect(updateDisplayName(game, USER_ID, 'Ada<script>')).toBe('Adascript');
    expect(updateDisplayName(game, USER_ID, 'Eine viel zu lange Anzeige die abgeschnitten wird'))
      .toHaveLength(18);
    expect(updateDisplayName(game, USER_ID, '   ')).toBeNull();
    expect(updateDisplayName(game, USER_ID, '\u0007\u0000')).toBeNull();
    stopPersistence(game);
  });

  it('buffers the write instead of waiting for the database', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);

    expect(updateDisplayName(game, USER_ID, 'Ada')).toBe('Ada');
    // Kein Schreibzugriff im Aufruf selbst.
    expect(client.profileCalls).toBe(0);

    await flushPersistence(game);
    expect(client.profiles).toEqual([{ userId: USER_ID, displayName: 'Ada' }]);
    stopPersistence(game);
  });

  it('drops the cached profile so the new name shows up at once', async () => {
    const client = new FakeClient();
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });
    await profile(game, USER_ID);
    expect(client.profileFetches).toBe(1);

    updateDisplayName(game, USER_ID, 'Grace');
    await profile(game, USER_ID);

    expect(client.profileFetches).toBe(2);
    stopPersistence(game);
  });

  it('rejects an unknown account id without touching the queue', () => {
    const client = new FakeClient();
    const game = withPersistence(client);
    expect(updateDisplayName(game, 'nicht-uuid', 'Ada')).toBeNull();
    expect(persistenceStats(game).queued).toBe(0);
    stopPersistence(game);
  });

  it('is a no-op while persistence is switched off', () => {
    const game = tunePersistence(baseGame());
    expect(updateDisplayName(game, USER_ID, 'Ada')).toBeNull();
  });

  it('accepts a signed token and answers 202', async () => {
    enableAuth();
    const client = new FakeClient();
    const game = withPersistence(client);

    const call = post(game, { displayName: 'Ada Lovelace' }, `Bearer ${await tokenFor(USER_ID)}`);
    await settle(beantwortet(call));

    expect(call.state.status).toBe(202);
    expect(call.state.body).toEqual({ displayName: 'Ada Lovelace', pending: true });
    await flushPersistence(game);
    expect(client.profiles).toEqual([{ userId: USER_ID, displayName: 'Ada Lovelace' }]);
    stopPersistence(game);
  });

  it('writes the name to the account in the token, not to one from the body', async () => {
    enableAuth();
    const client = new FakeClient();
    const game = withPersistence(client);
    const other = '9c858901-8a57-4791-81fe-4c455b099bc9';

    // Ein untergeschobenes userId-Feld darf keine Wirkung haben.
    const untergeschoben = post(game, { displayName: 'Fremd', userId: other }, `Bearer ${await tokenFor(USER_ID)}`);
    await settle(beantwortet(untergeschoben));

    await flushPersistence(game);
    expect(client.profiles).toEqual([{ userId: USER_ID, displayName: 'Fremd' }]);
    stopPersistence(game);
  });

  it('answers 401 without a token, with a broken one and while auth is off', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);

    enableAuth();
    const token = await tokenFor(USER_ID);
    for (const header of [undefined, 'Bearer kaputt', `Basic ${token}`]) {
      const call = post(game, { displayName: 'Ada' }, header);
      await settle(beantwortet(call));
      expect(call.state.status).toBe(401);
    }

    // Ohne aktivierten Login gibt es kein Konto – also auch kein Profil.
    resetAuth();
    const offline = post(game, { displayName: 'Ada' }, `Bearer ${token}`);
    await settle(beantwortet(offline));
    expect(offline.state.status).toBe(401);
    expect(client.profiles).toHaveLength(0);
    stopPersistence(game);
  });

  it('answers 400 for a missing or unusable name', async () => {
    enableAuth();
    const client = new FakeClient();
    const game = withPersistence(client);
    const header = `Bearer ${await tokenFor(USER_ID)}`;

    for (const body of [undefined, {}, { displayName: 42 }]) {
      const call = post(game, body, header);
      await settle(beantwortet(call));
      expect(call.state.status).toBe(400);
    }

    const blank = post(game, { displayName: '   ' }, header);
    await settle(beantwortet(blank));
    expect(blank.state.status).toBe(400);
    expect(client.profiles).toHaveLength(0);
    stopPersistence(game);
  });

  it('answers 404 while persistence is switched off', () => {
    const game = tunePersistence(baseGame());
    const call = post(game, { displayName: 'Ada' }, 'Bearer egal');
    expect(call.state.status).toBe(404);
  });
});

describe('favourite class and playtime', () => {
  const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('reports the favourite class and the total playtime', async () => {
    const client = new FakeClient();
    const game = withPersistence(client);

    const found = await profile(game, USER_ID);
    expect(found?.stats.favoriteClass).toBe('storm');
    expect(found?.stats.favoriteClassRuns).toBe(7);
    expect(found?.stats.favoriteClassSeconds).toBe(1_800);
    expect(found?.stats.totalSeconds).toBe(3_600);
    stopPersistence(game);
  });

  it('falls back to empty stats for an account without runs', async () => {
    const client = new FakeClient();
    client.profileFor = async (userId: string) => ({
      userId,
      displayName: 'Neu',
      memberSince: '2026-08-05T10:00:00.000Z',
      stats: null,
      achievements: []
    });
    const game = withPersistence(client);

    const found = await profile(game, USER_ID);
    expect(found?.stats.favoriteClass).toBeNull();
    expect(found?.stats.totalSeconds).toBe(0);
    expect(found?.stats.runs).toBe(0);
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

  /**
   * Der Cache-Schluessel war die Zeit, nicht das `limit`: Wer ihn fuellte,
   * bestimmte 30 Sekunden lang die Listenlaenge fuer alle. Ein einziges
   * `GET /leaderboard?limit=1` kuerzte damit jedem Startscreen die
   * Bestenliste auf einen Eintrag -- der Handler kann fehlende Zeilen nicht
   * nachholen, er schneidet nur zu.
   */
  it('laesst eine kurze Anfrage nicht die Liste aller anderen kuerzen', async () => {
    const client = new FakeClient();
    client.entries = Array.from({ length: 50 }, (_, index) => entry({ rank: index + 1, score: 9_000 - index }));
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });

    const kurz = await leaderboard(game, 1);
    const voll = await leaderboard(game, 50);
    const mittel = await leaderboard(game, 10);

    expect(kurz).toHaveLength(1);
    expect(voll).toHaveLength(50);
    expect(mittel).toHaveLength(10);
    // Und das alles aus einer einzigen Abfrage -- der Cache bleibt der Punkt.
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
    // Hier IST die Wartezeit der Gegenstand: Der Cache haelt 1 ms, es geht
    // darum, dass er danach abgelaufen ist. Eine Bedingung gaebe es nicht.
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
    await settle(() => state.status !== 200);

    expect(state.status).toBe(503);
    stopPersistence(game);
  });

  it('caps the limit and advertises the cache window', async () => {
    const client = new FakeClient();
    client.entries = Array.from({ length: 50 }, (_, index) => entry({ rank: index + 1, score: 9_000 - index }));
    const game = withPersistence(client, { leaderboardCacheMs: 30_000 });
    const { response, state } = respond();

    leaderboardHandler(game)({ query: { limit: '500' } } as never, response as never);
    await settle(() => state.body !== null);

    const body = state.body as { entries: LeaderboardEntry[]; cacheSeconds: number };
    expect(body.entries).toHaveLength(50);
    expect(body.cacheSeconds).toBe(30);
    expect(state.headers['Cache-Control']).toBe('public, max-age=30');
    stopPersistence(game);
  });
});
