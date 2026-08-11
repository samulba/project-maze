import { describe, expect, it } from 'vitest';
import {
  ERWARTETE_RELATIONEN,
  preflightMeldung,
  supabasePreflight
} from './supabase-preflight';

/**
 * Die Vorabpruefung ist selbst die Stelle, an der ein Fehler am teuersten
 * waere: Sie soll die Zweideutigkeit aufloesen, ob das Admin-Portal Nullen
 * zeigt, weil niemand da war -- oder weil eine Tabelle fehlt. Meldet SIE
 * falsch, ist die Lage schlimmer als vorher.
 */

const CONFIG = { url: 'https://beispiel.supabase.co', serviceRoleKey: 'geheim' };

/** Antwortet je Relation nach Tabelle; alles Unbekannte gilt als vorhanden. */
const holeMit = (antworten: Record<string, { status: number; koerper?: string }>): typeof fetch =>
  (async (eingabe: any) => {
    const url = String(eingabe);
    const treffer = Object.keys(antworten).find((name) => url.includes(`/rest/v1/${name}?`));
    const antwort = treffer ? antworten[treffer]! : { status: 200 };
    return {
      ok: antwort.status >= 200 && antwort.status < 300,
      status: antwort.status,
      text: async () => antwort.koerper ?? ''
    } as Response;
  }) as unknown as typeof fetch;

