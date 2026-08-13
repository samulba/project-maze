# MAZERS – das Ziel

Stand: 12.08.2026. Dieses Dokument ist der Nordstern. Wenn eine Aufgabe nicht
auf eine der Zeilen hier einzahlt, ist sie nicht dran.

---

## In einem Satz

MAZERS ist eine gesunde Mischung aus Diep.io und Arras.io: viele Tanks mit
echten Rollen statt nur unterschiedlich schneller Kugeln, mehrere Modi, eine
Karte, die sich groß anfühlt – und es fühlt sich an wie ein fertiges Spiel,
nicht wie ein Prototyp.

„Fertig" ist kein Gefühl, das wir uns selbst bescheinigen – aber es ist auch
nicht die Liste unten. Die Liste schließt aus, dass es *kaputt* ist. Ob es *gut*
ist, entscheidet, wer es spielt.

---

## Was „fertig" heißt

> **Zuerst das Wichtigste an diesem Dokument: Die Liste unten entscheidet
> nicht, ob MAZERS fertig ist.**
>
> Sie ist eine Liste von **Ausschlusskriterien**. Jede grüne Zeile schließt eine
> Art aus, auf die sich ein Spiel wie ein Prototyp anfühlen kann – überlappende
> UI, ruckelnder Server, ein Upgrade das nichts tut, ein Knopf ohne Wirkung.
> Zusammen sagen sie: *Es ist nicht aus diesen Gründen kaputt.*
>
> Sie sagen **nicht**: *Es macht Spaß.* Kein Testlauf dieser Welt kann das
> sagen. Zwölf grüne Zeilen sind ein Spiel, das nicht offensichtlich kaputt ist –
> und ein Spiel, das nicht kaputt ist, kann trotzdem langweilig sein.
>
> Wer diese Liste als Fortschrittsbalken liest, verwechselt „läuft" mit „ist
> gut". Das ist genau der Fehler, der Prototypen entstehen lässt, die technisch
> tadellos sind und die niemand zweimal öffnet.
>
> Entscheiden können es zwei Dinge, und beide stehen nicht in meiner Macht:
> **Sams Hände am Spiel** und **die letzte Zeile der Tabelle** – ob Fremde
> wiederkommen. Alles darüber ist Vorarbeit dafür, dass diese beiden Urteile
> überhaupt fair gefällt werden können.

| Zeile | Womit geprüft | Stand heute |
|---|---|---|
| Regeln und Typen stimmen | `npm run check` grün | ✅ |
| Keine UI, die sich überlappt oder aus dem Bild läuft | `scripts/ui-layout-check.mjs` 196/196 | ✅ |
| Kein Tank ist Müll, keiner ist Pflicht | Balance-Korridore in `packages/shared/src/balance.test.ts` | ✅ |
| Das Labyrinth bleibt ein Labyrinth | Wanddeckung 17–28 % der Fläche, Gang ≥ 7 Panzerbreiten, **eine** erreichbare Fläche (`world.test.ts`, `map-reachability.test.ts`) | ✅ 21,8 % · Gang 320 px · 1 Gebiet |
| Kein Upgrade ohne Wirkung | `upgradeAppliesTo`, geprüft durch die **ganze** Tuning-Kette | ✅ |
| Kein Knopf ohne Server-Antwort | Alle 8 Familien-Signatures serverseitig verdrahtet | ✅ |
| Keine Serverlags bei voller Arena | Tick p95 < 25 ms **und ≤ 160 KB/s pro Spieler** | ✅ Maze 134,6 KB/s / p95 10,8 ms · Royale 140,3 KB/s / p95 7,2 ms (je 80 Spieler, neu gemessen am 12.08.) |
| Die Leitung Server→Client ist heil | `npm run wire-probe` grün | ✅ |
| Auf dem Handy lässt sich **spielen**, nicht nur gucken | `npm run touch-probe:all` grün | ✅ 5 Formate, 667×375 bis 932×430 |
| Die Fortschrittsschleife trägt: farmen → aufsteigen → Klasse → Upgrade | `npm run progress-probe` grün | ✅ |
| Mehrere Modi | Drei spielbare Modi; `npm run mode-probe` je Modus grün, `npm run royale-probe` für die Runde | ✅ Maze, FFA, Battle Royale |
| Es fühlt sich groß an | 675.000 px² je Spieler, Dichte-Test grün | ✅ 9000 × 6000, 80 Spieler |
| **Fremde kommen wieder** | Admin-Portal: wiederkehrende `device_id` über 7 Tage | 🔍 misst ab jetzt |

**Stand 12.08.: alle zwölf technischen Zeilen grün.**
Das ist ausdrücklich **kein** „fertig" – siehe den Kasten oben. Es heißt: Zwölf
Wege, auf denen sich das Spiel wie ein Prototyp anfühlen könnte, sind
ausgeschlossen und mit einem Befehl nachprüfbar. Die Zeile, die zählt, ist die
dreizehnte, und die misst gerade erst an.

**Am 12.08. lief eine vollständige Codeanalyse.** Sie hat siebzehn Befunde
behoben, und zwei davon sagen mehr über den Stand aus als jede grüne Zeile:

