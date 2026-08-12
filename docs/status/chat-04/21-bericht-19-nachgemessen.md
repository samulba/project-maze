# 21 – Bericht 19 nachgemessen: 51 Befunde geprüft, 37 behoben

| | |
| --- | --- |
| **Auftrag** | Sam: „erst nachmessen, dann anfassen" – die 79 Rohbefunde aus [Bericht 19](19-rohbefunde-spielgefuehl.md) |
| **Branch** | `claude/validate-bericht-19-findings-85aiaz` (Vorgabe dieser Sitzung – **nicht** main; Merge ist Sams Handgriff) |
| **Basis** | `3834b52` |
| **Tests** | `npm run check` grün – 76 Dateien, 1037 Tests |
| **Status** | 51 gegengeprüft: 37 behoben, 53 teilweise, 12 bestätigt-aber-offen, Befund 2 verworfen · 20 ungeprüft |

## 1. Wie gemessen wurde

Acht Prüf-Agenten, jeder mit dem Schema der ersten Analyse: Stimmt die Zeile?
Fängt es eine andere Schicht ab? Ist es Absicht (`docs/GOAL.md`)? Ist das
Szenario erreichbar? Stimmen die Zahlen? Die acht verwaisten „Urteile" am Ende
von Bericht 19 ließen sich eindeutig zuordnen (Urteil 1→Befund 1, 2→2, 3→3,
4→4, 5→5, 6→6, 7→7, 8→9) und hielten am aktuellen Stand unverändert – nur
Befund 8 brauchte eine volle Erstprüfung.

**Ergebnis: 48 von 51 im Kern haltbar, aber fast keiner unverändert.**
Befund 2 fiel ganz (das „doppelt so starke" Getroffen-Werden gilt nur im
Deckelfall; für 25 von 65 Klassen ist das Verhältnis umgekehrt). Befund 60 ist
durch die 29er-Behebung überholt (Achievements sind längst Opt-out; es bleibt
eine Protokoll-Lücke). Befund 69 stimmte im Schaden, nicht in der Begründung
(Node liefert die `::`-Form keineswegs „fast immer" – aber ein Angreifer wählt
seine Adressen selbst). Und quer durch alle: Zeilendrifts um 9 bis 32 Zeilen,
falsche Zählungen (Befund 48: 8 localStorage-Schlüssel statt „sechs";
Befund 38: 10 Grep-Treffer statt 8; Befund 67: IMPACT hat 10 Klassen, nicht 9)
und eine falsche Matrix-Behauptung (Befund 13: die Fälle existierten – es
fehlte keine Kombination, sondern eine **Messschicht**, weil `sichtbar()`
lahmgelegte Sticks mit `opacity < 0.05` still aussortierte).

Warum die Quote höher liegt als bei der ersten Analyse (14 von 30): Bericht 19
war bereits das Ergebnis von sieben Suchern, und sechs Befunde waren schon
behoben. Das Rohmaterial war vorsortiert – die Gegenprüfung hat trotzdem
Titel, Schweren und Zahlen in großem Stil korrigiert, und ohne sie wären
mindestens drei falsche Behebungen passiert (2, 63, 64 – siehe unten).

## 2. Behoben (37 Befunde)

**Server, jede Behebung mit Test:**

