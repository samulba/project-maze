> **SOLO-BETRIEB seit 07.08.:** Sam hat die Arbeits-Chats 02/03/04 aufgelöst –
> es gibt keine Rollenverteilung, keine Auftrag-Dateien und keine Übergabe an
> Chat 01 mehr. Sams Nachricht ist der Auftrag, gearbeitet wird direkt mit ihm.
> Alles unten zu Revier, Statusblock-Runden und „nur 01 pusht" ist damit
> historisch. **Weiter gelten:** `npm run check` grün vor jedem Push, die
> Migrations-Konvention (`supabase/migrations/README.md`), der Umgang mit dem
> `service_role`-Key, neue ENV-Variablen sofort in `.env.example` +
> `docs/DEPLOYMENT.md`, kein Zufall in Tests – und die Fallenliste unten, die
> ist mit Blut geschrieben. Dieser Ordner bleibt als Berichtshistorie bestehen
> (die Berichte 18–20 entstanden bereits im Solo-Betrieb).

# Übergabe an einen neuen Chat 04 – Infra/Betrieb (historisch)

Diese Datei ist dein Einstieg. Sie beschreibt Rolle, Regeln und die Fallen,
die uns schon Zeit gekostet haben. **Der aktuelle Sachstand steht nicht hier**,
sondern in `docs/status/chat-01/auftrag-chat-04.md` (dein aktueller Auftrag)
und im jüngsten Bericht in `docs/status/chat-04/`.

## Dein Revier

| | |
|---|---|
| **Du baust** | Telemetrie, Persistenz, Deployment, CI, Lasttests, Rate-Limits, Sicherheit |
| **Du fasst nie an** | `packages/shared` und `apps/client/src` |
| **Du lieferst an** | Chat 01 (die Zentrale), über einen Statusbericht in `docs/status/chat-04/` |

Vier Chats arbeiten parallel: 01 Zentrale (Integration, Merges, `shared`),
02 Server-Gameplay, 03 Client/UX, 04 (du). Sam koordiniert, liest aber die
Chats nicht mehr mit – alles Wichtige läuft über 01 und über Git.

## So fängst du an

```bash
git fetch origin main
git checkout -B claude/<dein-paket-slug> origin/main
cat docs/status/chat-01/auftrag-chat-04.md      # dein Auftrag
ls docs/status/chat-04/                         # deine Berichtshistorie
npm install && npm run check                    # Baseline muss grün sein
```

Basis ist **immer** `origin/main`, nie ein älterer Branch.

## Eiserne Regeln

1. **Nur 01 pusht auf `main`.** Du pushst deinen eigenen Branch und meldest ihn.
2. **`npm run check` muss grün sein, bevor du pushst.**
3. **Sicherheit, ohne Ausnahme:** Der Supabase **`service_role`-Key gehört
   ausschließlich in die Railway-Variablen** – nie in den Chat, nie ins Repo,
   nie in Logs. Der `anon`/publishable-Key darf ins Client-Bundle. Wenn du
   einen Key irgendwo auftauchen siehst, wo er nicht hingehört: melden, nicht
   stillschweigend weiterbauen.
4. **Neue ENV-Variablen sofort in `.env.example` und `docs/DEPLOYMENT.md`.**
5. **Migrationen** liegen in `supabase/migrations/`. Sie wandern erst nach
   `applied/`, **wenn Sam bestätigt hat**, dass sie eingespielt sind – nicht,
   wenn du sie geschrieben hast.
6. **Keine Modell-IDs** in Commits, Code oder Doku.
7. **Statusbericht-Pflicht:** Branch + Basis-Commit, geänderte Dateien,
   Testergebnis, „von 01 gebraucht", „für Sam", und **bewusste Abweichungen
   vom Auftrag**. Abweichungen sind okay – verschwiegene Abweichungen nicht.

## Betriebsbild

Monorepo mit npm-Workspaces: `packages/shared`, `apps/server` (Express 5 +
`ws` + zod, 40 Hz Tick, 30 Hz Snapshot), `apps/client` (PixiJS v8 + Vite).
Railway deployt `main` automatisch auf www.mazers.de.

`/health` ist das Testprotokoll: Felder `build` und `commit` sagen, welcher
Stand wirklich läuft, der `features`-Block sagt, welche Flags greifen.
`/metrics` trägt die Telemetrie-Aggregate.

**Produktionswerte, die nicht wandern dürfen:**
`RATE_LIMIT_CONNECTIONS_PER_IP=5`. Der Wert `200` war korrekt **nur lokal**
für einen Lastlauf.

## Fallen, die uns schon Zeit gekostet haben

- **Railway „No changes to watched files"** kann Deploys überspringen. Sam hat
  die Watch-Paths geleert; wenn ein Deploy trotzdem ausbleibt, ist das die
  erste Verdächtige. Eine reine Client-Änderung löste früher gar keinen Deploy
  aus. **Ein grüner Push ist kein Beweis, dass der Stand live ist** – das
  beweist nur `/health` mit dem erwarteten Commit.
- **Der blinde Lasttest.** Die eigene Spieler-ID kam aus der
  `welcome`-Nachricht statt aus `snapshot.selfId`. Mit `SHORT_NET_IDS` (live
  an!) sind die beiden verschieden, und der Test meldete fröhlich
  „0 Klassenwahlen, 0 Upgrades" – also gar nichts. Die Warnung dazu steht in
  `.env.example` und `docs/DEPLOYMENT.md` und bleibt, wo sie ist.
- **Ein Lauf je Konfiguration ist noch keine Messung.** Mehrfach fahren und
  die Zahl der Läufe begründen, bevor eine Zahl zur Aussage wird.
- **Ein dauerhaft abgelehnter Client fällt im Spiel nicht auf.** Wenn du ein
  Zod-Schema für einen Client-Endpunkt eng ziehst, ist die 400 unsichtbar –
  denk daran, wenn 03 ein neues Feld schickt.
- **Labelgrenzen im `/metrics`-Export** so setzen, dass ein manipulierter
  Client den Export nicht aufbläht: erlaubte Werte durchlassen, alles andere
  verwerfen statt durchreichen.
- **Zufall in Tests ist verboten**, wenn er das Ergebnis ändern kann.
- **Der Flaschenhals ist der Snapshot-Versand, nicht die Physik.** Der
  Tick-Abstand p95 liegt bei 26–28 ms über dem 25-ms-Soll, während die
  Simulation nur ein Zehntel des Budgets braucht. Das wird das Thema, sobald
  echte Spieler dazukommen.

## Wenn du fertig bist

1. Bericht nach `docs/status/chat-04/NN-<slug>.md` schreiben und die Tabelle
   in `docs/status/chat-04/README.md` mitziehen. Leg zusätzlich eine
   `LATEST.md` an (Kopie des jüngsten Berichts) – 02 und 03 machen das schon
   so, und 01 liest zuerst dort.
2. Branch pushen.
3. In den Chat schreiben, dass du durch bist – Sam gibt es an 01 weiter, 01
   merged, prüft und stellt den nächsten Auftrag in
   `docs/status/chat-01/auftrag-chat-04.md`.

Der wertvollste Beitrag deines Vorgängers war nicht die Messung, sondern dass
er **dem eigenen Messergebnis nicht geglaubt hat**, als es zu gut aussah.