* **Der Beitritt war zwei Stunden lang kaputt.** Eine Layout-Reparatur vom
  Vortag hatte den Respawn-Knopf in eine neue Leiste gesetzt; ein
  `insertBefore` dagegen warf mitten im Welcome-Zweig, und `setEnabled(true)`
  für die Eingabe wurde nie erreicht. Der Startscreen ging weg, das HUD stand
  da, der Tank ließ sich nicht bewegen. **Alle 996 Tests waren grün, und alle
  196 Layout-Fälle auch.** Gefunden hat es `npm run wire-probe` – die einzige
  Prüfung, die tatsächlich beitritt.
* **Zwei Zusicherungen in diesem Dokument waren falsch** (die Kettenanalyse und
  die Familientabelle), und beide haben Befunde gedeckt statt sie zu
  verhindern. Der Maßstab selbst braucht Sabotageproben.

Die Lehre ist dieselbe wie in „Eine Fehlerklasse, die zweimal zugeschlagen
hat": Eine Prüfung, die neben dem Weg misst, den ein Spieler nimmt, ist keine
Prüfung. Die Proben (`wire-probe`, `touch-probe`, `mode-probe`,
`royale-probe`, `progress-probe`) sind deshalb kein Beiwerk, sondern die
einzige Stelle, an der das Spiel als Spiel geprüft wird.

**Der eigentliche Stand ist: unvalidiert.** Kein Mensch außer den Bots hat
dieses Spiel in seinem heutigen Zustand gespielt. Die Dinge, die den Ausschlag
geben, sind alle offen:

1. ~~Die **Supabase-Migration** (`0005_sessions.sql`)~~ **Erledigt am
   13.08.: Sam hat die Migration eingespielt.** Damit fällt der letzte
   Handgriff-Blocker. Verifikation nach dem nächsten Deploy: `/health`
   meldet unter `sessions`, ob die Schicht schreibt (der Server prüft das
   Schema beim Start und nennt im Log, was fehlen sollte); danach misst
   die Wiederkehr-Zeile erstmals echte Daten. Sollten die
   Railway-Variablen noch nicht vollständig stehen, sagt dieselbe
   /health-Zeile es.
2. Ob sich **SIEGE gegen RAPID** wirklich unterschiedlich anfühlt, ist eine
   Behauptung aus acht Füllbedingungen im Code. Belegt ist, dass sie
   verschieden *rechnen*. Ob daraus Spielgefühl wird, entscheiden Daumen und
   Maus, kein Korridor.
3. Ob die größere Karte sich groß anfühlt oder nur leer, hat niemand gespielt.
   Gemessen ist die Dichte, nicht das Gefühl.
4. Ob die **Royale-Runde die richtige Länge** hat, ist geraten: 40 s Schonfrist,
   dann Stufen aus 30 s Schrumpfen und 45 s Halten, Endphase nach rund zehn
   Minuten. Belegt ist, dass die Runde läuft und ablesbar ist – nicht, dass sie
   sich richtig anfühlt. `ROYALE_SPEED=20` macht aus dem Ausprobieren eine
   Minute statt zehn; die Zahlen selbst gehören danach Sam.

**Eine bekannte Grenze, bewusst offen gelassen:** Auf halbhohen Fenstern zeigt
die Klassenwahl in der Ecke nicht alle acht Karten gleichzeitig – gemessen 6 von
8 auf 1280 × 540 und 4 von 8 auf 1600 × 500. Erreichbar sind alle (der Kasten
scrollt), und das Rad auf Taste C zeigt ohnehin den ganzen Baum. Das zu ändern
hieße, den Höhendeckel (34 vh) gegen die Bestenliste zu verschieben – eine
Layout-Runde, keine Fehlerbehebung. Aufgefallen ist es, weil die Layout-Matrix
seit heute auch flache Fenster mit einem *frischen* Spieler prüft; genau diese
Kombination fehlte, und durch dieselbe Lücke war die Onboarding-Karte in die
Bestenliste gelaufen.

Was zur Karte gehört, ist systematisch nachgeprüft und nicht nur angenommen:
Bandbreite, Tick-Budget, Bot-Dichte, Wanddeckung, Arena-Events, Spawn-Verteilung
(Notausgang greift in 20.000 Ziehungen nie), Formen-Nachschub, Rate-Limits
(Respawn läuft nicht über die Join-Grenze), Handy-Layout und Touch-Bedienung.
Ein echter Befund kam dabei heraus – die Arena-Events – und der ist behoben.

---

## Die drei Entscheidungen

Drei Dinge waren im ursprünglichen Zielsatz offen. **Sam hat sie am 11.08.2026
entschieden** – die Vorschläge kamen von mir, die Entscheidung von ihm. Bei den
Modi hat er anders entschieden als vorgeschlagen.

### 1. Welche Modi? → Maze (aktuell) + FFA + Battle Royale. Drei.

Als das entschieden wurde, gab es im Code **keine** Modi-Infrastruktur:
`mode: 'maze-alpha'` war ein hartkodiertes Etikett in `index.ts` und
`telemetry.ts`. „Mehrere Modi" war also Neuland, kein Feinschliff – heute ist
`ARENA_MODE` der Schalter, und der Modus steht in `/health`, in der Telemetrie
und im Etikett des Clients.

