# 03 – Supabase-Persistenz Etappe 1+2 (globales Leaderboard)

| | |
| --- | --- |
| **Branch** | `claude/maze-supabase-persistence-dfb335` |
| **Commit** | `56443bf` |
| **Basis** | `origin/main` (`050b51f`) |
| **Tests** | `npm run check` grün – 23 Dateien, 209 Tests (15 neu) |
| **Status** | gemerged |

## Was gebaut wurde

**`persistence.ts`** – eigene Tuning-Schicht, ganz außen angehängt. Ohne
`SUPABASE_URL` **und** `SUPABASE_SERVICE_ROLE_KEY` gibt `tunePersistence(game)`
das Spiel unverändert zurück – kein Hook, kein Timer. Einen Schritt weiter als
nur „nichts tun": `@supabase/supabase-js` wird per **dynamischem Import erst im
Adapter** geladen, ein Server ohne Persistenz zieht die Bibliothek also nie in
den Speicher. Der Test prüft das hart – er vergleicht `step`, `removePlayer` und
`killPlayer` per Identität vor und nach dem Aufruf.

**Schreiben**: Beim Tod landet ein fertiger Datensatz in einem Puffer (reine
Map-Operation, kein `await`). Ein eigener Timer schreibt alle 5 s gebündelt weg.
Fehler werden gezählt und höchstens einmal pro Minute geloggt, nie geworfen;
fehlgeschlagene Zeilen wandern zurück in den Puffer (max. 500, danach fallen die
ältesten heraus). Zwei bewusste Filter: **Bots und Runs mit Score 0 kommen nicht
ins globale Leaderboard.**

**`GET /leaderboard`** – Top 50, 30 s gecacht. Parallele Anfragen teilen sich
einen Roundtrip. Fällt die Datenbank aus, wird die letzte gute Antwort
weitergereicht statt eines Fehlers; ohne Cache 503, ohne Persistenz 404.

**Migration 0001** (`supabase/migrations/applied/0001_runs.sql`) – Tabelle mit Checks,
Index auf `(score desc, created_at asc)` für genau die eine heiße Abfrage. RLS
aktiv, dazu explizite Deny-Policy *und* Rechteentzug für `anon`/`authenticated`.
Idempotent.

**`docs/SUPABASE.md`** – von der Kontoanlage bis zur Fehlersuche, ohne
Vorwissen: Regionwahl-Begründung, Unterscheidung geheimer vs. öffentlicher
Schlüssel (inkl. der neueren `sb_secret_…`-Benennung), Symptom-Tabelle,
Aufräum-Query der die Top 50 stehen lässt.

## Verifiziert

Neben 15 Unit-Tests wurde ein PostgREST-Stub gebaut und der **echte**
`supabase-js`-Pfad end-to-end durchgespielt:

| Szenario | Ergebnis |
| --- | --- |
| Ohne ENV | `persistence.enabled: false`, `/leaderboard` 404, Spiel unverändert |
| Mit ENV, echter Spielbetrieb (Lasttest, 8 Clients) | 7 Runs geschrieben, korrekte Spalten (`score 351, level 9, duration 29.5`) |
| `/leaderboard` | Top-N korrekt sortiert, `Cache-Control` gesetzt |
| **DB mitten im Spiel abgeschossen** | Arena unbeeinflusst: 6/6 Joins, 0 Abbrüche, Snapshot-p95 1 ms. `ok: true`, `failedFlushes: 18`, Run bleibt gepuffert, Leaderboard liefert Stale-Cache |
| DB kommt zurück | gepufferter Run wird automatisch nachgeschrieben |
| SIGTERM mit gefülltem Puffer | Run über `beforeClose` nachgeschrieben, Shutdown in 20 ms |

## Bewusste Abweichungen

- **Erweiterung außerhalb des Auftrags:** `createGracefulShutdown` hat einen
  optionalen `beforeClose`-Hook bekommen. Ohne den wären bei jedem Redeploy bis
  zu 5 Sekunden Runs verloren gegangen – genau der Fall, der auf Railway
  ständig eintritt. Default-Verhalten unverändert.

## Von 01 gebraucht

Nichts.

## Für Sam

- [x] Migration `0001` (`supabase/migrations/applied/0001_runs.sql`) in Supabase einspielen
- [x] `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` in Railway setzen
