import type { PersistenceConfig } from './persistence.js';
import {
  ACHIEVEMENTS_TABLE,
  PROFILES_TABLE,
  PROFILE_STATS_VIEW,
  RUNS_TABLE
} from './persistence.js';
import {
  ADMIN_CLASS_DAILY_VIEW,
  ADMIN_DAILY_VIEW,
  DEVICES_TABLE,
  SESSIONS_TABLE
} from './sessions.js';

/**
 * Schema-Vorabprüfung: Steht in Supabase, was dieser Server voraussetzt?
 *
 * ## Der Fehlermodus, den es zu beseitigen gilt
 *
 * Das Schema kommt über Migrationsdateien, die **von Hand** im SQL-Editor
 * eingespielt werden (`supabase/migrations/README.md`). Wer eine davon
 * vergisst, halb einspielt oder in der falschen Reihenfolge ausführt, bekommt
 * keinen Fehler beim Start – sondern einen Server, der fröhlich läuft und
 * seine Schreibvorgänge einzeln verliert:
 *
 * * Sitzungen scheitern erst, wenn der **erste Spieler geht**. Bis dahin sieht
 *   alles gesund aus.
 * * Der Fehler landet im laufenden Log, gedrosselt auf eine Zeile je Minute,
 *   zwischen allem anderen.
 * * Das Admin-Portal zeigt dann **Nullen** – und Nullen sind zweideutig:
 *   „niemand war da" sieht genauso aus wie „die Tabelle fehlt".
 *
 * Genau diese Zweideutigkeit trifft die wichtigste Zeile des Ziels („Fremde
 * kommen wieder"). Eine Kennzahl, der man nicht ansieht, ob sie misst, ist
 * schlimmer als keine: Man trifft Entscheidungen auf ihr.
 *
 * ## Was die Prüfung tut
 *
 * Einmal beim Start, je erwarteter Relation eine Abfrage über **null Zeilen**
 * (`limit=0`) – das kostet keine Daten und beantwortet trotzdem die einzige
 * Frage: Gibt es sie? Das Ergebnis geht ins Log und nach `/health`, damit ein
 * `curl` es beantworten kann, ohne sich durch Logs zu scrollen.
 *
 * Sie prüft **Existenz, nicht Form**: Eine Tabelle mit falschen Spalten fällt
 * hier nicht auf. Der Anspruch ist die vergessene Migration, nicht die
 * von Hand verbogene Datenbank.
 *
 * Und sie **blockiert nichts**: Ein Server ohne Datenbank spielt weiter, ein
 * Server mit halbem Schema auch. Die Prüfung meldet, sie verhindert nicht –
 * das Spiel darf nie an der Statistik hängen.
 */

export interface ErwarteteRelation {
  /** Name in PostgREST – Tabelle oder View. */
  readonly name: string;
  /** Die Migration, die sie anlegt. Steht in der Meldung, damit klar ist, was zu tun ist. */
  readonly migration: string;
  /** Wofür der Server sie braucht – in Worten, nicht in Tabellennamen. */
  readonly zweck: string;
}

/**
 * Alles, was der Code anfasst, mit der Migration, die es anlegt. Die Namen
 * kommen aus denselben Konstanten wie die Abfragen – eine umbenannte Tabelle
 * kann hier gar nicht erst auseinanderlaufen.
 */
export const ERWARTETE_RELATIONEN: readonly ErwarteteRelation[] = [
  { name: RUNS_TABLE, migration: '0001_runs.sql', zweck: 'Leaderboard' },
  { name: PROFILES_TABLE, migration: '0002_profiles.sql', zweck: 'Konten' },
  { name: ACHIEVEMENTS_TABLE, migration: '0003_achievements.sql', zweck: 'Achievements' },
  { name: PROFILE_STATS_VIEW, migration: '0003_achievements.sql', zweck: 'Bestleistungen im Profil' },
  { name: SESSIONS_TABLE, migration: '0005_sessions.sql', zweck: 'Besuche zählen' },
  { name: DEVICES_TABLE, migration: '0005_sessions.sql', zweck: 'wiederkehrende Spieler' },
  { name: ADMIN_DAILY_VIEW, migration: '0005_sessions.sql', zweck: 'Admin-Portal: Tageszahlen' },
  { name: ADMIN_CLASS_DAILY_VIEW, migration: '0005_sessions.sql', zweck: 'Admin-Portal: Klassennutzung' }
];

export interface PreflightBefund {
  readonly relation: ErwarteteRelation;
  /** `da`, `fehlt` – oder `unklar`, wenn die Frage gar nicht beantwortet wurde. */
  readonly stand: 'da' | 'fehlt' | 'unklar';
  /** Nur bei `unklar`: was schiefging (Netz, Schlüssel, Rechte). */
  readonly grund?: string;
}

export interface PreflightErgebnis {
  /** Alles da? Bei `unklar` bewusst **nicht** grün – ungeprüft ist nicht in Ordnung. */
  readonly vollstaendig: boolean;
  readonly befunde: readonly PreflightBefund[];
  /** Migrationen, die nachweislich fehlen – ohne Dopplung, in Reihenfolge. */
  readonly offeneMigrationen: readonly string[];
}