(Der Halbsatz „in der Telemetrie" stand hier schon einmal und war falsch:
`telemetry.ts` trug das alte Etikett bis zum 12.08. weiter – zwei Dienste
waren in Prometheus nicht auseinanderzuhalten, und genau diese Zusicherung
hat den Befund gedeckt statt ihn zu verhindern (Befund 65, dieselbe Klasse
wie die zwei falschen Zusicherungen vom 12.08.). Seitdem prüft die
mode-probe auch `/metrics?format=json` – der Satz ist wieder wahr und
diesmal von einer Probe gehalten, nicht von sich selbst.)

**Stand 11.08.: alle drei laufen**, umgeschaltet über `ARENA_MODE`. Der Modus
ist eine Eigenschaft der Arena, nicht des Spielers – ein Prozess, eine Arena,
derselbe Weg wie `BOT_COUNT`. Wer mehrere *gleichzeitig* anbieten will, startet
zwei Dienste; mehrere Arenen in einem Prozess wären deutlich mehr Umbau, weil
dann jede Regel wissen müsste, in welcher sie läuft.

| Modus | Was ihn ausmacht | Stand |
|---|---|---|
| **Maze** | Der heutige Modus: Wände in Bahnen (`world.ts`), Deckung, Ecken | ✅ da |
| **FFA** | Offene Arena ohne Wände – das Diep.io-Gefühl, freie Sichtlinien | ✅ da |
| **Battle Royale** | Schrumpfende Zone, letzter Überlebender | ✅ da |

FFA war billig, weil es der heutige Modus **ohne** Wandgenerierung ist – und
trotzdem ein völlig anderes Spiel: ohne Deckung zählen Reichweite und Tempo
statt Ecken. Battle Royale war der eigentliche Bau (Zonen-System, Ausscheiden,
Runden) und kam zuletzt – so wie Sam es angeordnet hatte.

Team-Arena, Boss-Runden und 2v2 sind **nach** 1.0.

### 2. Handy drin oder raus? → Drin, aber als „spielbar", nicht als „gleichwertig".

Es steckt bereits viel fertige Touch-Arbeit im Code: `.move-stick`,
`.aim-stick`, `.auto-fire`, `.secondary-action`, `.core-ability`, 44-px-Ziele
unter `@media (pointer: coarse)`, und die Harness prüft 17 echte Gerätegrößen
inklusive Handys im Querformat. Das wieder rauszureißen wäre Vernichtung
fertiger Arbeit.

Die Latte ist aber bewusst niedriger als am Desktop: **Handy = Querformat, alle
Handy-Fälle der Harness grün, keine tote Klickfläche.** Kein Versprechen, dass
man per Daumen gegen Maus-Spieler gewinnt.

Wichtig zur Einordnung: „niedriger als Desktop" heißt **nicht** „nebenbei".
Handy steht in der Reihenfolge vor den Modi – „muss natürlich mit dabei sein"
(Sam, 11.08.). Ein Spiel, das auf dem Handy hakt, fühlt sich nicht fertig an,
egal wie viele Modi es hat.

### 3. Wie viel größer? → 9000 × 6000 bei 80 Spielern. Und: die Karte wächst nur zusammen mit der Spielerzahl.

Das ist die wichtigste Entscheidung, weil „größere Karte" allein das Spiel
**schlechter** macht: gleiche 40 Spieler auf doppelter Fläche heißt leere
Karte und lange Wege ohne Gegner.

Die feste Größe ist deshalb nicht die Kantenlänge, sondern die **Dichte**:

> **rund 600.000 px² pro Spieler.**
> Vorher: 6000 × 4000 ÷ 40 = 600.000. Heute: 9000 × 6000 ÷ 80 = 675.000.
> `packages/shared/src/index.test.ts` hält den Korridor 450.000–750.000 fest.

„Größere Karte" heißt damit automatisch „mehr Spieler". Und genau das war die
Frage, ob das ohne Lags geht. Gemessen, nicht geschätzt:

| Arena | Spieler | Schalter | KB/s pro Spieler | Tick p95 | Budget |
|---|---|---|---|---|---|
| 6000 × 4000 | 32 | aus (vorher) | **229,6** | 2,2 ms | 7 % |
| 6000 × 4000 | 32 | `SNAPSHOT_DELTAS` | 142,1 | – | – |
| 6000 × 4000 | 32 | beide | 118,8 | 2,6 ms | 7 % |
| 9000 × 6000 | 80 | aus | 281,4 | 9,4 ms | 24 % |
| **9000 × 6000** | **80** | **beide (heute)** | **138,8** | 10,4 ms | 34 % |

Ergebnis: Eine **2,25-fach größere Karte mit doppelt so vielen Spielern kostet
pro Kopf weniger** als die alte kleine Arena – 138,8 gegen 229,6 KB/s.

**Nachgemessen am Stand mit allen drei Modi** (11.08., je 80 Clients, 110 s):

| Modus | KB/s pro Spieler | Tick p95 | Budget | Ticks über 25 ms |
|---|---|---|---|---|
| Maze | 142,7 | 7,6 ms | 30 % | 2 |
| Battle Royale | 144,2 | 7,6 ms | 18 % | 5 |

Zwei Dinge stehen darin, die man sonst falsch läse:

* **Royale kostet praktisch nichts extra** – 1 % mehr Bandbreite für Zone,
  Rundenstand und Zonenschaden. Die Schicht rechnet nur im eigenen Modus und
  hängt genau ein Feld an den Snapshot.
* Das niedrigere **Budget** im Royale ist kein Vorteil, sondern die Regel des
  Modus: Wer ausscheidet, wird nicht mehr simuliert. Die Arena wird im Lauf der
  Runde billiger – am Ende steht ein Server, der fast nichts mehr tut.

