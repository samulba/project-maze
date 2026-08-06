# 13 – N2: Client-Prediction + KL4-UI

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `de7546c` · **Status: OFFEN – wartet auf Merge**

Der Client rechnet die eigene Bewegung jetzt selbst, statt auf die
Serverantwort zu warten. Dazu die beiden Zulieferungen aus dem Auftrag: `Digit0`
lebt, und die zwei Familien-Upgrade-Plätze sind im Client fertig – sie
erscheinen von selbst, sobald der Server sie führt.

**Alles hinter einem Schalter, Standard aus** (Regel 3). Der Schalter sitzt im
Startscreen unter „Sound & Loadout" und nicht in einer ENV-Variable: So lassen
sich beide Zustände ohne Deploy direkt hintereinander vergleichen, und genau das
braucht eine Beurteilung, die am Ende „fühlt sich besser an" lautet.

## N2 – Was gebaut ist

`prediction.ts` ist die Rechnung aus `docs/CLIENT_PREDICTION.md`, Zeile für
Zeile: `clampMagnitude` (kürzen, nicht normieren), vektorielle
Geschwindigkeitsannäherung ohne eigenen Reibungsterm, `moveCircle` mit
Substeps, X vor Y, genullter Achse. `ACCELERATION_SCALE` kommt aus
`packages/shared`, nicht aus einer zweiten Zahl im Client. Dazu Puffer,
Quittung, Nachrechnen und die weiche Korrektur.

Drei Entscheidungen, die nicht wörtlich in der Doku stehen:

- **Der sichtbare Punkt springt bei der Korrektur nicht.** Was vor dem Snapshot
  zu sehen war, wird zum Startwert des Restfehlers und läuft von dort mit
  τ = 45 ms aus – nach 150 ms ist weniger als eine halbe Einheit übrig. Ohne
  das wäre jeder Snapshot ein kleiner Ruck, auch wenn die Rechnung stimmt.
- **Zwischen zwei Eingaben wird linear weitergeschoben**, gedeckelt auf einen
  Tick. Eingaben gehen mit 40 Hz raus, gezeichnet wird mit 60+; ohne den
  Zwischenschritt sähe man die 40 Hz. Der Deckel verhindert, dass ein Tab im
  Hintergrund in die Wand extrapoliert.
- **Beim Zuschauen bleibt es bei der Interpolation.** Die eigene Eingabe sagt
  nichts über den beobachteten Tank aus.

Momentum und Wucht (Doku, Abschnitte 6 und 7) werden mitgerechnet: Aufbau an
`primary` nur bei Rapid, `moving` aus der tatsächlichen Geschwindigkeit nach dem
Tick, ungerundet. Der Kontaktverbrauch der Wucht wird bewusst **nicht**
vorhergesagt – ob ein Kontakt Schaden gemacht hat, entscheidet der Server.

## Nachgewiesen

### Die Rechnung gegen den echten Server

Eine Probe verbindet sich als echter Client per WebSocket (`SNAPSHOT_DELTAS`,
`SHORT_NET_IDS`, beide Signature-Flags an), fährt ein Muster aus Beschleunigen,
Bremsen, Drehen und Wandkontakt und misst zwei getrennte Größen:

- **Versatz** – die Position, die der Client nach Eingabe *N* vorhergesagt hat,
  gegen die Serverposition im Snapshot, der genau *N* quittiert. Das ist der
  **Rechenfehler**; er muss unabhängig von der Latenz klein bleiben.
- **Vorsprung** – die aktuelle Vorhersage gegen die zuletzt empfangene
  Serverposition. Das ist der **Rückstand, den die alte Darstellung hatte** –
  also das, was die Vorhersage einspart.

Je 25 s, ~750 Snapshots, Werte in Welteinheiten (der Tank ist 44 breit):

| Laufzeit | Versatz Median | Versatz p99 | Versatz max | **Vorsprung Median** | Hartkorrekturen |
|---|---|---|---|---|---|
| lokal (RTT ≈ 0) | 3,72 | 10,07 | 11,92 | **9,27** | 0 |
| RTT 60 ms | 3,09 | 10,03 | 15,48 | **23,81** | 0 |
| RTT 120 ms | 2,75 | 15,37 | 21,75 | **38,69** | 0 |

Genau das erwartete Bild: Der **Rechenfehler bleibt bei ~3 Einheiten,
unabhängig von der Latenz** – das ist die eine Tick-Breite, die die Doku als
prinzipbedingt nennt (der Server arbeitet keine Warteschlange ab). Der
**Vorsprung wächst mit der Laufzeit**, weil genau das der Rückstand ist, den die
Vorhersage wegnimmt: bei 120 ms RTT fast eine ganze Tanklänge.

