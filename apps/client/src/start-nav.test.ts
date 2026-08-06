import { describe, expect, it } from 'vitest';
import { START_NAV, START_PAGES, isStartPage, pageAfterBack, resolvePage } from './start-nav';

/**
 * Die Navigation hat zwei Eigenschaften, die man leicht kaputt macht und
 * schwer bemerkt: Ein unbekanntes Ziel darf nicht ins Leere führen, und der
 * Weg ins Spiel darf nicht länger werden. Das Erste steht hier fest, das
 * Zweite in der Browser-Probe (Startseite trägt genau Namensfeld und
 * Play-Knopf, sonst kein Bedienelement).
 */

describe('Seitenmodell des Startscreens', () => {
  it('kennt die Startseite und je eine Unterseite, Start an erster Stelle', () => {
    expect(START_PAGES[0]).toBe('start');
    // Start plus genau die Seiten, zu denen die Navigation führt – eine Seite
    // ohne Weg dorthin wäre tot, ein Weg ohne Seite führte ins Leere.
    expect(START_PAGES).toHaveLength(START_NAV.length + 1);
    expect([...START_PAGES].slice(1).sort()).toEqual(START_NAV.map((e) => e.id).sort());
  });

  it('führt die Klassen als ersten Weg, noch vor dem Profil', () => {
    // Vor dem ersten Spiel ist „was werde ich eigentlich?" die Frage, nicht
    // „wie stehen meine Bestwerte?".
    expect(START_NAV[0]?.id).toBe('klassen');
  });

  it('führt jeden Navigationseintrag auf eine echte Seite', () => {
    for (const eintrag of START_NAV) expect(START_PAGES).toContain(eintrag.id);
  });

  it('zeigt die Startseite nicht als Navigationseintrag', () => {
    // Sie ist der Ausgangspunkt, kein Ziel – ein Eintrag „Start" wäre ein Weg
    // von der Startseite zur Startseite.
    expect(START_NAV.map((eintrag) => eintrag.id)).not.toContain('start');
  });

  it('gibt jedem Eintrag eine Beschriftung und eine Zeile darunter', () => {
    // Ohne den Hinweis ist die Navigation eine Liste aus Wörtern; mit ihm weiß
    // man vor dem Klick, was einen erwartet.
    for (const eintrag of START_NAV) {
      expect(eintrag.label.length).toBeGreaterThan(2);
      expect(eintrag.hint.length).toBeGreaterThan(8);
    }
  });

  it('führt unbekannte Ziele zur Startseite statt ins Leere', () => {
    expect(resolvePage('profil')).toBe('profil');
    expect(resolvePage('gibtesnicht')).toBe('start');
    expect(resolvePage(undefined)).toBe('start');
    expect(resolvePage(null)).toBe('start');
    expect(resolvePage(7)).toBe('start');
  });

  it('erkennt Seiten-Namen', () => {
    expect(isStartPage('einstellungen')).toBe(true);
    expect(isStartPage('Einstellungen')).toBe(false);
    expect(isStartPage('')).toBe(false);
  });

  it('geht von jeder Unterseite zum Start zurück, nicht tiefer', () => {
    // Genau eine Ebene. Ein Startscreen mit Verlaufsstapel wäre ein zweites
    // Problem, kein gelöstes erstes.
    expect(pageAfterBack()).toBe('start');
  });
});