Die Ausreißer (bis 47 ms in einem Tick) liegen **nicht** an den Modi, sondern
am Lasttest selbst: Sie fallen in den Join-Sturm, wenn 80 Verbindungen in sechs
Sekunden aufschlagen, und in den Abbau am Ende. Im Betrieb dazwischen bleibt
p95 bei 7,6 ms. Nachgestellt mit einem Zeitraffer-Lauf (`ROYALE_SPEED=20`, also
zehn Rundenneustarts statt einem): Maximum 26 ms – der Neustart einer Runde mit
80 Spielern ist es also auch nicht.

Zwei Dinge, die man beim Nachmessen wissen muss, sonst erschrickt man:

* **Kurze Läufe messen den Einschwingvorgang, nicht den Betrieb.** Ein 30-s-Lauf
  zeigt 166 KB/s, ein 110-s-Lauf 138,8. Der Unterschied sind die Bots: Der
  Direktor baut sie ab, sobald Menschen kommen, aber nur einzeln und nur, wenn
  gerade keiner zusieht.
* **Der Abbau lässt sich nicht beschleunigen.** Ein Aufholmechanismus (mehrere
  Abgänge je Fenster) brachte gemessen 6 statt 7 Bots nach 95 s – Rauschen. Der
  Engpass ist die Regel „niemand verschwindet vor den Augen eines Spielers":
  Bei voller Arena ist schlicht kein Bot unbeobachtet. Der Mechanismus wurde
  wieder entfernt, statt als wirkungslose Stellschraube stehenzubleiben.

Die Bedingung dafür sind zwei Schalter, die **fertig und getestet im Repo
liegen und trotzdem aus sind**: `SNAPSHOT_DELTAS` und `SHORT_NET_IDS`. Der
Client kann beide seit Langem (`snapshot-hydrator.ts`, 20 Tests); ein echter
Browser joint, spielt und rendert damit sauber – Wände, Formen, Killfeed,
Bestenliste mit Klasse und Level.

Ohne die Schalter ist die große Karte mit 281,4 KB/s pro Spieler das teuerste
Szenario überhaupt. **Die Schalter sind die Voraussetzung, nicht die Kür.**

---

## Was schon steht

- 65 Klassen in 8 Familien. „Nicht nur langweilige Kugeln" war Sams Wunsch –
  hier steht, warum das stimmt, statt es zu behaupten.

  Entscheidend ist **nicht** die Bonushöhe; die ist bei fünf der acht Familien
  ein Statfaktor. Entscheidend ist die **Bedingung, unter der sich die Leiste
  füllt** – denn die bestimmt, wie man spielt:

  | Familie | Leiste füllt sich durch | erzwingt | Sockel (0 Punkte) | Vollausbau (10 Punkte) |
  |---|---|---|---|---|
  | RAPID | fahren **und** feuern | ständig in Bewegung | Nachladen −8 % | −35,2 % |
  | SIEGE | **stillstehen** | Position beziehen | Schaden +16 % | +59 % (Reichweite im selben Verhältnis) |
  | PRECISION | Feuertaste **halten** | Timing statt Klickrate | 40 % des Ladebonus | voller Ladebonus (Schaden ×2,2, Größe +40 %) |
  | IMPACT | schnell fahren | rammen | Rammschaden +50 % | +202 % |
  | SPECTER | ungesehen bleiben | flankieren | Hinterhalt +12 % | +45,5 % |
  | TEMPEST | jede Salve heizt | Dauerfeuer aushalten | Schaden +14 % | +52 % |
  | CONTROL | Nachschub-Konto | Flotte verwalten | Drohnen-Leben +45 % | (Statfaktor, ohne Punktepfad) |
  | AEGIS | **erlittener** Schaden | Treffer einstecken *wollen* | Entladung 12 | 44 (Radius 240, Rüstung 18 %) |

  **Wichtig, und bis zum 12.08. stand hier das Falsche:** Seit KL4 wird die
  Signature *bezahlt*. `FAMILY_UPGRADES_ENABLED` ist Opt-out, läuft also – und
  damit rechnen die Schichten nicht mehr mit einem Festwert, sondern mit
  Sockel + Punkten aus `signaturePower`. In dieser Tabelle standen bis dahin
  die alten Festwerte vor KL4 (RAPID −25 %, SIEGE +45 %/+50 %, IMPACT +150 %,
  SPECTER +35 %, TEMPEST +40 %, AEGIS 34) – Werte, die ein Tank ohne Punkte
  **nicht** erreicht; sie liegen bei rund 6 bis 7 von 10 Punkten. Wer die
  Familien mit der alten Tabelle in der Hand ausprobiert, misst etwas anderes,
  als das Dokument verspricht, und schreibt das Ergebnis der Balance zu statt
  den Punkten. Die Zahlen hier stammen aus `FAMILY_SCALING`
  (`apps/server/src/family-upgrades.ts`), nicht aus der Erinnerung.

  RAPID und SIEGE sind im Code ausdrücklich als Gegenteile gebaut – „wer steht,
  wird zur Kanone" gegen „wer fährt, lädt nach". Zwei Familien, die sich auf
  demselben Feld gegenseitig bestrafen, ergeben eine echte Positionsentscheidung
  statt zweier unabhängiger Buffs. AEGIS ist die einzige Familie, die getroffen
  werden *will*.

  Nachzulesen mit `npm run balance` – der Report zeigt die Tabelle inzwischen
  für alle acht Familien. Vorher standen dort nur RAPID, IMPACT und PRECISION
  ausführlich, und er schwieg über die fünf neueren: ausgerechnet dort, wo das
  Ziel am konkretesten ist.