| Befund | Was lief | Was jetzt gilt |
|---|---|---|
| 62 | Der Dash-Abschlag viertelte **jeden** Schaden des Dashers – auch fliegende Kugeln und Drohnentreffer; der Masterplan begrenzt ihn dreifach dokumentiert auf Body-Damage | `inBodyContact`-Flag um die echte Kollisionsauflösung (Muster aus perks.ts); der alte Test rief `damagePlayer` direkt und war für den Unterschied blind – er läuft jetzt durch die Kollisionskette, plus Gegentest für vollen Projektilschaden |
| 65 | Telemetrie meldete für jeden Modus `maze-alpha` – ein Wert, der in `ARENA_MODE_IDS` gar nicht existiert; GOAL.md behauptete das Gegenteil | `currentArenaMode()` in Report und `maze_build_info`; mode-probe vergleicht jetzt auch `/metrics?format=json` |
| 66 | Ladebalken der Fähigkeit teilte durch die Basis-Abklingzeit – bei 10 Punkten sprang er beim Drücken auf 40 % | Balken rechnet mit derselben Zahl, mit der `readyAt` gesetzt wurde (`lastCooldownMs`) |
| 69 | IPv6-/64-Kürzung griff nur bei Adressen ohne `::` – ein Angreifer bekam je Suffix einen frischen Zähler, das Verbindungslimit (5) war gegen genau ihn wirkungslos | Adressen werden erst auf acht Gruppen expandiert; alle Schreibweisen derselben Adresse treffen denselben Bucket (getestet mit drei Schreibweisen) |
| 52 | Wer lebend den Tab schloss, hinterließ keinen Lauf – der beste Lauf einer Sitzung endet oft lebend | `removePlayer` schreibt denselben RunRecord wie der Tod (sessions.ts kannte die Lücke wörtlich – nur die Bestenliste ging leer aus) |
| 58 | `runs.kills` trug den Sitzungsstand; bei n Leben summierte `profile_stats` das (n+1)/2-Fache | Kills-Basis je Lebensbeginn in persistence.ts; die Zeile ist wieder „Spawn bis Tod". Death-Karte zeigt Kills des Lebens (Client-Teil) |

**Respawn-Trilogie (Handy) – die drei verzahnten sich:** Nach jedem Tod waren
die Sticks tot, bis beide Daumen neu aufsetzten (61), Autofire war aus (68),
und die Klassenwahl klappte auf und deckte beides zu (13). Jetzt überlebt die
Stick-Buchführung den Tod (`resetTransient` räumt Werte, nicht liegende
Finger; `setEnabled(true)` schaltet aus der letzten bekannten Position wieder
scharf), Autofire bleibt an (`resetAll` nur noch beim Verbindungsabbruch), und
die Wahl erscheint auf Touch zugeklappt – im Tod bleibt ihr Schlüssel stehen,
sonst klappte dieselbe Auswahl nach jedem Respawn erneut auf.
**Absicherung:** Die touch-probe lässt die Daumen über den Tod hinweg
**liegen** – vorher setzte sie beide Finger neu auf und testete exakt den
Fehler weg, den ihr eigener Kommentar benannte. Sie prüft Autofire nach jedem
Respawn mit. Und die Layout-Matrix hat eine neue Messschicht: Auf Touch müssen
beide Sticks im Standardzustand sichtbar **und scharf** sein
(`pointer-events`), nicht nur irgendwo sitzen.

**Beschriftung des Todes (15/28):** Der Tod nimmt halben Score, die ganze
Klasse und real 76–84 % der XP – kein Text sagte es, das Score-Feld zeigte den
Wert vor der Halbierung, „Neustart Level 30" las sich wie „die Hälfte bleibt".
Toast und Neustart-Kachel nennen jetzt Klasse, halbierten Score und XP-Behalt
(`death-summary.ts`, getestet: L10→24 %, L60→16 %). Die Zahlen kommen aus
denselben shared-Funktionen wie die Server-Regel – dazu `respawnScoreFrom` in
shared, damit Regel und Beschriftung nie auseinanderlaufen können (die tote
0,45-Fassung in game.ts hatte vorgeführt, wie das endet). **Die Regel selbst
ist unangetastet – sie gehört Sam.**

