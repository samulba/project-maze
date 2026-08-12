# 21 – Stand vom 12.08. (zweite Sitzung) und wie es weitergeht

| | |
| --- | --- |
| **Auftrag** | Sam: „erst nachmessen, dann anfassen" – die 79 Rohbefunde aus Bericht 19 |
| **Branch** | `claude/validate-bericht-19-findings-85aiaz` (Sitzungs-Vorgabe; main ist per Sams Freigabe „Ja, merge du" nachgezogen) |
| **Basis** | `3834b52` |
| **Tests** | `npm run check` grün – 77 Dateien, 1060 Tests |

**Nachtrag (nach Sams Entscheidungen per Rückfrage, spätabends):** Die zwei
defektartigen Bot-Befunde sind gefixt und per Gegenprobe bestätigt –
**75:** Rotation je Stil mit Versätzen (`bot-brain.ts`), jetzt 18 von 18
Archetypen verschieden, alle acht Familien im Bestand (Siege über den Kiter,
Aegis über den Brawler), Hunter erreicht Elite, Bau bleibt deterministisch
(messung-75). **79:** `holdsStill`-Markierung – tuneRapidBots respektiert
den gewollten Reparatur-Halt; im A/B-Mittel jetzt 7 Reparaturzyklen je
4 min mit der Schicht statt 0–1 (messung-79). Dazu der **ehrliche
Repulse-Text** (63): „Stößt Nahe kurz zurück und lenkt Projektile ab –
verschafft einen Moment Luft." Der Schalter blieb unangetastet.
**Prediction (64) bleibt aus** – Sam spielt erst selbst. Das
**Vorschlagspapier** zum restlichen Bot-Schwierigkeits-Paket liegt vor:
[`22-vorschlag-bot-schwierigkeit.md`](22-vorschlag-bot-schwierigkeit.md) –
sechs Vorschläge mit Gegenproben, in drei spielbaren Schnitten.
| **Status** | **Alle 79 Befunde geprüft**: 43 behoben, 2 verworfen (2, 74), Rest bestätigt-aber-offen – Bots/Balance/Content bei Sam |

Dieses Dokument ist der Einstieg für die nächste Sitzung. Der volle Bericht
mit allen Urteilen und Belegen ist
[`21-bericht-19-nachgemessen.md`](21-bericht-19-nachgemessen.md).

## 1. Was diese Sitzung getan hat

Acht Prüf-Agenten haben 51 der 79 Rohbefunde nach dem Schema der ersten
Analyse gegengeprüft (Zeile? andere Schicht? Absicht? erreichbar? Zahlen?).
**48 hielten im Kern – aber fast keiner unverändert:** Befund 2 fiel ganz,
Befund 60 war durch die 29er-Behebung überholt, und quer durch alle gab es
Zeilendrifts, falsche Zählungen und eine falsche Matrix-Behauptung (13: die
Fälle existierten, es fehlte die Messschicht).

**39 Befunde sind behoben und gepusht**, jeder Server-Fix mit Test:

* **Server:** Dash-Abschlag nur noch auf Körperkontakt (62), Telemetrie nennt
  den echten Modus (65), Ladebalken der Fähigkeit springt nicht mehr (66),
  IPv6-/64-Buckets funktionieren gegen echte Angreifer (69), wer lebend geht
  hinterlässt seinen Lauf (52), `runs.kills` zählt je Leben statt je Sitzung
  (58).
* **Respawn-Trilogie Handy:** Sticks überleben den Tod mit liegenden Daumen
  (61), Autofire bleibt an (68), die Klassenwahl klappt auf Touch nicht mehr
  von selbst auf (13). Die touch-probe testet den Fall jetzt so, wie ein
  Mensch spielt – vorher hat sie ihn wegtestet.
* **Beschriftung des Todes (15/28):** Toast und Neustart-Kachel nennen
  Klasse, halbierten Score und XP-Behalt (16–24 %), gerechnet aus denselben
  shared-Formeln wie die Server-Regel. Die Regel selbst ist unangetastet.
* **Handy-Sichtbarkeit (38):** Die Bestenliste ist auf Touch wieder da
  (Top 4, kompakt, weicht der Abruf-Minimap) – die „Übergangslösung" hatte
  das fertige Mobile-Paket monatelang tot geschaltet.
* **Kampfrückmeldung (1, 4, 8, 9, 10, 42/67):** Treffer-Bestätigung mit
  Urheber-Prüfung, der eigene Kill bekommt Zahl und Killfeed-Hervorhebung,
  Drohnen zeigen Treffer/Verlust/Lebensbogen und CONTROL hat eine Tonspur,
  Formen klingen beim eigenen Abschuss, der Schuss-Klang hängt an der Familie
  statt an zwei veralteten Namenslisten, die Klassenwahl hat einen Moment und
  ihre Karte nennt die Füllbedingung der Signature (12).
* **Dazu:** onboarding-active-Leck (14), Level-Toast-Flut samt falscher
  Einzahl (24/33), tote Space-Taste auf Knöpfen (70), klassenabhängige
  Zifferntasten (17), Level im Namensschild (11), eine Familienfarbe je
  Familie (21), Sprachmix (45), roleLabel (44), Startscreen-Steuerzeile (22),
  DROHNEN-Knopf nur für Drohnenklassen (40), kein „ALPHA" im HUD (37), der
  Name überlebt den Reload (54).
* **Retention-Runde:** Ein Gast nimmt etwas mit – lokaler Rekord auf Start-
  und Death-Screen (48 + erste 53er-Zeile), Freischaltungen überleben den
  Reload und zählen in der Galerie (49), die Start-Bestenliste markiert die
  eigenen Zeilen und nennt den Abstand zum letzten Platz (56), welcome
  trägt `achievements`, damit die Galerie nicht verspricht, was der Server
  nicht vergibt (60), und die HUD-Bestenliste zeigt den eigenen Platz mit
  echtem Rang – auch jenseits der Top 8 (19, mit je-Betrachter-Deltas).
* **Zwei Nachzügler:** Pinch-Zoom im Klassenrad mit passendem Hinweistext
  (43) und Drohnen in echter Größe – der Kollisionsradius lag ungenutzt auf
  der Leitung (41).
* **Sichtbarkeits-Paket (abends, nach Sams Freigabe per Rückfrage):**
  Gegner tragen ihren Signature-Füllstand in Familienfarbe (6), die
  AEGIS-Entladung hat Schockring, Funken, Kamera-Stoß und Tiefton über ein
  neues Einmal-Ereignis im Snapshot (7), erlittene Treffer zeigen die
  Richtung – roter Bogen am Sichtfeldrand plus Stereo auf dem Schadens-Ton,
  über die neue Schicht `hit-direction.ts` (5), und der Royale-Sieg zählt
  als Achievement „Letzter Überlebender" (57). Details in Bericht 21,
  Abschnitt 2 (Nachtrag).

**Alle Proben sind gefahren und grün:** wire, progress, mode ×3, royale, duo,
touch ×5 (mit den neuen Kriterien) und die Layout-Matrix **199/199** im
zertifizierenden Volllauf. Die Matrix hat unterwegs fünf Folgefehler der
eigenen Fixes gefunden – alle behoben, Details in Bericht 21 Abschnitt 6.

**Zwei Infrastruktur-Funde:** `playwright-core` stand in keiner package.json
(alle Browser-Proben hingen am Zufall des Containers – jetzt devDependency),
und die mode-probe vergleicht jetzt auch die Telemetrie, sonst wäre Befund 65
wieder durchgerutscht.

## 2. Womit anzufangen ist

1. **Sams Entscheidungen abholen** – die beiden bestellten Messrunden sind
   gefahren, die Zahlen stehen in Bericht 21, Abschnitt 7:
   * **Repulse (63):** Gegen Stehende verdoppelt `travel` die Wirkung
     (46 → 97 px); gegen Anlaufende steht der Angreifer in **beiden**
     Stellungen nach 1 s auf Körperkontakt – der Puls kauft ~0,5 s für 12 s
     Abklingzeit. Schalter, ehrlicher Menü-Text oder stärkere Zahlen: Sam.
   * **Prediction (64):** AUS kostet 29–33 ms Eigen-Latenz (localhost-
     Untergrenze; echte RTT kommt voll obendrauf), AN kostete im Messlauf
     **null** sichtbare Korrekturen. Default: Sam.
   * Dazu: Balance-Liste (18, 25, 26, 27, 30, 31, 32, 34, 59),
     Bestenlisten-Fenster/Dedup (51), Wortlaut der Login-Zeile (55).
2. **Sams Bot-Entscheidungen** – die Gruppe 71–79 ist nachgemessen
   (Bericht 21, Abschnitt 5): 7 bestätigt, 77 teilweise, **74 verworfen**
   (die V2-Vorhalt-Kompensation macht Elite auf jeder Distanz
   unterscheidbar – der Sucher hatte die Schicht übersehen). Die zwei
   defektartigen zuerst: 75 (SIEGE/AEGIS nie im Bot-Bestand, gegen den
   dokumentierten Rotations-Willen) und 79 (Farmer-Reparatur startet nie,
   der Code-Kommentar behauptet das Gegenteil). Der Rest ist
   Schwierigkeits-Design und gehört als Paket entschieden.
3. **Rest der Retention-Runde:** nur noch die Login-Zeile auf dem
   Death-Screen (55, Wortlaut mit Sam) – die restlichen 53er-Zeilen sind
   gebaut (Erfolge des Laufs + Bestenlisten-Messlatte auf der Death-Karte).
4. **Der einzige echte Blocker bleibt Sams:** Migration `0005_sessions.sql`
   und die Railway-Variablen – ohne sie misst die dreizehnte Zeile nicht.

## 3. Die Lehre der Sitzung, in einem Satz

Die Gegenprüfung hat diesmal vor allem **Behebungen verhindert** – Befund 2
wäre eine Verschlimmbesserung gewesen, 63 hätte eine dokumentierte
Entscheidung überschrieben, 64 die Hausregel abgekürzt – und zweimal lag der
Fehler im Messwerkzeug statt im Spiel: Eine Probe, die den Fall wegtestet
(touch-probe), und eine Matrix, die ihn sieht, aber nicht wertet
(`opacity < 0.05`), sind die teuerste Art von grün.
