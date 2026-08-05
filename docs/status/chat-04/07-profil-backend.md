# 07 – Profil-Backend (K1)

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` → K1 |
| **Branch** | `claude/maze-profile-backend-dfb335` |
| **Commit** | `b986baf` |
| **Basis** | `origin/main` (`f4c76e8`) |
| **Tests** | `npm run check` grün – 35 Dateien, 429 Tests (16 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Was gebaut wurde

### `POST /profile` – Anzeigenamen ändern

```http
POST /profile
Authorization: Bearer <Supabase-Zugriffstoken>
{ "displayName": "Ada Lovelace" }
→ 202 { "displayName": "Ada Lovelace", "pending": true }
```

- **Konto kommt ausschließlich aus dem Token.** Ein `userId`-Feld im Body wird
  ignoriert – es gibt keinen Weg, ein fremdes Profil umzubenennen (eigener
  Test).
- **Sanitizing identisch zum Join:** `sanitizePlayerName` aus `shared`, also
  dieselben 18 Zeichen und dasselbe Entfernen von Steuerzeichen. Kein zweiter
  Regelsatz, der auseinanderlaufen könnte.
- **Schreibweg gepuffert wie gehabt:** Der Name landet in derselben
  `profileQueue` wie beim Login-Join und geht beim nächsten Flush mit. Nichts
  wartet auf die Datenbank.
- **`202` statt `200`** ist Absicht: angenommen und bereinigt, aber noch nicht
  geschrieben. Ein `200` würde eine abgeschlossene Speicherung behaupten.
- Der Profil-Cache dieses Kontos wird verworfen, sonst zeigte
  `GET /profile/:userId` bis zu 30 Sekunden den alten Namen.
- Body-Limit 1 kB (`express.json` nur auf dieser Route – kein globaler Parser).

Antworten: `202` · `400` (kein/unbrauchbarer Name) · `401` (kein oder
ungültiges Token, auch bei abgeschaltetem Login) · `404` (keine Persistenz) ·
`429` (Rate-Limit).

### `GET /profile/:userId` erweitert

- **Gesamtspielzeit** (`totalSeconds`) lieferte die Route bereits seit Paket 05
  – die View hatte `sum(duration_seconds)` von Anfang an. Neu ist nur, dass es
  jetzt dokumentiert ist.
- **Lieblingsklasse** ist neu: `favoriteClass`, `favoriteClassRuns`,
  `favoriteClassSeconds`.

### Migration `0004_profile_favorite_class.sql`

Neue View `profile_favorite_class`, und `profile_stats` bekommt drei
angehängte Spalten (`create or replace view` darf nur anhängen – die
bestehenden elf bleiben unverändert).

## Bewusste Abweichungen

**1. „Meistgespielte Klasse" ist nicht die häufigste Klasse.**
`runs.player_class` ist die Klasse *beim Tod*, und jeder Lauf beginnt als
`core`. Die schlicht häufigste Klasse wäre damit bei fast jedem Konto „Core" –
als Lieblingsklasse wertlos. Gewählt wird deshalb die häufigste **selbst
gewählte** Klasse; `core` erscheint nur, wenn nie eine Klasse gewählt wurde.
Bei Gleichstand entscheidet der Klassenname, damit die Anzeige nicht zwischen
zwei Klassen springt.

**2. Rate-Limit-Kosten von 6 auf 3 gesenkt – nach einer Messung.**
Erste Fassung mit Kosten 6 ergab bei einem Vorrat von 15 nur **zwei** Versuche
am Stück; im Live-Test scheiterte schon der dritte Aufruf mit `429`, obwohl
zwei davon bloß fehlgeschlagene Anmeldungen waren. Das ist zu streng: Die
gepufferten Namen fallen je Konto ohnehin zusammen (`profileQueue` ist eine
Map), zwanzig Änderungen in einer Minute erzeugen also genau *einen*
Datenbankschreibvorgang. Teuer ist nur die Token-Prüfung – Mikrosekunden. Jetzt
Kosten 3: fünf Versuche am Stück, rund zwanzig pro Minute je IP.
Fehlgeschlagene Versuche zahlen weiterhin denselben Preis, sonst wären
Token-Rateversuche gratis.

**3. `httpGuard` bekam einen `cost`-Parameter** statt eines zweiten Zählers –
Schreibzugriffe ziehen mehrere Token aus demselben IP-Budget. `Retry-After`
skaliert mit den Kosten. Ohne Argument verhält sich der Wächter exakt wie
vorher.

## Verifiziert

Gegen einen PostgREST-Stub mit echtem `supabase-js`, Server mit
`AUTH_ENABLED=true`:

| Aufruf | Ergebnis |
| --- | --- |
| ohne Token | `401` |
| kaputtes Token | `401` |
| ohne `displayName` | `400` |
| nur Leerzeichen | `400` |
| `"  Ada   <b>Lovelace</b>  "` | `202` → `"Ada bLovelace/b"` (exakt wie der Join sanitized) |
| `GET /profile` direkt danach | zeigt den neuen Namen sofort (Cache verworfen) |
| `GET /profile` mit Run | `favoriteClass: "storm"`, `favoriteClassRuns: 4`, `favoriteClassSeconds: 900`, `totalSeconds: 212.4` |
| sechs weitere Schreibzugriffe | `429` |
| nach 4 s Wartezeit | wieder `202` |

## Von 01 gebraucht

- Review und Merge von `claude/maze-profile-backend-dfb335`.
- Berührt `index.ts` nur an zwei Stellen (Import + `app.post('/profile', …)`)
  und `rate-limits.ts` additiv.

**Für Chat 03 (Client), sobald gemerged:** Die Profilkarte kann
`stats.favoriteClass` (Klassen-ID aus `PLAYER_CLASS_IDS`, kann `null` sein),
`stats.favoriteClassRuns`, `stats.favoriteClassSeconds` und `stats.totalSeconds`
anzeigen. Die Namensänderung braucht das Supabase-Token im
`Authorization`-Header und darf die `202`-Antwort optimistisch übernehmen.

## Für Sam

- [ ] **Migration `0004_profile_favorite_class.sql` in Supabase einspielen**
      (SQL Editor → Inhalt einfügen → Run). Ohne sie fehlen die drei neuen
      Felder einfach und stehen auf `null` / `0` – nichts geht kaputt.
- Danach die Datei nach `supabase/migrations/applied/` verschieben und die
  Tabelle in `supabase/migrations/README.md` auf „eingespielt" setzen.

## Nächstes Paket

Laut Auftragsdatei folgt **R5: Client-Perf-Telemetrie** (anonymes FPS- und
Geräteklassen-Sampling) – ausdrücklich als eigenes Paket, deshalb hier noch
nicht angefangen.
