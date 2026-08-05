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
   [`supabase/migrations/20260805120000_create_runs.sql`](../supabase/migrations/20260805120000_create_runs.sql)
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

## Was als Nächstes kommt

Google-Login und Achievements sind Etappe 3 und bewusst noch nicht gebaut. Die
Tabelle `runs` ist so geschnitten, dass sie später eine optionale
Benutzerspalte bekommen kann, ohne dass bestehende Zeilen ungültig werden.
