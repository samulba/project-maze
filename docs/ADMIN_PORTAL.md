# Admin-Portal (`/admin`)

Sams Auftrag: *„damit ich immer im überblick habe ob wir neue spieler haben etc
blabla alles was wichtig ist"*.

Das Portal liegt unter `https://www.mazers.de/admin`, ist ein eigenes Bündel
(rund 15 kB, nicht das Spiel) und beantwortet drei Fragen in dieser Reihenfolge:

1. **Läuft es gerade?** Spieler online, Takt, Laufzeit, ausgelieferter Stand,
   Feature-Schalter.
2. **Wachsen wir?** Spieler je Tag, davon neu, Besuche, Spielzeit – mit
   Verlaufskurve und Vergleich zur ersten Hälfte des Zeitraums.
3. **Wie wird gespielt?** Klassennutzung, erreichte Level, Rundendauer, und
   welche Klassen noch **nie** jemand gespielt hat.

---

## Einmalige Einrichtung

Drei Schritte, in dieser Reihenfolge. Ohne den ersten gibt es keinen Login,
ohne den zweiten keinen Verlauf, ohne den dritten keinen Zugang.

### 1. Login einschalten

```
AUTH_ENABLED=true
SUPABASE_URL=https://<projekt>.supabase.co
# und je nach Projektalter eines von beiden:
SUPABASE_JWT_SECRET=<Secret>          # ältere Projekte (HS256)
#   – oder nichts, dann wird über die JWKS des Projekts geprüft
```

Details in `docs/SUPABASE.md`, Teil 2. Der Client braucht zusätzlich
`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` **zur Bauzeit** – ohne die
gibt es im Browser gar keinen Login-Knopf, und das Portal sagt das auch.

### 2. Migration einspielen

`supabase/migrations/0005_sessions.sql` in Supabase Studio → SQL Editor →
einfügen → Run. Das Skript ist wiederholbar.

Es legt an:

| Objekt | Zweck |
| --- | --- |
| `sessions` | eine Zeile je Besuch (Join bis Verlassen) |
| `devices` | Aggregat je Browser – beantwortet „neu oder wiederkehrend" |
| `touch_device()` + Trigger | hält `devices` synchron zu `sessions` |
| `admin_daily` | Tageswerte: Besuche, Spieler, davon neu, Runs, Spielzeit |
| `admin_class_daily` | Klassennutzung je Tag |

Ohne die Migration ist das Portal nicht kaputt, sondern halb: Der Live-Teil
steht, der Verlauf fehlt, und die Seite schreibt genau das hin.

### 3. Sich selbst eintragen

Henne und Ei: Um in die Allowlist zu kommen, muss man seine Konto-ID kennen,
und die bekommt man erst durch Anmelden.

1. `https://www.mazers.de/admin` öffnen, mit Google anmelden.
2. Die Seite zeigt: *„Es ist noch kein Admin eingetragen. Deine Konto-ID ist …"*
   samt Kopierknopf.
3. In Railway `ADMIN_USER_IDS=<diese ID>` setzen (mehrere durch Komma getrennt).
4. Dienst neu starten, Seite neu laden.

**Eine leere `ADMIN_USER_IDS` sperrt alle aus** – auch den Projekteigner. Das
ist Absicht: Eine nicht gesetzte Variable darf nie „offen für alle" bedeuten.

---

## Was gezählt wird – und was bewusst nicht

Bis zur Migration 0005 speicherte MAZERS nur **abgeschlossene Runs mit
Score > 0**. Für ein Leaderboard richtig, für die Frage nach neuen Spielern
blind: Wer hereinschaut und ohne Punkte wieder geht, hinterließ keine Spur, und
zwei Runs desselben Gastes waren nicht als derselbe Mensch erkennbar.

Deshalb erfasst `sessions` den **Besuch** statt der Leistung. Wiedererkannt
wird über `device_id`: eine Zufallszahl, die der Browser sich selbst gibt und
in `localStorage` ablegt (`apps/client/src/device-id.ts`).

