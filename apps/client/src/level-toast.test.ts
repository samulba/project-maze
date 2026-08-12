import { describe, expect, it } from 'vitest';
import { levelToast } from './level-toast';

describe('levelToast', () => {
  it('bleibt still, solange kein Klassentor gekreuzt wird', () => {
    // Befund 24: sechs identische Toasts in zwölf Sekunden – die reinen
    // Punkte-Level melden nur noch über das Badge.
    expect(levelToast(1, 2)).toBeNull();
    expect(levelToast(5, 7)).toBeNull();
    expect(levelToast(16, 27)).toBeNull();
  });

  it('meldet das erste Tor mit der echten Klassenzahl', () => {
    const toast = levelToast(4, 5);
    expect(toast?.title).toBe('Level 5');
    expect(toast?.body).toContain('8 Klassen');
    expect(toast?.body).toContain('+1 Punkt.');
  });

  it('pluralisiert bei einem Mehrfachsprung statt die Einzahl zu behaupten', () => {
    // Befund 33: eine Pentagon bringt aus dem Stand Level 5 – vier Punkte,
    // ein Snapshot, und der alte Text sagte „einen neuen Upgrade-Punkt".
    const toast = levelToast(1, 5);
    expect(toast?.title).toBe('Level 5');
    expect(toast?.body).toContain('+4 Punkte');
  });

  it('kennt die weiteren Tore des Baums', () => {
    expect(levelToast(14, 15)).not.toBeNull();
    expect(levelToast(27, 28)).not.toBeNull();
    expect(levelToast(41, 42)).not.toBeNull();
    // Über ein Tor hinweg gesprungen zählt ebenfalls.
    expect(levelToast(13, 16)).not.toBeNull();
  });

  it('liefert für rückwärts oder stillstehende Level nichts', () => {
    expect(levelToast(10, 10)).toBeNull();
    expect(levelToast(10, 5)).toBeNull();
  });
});