- Wechselnde Ziele in der Arena: Elite Shapes, Core Surge, Bounty auf den
  dominanten Spieler.
- Serverautorität sauber durchgezogen, Client schickt nur Eingaben.
- Admin-Portal, das beantworten kann, ob Spieler wiederkommen.

## Eine Fehlerklasse, die zweimal zugeschlagen hat

Der Server ist eine Basisklasse plus eine Kette von `tuneX(game)`-Schichten. Die
Schichten dürfen Methoden **ersetzen** – und eine, die ersetzt statt umschließt,
verschluckt still jede Regel, die in der Basis steht.

`tuneCombatScaling` ersetzt `applyUpgrade`, `chooseClass`, `respawn` und
`stepPlayer`. Zwei Regeln sind darin verlorengegangen, beide monatelang:

| Regel in der Basis | Was tatsächlich lief |
|---|---|
| `upgradeAppliesTo` – kein Punkt für tote Slots | gar nicht geprüft; ein Controller konnte Kugeltempo kaufen |
| `respawnClassFrom` – nach dem Tod zurück auf `core` | `classAvailableAtLevel` – also **genau Sams beklagtes Verhalten** |

Der zweite ist der bittere: Der Kommentar in der Basis zitiert Sams Befund vom
07.08. wörtlich, der Fix stand da – und lief nie. Der Test dazu prüfte
`respawnClassFrom` **direkt** statt den Weg durch die Kette und blieb grün,
während das Spiel das Gegenteil tat.

**Die Lehre steht jetzt in den Tests:** Beide werden durch die echte
Produktionskette geprüft, nicht gegen die Basis, und beide sind per Sabotage
gegengeprüft. Wer eine Regel nur an der Hilfsfunktion testet, misst nicht, ob
sie jemand aufruft.

**Und der Rest der Kette ist durchgesehen – diesmal gezählt statt geschätzt.**

Hier stand bis zum 12.08. eine Entwarnung, die falsch war: „Von rund vierzig
Methoden-Ersetzungen ist `tuneCombatScaling` die einzige, die das Original
weder bindet noch aufruft." Nachgezählt über alle Nicht-Test-Dateien in
`apps/server/src` sind es **113 Zuweisungen an Methoden der Basis, davon 13
echte Ersetzungen ohne jede Bindung ans Original**, verteilt auf **fünf**
Schichten:

| Schicht | Ersetzt ohne Original |
|---|---|
| `combat-tuning.ts` | `applyUpgrade`, `respawn`, `chooseClass`, `stepPlayer`, `bodyDamageOf` |
| `simulation-hardening.ts` | `resolvePlayerCollisions`, `resolveShapeBodyCollisions`, `stepProjectiles`, `resolveProjectileCollisions` |
| `drone-tuning.ts` | `spawnDrone`, `stepDrones` |
| `bot-brain.ts` | `updateBot` |
| `family-upgrades.ts` | `spendBotPoints` |

(`signature-precision.ts` sieht in derselben Zählung aus wie eine sechste,
ist aber keine: Es tauscht `fire` nur für die Dauer eines Schritts aus und
setzt es im `finally` zurück – ein Abfangen, keine Ersetzung.)

Die falsche Entwarnung war teurer als der Fehler, den sie deckte: Weil die
Pflichtzeile nur an der einen bekannten Schicht hing, blieben zwei weitere
Befunde derselben Klasse liegen – der Rammschaden rechnete in `game.ts` mit
einer zweiten Kurve (`+13 %` statt `+10 %`; unerreichbar, weil hardening die
Methode ersetzt, aber eben unbemerkt auseinandergelaufen), und drei
Drohnenklassen liefen über einen stillen Rückfall mit fremden Werten.

`tuneCombatScaling` bleibt einzeln geprüft:

| Methode | Ergebnis |
|---|---|
| `applyUpgrade` | Regel verloren → behoben |
| `respawn` | Regel verloren → behoben |
| `chooseClass` | getreue Spiegelung der Basis ✅ |
| `stepPlayer` | getreue Obermenge (plus Chill-Regeneration) ✅ |
| `bodyDamageOf` | neue Naht: eine Kurve statt drei ✅ |

Und `hardenSimulation` genauso:

| Methode | Ergebnis |
|---|---|
| `resolvePlayerCollisions` | getreue Übersetzung; `dt × 3,2` ist bei 40 Hz exakt die 0,08 der Basis ✅ |
| `resolveShapeBodyCollisions` | dieselbe Übersetzung, dieselbe Konstante ✅ |
| `stepProjectiles` / `resolveProjectileCollisions` | Obermenge (Integrität, Durchschlag) ✅ |

Die Pflicht steht als Kopfkommentar an der Schicht selbst: Wer eine weitere
Methode ersetzt, vergleicht sie vorher Zeile für Zeile mit der Basis. Sie gilt
für alle sechs, nicht nur für die, die man schon kennt.

