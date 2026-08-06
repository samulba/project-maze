# 11 – Deploy-Stopp, `tier` im Perf-Report, Balance verdichtet

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` (2. Fassung, 2026-08-06) |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`de7546c`) |
| **Tests** | `npm run check` grün – 43 Dateien, 570 Tests (7 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

---

# TEIL 1 (Vorrang): Warum der Live-Stand zwölf Commits zurückhängt

## Kurzfassung

Ich kann den Auslöser **nicht abschließend benennen** – dafür bräuchte es die
Railway-Oberfläche, an die ich nicht herankomme. Ich habe aber die beiden
Verdächtigen aus unserer Fallenliste geprüft und **beide entlastet**, eine
dritte Erklärung wahrscheinlich gemacht, und einen Test gebaut, der die Frage
beim nächsten Push von selbst beantwortet.

**Wichtiger Nebenbefund: Der `build`-Wert in `/health` beweist gar nichts.**
`"build":"sprint-b2+static-renderers"` ist ein **fester Text im Quelltext**
(`apps/server/src/index.ts`), keine Build-Information. Er ändert sich nur, wenn
ihn jemand von Hand ändert. In dem `/health`, den Sam geschickt hat, ist also
nur ein einziges Feld belastbar: `commit`.

## Was ich sicher sagen kann

**1. Der Repo-Stand war durchgehend deploybar. Kein Commit hat je einen Build
gebrochen.**

Ich habe die CI-Historie für alle Commits auf `main` seit dem 05.08. geholt.
Jeder einzelne Lauf ist `success` – und zwar inklusive des Jobs `Deployment
images`, der **beide Container-Images tatsächlich baut** und `docker compose
config` validiert. Ein Build-Fehler, der als „kein Deploy" durchgeht, hätte
hier rot sein müssen.

Der einzige nicht-grüne Lauf ist `a854b29` mit `cancelled` – das ist die
`concurrency`-Regel der CI (`cancel-in-progress`), die einen überholten Lauf
abbricht, weil 40 Sekunden später `a7ed30e` gepusht wurde. Kein Fehler, und der
Nachfolger ist grün.

→ **Verdächtiger „fehlgeschlagener Build" ist entlastet**, mit einer
Einschränkung: Railway baut nicht mit unserem Dockerfile, sondern über seine
eigene Erkennung. Ein Bruch, der *nur* dort auftritt, bliebe der CI verborgen.
Das ließe sich nur im Railway-Build-Log sehen.

**2. Der Schnitt liegt in der Zeit, nicht in den Pfaden.**

Das war meine erste Hypothese, und sie ist **falsch**. Ich hatte gesehen, dass
seit `d8568b6` am Server praktisch nichts passiert ist, und auf Watch-Paths
wie `apps/server/**` getippt. Dann habe ich den letzten live bestätigten Commit
selbst geprüft:

| Commit | Zeit | Dateien in `apps/server` + `packages/shared` |
| --- | --- | --- |
| `d8568b6` **(live)** | 05.08. 21:44 | **0** |
| `4e94058` | 05.08. 21:55 | 0 |
| `8261c82` | 05.08. 22:39 | 0 |
| `36fe8ac` | 05.08. 22:40 | 0 |
| `a854b29` | 05.08. 22:41 | 0 |
| `a7ed30e` | 05.08. 22:41 | 0 |
| `77f8a3f` | 05.08. 23:15 | 0 |
| `707e42f` | 05.08. 23:15 | 0 |
| `6eb0123` | 05.08. 23:17 | 0 |
| `91b6da1` | 05.08. 23:21 | 0 |
| `464e459` | 05.08. 23:25 | 0 |
| `2ac1e59` | 05.08. 23:28 | 0 |
| `fff6df2` | 05.08. 23:33 | 0 |
| `de7546c` | 06.08. 09:18 | 1 |

**`d8568b6` hat selbst keine einzige Server-Datei angefasst** – reiner Client
plus Doku, genau wie die zwölf danach – und wurde trotzdem deployt. Ein
Watch-Path auf `apps/server/**` hätte auch ihn übersprungen. Die Erklärung
„Railway beobachtet nur Server-Pfade" ist damit widerlegt.

Alles bis 21:44 kam live an, alles ab 21:55 nicht. Der Schnitt ist ein
**Zeitpunkt**, kein Pfadmuster. Irgendetwas hat zwischen diesen beiden Pushes
aufgehört zu funktionieren.

**3. Client und Server hängen an *einem* Deploy.**

`apps/server/src/index.ts` liefert das Client-Bundle selbst aus
(`express.static` auf `../../client/dist`, Zeilen 493–505). Es gibt also nicht
etwa einen Client-Service, der noch deployt, und einen Server-Service, der
klemmt – **eine** stehengebliebene Pipeline erklärt zwangsläufig beides. Dass
Sam den Diep-Umbau nicht sieht *und* `/health` einen alten Commit meldet, ist
ein Symptom, nicht zwei.

**4. Was ich nicht prüfen konnte.**

`www.mazers.de` ist aus meiner Umgebung nicht erreichbar – der Proxy lehnt die
Verbindung mit `403` ab. Ich konnte `/health` also **nicht selbst abrufen** und
arbeite ausschließlich mit dem Stand, den Sam geschickt hat. An die
Railway-Oberfläche komme ich ebenfalls nicht.

## Die wahrscheinlichste Erklärung – und eine, die wir nicht ausschließen dürfen

Nach dem Ausschluss oben bleibt: Der **Trigger** hat aufgehört auszulösen.
Typische Auslöser, alle nur im Dashboard sichtbar:

1. **Watch-Paths wurden gesetzt statt geleert.** Ein Muster, das auf nichts
   passt, überspringt jeden Deploy stillschweigend („No changes to watched
   files"). Sam hat sie laut Übergabe geleert – **wann**, wissen wir nicht.
   Fiel diese Änderung auf den Abend des 05.08., wäre sie der beste Kandidat,
   und dann hätte sie das Gegenteil des Gewollten bewirkt.
2. **Auto-Deploy aus oder GitHub-Repo abgehängt** (etwa durch abgelaufene
   Autorisierung).
3. **Deploys pausiert** – etwa wegen erschöpftem Kontingent.

**Die Gegenhypothese, die wir bisher nie geprüft haben:** `commit` kommt aus
`RAILWAY_GIT_COMMIT_SHA`. Ist diese Variable irgendwann **von Hand als
Service-Variable** gesetzt worden, überschreibt sie den echten Wert – dann
meldet `/health` für immer `d8568b6`, **auch wenn jeder Deploy sauber läuft**.
Wir hätten zwei Tage lang einer Anzeige geglaubt, die nichts mehr misst.

Das ist kein akademischer Einwand: Unsere gesamte Diagnose hängt an diesem
einen Feld.

## Was Sam prüfen möge – zwei Fragen, beide in einer Minute beantwortet

**Frage 1: Ist die Seite hell oder dunkel?**
Der Diep-Umbau (`77f8a3f`) ist ein heller Grundlook und optisch drastisch.

- **Noch dunkel** → der Deploy steht wirklich, `/health` sagt die Wahrheit.
- **Schon hell** → die Deploys laufen, und `/health` lügt. Dann ist die
  Ursache eine fest verdrahtete `RAILWAY_GIT_COMMIT_SHA` in den
  Service-Variablen, und die muss dort **weg**.

**Frage 2: Was meldet `/health` jetzt?**
`de7546c` wurde heute um 09:18 gepusht – der erste Commit seit `d8568b6`, der
überhaupt Server-Code anfasst. Ein frischer Abruf trennt sauber:

- **`de7546c`** → der Deploy läuft wieder; der Stopp war vorübergehend, und wir
  haben ab jetzt die Wache aus Teil 2, die es beim nächsten Mal sofort meldet.
- **weiterhin `d8568b6`** → der Stopp hält an. Dann in Railway die
  **Deployments-Liste** öffnen und auf den 05.08. gegen 21:55 sehen:
  *kein Eintrag* → der Trigger löst nicht aus (Watch-Paths / Auto-Deploy);
  *roter Eintrag* → doch ein Build-Fehler, und das Log sagt, welcher.

Bitte in beiden Fällen auch `uptimeSeconds` mitschicken (neu, siehe Teil 2) –
das Feld sagt unabhängig von jeder Railway-Variable, wie lange der laufende
Prozess schon steht.

## Was die zwölf Commits für meine Messungen bedeuten

**Meine Lastprobe und die Balance-Baseline sind unberührt.** Beide liefen
ausschließlich lokal gegen einen selbst gestarteten Server aus dem
Repository-Stand; Railway kommt darin nicht vor. Das gilt auch für die Läufe in
Teil 3 dieses Berichts.

**Unter Vorbehalt steht dagegen jede Aussage über „live" aus den letzten zwei
Tagen.** Konkret:

- Alles, was seit dem 05.08. abends über die *Optik* oder das *Spielgefühl* der
  laufenden Seite gesagt wurde, bezieht sich auf `d8568b6` – also **ohne**
  Diep-Umbau, **ohne** 03s Vollbild/Letterbox/Qualitätsstufen.
- Der `features`-Block, den 01 gerade um `signatureRapid` und
  `signatureImpact` erweitert hat, ist live **noch nicht vorhanden** – er kam
  erst mit `de7546c`. Ein `/health` ohne diese beiden Felder ist deshalb kein
  Hinweis auf falsch gesetzte Variablen, sondern schlicht der alte Stand.
- Die eingefrorenen Abzüge unter `docs/balance/` sind **nicht** betroffen: reine
  Lastlauf-Abzüge, kein Produktionsbezug.

---

# TEIL 2: Die Wache, damit das nicht noch einmal zwölf Commits kostet

## `deploy-watch` als eigener CI-Job

`scripts/deploy-watch.mjs`, eingehängt in `.github/workflows/ci.yml`. Läuft
**nur nach einem Push auf `main`**, pollt `/health` alle 20 Sekunden und
schlägt nach 15 Minuten fehl, wenn der gepushte Commit dort nicht auftaucht.
Die Fehlermeldung nennt den Stand, der stattdessen läuft, und die drei
Verdächtigen in der Reihenfolge, in der man sie prüft.

Drei Entscheidungen dazu:

- **Eigener Job ohne `needs`.** Wird er rot, heißt das „der Stand ist nicht live
  angekommen" – *nicht* „der Code ist kaputt". Diese beiden Aussagen dürfen
  nicht in derselben roten Ampel landen.
- **Ein `unbekannt` in `commit` gilt als Fehlschlag, nicht als Erfolg.** Wenn
  die Railway-Variable nicht ankommt, kann die Wache nichts beweisen – und eine
  Wache, die im Zweifel grün meldet, ist schlimmer als keine.
- **Netzwerkfehler brechen nicht ab.** Während eines Deploys ist der Dienst
  kurz weg; genau dann läuft die Wache.

Das Ziel ist über die Repository-Variable `HEALTH_URL` umstellbar, ohne die
Datei zu ändern. Ohne sie gilt `https://www.mazers.de/health`.

## `uptimeSeconds` in `/health`

Ein Feld, das ohne jede Railway-Variable auskommt: die Laufzeit des Prozesses.
Steht dort ein Wert von Tagen, hat es seit Tagen keinen Deploy gegeben – **auch
dann, wenn `commit` etwas anderes behauptet.** Genau das trennt die
Gegenhypothese von oben ab, und es kostet eine Zeile.

Den irreführenden `build`-Wert habe ich **nicht** angefasst (er gehört 01, und
`de7546c` hat gerade an derselben Stelle editiert), aber im Code als das
kommentiert, was er ist.

---

# TEIL 3: `tier` im Perf-Report

Umgesetzt wie von 01 entschieden: **eigenes Feld neben `quality`**, nicht als
kombiniertes Label.

```json
{ "fpsP50": 60, "fpsP95": 45, "frameHangs": 2, "dpr": 2,
  "viewportW": 1920, "viewportH": 1080,
  "deviceClass": "high", "quality": "webgl", "tier": "mid" }
```

Alle Serien in `/metrics` tragen jetzt `{deviceClass,quality,tier}`. Dazu ein
neuer Zähler `maze_client_tier_coerced_total`.

## Drei Festlegungen, die der Auftrag offen ließ

**1. Ein unbekannter `tier`-Wert führt *nicht* zu `400`.**

Der Auftrag sagt „erlaubte Werte durchlassen, alles andere verwerfen". Ich
verwerfe den **Wert**, nicht den **Bericht**: Was nicht im Vokabular steht,
wird zu `unknown`, der Rest des Berichts bleibt verwertbar.

Das ist bewusst gegen die naheliegende Lesart entschieden, und zwar wegen
unserer eigenen Falle: *Ein dauerhaft abgelehnter Client fällt im Spiel nicht
auf.* Ein `.strict()`-Schema, das bei `tier:"ultra"` mit `400` antwortet,
kostet uns **den kompletten Perf-Bericht** dieses Clients – FPS, Hänger,
Geräteklasse, alles –, und niemand merkt es, weil der Client nichts anzeigt und
weiterspielt. Der Preis für einen unbekannten Stufennamen wäre der Verlust
genau der Daten, für die die Route existiert.

Damit das Zurechtbiegen nicht seinerseits unsichtbar wird, zählt
`maze_client_tier_coerced_total` jeden Fall. Steht dort dauerhaft etwas
anderes als 0, schickt ein Client etwas, das wir nicht kennen – dann ist es
sichtbar und nicht still.

**2. Das Feld ist optional.**

Clients vor R4 kennen es nicht. Ohne `optional` wären **alle** ihre Berichte
dauerhaft mit `400` abgewiesen – dieselbe unsichtbare Falle, nur schlimmer,
weil sie jeden älteren Client träfe. Fehlt das Feld, gilt `tier="unknown"`,
und der `coerced`-Zähler bleibt bei 0: „hat nichts geschickt" und „hat Unsinn
geschickt" sind zwei verschiedene Dinge und werden auch so gezählt.

**3. Die Whitelist wird unmittelbar vor der Ausgabe noch einmal angewandt.**

Der Export verlässt sich nicht darauf, dass weiter oben schon geprüft wurde.
Jeder Labelwert läuft direkt vor dem Schreiben durch seine Whitelist; was nicht
darin steht, wird `unknown`. Damit ist die Zahl der Zeitreihen durch das
Vokabular gedeckelt und nicht durch die Sorgfalt des Aufrufpfades – und eine
Injektion über einen Labelwert (`"}\nmaze_fake 1`) ist konstruktiv
ausgeschlossen. Genau das ist als Test hinterlegt.

## Zur Kardinalität – eine Korrektur an der Begründung

Im Auftrag steht, ein kombiniertes Label `webgl-mid` würde „die Kardinalität
von 4 auf 12 heben". Der Vergleich ist so nicht ganz richtig, und weil das
Argument die Entscheidung getragen hat, sage ich es dazu:

| | Kombinationen |
| --- | --- |
| vorher (`deviceClass` × `quality`) | 4 × 4 = **16** |
| kombiniertes Label (`deviceClass` × `quality-tier`) | 4 × 12 = **48** |
| eigene Achse (`deviceClass` × `quality` × `tier`) | 4 × 4 × 4 = **64** |

Die eigene Achse ist also **nicht die sparsamere Variante** – sie ist die
teurere. Der Ausschlag gibt trotzdem für die eigene Achse:

- Über Stufen hinweg aggregieren funktioniert ohne Label-Parsing – die Frage
  „wie schnell läuft WebGL insgesamt" bleibt eine Summe über `tier`, statt
  drei Labelwerte zusammenklauben zu müssen.
- 64 ist eine **Obergrenze, kein Ist**: Exportiert werden nur Kombinationen,
  die im Fenster tatsächlich belegt sind. Real gibt es keine Geräte, die alle
  vier Renderpfade gleichzeitig belegen.
- Die Grenze ist hart. Ein manipulierter Client kann keine neuen Labelwerte
  erfinden, egal was er schickt.

Bei 64 Zeitreihen × 8 Serien wären es im theoretischen Extremfall rund 512
Zeilen im Export – handhabbar, aber nicht mehr beliebig ausbaufähig. **Eine
vierte Achse ginge nicht mehr ohne Umbau.** Wenn später noch eine Dimension
dazu soll, ist der richtige Zeitpunkt für die Diskussion jetzt und nicht dann.

## Was 03 noch fehlt

Der Client **sendet bereits** Perf-Berichte (`apps/client/src/perf-metrics.ts`,
Zeile 220) – nur ohne `tier`. Die Renderer-Seite ist ebenfalls fertig:
`renderer.qualityTier` liefert genau `high` | `mid` | `low`.

Es fehlt eine Zeile im Bericht-Aufbau (`perf-metrics.ts`, um Zeile 205), analog
zu `quality`:

```ts
  deviceClass: geraeteklasse,
  quality: options.quality(),
  tier: options.tier()        // ← aus renderer.qualityTier
```

Der Server nimmt beides an – mit und ohne Feld –, 03 kann also jederzeit
nachziehen, ohne dass etwas kaputtgeht. **`apps/client/src` habe ich nicht
angefasst**, das ist 03s Revier.

---

# TEIL 4: Balance-Baseline verdichtet

PLATZHALTER_BALANCE

---

## Verifiziert

**`npm run check` grün** – 43 Dateien, 570 Tests (7 neu).

**Die Deploy-Wache ist gegen einen Testserver gefahren**, nicht nur geschrieben.
Alle drei Pfade:

| Fall | Erwartet | Ergebnis |
| --- | --- | --- |
| live hängt zurück (`d8568b6`, erwartet `de7546c`) | Fehlschlag mit Diagnose | ✔ Exit 1, Verdächtigenliste ausgegeben |
| Stand kommt an | Erfolg | ✔ Exit 0 nach dem ersten Abgriff |
| `/health` meldet `commit: "unbekannt"` | **Fehlschlag**, nicht Erfolg | ✔ Exit 1 mit Hinweis auf die fehlende Variable |

Der erste Fall bildet exakt die reale Lage vom 05.08. nach.

**Kardinalität und Labelgrenzen** sind als Test hinterlegt, nicht nur als
Kommentar: erfundene Stufennamen (`ultra`, `potato`, `MID`, `mid ` mit
Leerzeichen, ein 500-Zeichen-Wert und ein Injektionsversuch
`"}\nmaze_fake 1`) fallen alle auf **eine** `unknown`-Reihe zusammen, der
Export bleibt eine Zeile je Serie, und `maze_fake` taucht nirgends auf.

**Die Balance-Läufe sind gegen die Blindtest-Falle abgesichert.** Vor jeder
Auswertung prüft der Runner `classChoicesSent` und `upgradesSent` aus dem
Lasttest-Bericht; beide waren in allen sechs Läufen deutlich von null
verschieden. Zusätzlich habe ich aus jedem Lauf `/health` mitgeschrieben und
den `features`-Block geprüft – in den Baseline-Läufen stehen `signatureRapid`
und `signatureImpact` tatsächlich auf `true`. Ein Lauf, bei dem der Schalter
gar nicht greift, hätte sonst als „kein Effekt" durchgehen können.

**Sicherheitsprüfung** (Regel 3): Kein `service_role`-Key und kein anderes
Geheimnis im Repository – die Treffer auf `SERVICE_ROLE` sind ausschließlich
Variablennamen, Doku und ein Dummy-Wert in einem Test. Der Produktionswert
`RATE_LIMIT_CONNECTIONS_PER_IP=5` steht unverändert in `.env.example`,
`DEPLOY.md` und `DEPLOYMENT.md`; die `200` erscheinen ausschließlich im
Lastlauf-Rezept in `TELEMETRY.md`, wo sie hingehören und erklärt sind.

**Nicht angefasst:** `packages/shared`, `apps/client/src`.

## Bewusste Abweichungen vom Auftrag

**1. Ein unbekannter `tier`-Wert wird zurechtgebogen statt abgelehnt.**
Der Auftrag las sich als „alles andere verwerfen". Ich verwerfe den Wert, nicht
den Bericht – Begründung in Teil 3. Wer es strenger will, ändert eine Zeile
(`.catch('unknown')` streichen); dann kostet ein unbekannter Stufenname aber
den ganzen Perf-Bericht, unsichtbar.

**2. Ich habe die Kardinalitäts-Begründung im Auftrag korrigiert.**
Die eigene Achse ist die *teurere* Variante (64 statt 48), nicht die
sparsamere. Gebaut habe ich sie trotzdem wie entschieden – die Gründe tragen,
nur nicht der genannte. Tabelle in Teil 3.

**3. `SIGNATURE_RAPID_ENABLED` und `SIGNATURE_IMPACT_ENABLED` nachdokumentiert
(nicht beauftragt).**
Beide Flags fehlten **vollständig** in `.env.example` *und* `docs/DEPLOYMENT.md`
– das verstößt gegen unsere eigene Regel 4, und es traf ausgerechnet die
beiden Schalter, deren Wirkung gerade beurteilt werden soll. Ohne Doku ist
nicht auffindbar, wie man sie einschaltet. Jetzt beide drin, mit dem Hinweis
auf den `features`-Block in `/health`.

**4. Statuszeilen in der README korrigiert (nicht beauftragt).**
Pakete 08 und 10 standen dort als „offen – wartet auf Review und Merge",
sind aber längst in `main` (`69ade20` bzw. `8261c82`, beide als Vorfahren von
`origin/main` verifiziert). Der Auftrag führte Paket 08 deshalb als „hängt
weiterhin" – es hängt nichts, es ist fertig, Server *und* Client. Das war der
angebotene „beiläufig abräumen"-Punkt.

**5. Den irreführenden `build`-Wert habe ich *nicht* geändert.**
Er gehört 01, und `de7546c` hat gerade dieselbe Stelle editiert – eine Änderung
hätte einen unnötigen Merge-Konflikt erzeugt. Stattdessen: Kommentar im Code,
Warnung in `DEPLOYMENT.md`, Meldung hier.

## Von 01 gebraucht

1. **Merge dieses Branches** – `tier` blockiert 03, und die Deploy-Wache nützt
   erst etwas, wenn sie auf `main` läuft.
2. **Rechne damit, dass `deploy-watch` auf `main` zunächst rot wird**, falls der
   Deploy noch steht. Das ist die beabsichtigte Meldung und **kein Grund, den
   Job wieder auszubauen** – die Aussage lautet „der Stand ist nicht live", nicht
   „der Code ist kaputt". Er hängt an keinem anderen Job und blockiert nichts.
3. **Gib 03 frei, dass `tier` serverseitig steht.** Es fehlt genau eine Zeile im
   Client (Teil 3, Ende) – der Server nimmt Berichte mit *und* ohne Feld an,
   03 kann also ohne Absprache-Fenster nachziehen.
4. **Der `build`-Wert in `/health` gehört dir.** Er ist ein fester Text im
   Quelltext und beweist nichts über den laufenden Stand. Solange er wie eine
   Build-Kennung *aussieht*, wird er wieder als eine gelesen werden. Entweder
   echt machen (beim Build setzen) oder streichen – meine Empfehlung: streichen,
   `commit` und `uptimeSeconds` decken die Frage ab.
5. **Kardinalität:** `/metrics` ist mit drei Achsen bei 64 Kombinationen
   gedeckelt. Eine vierte Achse geht nicht mehr ohne Umbau – wenn noch eine
   Dimension kommen soll, ist jetzt der Zeitpunkt, das zu entscheiden.

## Für Sam

**Zwei Fragen, die nur du beantworten kannst – beide in einer Minute:**

1. **Ist www.mazers.de hell oder dunkel?** Der Diep-Umbau ist ein heller
   Grundlook. Noch dunkel → der Deploy steht wirklich. Schon hell → die Deploys
   laufen und `/health` zeigt einen falschen Commit; dann muss
   `RAILWAY_GIT_COMMIT_SHA` aus den Service-Variablen raus.
2. **Was meldet `mazers.de/health` jetzt?** Bitte den ganzen Block schicken.
   Steht dort `de7546c`, läuft der Deploy wieder. Steht dort weiter `d8568b6`,
   bitte in Railway die **Deployments-Liste** auf den 05.08. ~21:55 ansehen:
   kein Eintrag → Trigger löst nicht aus (zuerst **Watch-Paths** prüfen, dann
   ob Auto-Deploy an ist); roter Eintrag → Build-Fehler, dann sagt das Log warum.

**Zum Mitschicken:** `uptimeSeconds` ist neu in `/health`. Es sagt unabhängig
von allen Railway-Variablen, wie lange der laufende Prozess steht – ein Wert von
Tagen heißt: seit Tagen kein Deploy.

**Was ich nicht konnte:** `www.mazers.de` ist aus meiner Umgebung nicht
erreichbar (Proxy lehnt mit `403` ab), an die Railway-Oberfläche komme ich
ebenfalls nicht. Ich habe deshalb ausschließlich mit dem `/health` gearbeitet,
den du geschickt hast, plus der CI-Historie aus GitHub.

**Produktionswerte, unverändert:** `RATE_LIMIT_CONNECTIONS_PER_IP` bleibt `5`.
Die `200` stehen ausschließlich im Lastlauf-Rezept dieses Berichts und in
keiner ausgelieferten Datei – geprüft.
