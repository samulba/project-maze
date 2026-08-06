> **HISTORISCH (Stand 07.08.):** Das Vier-Chat-Modell ist beendet. Sam hat
> die Arbeits-Chats 02/03/04 aufgelöst; die Zentrale plant und baut seitdem
> selbst (Klassen 4.0 war der erste Direktauftrag). Die eisernen Regeln unten
> gelten sinngemäß weiter (Basis origin/main, npm run check vor jedem Push,
> Flags mit Opt-out nach Integration, kein Zufall in Tests, .probe/ für
> Wegwerf-Skripte) – nur die Rollenverteilung und die Statusblock-Runden sind
> Geschichte.

# MAZERS – Teamplan (Masterplan v3)

Arbeitsmodell für die parallele Entwicklung mit vier Claude-Chats.
Stand: Alpha 1.0 live auf https://www.mazers.de (Railway, Auto-Deploy von `main`).

## Rollen

| Chat | Revier | Fasst NIE an |
|------|--------|--------------|
| **01 – Zentrale** | Integration, Merges, Reviews, `packages/shared`, Live-Betrieb, Koordination | – |
| **02 – Server-Gameplay** | Simulation, Events, Balance, Netz-Encoding (`apps/server`) | `packages/shared`, `apps/client` |
| **03 – Client/UX** | Rendering, HUD, Mobile, Design (`apps/client`) | `packages/shared`, `apps/server` |
| **04 – Infra/Betrieb** | Telemetrie, Persistenz, Deployment, CI, Lasttests | `packages/shared`, `apps/client/src` |

## Statusberichte

Chat 04 legt seine Übergaben nicht mehr im Chat ab, sondern in
[`docs/status/chat-04/`](./status/chat-04/README.md) – ein Bericht je Paket,
Tabelle mit Branch, Commit, Testergebnis und Status. Die Zentrale liest direkt
von dort, statt aus dem Chatfenster zu kopieren.

## Eiserne Regeln (aus echten Zwischenfällen destilliert)

1. **Basis ist immer `origin/main`:** Jedes Paket startet mit
   `git fetch origin main && git checkout -B <branch> origin/main`.
   Der Branchname gehört in den Statusblock – 01 rät nicht.
2. **Nur 01 pusht auf `main`.** `main` = live. Jeder Push deployt automatisch.
3. **Nur 01 ändert `packages/shared`.** Wer Protokoll/Typen braucht, liefert im
   Statusblock einen exakten Vorschlag (wie 02 bei den Wire-Typen) und baut
   bis dahin serverlokal mit Cast.
4. **Feature-Flags für alles Riskante.** Muster: `SNAPSHOT_DELTAS`,
   Supabase-Persistenz. Ohne Flag/ENV muss sich der Server exakt wie vorher
   verhalten – und ein Test belegt das.
5. **`npm run check` vor jedem Push.** Neue ENV-Variablen sofort in
   `.env.example` + Deploy-Doku.
6. **Statusblock-Pflichtformat:** Branch + Basis-Commit, geänderte Dateien,
   Testergebnis, „von 01 gebraucht", bewusste Abweichungen vom Auftrag.
   Abweichungen sind okay – verschwiegene Abweichungen nicht.
7. **Wegwerf-Skripte** (Benchmarks, Probes) nur unter `.probe/` oder als
   `zz*`-Datei – beides ist gitignored.
8. **Zufall in Tests ist verboten**, wenn er das Ergebnis ändern kann
   (Lehrstück: flakiger Fracture-Wandtest in der CI).

## Roadmap

> **Aktuell gilt der [Ultramasterplan v4](MASTERPLAN.md)** – er ersetzt die
> Sprints unten (die bleiben als Historie stehen; A1–A5 und Sprint B sind
> abgeschlossen).

### Sprint A – „Stabilität & Gesicht" (abgeschlossen)

| # | Paket | Wer | Status |
|---|-------|-----|--------|
| A1 | Produktions-Ladehänger: Diagnose-Netz + Ein-Init-Fix, Live-Verifikation | 01 + Sam | Fix live, Verifikation offen |
| A2 | Startscreen-Redesign (weg vom Generischen, Logo als Anker) | 03 | beauftragt |
| A3 | Delta-Snapshots scharf schalten: Wire-Typen in shared (01) → Client-Hydrator (03) → `SNAPSHOT_DELTAS=true` | 01 → 03 | Encoding gemerged, −10,9 % schon aktiv |
| A4 | Leaderboard-UI: `GET /leaderboard` im Client anzeigen (Startscreen + Death-Screen) | 03 | nach A2 |
| A5 | Railway-Variablen: `SUPABASE_*`, `METRICS_TOKEN`, `ALLOWED_ORIGIN` | Sam | offen |

### Sprint B – „Identität"

- **Google-Login (Etappe 3):** Supabase Auth; Client holt JWT, Join-Message
  trägt optionales Token, Server verifiziert (04 Server-Seite + Vorschlag,
  01 shared, 03 Login-UI). Gast bleibt immer möglich.
- **Profile & Lifetime-Stats:** `runs.user_id` (nullable), Profilkarte im
  Death-Screen.
- **Achievements:** Engine serverseitig (02, hinter Flag, In-Memory),
  Persistenz (04), Popups (03). Katalog-Erstideen: erste 5er-Streak,
  Guardian-Kill, Level 45, jede Familie gespielt, Fracture-Flanke.

### Sprint C – „Tiefe & Reichweite" (danach, Reihenfolge offen)

- Kurze numerische Netz-IDs (größter verbleibender Snapshot-Posten)
- Spectator-Modus nach dem Tod (live statt Killcam-Aufzeichnung)
- Weitere Events/Module erst nach Telemetrie-Auswertung der bestehenden
- Telemetrie-gestützte Balance-Runde (Pickraten/K/D aus `/metrics`)
- Sichtbarkeit: OG-Preview steht, Discord-Server, Feedback-Kanal im Spiel

## Betriebs-Checkliste (Sam)

- [ ] Railway Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Railway Variables: `METRICS_TOKEN` (beliebiges langes Geheimnis)
- [ ] Railway Variables: `ALLOWED_ORIGIN=https://www.mazers.de`
- [ ] Nach jedem großen Merge: `mazers.de/health` → `build`-Feld prüfen
- [x] Supabase-Tabelle `runs` liegt an (Migration 0001, eingespielt 2026-08-05)
- [x] Supabase `profiles` + `runs.user_id` liegen an (Migration 0002, eingespielt 2026-08-05)
- [x] Google-OAuth eingerichtet (Client + Provider + URL-Config, 2026-08-05)
- [x] Railway-Variablen komplett: `SUPABASE_*`, `AUTH_ENABLED`, `ACHIEVEMENTS_ENABLED`, `ALLOWED_ORIGIN`, `METRICS_TOKEN` (2026-08-05)
- [x] Supabase `achievements` + `profile_stats` liegen an (Migration 0003, eingespielt 2026-08-05)
