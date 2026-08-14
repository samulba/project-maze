import { describe, expect, it } from 'vitest';
import { backlogBlock, haelften, renderPortal, renderTor, TAFELN, type ViewState } from './view';
import { dauer, initialen, kompakt, kurzId, seit, trend } from './format';
import { nettesMaximum } from './charts';
import type { DailyRow, DeviceRow, Overview } from './types';

/**
 * Die ersten Tests des Admin-Portals -- und sie gehoeren genau hierher.
 *
 * Das Portal ist das Instrument fuer die wichtigste Zeile des Ziels: „Fremde
 * kommen wieder". Ein Portal, das falsch rechnet, ist schlimmer als keines --
 * man trifft Entscheidungen auf seinen Zahlen, ohne sie nachzurechnen. Genau
 * das ist hier passiert: Der Trend-Vergleich teilte sieben Tage in drei gegen
 * vier und meldete auf einer flachen Woche +33 % Wachstum.
 */

const tag = (tag: string, players: number, extra: Partial<DailyRow> = {}): DailyRow => ({
  day: `2026-08-${tag}T00:00:00Z`,
  sessions: players * 2,
  players,
  newPlayers: Math.round(players / 2),
  accounts: 0,
  runs: players * 3,
  kills: players,
  totalSeconds: players * 100,
  bestLevel: 20,
  ...extra
});

/** Eine Woche, an der sich nichts aendert. Der Trend darf hier NICHTS melden. */
const flacheWoche = (): DailyRow[] =>
  ['01', '02', '03', '04', '05', '06', '07'].map((t) => tag(t, 10));

describe('Trend-Vergleich der Zeitraeume', () => {
  it('vergleicht gleich lange Haelften – auch bei ungerader Tageszahl', () => {
    const v = haelften(flacheWoche())!;
    // Drei gegen drei: Der aelteste Tag faellt heraus, nicht die Symmetrie.
    expect(v.alt.players).toBe(v.jung.players);
    expect(v.alt.sessions).toBe(v.jung.sessions);
    expect(trend(v.jung.players, v.alt.players)).toEqual({ text: '±0 %', richtung: 'gleich' });
  });

  it('meldet echtes Wachstum weiterhin', () => {
    const rows = [tag('01', 10), tag('02', 10), tag('03', 10), tag('04', 20), tag('05', 20), tag('06', 20)];
    const v = haelften(rows)!;
    expect(v.alt.players).toBe(30);
    expect(v.jung.players).toBe(60);
    expect(trend(v.jung.players, v.alt.players)).toEqual({ text: '+100 %', richtung: 'hoch' });
  });

  it('haelt sich bei zu wenigen Tagen ganz heraus', () => {
    // Drei Tage ergeben keinen Vergleich, sondern Rauschen mit Vorzeichen.
    expect(haelften([tag('01', 10), tag('02', 10), tag('03', 10)])).toBeNull();
  });

  it('nimmt bei ungerader Zeilenzahl den AELTESTEN Tag heraus', () => {
    // Der jüngste Tag ist der interessante – er darf nie der sein, der fehlt.
    const rows = [tag('01', 1), tag('02', 10), tag('03', 10), tag('04', 10), tag('05', 100)];
    const v = haelften(rows)!;
    expect(v.alt.players).toBe(20);   // 02 + 03
    expect(v.jung.players).toBe(110); // 04 + 05
  });
});

/*
 * Der Beweis am fertigen Bildschirm, nicht nur an der Hilfsfunktion: In diesem
 * Projekt sind schon zweimal Regeln verlorengegangen, die einzeln getestet
 * waren, aber niemand aufrief.
 */
