import { describe, expect, it } from 'vitest';
import {
  LEADERBOARD_LIMIT,
  classLabel,
  deathDistanceLine,
  distanceLine,
  formatDuration,
  formatScore,
  leaderboardUrl,
  ownPlayerName,
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

describe('eigene Zeile und Abstand (Befund 56)', () => {
  it('kennt den eigenen Namen nur, wenn er nicht der Standard ist', () => {
    expect(ownPlayerName(() => 'Sam')).toBe('Sam');
    expect(ownPlayerName(() => '  Sam  ')).toBe('Sam');
    // Zwanzig „Player"-Zeilen als „deine" zu markieren wäre die falsche Auskunft.
    expect(ownPlayerName(() => 'Player')).toBeNull();
    expect(ownPlayerName(() => null)).toBeNull();
    expect(ownPlayerName(() => { throw new Error('kein Storage'); })).toBeNull();
  });

  it('nennt den Abstand zum letzten Platz der Liste', () => {
    const entries = [entry({ rank: 1, score: 12_000 }), entry({ rank: 2, score: 8_100, playerName: 'Orbit' })];
    expect(distanceLine(entries, 6_200)).toBe('Dein Bestwert: 6.200 – Platz 2 liegt bei 8.100.');
    expect(distanceLine(entries, 9_000)).toBe('Dein Bestwert: 9.000 – du spielst in dieser Liga.');
  });

  it('schweigt ohne lokalen Bestand oder ohne Liste', () => {
    expect(distanceLine([], 5_000)).toBeNull();
    expect(distanceLine([entry()], null)).toBeNull();
  });
});

describe('Messlatte auf der Death-Karte (Rest von Befund 53)', () => {
  const liste = (scores: number[]): LeaderboardEntry[] =>
    scores.map((score, index) => entry({ rank: index + 1, score }));

  it('nennt den ungefähren Platz, solange die Liste nicht voll ist', () => {
    // Drei Einträge bei Limit 50: Jeder beendete Lauf steht in der Liste.
    expect(deathDistanceLine(liste([9_000, 7_000, 5_000]), 8_000)).toBe(
      'Dieser Lauf steht in der Bestenliste – etwa Platz 2.'
    );
    // Schwächer als alle: hinten dran.
    expect(deathDistanceLine(liste([9_000, 7_000, 5_000]), 100)).toBe(
      'Dieser Lauf steht in der Bestenliste – etwa Platz 4.'
    );
  });

  it('rechnet bei voller Liste den Abstand zur letzten Zeile', () => {
    const voll = liste(Array.from({ length: LEADERBOARD_LIMIT }, (_, i) => 100_000 - i * 1_000));
    expect(deathDistanceLine(voll, 40_000)).toBe(
      'Noch 11.000 Punkte bis zur Bestenliste (Platz 50: 51.000).'
    );
    // Wer die letzte Zeile schlägt, steht drin – auch bei voller Liste.
    expect(deathDistanceLine(voll, 51_500)).toBe('Dieser Lauf steht in der Bestenliste – etwa Platz 50.');
  });

  it('bleibt ohne Daten stumm', () => {
    expect(deathDistanceLine([], 5_000)).toBeNull();
  });
});

describe('Zeitfenster-URL (Befund 51)', () => {
  it('hängt das Fenster nur an, wenn es nicht das ewige ist', () => {
    // Ältere Server kennen den Parameter nicht – EWIG bleibt die alte URL.
    expect(leaderboardUrl(origin, false, 50, 'ewig')).toBe('https://www.mazers.de/leaderboard?limit=50');
    expect(leaderboardUrl(origin, false, 50, 'heute')).toBe('https://www.mazers.de/leaderboard?limit=50&fenster=heute');
    expect(leaderboardUrl(origin, false, 50, 'woche')).toBe('https://www.mazers.de/leaderboard?limit=50&fenster=woche');
  });
});
