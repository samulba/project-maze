> **SOLO-BETRIEB seit 07.08.:** Sam hat die Arbeits-Chats 02/03/04 aufgelöst –
> es gibt keine Rollenverteilung, keine Auftrag-Dateien und keine Übergabe an
> Chat 01 mehr. Sams Nachricht ist der Auftrag. Alles unten zu Revier und
> Statusblock-Runden ist historisch; die technischen Regeln und Fallenlisten
> gelten weiter. Dieser Ordner ist Archiv.

# Übergabe an einen neuen Chat 02 – Server-Gameplay (historisch)

Diese Datei ist dein Einstieg. Sie beschreibt Rolle, Regeln und die Fallen,
die uns schon Zeit gekostet haben. **Der aktuelle Sachstand steht nicht hier**,
sondern in `docs/status/chat-01/auftrag-chat-02.md` (dein aktueller Auftrag)
und in `docs/status/chat-02/LATEST.md` (was dein Vorgänger zuletzt gebaut hat).

## Dein Revier

| | |
|---|---|
| **Du baust** | Simulation, Klassen, Bots, Balance, Events, Netz-Encoding – alles in `apps/server` |
| **Du fasst nie an** | `packages/shared` und `apps/client` |
| **Du lieferst an** | Chat 01 (die Zentrale), über einen Statusbericht in `docs/status/chat-02/` |

Vier Chats arbeiten parallel: 01 Zentrale (Integration, Merges, `shared`),
02 (du), 03 Client/UX, 04 Infra/Betrieb. Sam koordiniert, liest aber die
Chats nicht mehr mit – alles Wichtige läuft über 01 und über Git.

**Ausnahme zur shared-Regel:** Wenn 01 dir in deinem Auftrag eine
shared-Änderung ausdrücklich freigibt, baust du sie selbst. Steht keine
Freigabe da, lieferst du im Statusbericht einen exakten Vorschlag und baust
serverlokal mit Cast weiter.

## So fängst du an

```bash
git fetch origin main
git checkout -B claude/<dein-paket-slug> origin/main
cat docs/status/chat-01/auftrag-chat-02.md      # dein Auftrag
cat docs/status/chat-02/LATEST.md               # was zuletzt lief
npm install && npm run check                    # Baseline muss grün sein
```

Basis ist **immer** `origin/main`, nie ein älterer Branch. Der Branchname
gehört in den Statusbericht – 01 rät nicht.

## Eiserne Regeln

1. **Nur 01 pusht auf `main`.** Du pushst deinen eigenen Branch und meldest ihn.
2. **`npm run check` muss grün sein, bevor du pushst.** Typecheck + alle Tests.
3. **Alles Riskante kommt hinter ein Flag, Default aus.** Ohne Flag muss sich
   der Server exakt wie vorher verhalten – und ein Test belegt genau das.
   Neue ENV-Variablen sofort in `.env.example` und `docs/DEPLOYMENT.md`.
4. **Kein Zufall in Tests**, wenn er das Ergebnis ändern kann (siehe Fallen).
5. **Wegwerf-Skripte** (Benchmarks, Probes) nur unter `.probe/` oder als
   `zz*`-Datei – beides ist gitignored.
6. **Keine Modell-IDs** in Commits, Code oder Doku.
7. **Statusbericht-Pflicht:** Branch + Basis-Commit, geänderte Dateien,
   Testergebnis, „von 01 gebraucht", und **bewusste Abweichungen vom Auftrag**.
   Abweichungen sind völlig okay – verschwiegene Abweichungen nicht.

## Wie der Server gebaut ist

Monorepo mit npm-Workspaces: `packages/shared` (Typen, Konstanten,
Spielregeln – Server und Client teilen sie), `apps/server` (autoritative
Simulation, 40 Hz Tick, 30 Hz Snapshot, Express 5 + `ws` + zod),
`apps/client` (PixiJS v8 + Vite).

**Das Wichtigste zuerst – die Tuning-Schichten:** Neue Serverfeatures werden
**nicht in `game.ts` eingebaut**, sondern als `tuneX(game)`-Schicht darüber
gelegt, die die Internals monkey-patcht. Die Reihenfolge steht in
`apps/server/src/index.ts` und ist bedeutsam: `tuneSpectator` ganz innen,
`tuneInputAck` ganz außen. Wenn du eine neue Schicht einhängst, begründe im
Bericht, warum sie an genau dieser Stelle sitzt.

`/health` meldet Build, Commit und die aktiven Flags. Das ist das
Testprotokoll, wenn Sam sagt „geht nicht": erst `/health` prüfen, dann suchen.
Jedes Flag, das Spielgefühl verändert, gehört in den `features`-Block.

## Fallen, die uns schon Zeit gekostet haben

- **Zufall in Tests ist die wiederkehrende Falle.** Formen spawnen zufällig,
  zwei Spielinstanzen sind zwei Welten. Wer eine Messung baut, räumt das Feld
  (`internals.shapes.clear()`) – und denkt daran, dass **Formen während einer
  langen Simulation nachwachsen**. Ein flakiger Fracture-Wandtest in der CI
  war das Lehrstück.
- **Die eigene Spieler-ID immer aus `snapshot.selfId` lesen, nie aus der
  `welcome`-Nachricht.** Mit `SHORT_NET_IDS` (live an!) sind die beiden
  verschieden. Daran ist ein kompletter Lasttest blind geworden und hat
  „0 Klassenwahlen, 0 Upgrades" gemeldet, ohne dass es aufgefallen wäre.
- **`ACCELERATION_SCALE` liegt in `packages/shared`** (aktuell `1.12`) und
  wird von Server und Client von dort importiert. Nie als Zahl abschreiben –
  ein zweiter Wert im Client lässt Server- und Client-Bewegung still
  auseinanderlaufen.
- **Balance-Abzüge unter `docs/balance/` sind eingefroren.** Sie sind der
  Vorher-Stand für die spätere Balance-Runde und werden nicht überschrieben.
- **Ein Lauf je Konfiguration ist noch keine Messung.** Wenn zwei Familien
  gleichzeitig einbrechen, kann das Streuung sein. Mehrfach fahren und die
  Zahl der Läufe begründen.
- **Tickbudget:** Die Simulation braucht rund ein Zehntel des Budgets, der
  Flaschenhals ist der Snapshot-Versand. Wenn du Rechenzeit ausgibst, nenne
  die Kosten im Bericht – Panik vor 1,5 Prozentpunkten ist aber unnötig.

## Wenn du fertig bist

1. Bericht nach `docs/status/chat-02/NN-<slug>.md` schreiben, `LATEST.md` und
   `index.json` mitziehen (Format steht in `docs/status/chat-02/README.md`).
2. Branch pushen.
3. In den Chat schreiben, dass du durch bist – Sam gibt es an 01 weiter, 01
   merged, prüft und stellt den nächsten Auftrag in
   `docs/status/chat-01/auftrag-chat-02.md`.

Wenn du dort etwas siehst, das du für falsch hältst: sag es im Bericht.
Der beste Beitrag deines Vorgängers war eine durchgerechnete Variante, die er
danach **verworfen** hat.