describe('Supabase-Vorabpruefung', () => {
  it('meldet ein vollstaendiges Schema als vollstaendig', async () => {
    const ergebnis = await supabasePreflight(CONFIG, holeMit({}));
    expect(ergebnis.vollstaendig).toBe(true);
    expect(ergebnis.offeneMigrationen).toEqual([]);
    expect(ergebnis.befunde).toHaveLength(ERWARTETE_RELATIONEN.length);
    expect(preflightMeldung(ergebnis)).toEqual([
      `[supabase] Schema vollstaendig – ${ERWARTETE_RELATIONEN.length} Relationen geprueft.`
    ]);
  });

  /**
   * Der reale Fall von heute: 0001-0004 sind eingespielt, 0005 nicht. Genau
   * dieser Zustand liefert ein Admin-Portal voller Nullen.
   */
  it('nennt die offene Migration, wenn nur 0005 fehlt', async () => {
    const ergebnis = await supabasePreflight(CONFIG, holeMit({
      sessions: { status: 404, koerper: '{"code":"PGRST205","message":"Could not find the table"}' },
      devices: { status: 404, koerper: '{"code":"PGRST205"}' },
      admin_daily: { status: 404, koerper: '{"code":"PGRST205"}' },
      admin_class_daily: { status: 404, koerper: '{"code":"PGRST205"}' }
    }));

    expect(ergebnis.vollstaendig).toBe(false);
    expect(ergebnis.offeneMigrationen).toEqual(['0005_sessions.sql']);
    const fehlend = ergebnis.befunde.filter((b) => b.stand === 'fehlt').map((b) => b.relation.name);
    expect(fehlend).toEqual(['sessions', 'devices', 'admin_daily', 'admin_class_daily']);

    const meldung = preflightMeldung(ergebnis).join('\n');
    expect(meldung).toContain('sessions');
    expect(meldung).toContain('0005_sessions.sql');
    // Der Ordner steht EINMAL da, nicht je Datei: Eingespielte Migrationen
    // wandern nach `applied/`, ein fester Pfad je Zeile zeigt sonst ins Leere.
    expect(meldung).toContain('supabase/migrations/ (bereits eingespielte unter applied/)');
    expect(meldung).not.toContain('supabase/migrations/0005');
    // Die Meldung muss sagen, dass das Spiel weiterlaeuft -- sonst liest sie
    // sich wie ein Ausfall und jemand rollt einen gesunden Deploy zurueck.
    expect(meldung).toContain('das Spiel laeuft weiter');
  });

  it('erkennt die Meldung auch am Postgres-Code statt am Status', async () => {
    // Supabase antwortet je nach Pfad mit 400 und `42P01` statt mit 404.
    const ergebnis = await supabasePreflight(CONFIG, holeMit({
      devices: { status: 400, koerper: '{"code":"42P01","message":"relation \\"public.devices\\" does not exist"}' }
    }));
    expect(ergebnis.befunde.find((b) => b.relation.name === 'devices')?.stand).toBe('fehlt');
    expect(ergebnis.offeneMigrationen).toEqual(['0005_sessions.sql']);
  });

  /**
   * Ein falscher Schluessel sagt NICHTS ueber das Schema. Wer daraus "Tabelle
   * fehlt" macht, schickt den Betreiber in die falsche Datei -- er spielt eine
   * Migration erneut ein und wundert sich, dass es nicht hilft.
   */
  it('haelt einen falschen Schluessel auseinander von einer fehlenden Tabelle', async () => {
    const ergebnis = await supabasePreflight(CONFIG, holeMit({
      runs: { status: 401, koerper: '{"message":"Invalid API key"}' }
    }));
    const befund = ergebnis.befunde.find((b) => b.relation.name === 'runs')!;
    expect(befund.stand).toBe('unklar');
    expect(befund.grund).toContain('401');
    expect(ergebnis.offeneMigrationen).toEqual([]);
    // Ungeprueft ist nicht in Ordnung: sonst meldet ein kaputter Schluessel gruen.
    expect(ergebnis.vollstaendig).toBe(false);
    expect(preflightMeldung(ergebnis).join('\n')).toContain('nicht pruefbar');
  });

  /**
   * Ein Host, der auf jede Anfrage 404 antwortet (falsche SUPABASE_URL, ein
   * Proxy davor), sieht von hier aus genauso aus wie eine leere Datenbank.
   * Der Unterschied ist teuer: einmal ist eine ENV-Zeile falsch, einmal muss
   * jemand vier Migrationen einspielen.
   */
  it('nennt bei ALLEN fehlenden Relationen zuerst die URL als Verdacht', async () => {
    const alleWeg = Object.fromEntries(
      ERWARTETE_RELATIONEN.map((r) => [r.name, { status: 404, koerper: 'Not Found' }])
    );
    const ergebnis = await supabasePreflight(CONFIG, holeMit(alleWeg));
    const meldung = preflightMeldung(ergebnis).join('\n');
    expect(meldung).toContain('ALLE Relationen fehlen');
    expect(meldung).toContain('SUPABASE_URL');
  });

  it('ueberlebt einen Netzausfall, statt den Start zu sprengen', async () => {
    const hole = (async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as unknown as typeof fetch;
    const ergebnis = await supabasePreflight(CONFIG, hole);
    expect(ergebnis.vollstaendig).toBe(false);
    expect(ergebnis.befunde.every((b) => b.stand === 'unklar')).toBe(true);
    expect(preflightMeldung(ergebnis).join('\n')).toContain('ENOTFOUND');
  });

  it('fragt ueber REST nach null Zeilen und weist sich dabei aus', async () => {
    const gesehen: { url: string; kopf: Record<string, string> }[] = [];
    const hole = (async (eingabe: any, init: any) => {
      gesehen.push({ url: String(eingabe), kopf: init?.headers ?? {} });
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as unknown as typeof fetch;

    await supabasePreflight({ url: 'https://beispiel.supabase.co/', serviceRoleKey: 'geheim' }, hole);

    expect(gesehen).toHaveLength(ERWARTETE_RELATIONEN.length);
    // Kein doppelter Schraegstrich, auch wenn die URL mit einem endet.
    expect(gesehen[0]!.url).toBe('https://beispiel.supabase.co/rest/v1/runs?select=*&limit=0');
    expect(gesehen[0]!.kopf.apikey).toBe('geheim');
    expect(gesehen[0]!.kopf.Authorization).toBe('Bearer geheim');
    // limit=0: Die Frage ist die Existenz, nicht der Inhalt -- eine Pruefung,
    // die Zeilen zieht, wird auf einer vollen Tabelle zur Last.
    for (const anfrage of gesehen) expect(anfrage.url).toContain('limit=0');
  });
});