**Keine einzige Hartkorrektur** in 75 s Spiel – die Vorhersage lag nie über der
60-Einheiten-Schwelle. Der Eingabepuffer blieb bei 1 / 3 / 6 offenen Einträgen,
passend zur jeweiligen Laufzeit.

### Misst die Messung überhaupt etwas?

Gegenprobe mit halb ausgelenktem Stick, einmal richtig gerechnet und einmal mit
dem klassischen Fehler (Client normiert, Server kürzt nur):

| | Versatz Median | p99 |
|---|---|---|
| richtig gekürzt | **1,99** | 5,21 |
| absichtlich normiert | **9,61** | 14,44 |

Faktor 4,8. Ein falscher Faktor in der Integration fällt in dieser Messung also
auf – sie ist nicht bloß eine Zahl, die immer klein aussieht.

### Im Browser

Chromium, 1280×720, Software-GL:

| | ohne gespeicherte Wahl | nach Klick | nach Neuladen |
|---|---|---|---|
| Schalter | **aus** | `project-maze-prediction = on` | **an** |

Mit eingeschalteter Vorhersage spielt sich die Runde unverändert: Verbindung
`MAZERS ALPHA`, HUD, Leben, Bewegung, Tod und Respawn ohne Auffälligkeit, keine
Konsolenfehler aus dem Client. (Zwei `404` im Netzwerkprotokoll gehen auf
`/leaderboard` – lokal ohne Persistenz, unverändert zu vorher.)

## KL4-UI – die zwei Zulieferungen

**`Digit0`** bildet auf Index 9 ab. Solange es weniger als zehn Werte gibt,
greift der Zugriff ins Leere und es passiert schlicht nichts.

**Die beiden Familien-Slots** stehen als eigener Platz im Upgrade-Panel, mit
Taste **9** und **0**. Sie erscheinen **erst, wenn der Server sie selbst im
Snapshot führt** (`upgrades.signatureRate` vorhanden) – dieselbe Zurückhaltung
wie beim `tier`-Feld: Ein Knopf, dessen Nachricht der Server mit einem Fehler
verwirft, ist schlimmer als gar keiner. Heute sind sie also unsichtbar; nach dem
Merge von 01s Shared-Änderung und 02s Serverseite tauchen sie ohne weiteren
Client-Eingriff auf.

Im Browser mit untergeschobenen Slots geprüft:

| Klasse | Taste 9 | Taste 0 | Zustand |
|---|---|---|---|
| Core | Signature-Tempo | Signature-Stärke | **gesperrt**, „Erst mit einer Familie ab Level 10" |
| Storm (rapid) | **Momentum-Aufbau** | **Momentum-Maximum** | frei |

Der gesperrte Zustand ist gestrichelt und matt statt bunt – er soll erklären,
nicht werben. Sichtbar bleibt er trotzdem: Wer auf Level 9 sieht, dass da noch
etwas kommt, versteht die Familienwahl besser als jemand, dem zwei Knöpfe
plötzlich zuwachsen.

## Geänderte Dateien

**Neu:** `prediction.ts(+test)`, `prediction-panel.ts`, `family-upgrades.ts(+test)`
**Geändert:** `main.ts`, `renderer.ts`, `ui.ts`, `input.ts`, `start.css`, `controls.css`

`packages/shared` und `apps/server` unangetastet.

## Tests

`npm run check` grün: 45 Dateien, 606 Tests (48 neu), Build in Ordnung.

## Von 01 gebraucht

1. **Merge.** Kein Flag, keine ENV-Variable – der Schalter ist im Client.
2. **Entscheidung: Standard umlegen?** Die Vorhersage ist heute aus. Ob sie
   default-an geht, ist Sams Sache; der Vergleich lässt sich im Startscreen mit
   einem Klick machen, ohne Deploy.