describe('Portal-Ausgabe', () => {
  const zustand = (daily: DailyRow[]): ViewState => {
    const summe = daily.reduce((acc, row) => ({
      players: acc.players + row.players,
      newPlayers: acc.newPlayers + row.newPlayers,
      sessions: acc.sessions + row.sessions,
      accounts: 0,
      runs: acc.runs + row.runs,
      kills: acc.kills + row.kills,
      totalSeconds: acc.totalSeconds + row.totalSeconds,
      avgSessionSeconds: 120
    }), { players: 0, newPlayers: 0, sessions: 0, accounts: 0, runs: 0, kills: 0, totalSeconds: 0, avgSessionSeconds: 120 });
    const overview: Overview = {
      live: { humans: 3, draining: false, features: {} },
      persistence: { enabled: true },
      sessions: { enabled: true },
      days: daily.length,
      database: true,
      today: summe,
      window: summe,
      daily,
      classes: [],
      unusedClasses: [],
      top: []
    } as unknown as Overview;
    return { overview, players: [], playersTotal: 0, sortierung: 'new', tage: 7, aktualisiert: Date.parse('2026-08-07T12:00:00Z'), backlog: null };
  };

  it('zeigt auf einer flachen Woche keinen Aufschwung', () => {
    const html = renderPortal(zustand(flacheWoche()));
    // +33 % war der Fehler: eine Woche ohne jede Veraenderung, gemeldet als
    // Wachstum, weil vier Tage gegen drei gerechnet wurden.
    expect(html).not.toContain('+33 %');
    expect(html).toContain('±0 %');
  });

  it('zeichnet je Tag eine Saeule und nennt die Zahlen im Titel', () => {
    const html = renderPortal(zustand(flacheWoche()));
    expect((html.match(/class="saeule"/g) ?? []).length).toBe(7);
    expect(html).toContain('10 Spieler, davon 5 neu');
    expect(html).toContain('wiederkehrend');
  });
});

describe('Zahlen, wie man sie im Vorbeigehen liest', () => {
  it('nennt keinen Trend, wo es nichts zu vergleichen gibt', () => {
    // Von 0 auf 5 ist kein Wachstum um unendlich Prozent, sondern ein Anfang.
    expect(trend(5, 0)).toBeNull();
    expect(trend(5, -1)).toBeNull();
  });

  it('rundet Prozente und setzt das Vorzeichen', () => {
    expect(trend(150, 100)).toEqual({ text: '+50 %', richtung: 'hoch' });
    expect(trend(50, 100)).toEqual({ text: '−50 %', richtung: 'runter' });
    expect(trend(1005, 1000)).toEqual({ text: '±0 %', richtung: 'gleich' });
  });

  it('waehlt fuer Dauern die groesste sinnvolle Einheit', () => {
    expect(dauer(45)).toBe('45 s');
    expect(dauer(600)).toBe('10 min');
    expect(dauer(7_200)).toBe('2,0 h');
    expect(dauer(60 * 60 * 72)).toBe('3,0 d');
    expect(dauer(0)).toBe('0 s');
    expect(dauer(Number.NaN)).toBe('0 s');
  });

  it('sagt bei Zeitpunkten, wie lange es her ist', () => {
    const jetzt = Date.parse('2026-08-11T12:00:00Z');
    expect(seit('2026-08-11T11:58:00Z', jetzt)).toBe('vor 2 min');
    expect(seit('2026-08-11T11:59:59Z', jetzt)).toBe('gerade eben');
    expect(seit(null, jetzt)).toBe('–');
    expect(seit('kein Datum', jetzt)).toBe('–');
  });

  it('kuerzt Geraete-IDs auf etwas Vorlesbares', () => {
    expect(kurzId('abcdefghijklmnop')).toBe('abcdef…mnop');
    expect(kurzId('kurz')).toBe('kurz');
  });
});

/**
 * Sams Liste. Sie ist die Antwort auf „sonst vergessen wir immer zu viel und
 * ich sag dir 30 mal, dass du das und das aendern sollst" – also muss sie das
 * Offene zeigen, ohne das Erledigte zu verlieren.
 */
