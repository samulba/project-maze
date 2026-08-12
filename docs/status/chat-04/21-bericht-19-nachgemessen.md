# 21 – Bericht 19 nachgemessen: alle 79 Befunde geprüft, 43 behoben

| | |
| --- | --- |
| **Auftrag** | Sam: „erst nachmessen, dann anfassen" – die 79 Rohbefunde aus [Bericht 19](19-rohbefunde-spielgefuehl.md) |
| **Branch** | `claude/validate-bericht-19-findings-85aiaz` (Vorgabe dieser Sitzung; main ist per Sams Freigabe „Ja, merge du" nachgezogen) |
| **Basis** | `3834b52` |
| **Tests** | `npm run check` grün – 77 Dateien, 1056 Tests |
| **Status** | Alle 79 geprüft: 43 behoben, 2 verworfen (2, 74), Rest bestätigt-aber-offen – Bots/Balance/Content bei Sam (Abschnitte 3–5) |

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

## 2. Behoben (43 Befunde)

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

**Zwei Nachzügler ohne Sam-Abhängigkeit:** Das Klassenrad kann Pinch-Zoom
(43) – vorher blieb der Zoom auf Touch auf 1, 48 der 65 Klassen waren
namenlose Punkte, und darunter stand eine Anleitung für eine Maus, die es
dort nicht gibt (der Hinweistext passt jetzt zur Hand; ein verbliebener
Finger übernimmt nach dem Pinch nahtlos das Verschieben). Und Drohnen werden
in echter Größe gezeichnet (41): Der Kollisionsradius (7,5 bei Hive bis 15,5
bei Carrier – Faktor 2) lag als `gameplayRadius` schon immer ungenutzt auf
der Leitung; der Renderer liest ihn jetzt, statt jede Drohne als 13er-Dreieck
zu zeigen – eine Hive-Drohne erschien mit dreifacher Fläche, eine
Carrier-Drohne traf durch sichtbare „Luft" (getestet: jeder Drohnen-Snapshot
trägt den Radius).

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

**Nachtrag am Abend – das Sichtbarkeits-Paket (5, 6, 7, 57), nach Sams
Freigabe:** Die vier zunächst geparkten Sichtbarkeits-Befunde hat Sam per
Rückfrage alle bestellt, sie sind gebaut und getestet:

| Befund | Was lief | Was jetzt gilt |
|---|---|---|
| 6 | Der Signature-Füllstand lag für **jeden** Spieler auf der Leitung (die Specter-Tarnung las ihn längst), gezeichnet wurde er nur beim eigenen Tank | Das `isSelf`-Gate ist raus: Jeder Tank mit Familienmechanik trägt den Balken – Gegner in ihrer Familienfarbe (dieselbe Palette wie Rad und Wahlkarten, jetzt als `signatureColor()` in `signature.ts`), der eigene weiter in Eigenfarbe. Ein getarnter SPECTER verrät sich nicht: Der Balken verblasst mit dem Tank |
| 7 | Die AEGIS-Entladung (34 Schaden, 240 Radius, 520 Stoß) passierte in einem Server-Tick – Getroffene flogen „grundlos" weg, der Träger bekam für den halben Lebensbalken Aufladung keinen Frame Auftritt | `dischargeBursts` im Snapshot (Killfeed-Muster: ~1 s Vorhaltezeit, monotone Id, Sichtfeld-Filter je Betrachter, kurze IDs auf der Leitung); der Client spielt je Id einmal Schockring über den vollen Radius, Funken, Kamera-Stoß für den Träger und einen Tiefton – 4 neue Servertests |
| 5 | Wer aus dem Off beschossen wurde, wusste *dass*, nie *woher* | Neue Schicht `hit-direction.ts` direkt über dem Kampf-Tuning (sieht damit auch gebundene Innenaufrufe wie die Entladung): bucht bei echtem Lebensverlust die Richtung zum Angreifer, nur in den eigenen Snapshot (`damageDirections`). Client: roter Bogen am Sichtfeldrand (600 ms Zerfall) plus StereoPanner am Schadens-Ton – links getroffen, links gehört. 5 neue Servertests |
| 57 | Der Royale-Sieg verpuffte ohne Spur | Achievement `royaleWinner` („Letzter Überlebender"): `arena-royale` meldet den menschlichen Rundensieger an die Achievements-Engine; migrationsfrei, Katalog + Server + Test |

## 3. Bestätigt, aber bewusst nicht angefasst (6: 3, 20-Text, 51, 55, 63, 64)

* **Befund 63 (Repulse wirkungslos) – der wichtigste Nicht-Fix.** Der
  Schalter ist kein vergessener wie beim Dash-Präzedenzfall: In index.ts steht
  eine ausdrückliche, datierte Entscheidung („01: bleibt aus bis zur Messrunde
  von Welle C – eine Verdopplung gehört gemessen, nicht gefühlt"). Umdrehen
  hieße, eine getroffene Entscheidung zu übergehen. **Aber:** Die
  Menü-Beschreibung verspricht „Verdrängt Gegner …", und gemessen wackelt der
  Gegner einen halben Tank und ist eine halbe Sekunde später näher als vorher.
  Sam hat die **Messrunde bestellt**; sie ist gefahren, die Zahlen stehen in
  Abschnitt 7 – der Schalter selbst bleibt unangetastet.
* **Befund 64 (Prediction-Default aus).** Kein Sam-Punkt (GOAL.md reserviert
  es nicht), aber die Hausregel verlangt Absicherung vor dem Umlegen – und
  anders als bei SNAPSHOT_DELTAS gibt es keine Probe, die Prediction-Gefühl
  misst. Prediction-Fehler äußern sich als Gummiband, nicht als roter Test.
  Sam hat den **Messlauf bestellt**; er ist gefahren, die Zahlen stehen in
  Abschnitt 7 – den Default entscheidet er.
* **Befund 3 (Schussfeedback an der Serverantwort).** Bestätigt (Ø 110 ms bei
  60 ms Ping), aber die lokale Auslösung braucht eine Client-Nachladeuhr, und
  die Je-Punkt-Faktoren leben in combat-tuning, nicht in shared – dieselbe
  Voraussetzung wie beim Text-Teil von Befund 20. Erst Konstanten nach shared
  heben, sonst entsteht exakt die abgetippte-Zahl-Fehlerklasse aus GOAL.md.
* **Rest des Retention-Pakets (55).** 48, 49, 54, 56 und inzwischen alle
  53er-Zeilen sind erledigt (Abschnitt 2, Nachtrag): Die Death-Karte nennt
  jetzt auch die Erfolge des Laufs („Freigeschaltet in diesem Lauf: …",
  `runUnlocksLine`) und die öffentliche Messlatte („Dieser Lauf steht in der
  Bestenliste – etwa Platz N" bzw. „Noch X Punkte bis zur Bestenliste",
  `deathDistanceLine`, je Tod frisch geholt, ohne Persistenz still). Offen
  bleibt allein die Login-Zeile mit Preis auf dem Death-Screen (55 – der
  Wortlaut ist Produktton, den sollte Sam absegnen).
  Beifang der Absicherung: Auf Querformat-Handys (≤ 430 px hoch) wuchs die
  Bestenliste mit Selbstzeile und Trenner (Befund 19) von oben in den
  AUTO-Knopf – 42×8 px Überlappung auf 844×390, aber nur auf gealtertem
  Server (ab Platz 9), exakt die Serveralters-Falle aus der
  Zertifizierungsrunde. Jetzt: drei Plätze plus Selbstzeile, Trenner weg
  (mobile.css); Tod-, iPhone- und Mobil-Fälle der Matrix gegen einen 60 s
  gealterten Server erneut grün.
* **Befund 51 (Bestenliste ewig/ohne Dedup).** Kein Bug – der Code tut, was er
  soll. Zeitfenster-Reiter und Dedup sind Produktentscheidungen, und sauberer
  Dedup geht nur über `user_id` (Gäste heißen alle „Player"). Sam.
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

## 5. Bot-Gruppe (71–79) und Content-Befunde (16, 50) – nachgemessen

Nachtrag am späten Abend: Drei Prüf-Agenten haben die neun Bot-Behauptungen
mit Laufzeitmessungen gegen den gebauten Server geprüft (Tuning-Kette exakt
in index.ts-Reihenfolge mit Produktions-Defaults nachgestellt, feste Uhr,
Messskripte im Sitzungs-Scratchpad; Methodik je Skript im Kopfkommentar).
Ergebnis: **7 bestätigt, 77 teilweise, 74 verworfen.** Damit ist kein
Befund aus Bericht 19 mehr ungeprüft. Fixes daran sind bewusst NICHT
passiert – Bot-Verhalten ist Schwierigkeits-Balance, die Entscheidung
liegt bei Sam (GOAL.md erklärt Schwierigkeit ausdrücklich zu seiner).

* **71 (Aggressionswurf je Entscheidung) – bestätigt.** Mechanik exakt wie
  behauptet, Zahlen repliziert: farmer hält ein Ziel im Median 375 ms
  (96 % der Episoden unter 1 s), hunter/brawler exakt 8 025 ms =
  huntTimeoutMs; in der vollen Arena visiert 80,8 % der Zeit kein Bot den
  Menschen an. Die Kampfpausen selbst sind kommentiert gewollt (Sams
  „Dauerbeschuss"-Feedback), aber der Kommentar beschreibt styleAggression
  als „einen Gegner überhaupt angehen" – implementiert ist ein Neuwurf
  alle 195–538 ms. Vorbehalt: gemessen mit passivem Menschen; wer
  zurückschießt, löst Vergeltung aus und sieht mehr Angreiferzeit.
* **72 (Bots kaufen nie maxHealth) – bestätigt, eine Ecke zu absolut.**
  13 von 18 Plätzen brauchen rechnerisch Level 72 (Deckel: 60) – exakt
  repliziert, ebenso alle HP-Paare (vortex 224 gegen 118 usw.). Aber
  „ausnahmslos jeder" kippt: brawler kauft ab Level 22 (im Messlauf einer
  mit maxHealth = 8). Und die Gegenprobe verschiebt die Ursache: Ohne die
  beiden Familien-Slots im Bot-Pfad läge der HP-Punkt bei Level 52 –
  erst der Slot-Einschub (Position 2 und 4) macht ihn unerreichbar.
* **73 (Tier bei Geburt gewürfelt, nie neu) – bestätigt.** Über 71
  Bot-Tode und 39 Level Spanne: 0 Tier-Wechsel, 0 Profil-Wechsel.
  Nebenbefund: Weil der Zähler bei 1 beginnt, ist die reale Mischung
  7 rookie / 8 veteran / 3 elite – nicht die kommentierten 40/40/20.
* **74 (Skill-Stufen ab 300 px ununterscheidbar) – VERWORFEN.** Der Befund
  zitiert die Mechanik unvollständig: In Produktion ist PROJECTILE_SPEED_V2
  an, und `compensatedLeadFactor` hebt den Vorhalt bei langen Flugzeiten
  genau so an, dass der Fehler konstant bleibt (rookie 0,3 → effektiv 0,83
  auf 880 px). Gemessen mit echter Fahr-Physik: Elite ist auf JEDER Distanz
  klar unterscheidbar (200 px: 41/70/98 %; 420 px: 32/40/50 %; 880 px:
  16/20/26 %); die behauptete Inversion tritt nie auf und reproduziert
  sich nur mit einem teleportierten statt gefahrenen Ziel – ein
  Messartefakt des Suchers. Teilrest: rookie und veteran rücken auf
  880 px eng zusammen – wegen der V2-Kompensation, nicht trotz ihr.
* **75 (Bestand bit-identisch, SIEGE/AEGIS fehlen) – bestätigt,
  vollständig.** 12 Archetypen auf 18 Plätzen, 6 exakte Doppelpaare,
  zweiter Arena-Bau bit-identisch; die vier vorhandenen Siege-/Aegis-Pfade
  werden durch die Modulo-Kopplung nie gezogen – gegen den ausdrücklichen
  Codekommentar, der beide Familien in der Controller-Rotation haben will.
  Das ist der eine Bot-Befund, der eher Defekt als Balance ist.
* **76 (SPECTER-Bots zünden ihre Familie nie) – bestätigt.** 6 Minuten,
  949 Proben: Median-Tarnung 0,0, 90. Perzentil 0,0, Maximum 51 – die
  Hinterhaltsschwelle 95 fällt nie; Bots feuern in 83,2 % der Ticks.
  Keine Schicht gated das Feuern.
* **77 (Ecke löscht Bot-Kontakt, Bot kommt nie herum) – teilweise.** Der
  Kern hält: Zielverlust nach der Ecke im Median 275 ms, kein letzter
  bekannter Ort, keine Umrundung als Taktik. Aber „findet ihn nie wieder"
  war ein Einzellauf-Artefakt: In 5 von 10 geseedeten Läufen stolpert der
  Bot beim Formen-Farmen binnen 60 s zufällig zurück in die Sichtlinie.
* **78 (alle kämpfen auf 430 px) – bestätigt.** Alle Reichweiten exakt
  repliziert (eclipse 4 446 px, Kampf auf 9,7 % der Reichweite); mit dem
  Stabilizer-Frame der Hunter sogar 4 891 px → 8,8 %. Feuerdeckel bindet
  überall bei 900/1150.
* **79 (Farmer können ihre Reparatur nicht starten) – bestätigt.** Der
  Kausalpfad ist lückenlos: think stoppt für die Reparatur, tuneRapidBots
  überschreibt den Stopp, Tempo fällt nie unter 40. Gemittelt über drei
  Läufe: 3,2 % reparaturfähige Ticks / 34 % der Zeit unter 68 % HP mit
  der Schicht gegen 11,6 % / 19 % ohne; 0–1 Reparaturzyklen in 4 min
  gegen 1–5. Der Kommentar „die Reparatur bricht dadurch nicht ab"
  (signature-rapid.ts) ist sachlich falsch – sie beginnt nie. Auch das
  eher Defekt als Balance. Vorsicht: Einzelläufe streuen stark, nur
  gemittelt bewerten.

Dazu die letzten zwei Content-Befunde, von Hand gegengeprüft:

* **16 (nichts sagt, dass Kills der Fortschritt sind) – bestätigt.** Die
  sechs Onboarding-Schritte erwähnen keine Spieler; die XP-Rechnung stimmt
  exakt (ein Kill ≈ zehn Formen: 1 550 gegen Ø 153 XP). Ein Teil des
  Vorschlags ist seit Befund 4 gebaut (Kill-Belohnung als Zahl im
  Spielfeld); der siebte Onboarding-Schritt ist Content – Sam.
* **50 (Anfänger erreicht praktisch keinen Erfolg) – bestätigt.**
  Schwellen halten (score10k = Level ~19–20 bei 10 289 XP; nur
  threeFamilies ist anfängerrealistisch). Detailkorrekturen: maxLevel
  kostet 168 595 XP (nicht 176 280), und der Katalog hat inzwischen acht
  Erfolge – der neue (royaleWinner) ist im Maze ebenso unerreichbar.
  Katalog-Erweiterung ist Content – Sam.

## 6. Proben- und Testlage

```
npm run check      1050 Tests gruen (77 Dateien; zuletzt inkl.
                   Sichtbarkeits-Paket 5/6/7/57)
wire-probe         gruen (nach dem Sichtbarkeits-Paket erneut gefahren --
                   die neuen Snapshot-Felder gehen sauber ueber die Leitung)
royale-probe       gruen (nach dem Paket erneut, wegen 57)
progress-probe     gruen (im Suite-Lauf einmal an der Container-Last
                   gescheitert, einzeln reproduzierbar gruen)
mode-probe x3      maze / ffa / royale gruen -- NEU: inkl. Telemetrie-Modus
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

## 7. Die zwei bestellten Messrunden (63, 64) – die Zahlen

### Repulse (Befund 63), beide Stellungen von `REPULSE_TRAVEL_ENABLED`

Gemessen am gebauten Server (`tuneLoadoutSystem` über `tuneCombatScaling`,
exakt die Schichtung aus index.ts), Ziel auf 100 px, 25-ms-Ticks. Zahlen:
Verschiebung des Ziels entlang der Stoßachse (positiv = vom Stoßer weg) und
Abstand zum Stoßer (Start: 100; Körperkontakt: 44).

| Stellung | Ziel | nach 200 ms | nach 500 ms | nach 1 s | max. Auslenkung |
|---|---|---|---|---|---|
| AUS (Produktion) | stehend | +44,9 → 144,9 | +45,7 → 145,7 | +45,7 → 145,7 | 45,7 |
| AUS (Produktion) | anlaufend | +44,9 → 144,9 | −4,5 → **95,5** | −97,7 → **44 (Kontakt)** | 45,7 |
| AN | stehend | +93,8 → 193,8 | +97,4 → 197,4 | +97,4 → 197,4 | 97,4 |
| AN | anlaufend | +58,2 → 158,2 | −19,2 → **80,8** | −105,1 → **44 (Kontakt)** | 60,2 |

Kontrolle ohne Repulse, anlaufendes Ziel: Kontakt nach ~500 ms.

Was die Zahlen sagen (benannt, nicht entschieden):

* **Gegen Stehende verdoppelt `travel` die Wirkung** – 46 → 97 px, also von
  einem Tankdurchmesser auf den halben Wirkradius (195). Das deckt sich mit
  der dokumentierten Messung am Schalter.
* **Gegen Anlaufende hilft keine der beiden Stellungen nachhaltig:** In
  beiden steht der Angreifer nach einer Sekunde auf Körperkontakt. Der
  Repulse kauft gegenüber „kein Repulse" rund eine halbe Sekunde (Kontakt
  bei ~0,5 s statt sofortigem Durchlaufen), für 12 s Abklingzeit.
* **`travel AN` ist gegen Anlaufende kaum stärker als AUS** (max. 60 statt
  46 px) und nach 500 ms sogar *näher* (80,8 gegen 95,5): Der getragene
  Stoß addiert sich zur Eingabe des Getroffenen („der Getroffene behält die
  Kontrolle"), während der Sofort-Kick dessen Eingabe erst einmal
  überschreibt.
* Der Menü-Text „Verdrängt Gegner" stimmt in Produktion also nur für
  Stehende, und dort für einen Tankdurchmesser.

### Prediction (Befund 64), beide Stellungen in einem Lauf

Kein Browser, aber keine Nachbildung: Die **echte** `PredictionEngine` und
der **echte** `SnapshotHydrator` aus apps/client/src liefen gegen einen
echten Server (Deltas, kurze IDs, Eingabe-Quittungen an – Produktionsstand),
30 s je Lauf, 40-Hz-Eingaben, Richtungswechsel alle 400 ms, Maze-Modus mit
Wänden. Zwei Läufe, deckungsgleich:

| Was | Zahl |
|---|---|
| **Stellung AUS kostet:** Quittungs-Latenz (so alt ist der eigene Tank) | p50 **29–33 ms**, p90 46–50, p99 ~57, max 73 |
| **Stellung AN kostet:** harte Korrekturen (der sichtbare „Gummiband"-Fall) | **0** in 2 × 30 s |
| weiche Korrekturen je Snapshot (unsichtbar über 135 ms eingeblendet) | p50 **6,3 px**, p90 ~9,5, max 17 (Tankradius: 22) |
| verworfene Eingaben / fehlende Hydrator-Statik / Tode | 0 / 0 / 0 |

Einordnung: Die Quittungs-Latenz ist die **localhost-Untergrenze** (Tick-
plus Snapshot-Takt). Auf echten Leitungen addiert sich die halbe RTT für
AUS eins zu eins obendrauf – AN versteckt sie vollständig. Die weichen
Korrekturen sind zum Großteil der beabsichtigte Render-Vorlauf gegen den
Tick-Versatz, kein Vorhersagefehler. Nicht im Lauf enthalten (BOT_COUNT=0):
Rückstoß, Repulse-Schub und Tank-Kollisionen – die sagt die Engine bewusst
nicht vorher und zieht dann hart nach; das ist dokumentiertes Design und
der Fall, den man beim Spielen prüfen müsste. **Der Default bleibt Sams
Entscheidung.**

Messwerkzeuge: `repulse-messrunde.mjs` und `prediction-messlauf-entry.ts`
(Sitzungs-Scratchpad; bei Bedarf jederzeit aus diesem Abschnitt
rekonstruierbar – Aufbau steht oben vollständig).

## 8. Womit anzufangen ist

1. **Sams Entscheidungen abholen:** Repulse-Schalter oder ehrlicher
   Menü-Text (63) und Prediction-Default (64) – die Zahlen zu beidem stehen
   in Abschnitt 7. Dazu die Balance-Liste aus Abschnitt 4, Zeitfenster/
   Dedup der Bestenliste (51), Wortlaut der Login-Zeile (55).
2. **Sams Bot-Entscheidungen** (Abschnitt 5): Die zwei defektartigen
   zuerst – 75 (Modulo-Kopplung gegen den dokumentierten Rotations-Willen,
   SIEGE/AEGIS nie im Bestand) und 79 (Reparatur startet nie, der
   Kommentar behauptet das Gegenteil). Der Rest (71, 72, 73, 76, 77, 78)
   ist Schwierigkeits-Design: Haltedauern, HP-Pfad, Tier-Kurve,
   Familien-Feuerregeln, Ecken-Gedächtnis, Kampfdistanz.
3. **Rest der Retention-Runde:** nur noch die Login-Zeile auf dem
   Death-Screen (55, Wortlaut mit Sam).
4. Der einzige echte Blocker bleibt unverändert Sams: Migration
   `0005_sessions.sql` und die Railway-Variablen – ohne sie misst die
   dreizehnte Zeile nicht.

## 9. Die Lehre des Tages

Die Gegenprüfung hat wieder Behebungen verhindert, nicht nur Befunde
bestätigt: Befund 2 wäre eine Verschlimmbesserung gewesen (das Verhältnis war
für die meisten Klassen schon richtig herum), Befund 63 hätte eine bewusst
geparkte Entscheidung überschrieben, Befund 64 die Hausregel abgekürzt. Und
zweimal lag der Fehler nicht im Spiel, sondern im Messwerkzeug: Die
Layout-Matrix hatte die Fälle und keine Messschicht (13), die touch-probe
behandelte die Ursache in sich selbst statt im Spiel (61). Eine Probe, die
den Fall wegtestet, ist die teuerste Art von grün.
