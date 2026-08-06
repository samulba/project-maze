# Übergabe an eine neue Zentrale (Chat 01)

Diese Datei ist der Einstieg, wenn der Zentral-Chat neu aufgesetzt wird. Sie
beschreibt Rolle, Regeln und Arbeitsablauf. Der aktuelle Sachstand steht
NICHT hier, sondern in `LATEST.md` und den drei Auftragsdateien – dort immer
zuerst nachlesen.

## Rolle

Vier parallele Claude-Chats bauen MAZERS:

| Chat | Rolle |
|---|---|
| **01 (du)** | Zentrale: Integration, Merges auf `main`, `packages/shared`, Aufträge, Masterplan |
| 02 | Server-Gameplay (Simulation, Klassen, Bots, Balance) |
| 03 | Client/UX (Renderer, HUD, Responsive, Prediction) |
| 04 | Infra/Betrieb (Deploy, Telemetrie, Lasttests, Migrationen) |

Sam koordiniert. **Er liest die Chats 02/03/04 nicht mehr** – alles Wichtige
muss von dir kommen. Er tippt in jedem der drei Chats nur „weiter"; die holen
sich ihren Auftrag dann selbst aus Git.

## Stehende Regeln

1. **Du pushst auf `main`** – ausdrückliche Erlaubnis und Anweisung von Sam.
   Zusätzlich läuft die Entwicklung auf `claude/app-analysis-masterplan-lxao21`.
   Railway deployt `main` automatisch auf www.mazers.de.
2. **Kein Merge ohne grünes `npm run check`** (Typecheck + alle Tests, Root).
3. **Design-Änderungen am Grundlook nur nach Screenshot-Freigabe durch Sam.**
   Ablauf: Variante lokal bauen → Screenshot → in den Chat schicken → warten →
   erst bei „ja" umsetzen und pushen. Pipeline: `docs/SCREENSHOT_PIPELINE.md`.
4. **Sicherheit:** Der Supabase `service_role`-Key gehört ausschließlich in die
   Railway-Variablen – nie in Chat, Repo oder Logs. Der `anon`/publishable-Key
   darf ins Client-Bundle.
5. **Keine Modell-IDs** in Commits, PRs, Code oder Doku.
6. **Zufall in Tests ist die wiederkehrende Falle** (Teamplan-Regel 8): Formen
   spawnen zufällig, zwei Spielinstanzen sind zwei Welten. Wer eine Messung
   baut, räumt das Feld (`internals.shapes.clear()`) – und denkt daran, dass
   Formen während einer langen Simulation nachwachsen.

## Arbeitsablauf

**Wenn ein Chat fertig meldet** (Sam sagt „02 ist durch" o. ä.):

```
git fetch origin main
git log --oneline HEAD..origin/main       # was ist neu?
git merge origin/main
```

Der Bericht liegt in `docs/status/chat-0X/LATEST.md` (+ nummerierte Kopie).
Bei einem eigenen Branch des Chats: mergen, `npm run check`, auf `main`
pushen. Danach:

1. `docs/status/chat-01/LATEST.md` aktualisieren (was ist gemerged, welche
   Flags sind live, was steht als Nächstes an).
2. Den nächsten Auftrag nach `docs/status/chat-01/auftrag-chat-0X.md`
   schreiben – **genau ein Paket**, mit Begründung und Abnahmekriterium.
   Erledigte Aufträge werden überschrieben, nicht angehängt.
3. Sam melden: was ist live, was muss er testen oder in Railway setzen, und
   welchem Chat er „weiter" schreiben kann.

**Review-Umfang:** Ein großer Review-Sweep lohnt sich nur bei fetten Merges –
Sam hat ausdrücklich moniert, dass 55-Minuten-Reviews zu lange dauern. Bei
kleinen Paketen genügt gezieltes Gegenlesen der geänderten Stellen.

## Architektur in Kürze

Monorepo mit npm-Workspaces:

- `packages/shared` – Typen, Konstanten, Spielregeln (Server und Client teilen
  sie; Wire-Typen für das Netzformat liegen hier)
- `apps/server` – autoritative Simulation (40 Hz Tick, 30 Hz Snapshot),
  Express 5 + `ws` + zod
- `apps/client` – PixiJS v8 + Vite

**Tuning-Schichten:** Serverfeatures werden nicht in `game.ts` eingebaut,
sondern als `tuneX(game)`-Schicht darüber gelegt, die Internals monkey-patcht.
Die Reihenfolge steht in `apps/server/src/index.ts` und ist bedeutsam –
`tuneSpectator` ganz innen, `tuneInputAck` ganz außen.

**Flags:** Jedes neue Feature kommt hinter ein Flag, Default aus. Der
`/health`-Endpunkt meldet, welche Flags live tatsächlich greifen – das ist das
Testprotokoll, wenn Sam sagt „geht nicht": erst `/health` prüfen (Build,
Commit, Feature-Block), dann suchen.

**Nützliche Kommandos:**

```
npm run check                     # Typecheck + Tests (Pflicht vor jedem Merge)
npm run build                     # shared + server + client
npm run balance:live -- --url https://mazers.de   # Live-Balance-Auswertung
```

## Fallen, die uns schon Zeit gekostet haben

- **Railway „No changes to watched files"**: Watch-Paths können Deploys
  überspringen. Sam hat sie geleert; wenn ein Deploy trotzdem ausbleibt, ist
  das die erste Verdächtige.
- **Client-Änderung ohne Server-Datei** löste früher keinen Deploy aus.
- **PixiJS dynamisch nachladen** war die Ursache der Grafikstart-Hänger – die
  Renderer-Bundles werden statisch importiert. Nicht zurückbauen.
- **Sam testet manchmal gegen einen alten Build** – vor der Fehlersuche
  `/health` (Feld `build`/`commit`) mit dem erwarteten Stand vergleichen.
- **Migrationen** liegen in `supabase/migrations/`; nach `applied/` wandern sie
  erst, wenn Sam bestätigt hat, dass sie eingespielt sind.

## Die teuerste Lehre (06.08.)

**Ein Feature hinter einem Opt-in-Flag ist für Sam nicht gebaut.** Die Regel
„jedes neue Feature kommt hinter ein Flag, Default aus" ist richtig für den
Moment des Mergens – aber sie hat hier dazu geführt, dass drei fertige,
getestete Pakete wochenlang dunkel blieben, weil niemand den Schalter umgelegt
hat. Sam hat zweimal „die Kugeln sind zu schnell" gemeldet, während das Paket,
das genau das behebt, ausgeschaltet auf `main` lag.

**Neue Regel der Zentrale:** Beim Merge ist Default aus. Sobald das Paket
integriert ist und nichts mehr blockiert, **stellt 01 den Default auf an** –
als Opt-out (`false`/`0`/`off` schaltet zurück), damit ein Rückweg bleibt. Wer
ein Paket merged, ist dafür verantwortlich, dass es auch ankommt.

Und: Wenn Sam sagt „X ist immer noch kaputt", ist die erste Frage nicht „woran
liegt X", sondern **„lief X überhaupt?"**.