describe('Sams Liste im Portal', () => {
  it('bleibt weg, solange die Liste nicht geladen ist – das Portal steht trotzdem', () => {
    expect(backlogBlock(null)).toBe('');
  });

  it('zeigt Bilanz, Wortlaut, Stand und Nachweis', () => {
    const html = backlogBlock({
      zaehlung: { gesamt: 2, offen: 1, arbeit: 0, erledigt: 1, verworfen: 0, fortschritt: 0.5 },
      gruppen: [{
        bereich: 'karte',
        eintraege: [
          { id: 'K9', wunsch: 'Noch zu wenig Maze bitte.', bereich: 'karte', stand: 'offen', gemeldet: '2026-08-13' },
          { id: 'K8', wunsch: 'Zwei Mainspots.', bereich: 'karte', stand: 'erledigt', gemeldet: '2026-08-13', nachweis: 'd471107' }
        ]
      }]
    });
    expect(html).toContain('1 von 2 erledigt');
    expect(html).toContain('Noch zu wenig Maze bitte.');
    expect(html).toContain('d471107');
    // Der Stand steht als Klasse am Eintrag – daran haengt die Farbe links.
    expect(html).toContain('class="wunsch offen"');
    expect(html).toContain('class="wunsch erledigt"');
    // Und die Gruppe nennt, wie viel dort noch offen ist.
    expect(html).toContain('1 offen');
  });

  it('entschaerft Sonderzeichen aus dem Wortlaut', () => {
    const html = backlogBlock({
      zaehlung: { gesamt: 1, offen: 1, arbeit: 0, erledigt: 0, verworfen: 0, fortschritt: 0 },
      gruppen: [{
        bereich: 'ui',
        eintraege: [{ id: 'X1', wunsch: '<script>alert(1)</script> das schaut kake aus', bereich: 'ui', stand: 'offen', gemeldet: '2026-08-13' }]
      }]
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

/*
 * Der Umbau von der Endlosrolle auf fuenf Tafeln.
 *
 * Sam, woertlich: „schaut RICHTIG KAKE UNUEBERSICHTLICH ... ueberfull aus."
 * Die Antwort darauf ist eine Struktur, und eine Struktur muss man pruefen --
 * sonst ist die naechste Kachel wieder einfach unten drangehaengt und die
 * Rolle ist zurueck, nur mit neuen Farben.
 */
describe('Tafeln statt Endlosrolle', () => {
  const geraet = (id: string, name: string | null): DeviceRow => ({
    deviceId: id,
    firstSeen: '2026-08-01T10:00:00Z',
    lastSeen: '2026-08-07T10:00:00Z',
    sessions: 4,
    runs: 9,
    kills: 12,
    totalSeconds: 3_600,
    bestScore: 4_200,
    bestLevel: 18,
    lastUserId: null,
    lastName: name
  });

  const zustand = (extra: Partial<ViewState> = {}): ViewState => {
    const daily = flacheWoche();
    const summe = { players: 70, newPlayers: 35, sessions: 140, accounts: 0, runs: 210, kills: 70, totalSeconds: 7_000, avgSessionSeconds: 120 };
    const overview = {
      live: { humans: 3, draining: false, features: { ROYALE: true }, tick: { averageMs: 4.2, busyRatio: 0.2 } },
      persistence: { enabled: true },
      sessions: { enabled: true },
      days: 7,
      database: true,
      today: summe,
      window: summe,
      daily,
      classes: [],
      unusedClasses: [],
      top: []
    } as unknown as Overview;
    return {
      overview,
      players: [geraet('abcdefghijklmnop', 'Sam Liba')],
      playersTotal: 1,
      sortierung: 'active',
      tage: 7,
      aktualisiert: Date.parse('2026-08-07T12:00:00Z'),
      backlog: null,
      ...extra
    };
  };

  it('legt jede Tafel genau einmal an und oeffnet nur die gewaehlte', () => {
    const html = renderPortal(zustand({ tafel: 'spieler' }));
    for (const tafel of TAFELN) {
      expect((html.match(new RegExp(`data-tafel="${tafel.name}"`, 'g')) ?? []).length).toBe(1);
    }
    // Genau eine Tafel steht offen -- die anderen vier sind `hidden`.
    expect((html.match(/class="tafel" data-tafel="[a-z]+"(?! hidden)/g) ?? []).length).toBe(1);
    expect(html).toContain('data-tafel="spieler"');
    expect(html).toContain('data-offen="spieler"');
  });

  it('faengt ohne Angabe bei der Uebersicht an', () => {
    expect(renderPortal(zustand())).toContain('data-offen="uebersicht"');
  });

  it('haengt der Spielerliste einen Suchschluessel an jede Zeile', () => {
    // Die Suche in `main.ts` liest nur `data-suche` -- sie darf nichts ueber
    // den Aufbau einer Zeile wissen muessen.
    const html = renderPortal(zustand({ tafel: 'spieler' }));
    expect(html).toContain('data-suche="sam liba abcdefghijklmnop"');
  });

  it('zaehlt Offenes als Abzeichen an der Navigation', () => {
    const html = renderPortal(zustand({
      backlog: {
        zaehlung: { gesamt: 5, offen: 2, arbeit: 1, erledigt: 2, verworfen: 0, fortschritt: 0.4 },
        gruppen: []
      }
    }));
    // Zwei offen plus eines in Arbeit -- beides ist unerledigte Arbeit.
    expect(html).toContain('<b class="abzeichen">3</b>');
  });

  it('entschaerft auch, was aus der Datenbank kommt', () => {
    // Spielernamen sind Fremdeingabe wie jede andere.
    const html = renderPortal(zustand({
      tafel: 'spieler',
      players: [geraet('geraet-1', '<img src=x onerror=alert(1)>')]
    }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('Das Tor', () => {
  it('nennt die eigene Konto-ID, wenn die Allowlist leer ist', () => {
    const html = renderTor({ authEnabled: true, userId: 'a1b2c3', allowlistSize: 0, fehler: null, laedt: false });
    expect(html).toContain('Es ist noch kein Admin eingetragen.');
    expect(html).toContain('a1b2c3');
    expect(html).toContain('ADMIN_USER_IDS');
  });

  it('sagt es, wenn der Login auf dem Server gar nicht an ist', () => {
    const html = renderTor({ authEnabled: false, userId: null, allowlistSize: 0, fehler: null, laedt: false });
    expect(html).toContain('AUTH_ENABLED=true');
    expect(html).not.toContain('Mit Google anmelden');
  });

  it('zeigt einen Fehler aus dem Anmeldeversuch an, statt ihn zu verschlucken', () => {
    const html = renderTor({ authEnabled: true, userId: null, allowlistSize: 1, fehler: 'Netz weg', laedt: false });
    expect(html).toContain('Netz weg');
    expect(html).toContain('Mit Google anmelden');
  });
});

describe('Achse und Kuerzel', () => {
  it('rundet die Achsenobergrenze auf etwas Vorlesbares', () => {
    // Eine Achse, die man nachrechnen muss, hat ihren Zweck verfehlt.
    expect(nettesMaximum(137)).toBe(150);
    expect(nettesMaximum(7)).toBe(8);
    expect(nettesMaximum(3)).toBe(3);
    expect(nettesMaximum(1_100)).toBe(1_500);
  });

  it('kuerzt grosse Zahlen fuer enge Stellen', () => {
    expect(kompakt(940)).toBe('940');
    expect(kompakt(1_240)).toBe('1,2k');
    expect(kompakt(2_400_000)).toBe('2,4M');
  });

  it('macht aus einem Namen zwei Buchstaben – und aus keinem ein Fragezeichen', () => {
    expect(initialen('Sam Liba')).toBe('SL');
    expect(initialen('mazer')).toBe('MA');
    expect(initialen(null)).toBe('?');
    expect(initialen('   ')).toBe('?');
  });
});