**Onboarding/HUD:** `onboarding-active` blieb nach den Grundlagen bis zu zehn
Minuten hängen – ohne Event-Banner auf Touch, obere Spalte 108 px zu tief auf
dem Desktop (14; der Frühausstieg räumt die Klasse jetzt ab, und der
Event-Banner bleibt sichtbar, während die Event-Karte auf ihn zeigt). Sechs
identische Level-Toasts in zwölf Sekunden, mit Einzahl-Text beim
Vierfach-Sprung (24/33; der Toast meldet nur noch Freischalt-Stufen, aus
`unlockLevel` abgeleitet, mit echter Punktezahl – `level-toast.ts`, getestet).
Space auf fokussierten Knöpfen war tot (70; `preventDefault` erst bei
tatsächlicher Zündung). Die Zifferntasten gehören jetzt den Plätzen, die für
die Klasse nutzbar sind – bei core liegen 9/0 auf Reichweite und Fähigkeit
statt auf gesperrten Familien-Slots, das Onboarding-Versprechen „1–9 und 0"
stimmt ab Minute eins (17, gemeinsame Quelle für kbd-Marken und Tasten,
getestet; der Sperrgrund steht als sichtbarer Text statt nur im Tooltip).

**Handy-Sichtbarkeit (38):** Die „Übergangslösung bis zum Mobile-Paket
(MASTERPLAN R3)" hat das fertige Mobile-Paket monatelang überlebt und die
Bestenliste auf Touch tot geschaltet – inklusive der bereits geschriebenen
Top-Rangliste-Regel, die nie greifen konnte. Sie ist wieder da: Top 4 auf
Handy-Höhen, 150 px schmal auf 667er-Breite (sonst überlappte sie den
Meldungs-Slot um 68 px, sobald ein Event läuft), und sie weicht der
Abruf-Minimap, die denselben Anker nutzt. Drei neue Matrix-Fälle sichern
genau diese Zustände (`mobil-minimap`, `mobil-klein-event`,
`mobil-wahl-offen`). Der Killfeed bleibt auf Touch aus – sein Ersatz
(„Kills stehen im Meldungs-Slot") war eine falsche Behauptung und ist jetzt
ehrlich als offen kommentiert.

**Kampfrückmeldung (1, 4, 8, 9, 10, 42/67):** Ein Kanal für „ich habe
getroffen" (Hitmarker im Fadenkreuz, Funken am Einschlag, kurzer hoher Ton –
mit Urheber-Prüfung über eigene Projektil-Einschläge, damit der Client keine
fremden Duelle quittiert). Der eigene Kill bekommt seine Zahl (130 + Level×18
– das 7- bis 35-Fache einer Form, und auf dem Schirm stand davon nichts,
während jedes fremde Quadrat ein goldenes „+18" bekam) und die eigene
Killfeed-Zeile dieselbe Hervorhebung wie in der Bestenliste. Drohnen zeigen
Treffer, Verlust und ab 60 % Schaden einen Lebensbogen – health/maxHealth
lagen in jedem Snapshot und wurden nie gelesen; CONTROL hat erstmals eine
Tonspur. Formen-Abschüsse klingen, nach Art gestaffelt und nur für eigene.
Der Schuss-Klang hängt an der Familie statt an zwei Namenslisten, die 40 der
55 schießenden Klassen auf denselben Ton fallen ließen. Die Klassenwahl hat
einen Moment (Ring, Funken, Ruck, Dreiklang), und ihre Karte trägt jetzt die
Füllbedingung der Signature (12) – laut GOAL.md das Entscheidende an den
Familien, und sie stand nur im Rad auf Taste C.

**Retention-Runde (im zweiten Teil der Sitzung nachgezogen):** Ein Gast nimmt
jetzt etwas mit. Der lokale Rekord (48, `mazers-run`: Bestscore, bestes Level,
meiste Kills, längster Lauf, Läufe) steht als Zeile auf dem Startscreen
(„Dein Rekord: 9.041 · Level 31 · 3 Läufe") und vergleicht auf dem
Death-Screen ab dem zweiten Lauf („Neuer Bestwert!" / „Dein Bestwert: …" –
die erste der drei Zeilen aus Befund 53). Freischaltungen überleben den
Reload (49, `mazers-achievements`): Die Galerie eines Gasts zählt seine lokal
gemerkten Erfolge, statt eine Sekunde nach dem Gratulations-Popup wieder 0/7
zu behaupten. Die Start-Bestenliste markiert die eigenen Zeilen über den
gemerkten Namen und nennt den Abstand zum letzten Platz (56, „Dein Bestwert:
6.200 – Platz 50 liegt bei 8.100."); der Standardname „Player" zählt bewusst
nicht als Identität. Und die welcome-Nachricht trägt `achievements` (60):
Vergibt ein Server keine Erfolge, sagt die Galerie das ehrlich, statt sieben
Bedingungen zu zeigen, auf die niemand hinspielen kann. Alles ohne Migration,
alles mit Tests (`run-record.test.ts`, `local-achievements.test.ts`,
`start-leaderboard.test.ts`). Nebenbei: DEPLOYMENT.md nannte für
`ACHIEVEMENTS_ENABLED` noch den Stand vor der 29er-Behebung – korrigiert.

**Der eigene Rang in der HUD-Bestenliste (19):** Acht Plätze, die ein Neuling
nie erreicht, sagten ihm zehn Minuten lang nur „du kommst hier nicht vor".
Die Liste trägt jetzt Ränge, und wer nicht unter den Top 8 ist, steht mit
seiner eigenen Zeile und echtem Rang als neunte darunter (mit Trennlinie –
der Arras.io-Trick). Auf dem Handy bleibt die eigene Zeile auch dann stehen,
wenn die Liste auf die Top 4 gekürzt ist. Dafür musste die Delta-Kodierung
umlernen: Die Bestenliste war „für alle Clients identisch" und ihre Signatur
wurde einmal pro Tick geteilt – jetzt rechnet sie je Betrachter (getestet,
inklusive des Falls, der sonst jedem zweiten Viewer die Liste in jedem
Snapshot neu geschickt hätte).

**Kleinere bestätigte Befunde:** kein „ALPHA" mehr mitten im HUD (37), Level
im Namensschild jedes Tanks (11 – der Level-30-Rückkehrer im Core sah aus wie
ein Anfänger, bei 242 statt 110 Leben), eine Familienfarbe je Familie mit den
Rad-Werten als Referenz (21 – es waren **drei** Paletten, nicht zwei),
Sprachmix raus (45: BEREIT/AKTIV, BESTENLISTE, „Formen" statt „Shapes"),
`roleLabel` statt rohem Enum im Loadout-Menü (44), der Startscreen nennt
E/SPACE statt einer Taste, die für 55 Klassen nichts tut (22), der
REPEL-Knopf heißt DROHNEN und existiert nur für Drohnenklassen – vorher war
seine einzige Wirkung für 55 Klassen, still den Spawnschutz zu beenden (40),
und der Name überlebt den Reload (54, `mazers-name`).

## 3. Bestätigt, aber bewusst nicht angefasst (12: 3, 5, 6, 7, 20-Text, 41, 43, 51, 55, 57, 63, 64)

* **Befund 63 (Repulse wirkungslos) – der wichtigste Nicht-Fix.** Der
  Schalter ist kein vergessener wie beim Dash-Präzedenzfall: In index.ts steht
  eine ausdrückliche, datierte Entscheidung („01: bleibt aus bis zur Messrunde
  von Welle C – eine Verdopplung gehört gemessen, nicht gefühlt"). Umdrehen
  hieße, eine getroffene Entscheidung zu übergehen. **Aber:** Die
  Menü-Beschreibung verspricht „Verdrängt Gegner …", und gemessen wackelt der
  Gegner einen halben Tank und ist eine halbe Sekunde später näher als vorher.
  Der Widerspruch (geparkte Entscheidung gegen ein Versprechen, das der
  Spieler liest) gehört Sam/01 vorgelegt.
* **Befund 64 (Prediction-Default aus).** Kein Sam-Punkt (GOAL.md reserviert
  es nicht), aber die Hausregel verlangt Absicherung vor dem Umlegen – und
  anders als bei SNAPSHOT_DELTAS gibt es keine Probe, die Prediction-Gefühl
  misst. Prediction-Fehler äußern sich als Gummiband, nicht als roter Test.
  Nötige Reihenfolge: Proben-/Messlauf in beiden Stellungen, dann drehen.
* **Befunde 5, 6, 7 (Trefferrichtung, Gegner-Füllstand, AEGIS-Entladung).**
  Alle drei bestätigt; 5 und 7 brauchen Wire-Format-Erweiterungen (Muster
  `arenaEvent` liegt bereit), 6 ist eine Ein-Zeilen-Änderung mit
  Design-Gewicht: Sie macht Gegner-Information sichtbar, die bisher nur
  technisch auf der Leitung liegt. Sam entscheidet, dann ist jede davon eine
  kleine Runde.
* **Befund 3 (Schussfeedback an der Serverantwort).** Bestätigt (Ø 110 ms bei
  60 ms Ping), aber die lokale Auslösung braucht eine Client-Nachladeuhr, und
  die Je-Punkt-Faktoren leben in combat-tuning, nicht in shared – dieselbe
  Voraussetzung wie beim Text-Teil von Befund 20. Erst Konstanten nach shared
  heben, sonst entsteht exakt die abgetippte-Zahl-Fehlerklasse aus GOAL.md.
* **Befund 41 (Drohnen-Radius).** Braucht ein `radius`-Feld nach dem
  Formen-Muster (einmal je ID senden) – Wire-Runde.
* **Befund 43 (Pinch-Zoom im Rad).** Bestätigt inkl. `zentriereAuf` ohne
  einzigen Aufrufer; eigenständige Client-Runde.
* **Rest des Retention-Pakets (53-Rest, 55).** 48, 49, 54, 56 und die erste
  53er-Zeile sind erledigt (Abschnitt 2). Offen: die Login-Zeile mit Preis
  auf dem Death-Screen (55 – der Wortlaut ist Produktton, den sollte Sam
  absegnen) und die restlichen 53er-Zeilen (Abstand zur Bestenliste auf der
  Death-Karte, frisch freigeschaltete Erfolge dort nennen).
* **Befund 51 (Bestenliste ewig/ohne Dedup).** Kein Bug – der Code tut, was er
  soll. Zeitfenster-Reiter und Dedup sind Produktentscheidungen, und sauberer
  Dedup geht nur über `user_id` (Gäste heißen alle „Player"). Sam.
* **Befund 57 (Royale-Sieg ohne Spur).** Ein `royaleWinner`-Achievement wäre
  migrationsfrei (die Tabelle ist darauf gebaut), aber welche Momente eine
  Belohnung verdienen, ist Content – Sam.
* **Rest von Befund 2:** Der Kill-Ruck ist fest 3 und skaliert als einziger
  Reiz nie (Streak, Opferlevel). Kosmetik, notiert.

## 4. Sams Liste (Balance – gemessen, benannt, nicht entschieden)

Unverändert aus Bericht 19, hier nur gebündelt: XP-Kurve und erste Klassenwahl
nach 2 s (25), leere letzte 61 % der Levelkurve (26), Ein-Karten-Klassentore
(27), Anfängerschutz 6 s (30), Kosten-Faktor 102 gegen Durchsatz-Faktor 1,8
(31), Elite-Festwert-Bonus (32), 120 Pips für 59 Punkte (34), Bot-Dichte fürs
Alleinsein (18), Ziel-Leiter zwischen Level 19 und 60 (59 – der
Erfolgs-Teil wäre Content, die Kurve Balance). Dazu weiter offen: 0,45 gegen
0,5 Punktestand (die tote 0,45-Fassung liegt unverändert in game.ts).

## 5. Ungeprüft geblieben (20)

Befunde 16 und 50 (Onboarding-Kill-Schritt, Anfänger-Erfolge – beides
Content-Entscheidungen nahe an Sams Liste) und die komplette Bot-Gruppe
**71–79**. Letztere ist das größte offene Stück: Die Behauptungen sind
messbar formuliert (Ziel-Haltedauern, Trefferquoten je Tier,
Signature-Füllstände je Familie), aber jede Prüfung braucht eigene
Laufzeitmessungen gegen den echten Server – das ist eine eigene Sitzung, und
mehrere Fixes daran (Aggression je Gefecht, Tier nach Level) wären zugleich
Schwierigkeits-Entscheidungen, also mindestens zur Hälfte Sams.

## 6. Proben- und Testlage

```
npm run check      1034 Tests gruen (76 Dateien; +33 neue)
wire-probe         gruen
progress-probe     gruen (im Suite-Lauf einmal an der Container-Last
                   gescheitert, einzeln reproduzierbar gruen)
mode-probe x3      maze / ffa / royale gruen -- NEU: inkl. Telemetrie-Modus
royale-probe       gruen
duo-probe          gruen
touch-probe:all    5/5 Formate gruen -- NEU: Daumen bleiben ueber den Tod
                   liegen, Autofire wird nach jedem Respawn geprueft
ui-layout-check    199/199 im zertifizierenden Volllauf -- drei neue
                   Mobil-Faelle, Stick-Schaerfe-Messschicht
```

Die Matrix hat dabei ihren Zweck erfüllt und **fünf Folgefehler der eigenen
Fixes gefunden**, alle behoben: Die Signature-Zeile sprengte den
34-vh-Deckel der Wahlkarten (jetzt in der Rollenzeile, null Höhe), der
sichtbare Sperrgrund lief übers Panel (drei Ursachen: Textlänge,
`1fr` ohne `minmax(0,…)`, geerbtes `justify-items:center` gegen die
Ellipse), die versteckte kbd-Marke rendorte trotz `hidden` (dieselbe
display-Falle wie beim Drohnen-Knopf), die fünfte Steuerzeilen-Pille machte
den Startscreen auf 1366×768 scrollend, und die Abruf-Minimap kollidierte
mit der Onboarding-Karte. Der lehrreichste: Die Klassen-Spalte der schmalen
Top-4-Liste passte mit frischem Server und sprengte die Zeile nach
25 Minuten Arena-Laufzeit – eine Spalte, deren Passen vom Serveralter
abhängt, gehört nicht in die Zeile.

Zwei Infrastruktur-Funde am Rande: `playwright-core` stand in keiner
package.json – alle Browser-Proben liefen nur, weil es im alten Container
zufällig lag; jetzt devDependency. Und die mode-probe prüft die Telemetrie
mit, sonst wäre Befund 65 beim nächsten Mal wieder durchgerutscht.

## 7. Womit anzufangen ist

1. **Sams drei Entscheidungen abholen:** Repulse (63 – Messrunde oder
   ehrlicher Text), Gegner-Füllstand sichtbar (6), Balance-Liste aus
   Abschnitt 4. Alles andere hängt nicht daran.
2. **Die Bot-Gruppe (71–79) nachmessen** – eigene Sitzung, Messskripte nach
   den Gegenproben im Bericht 19.
3. **Rest der Retention-Runde:** die Login-Zeile auf dem Death-Screen (55,
   Wortlaut mit Sam) und die restlichen 53er-Zeilen; dazu die kleinen
   Wire-Runden 41 (Drohnen-Radius), 7 (AEGIS-Ereignis) und 5
   (Trefferrichtung), wenn Sam nickt, sowie der Pinch-Zoom im Rad (43).
4. **Prediction-Messlauf (64)** in beiden Stellungen, dann den Default
   entscheiden.
5. Der einzige echte Blocker bleibt unverändert Sams: Migration
   `0005_sessions.sql` und die Railway-Variablen – ohne sie misst die
   dreizehnte Zeile nicht.

## 8. Die Lehre des Tages

Die Gegenprüfung hat wieder Behebungen verhindert, nicht nur Befunde
bestätigt: Befund 2 wäre eine Verschlimmbesserung gewesen (das Verhältnis war
für die meisten Klassen schon richtig herum), Befund 63 hätte eine bewusst
geparkte Entscheidung überschrieben, Befund 64 die Hausregel abgekürzt. Und
zweimal lag der Fehler nicht im Spiel, sondern im Messwerkzeug: Die
Layout-Matrix hatte die Fälle und keine Messschicht (13), die touch-probe
behandelte die Ursache in sich selbst statt im Spiel (61). Eine Probe, die
den Fall wegtestet, ist die teuerste Art von grün.