Nicht gespeichert werden IP-Adresse, User-Agent, Auflösung oder irgendetwas
anderes, woraus sich ein Fingerabdruck bauen ließe. Wer die Website-Daten
löscht, ist am nächsten Tag ein neuer Spieler – das ist keine Schwäche der
Zählung, sondern die Zusage an den Spieler.

Weitere bewusste Grenzen:

- **Besuche unter 5 Sekunden zählen nicht** (`MIN_SESSION_SECONDS`). Sonst
  machte ein Verbindungsabbruch mit Reconnect aus einem Spieler zwei.
- **Geschrieben wird beim Verlassen, nicht beim Betreten.** Erst dann steht die
  Dauer fest. Der Preis: Ein abstürzender Server verliert die laufenden
  Besuche. Ein geordneter Deploy nicht – der Shutdown schreibt sie weg.
- **Ohne `device_id` wird gar nicht gezählt.** Ein Browser mit blockiertem
  Speicher spielt unverändert, taucht in der Statistik aber nicht auf.

### Die eine Zahl, die man falsch lesen kann

„Spielertage" im Zeitraumblock ist die **Summe der Tageswerte**, nicht die
Anzahl verschiedener Menschen: Wer an drei Tagen spielt, zählt dreimal. Für
„wie viele verschiedene Leute waren diesen Monat da" bräuchte es ein
`count(distinct …)` über den ganzen Zeitraum; das kann eine Tages-View nicht
liefern, und eine zweite View dafür wäre eine zweite Wahrheit über dieselbe
Sache. Die Kachel heißt deshalb, was sie ist.

**„Neue Spieler" ist dagegen über jeden Zeitraum exakt** – ein Gerät ist an
genau einem Tag neu.

---

## Routen

| Route | Zugang | Antwort |
| --- | --- | --- |
| `GET /admin` | offen | die Portalseite (`admin.html`) |
| `GET /admin/api/session` | offen | wer der Fragende ist, inkl. eigener Konto-ID |
| `GET /admin/api/overview?days=N` | Allowlist | Live, Tageswerte, Klassen, Bestenliste |
| `GET /admin/api/players?sort=new\|active&limit=N` | Allowlist | Geräteliste |

`/admin/api/session` steht bewusst **vor** dem Torwächter – sie ist der einzige
Weg zur eigenen Konto-ID und verrät nur, wer der Fragende selbst ist.

Alle Routen laufen im normalen IP-Budget des Rate-Limiters. Das Portal lädt
alle 20 Sekunden nach und pausiert, wenn der Tab in den Hintergrund geht; der
Server hält Datenbankantworten 15 Sekunden lang.

---

## Wenn etwas nicht geht

| Meldung | Ursache | Behebung |
| --- | --- | --- |
| *„Der Login ist auf diesem Server aus"* | `AUTH_ENABLED` fehlt oder steht nicht auf `true` | Schritt 1 |
| *„Dieser Client wurde ohne VITE_SUPABASE_… gebaut"* | Bauzeit-Variablen fehlten | Variablen setzen, **neu bauen** (ein Neustart genügt nicht) |
| *„Es ist noch kein Admin eingetragen"* | `ADMIN_USER_IDS` leer | Schritt 3 |
| *„Dieses Konto hat keinen Zugang"* | angemeldet, aber nicht auf der Liste | ID aus der Meldung ergänzen |
| Portal steht, aber kein Verlauf | Migration 0005 fehlt | Schritt 2 |
| Verlauf bleibt leer, obwohl gespielt wird | Client ohne `deviceId` (alter Stand ausgeliefert) | Client neu bauen und deployen |

Der Block **Betrieb** ganz unten im Portal zeigt die Puffer beider Schichten.
Steht dort bei „Sitzungs-Puffer" dauerhaft eine wachsende Zahl unter
„wartend", kommt der Server nicht an die Datenbank – dann steht der Grund im
Serverlog unter `[sessions]`.