/** PostgREST meldet eine unbekannte Relation als 404 mit `PGRST205`/`42P01`. */
const fehltLaut = (status: number, koerper: string): boolean =>
  status === 404 || /PGRST205|42P01|does not exist|Could not find the table/i.test(koerper);

async function pruefeEine(
  config: PersistenceConfig,
  relation: ErwarteteRelation,
  hole: typeof fetch
): Promise<PreflightBefund> {
  // `limit=0` liefert eine leere Liste: Die Frage ist die Existenz, nicht der Inhalt.
  const ziel = `${config.url.replace(/\/+$/, '')}/rest/v1/${relation.name}?select=*&limit=0`;
  try {
    const antwort = await hole(ziel, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        Accept: 'application/json'
      }
    });
    if (antwort.ok) return { relation, stand: 'da' };
    const koerper = await antwort.text().catch(() => '');
    if (fehltLaut(antwort.status, koerper)) return { relation, stand: 'fehlt' };
    /*
     * Alles andere ist ausdrücklich NICHT „fehlt": Ein falscher Schlüssel (401)
     * oder eine Rechteregel (403) sagt nichts über das Schema. Wer das als
     * fehlende Tabelle meldet, schickt Sam in die falsche Datei.
     */
    return { relation, stand: 'unklar', grund: `HTTP ${antwort.status}${koerper ? `: ${koerper.slice(0, 120)}` : ''}` };
  } catch (error) {
    return { relation, stand: 'unklar', grund: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Prüft alle erwarteten Relationen. `hole` ist einspeisbar, damit die Prüfung
 * ohne Datenbank testbar bleibt – sie ist selbst die Stelle, an der ein Fehler
 * am teuersten wäre.
 */
export async function supabasePreflight(
  config: PersistenceConfig,
  hole: typeof fetch = fetch
): Promise<PreflightErgebnis> {
  const befunde = await Promise.all(
    ERWARTETE_RELATIONEN.map((relation) => pruefeEine(config, relation, hole))
  );
  const offeneMigrationen: string[] = [];
  for (const befund of befunde) {
    if (befund.stand !== 'fehlt') continue;
    if (!offeneMigrationen.includes(befund.relation.migration)) offeneMigrationen.push(befund.relation.migration);
  }
  return {
    vollstaendig: befunde.every((befund) => befund.stand === 'da'),
    befunde,
    offeneMigrationen
  };
}

/**
 * Die Meldung fürs Log – eine Zeile, wenn alles steht, sonst so konkret wie
 * möglich: welche Relation, wofür, und welche Datei sie anlegt.
 */
export function preflightMeldung(ergebnis: PreflightErgebnis): string[] {
  if (ergebnis.vollstaendig) {
    return [`[supabase] Schema vollstaendig – ${ergebnis.befunde.length} Relationen geprueft.`];
  }
  const zeilen: string[] = [];
  const fehlend = ergebnis.befunde.filter((befund) => befund.stand === 'fehlt');
  const unklar = ergebnis.befunde.filter((befund) => befund.stand === 'unklar');
  if (fehlend.length > 0) {
    zeilen.push(`[supabase] ${fehlend.length} Relation(en) fehlen – diese Daten gehen VERLOREN, das Spiel laeuft weiter:`);
    for (const befund of fehlend) {
      zeilen.push(`[supabase]   ${befund.relation.name} (${befund.relation.zweck}) -> ${befund.relation.migration}`);
    }
    /*
     * Kein fester Pfad je Datei: Eingespielte Migrationen wandern nach
     * `applied/` (siehe supabase/migrations/README.md). Ein hart geschriebenes
     * `supabase/migrations/0001_runs.sql` zeigt bei einer leeren Datenbank auf
     * vier Dateien, die dort gar nicht mehr liegen.
     */
    zeilen.push('[supabase] Die Dateien liegen unter supabase/migrations/ (bereits eingespielte unter applied/).');
    zeilen.push(`[supabase] Einspielen: Supabase Studio -> SQL Editor -> Inhalt von ${ergebnis.offeneMigrationen.join(', ')} ausfuehren.`);
    /*
     * Wenn ALLES fehlt, ist die wahrscheinlichste Ursache nicht eine leere
     * Datenbank, sondern eine falsche Adresse: Ein Host, der auf jede Anfrage
     * 404 antwortet, sieht von hier aus genauso aus. Wer das nicht dazusagt,
     * schickt jemanden viermal in den SQL-Editor, wo eine Zeile ENV falsch ist.
     */
    if (fehlend.length === ergebnis.befunde.length) {
      zeilen.push('[supabase] ALLE Relationen fehlen – pruefe zuerst SUPABASE_URL: Ein Host, der auf'
        + ' jede Anfrage 404 antwortet, sieht von hier genauso aus wie eine leere Datenbank.');
    }
  }
  for (const befund of unklar) {
    zeilen.push(`[supabase] ${befund.relation.name} nicht pruefbar: ${befund.grund ?? 'unbekannt'}`);
  }
  return zeilen;
}
