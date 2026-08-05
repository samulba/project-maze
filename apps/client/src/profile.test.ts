import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_CATALOG, type AchievementId } from '@project-maze/shared/gameplay';
import {
  achievementGallery,
  favoriteClassLine,
  formatMemberSince,
  formatPlaytime,
  profileUpdateUrl,
  profileUrl,
  updateMessage,
  usableProfile,
  type ProfileStats
} from './profile';

const ORIGIN = { protocol: 'https:', hostname: 'www.mazers.de', host: 'www.mazers.de' };

const STATS: ProfileStats = {
  runs: 12,
  bestScore: 24_500,
  bestLevel: 31,
  bestKills: 18,
  bestStreak: 7,
  longestRunSeconds: 412,
  totalKills: 96,
  totalSeconds: 5_400,
  firstRunAt: '2026-07-02T10:00:00.000Z',
  lastRunAt: '2026-08-06T09:00:00.000Z',
  favoriteClass: 'storm',
  favoriteClassRuns: 4,
  favoriteClassSeconds: 900
};

describe('Adressen', () => {
  it('spricht in Produktion dieselbe Origin an, im Dev den Spielserver', () => {
    expect(profileUrl(ORIGIN, false, 'abc')).toBe('https://www.mazers.de/profile/abc');
    expect(profileUrl(ORIGIN, true, 'abc')).toBe('https://www.mazers.de:2567/profile/abc');
    expect(profileUpdateUrl(ORIGIN, false)).toBe('https://www.mazers.de/profile');
  });

  it('kodiert die Konto-ID', () => {
    expect(profileUrl(ORIGIN, false, 'a/b?c')).toBe('https://www.mazers.de/profile/a%2Fb%3Fc');
  });
});

describe('Antwort prüfen', () => {
  it('verwirft, was keine Konto-ID hat', () => {
    expect(usableProfile(null)).toBeNull();
    expect(usableProfile({})).toBeNull();
    expect(usableProfile({ userId: '' })).toBeNull();
    expect(usableProfile('nope')).toBeNull();
  });

  it('nimmt ein frisches Konto ohne Läufe an', () => {
    const profil = usableProfile({ userId: 'u1', displayName: null, memberSince: null, stats: {}, achievements: [] });
    expect(profil?.stats.runs).toBe(0);
    expect(profil?.stats.bestScore).toBe(0);
    expect(profil?.stats.favoriteClass).toBeNull();
    expect(profil?.achievements).toEqual([]);
  });

  it('verwirft eine Klasse, die dieser Client nicht kennt', () => {
    const profil = usableProfile({ userId: 'u1', stats: { ...STATS, favoriteClass: 'hoverpanzer' } });
    expect(profil?.stats.favoriteClass).toBeNull();
  });

  it('verwirft Achievements, die nicht im Katalog stehen', () => {
    const profil = usableProfile({
      userId: 'u1',
      stats: STATS,
      achievements: [
        { id: 'maxLevel', name: 'x', description: 'y', unlockedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'erfunden', name: 'x', description: 'y', unlockedAt: '2026-08-01T00:00:00.000Z' }
      ]
    });
    expect(profil?.achievements.map((eintrag) => eintrag.id)).toEqual(['maxLevel']);
  });

  it('behält gültige Zahlen unverändert', () => {
    const profil = usableProfile({ userId: 'u1', displayName: 'Ada', memberSince: '2026-07-02T10:00:00.000Z', stats: STATS, achievements: [] });
    expect(profil?.displayName).toBe('Ada');
    expect(profil?.stats).toEqual(STATS);
  });
});

describe('Galerie', () => {
  it('zeigt den ganzen Katalog, nicht nur das Freigeschaltete', () => {
    const galerie = achievementGallery([
      { id: 'maxLevel', name: 'Ausgereizt', description: '…', unlockedAt: '2026-08-01T00:00:00.000Z' }
    ]);
    expect(galerie).toHaveLength(Object.keys(ACHIEVEMENT_CATALOG).length);
    const offen = galerie.filter((eintrag) => eintrag.unlockedAt !== null);
    expect(offen.map((eintrag) => eintrag.id)).toEqual(['maxLevel']);
  });

  it('nimmt Namen und Beschreibung aus dem Katalog, nicht aus der Antwort', () => {
    const galerie = achievementGallery([
      { id: 'maxLevel' as AchievementId, name: 'Serverfassung', description: 'alt', unlockedAt: '2026-08-01T00:00:00.000Z' }
    ]);
    const eintrag = galerie.find((kandidat) => kandidat.id === 'maxLevel');
    expect(eintrag?.name).toBe(ACHIEVEMENT_CATALOG.maxLevel.name);
  });

  it('kommt mit einem leeren Konto klar', () => {
    expect(achievementGallery([]).every((eintrag) => eintrag.unlockedAt === null)).toBe(true);
  });
});

describe('Formatierung', () => {
  it('schreibt „seit Monat Jahr" oder nichts', () => {
    expect(formatMemberSince('2026-07-02T10:00:00.000Z')).toBe('seit Juli 2026');
    expect(formatMemberSince(null)).toBeNull();
    expect(formatMemberSince('kein Datum')).toBeNull();
  });

  it('zeigt Spielzeit in Stunden, nicht in Sekunden', () => {
    expect(formatPlaytime(0)).toBe('0s');
    expect(formatPlaytime(45)).toBe('45s');
    expect(formatPlaytime(600)).toBe('10m');
    expect(formatPlaytime(5_400)).toBe('1h 30m');
    expect(formatPlaytime(-5)).toBe('0s');
  });

  it('nennt die Lieblingsklasse mit Anzahl – im Singular korrekt', () => {
    expect(favoriteClassLine(STATS)).toBe('Storm · 4 Läufe');
    expect(favoriteClassLine({ ...STATS, favoriteClassRuns: 1 })).toBe('Storm · 1 Lauf');
    expect(favoriteClassLine({ ...STATS, favoriteClassRuns: 0 })).toBe('Storm');
    expect(favoriteClassLine({ ...STATS, favoriteClass: null })).toBeNull();
  });
});

describe('Antwort auf die Namensänderung', () => {
  it('erklärt jeden Status, den der Server schicken kann', () => {
    expect(updateMessage(202).ok).toBe(true);
    for (const status of [400, 401, 404, 429, 500, 503]) {
      const meldung = updateMessage(status);
      expect(meldung.ok, `Status ${status}`).toBe(false);
      expect(meldung.text.length).toBeGreaterThan(0);
    }
  });
});