3. **Zwei Zahlengruppen nach `packages/shared`** – dieselbe Begründung wie
   seinerzeit bei `ACCELERATION_SCALE`, dass ein zweiter Zahlenwert im Client
   bei der nächsten Balance-Runde still auseinanderläuft. Betroffen sind die
   Raten, die der Client für Momentum und Wucht spiegeln muss:

   ```ts
   // packages/shared/src/index.ts (oder gameplay.ts)
   /** Aufbau- und Abbauraten der Familien-Signature. Server und Client rechnen
    *  dieselbe Kurve – deshalb steht sie an genau einer Stelle. */
   export const SIGNATURE_RATES = {
     moveThreshold: 0.45,
     buildPerSecond: 30,
     decayPerSecond: 50,
     holdDecayPerSecond: 10,
     maximum: 100
   } as const;
   ```

   Server: `DEFAULT_MOMENTUM`/`DEFAULT_WUCHT` beziehen ihre gleichnamigen Felder
   von dort. Client: `SIGNATURE_TUNING` in `prediction.ts` fällt ersatzlos weg.
   Solange das nicht passiert ist, sind es die einzigen abgeschriebenen Zahlen
   im Modul – ausdrücklich als solche markiert.
4. **KL4-Beschriftung, eine Rückfrage an 02** – siehe „Abweichungen", Punkt 1.
5. **Für 04, unverändert offen:** Das `tier`-Feld im Perf-Bericht ist
   serverseitig noch nicht erlaubt (`client-metrics.ts` prüft weiter nur
   `quality`). Der Client sendet es deshalb nicht. Sobald 04 das Feld zulässt,
   ziehe ich die zwei Zeilen nach.

## Abweichungen und Grenzen

1. **Impacts Beschriftung ist gedreht gegenüber dem Auftragstext.** Der Auftrag
   nennt „Wucht-Skalierung / Aufprall-Erholung", 02s Konzept legt
   `signatureRate` aufs Aufbautempo und `signaturePower` auf die Skalierung.
   Ich habe 01s Wörter genommen und sie auf die Slots von 02 gelegt:
   `signatureRate` = **Aufprall-Erholung** (wie schnell die Wucht nach einem Stoß
   wieder dasteht), `signaturePower` = **Wucht-Skalierung**. Umgekehrt stünde
   das Tempo-Wort auf dem Stärke-Slot. Wenn 02 es anders meint, ist es eine
   Zeile in `family-upgrades.ts`.
2. **Precision und Control bekommen keine Familienwörter**, wie im Auftrag
   vorgesehen: dort steht „Signature-Tempo" und „Signature-Stärke". Dieselbe
   Regel wie beim Signature-Balken – lieber namenlos als falsch benannt.
3. **Die Familien-Slots sind heute unsichtbar.** Sie hängen an einem Feld, das
   der Server noch nicht schickt. Belegt sind sie im Browser mit
   untergeschobenen Slots und als Funktionen im Unit-Test; im echten Spiel
   sichtbar werden sie erst nach 01 + 02.
4. **Kein Reaktionszeit-Messwert aus dem Browser.** Der eigene Tank steht
   bildschirmfest in der Mitte – was sich bewegt, ist der Untergrund. Eine
   Pixelmessung darauf wäre im Software-GL-Browser (3–4 fps) reines Rauschen,
   und lokal ist die Laufzeit ohnehin null. Der eingesparte Rückstand ist
   deshalb auf Socket-Ebene gemessen (Tabelle „Vorsprung"), nicht am Bild.
   **Das Gefühl auf echter Hardware und echter Leitung ist nicht ersetzt** – das
   ist der Teil, den nur Sam beurteilen kann.
5. **Fremdeinwirkung wird nicht vorhergesagt** und soll es auch nicht: Dash,
   Rückstoß, Repulse, Tank-gegen-Tank-Kollision. Sie kommen als Korrektur vom
   Server; über 60 Einheiten wird hart nachgezogen. In den Proben ist dieser
   Fall nie eingetreten, weil das Muster keine Module benutzt – belegt ist die
   Schwelle nur im Unit-Test.
6. **Der Wucht-Verbrauch im Kontakt fehlt in der Vorhersage.** Ob ein Kontakt
   Schaden gemacht hat, weiß nur der Server (Unverwundbarkeit, Anfängerschutz,
   wer wen zuerst trifft). Der Balken folgt dort dem Serverwert; bei
   Dauerkontakt kann er kurz zu hoch stehen, bis die nächste Korrektur kommt.
7. **Ein neuer Schalter im Startscreen ist eine UI-Ergänzung, keine
   Grundlook-Änderung.** Er benutzt die vorhandenen Theme-Variablen und die
   Schriftgrade der Zeile darüber, keine Festwerte. Der Screenshot des
   aufgeklappten Bereichs geht nach `docs/SCREENSHOT_PIPELINE.md` in den Chat,
   zusammen mit den beiden Upgrade-Panels (Core gesperrt / Storm frei) – falls
   Sam etwas anders haben will, ist es CSS, kein Umbau.
