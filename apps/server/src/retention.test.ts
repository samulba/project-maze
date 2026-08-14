import { describe, expect, it } from 'vitest';
import { REIFESTUFEN, tagesnummer, wiederkehr, wochenStart, type KohortenGeraet } from './retention';

/**
 * Die Wiederkehr traegt die letzte offene Zeile aus `docs/GOAL.md`. Eine Quote,
 * die falsch rechnet, ist hier schlimmer als keine: Sie beantwortet die einzige
 * Frage, die kein anderer Test beantworten kann -- und niemand rechnet sie nach.
 */

const TAG = 86_400_000;
/** Feste Uhr: Mittwoch, 12.08.2026, 12:00 UTC. */
const JETZT = Date.parse('2026-08-12T12:00:00Z');

/** Ein Geraet, das vor `vorTagen` zum ersten und vor `letztVorTagen` zum letzten Mal da war. */
const geraet = (id: string, vorTagen: number, letztVorTagen = vorTagen, sessions = 1): KohortenGeraet => ({
  deviceId: id,
  // 09:00 und 21:00: verschiedene Uhrzeiten, damit die Tagesrechnung sich
  // beweisen muss und nicht zufaellig mit der Stundenrechnung uebereinstimmt.
  firstSeen: new Date(JETZT - vorTagen * TAG).toISOString().replace(/T.*/, 'T21:00:00.000Z'),
  lastSeen: new Date(JETZT - letztVorTagen * TAG).toISOString().replace(/T.*/, 'T09:00:00.000Z'),
  sessions
});

describe('Wiederkehr: wer noch nicht wiederkommen konnte, zaehlt nicht mit', () => {
  it('laesst Geraete von heute aus Zaehler UND Nenner heraus', () => {
    // Der Kern der Sache: Ohne diese Regel liesse ein guter Tag mit vielen
    // neuen Spielern die Quote einbrechen -- Erfolg saehe aus wie Absturz.
    const w = wiederkehr([
      geraet('alt-wieder', 10, 3),   // reif, kam wieder
      geraet('alt-einmal', 10, 10),  // reif, kam nie wieder
      geraet('heute-a', 0),          // zu jung
      geraet('heute-b', 0),
      geraet('heute-c', 0)
    ], JETZT);

    expect(w.betrachtet).toBe(5);
    expect(w.frisch).toBe(3);
    // Zwei reife Geraete, eines kam wieder: 50 %, nicht 20 %.
    expect(w.quote).toBe(50);
    expect(w.wieder).toBe(1);
    expect(w.einmal).toBe(1);
  });

  it('meldet keine Quote, solange kein Geraet reif ist', () => {
    // `null` und nicht `0`: „noch niemand konnte wiederkommen" ist etwas
    // anderes als „niemand kam wieder".
    const w = wiederkehr([geraet('heute', 0), geraet('auch-heute', 0)], JETZT);
    expect(w.quote).toBeNull();
    expect(w.stufen.find((s) => s.tage === 1)?.reif).toBe(0);
  });
});

describe('Wiederkehr rechnet in Kalendertagen, nicht in 24 Stunden', () => {
  it('zaehlt den naechsten Abend als wiedergekommen', () => {
    // 20:00 Uhr angefangen, am naechsten Tag um 19:00 wieder da: 23 Stunden.
    // Nach Stundenrechnung „nicht wiedergekommen" -- und das waere Unsinn.
    const w = wiederkehr([{
      deviceId: 'abend',
      firstSeen: '2026-08-10T20:00:00Z',
      lastSeen: '2026-08-11T19:00:00Z',
      sessions: 2
    }], JETZT);
    expect(w.quote).toBe(100);
  });

  it('zaehlt zwei Besuche am selben Tag NICHT als Wiederkehr', () => {
    // Zwei Sitzungen sind noch kein zweiter Tag -- „Fremde kommen wieder"
    // meint den naechsten Tag, nicht den Reconnect nach dem Verbindungsabbruch.
    const w = wiederkehr([{
      deviceId: 'doppelt',
      firstSeen: '2026-08-10T09:00:00Z',
      lastSeen: '2026-08-10T23:30:00Z',
      sessions: 2
    }], JETZT);
    expect(w.quote).toBe(0);
    expect(w.einmal).toBe(1);
  });
});

