import { describe, expect, it } from 'vitest';
import { readLocalUnlocks, rememberUnlock } from './local-achievements';

const speicher = (): Pick<Storage, 'getItem' | 'setItem'> & { daten: Map<string, string> } => {
  const daten = new Map<string, string>();
  return {
    daten,
    getItem: (key: string) => daten.get(key) ?? null,
    setItem: (key: string, value: string) => void daten.set(key, value)
  };
};

describe('local-achievements (Befund 49)', () => {
  it('merkt eine Freischaltung und behält die erste Zeit', () => {
    const s = speicher();
    rememberUnlock('firstStreak5', '2026-08-10T10:00:00Z', s);
    rememberUnlock('firstStreak5', '2026-08-12T10:00:00Z', s);
    expect(readLocalUnlocks(s)).toMatchObject([{ id: 'firstStreak5', unlockedAt: '2026-08-10T10:00:00Z' }]);
  });

  it('wirft Unbekanntes und Kaputtes still raus', () => {
    const s = speicher();
    s.daten.set('mazers-achievements', JSON.stringify([
      { id: 'firstStreak5', unlockedAt: '2026-08-10T10:00:00Z' },
      { id: 'gibtEsNicht', unlockedAt: 'x' },
      { unlockedAt: 'ohne-id' },
      'kein-objekt'
    ]));
    expect(readLocalUnlocks(s)).toMatchObject([{ id: 'firstStreak5', unlockedAt: '2026-08-10T10:00:00Z' }]);
    s.daten.set('mazers-achievements', '{kaputt');
    expect(readLocalUnlocks(s)).toEqual([]);
  });

  it('funktioniert ohne Storage einfach nicht, statt zu werfen', () => {
    expect(() => rememberUnlock('firstStreak5', 'x', null)).not.toThrow();
    expect(readLocalUnlocks(null)).toEqual([]);
  });
});
