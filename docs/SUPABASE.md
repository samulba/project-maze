# Supabase einrichten – Schritt für Schritt

Diese Anleitung ist für jemanden geschrieben, der Supabase noch nie benutzt
hat. Am Ende hat MAZERS ein globales Leaderboard, das Redeploys überlebt.

**Supabase** ist eine gehostete PostgreSQL-Datenbank mit HTTP-Schnittstelle.
Wir nutzen davon genau eine Tabelle: `runs` – jede abgeschlossene Runde eines
echten Spielers, aus der das Leaderboard berechnet wird.

> **Nichts davon ist Pflicht.** Ohne die beiden ENV-Variablen läuft der Server
> exakt wie bisher: keine Datenbank, kein Leaderboard, keine Fehlermeldungen.
> Du kannst die Schritte jederzeit rückgängig machen, indem du die Variablen
> wieder löschst.

Dauer: ungefähr 15 Minuten.

---

## Schritt 1 – Konto und Projekt anlegen

1. Auf [supabase.com](https://supabase.com) **Start your project** klicken und
   mit GitHub oder E-Mail anmelden.
2. Im Dashboard **New project** wählen.
3. Ausfüllen:
   - **Name:** `mazers` (nur für dich sichtbar)
   - **Database Password:** Auf **Generate a password** klicken und das
     Ergebnis in deinen Passwortmanager legen. Du brauchst es für diese
     Anleitung nicht mehr, aber ohne das Passwort kommst du später nicht mehr
     direkt an die Datenbank.
   - **Region:** Die Region, die deinem Spielserver am nächsten liegt. Läuft
     der Server bei Railway in Europa, nimm `Central EU (Frankfurt)`. Jeder
     Schreibvorgang geht über diese Strecke – eine falsche Region kostet
     unnötig Latenz.
   - **Pricing Plan:** `Free` reicht für den Anfang bei Weitem.
4. **Create new project** klicken und ein bis zwei Minuten warten, bis oben
   „Project is ready" steht.

## Schritt 2 – Tabelle anlegen

Die Tabelle wird nicht per Klick erstellt, sondern mit der Migrationsdatei aus
diesem Repository. So ist jederzeit nachvollziehbar, wie das Schema aussieht.

1. In der linken Seitenleiste **SQL Editor** öffnen.
2. **New query** klicken.
3. Den kompletten Inhalt von
   [`supabase/migrations/applied/0001_runs.sql`](../supabase/migrations/applied/0001_runs.sql)
   kopieren und in das Editorfenster einfügen.
4. Unten rechts auf **Run** klicken (oder `Strg`/`Cmd` + `Enter`).
5. Erwartete Ausgabe: `Success. No rows returned.`

Kontrolle: In der Seitenleiste **Table Editor** öffnen – die Tabelle `runs`
steht jetzt dort, noch ohne Zeilen. Sie trägt ein Schloss-Symbol: Das ist die
aktivierte Row Level Security aus Schritt 5 der Migration.

Das Skript darf mehrfach laufen. Ein zweiter Durchlauf ändert nichts.

## Schritt 3 – Die zwei Schlüssel holen

1. Links unten auf das Zahnrad **Project Settings** klicken.
2. Den Punkt **API** (in neueren Projekten **API Keys**) öffnen.
3. Du brauchst genau zwei Werte:

| Was | Wo | Beispiel |
| --- | --- | --- |
| **Project URL** | ganz oben unter „Project URL" | `https://abcdefghijkl.supabase.co` |
| **Geheimer Schlüssel** | `service_role` bzw. `secret` – auf **Reveal** klicken | `eyJhbGciOi…` bzw. `sb_secret_…` |

> **Der geheime Schlüssel hebelt alle Zugriffsregeln aus.** Wer ihn hat, kann
> jede Zeile lesen, ändern und löschen. Er gehört ausschließlich in die
> Server-Umgebung: niemals in den Client, niemals in dieses Repository,
> niemals in einen Screenshot oder ein Support-Ticket.
>
> Daneben liegt der öffentliche Schlüssel (`anon` bzw. `sb_publishable_…`) –
> **den brauchen wir nicht.** MAZERS spricht ausschließlich vom Server aus mit
> Supabase; der Browser sieht nur unsere eigene Route `/leaderboard`.

Hat sich der geheime Schlüssel versehentlich verbreitet: auf derselben Seite
**Rotate** klicken, neuen Wert in die Server-ENV eintragen, neu deployen. Der
alte Schlüssel ist damit sofort wertlos.

## Schritt 4 – Variablen am Spielserver setzen

**Bei Railway:** Projekt öffnen → Service auswählen → Tab **Variables** →
**New Variable**:

```dotenv
SUPABASE_URL=https://abcdefghijkl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<der geheime Schlüssel aus Schritt 3>
```

Railway startet den Service nach dem Speichern automatisch neu. Der Neustart
läuft geordnet ab: Verbundene Spieler bekommen einen sauberen Close-Frame und
verbinden sich von selbst wieder.

**Lokal zum Ausprobieren:** dieselben zwei Zeilen in eine `.env` schreiben und
den Server damit starten (`.env` ist in `.gitignore` und wird nie eingecheckt).

Optional, beide mit sinnvollen Voreinstellungen:

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `PERSISTENCE_FLUSH_MS` | `5000` | Abstand, in dem gepufferte Runs geschrieben werden (500–120000) |
| `LEADERBOARD_CACHE_MS` | `30000` | Wie lange `/leaderboard` eine Antwort zwischenspeichert (1000–600000) |

## Schritt 5 – Prüfen, ob es funktioniert

**Das Schnellste zuerst:** Der Server sieht beim Start selbst nach, ob das
Schema steht, und schreibt das Ergebnis ins Log. Eine Zeile genügt als Antwort:

```text
[supabase] Schema vollstaendig – 8 Relationen geprueft.
```

Fehlt etwas, steht dort stattdessen, **was** fehlt, **wofür** es gebraucht wird
und **welche Datei** es anlegt:

```text
[supabase] 4 Relation(en) fehlen – diese Daten gehen VERLOREN, das Spiel laeuft weiter:
[supabase]   sessions (Besuche zählen) -> supabase/migrations/0005_sessions.sql
[supabase]   devices (wiederkehrende Spieler) -> supabase/migrations/0005_sessions.sql
[supabase] Einspielen: Supabase Studio -> SQL Editor -> Inhalt von 0005_sessions.sql ausfuehren.
```

Warum das der wichtigste Schritt ist: Eine vergessene Migration bringt den
Server **nicht** zum Absturz. Er läuft weiter und verliert die betroffenen
Daten still – und das Admin-Portal zeigt dann Nullen, die genauso aussehen wie
„es war niemand da". Diese Zeilen lösen die Zweideutigkeit auf, bevor jemand
Wochen auf einer Kennzahl plant, die gar nichts misst.

Dasselbe steht in `/health`, falls das Log schon durchgelaufen ist:

```json
"persistence": { "enabled": true, "written": 0,
  "schema": { "geprueft": true, "vollstaendig": true, "fehlend": [], "offeneMigrationen": [] } }
```

`"geprueft": false` heißt: keine Datenbank konfiguriert – oder die Prüfung läuft
noch (sie startet erst, wenn der Server schon Anfragen annimmt, und blockiert
den Start nie).

1. `https://<deine-domain>/health` aufrufen. Es muss ein Block auftauchen:

   ```json
   "persistence": { "enabled": true, "queued": 0, "written": 0, "dropped": 0, "failedFlushes": 0, "lastErrorAt": null }
   ```

   Steht dort `"enabled": false`, greifen die Variablen nicht – siehe
   Fehlerbehebung unten.
2. Eine Runde spielen, ein paar Formen farmen und sterben. Wichtig: Der Score
   muss über 0 liegen, sonst wird der Run absichtlich nicht gespeichert.
3. Nach spätestens fünf Sekunden `https://<deine-domain>/leaderboard` aufrufen:

   ```json
   {
     "entries": [
       { "rank": 1, "playerName": "Ada", "score": 4200, "level": 21,
         "playerClass": "lancer", "kills": 7, "bestStreak": 4,
         "durationSeconds": 212.4, "achievedAt": "2026-08-05T10:00:00.000Z" }
     ],
     "cachedAt": "2026-08-05T10:00:12.000Z",
     "cacheSeconds": 30
   }
   ```

4. Gegenprobe in Supabase: **Table Editor** → `runs`. Die Zeile steht dort.

Neue Runs erscheinen im Leaderboard mit bis zu 30 Sekunden Verzögerung – das
ist der Cache und gewollt: Er macht die Route billig, egal wie oft sie
aufgerufen wird.

## Fehlerbehebung

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| `/health` zeigt `"enabled": false` | Eine der beiden Variablen fehlt oder ist leer | Beide Namen exakt prüfen (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), danach neu deployen |
| `/leaderboard` antwortet 404 | Persistenz ist aus | wie oben |
| `/leaderboard` antwortet 503 | Erster Datenbankzugriff schlug fehl | Serverlog nach `[persistence]` durchsuchen; meist falsche URL oder falscher Schlüssel |
| `failedFlushes` steigt, `written` bleibt 0 | Tabelle fehlt oder Schlüssel ist der öffentliche | Schritt 2 wiederholen; sicherstellen, dass der **geheime** Schlüssel eingetragen ist |
| Admin-Portal zeigt überall Nullen | Migration `0005_sessions.sql` fehlt | `/health` unter `persistence.schema.offeneMigrationen` nachsehen; die genannten Dateien im SQL Editor ausführen |
| `schema.geprueft` bleibt `false` | Keine Datenbank konfiguriert, oder die Prüfung kam nicht durch | Serverlog nach `[supabase]` durchsuchen – ein falscher Schlüssel meldet sich dort als „nicht pruefbar", nicht als fehlende Tabelle |
| Runs fehlen, obwohl gespielt wurde | Score war 0, oder es war ein Bot | beides ist Absicht – nur echte Spieler mit Score > 0 landen im Leaderboard |
| `permission denied for table runs` | Es wurde der öffentliche Schlüssel eingetragen | geheimen Schlüssel verwenden; RLS blockt den öffentlichen absichtlich |

Das Serverlog erreichst du bei Railway über **Deployments → View Logs**. Die
Persistenz meldet sich dort mit dem Präfix `[persistence]` – höchstens einmal
pro Minute, damit ein längerer Ausfall die Logs nicht flutet.

## Was im Hintergrund passiert

- Beim Tod eines Spielers legt der Server einen fertigen Datensatz in einen
  Puffer im Arbeitsspeicher. Das kostet weniger als eine Mikrosekunde und
  passiert nie über das Netzwerk.
- Alle fünf Sekunden schreibt ein eigener Timer den Puffer in einem einzigen
  Insert weg – außerhalb der Simulation.
- Schlägt das fehl, wandern die Zeilen zurück in den Puffer und gehen beim
  nächsten Versuch mit. Der Puffer fasst 500 Runs; darüber fallen die ältesten
  heraus und werden in `/health` als `dropped` gezählt.
- Beim Herunterfahren (Redeploy) wird der Puffer noch geleert, bevor der
  Prozess geht.
- **Ein Datenbankausfall stoppt das Spiel nie.** Er ist an steigenden
  `failedFlushes` sichtbar, sonst an nichts.

## Grenzen und Kosten

- Der Free-Plan bietet 500 MB Datenbank. Eine Zeile in `runs` ist rund 100
  Byte – das reicht für mehrere Millionen Runs.
- Supabase pausiert Free-Projekte nach längerer Inaktivität. Ein pausiertes
  Projekt zeigt sich als steigende `failedFlushes`; im Dashboard lässt es sich
  mit einem Klick wieder aufwecken.
- Aufräumen, falls die Tabelle irgendwann zu groß wird (SQL Editor):

  ```sql
  delete from public.runs
  where created_at < now() - interval '180 days'
    and score < (select min(score) from (
      select score from public.runs order by score desc limit 50
    ) as top);
  ```

  Das löscht alte Runs, lässt die aktuellen Top 50 aber garantiert stehen.

## Sicherheit auf einen Blick

- Row Level Security ist auf `runs` aktiv, und es gibt keine erlaubende Policy.
  Selbst mit dem öffentlichen Schlüssel kommt aus dieser Tabelle nichts heraus.
- Geschrieben wird ausschließlich vom Spielserver mit dem geheimen Schlüssel.
- Gelesen wird öffentlich nur über unsere eigene Route `/leaderboard`, die
  genau die Felder ausgibt, die dort hingehören.
- Spielernamen sind frei wählbar und stehen im Leaderboard öffentlich. Der
  Server kürzt sie beim Beitritt auf 18 Zeichen und entfernt Steuerzeichen –
  eine inhaltliche Prüfung findet nicht statt. Wer das braucht, filtert vor dem
  Einfügen in `persistence.ts` oder löscht einzelne Zeilen im Table Editor.

---

# Teil 2 – Google-Login einrichten (Sprint B)

Ab hier geht es um den optionalen Login. **Nichts davon ist Pflicht, und Gäste
können immer ohne Konto spielen** – das bleibt so. Solange `AUTH_ENABLED` nicht
auf `true` steht, ist der gesamte Login-Pfad im Server abgeschaltet.

Der Weg eines Logins in einem Satz: Der Browser meldet sich bei Google an,
Supabase gibt ihm dafür ein Zugriffstoken, der Client schickt dieses Token beim
Betreten der Arena mit, und der Spielserver prüft die Signatur lokal – ohne
Rückfrage bei Supabase.

> **Reihenfolge beachten:** Die Server-Seite (dieser Teil) funktioniert erst
> vollständig, wenn auch Client und Protokoll nachgezogen sind. Du kannst die
> Schritte 6–9 aber schon jetzt erledigen; sie ändern am laufenden Spiel nichts.

Dauer: ungefähr 25 Minuten, davon 15 in der Google Cloud Console.

## Schritt 6 – Migration 0002 einspielen

Wie Schritt 2, nur mit der zweiten Datei:

1. **SQL Editor** → **New query**
2. Inhalt von
   [`supabase/migrations/applied/0002_profiles.sql`](../supabase/migrations/applied/0002_profiles.sql)
   einfügen → **Run**
3. Erwartet: `Success. No rows returned.`

Danach gibt es die Tabelle `profiles` und in `runs` die neue Spalte `user_id`.
Beide bleiben leer beziehungsweise `NULL`, bis der Login wirklich läuft – die
Migration allein ändert am Spiel nichts.

## Schritt 6b – Migration 0003 einspielen (Achievements und Profile)

Gleicher Ablauf mit der dritten Datei:
[`supabase/migrations/applied/0003_achievements.sql`](../supabase/migrations/applied/0003_achievements.sql).

Sie legt an:

- die Tabelle `achievements` (Konto + Achievement-ID, zusammengesetzter
  Primärschlüssel – ein Konto kann jedes Achievement genau einmal besitzen)
- die View `profile_stats`, die die Bestleistungen je Konto direkt in der
  Datenbank aggregiert, damit `GET /profile/:userId` mit einer Abfrage auskommt

Auch hier gilt: RLS an, keine erlaubende Policy, nur der Service-Role-Key
kommt heran. Ohne Login bleibt beides leer.

## Schritt 7 – Google-Zugangsdaten in der Google Cloud Console

Das ist der längste Teil, weil Google viele Menüpunkte hat. Halte die
Supabase-Callback-URL bereit; du findest sie in Supabase unter
**Authentication → Sign In / Providers → Google**, sie sieht so aus:

```text
https://abcdefghijkl.supabase.co/auth/v1/callback
```

1. [console.cloud.google.com](https://console.cloud.google.com) öffnen und mit
   dem Google-Konto anmelden, dem das Projekt gehören soll.
2. Oben in der blauen Leiste auf die Projektauswahl klicken → **Neues Projekt**
   → Name `mazers` → **Erstellen**. Danach oben prüfen, dass wirklich `mazers`
   ausgewählt ist – der häufigste Anfängerfehler ist, im falschen Projekt
   weiterzuklicken.
3. Linkes Menü → **APIs & Dienste** → **OAuth-Zustimmungsbildschirm**.
   - **Nutzertyp:** `Extern` → **Erstellen**
   - **App-Name:** `MAZERS`
   - **Support-E-Mail** und **Kontakt-E-Mail:** deine Adresse
   - **Autorisierte Domains:** die volle Projekt-Domain
     `<projekt-ref>.supabase.co` (steht in der Project URL) und deine
     Spieldomain (`mazers.de`) hinzufügen. Das nackte `supabase.co` lehnt
     Google ab („muss eine private Top-Level-Domain sein") – es steht auf der
     Public Suffix List und zählt damit wie eine Endung, nicht wie eine Domain.
   - Speichern und weiter, bis der Bildschirm fertig ist.
4. Im selben Bereich **Zielgruppe** (früher „Veröffentlichungsstatus"):
   Solange die App auf `Testing` steht, können sich **nur die Konten anmelden,
   die du unter „Testnutzer" einträgst.** Für einen öffentlichen Login auf
   **Veröffentlichen** klicken. Für einen reinen Login ohne sensible Scopes
   verlangt Google dafür keine Überprüfung.
5. Linkes Menü → **APIs & Dienste** → **Anmeldedaten** → oben
   **+ Anmeldedaten erstellen** → **OAuth-Client-ID**.
   - **Anwendungstyp:** `Webanwendung`
   - **Name:** `MAZERS Web`
   - **Autorisierte Weiterleitungs-URIs** → **+ URI hinzufügen** → die
     Supabase-Callback-URL von oben einfügen. Exakt, mit `https://`, ohne
     Schrägstrich am Ende.
   - **Erstellen**
6. Google zeigt jetzt **Client-ID** und **Client-Schlüssel**. Beide kopieren –
   der Schlüssel lässt sich später zwar erneut ansehen, aber du brauchst ihn
   gleich.

Häufigster Fehler an dieser Stelle: `redirect_uri_mismatch` beim ersten
Anmeldeversuch. Er bedeutet immer, dass die URI in Google nicht zeichengenau
der Supabase-Callback-URL entspricht.

## Schritt 8 – Google in Supabase aktivieren

1. Supabase → **Authentication** → **Sign In / Providers** → **Google**
2. **Enable Sign in with Google** einschalten
3. **Client ID** und **Client Secret** aus Schritt 7 einfügen → **Save**
4. Unter **Authentication → URL Configuration** die **Site URL** auf
   `https://www.mazers.de` setzen und die Spieldomain zusätzlich unter
   **Redirect URLs** eintragen. Ohne diesen Schritt landet der Browser nach dem
   Login auf `localhost`.

## Schritt 9 – Den Login am Spielserver freischalten

Eine einzige neue Variable:

```dotenv
AUTH_ENABLED=true
```

`SUPABASE_URL` ist schon gesetzt (Schritt 4) und wird hier mitbenutzt: Aus ihr
leiten sich der erwartete Aussteller (`<url>/auth/v1`) und die Adresse des
öffentlichen Schlüsselsatzes ab.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `AUTH_ENABLED` | `false` | Schaltet die Token-Prüfung ein. Ohne `SUPABASE_URL` bleibt sie trotzdem aus. |
| `SUPABASE_JWT_SECRET` | – | **Nur für ältere Projekte.** Siehe unten. |

**Brauche ich `SUPABASE_JWT_SECRET`?** Supabase signiert Zugriffstokens je nach
Alter des Projekts unterschiedlich:

- **Neuere Projekte** benutzen asymmetrische Schlüssel. Der Server holt den
  öffentlichen Schlüsselsatz einmal von
  `https://<projekt>.supabase.co/auth/v1/.well-known/jwks.json` und prüft
  danach lokal. **Dann brauchst du die Variable nicht.**
- **Ältere Projekte** signieren mit einem geteilten Geheimnis (HS256). Dann
  liefert der JWKS-Endpunkt keinen passenden Schlüssel, und jedes Token würde
  abgelehnt. In dem Fall das Geheimnis unter **Project Settings → API → JWT
  Settings → JWT Secret** kopieren und als `SUPABASE_JWT_SECRET` setzen.

Welcher Fall vorliegt, zeigt der Server selbst – siehe nächster Schritt. Das
JWT-Secret ist genauso geheim wie der Service-Role-Key.

## Schritt 10 – Prüfen

`https://<deine-domain>/health` aufrufen. Neu ist ein `auth`-Block:

```json
"auth": { "enabled": true, "mode": "jwks", "verified": 0, "rejected": 0, "lastRejectionReason": null }
```

- `mode: "off"` → `AUTH_ENABLED` fehlt oder `SUPABASE_URL` ist nicht gesetzt
- `mode: "jwks"` → asymmetrische Signatur, kein weiteres Geheimnis nötig
- `mode: "shared-secret"` → `SUPABASE_JWT_SECRET` ist gesetzt und wird benutzt

Sobald der Client Tokens mitschickt, wandern `verified` und `rejected` nach
oben. Steigt nur `rejected`, verrät `lastRejectionReason` den Grund:

| Grund | Bedeutung |
| --- | --- |
| `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` | Falscher Schlüssel – meist ein HS256-Projekt ohne `SUPABASE_JWT_SECRET` |
| `ERR_JWT_CLAIM_VALIDATION_FAILED` | Token eines anderen Projekts, oder `SUPABASE_URL` zeigt woandershin |
| `ERR_JWT_EXPIRED` | Token abgelaufen; der Client muss es erneuern |
| `role` | Kein Nutzer-Token (z. B. versehentlich ein Service-Role-Key) |
| `malformed` | Kein JWT – meist ein Client-Fehler beim Zusammenbauen der Join-Message |

## Wie der Server das Token prüft

- **Kein Netzwerk-Roundtrip pro Join.** Der öffentliche Schlüsselsatz wird
  einmal geholt und im Speicher gehalten; erst eine Schlüsselrotation löst ein
  erneutes Laden aus, und auch das frühestens alle 30 Sekunden. Ein
  Testfall belegt: 25 Anmeldungen, ein einziger Abruf.
- Geprüft werden Signatur, Aussteller, Zielgruppe (`authenticated`), Rolle und
  Ablaufzeit – mit 10 Sekunden Toleranz für Uhrendrift.
- Ein Service-Role-Token wird ausdrücklich abgelehnt, auch wenn es formal
  gültig ist.
- Fehlt das Token oder ist es ungültig, spielt die Person als Gast weiter. Ein
  kaputter Login sperrt niemanden aus.

## Achievements und Profil

Sobald ein Spieler über den Login einem Konto zugeordnet ist, speichert der
Server dessen freigeschaltete Achievements dauerhaft. Drei Bedingungen müssen
dafür zusammenkommen – fehlt eine, passiert schlicht nichts:

1. Supabase ist konfiguriert (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
2. der Login läuft (`AUTH_ENABLED=true`) und der Spieler ist angemeldet
3. die Achievement-Engine läuft (`ACHIEVEMENTS_ENABLED=true`)

**Beim Join** holt der Server die bereits gespeicherten Achievements des Kontos
und spiegelt sie in die laufende Engine. Damit schaltet ein wiederkehrender
Spieler nichts doppelt frei – weder als Popup noch als neue Datenbankzeile.
Der Join wartet nie darauf; das Vorladen läuft im Hintergrund.

**Während des Spiels** vergleicht der Server alle fünf Sekunden (und beim
Verlassen der Arena sowie beim Herunterfahren) den Stand der Engine mit dem
Gespeicherten und puffert nur die Differenz. Geschrieben wird gebündelt und
außerhalb der Simulation – exakt wie bei den Runs.

### `POST /profile` – Anzeigenamen ändern

Braucht ein gültiges Supabase-Token im Header. Der Name wird **genau wie beim
Join** bereinigt (Steuerzeichen raus, Leerraum zusammengefasst, 18 Zeichen).

```http
POST /profile
Authorization: Bearer <Supabase-Zugriffstoken>
Content-Type: application/json

{ "displayName": "Ada Lovelace" }
```

```json
202 { "displayName": "Ada Lovelace", "pending": true }
```

**`202` statt `200` ist Absicht:** Der Name ist angenommen und bereinigt, aber
noch nicht geschrieben – er liegt im selben Puffer wie die Runs und geht beim
nächsten Flush mit. Der Client kann den zurückgegebenen Namen sofort anzeigen;
`GET /profile/:userId` liefert ihn ebenfalls ab sofort, weil der Cache dieses
Kontos verworfen wird.

| Antwort | Bedeutung |
| --- | --- |
| `202` | angenommen, wird geschrieben |
| `400` | `displayName` fehlt, ist kein Text, oder bleibt nach dem Bereinigen leer |
| `401` | kein oder ungültiges Token – auch wenn `AUTH_ENABLED` aus ist |
| `404` | Persistenz ist nicht konfiguriert |
| `429` | Rate-Limit: fünf Versuche am Stück, danach rund zwanzig pro Minute je IP |

Das Konto kommt **ausschließlich aus dem Token**. Ein `userId`-Feld im Body
wird ignoriert – niemand kann fremde Profile umbenennen.

### `GET /profile/:userId`

```json
{
  "userId": "3f2504e0-…",
  "displayName": "Ada Lovelace",
  "memberSince": "2026-08-01T09:00:00.000Z",
  "stats": {
    "runs": 12, "bestScore": 9000, "bestLevel": 32, "bestKills": 14,
    "bestStreak": 7, "longestRunSeconds": 421.3, "totalKills": 88,
    "totalSeconds": 3600, "firstRunAt": "…", "lastRunAt": "…",
    "favoriteClass": "storm", "favoriteClassRuns": 7, "favoriteClassSeconds": 1800
  },
  "achievements": [
    { "id": "firstStreak5", "name": "Lauf ohne Ende",
      "description": "Erreiche eine Serie von fünf Abschüssen, ohne zu sterben.",
      "unlockedAt": "2026-08-05T10:00:00.000Z" }
  ],
  "cachedAt": "2026-08-05T10:00:12.000Z",
  "cacheSeconds": 30
}
```

Die Namen und Beschreibungen kommen aus dem gemeinsamen Katalog – der Client
muss sie nicht doppelt vorhalten.

`totalSeconds` ist die Gesamtspielzeit über alle Runs des Kontos.
`favoriteClass` ist die meistgespielte **selbst gewählte** Klasse: Jeder Lauf
beginnt als `core`, deshalb wäre die schlicht häufigste Klasse bei fast jedem
Konto „Core" und damit wertlos. `core` erscheint nur, wenn nie eine Klasse
gewählt wurde. Beide Werte kommen aus der View `profile_stats`
(Migration 0004) – vor dem Einspielen fehlen die Felder einfach und stehen auf
`null` beziehungsweise `0`.

| Antwort | Bedeutung |
| --- | --- |
| `200` | Profil gefunden (30 s gecacht, wie `/leaderboard`) |
| `400` | Die ID ist keine gültige UUID – kostet keine Datenbankabfrage |
| `404` | Persistenz aus, oder das Konto hat weder Runs noch Achievements |
| `503` | Supabase antwortet nicht und es liegt nichts im Cache |

Die Route ist öffentlich. Deshalb werden ungültige IDs sofort abgewiesen, und
auch ein „kenne ich nicht" wird gecacht: Wer zufällige UUIDs durchprobiert,
trifft die Datenbank nur beim ersten Mal. Der Cache fasst 200 Konten.

`/health` zeigt unter `persistence` zusätzlich `achievementsQueued` und
`achievementsWritten`.

## Konten und Datenschutz

- Gespeichert wird nur, was das Spiel anzeigt: Konto-ID und Anzeigename in
  `profiles`, Konto-ID an den Runs. **Keine E-Mail-Adresse** – die verwaltet
  Supabase in `auth.users`.
- `runs.user_id` ist `NULL` bei allen Gast-Runs; das ist und bleibt der
  Normalfall.
- Löscht jemand sein Konto (Supabase → **Authentication → Users** → Nutzer →
  **Delete user**), verschwinden Profil, Achievements und zugeordnete Runs mit.
  Gast-Runs bleiben, weil sie keiner Person zugeordnet sind.
- Auch für `profiles` gilt Row Level Security ohne erlaubende Policy: Selbst
  mit gültigem Google-Login kommt aus dem Browser nichts direkt an die Tabelle.

## Was danach noch fehlt

Damit ein Spieler den Login tatsächlich benutzen kann, fehlen zwei Bausteine
außerhalb dieses Servers:

1. **Protokoll:** Die Join-Message braucht ein optionales `authToken`-Feld
   (`packages/shared`, Chat 01).
2. **Login-UI:** Der Startscreen braucht einen „Mit Google anmelden"-Knopf, der
   das Token von Supabase holt und beim Join mitschickt (Chat 03).

Achievements sind ein eigenes Paket und hier noch nicht enthalten.