describe('Reifestufen', () => {
  it('misst jede Stufe an ihrem eigenen Nenner', () => {
    const w = wiederkehr([
      geraet('a', 40, 39),  // reif fuer alle Stufen, Abstand 1
      geraet('b', 40, 5),   // reif fuer alle, Abstand 35
      geraet('c', 5, 4)     // nur fuer Stufe 1 und 3 reif, Abstand 1
    ], JETZT, 30);

    const stufe = (tage: number) => w.stufen.find((s) => s.tage === tage)!;
    expect(stufe(1).reif).toBe(3);
    expect(stufe(1).geblieben).toBe(3);
    expect(stufe(7).reif).toBe(2);   // „c" ist erst 5 Tage alt
    expect(stufe(7).geblieben).toBe(1); // nur „b" hat 35 Tage Abstand
    expect(stufe(7).quote).toBe(50);
    expect(stufe(30).quote).toBe(50);
  });

  it('fragt nicht weiter, als das Zeitfenster reicht', () => {
    // Eine 30-Tage-Stufe in einer 7-Tage-Ansicht waere eine Zahl ueber Geraete,
    // die in dieser Ansicht gar nicht vorkommen.
    const w = wiederkehr([geraet('a', 3, 2)], JETZT, 7);
    expect(w.stufen.map((s) => s.tage)).toEqual([1, 3, 7]);
    expect(REIFESTUFEN).toContain(30);
  });
});

describe('Kohorten nach Woche des ersten Besuchs', () => {
  it('gruppiert auf den Montag und sortiert die juengste Woche nach oben', () => {
    // 12.08.2026 ist ein Mittwoch, der Montag davor der 10.08.
    const w = wiederkehr([geraet('diese-woche', 1, 0), geraet('vorwoche', 8, 7)], JETZT);
    expect(w.kohorten.map((k) => k.start)).toEqual(['2026-08-10', '2026-08-03']);
    expect(w.kohorten[0]?.neu).toBe(1);
  });

  it('laesst die frischen Mitglieder aus der Quote der laufenden Woche heraus', () => {
    const w = wiederkehr([
      geraet('reif-wieder', 2, 1),
      geraet('heute-1', 0),
      geraet('heute-2', 0)
    ], JETZT);
    const laufend = w.kohorten[0]!;
    expect(laufend.neu).toBe(3);        // die Kohorte ist drei gross
    expect(laufend.quote).toBe(100);    // gemessen wird aber nur am reifen einen
    expect(laufend.juengstesAlter).toBe(0);
  });
});

describe('Widerspenstige Daten', () => {
  it('wirft unlesbare Zeitstempel heraus, statt sie zu addieren', () => {
    const w = wiederkehr([
      geraet('gut', 5, 4),
      { deviceId: 'kaputt', firstSeen: 'kein Datum', lastSeen: 'auch nicht', sessions: 3 }
    ], JETZT);
    expect(w.betrachtet).toBe(1);
    expect(w.quote).toBe(100);
  });

  it('liest einen letzten Besuch vor dem ersten als „nie wieder"', () => {
    const w = wiederkehr([{
      deviceId: 'verdreht',
      firstSeen: '2026-08-10T00:00:00Z',
      lastSeen: '2026-08-01T00:00:00Z',
      sessions: 1
    }], JETZT);
    expect(w.quote).toBe(0);
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    const w = wiederkehr([], JETZT);
    expect(w.betrachtet).toBe(0);
    expect(w.quote).toBeNull();
    expect(w.kohorten).toEqual([]);
  });

  it('reicht das Zeilenlimit der Abfrage durch', () => {
    // Eine gedeckelte Zahl, die sich fuer vollstaendig ausgibt, ist schlimmer
    // als gar keine.
    expect(wiederkehr([geraet('a', 2, 1)], JETZT, 30, true).abgeschnitten).toBe(true);
    expect(wiederkehr([geraet('a', 2, 1)], JETZT, 30).abgeschnitten).toBe(false);
  });
});

describe('Hilfsrechnungen', () => {
  it('legt den Wochenstart auf Montag', () => {
    const montag = tagesnummer('2026-08-10T00:00:00Z')!;
    const sonntag = tagesnummer('2026-08-16T23:59:00Z')!;
    expect(wochenStart(montag)).toBe(montag);
    expect(wochenStart(sonntag)).toBe(montag);
    expect(wochenStart(tagesnummer('2026-08-17T00:00:00Z')!)).toBe(montag + 7);
  });

  it('gibt bei unlesbaren Zeitstempeln null zurueck', () => {
    expect(tagesnummer('2026-08-10T00:00:00Z')).toBe(20_675);
    expect(tagesnummer('Kartoffel')).toBeNull();
  });
});