Noch offen und bewusst nicht angefasst: Basis und Schicht behalten nach dem Tod
unterschiedlich viel Punktestand (0,45 gegen 0,5). Gelaufen ist immer 0,5. Das
zu ändern wäre eine Balance-Entscheidung, keine Fehlerbehebung – dafür braucht
es Sam.

## Was fehlt

1. ~~Die zwei Bandbreiten-Schalter anschalten.~~ ✅ **erledigt** – beide sind
   jetzt Opt-out statt Opt-in, gesichert durch `npm run wire-probe`.
2. ~~Karte und Spielerzahl hochziehen.~~ ✅ **erledigt** – 9000 × 6000 bei
   80 Spielern, 562 Formen. Dazu musste die Bot-Population mitwachsen (8 → 18):
   Der Direktor hält bei *einem* Menschen die Arena belebt, und acht Bots auf
   54 Mio px² wären eine gespenstisch leere Karte gewesen – ausgerechnet beim
   ersten Eindruck eines neuen Spielers. Maßgeblich ist auch hier nicht die
   Zahl, sondern der Platz je Bot: 3,0 Mio px², exakt der Wert, den Sam auf der
   alten Karte freigegeben hatte.

   Drei Dinge wären dabei fast still verlorengegangen, beide beim ersten
   Eindruck am teuersten:

   * **Die Arena-Events wären halb verschwunden.** Sie lagen fest in der
     Kartenmitte mit festem Radius: auf der alten Karte 5 % der Fläche und nie
     mehr als 3600 Einheiten entfernt, auf der neuen nur noch 2,2 % und bis zu
     5400 Einheiten – bei Tempo 300 also achtzehn Sekunden Anfahrt für ein
     Event, das vierzig dauert. Die Kartenecken wären dauerhaft belanglos
     gewesen. Events suchen sich jetzt einen freien Platz in Reichweite eines
     Spielers; der Radius bleibt, also stehen bei gleicher Dichte gleich viele
     Leute drin wie vorher.

   * **Das Labyrinth wurde offener.** Die Bahn-*Anzahlen* standen fest (4 Reihen,
     6 Spalten), also wurden die Bahnen größer statt zahlreicher – Deckung fiel
     von 4,4 % auf 3,5 %. Die Design-Einheit ist die Bahn*breite*, nicht ihre
     Anzahl; jetzt wächst die Zahl mit (1,65 Wände je Mio px² gegen vorher 1,67).
   * **Zwei Tests fielen über die Karte statt über das Verhalten.** Beide
     benutzten Festpunkte, die auf der alten Karte in einer Wand lagen bzw.
     freies Feld waren. Einer wäre still wirkungslos geworden, statt rot – er
     hätte eine Kollision geprüft, die gar nicht mehr stattfindet. Beide suchen
     ihre Position jetzt, statt sie zu raten.

   **Kartengröße geht nicht per Railway-Variable.** Der Client liest `GAME.worldWidth`
   direkt (Hintergrundraster in `renderer.ts`, Grenzen in `prediction.ts`). Ein
   Env-Schalter nur auf dem Server würde beide Seiten auseinanderlaufen lassen –
   Raster und Vorhersage in der falschen Größe. `shared` bleibt die eine
   Wahrheit; die Änderung ist ein Deploy, kein Regler.

   Abgesichert ist die Regel durch den Test „haelt die Arena-Dichte im
   vereinbarten Korridor": Wer die Karte vergrößert, ohne `maxPlayers`
   mitzuziehen, bekommt einen roten Test statt einer leeren Arena.
3. **Handy richtig hinbekommen.** Kein Nachklapp, sondern gleichrangig mit der
   Karte – „muss natürlich mit dabei sein" (Sam, 11.08.).

   `npm run touch-probe:all` beweist auf **allen fünf** Handy-Querformaten der
   Matrix (667 × 375 bis 932 × 430), dass sich wirklich spielen lässt: beide
   Sticks springen an, zwei Daumen gleichzeitig gehen, und der Tank bewegt sich.
   Bisher prüfte **nichts** das: Die Layout-Harness sagt nur, ob die Sticks
   sitzen. Mit lahmgelegten Sticks bleibt sie grün, während das Spiel
   unspielbar ist – genau dieser Fall ist abgedeckt und per Sabotage
   gegengeprüft (alle vier Befunde melden rot).

   Ein Wort zur Verlässlichkeit, weil die Probe daran beinahe gescheitert wäre:
   Der Onboarding-Schritt „Beweg dich" verschwindet nach 14 s **auch ohne**
   Bewegung. Die Probe grenzte das anfangs über die Wanduhr ab – und meldete
   unter Last zwei von fünf Formaten rot, die einzeln grün waren. Gemessen hat
   sie die Rechenlast: Ein einziges Touch-Event kostet in diesem Container rund
   500 ms. Gewertet wird deshalb die **Arena-Uhr** des Onboardings; die kennt
   weder Ladezeit noch Ereignis-Latenz. Gemessene Werte liegen bei 6,0–7,8 s
   gegen eine Grenze von 12 s.

   Was noch offen ist: ob sich das Zielen per Daumen auch *gut* anfühlt – das
   ist keine Messung, das braucht Sams Daumen.
