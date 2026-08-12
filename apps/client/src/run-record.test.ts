import { describe, expect, it } from 'vitest';
import { deathRecordLine, mergeRun, readRunRecord, recordLine, rememberRun, type LocalRunRecord } from './run-record';

const speicher = (): Pick<Storage, 'getItem' | 'setItem'> & { daten: Map<string, string> } => {
  const daten = new Map<string, string>();
  return {
    daten,
    getItem: (key: string) => daten.get(key) ?? null,
    setItem: (key: string, value: string) => void daten.set(key, value)
  };
};

describe('run-record (Befund 48)', () => {
  it('führt Bestwerte je Feld und zählt die Läufe', () => {
    const s = speicher();
    rememberRun({ score: 2000, level: 12, kills: 1, seconds: 90 }, '2026-08-12T10:00:00Z', s);
    const zweiter = rememberRun({ score: 900, level: 18, kills: 4, seconds: 40 }, '2026-08-12T11:00:00Z', s);
    expect(zweiter.record).toEqual({
      bestScore: 2000,
      bestLevel: 18,
      mostKills: 4,
      longestRunSeconds: 90,
      runs: 2,
      lastVisit: '2026-08-12T11:00:00Z'
    });
    expect(zweiter.neuerBestScore).toBe(false);
  });

  it('erkennt den neuen Bestscore erst ab dem zweiten Lauf', () => {
    const erster = mergeRun(null, { score: 500, level: 5, kills: 0, seconds: 30 }, 'x');
    expect(erster.neuerBestScore).toBe(false);
    const zweiter = mergeRun(erster.record, { score: 900, level: 4, kills: 0, seconds: 20 }, 'x');
    expect(zweiter.neuerBestScore).toBe(true);
  });

  it('fällt bei kaputtem JSON auf null zurück statt zu werfen', () => {
    const s = speicher();
    s.daten.set('mazers-run', '{kaputt');
    expect(readRunRecord(s)).toBeNull();
    s.daten.set('mazers-run', JSON.stringify({ bestScore: 'nein', runs: 0 }));
    expect(readRunRecord(s)).toBeNull();
  });

  it('baut die Startscreen-Zeile aus dem Bestand', () => {
    const record: LocalRunRecord = { bestScore: 9041, bestLevel: 31, mostKills: 6, longestRunSeconds: 500, runs: 3, lastVisit: 'x' };
    expect(recordLine(record)).toBe('Dein Rekord: 9.041 · Level 31 · 3 Läufe');
    expect(recordLine(null)).toBeNull();
  });

  it('vergleicht auf dem Death-Screen gegen den Bestand (Befund 53)', () => {
    const s = speicher();
    const erster = rememberRun({ score: 500, level: 5, kills: 0, seconds: 30 }, 'x', s);
    // Der allererste Lauf hat nichts zu vergleichen.
    expect(deathRecordLine(erster, 500)).toBeNull();
    const rekord = rememberRun({ score: 900, level: 8, kills: 1, seconds: 60 }, 'x', s);
    expect(deathRecordLine(rekord, 900)).toBe('Neuer Bestwert: 900 Punkte');
    const dritter = rememberRun({ score: 300, level: 3, kills: 0, seconds: 20 }, 'x', s);
    expect(deathRecordLine(dritter, 300)).toBe('Dein Bestwert: 900 · Level 8');
  });
});
