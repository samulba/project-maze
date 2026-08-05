# 05 – Achievement-Persistenz und Profil-Endpoint

| | |
| --- | --- |
| **Branch** | `claude/maze-achievements-persistence-profile-dfb335` |
| **Commit** | `77fee92` |
| **Basis** | `origin/main` (`017d7eb`) |
| **Tests** | `npm run check` grün – 28 Dateien, 309 Tests (16 neu) |
| **Status** | gemerged |

## Was gebaut wurde

**Migration 0003** (`20260805140000_0003_achievements.sql`) – Tabelle
`achievements` mit zusammengesetztem Primärschlüssel `(user_id,
achievement_id)`: das *ist* die geforderte Eindeutigkeit und macht den Insert
idempotent, statt bei Doppeln zu scheitern. Dazu die View `profile_stats`, die
die Bestleistungen je Konto in der Datenbank aggregiert – `GET /profile` kommt
so mit einer Abfrage aus. RLS wie bei `runs`.

Bei der View wurde `security_invoker = true` gesetzt: ohne das hätte sie mit
Eigentümerrechten gelaufen und die RLS von `runs` ausgehebelt – der klassische
Supabase-Fallstrick.

**Writer** – der Sammler vergleicht im Flush-Intervall den Stand der Engine
(`unlockedAchievementsFor`) mit dem bereits Gespeicherten und puffert nur die
Differenz. Reine Mengenarithmetik, nie im Tick-Pfad; zusätzlich beim Verlassen
der Arena und beim Shutdown. Der Flush wurde dabei in drei getrennte Blöcke
zerlegt (Profile / Achievements / Runs), jeder mit eigenem `try/catch` – vorher
hätte ein Fehler in einer Warteschlange die anderen mitgerissen.

**Vorladen** – `linkPlayerToUser` holt die gespeicherten Unlocks und spiegelt
sie in die Engine, und zwar ausschließlich nach `progress.unlocked`, nie nach
`fresh`: sonst würde ein wiederkehrendes Konto alte Achievements erneut als
Popup gefeiert bekommen. Der Join wartet nie darauf. Trifft die Antwort ein,
bevor die Engine Fortschritt angelegt hat, wird sie im nächsten Tick
nachgetragen.

**`GET /profile/:userId`** – Bestleistungen plus Achievements mit Namen und
Beschreibung aus dem gemeinsamen Katalog (der Client muss ihn nicht doppelt
vorhalten). Gecacht wie `/leaderboard`. Weil die Route öffentlich ist: ungültige
UUIDs werden vor jeder Datenbankabfrage abgewiesen, „kenne ich nicht" wird
ebenfalls gecacht, und der Cache ist auf 200 Konten begrenzt.

## Verifiziert

Gegen einen PostgREST-Stub mit echtem `supabase-js`:

- angemeldeter Join → Profil mit Google-Namen angelegt
- `maxLevel` freigeschaltet (`freshAchievements: ["maxLevel"]`) → geschrieben
  (`achievementsWritten: 1`)
- `/profile` liefert Statistik und Achievement mit Katalogtexten
- **zweiter Join desselben Kontos:** Level erneut 45, **kein Popup, keine zweite
  Zeile**

## Bewusste Abweichungen

- **Nebenfund:** Der Tick-Test der Telemetrie (aus Paket 02) prüfte
  `overrunsTotal === 0` und `budgetRatio < 1` – beides Aussagen über die
  Geschwindigkeit des Rechners, nicht über den Code. Unter zusätzlicher
  Testlast wurde er rot. Er prüft jetzt die Konsistenz der abgeleiteten Werte.
  Das ist Teamplan-Regel 8 in einer Variante, die Chat 04 selbst eingebaut
  hatte.

## Von 01 gebraucht

Nichts – `linkPlayerToUser` war bereits verdrahtet, die neue Route hängt nur an
der Persistenz.

## Für Sam

- [ ] **Migration `0003` in Supabase einspielen**
- Wirksam wird sie erst mit `AUTH_ENABLED=true` **und**
  `ACHIEVEMENTS_ENABLED=true`