4. ~~**FFA als zweiter Modus**~~ ✅ **erledigt** – `ARENA_MODE=ffa`. Der Schnitt
   blieb klein, weil `WALLS` außerhalb von `world.ts` nirgends direkt gelesen
   wird: Kollision, Sichtlinie und Snapshot lesen alle `activeWalls`, und das
   ist in FFA leer. Fracture fliegt dort aus der Event-Rotation – ohne Wände
   wäre es ein angekündigtes Ereignis, bei dem nichts passiert.
5. ~~**Battle Royale als dritter Modus**~~ ✅ **erledigt** – `ARENA_MODE=royale`.
   Zone in Stufen (schrumpfen und halten im Wechsel, Schaden steigt je Stufe,
   wanderndes Zentrum), Ausscheiden statt Respawn, Rundenende beim letzten
   Lebenden, Pause, dann alles auf Anfang.

   Zwei Dinge daran sind mehr wert als der Zonencode selbst:

   * **Ausscheiden ist keine zweite Respawn-Regel.** Die Schicht schiebt
     `autoRespawnAt` und `canRespawnAt` auf Unendlich, statt die Regeln der
     Basis nachzubauen – genau dieser Nachbau hat hier schon zweimal eine Regel
     verschluckt (siehe „Eine Fehlerklasse, die zweimal zugeschlagen hat").
   * **Der Bildschirm sagt, wie die Runde steht.** Wie viele leben noch, wann
     wird es enger, wer hat gewonnen, wann geht es weiter. Ohne das war Royale
     eine Karte mit tödlichem Rand: Der Server wusste alles davon, der Spieler
     nichts. Der handfeste Beweis war der Death-Screen – er rechnete aus der
     Unendlich-Zeile oben „Respawn verfügbar in Infinitys" und bot einen Knopf
     an, der nie freigeht, während **alle** Servertests grün blieben.

   Nachprüfbar mit `npm run royale-probe`: eine ganze Runde im echten Browser,
   gewertet wird das Sichtbare, nicht der Serverzustand.

   **Zwei Regeln kamen aus der Codeanalyse dazu, beide über Fairness:**

   * *„Alles auf Anfang" galt für alle außer dem Sieger.* `neueRunde` hat nur
     die Toten durch den Wiedereinstieg geschickt; der Überlebende lief durch
     keinen Reset. Nachgestellt mit zwei Level-40-Tanks: In Runde 2 stand ein
     voll ausgebauter Level-41-Gatling gegen ein Feld aus Level-20-Core-Tanks
     – und mit jedem Sieg verstärkt sich das. Jetzt geht jeder denselben Weg,
     halbes Level und Klasse zurück, wie nach einem Tod.
   * *Wer mitten in der Runde dazukam, war chancenlos tot.* Die zehn festen
     Spawnpunkte liegen an Rand und Ecken, die Zone steht ab Stufe 5 in der
     Mitte: gemessen 4263 Einheiten draußen und tot nach 5,7 s, ab Stufe 7
     rechnerisch nicht mehr zu schaffen. Neuzugänge starten jetzt am inneren
     Zonenrand – im Spiel, aber nicht mitten in der Entscheidung.

   Offen und ausdrücklich Sams Entscheidung, keine Fehlerbehebung: In der
   Rundenpause hält die **Zone** an, damit der Sieger seinen Moment hat – Formen
   und Bots tun das nicht. Ein angeschlagener Sieger kann in der Pause noch an
   einer Form sterben (in der Probe genau einmal passiert). Ob die Pause
   komplett unverwundbar sein soll, ist eine Gefühlsfrage, keine Regelfrage.

### Warum die Reihenfolge so ist

**Modi kommen zuletzt** – ausdrücklich: „Modi erst wenn alles sitzt" (Sam,
11.08.). Ein zweiter Modus auf einem wackeligen Fundament verdoppelt nur die
Zahl der Stellen, an denen es hakt. Erst sitzt das eine Spiel, dann kommt das
zweite dazu.

Ohne Schritt 1 hätte Schritt 2 das Spiel *verschlechtert*: die große Arena ohne
Deltas war mit 281,4 KB/s pro Spieler das teuerste Szenario der ganzen Messung.
Erst mit den Schaltern wurde „größer" billiger als „klein von vorher".

Und wenn die Modi dann dran sind, sind sie froh über den Platz: FFA ohne Wände
braucht Sichtlinien, die sich lohnen, und eine Battle-Royale-Zone, die auf
6000 × 4000 schrumpft, ist nach zwei Minuten ein Faustkampf.

### Spielerzahl: 80 ist ein Zwischenstand, kein Endwert

„Wenns iwann voll is sind 40 schon wenig – aber das können wir ja dann
skalieren" (Sam, 11.08.). Genau so ist es gebaut: Die Dichte-Regel (600.000 px²
je Spieler) macht das Hochziehen zu einer Rechnung statt zu einer Diskussion.
Der nächste Schritt wäre 12000 × 8000 bei 160 Spielern – noch nicht gemessen,
und der Tick läge dann grob bei 70 % Auslastung statt 34 %. Vorher messen.

## Wie man das nachmisst

