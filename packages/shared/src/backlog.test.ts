import { describe, expect, it } from 'vitest';
import { BACKLOG, backlogNachBereich, zaehleBacklog, type BacklogEintrag } from './backlog';

/**
 * Diese Tests bewachen keine Mechanik, sondern eine **Zusage an Sam**: „damit
 * wir ja nichts vergessen". Eine Liste, die still verfällt – doppelte IDs,
 * Erledigtes ohne Beleg, verschwundene Einträge – wäre schlimmer als keine,
 * weil man ihr glaubt.
 */

describe('Backlog', () => {
  it('vergibt jede Kennung genau einmal', () => {
    const ids = BACKLOG.map((e) => e.id);
    expect(new Set(ids).size, `doppelt: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`).toBe(ids.length);
  });

  /**
   * Der wichtigste Test der Datei. „Erledigt" ohne Beleg ist eine Behauptung,
   * und genau davon hatte Sam zu viele: Er hat den Reichweiten-Punkt dreimal
   * gemeldet, und zweimal stand er als erledigt da, ohne dass sich die Zahl,
   * um die es ihm ging, bewegt hätte.
   */
  it('lässt „erledigt" nur mit Nachweis zu', () => {
    for (const eintrag of BACKLOG) {
      if (eintrag.stand !== 'erledigt') continue;
      expect(eintrag.nachweis, `${eintrag.id} ist erledigt ohne Nachweis`).toBeTruthy();
      expect((eintrag.nachweis ?? '').length, eintrag.id).toBeGreaterThan(4);
    }
  });

  it('führt Sams Wortlaut bei jedem Eintrag', () => {
    for (const eintrag of BACKLOG) {
      // Kurz ist erlaubt – „Zwei Mainspots." sind Sams ganze Worte zu K2.
      expect(eintrag.wunsch.length, `${eintrag.id} hat keinen Wortlaut`).toBeGreaterThan(10);
      expect(eintrag.gemeldet, eintrag.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('zählt Stände und Fortschritt richtig', () => {
    const zahl = zaehleBacklog();
    expect(zahl.gesamt).toBe(BACKLOG.length);
    expect(zahl.offen + zahl.arbeit + zahl.erledigt + zahl.verworfen).toBe(zahl.gesamt);
    expect(zahl.fortschritt).toBeGreaterThan(0);
    expect(zahl.fortschritt).toBeLessThanOrEqual(1);

    // Und an einem gebauten Fall, dessen Antwort man abzählen kann.
    const probe: BacklogEintrag[] = [
      { id: 'a', wunsch: 'x'.repeat(20), bereich: 'ui', stand: 'erledigt', gemeldet: '2026-08-13', nachweis: 'abc1234' },
      { id: 'b', wunsch: 'x'.repeat(20), bereich: 'ui', stand: 'offen', gemeldet: '2026-08-13' },
      { id: 'c', wunsch: 'x'.repeat(20), bereich: 'ui', stand: 'verworfen', gemeldet: '2026-08-13' }
    ];
    const gezaehlt = zaehleBacklog(probe);
    // Verworfenes zaehlt nicht als offen – sonst stuende der Fortschritt ewig still.
    expect(gezaehlt.fortschritt).toBeCloseTo(0.5, 9);
  });

  it('gruppiert nach Bereich, Offenes zuerst', () => {
    const gruppen = backlogNachBereich();
    expect(gruppen.length).toBeGreaterThan(1);
    // Jeder Eintrag kommt genau einmal vor.
    expect(gruppen.reduce((summe, g) => summe + g.eintraege.length, 0)).toBe(BACKLOG.length);
    for (const gruppe of gruppen) {
      const staende = gruppe.eintraege.map((e) => e.stand);
      const letzterOffener = staende.lastIndexOf('offen');
      const ersterErledigter = staende.indexOf('erledigt');
      if (letzterOffener >= 0 && ersterErledigter >= 0) {
        expect(letzterOffener, gruppe.bereich).toBeLessThan(ersterErledigter);
      }
    }
  });

  it('hält jeden Punkt aus Sams vier Rückmeldungen fest', () => {
    // Die Zahl steht hier bewusst als Zahl: Faellt ein Eintrag heraus, soll es
    // auffallen – das ist der ganze Zweck der Liste.
    expect(BACKLOG.length).toBeGreaterThanOrEqual(35);
    for (const bereich of ['drohnen', 'projektile', 'karte', 'klassen', 'bots', 'ui', 'bug'] as const) {
      expect(BACKLOG.some((e) => e.bereich === bereich), `kein Eintrag im Bereich ${bereich}`).toBe(true);
    }
  });
});
