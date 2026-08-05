# 04 – Google-Login, Server-Seite (Sprint B)

| | |
| --- | --- |
| **Branch** | `claude/maze-auth-google-server-dfb335` |
| **Commit** | `fc5d107` |
| **Basis** | `origin/main` (`2e81500`) |
| **Tests** | `npm run check` grün – 25 Dateien, 255 Tests (21 neu) |
| **Status** | gemerged |

## Was gebaut wurde

**Migration 0002** (`20260805130000_0002_profiles_and_run_user.sql`) –
`profiles` (user_id → `auth.users`, display_name, created_at), `runs.user_id`
nullable mit Teilindex für Lifetime-Stats, RLS exakt wie in 0001. Bewusst
**keine E-Mail** in `profiles`: die liegt in `auth.users` und hat in einer
Tabelle, die ein öffentliches Leaderboard speist, nichts verloren.

**`auth.ts`** – prüft Signatur, Issuer (`<url>/auth/v1`), Audience
`authenticated`, Rolle und Ablauf, alles lokal. JWKS wird einmal geholt und
gecacht; ein Test belegt **25 Anmeldungen = 1 Netzwerkabruf**, ein zweiter, dass
ein Token mit unbekanntem `kid` gar keinen Request auslöst. Service-Role-Tokens
werden explizit abgelehnt, auch wenn sie formal passen.

**Flag** – ohne `AUTH_ENABLED=true` (oder ohne `SUPABASE_URL`) liefert
`verifyAuthToken` selbst für ein gültiges Token `null`, ohne einen Zähler zu
bewegen. Live geprüft: Server ohne Flag `mode: "off"`, Lasttest 5/5 Joins,
0 Abbrüche.

**`docs/SUPABASE.md` Teil 2** – Google Cloud Console Schritt für Schritt
inklusive der Stolperfallen, die Anfänger wirklich treffen: falsches
Cloud-Projekt oben in der Leiste, `Testing`-Status lässt nur eingetragene
Testnutzer rein, `redirect_uri_mismatch` bedeutet immer eine nicht
zeichengenaue Callback-URL, fehlende Site URL schickt den Browser nach
`localhost`.

## Verifiziert

- Server ohne Flag: `auth.mode: "off"`, Spielbetrieb unverändert
- Mit `AUTH_ENABLED=true` + `SUPABASE_URL`: `mode: "jwks"`, Start ohne
  Netzwerkzugriff (JWKS wird lazy geholt)
- Mit zusätzlichem `SUPABASE_JWT_SECRET`: `mode: "shared-secret"`
- 17 Auth-Tests: Fremd-Issuer, falsche Audience, abgelaufen, manipulierte
  Signatur, fremdes Secret, Nicht-UUID-Subject, Service-Role-Token, Müll

## Bewusste Abweichungen

1. **`SUPABASE_JWT_SECRET` zusätzlich zum JWKS-Weg.** Ältere Supabase-Projekte
   signieren mit HS256; deren JWKS-Endpunkt liefert keinen passenden Schlüssel,
   jedes Token würde stumm abgelehnt. `/health` zeigt unter `auth.mode`, welcher
   Fall vorliegt.
2. **Persistenz-Naht mitgebaut** (nicht beauftragt): `RunRecord.userId`,
   `upsertProfiles`, `linkPlayerToUser`. Ohne das wären `profiles` und
   `runs.user_id` Tabellen ohne Schreiber.
3. `/health` bekam einen `auth`-Block, damit die Variable verifizierbar ist,
   bevor Client und Protokoll da sind.

## Von 01 gebraucht

**Erledigt – 01 hat A–D umgesetzt, `main` trägt `authToken` seit `017d7eb`.**

Der damalige Vorschlag zur Nachvollziehbarkeit:

- **A** `packages/shared/src/index.ts`:
  `export interface JoinMessage { type: 'join'; name: string; authToken?: string; }`
- **B** `index.ts`: `verifyAuthToken` und `linkPlayerToUser` importieren
- **C** `joinSchema` um `authToken: z.string().min(1).max(4096).optional()`
  erweitern. ⚠️ Reihenfolge kritisch: Das Schema ist `.strict()` – schickt der
  Client `authToken`, bevor das Feld dort steht, wird der **gesamte Join
  abgelehnt**. A+C mussten vor der Client-Änderung live sein.
- **D** Aufrufpunkt nach `send(welcome)`, bewusst ohne `await`, damit der Join
  synchron bleibt:
  ```ts
  if (parsed.data.authToken) {
    const joinedId = playerId;
    void verifyAuthToken(parsed.data.authToken)
      .then((user) => { if (user) linkPlayerToUser(game, joinedId, user); });
  }
  ```

**Offener Hinweis:** Die Socket-Grenze liegt bei 4096 Bytes pro Nachricht
(`maxPayload` + `rawSize`-Check). Ein Supabase-Token misst typisch 700–1200
Zeichen, passt also – aber ein Konto mit sehr vielen Metadaten könnte darüber
kommen, und dann schließt der Socket mit 1009, statt nur den Login zu
verweigern. Falls das je auftritt: `maxPayload` auf 8192 anheben.

## Für Sam

- [x] Migration `0002` in Supabase einspielen
- [ ] Google-Provider nach `docs/SUPABASE.md` Teil 2 einrichten
- [ ] `AUTH_ENABLED=true` erst setzen, wenn Client und Protokoll stehen –
      vorher schadet es nicht, nützt aber auch nichts