```bash
# Bandbreite und Tick-Budget unter Last.
#
# Die beiden RATE_LIMIT-Variablen sind PFLICHT, nicht Kosmetik: Der Server
# erlaubt fuenf gleichzeitige Verbindungen je IP, und ein Lasttest kommt immer
# von EINER IP. Ohne sie messen 5 von 80 Clients -- und liefern mit rund
# 96 KB/s ein Ergebnis, das besser aussieht als die Wahrheit. (Der Lasttest
# sagt das inzwischen selbst: "MESSUNG UNVOLLSTAENDIG" plus Erklaerung.)
#
# Mindestens 100 s laufen lassen: Kuerzere Laeufe messen den Einschwingvorgang
# (der Direktor baut seine Bots erst ab) und zeigen rund 20 % zu viel.
RATE_LIMIT_CONNECTIONS_PER_IP=100 RATE_LIMIT_JOINS_PER_MINUTE=200 \
  node apps/server/dist/index.js &
npm run loadtest -- --url ws://127.0.0.1:2567 --clients 80 --duration 110 --ramp 6 --json
# Danach das Tick-Budget abholen -- es steht im Server, nicht im Lasttest:
curl -s http://127.0.0.1:2567/health | grep -o '"tick":{[^}]*}'
# Dasselbe fuer den Royale-Modus: ARENA_MODE=royale vor den Serverstart.

# Leitung Server→Client (braucht zusaetzlich: npx vite --port 5199 apps/client)
npm run wire-probe

# Laesst sich auf dem Handy wirklich spielen? (gleiche Voraussetzung)
npm run touch-probe:all                     # alle fuenf Handy-Querformate
npm run touch-probe                         # nur eines (Standard 844x390)
BREITE=667 HOEHE=375 npm run touch-probe    # iPhone SE quer

# Traegt die Fortschrittsschleife? Farmt bis Stufe 5, waehlt eine Klasse,
# vergibt einen Punkt -- und prueft jedes Mal das sichtbare Ergebnis.
npm run progress-probe

# Wie fuehlen sich die ersten Minuten an? Spielt wie jemand, der nichts weiss
# (Dauerfeuer, alle 2,5 s eine andere Richtung, RESPAWN sofort, erste
# Klassenkarte nehmen) und berichtet, was ein Mensch danach erzaehlen wuerde:
# hoechstes Level, Tode, Zeit bis Level 5 -- und ob ueberhaupt etwas getroffen
# wurde. Durchgefallen ist nur ein KAPUTTER Anfang (kein Beitritt, kein
# Aufstieg, kein Wiedereinstieg); Schwierigkeit ist Sams Entscheidung.
MINUTEN=5 LAEUFE=3 npm run first-run-probe

# ALLE Proben hintereinander, jede mit ihrem eigenen richtig konfigurierten
# Server -- ein Befehl statt der Wand darunter:
npm run proben                # ohne die langen (Touch, Erstlauf, Layout)
npm run proben -- --alles     # mit ihnen, rund 40 Minuten
npm run proben -- --nur duo   # einzeln nachfahren

# Traegt der Weg zwischen ZWEI Menschen? Jede andere Probe spielt allein.
# Leere FFA-Arena, damit die Messung den Spielern gilt und nicht den Bots:
# sehen, treffen, sterben, richtig zugeordnet.
ARENA_MODE=ffa BOT_COUNT=0 ARENA_DIRECTOR_ENABLED=false \
  PORT=2652 HOST=127.0.0.1 node apps/server/dist/index.js &
URL=http://127.0.0.1:2652 npm run duo-probe

# Bekommt man auf der Leitung den Modus, den man konfiguriert hat?
# Haengt sich als echter Client an einen laufenden Server (kein Browser) und
# prueft je Modus dessen Versprechen: maze Waende, ffa KEINE Wand, royale die
# Zone in jedem Snapshot. Dazu: welcome und /health nennen denselben Modus.
for MODUS in maze ffa royale; do
  ARENA_MODE=$MODUS PORT=2630 node apps/server/dist/index.js &
  sleep 5 && URL=http://127.0.0.1:2630 npm run mode-probe
  kill %1
done

# Traegt eine ganze Royale-Runde? Zone sehen, draussen bluten, ausscheiden,
# Sieger, neue Runde -- gewertet wird, was auf dem Schirm steht.
# Braucht einen eigenen Server: Zeitraffer und ein Bot.
#
# Der Direktor laeuft dabei MIT -- so wie in Produktion. Bis zum 12.08. stand
# hier `ARENA_DIRECTOR_ENABLED=false`, und genau diese Ausnahme hat den Befund
# gedeckt, dass der Direktor mitten in der Runde Bots nachschob: Die Probe
# konnte den Fall gar nicht sehen, der in Produktion lief. Seit der Sperre
# (`arena-director.ts`) laeuft sie mit der echten Konfiguration gruen.
ARENA_MODE=royale ROYALE_SPEED=20 BOT_COUNT=1 \
  PORT=2599 node apps/server/dist/index.js &
URL=http://127.0.0.1:2599 npm run royale-probe

# UI auf 17 echten Geraetegroessen.
# Nichts Schweres nebenher laufen lassen: Unter Last laufen einzelne Faelle in
# einen Timeout und melden rot, ohne dass am Layout etwas falsch waere.
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/ui-layout-check.mjs
```

---

## Was das Ziel *nicht* ist

Damit es abschließbar bleibt: keine Team-Arena, keine Boss-Runden, kein 2v2,
kein Ranked, keine Clans, keine Skins, kein Handy-Hochformat. Alles davon kann
gut sein – aber nach 1.0.

(Battle Royale stand hier zwischenzeitlich auch. Sam hat es am 11.08. bewusst
**ins** Ziel geholt und stattdessen die Team-Arena herausgenommen.)
