import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_LIMIT,
  classLabel,
  formatDuration,
  formatScore,
  leaderboardUrl,
  usableEntries,
  type LeaderboardEntry
} from './start-leaderboard';

const origin = { protocol: 'https:', hostname: 'www.mazers.de', host: 'www.mazers.de' };

const entry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  playerName: 'Nova',
  score: 12_345,
  level: 30,
  playerClass: 'railgun',
  kills: 7,
  bestStreak: 3,
  durationSeconds: 185,
  achievedAt: '2026-08-05T10:00:00.000Z',
  ...overrides
});

describe('leaderboardUrl', () => {
  it('uses the same origin in production', () => {
    expect(leaderboardUrl(origin, false, 50)).toBe('https://www.mazers.de/leaderboard?limit=50');
  });

  it('talks to the game server port in dev', () => {
    const local = { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173' };
    expect(leaderboardUrl(local, true, 50)).toBe('http://localhost:2567/leaderboard?limit=50');
  });

  it('keeps a non-standard production port', () => {
    const hosted = { protocol: 'https:', hostname: 'example.com', host: 'example.com:8443' };
    expect(leaderboardUrl(hosted, false, 10)).toBe('https://example.com:8443/leaderboard?limit=10');
  });

  it('asks for the documented maximum by default', () => {
    expect(LEADERBOARD_LIMIT).toBe(50);
    expect(leaderboardUrl(origin, false)).toContain('limit=50');
  });
});

describe('formatting', () => {
  it('groups scores the German way', () => {
    expect(formatScore(1_234_567)).toBe('1.234.567');
    expect(formatScore(0)).toBe('0');
  });

  it('never shows a negative or fractional score', () => {
    expect(formatScore(-40)).toBe('0');
    expect(formatScore(12.6)).toBe('13');
  });

  it('writes durations as players read them', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(60)).toBe('1m 00s');
    expect(formatDuration(185)).toBe('3m 05s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('resolves class labels and survives unknown ones', () => {
    expect(classLabel('railgun')).toBe('Railgun');
    expect(classLabel('sternenzerstoerer')).toBe('sternenzerstoerer');
  });
});

describe('usableEntries', () => {
  it('accepts a well formed payload', () => {
    expect(usableEntries({ entries: [entry(), entry({ rank: 2, playerName: 'Orbit' })] })).toHaveLength(2);
  });

  it('drops rows that would render as undefined', () => {
    const payload = {
      entries: [
        entry(),
        { ...entry(), playerName: '' },
        { ...entry(), score: Number.NaN },
        { ...entry(), rank: undefined },
        null
      ]
    };
    expect(usableEntries(payload)).toHaveLength(1);
  });

  it('treats a missing or foreign payload as empty', () => {
    expect(usableEntries(null)).toEqual([]);
    expect(usableEntries({})).toEqual([]);
    expect(usableEntries({ entries: 'nope' })).toEqual([]);
    // Das ist die Antwort ohne konfigurierte Persistenz.
    expect(usableEntries({ error: 'Leaderboard ist nicht konfiguriert.' })).toEqual([]);
  });
});
