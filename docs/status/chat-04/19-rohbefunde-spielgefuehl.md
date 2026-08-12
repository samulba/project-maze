# 19 – Rohbefunde der Spielgefühl-Analyse (79 Stück, ungeprüft)

| | |
| --- | --- |
| **Auftrag** | Sam: „schauen was das spiel noch schlecht macht" |
| **Branch** | `main` |
| **Basis** | `e8ba512` |
| **Tests** | `npm run check` grün – 72 Dateien, 1001 Tests |
| **Status** | **Rohmaterial. Nicht gegengeprüft. Nicht abarbeiten, ohne vorher nachzumessen.** |

## Warum dieses Dokument existiert

Am 12.08. liefen zwei Analysen. Die erste (Bugs) ist abgeschlossen und
abgearbeitet – vierzehn bestätigte Befunde, alle behoben, alle per Sabotage
gegengeprüft. Die zweite (Spielgefühl, erste zehn Minuten, Wiederkommen) hat
ihre sieben Sucher durchlaufen und **79 Befunde** geliefert; die Gegenprüfung
war erst bei acht, als die Sitzung endete.

Diese Befunde lagen ausschließlich im Container. Ohne dieses Dokument wären
sie mit der Sitzung verloren gewesen – deshalb stehen sie hier, roh und
vollständig.

## Wie damit umzugehen ist

**Kein Befund hier ist belegt.** Am selben Tag hat sich in der ersten Analyse
gezeigt, wie nötig die Gegenprüfung ist: Von 30 Befunden hielten 14, und
mehrere der verworfenen klangen überzeugend – einer zitierte als „Beweis"
wörtlich den Kommentar der Behebung, ein anderer maß eine Kurve, die in der
Produktionskette gar nicht läuft. Meine eigene Messung an diesem Tag lief
ebenfalls einmal ins Leere: 80 Sekunden Klick-Timeouts sahen aus wie „die
Klassenwahl ist nicht klickbar" und waren mein Werkzeug.

Also: **erst nachmessen, dann anfassen.** Für jeden Befund gilt die Reihenfolge
aus der ersten Analyse – stimmt die Zeile, fängt es eine andere Schicht ab,
ist es Absicht (`docs/GOAL.md`), ist das Szenario erreichbar, stimmen die
Zahlen.

Und: Was `docs/GOAL.md` als offen und als Sams Entscheidung führt, ist kein
Befund – Rundenlänge, Sichtfeld-Standard, der 0,45-gegen-0,5-Punktestand, die
Klassenwahl auf halbhohen Fenstern. Balance gehört Sam, nicht der Analyse.

## Was schon erledigt ist

Sechs Befunde aus dieser Liste sind am 12.08. bereits behoben und stehen hier
nur noch der Vollständigkeit halber: das abgeschaltete Erfolgssystem (29), der
`npm run dev`-Hinweis im Startscreen (36), die 29-Klassen-Visitenkarte (23/35),
die leere Bestenliste als „nicht eingerichtet" (39), die doppelten Bot-Namen
(46) und das fehlende PWA-Manifest (47).

## Die Befunde


### Schwere: hoch (36)


#### 1. Treffer am Gegner haben einen Kanal, Treffer an einem selbst haben drei

`apps/client/src/main.ts:507` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** playSnapshotAudio (main.ts:507-523) kennt genau drei Ereignisse am eigenen Tank: eigener Schadenseinschlag (audio.damage + shake), eigener Kill, eigener Tod. Ein Ereignis "ich habe getroffen" existiert nicht — von acht Audio-Aufrufstellen im ganzen Client (grep 'audio.(shot|module|damage|kill|death|level|eventHorn|bounty)' = 8 Treffer) ist keine ein Treffer-Bestaetiger. Im Renderer bleibt fuer den getroffenen Gegner uebrig: ein weisser Kreis r=26 mit Alpha 0.62, der ueber 130 ms ausblendet (renderer.ts:462 und :600), und eine Fliesszahl in 0xffe9b0, Groesse 12 (renderer.ts:464). Kein Partikel am Einschlagpunkt (Spieler bekommen einen Burst nur beim Tod, renderer.ts:468), kein Erschuetterungsimpuls, kein Ton, und das Fadenkreuz (renderer.ts:1044-1051) wechselt nur den Radius 10->12 bei gedrueckter Taste, nie bei einem Treffer. Formen bekommen sogar mehr: 3 Partikel je Schadensereignis (renderer.ts:545). Projektile verschwinden beim Aufschlag ersatzlos aus der Map (renderer.ts:512) — es gibt gar keinen Einschlagseffekt.

**Szenario:** Spieler haelt mit einem Gatling (6 Rohre, 7,4 Schuss/s voll ausgebaut) auf einen fliehenden Gegner, der halb hinter einer Wandkante steht. Er sieht: eine 12-px-Zahl in blassem Gelb, die 0,75 s lang nach oben treibt, und ein 130-ms-Aufblitzen auf dem Teil des Tanks, der nicht verdeckt ist. Hoert: nichts. Spuert: nichts. Bei 30 Snapshots/s und 7,4 Schuss/s liegen zwischen zwei Zahlen 4 Bilder — der Spieler kann nicht sagen, ob er trifft oder danebenhaelt, und korrigiert nicht, weil ihm nichts sagt, dass es etwas zu korrigieren gibt.

**Vorschlag:** Drei billige Kanaele nachziehen, alle im Client aus vorhandenen Daten ableitbar (Gesundheitsabfall eines fremden Spielers ist in renderer.ts:461 schon erkannt): (1) kurzer heller Hitmarker im Fadenkreuz in drawCrosshair (renderer.ts:1044) — zwei Striche, 90 ms; (2) 2-3 Partikel am Trefferpunkt ueber particles.burst, dieselbe Zeile wie der Flash; (3) ein Treffer-Ton in audio.ts, kurz und hoch (z. B. tone(1180, 0.03, 0.014, 'triangle')), bewusst leiser als audio.damage, damit Dauerfeuer nicht ermuedet. Wichtig: nur ausloesen, wenn das eigene Projektil beteiligt war — sonst quittiert der Client fremde Duelle.


#### 2. Getroffen werden erschuettert doppelt so stark wie Toeten

`apps/client/src/main.ts:512` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** main.ts:512 schuettelt bei erlittenem Schaden mit min(6, 1.5 + Schaden*0.12). Ein Sniper-Treffer (38 Schaden, index.ts:252) ergibt 1,5+4,56 = 6,06 -> auf 6 gedeckelt. main.ts:516 schuettelt beim eigenen Kill mit fest 3. Der Belohnungsmoment ist also exakt halb so stark wie die Bestrafung, und weil shake() das Maximum nimmt statt zu addieren (renderer.ts:647), ueberschreibt der Kill einen laufenden Schadensruck nicht einmal. Im Ton dasselbe Verhaeltnis: audio.damage hat Spitzengain 0,03+0,035 = 0,065 plus 0,02 Rauschen (audio.ts:65-68), audio.kill 0,028 je Ton plus 0,022 Rauschen (audio.ts:70-75) — der Kill ist rund 1,7-fach leiser als der Schlag, den man einsteckt.

**Szenario:** Spieler gewinnt ein Duell gegen einen Deadeye: er kassiert unterwegs vier Treffer, jeder ruckt das Bild um +-6 px und knallt dumpf, dann setzt er den toedlichen Schuss. Der Bildschirm zuckt um +-3 px, ein leiser Dreiklang. Der lauteste Moment des Kampfes, den er GEWONNEN hat, war der Moment, in dem er am Verlieren war. Genau umgekehrt ist die Rangfolge, die ein Spieler nachher erinnert.

**Vorschlag:** Rangfolge umdrehen: Kill auf 5-6 hochziehen und mit einem zweiten Kanal koppeln (kurzer heller Zoom-Puls oder Flash am Bildrand), erlittenen Schaden auf ca. 4 deckeln — mehr braucht es nicht, weil dort ohnehin schon drei Kanaele laufen. Beim Ton den kill()-Gain auf ca. 0,045 anheben und den ersten Ton kraeftiger setzen; die Streak-Steigerung (audio.ts:71-72) bleibt darueber als zweite Stufe erhalten.


#### 3. Muendungsblitz, Rueckstossfeder und Schussknall haengen an der Serverantwort, nicht am Klick

`apps/client/src/renderer.ts:495` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** fireRecoil (renderer.ts:629) — die Feder aus recoil.ts, die eigens gebaut wurde, damit sich ein Schuss anfuehlt — wird ausschliesslich in syncProjectiles ausgeloest, wenn ein NEUES Projektil im Snapshot auftaucht (renderer.ts:495-501). Derselbe Snapshot-Vergleich loest den Ton aus (main.ts:524-528: 'projectiles.some(neu und ownerId===self)'). Die Vorhersage sagt nur Position, Geschwindigkeit und Signature voraus (prediction.ts:410-417) — Feuern ist nicht dabei. Verzoegerungsbudget bis zum ersten sicht- und hoerbaren Zeichen des eigenen Schusses: Eingabe-Intervall 25 ms (main.ts:548, 1000/tickRate), Servertick 40 Hz = 25 ms, Snapshot 30 Hz = 33,3 ms (GAME, index.ts:807-808) — im Mittel 41,7 ms, im schlechtesten Fall 83,3 ms, jeweils PLUS voller Roundtrip. Bei 60 ms RTT also 102 ms im Mittel, 143 ms Spitze. Ein voll ausgebauter Rapid feuert alle 92 ms (0,19 * 0,93^10).

**Szenario:** Spieler spielt Rapid, haelt die Maustaste und feuert 10,9-mal je Sekunde. Klick und Knall liegen bei 60 ms Ping mehr als einen ganzen Schusszyklus auseinander: Was er hoert und was das Rohr tut, gehoert zum vorletzten Klick. Auf einer Railway-Instanz mit Spielern aus zwei Zeitzonen (RTT 140 ms) sind es 182 ms — das ist die Schwelle, an der ein Mensch die Verzoegerung als 'die Waffe reagiert nicht' bewusst wahrnimmt. Das Spiel hat eine unterkritisch gedaempfte Feder fuer den Rohrrueckstoss gebaut und sie an die laengste Leitung im System gehaengt.

**Vorschlag:** Schuss-Feedback lokal ausloesen, sobald die Eingabe rausgeht und die lokale Nachladeuhr es erlaubt (dieselbe Stelle, an der prediction.record laeuft, main.ts:547): startRecoil + Muendungsblitz + audio.shot sofort, und in syncProjectiles den Blitz fuer eigene Projektile unterdruecken, wenn in den letzten ~150 ms bereits lokal ausgeloest wurde. Flugbahn und Schaden bleiben unangetastet serverautoritativ — vorhergesagt wird nur der Effekt, nicht die Wirkung. Bei Fehlvorhersage (Server hat nicht gefeuert) sieht man einen Blitz zu viel; das ist deutlich billiger als 100-180 ms Taubheit bei jedem Schuss.


#### 4. Ein Spieler-Kill hinterlaesst weniger auf dem Schirm als ein zerschossenes Quadrat

`apps/client/src/renderer.ts:551` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Die einzigen zwei Fliesszahlen im Spiel sind Schaden (renderer.ts:464) und Formen-Belohnung (renderer.ts:551, '+18' / '+45' / '+120' in Gold, Groesse 12-15). Fuer einen Spieler-Kill spawnt keine Zahl — obwohl der Server dafuer 130 + Level*18 XP vergibt (game.ts:572), auf Level 28 also 634 XP, das 35-Fache eines Quadrats. Was uebrig bleibt: 24 Partikel und ein Schockring beim Opfer (renderer.ts:468-469, feuert auch, wenn ein Fremder jemand anderen toetet), shake(3), audio.kill, und eine Zeile im Killfeed. Der Killfeed unterscheidet den eigenen Kill nicht vom fremden (ui.ts:772-795 setzt nur killer/victim als Text, keine 'self'-Klasse wie die Bestenliste in ui.ts:754) — und er ist unter 700 px Fensterhoehe komplett abgeschaltet: hud-layout.css:228-230 'display: none'. Auf einem 1366x768-Laptop (Sichtflaeche rund 650 px) existiert damit gar keine Textmeldung ueber einen Kill.

**Szenario:** Spieler auf einem 1366x768-Notebook jagt einen Level-30-Gatling zwanzig Sekunden lang durch drei Bahnen des Labyrinths und erlegt ihn. Auf dem Schirm: ein Partikelschwall dort, wo der Gegner war (derselbe, den er auch sieht, wenn zwei Bots sich gegenseitig toeten), ein leiser Dreiklang, ein 3-px-Ruck. Kein Name, keine Zahl, kein Wort. Zwei Sekunden spaeter schiesst er ein Quadrat ab und bekommt ein leuchtendes goldenes '+18'. Die Rangfolge auf dem Bildschirm sagt: das Quadrat war das Ereignis.

**Vorschlag:** (1) Beim eigenen Kill eine Fliesszahl am Ort des Opfers spawnen — dieselbe FloatingNumbers-Klasse, gross und in der eigenen Farbe, mit dem XP-Betrag; der Client kennt XP-Zuwachs und Kill-Zaehler bereits aus dem Snapshot-Vergleich in main.ts:514. (2) Eine kurze Mittenmeldung ('X ELIMINIERT', 900 ms) ausserhalb des Killfeed-Kastens, damit sie nicht an dessen Hoehenregel haengt. (3) Im Killfeed die eigene Zeile hervorheben, so wie renderLeaderboard es fuer die eigene Zeile schon tut (ui.ts:754).


#### 5. Schaden hat keine Richtung — und der Schuetze liegt oft ausserhalb dessen, was der Server liefert

`apps/client/src/gameplay-effects.ts:133` · verstaendlichkeit · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Alle vier Signale fuer 'ich wurde getroffen' sind richtungslos: audio.damage (78-Hz-Saegezahn, kein Panning, audio.ts:65), shake mit Zufallsversatz in x UND y (renderer.ts:609-610), der weisse Flash auf dem eigenen Tank (renderer.ts:462) und die Zahl darueber (renderer.ts:464). Die Vignette (ui.ts:619) ist ein Zustand ('unter 35 % Leben'), kein Ereignis, und liegt rundum. Gleichzeitig liefert der Server Entitaeten nur im Rechteck ENTITY_CULL_HALF = 848 x 498 (index.ts:828-831). Reichweiten dagegen: Sniper 1200 * 2,0 s = 2400 Einheiten, Deadeye 1350 * 2,1 s = 2835, mit 10 Punkten projectileRange (+6 % je Punkt) 4536 — das 5,3-Fache der halben Breite dessen, was der Client ueberhaupt zugestellt bekommt. Der Schuetze ist also regelmaessig nicht nur ausserhalb des Bildschirms, sondern ausserhalb der Daten. Im Snapshot steht zu einem Treffer nichts ueber den Urheber: PlayerSnapshot fuehrt nur killerName (index.ts:746), erst nach dem Tod. Dass die Codebasis den Kanal kennt, zeigt gameplay-effects.ts:133-147 — fuer die Royale-Zone wird ein Richtungspfeil gezeichnet, mit der ausdruecklichen Begruendung 'wer in die falsche Richtung laeuft, stirbt schneller, als wenn er stehen bliebe'. Fuer Beschuss gilt derselbe Satz und es gibt ihn nicht.

**Szenario:** Spieler farmt ein Fuenfeck bei vollem Leben. Ueber seinem Tank erscheint '-34', das Bild ruckt, ein dumpfer Schlag. Nichts auf dem Schirm sagt, aus welcher Richtung. Er dreht sich einmal um sich selbst, sieht niemanden (der Deadeye steht 2400 Einheiten entfernt, der Server schickt ihn gar nicht), farmt weiter, kassiert den zweiten und dritten Treffer und stirbt. Der Death-Screen meldet 'Eliminiert von Deadeye_7' — ein Tank, von dem er nie ein einziges Bild gesehen hat. Er hat nichts gelernt, was er beim naechsten Mal anders machen koennte; das ist die Sorte Tod, nach der man den Tab schliesst.

**Vorschlag:** Serverseitig zum Schadensereignis die Richtung mitgeben (ein Winkel je Treffer reicht, kein Positionsleck: der Angreiferwinkel relativ zum Opfer, gerundet). Clientseitig einen Trefferkeil am Bildrand zeichnen — dieselbe Mechanik wie der Zonenpfeil in gameplay-effects.ts:133-147, nur am Rand statt in der Mitte und mit 600 ms Nachleuchten. Zusaetzlich billig und ohne Serveraenderung: audio.damage ueber einen StereoPannerNode legen, sobald die Richtung da ist.


#### 6. Sechs der acht Signatures sind im Spielbild unsichtbar — auf Gegnern alle acht

`apps/client/src/renderer.ts:957` · verstaendlichkeit · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** renderer.ts:957 zieht den Signature-Balken nur, wenn 'view.isSelf' — bei jedem Gegner ist ratio null, obwohl PlayerSnapshot.signature fuer ALLE Spieler auf der Leitung liegt (index.ts:754, wird in renderer.ts:955 fuer die Specter-Tarnung fremder Tanks auch gelesen). Der eigene Balken ist 50 x 2 px in this.palette.self — derselben Farbe wie der eigene Tank (renderer.ts:960-961). Am Tank sichtbar wird der Fuellstand nur bei zwei Familien: SPECTER ueber die Deckkraft (renderer.ts:955-956, Gegner bis 85 % ausgeblendet) und PRECISION indirekt, weil der Ladebonus den Projektilradius um 40 % vergroessert. Fuer RAPID, IMPACT, TEMPEST, SIEGE, AEGIS und CONTROL zeichnet der Renderer nichts Familienspezifisches — die einzigen branch-Abfragen im ganzen Renderer sind renderer.ts:972-974 fuer die Rohrform, und die haengt an der Klasse, nicht am Fuellstand. Bleibt die HUD-Zeile ui.ts:259/537-544: ein Text 'STELLUNG 100 %' im linken Panel, also ausserhalb des Blickfelds waehrend eines Duells. Wirkung, um die es geht: SIEGE +59 % Schaden und Reichweite bei vollem Balken, TEMPEST +52 %, IMPACT +202 % Rammschaden (GOAL.md, FAMILY_SCALING).

**Szenario:** Spieler faehrt auf einen SIEGE zu, der seit vier Sekunden stillsteht und damit auf +59 % Schaden UND Reichweite sitzt. Er sieht denselben Tank wie einen SIEGE, der gerade angehalten hat. Es gibt kein Zeichen, das 'jetzt nicht' sagt. Umgekehrt kann er selbst im Kampf nicht ablesen, ob sein eigener Balken voll ist, ohne den Blick vom Fadenkreuz in die linke obere Ecke zu nehmen — und der 2-px-Streifen unter dem eigenen Tank hat die Farbe des Tanks, verschwindet also darin. Das Alleinstellungsmerkmal des Spiels ('echte Rollen statt nur unterschiedlich schneller Kugeln') existiert damit fuer den Spieler nur in der Statistik.

**Vorschlag:** Fuellstand in die Silhouette legen statt daneben: ein Randglimmen am Rumpf, dessen Deckkraft dem Verhaeltnis folgt, fuer ALLE Spieler (die Zeile renderer.ts:957 braucht nur das 'view.isSelf &&' zu verlieren, plus eine familienabhaengige Farbe). Der eigene Balken in einer Kontrastfarbe statt palette.self. Und mindestens fuer die Schwellenfamilien (SIEGE, PRECISION, TEMPEST) ein sichtbarer Sprung bei 100 % — ein kurzer Ring plus Ton, damit 'jetzt schiessen' ein Moment wird statt eines Prozentwerts.


#### 7. Die AEGIS-Entladung — die Auszahlung einer ganzen Familie — erzeugt kein einziges Zeichen

`apps/server/src/signature-aegis.ts:75` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Die Entladung trifft alles im Radius 240 mit 34-44 Schaden (signature-aegis.ts:71/75, powerBase 12 + 3,2 je Punkt laut family-upgrades.ts:101) und stoesst mit Impuls 520 weg — mehr als die Hoechstgeschwindigkeit jeder Klasse (340). Sie ist ausdruecklich automatisch, 'kein Knopf, keine Zieleingabe' (signature-aegis.ts:35). Auf der Leitung steht davon nichts: GameplayWorldExtension (gameplay.ts:202-220) und PlayerGameplaySnapshot (gameplay.ts:119-129) fuehren kein Entladungs-Ereignis, keinen Zeitstempel, keine Position. gameplay-effects.ts zeichnet fuer Repulse (Radius 195) einen vollen Ring mit Fuellung (Zeilen 201-205), fuer Barriere einen Bogen, fuer Repair einen wachsenden Kreis — fuer die 240er-Entladung nichts, weil sie nichts zu zeichnen hat. Kein Aufrufpunkt in audio.ts, kein shake.

**Szenario:** Spieler waehlt AEGIS, weil die Familie das Versprechen traegt, die einzige zu sein, die getroffen werden WILL. Er faehrt in drei Gegner hinein, kassiert 71,5 Schaden — die Haelfte seines Lebens — und die Ladung zuendet. Auf dem Schirm: drei Gegner blitzen kurz weiss auf, bekommen '-44' und rutschen weg. Kein Ring, kein Knall, kein Ruck, kein Licht an der eigenen Stelle. Das einzige Zeichen, dass er etwas ausgeloest hat, ist, dass ein 2 px hoher Balken unter seinem Tank von voll auf leer springt. Ein Spieler, der die Doku nicht gelesen hat, haelt es fuer einen Zufall und wird nie lernen, den Zeitpunkt zu steuern.

**Vorschlag:** Ein Einmal-Ereignis in den Snapshot haengen (Position, Radius, Tick) — die Kosten sind vernachlaessigbar, weil es je Entladung genau einmal auftritt; das Muster steht bereits mit arenaEvent bereit. Clientseitig den vorhandenen ShockRing benutzen (renderer.ts:469, maxRadius 240 statt 86), einen Partikelburst in AEGIS-Farbe, shake(4) fuer den Traeger und einen tiefen Ton in audio.ts. Dasselbe Ereignisformat traegt spaeter jede weitere Signature mit einem Ausloesemoment.


#### 12. Die Klassenwahl zeigt am entscheidenden Moment nur ein 34x32-Pixel-Bild und ein Wort

`apps/client/src/hud-layout.css:628` · verstaendlichkeit · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `.class-selection .class-choices button > span:not([class]), .class-choice-perk, .class-choice-bars, .class-selection .class-choices small, .class-choice-leads { display: none; }` (Zeilen 628-632, ohne Media-Query, gilt also immer). Im echten Browser gemessen (Playwright, Level 5, core, Server auf 2701): Desktop 1920x1080 -- Bild sichtbar 34x32 px, Name 94x14 px, Rollenwort 94x9 px; Beschreibung, Balken, `LEVEL 5` und `fuehrt zu ->` je `display:none`. Auf 844x390 faellt zusaetzlich das Rollenwort weg (mobile.css:368), es bleiben Bild 28x26 und Name 76x13. Damit ist `class-choice-enhancer.ts` komplett unsichtbar: Es rechnet `classBalanceMetrics()` fuer acht Klassen, baut vier Balken, die Perk-Zeile und die Zielliste -- und `#class-choices` liegt ausschliesslich in `.class-selection`, also ist nichts davon je zu sehen. Der laengste Kommentar der Datei (Zeilen 31-50, ueber Octo und `forwardProjectileDps`) begruendet die Genauigkeit eines Balkens, den niemand sieht. Was GOAL.md als das Entscheidende benennt -- die Fuellbedingung der Signature -- steht ueberhaupt nicht auf der Karte: Der Text existiert (`class-tree.ts:57-122`, `builds`/`pays`), erscheint aber nur in `renderClassCard` (class-wheel.ts), also im Rad auf Taste C.

**Szenario:** Ein Fremder erreicht Level 5 (gemessen nach 10,2 s bzw. 20,5 s in zwei Laeufen). Rechts unten klappt "NEUE SPEZIALISIERUNG -- 8 Wege offen" auf. Er sieht acht fast gleich aussehende Kaertchen: ein daumennagelgrosses Symbol, "Rapid DAUERFEUER", "Siege STELLUNG", "Aegis SCHILD". Kein Satz, kein Wert, keine Reichweite, kein Hinweis, was danach kommt. Er klickt eines, weil er raten muss -- und erfaehrt nie, dass SIEGE Stillstand belohnt und RAPID Bewegung, obwohl genau dieser Satz im Code steht.

**Vorschlag:** Statt der vier Balken (die in der Ecke ohnehin nicht lesbar waeren) die eine Zeile auf die Karte holen, die den Unterschied macht: `familyInfo(branch).builds` gekuerzt, z. B. "Laedt: stillstehen" / "Laedt: fahren und feuern". Eine Zeile a 11 px kostet je Karte rund 14 px Hoehe -- deutlich weniger als die vier Balken (13 px Abstand + 4x11 px), die heute erzeugt und verworfen werden. Alternativ die Karte beim Ueberfahren/Antippen aufklappen lassen, statt den Inhalt global zu loeschen.


#### 13. Auf dem Handy legt die automatisch aufklappende Klassenwahl Sticks und Faehigkeit still

`apps/client/src/hud-layout.css:757` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `@media (pointer: coarse) and (orientation: landscape) and (max-height: 440px)` (Zeile 743) setzt fuer `:root:has(.class-selection:not([hidden])[data-collapsed='false'])` auf `.move-stick`, `.aim-stick`, `.auto-fire`, `.secondary-action` und `.core-ability` `opacity: 0; pointer-events: none` (Zeilen 752-758). Im Browser gemessen (844x390, hasTouch, Level 5, core): `#move-stick` und `#aim-stick` beide `pointer-events: none / opacity 0`, `.core-ability` ebenso. Aufgeklappt wird ohne Zutun des Spielers: `ui.ts:679` setzt `dataset.collapsed = 'false'`, sobald sich die Auswahlliste aendert. Alle fuenf Handy-Formate der Projekt-Matrix liegen darunter (667x375 bis 932x430, GOAL.md Zeile 54) -- die Regel greift also immer, nie nur im Grenzfall. Die Layout-Matrix deckt genau diese Kombination nicht ab: `wahl-touch` ist 900x500 (ueber 440), `wahl-zu-touch` ist 844x390 aber zugeklappt (ui-layout-check.mjs:486 und 494). Der Fall "Touch, <=440 px, Wahl offen" fehlt. Wie oft er eintritt, ist gemessen: In einem 600-s-Lauf 12 Tode, nach jedem Respawn steht die Klasse wieder auf `core` und die acht Starter sind wieder waehlbar -- also rund zwoelfmal in zehn Minuten.

**Szenario:** Jemand oeffnet die Seite auf dem Handy im Querformat, joint, faehrt los, ballert Formen. Nach zehn bis zwanzig Sekunden ist er Level 5. Ohne dass er etwas beruehrt hat, klappt die Klassenwahl auf -- und beide Daumen wirken nicht mehr: Der Tank steht mitten in der Arena, waehrend ein Bot auf ihn zufaehrt. Er sucht das kleine Kreuz oder tippt hektisch eine Karte an, um wieder fahren zu duerfen. Nach dem naechsten Tod passiert dasselbe, und das rund zwoelfmal in den ersten zehn Minuten.

**Vorschlag:** Auf Touch nicht automatisch aufklappen: `data-collapsed` beim Erscheinen einer neuen Auswahl auf `'true'` setzen, wenn `matchMedia('(pointer: coarse)')` greift -- die Leiste "NEUE KLASSE - 8 Wege offen" ist 42 px hoch und faellt trotzdem auf. Wer sie antippt, akzeptiert den Stillstand bewusst. Zusaetzlich den Fall in die Matrix aufnehmen (touch, 844x390, Wahl offen) und dabei nicht nur Flaechen, sondern `pointer-events` der Sticks werten.


#### 14. Nach den ersten Hinweisen bleibt `onboarding-active` haengen -- auf dem Handy zehn Minuten ohne Bestenliste und ohne Event-Banner

`apps/client/src/onboarding-view.ts:85` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `update()` setzt `document.documentElement.classList.add('onboarding-active')` (Zeile 108), entfernt sie aber nur in `finish()` (Zeile 160). Der Zweig `if (!step || self.dead) { ... return; }` (Zeilen 85-89) verlaesst die Methode ohne Aufraeumen. `activeStep` liefert `null`, sobald die Grundlagen sitzen und gerade kein Arena-Event laeuft; `isOnboardingComplete` wird dann NICHT wahr, weil der Schritt `event` erst nach `eventHintShownMs >= 6000` als erledigt gilt (onboarding.ts:113) -- bis dahin greift erst die harte Grenze `ONBOARDING_EVENT_WINDOW_MS = 600_000`, also zehn Minuten. Im Browser nachgestellt (844x390, hasTouch, 75 s spielen, Autofeuer, Space, Punkt vergeben): `.onboarding` `hidden=true`, aber `html.onboarding-active=true`, `.leaderboard` `display:none`, `.arena-event-banner` `display:none` (onboarding.css:163-165). Auf dem Desktop bleibt derweil `--top-stack-start` auf `calc(edge-y + 150px)` statt `+ 42px` (onboarding.css:116 gegen gameplay-ui.css:101) -- gemessen `calc(calc(0px + 18px) + 150px)`; die ganze obere Spalte inklusive Royale-Leiste (royale.css:17) steht 108 px zu tief. Bosartig wird es beim Event-Hinweis selbst: Sein Text lautet "Der Banner oben nennt, was gerade gilt" und sein `focus` zeigt auf `.arena-event-banner` (onboarding.ts:110-111) -- genau das Element, das dieselbe Klasse auf Touch ausblendet.

**Szenario:** Ein Neuling spielt auf dem Handy. Nach etwa 35 Sekunden ist der letzte Grundlagen-Hinweis weg, die Karte verschwindet -- und die Bestenliste kommt nicht wieder. Er sieht bis zu zehn Minuten lang keine Rangliste und kein Arena-Event. Wenn dann endlich ein Event laeuft, erscheint eine Karte, die ihm sagt, er solle den Banner oben lesen; oben ist nichts. Sechs Sekunden spaeter verschwindet die Karte und der Banner erscheint.

**Vorschlag:** Im Fruehausstieg dieselbe Aufraeumzeile setzen wie in `finish()`: `document.documentElement.classList.remove('onboarding-active')`, sobald `step === null` oder der Spieler tot ist. Die Klasse gehoert an "gerade steht eine Karte", nicht an "das Onboarding ist noch nicht abgeschlossen". Ein Test dazu gehoert in `onboarding.test.ts` -- die Datei prueft heute ausschliesslich die reine Logik, den View gar nicht.


#### 15. Der Tod nimmt die Haelfte des Punktestands und die ganze Klasse -- und kein Text sagt es

`apps/server/src/combat-tuning.ts:284` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `respawn` setzt `player.score = Math.floor(player.score * 0.5)` (Zeile 284) und `player.playerClass = respawnClassFrom(...)` -> immer `core` (Zeile 276), dazu `player.upgrades = EMPTY_UPGRADES()` (Zeile 283). Gesagt wird davon nichts: Der Toast lautet `Run beendet / Du startest auf Level ${self.respawnLevel} neu.` (ui.ts:652) -- nur das Level. Die Bilanz auf dem Death-Screen zeigt `Erreicht`, `Neustart`, `Score`, `Kills`, `Ueberlebt`, `Beste Streak` (ui.ts:718); das Feld `Score` traegt den vollen Wert VOR der Halbierung, weil die Halbierung erst beim Respawn passiert. Das Portrait darueber zeichnet `classPreviewSvg(self.playerClass)` -- also den Tank, den man gerade verliert. Gemessen (600-s-Lauf gegen den echten Server): `TOD #3 auf Level 22 -> Neustart Level 11, Score 2840` und zweieinhalb Sekunden spaeter `RESPAWN auf Level 11, Klasse core, Score 1420`. Zwoelfmal in zehn Minuten dasselbe Muster, jedes Mal Klasse `core`. Dass die Regel selbst so gewollt ist (GOAL.md, Sams Befund vom 07.08.), steht nicht zur Debatte -- ihre Kommunikation schon.

**Szenario:** Der Neuling hat sich zu Rapid entschieden, spielt zwei Minuten, kommt auf Level 22 und 2.840 Punkte. Er stirbt. Die Karte gratuliert ihm zu 2.840 Punkten und sagt, er starte auf Level 11 neu. Er drueckt RESPAWN -- und sitzt in einem Core-Tank, alle Upgrade-Pips leer, 1.420 Punkte. Nichts davon war angekuendigt, nichts davon wird erklaert. Er haelt es fuer einen Fehler oder fuer Willkuer.

**Vorschlag:** Zwei Saetze, keine Regelaenderung: Toast auf `Du startest auf Level ${respawnLevel} als Core neu -- die Haelfte deines Scores bleibt.` erweitern und in der Death-Bilanz die Kachel `Neustart` um die beiden Zahlen ergaenzen, die der Server ohnehin kennt (`Level ${respawnLevel} - Core - ${Math.floor(score*0.5)} Score`). Zusaetzlich waere das Portrait ehrlicher, wenn es den Tank zeigt, mit dem es weitergeht.


#### 16. Nichts in den ersten zehn Minuten sagt, dass Spieler-Kills der eigentliche Fortschritt sind -- gemessen: null Kills in fuenf Minuten

`apps/client/src/onboarding.ts:61` · inhalt · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `ONBOARDING_STEPS` kennt sechs Schritte: `move`, `specialize`, `upgrade`, `farm`, `event`, `ability`. Kein einziger erwaehnt andere Spieler; `farm` sagt "Zerlege die Formen -- sie geben XP" (Zeile 100/101). Die Zahlen sagen etwas anderes: Ein Abschuss bringt `130 + target.level * 18` Basis-XP (game.ts:572), bei einem Level-10-Gegner also 310 Score und, mit `XP_MULTIPLIER = 5` (progression-tuning.ts:9), 1.550 XP. Eine Form bringt im Mittel 153 XP (Wuerfel 70 % / Dreieck 24 % / Fuenfeck 6 % aus world.ts:143 mal `reward` 18/45/120 mal 5). Ein Kill ist also gut zehn Formen wert -- und er ist die einzige Quelle fuer Streak-Toasts, Killfeed-Eintraege und sechs der sieben Achievements. Gemessen mit einem Skript, das genau das tut, was das Onboarding lehrt (naechste Form ansteuern, Dauerfeuer, sofort respawnen, Punkte vergeben, mit Level 5 eine Klasse waehlen): 300 s -> **0 Kills, 6 Tode, beste Streak 0**, Score 1.496. In einem zweiten 600-s-Lauf dasselbe Bild.

**Szenario:** Ein Fremder folgt brav den Hinweisen: bewegen, schiessen, Formen zerlegen, Punkte verteilen, Klasse waehlen. Nach fuenf Minuten hat er sechsmal den Death-Screen gesehen und keinen einzigen Gegner besiegt. Die Killfeed-Zeilen oben links nennen nur fremde Namen, die Streak-Toasts kennt er nur vom Hoerensagen, und die Achievement-Seite steht auf 0/7. Er hat gelernt, dass dieses Spiel darin besteht, Dreiecke abzuschiessen und regelmaessig zu sterben.

**Vorschlag:** Einen siebten Schritt nach `farm` einhaengen, der erst ab etwa 45 s relevant wird und beim ersten Kill als erledigt gilt: "Ein Abschuss bringt so viel XP wie zehn Formen -- such dir einen, der schwaecher aussieht als du." Er kostet nichts an Mechanik und macht sichtbar, wofuer der Killfeed da ist. Ergaenzend die Kill-Belohnung als Zahl im Spielfeld zeigen (wie die `+45` beim Formen-Abschuss, die es schon gibt).


#### 25. Die erste Klassenwahl faellt nach zwei Sekunden – vor dem ersten Gegner

`packages/shared/src/index.ts:836` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Kurve: xpThresholdForLevel(4) = 507 XP fuer Level 5. Eine einzige Pentagon zahlt SHAPE_CONFIG.pentagon.reward 120 x XP_MULTIPLIER 5 (apps/server/src/progression-tuning.ts:9) = 600 XP – also aus dem Stand sofort Level 5. Gemessen mit einem echten WS-Client, der nur zur naechsten Form faehrt und feuert (kein Kampf, kein Ausweichen): Level 2 nach 0,1 s, LEVEL 5 NACH 2,0 s, Level 8 nach 5,9 s, Level 10 nach 9,7 s. Die Bots im selben Server (BOT_COUNT=18, frischer Prozess) standen nach 5 s bei Level 7 bis 10 – alle achtzehn. Anteil an der gesamten Levelkurve: xpAtLevelStart(5)/xpAtLevelStart(60) = 507/168.595 = 0,30 %.

**Szenario:** Ein neuer Spieler joint, haelt die Maustaste, faehrt in zwei Formen. Nach zwei Sekunden klappt die Klassenwahl auf und legt ihm acht Familienkarten hin – 'RAPID: fahren und feuern', 'SIEGE: stillstehen', 'AEGIS: Treffer einstecken wollen'. Gleichzeitig steht der Onboarding-Hinweis noch auf 'Beweg dich' (apps/client/src/onboarding.ts:72, laeuft bis 14 s). Er hat noch keinen Gegner gesehen, keinen Schuss kassiert und keine Ahnung, was der Unterschied zwischen den acht Karten fuer ihn bedeutet. Also klickt er die erste oder schliesst den Kasten – und die Entscheidung, die im Nordstern als Herzstueck steht ('viele Tanks mit echten Rollen'), ist ein Zufall. Diep.io gibt dieselbe Entscheidung auf Level 15 nach ein bis zwei Minuten, wenn der Spieler seine Grundwaffe kennt.

**Vorschlag:** Die ersten Stufen strecken, statt die unlockLevel zu verschieben: Der kubische Term (0,55 L^3) traegt bei L<=5 fast nichts, deshalb kostet Level 5 nur 507 XP. Ein additiver Sockel in xpThresholdForLevel (z. B. + 900 x L auf den ersten zehn Stufen) legt die erste Familienwahl auf rund 45–60 s Farmen, ohne die Kurve oben anzufassen. Alternativ XP_MULTIPLIER von 5 auf 1–2 senken und die Formenwerte anheben – dann steckt die Streckung an einer Stelle statt in zwei Faktoren.


#### 26. Die letzten 61 % des Laufs schalten nichts frei – und niemand kommt dort an

`packages/shared/src/index.ts:810` · inhalt · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Letztes Klassentor ist unlockLevel 42 (packages/shared/src/index.ts:446 ff., acht Apex-Klassen). xpAtLevelStart(42) = 65.499, xpAtLevelStart(60) = 168.595. Nach dem letzten Freischalten liegen also 103.096 XP = 61,2 % des gesamten Laufs, in denen es keine neue Klasse, keinen Erfolg und nichts ausser +1 Punkt je Level gibt. Bei der gemessenen Rate von rund 200 XP/s sind das 8,6 Minuten; die Levelkosten steigen dabei von 4.145 auf 7.460 XP je Stufe (20,7 s auf 37,3 s). Ob dort ueberhaupt jemand ankommt: 10 Minuten Beobachtung eines laufenden Servers, 19 Spieler-IDs verfolgt – hoechstes je erreichtes Level 47 (bei t=568 s), kein einziger Lauf darueber. Durchschnittlich laengstes Leben 184 s, es endete im Mittel auf Level 31,8. Level 60 braucht 168.595 XP = 843 s ununterbrochenes Farmen, also das 4,6-fache des besten beobachteten Lebens.

**Szenario:** Ein Spieler, der es bis Level 42 schafft, waehlt seinen Apex – die letzte Karte, die das Klassenrad (Taste C) ueberhaupt kennt. Danach zaehlt die Zahl neben dem Tank weiter, jede Stufe dauert laenger als die davor, und das Rad hat nichts mehr zu zeigen. Der Erfolg 'Ausgereizt' auf Level 60 (apps/server/src/achievements.ts:79) ist das einzige, was oben noch wartet, und in 10 Minuten Messung hat ihn niemand erreicht. Praktisch besteht mehr als die Haelfte der Levelkurve aus Inhalt, den kein Spieler je sieht – und der Teil, den er sieht, endet ohne Ziel.

**Vorschlag:** GAME.maxLevel an das anpassen, was der Inhalt und die Messung hergeben: 45 statt 60 – dann endet die Kurve dort, wo das letzte Klassentor liegt und wo die Messung die realistische Obergrenze zeigt (47). Wer die 60 behalten will, braucht dazwischen etwas: ein weiteres Klassentor bei 50 oder Belohnungen, die nicht am Level haengen.


#### 27. Zwei der vier Klassentore haben genau eine Karte – 'Weg offen', Einzahl

`packages/shared/src/index.ts:969` · inhalt · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Verzweigung ueber availableClassChoices ausgerechnet: Level 5 acht Wahlen (die acht Familien-Starter). Level 15 vier Wahlen bei rapid/precision/control/impact, zwei bei specter/tempest/siege/aegis. LEVEL 28: GENAU EINE WAHL fuer jeden der 24 Pfade – es gibt 24 Stufe-2-Klassen und 24 Stufe-3-Klassen, jede Stufe-2 hat exakt ein Kind. LEVEL 42: GENAU EINE WAHL – ein Apex je Familie. Was diese beiden Tore kosten: L15->L28 sind 18.065 XP = 10,7 % des Laufs, L28->L42 sind 42.173 XP = 25,0 % des Laufs. Der Zaehler im Client schreibt in beiden Faellen woertlich '1 Weg offen' (apps/client/src/ui.ts:681, choices.length === 1 ? 'Weg' : 'Wege'). Ein Lauf ohne Tod beruehrt damit 5 der 65 Klassen (core + Starter + Stufe 2 + Stufe 3 + Apex), und es gibt insgesamt nur 24 verschiedene Pfade durch den Baum.

**Szenario:** Ein Spieler farmt dreieinhalb Minuten von Level 28 auf 42 – das ist ein Viertel des ganzen Laufs. Das Panel klappt auf, es steht eine einzige Karte darin, daneben '1 Weg offen'. Er klickt sie, weil es nichts anderes zu klicken gibt. Dasselbe schon auf Level 28. Die beiden teuersten Entscheidungen des Laufs sind keine Entscheidungen, sondern Bestaetigungsknoepfe – waehrend die billigste (Level 5, nach 2 Sekunden) acht Optionen hat. In Diep.io gabelt jede Stufe: Tank -> drei Wege -> drei bis vier Wege, und die Gabelung wird nach oben hin breiter, nicht schmaler.

**Vorschlag:** Die 24 Stufe-3-Klassen so umhaengen (Feld `parent`), dass jede Stufe-2-Klasse mindestens zwei Kinder hat – heute ist es eine 1:1-Kette. Bei 24 zu 24 heisst das: einige Stufe-2-Klassen bekommen zwei Kinder, andere keins und werden zur Sackgasse mit Apex-Zugang (den `apexOf` ohnehin aus jeder Klasse der Familie erlaubt). Fuer L42 dasselbe Muster: mehr als einen Apex je Familie, oder den Apex als echte Wahl gegen ein zweites Stufe-3-Ziel stellen.


#### 28. Der Tod nimmt 84 % des Fortschritts – der Bildschirm sagt 'halbes Level'

`packages/shared/src/index.ts:839` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** respawnLevelFrom halbiert das LEVEL, die Kurve ist kubisch. Behaltener Anteil der kumulierten XP, gerechnet als xpAtLevelStart(floor(L/2)) / xpAtLevelStart(L): L10->5 = 23,7 %, L20->10 = 20,8 %, L30->15 = 19,0 %, L42->21 = 17,6 %, L60->30 = 16,4 %. Auf keiner Stufe zwischen 10 und 60 liegt der Behalt in der Naehe der Haelfte. In Zeit: Wer auf Level 60 stirbt, muss 140.885 XP nachholen = 11,7 Minuten bei 200 XP/s – gegenueber 14,0 Minuten fuer den ganzen Lauf. Der Death-Screen zeigt dazu 'Erreicht Level 60' neben 'Neustart Level 30' (apps/client/src/ui.ts:718) und der Toast 'Du startest auf Level 30 neu' (ui.ts:652). Beide Zahlen legen 'die Haelfte' nahe; nirgends steht die XP.

**Szenario:** Ein Spieler ueberlebt vierzehn Minuten, kommt auf Level 60 und stirbt. Er liest 'Neustart Level 30' und denkt: halb so schlimm, die Haelfte ist noch da. Er drueckt Respawn, farmt zehn Minuten – und ist immer noch nicht dort, wo er war. Die Zahl auf dem Bildschirm hat ihm eine Rechnung versprochen, die die Kurve nicht einloest. Genau an dieser Stelle entscheidet sich, ob er ein drittes Mal drueckt oder den Tab schliesst.

**Vorschlag:** Entweder ehrlich rechnen: respawnLevelFrom auf die XP beziehen statt auf das Level (das Level suchen, dessen xpAtLevelStart der Haelfte der bisherigen XP entspricht – auf L60 waere das rund L47 statt L30). Oder ehrlich beschriften: im Death-Screen nicht nur 'Neustart Level 30', sondern was das kostet ('du behaeltst 16 % deiner XP' oder 'rund 12 Minuten Farmen').


#### 29. Das Erfolgssystem ist im Auslieferungszustand abgeschaltet

`apps/server/src/index.ts:170` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `const ACHIEVEMENTS_ENABLED = process.env.ACHIEVEMENTS_ENABLED === 'true';` – Opt-in, nicht Opt-out. .env.example:52 setzt ACHIEVEMENTS_ENABLED=false, docker-compose.yml fuehrt die Variable im environment-Block gar nicht, railway.json auch nicht. Gegengeprueft am laufenden Server: /health meldet "achievements": false. Damit feuert keiner der sieben Erfolge aus apps/server/src/achievements.ts:65 ff., inklusive der beiden einzigen, die an Fortschritt haengen: 'Fuenfstellig' (10.000 Score = 50.000 XP = Level 37, rund 4,2 Minuten) und 'Ausgereizt' (Level 60). Die Schicht wird bei ausgeschaltetem Schalter nicht einmal angehaengt (index.ts:517). Zum Vergleich: Die beiden Bandbreiten-Schalter wurden ausdruecklich auf Opt-out umgestellt (docs/GOAL.md, 'Was fehlt' Punkt 1) – der einzige Belohnungsschalter blieb Opt-in und wird von keiner Deploy-Datei gesetzt.

**Szenario:** Ein Spieler laeuft eine Serie von fuenf Abschuessen, erlegt den Guardian, spielt drei Familien in einer Verbindung – und bekommt kein einziges Popup. Sein Profil-Panel bleibt leer. Ausser der Levelzahl und dem Score, die beide beim Tod zurueckgesetzt werden, gibt es nichts, was einen Lauf von einem anderen unterscheidbar macht. Das ist genau die Frage der dreizehnten Zeile im Nordstern: warum sollte er morgen wiederkommen?

**Vorschlag:** Den Schalter wie die Bandbreiten-Schalter auf Opt-out drehen (`!== 'false'`) und .env.example auf true stellen. Die Schicht ist laut ihrem eigenen Kopfkommentar rein beobachtend, kostet also nichts; ohne Supabase gilt der Fortschritt eben je Verbindung – das ist immer noch unendlich viel mehr als gar nichts.


#### 35. Die Visitenkarte des Spiels verspricht 29 Klassen – es sind 65, und die drei Modi fehlen ganz

`apps/client/index.html:8` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** index.html:8 (meta description) und index.html:16 (og:description) nennen beide „29 Tankklassen". Gemessen aus dem Build: `PLAYER_CLASS_IDS.length === 65`, `Object.keys(CLASS_DEFINITIONS).length === 65`. Der Text untertreibt um 36 Klassen (55 %). Ausserdem fehlen FFA und Battle Royale komplett – beide sind laut GOAL.md seit dem 11.08. fertig. Der Client weiss es besser: start-nav.ts:39 baut denselben Satz dynamisch (`Alle ${PLAYER_CLASS_IDS.length} Klassen`); nur die statische HTML-Datei ist stehen geblieben.

**Szenario:** Jemand teilt mazers.de in Discord oder WhatsApp. Die Vorschaukarte, die der Empfaenger sieht – das einzige, was er vor dem Klick liest –, sagt „Farmen, leveln, 29 Tankklassen, Arena-Events". Dieselbe Zeile steht im Google-Snippet. Das Spiel verkauft sich mit weniger als der Haelfte dessen, was es hat, und erwaehnt seinen groessten Zuwachs (drei Modi) nicht.

**Vorschlag:** Den Satz aus derselben Quelle erzeugen wie start-nav.ts (Vite-Define oder ein kleines Build-Skript, das `PLAYER_CLASS_IDS.length` in index.html einsetzt), damit die Zahl nicht ein zweites Mal veralten kann. Modi in beide Beschreibungen aufnehmen.


#### 36. Ist der Server aus, sagt der Startscreen dem Spieler, er solle `npm run dev` pruefen

`apps/client/src/main.ts:368` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** main.ts:368: `ui.setJoinPending(false, 'Server nicht erreichbar. Pruefe, ob npm run dev noch laeuft.')`. Der Zweig haengt an `if (!enteredGame)` im `close`-Handler (main.ts:367) – also genau am ersten Verbindungsversuch, dem einzigen, den ein Erstbesucher erlebt. Keine Umgebungspruefung, kein `import.meta.env.DEV` davor; die Zeile laeuft in Produktion genauso. Der Text landet ueber `setJoinPending` in `#join-status` (ui.ts:177), gross und rot unter dem Play-Knopf (`joinStatus.classList.toggle('error', …)`, ui.ts:456).

**Szenario:** Ein Fremder oeffnet mazers.de waehrend eines Railway-Deploys oder Neustarts. Er drueckt ARENA BETRETEN, es passiert nichts, und unter dem Knopf steht eine Anweisung an einen Entwickler auf einem anderen Rechner. Der einzige Moment, in dem das Spiel mit ihm spricht, verraet, dass er in jemandes Werkstatt steht.

**Vorschlag:** Zwei Texte trennen: In DEV der Hinweis auf `npm run dev`, in Produktion etwas, das der Spieler tun kann – „Die Arena ist gerade nicht erreichbar. In ein paar Sekunden noch einmal versuchen." plus ein Wiederholen-Knopf.


#### 38. Auf dem Handy sieht der Spieler nichts von seinen Gegnern: keine Bestenliste, kein Killfeed, keine Minimap

`apps/client/src/style.css:65` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** style.css:62–65 traegt den Kommentar „Uebergangsloesung bis zum Mobile-Paket (MASTERPLAN R3)" und darunter `@media (pointer:coarse){.leaderboard{display:none}.network-pill{display:none}}`. Das Mobile-Paket ist seither gebaut (mobile.css, 403 Zeilen, Kopf: „Touch-Layout (MASTERPLAN R3)"), die Uebergangsloesung steht trotzdem noch – und keine spaetere Regel hebt sie auf (`grep '\.leaderboard' *.css`: 8 Treffer, kein `display:block` fuer coarse). Sie macht drei fertige Regeln tot: style.css:49 (`.leaderboard{width:220px}` fuer coarse), mobile.css:61 (Hintergrund fuer coarse) und mobile.css:374 mit dem Kommentar „Auf kleinen Screens zaehlt nur die Spitze der Rangliste" – eine Regel, die die Top 4 zeigen will und nie greift. Dazu: `.killfeed{display:none}` bei `max-width:900px` (style.css:54) und noch einmal in mobile.css:283, `.minimap{display:none}` (mobile.css:286, erst per Tipp auf die Statusleiste sichtbar). Der rechtfertigende Kommentar mobile.css:282 („Kills stehen im Meldungs-Slot") stimmt nicht: Der Meldungs-Slot (mobile.css:299 ff.) traegt Event, Bounty, Achievement und Toast – und kein einziger `ui.toast(...)`-Aufruf im Client meldet den Abschuss eines fremden Spielers.

**Szenario:** Ein Spieler oeffnet MAZERS auf dem Handy im Querformat (alle fuenf Formate der Harness sind `pointer:coarse`). Er sieht seinen Tank, seine Leiste, seine Sticks – und sonst nichts ueber die Arena. Er erfaehrt nie, wer fuehrt, auf welchem Platz er steht, ob gerade jemand gestorben ist oder wer ihn gleich rammt. Genau die Zahl, die einen bei Diep.io eine Runde laenger halten laesst („noch zwei Plaetze"), existiert auf dem Handy nicht. Die Layout-Harness bleibt dabei gruen: Ein Panel mit `display:none` ueberlappt nichts.

**Vorschlag:** Die Uebergangsloesung streichen und stattdessen entscheiden, was auf Touch bleibt. Naheliegend, weil schon geschrieben: mobile.css:374 einschalten (Top 4 der Bestenliste, kompakt oben rechts, wo jetzt die Minimap auf Abruf sitzt) und mindestens die eigene Platzierung dauerhaft anzeigen.


#### 48. Ein Gast nimmt aus einer Sitzung nichts mit – der Ausgang aus dem Spiel ist ein Seiten-Neuladen

`apps/client/src/ui.ts:431` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Der einzige Weg vom Death-Screen zurueck ist `#exit-to-start` -> `location.reload()` (ui.ts:431, Kommentar: "frischer Startscreen, frische Bestenliste, kein halber Zustand"). Im localStorage liegen danach genau sechs Dinge, und keines davon gehoert dem Spieler: `mazers-device` (device-id.ts:20, wird ihm nie gezeigt), Lautstaerke (audio.ts:16), `project-maze-module`/`-modifier` (gameplay-ui.ts:50/95), das Onboarding-Flag (onboarding-view.ts:162), Grafikstufe (quality-panel.ts:77) und Vorhersage (prediction-panel.ts:33). Kein Schluessel fuer Name, Bestscore, Level, Kills oder Achievements. Serverseitig ist der Achievement-Fortschritt ausdruecklich fluechtig: "Der Fortschritt liegt im Arbeitsspeicher und gilt je Verbindung: Beim Verlassen der Arena ist er weg" (apps/server/src/achievements.ts:25-26), und `removePlayer` loescht ihn (achievements.ts:237-241). Persistiert wird nur mit Konto (persistence.ts:432-450).

**Szenario:** Ein Fremder spielt 25 Minuten, kommt auf Level 31 und 9.000 Punkte, stirbt, klickt ZUM STARTSCREEN. Die Seite laedt neu: das Namensfeld steht wieder auf "Player", die Achievements-Seite sagt 0 / 7, die Bestenliste zeigt fremde Namen. Es gibt im ganzen Browser keinen Beleg, dass er je gespielt hat. Morgen oeffnet er dieselbe Seite und sie ist von seinem ersten Besuch nicht zu unterscheiden – es gibt buchstaeblich nichts, was er fortsetzen koennte.

**Vorschlag:** Einen `mazers-run`-Schluessel im localStorage fuehren: Bestscore, bestes Level, meiste Kills, laengster Lauf, Anzahl Laeufe, letzter Besuch – geschrieben aus dem Snapshot beim Tod und beim Verlassen. Das braucht keine Migration, kein Supabase und kein Konto. Auf dem Startscreen als eigene Karte ueber ARENA BETRETEN ("Dein Rekord: 9.041 · Level 31 · 3 Laeufe"), und der Death-Screen vergleicht dagegen. Das ist der einzige Retention-Hebel, der heute ohne Sams Handgriff wirkt.


#### 49. Die Achievement-Galerie zeigt jedem Gast dauerhaft 0 / 7 – auch in der Sekunde nach dem Freischalten

`apps/client/src/profile-panel.ts:95` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `renderGuest()` (profile-panel.ts:95-103) ruft `zeigeGalerie(null)`; `zeigeGalerie` zaehlt `eintraege.filter(e => e.unlockedAt !== null).length` (profile-panel.ts:120-125) und bekommt fuer einen Gast immer die leere Liste – der Zaehler am Navigationseintrag und ueber der Galerie steht damit unveraenderlich auf "0 / 7". Der Client kennt den Stand aber: Der Server schickt Freischaltungen als `freshAchievements` im Snapshot (achievements.ts:270-278), der Client zeigt sie 4,6 s lang als Popup (achievement-popups.ts:53-70, achievements.ts:13 ACHIEVEMENT_POPUP_MS = 4600) und wirft sie danach weg – `AchievementQueue.seen` (achievements.ts:29) lebt nur im Arbeitsspeicher der Seite, und ui.ts:431 laedt die Seite neu.

**Szenario:** Ein Gast schaltet in seinem Lauf "Allrounder" und "Fuenfstellig" frei, sieht zwei Popups von je 4,6 Sekunden, stirbt, geht auf den Startscreen. Die Seite "Achievements" – die laut Navigation "Alles, was es zu holen gibt" zeigt (start-nav.ts:41) – meldet ihm 0 / 7 und alle sieben Kacheln grau. Das ist nicht nur nichts, das ist eine sichtbare Luege ueber seine eigene Leistung: Das Spiel behauptet, er habe nichts erreicht, obwohl es ihm zwei Minuten vorher gratuliert hat.

**Vorschlag:** Freigeschaltete IDs im localStorage mitschreiben (`mazers-achievements`), die Galerie fuer Gaeste daraus fuellen und die frisch freigeschalteten mit Datum markieren. Beim spaeteren Login werden die lokalen IDs einmalig an den Server geschickt und in `achievements` gespiegelt – dann ist der Login zum ersten Mal ein Gewinn und kein Verzicht.


#### 50. Sieben Erfolge – und ein Anfaenger erreicht in seiner ersten Sitzung praktisch keinen

`apps/server/src/achievements.ts:65` · inhalt · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Gemessen auf diesem Build mit `first-run-probe` (2 Laeufe a 5 min, 1280x720, Server mit 18 Bots): 0 von 2 Laeufen mit auch nur EINEM Abschuss, 5 Tode, Endlevel 1 und 2, Level 5 nach im Mittel 17 s. Gegen den Katalog (achievements.ts:65-108) gehalten: `firstStreak5` verlangt FUENF Abschuesse ohne Tod (Z. 70), `overchargeDuelist` und `fractureFlanker` je einen Abschuss (Z. 94, 100) – drei von sieben sind damit fuer diesen Spieler tot. Die beiden Event-Erfolge und `guardianSlayer` haengen zusaetzlich an einem Zeitfenster: Die Rotation ist fest (arena-systems.ts:26), das erste Event kommt nach 65 s (Z. 71), danach 120 s Pause nach jedem Ende (Z. 240) – ein voller Umlauf dauert 674 s, jedes einzelne Event ist also 5,2–6,7 % der Zeit aktiv, in einer Zone von 1,57–2,24 % der Kartenflaeche (Radien 520–620 auf 9000x6000, arena-systems.ts:28-31). `score10k` (Z. 106) liegt bei rund Level 19–20 (xpThresholdForLevel(19) = 10.289, packages/shared/src/index.ts:836), `maxLevel` bei 176.280 XP. Bleibt `threeFamilies` – der einzige, der in 20 Minuten realistisch faellt.

**Szenario:** Jemand spielt zwanzig Minuten, stirbt zehnmal, kommt auf Level 8, toetet niemanden. Das Spiel hat ihm in dieser Zeit kein einziges Mal gesagt "das war ein Fortschritt" – ausser den Level-Ups, die es sowieso gibt. Es gibt keinen Erfolg fuer den ersten Abschuss, keinen fuer die erste Klassenwahl (die nach 17 Sekunden passiert!), keinen fuer Level 10, 15 oder 28, keinen fuer fuenf Minuten am Stueck ueberlebt. Der Katalog belohnt ausschliesslich Spieler, die das Spiel schon koennen.

**Vorschlag:** Fuenf bis sechs Erfolge fuer die ersten Minuten ergaenzen, alle aus Feldern, die der Snapshot schon hat: erster Abschuss (`player.kills >= 1`), erste Klasse gewaehlt (haengt an dem `chooseClass`-Hook, der bei achievements.ts:220 schon existiert), Level 10 / Level 28, 300 Sekunden am Stueck gelebt, eine Pentagon erlegt. Der Katalog liegt in packages/shared/src/gameplay.ts:250-278, die Bedingungen sind Einzeiler wie die vorhandenen.


#### 51. Die Bestenliste ist ewig, ungefiltert und ohne Spieler-Dedup – sie wird binnen weniger Abende unerreichbar und zeigt einen Namen fuenfzigmal

`apps/server/src/persistence.ts:383` · wiederkommen · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `topRuns` liest `runs` mit `order('score', desc).order('created_at', asc).limit(limit)` (persistence.ts:383-403) – kein Zeitfenster, kein `distinct` auf Spieler. Der Index dazu ist `runs_score_idx (score desc, created_at asc)` (supabase/migrations/applied/0001_runs.sql:31), es gibt also keine zweite Sicht. Eine Zeile entsteht bei JEDEM Tod (persistence.ts:912-941), und der Punktestand wird beim Respawn nur auf 45 % gestutzt (game.ts:591) – die spaeteren Tode einer Sitzung tragen den Vorlauf der frueheren also mit. Gemessen auf diesem Build: der staerkste Farmer in der vollen Arena kam in 180 s auf 12.959 Punkte und starb dann (eigene Messung ueber die In-Game-Bestenliste, 200 s Beobachtung); der Anfaenger stirbt alle ~2 Minuten (5 Tode in 10 min, first-run-probe). Eine gute Stunde eines einzigen Spielers erzeugt damit rund 20 Zeilen ueber 10.000 Punkten. LEADERBOARD_LIMIT ist 50 (persistence.ts:34, start-leaderboard.ts:36).

**Szenario:** Sam spielt an zwei Abenden je eine Stunde. Danach stehen 40 der 50 Plaetze auf "Sam" – dieselbe Sitzung, zehnmal untereinander, weil jeder Tod eine eigene Zeile ist. Ein Fremder kommt am Donnerstag, spielt gut fuer einen Anfaenger und landet bei 2.400 Punkten. Er sieht eine Liste, auf der zwanzigmal derselbe Name mit 12.000 steht, und lernt daraus zwei Dinge: dass er nicht draufkommt, und dass es nichts gibt, worauf er heute draufkommen koennte. Das Ziel ist unerreichbar UND langweilig anzusehen.

**Vorschlag:** Zwei Aenderungen an derselben Abfrage: (1) Zeitfenster als Parameter (`?fenster=heute|woche|ewig`) ueber `created_at` – der Index `runs_created_at_idx` (0001_runs.sql:34) liegt schon da, und der Startscreen bekommt drei Reiter. Eine Tages-Bestenliste ist der klassische Wiederkehr-Grund des Genres: sie ist morgen wieder leer. (2) Je Spieler nur der beste Lauf – bis der Dedup in SQL steht, reicht ein Filter im `zuschneiden` von persistence.ts:645, weil ohnehin immer die vollen 50 geholt werden.


#### 52. Wer aufhoert, ohne zu sterben, hinterlaesst keinen Lauf – ausgerechnet der Spieler, der gut war

`apps/server/src/persistence.ts:958` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Der `RunRecord` entsteht ausschliesslich im `killPlayer`-Hook (persistence.ts:912-941). `removePlayer` (persistence.ts:958-967) sammelt nur noch Achievements ein und raeumt auf – es schreibt keinen Lauf. Getrennt wird die Verbindung bei index.ts:706 (`if (playerId) game.removePlayer(playerId)`). Genau dieselbe Luecke ist im Nachbarmodul erkannt und geschlossen worden: sessions.ts:539-551 traegt beim Verlassen den Hoechststand nach, mit dem Kommentar "Auch wer nie stirbt, hinterlaesst seinen Hoechststand" und "das ist ausgerechnet der Spieler, der gut war". Die Sitzungstabelle sieht ihn also – nur der Spieler selbst nicht, denn Bestenliste und `profile_stats` speisen sich aus `runs` (0003_achievements.sql:63-77).

**Szenario:** Ein Spieler farmt sich auf 15.000 Punkte und Level 38, ist zufrieden, lebt noch – und schliesst den Tab. Das ist der normale Weg, wie Menschen aufhoeren. Auf der Bestenliste steht davon nichts, im Profil steht als Bestscore weiter der Wert seines letzten TODES (typisch die Haelfte). Sein bester Lauf ist per Konstruktion der einzige, der nicht zaehlt – und wenn er morgen wiederkommt, um seinen Rekord zu schlagen, schlaegt er einen Rekord, der nie sein bester war.

**Vorschlag:** Den `removePlayer`-Hook in persistence.ts um denselben Schritt erweitern, den sessions.ts:539-551 schon macht: Lebt der Spieler noch und hat er Punkte, denselben `RunRecord` in die Warteschlange legen (Dauer aus `lifeStartedAt`, das dort bereits gefuehrt wird, persistence.ts:944-953). Fuenf Zeilen, kein Schema, keine Migration.


#### 53. Der Death-Screen ist der emotionale Hoehepunkt der Sitzung und traegt keinen einzigen Haken nach vorn

`apps/client/src/ui.ts:717` · wiederkommen · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Die ganze Karte (Markup ui.ts:295-330, Inhalt ui.ts:698-745) besteht aus sechs Kacheln plus einer Zusammenfassungszeile: `LEVEL x · y KILLS · z SCORE · aliveText` (ui.ts:717) und `Erreicht / Neustart / Score / Kills / Ueberlebt / Beste Streak` (ui.ts:718). Kein Vergleich mit einem eigenen Bestwert (existiert nirgends, siehe Befund 1), kein Rang, kein Abstand zur Bestenliste, keine Nennung der frisch freigeschalteten Erfolge, kein Hinweis auf die naechste Klassenstufe, kein Login-Angebot. Die einzigen Aktionen sind RESPAWN und ZUM STARTSCREEN (= `location.reload()`, ui.ts:431). Zum Vergleich: die In-Game-Bestenliste markiert die eigene Zeile bereits (`leader-row self`, ui.ts:756) – das Bewusstsein fuer "wo stehe ich" ist im Code vorhanden, nur nicht an der Stelle, wo es zaehlt.

**Szenario:** Ein Spieler stirbt mit 9.041 Punkten. Er sieht sechs Zahlen und weiss nicht, ob das gut war. War sein letzter Lauf 4.000? 20.000? Reicht es fuer die Bestenliste? Waere Level 42 in Reichweite gewesen? Das Spiel beantwortet keine dieser Fragen und bietet ihm stattdessen an, die Seite neu zu laden. Genau hier – wenn er gerade etwas geleistet hat und noch aufgedreht ist – muesste der Grund stehen, es gleich nochmal zu versuchen oder morgen wiederzukommen.

**Vorschlag:** Drei Zeilen auf die Karte, alle aus Daten, die schon vorliegen: (1) "Neuer Rekord" bzw. "Dein Bestwert: 12.400" aus dem localStorage-Rekord aus Befund 1; (2) "Noch 1.800 Punkte bis Platz 50" aus der bereits geladenen `/leaderboard`-Antwort; (3) "Freigeschaltet in diesem Lauf: Allrounder, Fuenfstellig" aus der `AchievementQueue`. Und bei einem neuen Rekord ohne Konto genau dort der Login-Knopf mit konkretem Versprechen.


#### 61. Auf dem Handy sind nach jedem Tod beide Sticks tot, bis der Spieler beide Daumen hebt und neu aufsetzt

`apps/client/src/input.ts:205` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `resetTransient()` (input.ts:201-206) ruft alle in `resetSticks` gesammelten Reset-Funktionen. Der Reset in `bindStick` (input.ts:229-246) setzt `pointerId = null`, `origin = null`, `magnitude = 0`, `engaged = false` und gibt die Pointer-Capture frei. Neu bewaffnet wird ein Stick AUSSCHLIESSLICH in `area.addEventListener('pointerdown', ...)` (input.ts:276-295) - und ein Finger, der auf dem Glas liegen bleibt, erzeugt kein zweites `pointerdown`. Der `pointermove`-Handler (input.ts:296) filtert auf `event.pointerId === pointerId`, nach dem Reset also gegen `null`: er laeuft nie wieder an. Ausgeloest wird der Reset auf drei Wegen bei jedem Tod-Respawn-Zyklus: main.ts:495 `input?.resetAll()` beim Tod, main.ts:497 `input?.resetTransient()` beim Respawn, main.ts:498 `setEnabled(false)` -> input.ts:141 -> `resetTransient()`. Auf dem Desktop faellt es nicht auf, weil die Tastenwiederholung des Betriebssystems weiterlaeuft und `keydown` mit `event.repeat === true` die Taste innerhalb von ~33 ms wieder in `this.keys` eintraegt (input.ts:79) - Touch hat kein Gegenstueck dazu. Der Beweis, dass die Probe daneben misst, steht in scripts/touch-probe.mjs:277-287: Sie erkennt den Tod, macht `daumen.clear()` + `touchEnd`, respawnt und setzt mit `daumen.set(1,...)` + `touchStart` beide Finger NEU auf. Der Kommentar darueber nennt sogar die Ursache ("Nach dem Tod schaltet setEnabled(false) die Sticks ab") - behandelt wurde sie in der Probe statt im Spiel.

**Szenario:** Ein Spieler im Querformat haelt den linken Daumen auf dem Move-Stick und den rechten auf dem Aim-Stick, so wie man das ganze Spiel ueber spielt. Er stirbt, tippt RESPAWN, sein Tank steht wieder in der Arena - und faehrt nicht und schiesst nicht. Die Sticks reagieren auf keine Daumenbewegung. Erst wenn er beide Finger komplett vom Bildschirm nimmt und neu aufsetzt, geht es weiter. Das passiert in genau den Sekunden, in denen der Spawnschutz laeuft und danach ablaeuft - also im verwundbarsten Moment jedes Lebens, und in jedem einzelnen Leben.

**Vorschlag:** `resetTransient()` darf die Sticks nicht abraeumen. Der Stick-Zustand (pointerId, origin) ist kein transienter Eingabewert, sondern die Buchfuehrung ueber einen physisch liegenden Finger - `getMovement()`/`isPrimary` pruefen `this.enabled` ohnehin schon selbst (input.ts:156, 186). Entweder den Stick-Reset aus `resetTransient` herausnehmen und nur `magnitude`/`engaged` auf 0 setzen, oder beim `setEnabled(true)` aus den noch aktiven Pointern neu bewaffnen. Danach die Probe umbauen: Der Fall gehoert getestet, indem die Daumen ueber den Tod hinweg LIEGEN BLEIBEN - so wie ein Mensch spielt.


#### 62. Der Dash-Schadensabschlag trifft jeden Schaden des Dashers, nicht nur seinen Rammschaden - auch Kugeln, die schon in der Luft sind

`apps/server/src/loadout-system.ts:427` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** loadout-system.ts:425-428 rechnet `if (attackerLoadout.activeModule === 'dash' && attackerLoadout.activeUntil > now) remainingDamage *= 0.25;` - ohne jede Pruefung, ob der Schaden aus Koerperkontakt stammt. docs/BALANCE_MASTERPLAN.md:99 schreibt aber ausdruecklich "**Body**-Damage waehrend des aktiven Dash-Fensters auf 25 % reduziert", Zeile 322 "Dash kann den vollen **Rammer**-Kontaktschaden nicht transportieren", Zeile 366 nennt den Regressionstest "reduzierten **Rammer**-Schaden waehrend Dash". Der Test loadout-system.test.ts:34-53 heisst zwar "reduces body damage", ruft aber `internals.damagePlayer(target, 40, attackerId, 2050)` direkt auf und kann Kontakt- von Projektilschaden gar nicht unterscheiden - er bleibt gruen, egal welche der beiden Regeln implementiert ist. Nachgemessen gegen apps/server/dist: (a) Angreifer und Ziel 600 Einheiten auseinander, Kontakt physisch ausgeschlossen: 40 Schaden werden zu 10, Faktor exakt 0,250. (b) Voller Spielablauf: Ein Storm feuert einen Schuss, dasht danach vom Ziel WEG (Endabstand 258 Einheiten), das Geschoss trifft waehrend des 180-ms-Fensters - 8 statt 32 Schaden. Die Schicht liegt laut index.ts:411 ausserhalb von `tunePerks`, hat also die Kontakt-Erkennung, die perks.ts:368-375 ueber `inBodyContact` fuehrt, nicht zur Hand.

**Szenario:** Ein Gatling-Spieler macht das, was das Modul verspricht ("Ausweichen und Repositionierung"): Er drueckt eine Salve ab und dasht sofort aus der Schusslinie. Die Kugeln, die schon fliegen, richten ein Viertel Schaden an. Auf dem Schirm sieht er volle Treffer, der Lebensbalken des Gegners bewegt sich kaum - ohne dass irgendetwas im HUD den Abschlag erwaehnt. Wer den Dash offensiv spielt, verliert dabei still drei Viertel jeder Salve; wer ihn nie benutzt, spielt objektiv staerker.

**Vorschlag:** Den Abschlag auf Koerperkontakt einschraenken - nach dem Muster, das perks.ts bereits benutzt: `resolvePlayerCollisions` in dieser Schicht umschliessen und ein `inBodyContact`-Flag setzen, das die Bedingung in Zeile 427 mitpruefen muss. Den Test dazu ueber die echte Kollisionsaufloesung fuehren, nicht ueber einen direkten `damagePlayer`-Aufruf - sonst bleibt er wieder blind fuer den Unterschied, den er pruefen soll.


#### 63. Repulse Pulse laeuft in der ausgelieferten Konfiguration wirkungslos: 45 px Schub fuer 12 s Abklingzeit

`apps/server/src/index.ts:355` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** index.ts:355 liest den Schalter als Opt-in: `REPULSE_TRAVEL_ENABLED = (process.env.REPULSE_TRAVEL_ENABLED ?? '').trim().toLowerCase() === 'true'` - ohne gesetzte Variable also `false`. Der Dash daneben ist Opt-out (index.ts:289-290). Ohne den Schalter laeuft loadout-system.ts:285-288, also `target.velocity.x += direction.x * strength`, und der eigene Kommentar direkt darueber (Zeile 267-278) nennt das Ergebnis bereits als Befund. Nachgemessen gegen apps/server/dist bei Radius 195, Wirkdauer 260 ms, Abklingzeit 12 s: Ziel auf 100 px Abstand, stehend - 44,9 px nach 200 ms, Endstand 45,8 px. Dasselbe Ziel, das weiter auf den Pulser zudrueckt - nach 500 ms ist es bereits 4,5 px NAEHER als vor dem Puls, nach 1 s 97,7 px naeher. Am Rand des Wirkradius (180 px) sind es 28 px, also gut ein Tankradius (22). Zum Vergleich derselbe Lauf mit dem Schalter: 118 px stehend, 74 px gegen Widerstand. Und zur Einordnung: Ein Tank mit Tempo 300 legt in denselben 200 ms zu Fuss 60 px zurueck. Die Beschreibung, die der Spieler im Loadout-Menue liest, lautet "Verdraengt Gegner, Drohnen und nahe Projektile", die Rolle im Code ist 'control'.

**Szenario:** Ein Spieler ruestet Repulse aus, weil das Menue Raumkontrolle verspricht. Ein Rammer stuermt auf ihn zu. Er drueckt im richtigen Moment - der Rammer wackelt einen halben Tank zur Seite, ist eine halbe Sekunde spaeter naeher dran als vorher, und der Spieler hat 12 Sekunden nichts mehr. Von vier Modulen ist damit eines eine Attrappe, und der Spieler kann das nur so deuten, dass er es falsch benutzt hat.

**Vorschlag:** Den Schalter wie beim Dash auf Opt-out drehen und den gemessenen Wert (107-118 px auf 100 px Abstand) als Ausgangspunkt fuer die Balance nehmen. Die Einordnung in .env.example:131-132 ("Verdopplung der Wirkung, also eine Balance-Entscheidung") beschreibt die Lage falsch: Verdoppelt wird nicht eine funktionierende Wirkung, sondern der Unterschied zwischen "nichts passiert" und "etwas passiert". Wenn der Wert Sam gehoert, dann als Zahl ueber einer laufenden Faehigkeit - nicht als Schalter, hinter dem sie ganz ausbleibt.


#### 64. Client-Prediction ist Standard aus - jeder neue Spieler bekommt Bewegung mit voller Rundlaufzeit

`apps/client/src/prediction-panel.ts:17` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `DEFAULT_PREDICTION = false` (prediction-panel.ts:17), gespeichert wird die Wahl nur, wenn jemand den Schalter findet: Er sitzt als drittes Element in der eingeklappten Einstellungsflaeche des Startscreens (ui.ts:241-245, "Bewegung sofort anzeigen"). Ohne ihn nimmt renderer.ts:572 `this.selfPredictor?.sample()` = null und zeichnet den eigenen Tank ueber renderer.ts:576-581 aus `view.target + view.velocity * age`, also aus der Serverposition, geglaettet mit Rate 42 (Zeitkonstante 23,8 ms). Nachgerechnet mit den echten Konstanten (Tempo 300, Beschleunigung 1400, Tick 40 Hz, Snapshot 30 Hz, Glaettung 42): Zeit vom Tastendruck bis 10 Einheiten sichtbarer Bewegung 117 ms bei RTT 0, 167 ms bei RTT 40, 208 ms bei RTT 80, 325 ms bei RTT 140. Der stationaere Rueckstand des gezeichneten Tanks gegenueber der Serverposition betraegt dabei 9 / 17 / 20,6 / 29,5 Einheiten - bei einem Tankradius von 22 also bis zu 1,3 Tankradien hinter der Wahrheit. Mit Vorhersage ist die Antwort von der Leitung unabhaengig (Nachlaufrate 110, renderer.ts:91). Das Modul ist fertig: 435 Zeilen, eine eigene Doku (docs/CLIENT_PREDICTION.md), zwoelf Tests in prediction.test.ts, und die Bewegungsformel teilt sich mit dem Server dieselbe Quelle (`movementStatsFor`). docs/GOAL.md fuehrt den Schalter nirgends als offene Entscheidung - anders als Rundenlaenge, Sichtfeld-Standard und Punktestand nach dem Tod.

**Szenario:** Ein Fremder oeffnet mazers.de mit 60 ms zum Server, klickt ARENA BETRETEN und drueckt W. Der Tank setzt sich rund 180 ms spaeter sichtbar in Bewegung und laeuft danach dauerhaft knapp einen Tankradius hinter dem, wo der Server ihn fuehrt. Beim Ausweichen um eine Ecke bedeutet das: Er ist schon getroffen, als sein Tank auf dem Schirm noch in der Deckung steht. Diep.io rechnet die eigene Bewegung lokal - der Vergleich, an dem sich das Spiel laut Nordstern messen laesst, faellt hier gegen die Auslieferungseinstellung aus. Dieselbe Einstellung messen auch wire-probe, touch-probe und first-run-probe.

**Vorschlag:** Den Standard auf an drehen (Opt-out statt Opt-in), genau wie es mit SNAPSHOT_DELTAS und SHORT_NET_IDS gemacht wurde - die lagen mit derselben Begruendung fertig und aus im Repo. Der Schalter bleibt zum Vergleichen stehen. Danach die Proben einmal in beiden Stellungen laufen lassen, damit die Zahl, die im Nordstern steht, zu dem gehoert, was ausgeliefert wird.


#### 71. Der Bot würfelt jedes Reaktionsfenster neu, ob er überhaupt kämpft – 11 von 18 Bots halten ein Ziel im Median 0,4 Sekunden

`/home/user/project-maze/apps/server/src/bot-brain.ts:415` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Zeile 415-417 würfelt `aggressive = Math.random() < styleAggression[style]` bei JEDER Entscheidung neu, nicht einmal je Gefecht; Zeile 422-428 setzt bei einem Fehlwurf `bot.targetId = null` und wechselt auf eine Form. Entscheidungstakt (Zeile 431 mit TIER_PROFILES Zeile 35): 195-538 ms. styleAggression (Zeile 144): farmer 0.2, kiter 0.45, controller 0.4. Erwartete Haltedauer eines Farmers = 1/(1-0,2) = 1,25 Entscheidungen ≈ 0,41 s. GEMESSEN (1 Bot, 1 Mensch, FFA, 400 px, freie Sicht, 3 min, Schaden abgeschaltet): farmer Median 0,38 s / 97 % der Episoden unter 1 s / 89 Zielaufnahmen; kiter 0,42 s / 85 %; controller 0,40 s / 87 %. Hunter und brawler (Aggression 1.0) dagegen exakt 8,03 s – der huntTimeoutMs aus Zeile 138 –, dann 6 s Sperre, also 58 % Anwesenheit. In der vollen Arena (18 Bots, Maze, Level-25-Mensch, 5 min): 75,7 % der Zeit visiert KEIN Bot den Menschen an, 52 % aller Episoden unter 1 s, gleichzeitig zwei Angreifer nur 0,8 % der Zeit.

**Szenario:** Ein Spieler fährt auf einen Farmer-Bot zu. Der dreht sich zu ihm, feuert zwei Schüsse, dreht sich nach 0,4 s wieder weg und schießt auf ein Fünfeck. Eine halbe Sekunde später dreht er sich wieder her. Über eine ganze Runde wiederholt sich das rund 90-mal je Bot. Es entsteht nie ein Kampf, nur ein Flackern – der Spieler kann nicht sagen, ob der Bot ihn angreift oder zufällig in seine Richtung schaut, und drei Viertel der Spielzeit steht überhaupt niemand gegen ihn.

**Vorschlag:** Den Aggressionswurf einmal je Gefecht ziehen, nicht je Entscheidung: Wer bereits `bot.targetId` auf diesen Menschen gesetzt hat, überspringt den Wurf und behält das Ziel, bis huntTimeout, Sichtverlust, Tod oder calmUntil es beendet. `styleAggression` bekommt damit die Bedeutung, die ihr Kommentar in Zeile 132 ohnehin schon zuschreibt („einen sichtbaren Gegner überhaupt anzugehen"). Gegenprobe: dieselbe Messung, Median-Episode je Stil muss über 3 s steigen, ohne dass der Anteil der Zeit mit Angreifer über den heutigen Wert von Hunter/Brawler (58 %) klettert.


#### 72. Bots kaufen niemals einen Lebenspunkt – 13 von 18 können es rechnerisch nie, ihre HP bleiben für immer der Klassen-Sockel

`/home/user/project-maze/apps/server/src/family-upgrades.ts:330` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `spendBotPoints` (Zeile 330-352) arbeitet den Upgrade-Pfad der Reihe nach ab und füllt jeden Eintrag bis zum Deckel 10, bevor der nächste drankommt; `familyBotPath` (Zeile 280) schiebt zusätzlich zwei Familien-Slots auf Position 2 und 4. Ausgerechnet mit dem echten Code: farmer, hunter und kiter haben `maxHealth` an Pfadindex 7 → 71 Punkte nötig → Level 72, aber GAME.maxLevel ist 60. UNERREICHBAR. brawler ab Level 22, controller ab Level 42. Bei 18 Bots sind das 7 farmer + 4 hunter + 2 kiter = 13 von 18. GEMESSEN (18 Bots, 8 min, Level 6 bis 32): `upgrades.maxHealth = 0` bei ausnahmslos jedem, ebenso `regen = 0`. Folge über combat-tuning.ts:107 (`maxHealth = base * (1 + 0.09 * Punkte)`): Bot-HP = Klassen-Sockel, für immer. Ein Mensch mit 10 Punkten hat den Faktor 1,90 (vortex 224 gegen 118, eclipse 171 gegen 90, gatling 201 gegen 106) und die 4,3-fache Regeneration (7,4 gegen 2,4).

**Szenario:** Ein Spieler trifft zweimal denselben Gegnertyp: einmal einen Level-8-Gatling, später einen Level-38-Gatling. Beide sterben nach exakt gleich vielen Treffern. Der einzige Unterschied ist, dass der zweite mehr Schaden macht. Ein Bot, der aufsteigt, wird nicht zäher – er wird nur giftiger. Genau die Zeit, die der Spieler in seinen eigenen Panzer investiert (HP-Punkte, Regeneration), gibt es beim Gegner überhaupt nicht, und der Spieler bemerkt nur, dass Bots gefühlt aus Papier sind.

**Vorschlag:** Den Bot-Pfad in Runden statt in Blöcken abarbeiten: je Durchlauf einen Punkt pro Eintrag statt jeden Eintrag bis zum Deckel. Damit hat ein Level-21-Bot bereits zwei Punkte in maxHealth statt null, und die Reihenfolge bleibt als Gewichtung erhalten. Gegenprobe: Test, der für jeden der fünf Stile bei Level 20/40/60 `upgrades.maxHealth > 0` verlangt – heute meldet er für drei Stile bei jedem Level rot.


#### 73. Es gibt keine Schwierigkeitskurve: Können wird einmal bei der Geburt gewürfelt und ändert sich nie – ein Level-40-Bot zielt exakt wie ein Level-1-Bot

`/home/user/project-maze/apps/server/src/bot-brain.ts:251` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Zeile 251 `const tier = TIER_SEQUENCE[index % TIER_SEQUENCE.length]` wird genau einmal beim Anlegen des Gehirns ausgeführt; danach liest `think` nur noch `TIER_PROFILES[brain.tier]` (Zeile 338). Reaktionszeit, Zielfehler, Vorhaltefaktor und Ausweichchance sind damit über die gesamte Lebensdauer konstant und vom Level völlig entkoppelt. Der Arena-Direktor skaliert nur das START-Level neuer Bots (arena-director.ts:63, levelFactor 0.85) – und bei einem Menschen spawnt er nie nach, weil `targetBotCount(1) = 18 = BOT_COUNT`. GEMESSEN (18 Bots, Maze, keine Menschen): Nach 3,5 min reicht das Levelfeld von 5 bis 32, nach 4,5 min von 4 bis 37 – 33 Level Spanne, ohne jeden Bezug zum Spieler. Ein rookie-Bot auf Level 37 hat aimError 0.19, leadFactor 0.3 und dodgeChance 0 – dieselben Werte wie auf Level 1.

**Szenario:** Ein Spieler steigt von Level 10 auf Level 35 auf. Nichts wird schwerer. Er trifft weiter dieselbe Mischung aus Bots, die zufällig zwischen Level 4 und 37 verteilt sind, und jeder von ihnen reagiert genauso träge und zielt genauso ungenau wie in seiner ersten Minute. Der Aufstieg zahlt sich nur in eigenen Zahlen aus, nie in einem Gegner, der sich anders anfühlt – der klassische Grund, ein Spiel nach einer Runde wegzulegen.

**Vorschlag:** Den Tier aus dem Level ableiten statt aus dem Spawn-Index, mit einem Fenster um das Level des nächsten Menschen herum – z. B. rookie unter dem halben Spielerlevel, elite darüber, veteran dazwischen –, neu bewertet beim Levelaufstieg und beim Respawn. Die drei Profile bleiben unverändert; nur die Zuordnung wird dynamisch. Gegenprobe: derselbe Bot, zweimal gemessen (Level 5 und Level 40), muss unterschiedliche Trefferquoten gegen dasselbe Strafe-Muster liefern.


#### 74. Die drei Skill-Stufen sind ab 300 px nicht unterscheidbar: gegen einen Spieler, der eine Taste hält, treffen alle drei zu 4–18 %

`/home/user/project-maze/apps/server/src/bot-brain.ts:35` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** TIER_PROFILES (Zeile 35-39) setzt leadFactor rookie 0.3 / veteran 0.52 / elite 0.78, mit ausdrücklicher Begründung im Kommentar Zeile 29-34 („Deshalb hält selbst Elite nur ~0.78 vor"). Der Restfehler beim Vorhalten ist damit systematisch: Winkelfehler = v_Ziel × (1 − leadFactor) / v_Projektil. GEMESSEN (Bot ortsfest, Mensch kreist mit konstantem Radius und konstantem Tempo, beide twin/Level 20, 120 s je Fall; Trefferradius = playerRadius 22 + Projektilradius 6 = 28 px): bei 420 px trifft rookie 10,2 %, veteran 17,8 %, elite 15,8 % – der Median-Abstand der Kugel zum Spieler beträgt 115 / 74 / 84 px, also das Drei- bis Vierfache des Trefferradius. Bei 900 px: 4,2 % / 4,7 % / 8,1 % (Median 239 / 210 / 219 px). Nur auf 200 px trennen sich die Stufen überhaupt (23,2 % / 29,4 % / 48,7 %).

**Szenario:** Ein Spieler hält eine Richtungstaste gedrückt und kreist um einen Bot. Auf normaler Kampfdistanz fliegen die Kugeln des Bots in einer sichtbaren Schleppe hinter ihm her und verfehlen ihn um zwei bis vier Tankbreiten. Ob dieser Bot laut Code ein Rookie oder ein Elite ist, kann der Spieler nicht bemerken: der Unterschied beträgt 6 Prozentpunkte Trefferquote. Der gesamte Tier-Apparat mit drei Profilen und der 40/40/20-Mischung (Zeile 41-42) ist für den Spieler unsichtbar.

**Vorschlag:** Den Vorhaltefaktor nicht als Endwert setzen, sondern als Trefferziel: leadFactor 0.95 für Elite bei gleichzeitig größerem Zielfehler-Kegel, damit Elite-Kugeln um den Spieler herum streuen statt systematisch hinterherzuhinken. Das erhält die Ausweichbarkeit (Querbewegung hilft weiter), macht aber die Stufe spürbar. Gegenprobe: dieselbe Kreis-Messung – rookie soll unter 10 % bleiben, elite über 35 % steigen; wenn elite 90 % erreicht, ist der Faktor zu hoch.


#### 75. Der Bot-Bestand ist in jeder Sitzung Bit für Bit derselbe: 12 Archetypen auf 18 Plätzen, und SIEGE und AEGIS kommen nie vor

`/home/user/project-maze/apps/server/src/bot-brain.ts:57` · inhalt · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Alle drei Zuordnungen sind rein und ungeseedet: `botState(index)` (game.ts:138) liest BOT_STYLES[index % 10] (game.ts:132), `brainFor` liest TIER_SEQUENCE[index % 5] (bot-brain.ts:251) und BOT_CLASS_PATHS[style][index % len] (bot-brain.ts:57-102). Für i = 0..17 enumeriert: 12 verschiedene Archetypen, sechs Paare exakt doppelt besetzt (z. B. zweimal farmer/veteran/rapid>repeater>gatling>vortex, zweimal hunter/veteran/sniper>ballista>siegebreaker>eclipse). Vertretene Familien: rapid, impact, precision, control, specter, tempest. FEHLEN: siege und aegis – in keinem der 18 Klassenpfade. GEMESSEN über 10 min Betrieb: 0 Proben für `stellungFor` und 0 für `schildFor`, weil kein Bot je eine Siege- oder Aegis-Klasse trägt. Der Direktor schiebt bei einem Menschen nie nach (`targetBotCount(1) = 18 = BOT_COUNT`), der Bestand bleibt also die ganze Sitzung. Nebenbefund derselben Ursache: Perioden 5 und 10 sind gekoppelt, also ist jeder kiter und jeder controller veteran, kein hunter je elite, jeder brawler rookie oder elite.

**Szenario:** Ein Spieler kommt am zweiten Tag wieder und trifft dieselben achtzehn Gegner in derselben Reihenfolge mit denselben Klassenpfaden. Er wird nie einem Bot begegnen, der stehenbleibt und zur Kanone wird (SIEGE) oder der Treffer einsteckt, um seinen Schild aufzuladen (AEGIS) – ausgerechnet den beiden Familien, die docs/GOAL.md als die interessantesten herausstellt („RAPID und SIEGE sind im Code ausdrücklich als Gegenteile gebaut", „AEGIS ist die einzige Familie, die getroffen werden will"). Von acht Familien sieht er sechs, und von 65 Klassen zwölf Pfade.

**Vorschlag:** Den Index für Stil, Tier und Klassenpfad entkoppeln (drei verschiedene Schrittweiten oder ein Sitzungs-Seed) und die Pfadauswahl innerhalb eines Stils so ziehen, dass jeder Stil seine Alternativen wirklich erreicht. Siege- und Aegis-Pfade stehen bereits in BOT_CLASS_PATHS (Zeile 79, 87, 97, 98) – sie werden nur nie gezogen. Gegenprobe: Test, der über die Standardarena (18 Bots) prüft, dass alle acht Familien im Bot-Bestand vorkommen und keine zwei Bots denselben Archetyp tragen.


#### 76. Eine Feuerregel für alle 65 Klassen: SPECTER-Bots lösen ihre Familien-Mechanik nie aus (Median-Tarnung 0,0 von 95 nötigen)

`/home/user/project-maze/apps/server/src/bot-brain.ts:537` · inhalt · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Zeile 535-537 ist die gesamte Feuerlogik für jede Nicht-Drohnenklasse: `player.primary = distance < range && reactionReady`. Kein Halten, kein Aussetzen, keine Kenntnis irgendeiner Signature. SPECTER (signature-specter.ts:163) baut Tarnung nur auf, wenn 1,2 s nicht gefeuert wurde, und jeder eigene Schuss setzt sie auf 0 (Zeile 157); für den Hinterhalt braucht es 95 von 100, also 1,2 s + 95/40 s = 3,6 s Feuerpause. GEMESSEN (18 Bots, Maze, 6 min, sekündlich abgetastet): SPECTER 915 Proben, Mittel 0,3, Median 0,0, 90. Perzentil 0,0, Maximum 62 – die Schwelle 95 fällt nie. Zum Vergleich im selben Lauf: IMPACT Median 100, RAPID 93, TEMPEST 82 – die füllen sich als Nebenwirkung davon, dass der Bot immer fährt und immer feuert, nicht weil er etwas entscheidet. Ergänzend gemessen: Bots feuern in 82,8 % aller Ticks.

**Szenario:** docs/GOAL.md begründet die 65 Klassen ausdrücklich damit, dass nicht die Bonushöhe zählt, sondern „die Bedingung, unter der sich die Leiste füllt – denn die bestimmt, wie man spielt". Genau diese Bedingung existiert für Bots nicht. Ein Spieler, der gegen die vier SPECTER-Bots der Standardarena kämpft, sieht nie einen Hinterhaltsschlag, nie ein Zurückhalten des Feuers, nie das Verschwinden-und-Wiederauftauchen, das die Familie ausmacht. Er lernt am Gegner nichts über das System, das er selbst spielen soll.

**Vorschlag:** Eine Feuerbremse je Familie in `think` einhängen, minimal an einer Stelle: vor Zeile 537 einen `feuerFrei(player, brain, now)`-Haken, der für SPECTER unterhalb der Hinterhaltsschwelle und außerhalb der Wunschdistanz `false` liefert und für SIEGE den Wunschabstand hält, statt zu strafen. Das ist dieselbe Naht, die `tuneRapidBots` (signature-rapid.ts:189) bereits für Momentum benutzt – nur nach innen statt nach außen. Gegenprobe: dieselbe Signature-Messung, SPECTER muss ein 90. Perzentil über 95 erreichen.


### Schwere: mittel (35)


#### 8. Drohnen haben keine Trefferrueckmeldung, und zehn Klassen spielen komplett ohne Ton

`apps/client/src/renderer.ts:914` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** DroneSnapshot fuehrt health und maxHealth (index.ts:757) und der Server kodiert sie in jeden Snapshot (snapshot-encoding.ts:77, round1(drone.health)) — der Renderer liest beide nie. renderer.ts:914-922 zeichnet je Drohne genau: Farbe nach Besitzer, ein Schweif ab Tempo 90, ein gleichseitiges Dreieck mit Radius 13. Kein Flash bei Schaden, kein Burst beim Tod, kein Lebensring; in syncDrones (renderer.ts:515-531) werden verschwundene Drohnen still aus der Map geloescht, genau wie Projektile. Alle Drohnen aller Klassen sehen identisch aus — auch die fuenf 'zaehen Schildwaechter' des Guardian. Dazu: audio.shot ist an barrelCount > 0 gekoppelt (main.ts:524), und 10 der 65 Klassen haben barrelCount 0 (drone, warden, factory, overseer, carrier, guardian, hive, sovereign, sentinel, aviary) — die ganze CONTROL-Familie ohne Rohr. Fuer diese Spieler feuert im ganzen Spiel kein einziger Schuss-Ton, und fireRecoil/Muendungsblitz (renderer.ts:495-501) laeuft nie, weil es keine eigenen Projektile gibt.

**Szenario:** Spieler waehlt Overseer. Seine vier Drohnen sind seine einzige Waffe. Eine steht bei 5 % Leben, eine ist frisch — sie sehen pixelgleich aus, obwohl der Server beide Zahlen mitschickt. Eine stirbt: sie ist im naechsten Bild einfach nicht mehr da. Kein Knall, kein Splitter, kein Ton. Er kann weder abschaetzen, wann er zurueckziehen muss, noch merkt er, dass er gerade seine halbe Feuerkraft verloren hat. Eine komplette Klassenfamilie wird stumm und ohne Rueckmeldung gespielt.

**Vorschlag:** Den vorhandenen Spieler-Pfad wiederverwenden: derselbe Gesundheitsvergleich wie in renderer.ts:461 fuer Drohnen, daraus ein kurzer Flash und ein 3-Partikel-Burst; beim Verschwinden ein kleiner Burst plus Ring wie beim Formen-Tod (renderer.ts:548). Ein duenner Lebensbogen um die Drohne ab 60 % Schaden. Und fuer CONTROL einen eigenen Ton: kein Schuss, sondern ein leiser Klick beim Nachschub einer Drohne und ein kurzer Bruch beim Verlust — sonst bleibt ein Sechstel der Klassen ohne jede Tonspur.


#### 9. Der haeufigste Vorgang des Spiels ist stumm — Formen zerschiessen hat keinen Klang

`apps/client/src/audio.ts:50` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** audio.ts kennt neun Klaenge (shot, module, damage, kill, death, level, eventHorn, bounty) — keiner davon gehoert zur Formenzerstoerung; im Server vergibt game.ts:536 die Belohnung, ohne dass irgendein Ereignis beim Client ankommt. Gerechnet aus der Kurve: Formen-Mix 70 % Quadrat / 24 % Dreieck / 6 % Fuenfeck (world.ts:143), im Mittel 30,6 XP und 1,84 Core-Schuesse je Form. Bei 562 Formen auf 54 Mio px2 betraegt der mittlere Nachbarabstand 155 Einheiten, bei Tempo 270 also 0,57 s Fahrt — Zyklus rund 1,13 s je Form. Von Level 15 auf 28 sind das 18.065 XP = 590 Formen = rund 11 Minuten, von 5 auf 15 nochmal 155 Formen = 2,9 Minuten. In dieser Zeit erklingt kein einziger Ton ausser dem eigenen Schuss. Zum Vergleich hat das Bounty-Banner, das pro Runde vielleicht ein- bis zweimal wechselt, einen eigenen Vierklang (audio.ts:88-90).

**Szenario:** Ein neuer Spieler folgt dem Onboarding ('farmen -> aufsteigen -> Klasse -> Upgrade'). Seine ersten drei Minuten bestehen daraus, rund 155 Formen abzuschiessen. Jede davon klingt gleich: gar nicht. Er bekommt zehn Partikel und ein goldenes '+18', danach fuenfhundert weitere Male dasselbe. Zusaetzlich sieht er dabei die meiste Zeit niemanden — bei einem Menschen haelt der Direktor 18 Bots (arena-director.ts:56), das sind rechnerisch 0,56 fremde Tanks im gelieferten Ausschnitt von 1.689.216 px2. Die Tonspur des Spiels ist damit ausgerechnet dort leer, wo der Spieler die meiste Zeit verbringt.

**Vorschlag:** Einen kurzen, sehr leisen Formen-Ton in audio.ts, in der Tonhoehe nach Art gestaffelt (Quadrat hoch/kurz, Dreieck mittig, Fuenfeck tief mit kleinem Rauschanteil) — Gain um 0,012, damit Dauerfarmen nicht ermuedet, ausgeloest an derselben Stelle, an der die '+18'-Zahl schon spawnt (renderer.ts:551). Aus einer stummen Taetigkeit wird damit ein Rhythmus, und das Fuenfeck bekommt hoerbar mehr Gewicht als das Quadrat — genau der Unterschied, den die Belohnung (120 zu 18) ohnehin macht.


#### 10. Klassenwahl und Levelaufstieg — die Fortschrittsmomente — haben keinen Moment

`apps/client/src/main.ts:124` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Die Klassenwahl schickt in main.ts:124-127 nur die Nachricht; der Tank wechselt im naechsten Snapshot lautlos die Silhouette, weil redrawPlayer bei geaenderter classId neu zeichnet (renderer.ts:479). Kein Ton (kein Aufruf in den acht Audio-Stellen), kein Ring, kein Burst, kein Toast. Das Gleiche fuer Upgrade-Kaeufe: sendUpgrade (main.ts:110-112) erzeugt nur gefuellte Pips (ui.ts:601-603). Der Levelaufstieg hat einen Toast (ui.ts:651) und audio.level (audio.ts:82) — mit Gain 0,022 der zweitleiseste Klang im ganzen Spiel, und der Toast traegt 11 px Titel und 9 px Text (style.css:48). Auch das Achievement kommt ohne Ton: achievement-popups.ts:53-70 setzt nur die Karte sichtbar, in derselben linken Spalte wie der Killfeed, mit 11 px Ueberschrift (achievements.css:44-46). Bei sieben Achievements insgesamt (gameplay.ts:269-279) ist das jedes Mal ein seltenes Ereignis mit der schwaechsten Praesentation im HUD.

**Szenario:** Spieler erreicht Level 15, klappt die Klassenwahl in der Ecke auf und waehlt Gatling — die Entscheidung, um die herum das ganze Spiel gebaut ist (65 Klassen in 8 Familien). Das Panel schliesst sich. Sein Tank hat jetzt sechs Rohre. Es gab keinen Ton, kein Aufleuchten, keinen Ring, keine Meldung. Die groesste Entscheidung eines Laufs verlaeuft leiser als ein Treffer, den er einsteckt. Genau dieser Moment ist im Genre der Haken, an dem der naechste Lauf haengt.

**Vorschlag:** Klassenwechsel als Ereignis inszenieren, mit vorhandenen Bausteinen: ShockRing in eigener Farbe (renderer.ts:469), particles.burst am eigenen Tank, shake(4) und ein aufsteigender Dreiklang in audio.ts — ausgeloest im Snapshot-Vergleich, wenn self.playerClass wechselt (dieselbe Stelle wie der Level-Vergleich in main.ts:522). Fuer den Levelaufstieg audio.level auf Kill-Lautstaerke anheben und den Toast-Titel auf mindestens 14 px. Fuer Achievements einen eigenen Ton, sonst ist der seltenste Vorgang des Spiels auch der leiseste.


#### 11. Kein Gegner zeigt sein Level — Silhouette und Lebensbalken verstecken die Staerke aktiv

`apps/client/src/renderer.ts:963` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** PlayerSnapshot fuehrt level fuer jeden Spieler (index.ts:746), die Bestenliste zeigt es auch (ui.ts:764, 'Klasse . L28'). Am Tank selbst nicht: renderer.ts:963 setzt das Namensschild auf Name plus optional ' . BOT', mehr nicht. Die Groesse traegt die Information ebenfalls nicht — GAME.playerRadius ist konstant 22 (index.ts:806) und die Rumpfgeometrie haengt allein an der Klasse (Ausdehnung 22 bei core bis 38 bei leviathan, gemessen ueber hullGeometry). Statistisch macht das Level aber den Unterschied: statsFor (game.ts:144-165) skaliert maxHealth mit +12 % je Punkt, upgradePointsAtLevel(level) = level-1 (index.ts:838), also bis zu +120 %. Ein Core mit 10 Punkten in maxHealth hat 242 statt 110 Leben — bei identischer Silhouette. Der Lebensbalken verdeckt das zusaetzlich: renderer.ts:945 zeichnet health/maxHealth als Verhaeltnis auf feste 50 px Breite, ein 242-HP-Tank sieht bei vollem Leben genauso aus wie ein 110-HP-Tank.

**Szenario:** Spieler ist Level 12 und sieht einen Core auf sich zukommen. Core ist die Anfangsklasse — er greift an. Es ist ein Spieler, der vor zwanzig Sekunden auf Level 30 gestorben ist, mit halbem Level und 29 Punkten zurueckkam und diese in Leben und Schaden gesteckt hat: 242 statt 110 Leben. Der Kampf war entschieden, bevor er begann, und nichts auf dem Bildschirm hat den Preis genannt. Im Genre-Vorbild ist genau das die Grundlesbarkeit — dort waechst der Tank mit dem Level, und 'gross' heisst 'wegfahren'. Hier fehlt die Auskunft ganz, und der Spieler lernt nicht, sondern wird bestraft.

**Vorschlag:** Level ins Namensschild schreiben (renderer.ts:963, 'Name . L28') — die Zahl liegt bereits im Snapshot, kostet also kein Byte. Zusaetzlich den Lebensbalken in der Breite an maxHealth koppeln statt ihn auf 50 px zu normieren, gedeckelt bei etwa dem Doppelten: dann liest man 'viel Leben' und 'wenig Leben' auf einen Blick, statt nur den Prozentsatz. Wenn das Wachstum aus dem Vorbild gewollt ist, waere die kleinere Variante, den Rumpf um wenige Prozent je zehn Level zu skalieren — die Kollisionsgroesse bleibt bei playerRadius, damit die Physik unberuehrt bleibt.


#### 17. Zwoelf Upgrade-Plaetze: die beiden mit Taste 9 und 0 sind gesperrt, die beiden nutzbaren haben gar keine Taste

`apps/client/src/family-upgrades.ts:120` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Im echten Browser gemessen (1920x1080 und 844x390, Level 5, core, vier Punkte): zwoelf sichtbare Slots. Taste 1-8 = Max. Leben bis Koerperschaden, alle nutzbar. **Taste 9 = Signature-Tempo und Taste 0 = Signature-Staerke, beide `disabled` und `locked`.** Danach `Reichweite` und `Faehigkeit` -- beide nutzbar, beide **ohne** Tastenmarke, weil `upgradeHotkeyLabel` fuer Index >= 10 einen leeren String liefert (Zeile 121) und `input.ts:89` nur `Digit1`-`Digit9` und `Digit0` bedient. Der Onboarding-Hinweis verspricht dagegen: "Level-up! Die Zifferntasten 1-9 und 0 vergeben deine Upgrade-Punkte." (onboarding.ts:90). Der Sperrgrund steht ausschliesslich in `button.title` (ui.ts:615) -- gemessen `title="Erst mit einer Familie ab Level 5"`; auf Touch gibt es kein Hover, dort sind die zwei Plaetze grau ohne jede Begruendung.

**Szenario:** Beim ersten Level-up liest der Neuling "Zifferntasten 1-9 und 0". Er drueckt der Reihe nach durch. Bei 9 und 0 passiert nichts -- der Server lehnt beides ab, solange er `core` ist. Er haelt seine Tastatur oder das Spiel fuer defekt. Die beiden Plaetze, die tatsaechlich fuer ihn funktionieren (Reichweite, Faehigkeit), erreicht er ueberhaupt nur mit der Maus, und dass es sie gibt, merkt er nur, wenn er das Panel weit genug aufscrollt.

**Vorschlag:** Die Tastenbelegung an den *sichtbaren, nutzbaren* Plaetzen ausrichten statt am festen Index: Bei `core` bekommen `projectileRange` und `moduleCooldown` die 9 und die 0, die gesperrten Familien-Slots keine Marke. Und den Sperrgrund als sichtbaren Kleintext unter die Beschriftung setzen statt in `title` -- auf dem Handy ist ein Tooltip kein Text, sondern nichts.


#### 18. Ein Neuling ist 70 % der Zeit allein im Bild -- die Zahl, die GOAL.md offenlaesst

`apps/server/src/arena-director.ts:56` · spielgefuehl · Aufwand gross

**Beweis (Behauptung des Suchers, ungeprüft):** `baseBots: 18` mit dem ausdruecklichen Zweck, dass die Karte fuer den ersten Eindruck nicht "gespenstisch leer" ist (Kommentar Zeilen 43-55). Gemessen wurde das bisher nicht -- GOAL.md sagt selbst: "Ob die groessere Karte sich gross anfuehlt oder nur leer, hat niemand gespielt. Gemessen ist die Dichte, nicht das Gefuehl." Hier ist die Messung: Ein Client, der sich wie ein Anfaenger bewegt (naechste Form ansteuern), 120 s, 3.288 Snapshots gegen den echten Server (BOT_COUNT=18, ein Mensch): **Gegner im Bild im Mittel 0,30; in 70,5 % aller Snapshots kein einziger anderer Tank.** Formen dagegen reichlich: 21,07 im Mittel (min 3, max 29). Rechnerisch passt das: Das gelieferte Sichtfenster ist 1696x996 px (`ENTITY_CULL_HALF`, index.ts:828) = 3,13 % der 54 Mio px2 -- 18 Bots ergeben 0,56 erwartete Gegner, gemessen 0,30, weil Bots sich zusammenrotten und zeitweise tot sind. Zum Vergleich: Bei den 80 Spielern, auf die die Dichte ausgelegt ist, waeren es 2,47.

**Szenario:** Ein Fremder betritt die Arena und faehrt los. Er sieht Wuerfel, Dreiecke, Wandstuecke und ein Raster -- und in zwei von drei Augenblicken keinen einzigen anderen Tank. Rechts oben stehen acht Namen mit 4.600 bis 12.000 Punkten und einer BOT-Marke dahinter. Sein Eindruck nach den ersten Minuten ist ein leeres, grosses Feld, in dem gelegentlich etwas aus dem Nichts auftaucht und ihn toetet.

**Vorschlag:** Die Bot-Dichte fuer den Ein-Mensch-Fall an die Sichtflaeche koppeln statt an die Kartenflaeche: Fuer "im Schnitt ein Gegner im Bild" braeuchte es rund 32 statt 18 Bots (1/0,0313). Das ist eine Balance-Entscheidung fuer Sam, keine Fehlerbehebung -- aber sie sollte mit dieser Zahl getroffen werden statt mit "3,0 Mio px2 je Bot", die vom alten Kartenformat stammt. Billiger und ohne Serverlast: den Direktor die Bots leicht in Richtung des einzigen Menschen versetzen lassen, solange keiner hinsieht (die Despawn-Regel dafuer gibt es schon, `despawnDistance: 1600`).


#### 19. Die Bestenliste im HUD zeigt acht Plaetze, die der Neuling in zehn Minuten nie erreicht -- und seinen eigenen Rang nie

`apps/server/src/game.ts:297` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `[...this.players.values()].sort((a,b) => b.score - a.score).slice(0, 8)` -- acht Zeilen, keine Sonderzeile fuer den eigenen Spieler. Der Client zeichnet genau diese acht (`ui.ts:754-768`) und markiert die eigene nur, falls sie darunter ist (`.leader-row.self`). Gemessen an einem Server mit 25 Minuten Laufzeit: Platz 1 Orbit L39 mit 15.958, Platz 8 Vektor L14 mit 4.033; ein zweiter Abzug: Platz 8 Vektor L17 mit 4.612. Der Neuling erreichte in zwei 600-s-Laeufen Hoechstwerte von 3.702 bzw. 2.840 -- und verliert davon bei jedem Tod die Haelfte (combat-tuning.ts:284, gemessen zwoelf Tode in zehn Minuten). Er kommt also strukturell nicht auf die Liste und erfaehrt auch nicht, wie weit er davon weg ist.

**Szenario:** Rechts oben steht dauerhaft eine Rangliste, in der acht Namen stehen und keiner davon seiner ist. Nach zehn Minuten hat sich daran nichts geaendert; er weiss nicht, ob er Elfter oder Neunzehnter ist. Der einzige Vergleichsmassstab, den das Spiel anbietet, sagt ihm zehn Minuten lang dasselbe: Du kommst hier nicht vor.

**Vorschlag:** Neun statt acht Zeilen liefern: die Top 7 plus eine Zeile fuer den eigenen Spieler mit seinem echten Rang, wenn er nicht ohnehin drin steht (im Server eine Zeile mehr im `slice`, im Client eine Trennlinie). Das ist derselbe Trick, den Arras.io benutzt, und er macht aus einer Liste, die abschreckt, eine, die einen Abstand zeigt.


#### 20. Der erste Upgrade-Punkt aendert an 94 % der Formen nichts Messbares

`apps/server/src/combat-tuning.ts:118` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `damage: base.damage * (1 + player.upgrades.damage * 0.07)` -- ein Punkt sind +7 %. Core hat `damage: 16` (CLASS_DEFINITIONS). Schuesse bis zum Abschuss (`ceil(hp/damage)`, Projektilschaden geht ungedaempft auf die Form, game.ts:377): Wuerfel 16 HP -> 1 Schuss bei 16 wie bei 17,12. Dreieck 40 HP -> 3 Schuesse bei beiden. Nur das Fuenfeck 100 HP faellt von 7 auf 6. Die Formenverteilung ist 70 % Wuerfel, 24 % Dreieck, 6 % Fuenfeck (world.ts:143) -- **94 % aller Formen sterben nach dem ersten Punkt exakt gleich schnell.** Die anderen Ersteinsteiger-Slots sind aehnlich leise: `reload` 0,30 s -> 0,285 s (-5 %), `moveSpeed` +3 % (movementStatsFor), `maxHealth` 110 -> 120. Nirgends im Panel steht eine Zahl: Die zehn Pips zeigen nur, wie viele Punkte drin sind, `button.title` ist bei nicht gesperrten Slots leer (gemessen).

**Szenario:** Der Neuling bekommt seinen ersten Punkt, liest "Kugelschaden" und klickt ihn -- die naheliegendste Wahl. Danach spielt sich alles exakt gleich: Wuerfel platzen weiter beim ersten Schuss, Dreiecke weiter beim dritten. Er hat keine Rueckmeldung, ob der Punkt etwas getan hat, und keine Zahl, an der er es haette sehen koennen. Beim zweiten Level-up klickt er irgendetwas.

**Vorschlag:** Die Wirkung an den Knopf schreiben, so wie sie im Code steht: "Kugelschaden +7 % je Punkt - jetzt 16,0". Der Client kennt `player.upgrades` und die Formeln liegen in `shared`; das ist Text, keine Balance. Wer trotzdem an der Kurve drehen will: Der erste Punkt einer Kategorie duerfte doppelt zaehlen -- dann faellt das Dreieck von drei auf zwei Schuesse, und der erste Punkt fuehlt sich zum ersten Mal nach etwas an.


#### 21. Vier der acht Familien sind auf der Wahlkarte grau -- und bei Praezision widersprechen sich Wort- und Bildfarbe

`apps/client/src/class-choice.css:2` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `.class-choice-role { ... color:#9aa3b8 }` als Voreinstellung, danach nur vier Ausnahmen: `rapid` #8ad6ff, `precision` #ffc66f, `control` #73e3bd, `impact` #ff8192 (Zeilen 3-6). Die vier neueren Familien fehlen. Im Browser bestaetigt (1920x1080, Level 5): DAUERFEUER rgb(138,214,255), PRAEZISION rgb(255,198,111), KONTROLLE rgb(115,227,189), PANZERUNG rgb(255,129,146) -- **TARNUNG, HITZE, STELLUNG und SCHILD alle vier identisch rgb(154,163,184)**. Dasselbe Loch bei den Balkenfarben (Zeilen 12-15), dort aber folgenlos, weil die Balken ohnehin ausgeblendet sind. Dazu ein zweites Farbsystem auf derselben Karte: `.class-choice-preview` hat alle acht Zweige (Zeilen 50-57), aber mit anderen Werten -- bei `precision` steht das Rollenwort orange (#ffc66f) ueber einem blauen Tank (#58b0e8, gemessen rgb(88,176,232)), bei `rapid` hellblau ueber violett. Da nach Befund 1 nur Bild, Name und Rollenwort ueberhaupt sichtbar sind, ist die Farbe zwei Drittel der Information auf der Karte.

**Szenario:** Der Neuling ueberfliegt die acht Karten. Vier tragen ein farbiges Rollenwort, vier ein graues -- er liest daraus, dass es vier Hauptwege und vier Nebenwege gibt. Bei Sniper steht ein oranges PRAEZISION ueber einem blauen Tank; wenn er spaeter im Rad (Taste C) den Praezisions-Ast sucht, sucht er die falsche Farbe.

**Vorschlag:** Die vier fehlenden Zweige in `class-choice.css` ergaenzen und dabei dieselben Werte nehmen wie `.class-choice-preview` -- eine Farbe je Familie, an einer Stelle definiert (z. B. als `--zweig-farbe` je `[data-branch]`), die Rollenwort, Bild und Balken gemeinsam benutzen. Solange die Zuordnung an zwei Stellen mit verschiedenen Zahlen steht, laufen sie beim naechsten Mal wieder auseinander.


#### 22. Die Steuerzeile auf dem Startscreen nennt eine Taste, die fuer 55 von 65 Klassen nichts tut -- und verschweigt die beiden, die immer wirken

`apps/client/src/ui.ts:183` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `<p class="start-note"><span>WASD</span><span>LINKS FEUER</span><span>RECHTS DROHNEN</span><span>C KLASSEN</span></p>`. `secondary` (rechte Maustaste) hat serverseitig genau eine Wirkung: Es dreht das Drohnenziel um (`game.ts:497`, `drone-tuning.ts:159`). Nur 10 der 65 Klassen haben `droneCount > 0`, und Core -- der Tank, mit dem jeder anfaengt -- hat 0. Nicht genannt sind dagegen SPACE (Faehigkeit, wirkt ab der ersten Sekunde: `gameplay-ui.ts:142-147`, der HUD-Knopf zeigt "SPACE / DASH / READY") und E (Autofeuer, `input.ts:81`) -- in Diep.io die Taste, ohne die niemand farmt. Auf Touch kommt der Knopf dazu: `style.css:49` setzt `.secondary-action { display: block }` fuer `pointer: coarse`, unabhaengig von der Klasse. Im Browser gemessen (844x390, core): `#secondary-action` `display: grid` mit dem Text "REPEL" -- ein dauerhaft sichtbarer Knopf im Daumenbereich, der fuer diesen Tank nichts ausloest.

**Szenario:** Der Fremde liest vor dem ersten Klick vier Bedienhinweise, merkt sich "rechte Maustaste = Drohnen", probiert es in der Arena -- und nichts passiert, heute nicht und die naechsten fuenfzig Level auch nicht, sofern er nicht zufaellig in die Controller-Familie abbiegt. Von der Leertaste erfaehrt er erst nach 18 Sekunden aus dem Onboarding, vom Autofeuer auf E nie. Auf dem Handy tippt er den REPEL-Knopf neben dem Zieldaumen an und wartet auf eine Wirkung.

**Vorschlag:** Die Zeile auf das umstellen, was fuer jeden Tank ab Sekunde eins gilt: `WASD - LINKS FEUER - E AUTOFEUER - SPACE FAEHIGKEIT - C KLASSEN`. Und `.secondary-action` nur zeigen, wenn `CLASS_DEFINITIONS[playerClass].droneCount > 0` -- der Client kennt die Klasse in `ui.update`, es ist eine Zeile `hidden`.


#### 30. Der Anfaengerschutz haelt sechs Sekunden

`apps/server/src/bot-brain.ts:105` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** ROOKIE_PROTECTION_LEVEL = 8; unterhalb davon jagen Bots nicht aktiv (bot-brain.ts:386). Bis Level 8 braucht es xpAtLevelStart(8) = 1.329 XP – das sind 8,7 Durchschnittsformen oder drei Pentagons. Gemessen mit dem Farm-Client: Level 8 nach 5,9 Sekunden. Der Onboarding-Schritt 'Beweg dich' laeuft dagegen bis zu 14 Sekunden (apps/client/src/onboarding.ts:72), der Schritt 'ability' erscheint erst ab 18 Sekunden (onboarding.ts:126). Wogegen der Schutz faellt: Leaderboard-Stichprobe eines Servers nach 10 Minuten Laufzeit – Level 16, 17, 20, 25, 34, 35, 37, 37 (Median 34). Und nur neue Bots des Direktors starten auf Menschenniveau (arena-director.ts:90, levelFactor 0,85); die Startpopulation levelt einfach weiter, in der Messung bis 47.

**Szenario:** Ein Spieler oeffnet die Seite und joint einen Server, der seit zehn Minuten laeuft. Nach sechs Sekunden ist sein Anfaengerschutz weg, waehrend der Hinweis unten noch erklaert, wie man faehrt, und er das Modul auf der Fertigkeitstaste noch nicht kennengelernt hat. Um ihn herum stehen Tanks auf Level 25 bis 37 mit vollen Upgrade-Balken. Der Schutz, der genau diesen Moment abfangen soll, ist der einzige Teil des Spiels, den er nie bewusst wahrnimmt – weil er vor dem ersten Kontakt ablaeuft.

**Vorschlag:** Den Schutz an die Verbindungszeit haengen statt ans Level – etwa die ersten 45 Sekunden nach dem Join, oder bis der Spieler seinen ersten Schuss kassiert hat. Ein Levelschwellwert kann das nicht leisten, weil die untersten Level Sekunden dauern und ihre Dauer sich mit jeder Kurvenaenderung mitverschiebt.


#### 31. Die Kosten wachsen um Faktor 102, der Durchsatz um 1,8 – jedes Level dauert laenger als das davor

`apps/server/src/combat-tuning.ts:118` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Levelkosten: 73 XP fuer Level 1->2, 7.460 XP fuer Level 59->60 – Faktor 102. Farm-Durchsatz dagegen: Modell mit Core (16 Schaden, 0,3 s Nachladen), 155 px mittlerem Nachbarabstand (9000x6000 / shapeTargetCount 562) und 85 % Trefferquote ergibt 131 XP/s ohne Punkte. Mit voller Investition in genau die drei Werte, die das Farmen beschleunigen – 10 Damage (+7 %/Punkt, combat-tuning.ts:118), 10 Reload (x0,95/Punkt, :111), 10 Move (+3 %/Punkt, shared/index.ts:964), also 30 der insgesamt 59 Punkte – sind es 235 XP/s: Faktor 1,79. Sekunden je Level steigen dadurch um Faktor 57 (0,56 s auf 32 s) fuer immer dieselbe Belohnung, +1 Punkt. EMPIRISCH BESTAETIGT: 400 s Bandmessung an echten Bot-Laeufen – XP-Rate im Band Level 11–25 Median 163 XP/s, im Band Level 32–46 Median 211 XP/s (Faktor 1,29), waehrend die Levelkosten von 555 auf 4.839 XP steigen (Faktor 8,7). Gemessene Sekunden je Level: Median rund 5,8 s bei L16–20, rund 23,1 s bei L43–46.

**Szenario:** Der Spieler tut alles richtig: Er steckt jeden Punkt in Schaden, Nachladen und Tempo. Trotzdem merkt er ab Level 30, dass jedes Level laenger dauert als das davor, und ab Level 40 dauert eines so lange wie die ersten dreissig zusammen. Was er bekommt, ist jedes Mal identisch: ein Punkt, also 0,83 % eines Vollausbaus. Staerker werden macht das Staerkerwerden nicht schneller – in Diep.io ist genau das die Belohnungsschleife: mehr Durchschlag und Rammschaden verwandeln Pentagon-Nester in Ernte.

**Vorschlag:** Entweder die Kurve flacher (kubischen Term senken, quadratischen anheben), so dass die Kosten in der Groessenordnung wachsen, in der der Durchsatz wachsen kann. Oder den Durchsatz mitwachsen lassen: die Formen-Belohnung an das Level des Toeters koppeln, so wie es die Kill-Belohnung schon tut (game.ts:572, 130 + level x 18).


#### 32. Die Elite-Form belohnt das Gegenteil dessen, was das Spiel dem Spieler beibringt

`apps/server/src/arena-systems.ts:307` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Der Elite-Bonus ist ein Festwert: `internals.awardXp(owner, 260)` – unabhaengig davon, welche Form promoviert wurde. Promoviert wird gleichverteilt gezogen (arena-systems.ts:186, `candidates[Math.floor(Math.random() * candidates.length)]`), und die Formenverteilung ist 70 % Quadrat / 24 % Dreieck / 6 % Pentagon (world.ts randomShapeKind) – also ist rund jede zweite bis dritte Elite ein Quadrat. Leben wird x4 (arena-systems.ts:171). Gerechnet mit Core (53,3 DPS, 85 % Treffer, 155 px Anfahrt): Elite-Quadrat 64 HP, (18+260) x 5 = 1.390 XP in 2,0 s = 700 XP/s. Elite-Dreieck 160 HP, 1.525 XP in 4,1 s = 372 XP/s. ELITE-PENTAGON 400 HP, 1.900 XP in 9,4 s = 202 XP/s – und ein GEWOEHNLICHES Pentagon liefert 600 XP in 2,8 s = 216 XP/s. Die Elite-Pentagon ist also die schlechteste Beute auf dem Feld.

**Szenario:** Der Spieler hat in den ersten Minuten gelernt, was jedes Diep-Genre lehrt: Pentagon ist die dickste Beute. Dann laeuft Core Surge, der Ring wird gezeichnet, in der Zone steht eine sichtbar aufgeblasene Form. Ist es eine Pentagon, waere er messbar besser dran, sie stehenzulassen und daneben normale Formen zu schiessen. Ist es ein Quadrat, ist sie das Siebenfache einer normalen wert. Er kann das nicht wissen, und die richtige Antwort ist die Umkehrung dessen, was er gerade gelernt hat. Damit ist das Ereignis, das laut Nordstern 'wechselnde Ziele' liefern soll, eine Lotterie mit Faktor 3,5 zwischen den Losen.

**Vorschlag:** Den Bonus proportional statt fest machen – am naheliegendsten mit demselben Faktor wie das Leben: reward x 4 statt +260. Dann kostet eine Elite viermal so viel Zeit und zahlt viermal so viel, die gelernte Reihenfolge bleibt intakt, und die Elite-Pentagon bleibt die dickste Beute.


#### 33. Der Level-Toast meldet einen Punkt, wenn vier ankommen – genau beim ersten Mal

`apps/client/src/main.ts:492` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `if (previousSelf && updatedSelf.level > previousSelf.level) ui.toast(\`Level ${updatedSelf.level}\`, 'Du hast einen neuen Upgrade-Punkt erhalten.', 'success')` – ein Toast je Snapshot, unabhaengig davon, wie viele Stufen dazwischen lagen, und der Text nennt fest die Einzahl. Weil die untersten Stufen 73/107/143/184 XP kosten und eine einzelne Belohnung ein Vielfaches davon bringt, ist der Mehrfachsprung am Anfang der Normalfall, nicht die Ausnahme: 1 Pentagon aus dem Stand = 600 XP -> Level 5 (+4 Level, +4 Punkte, EIN Toast). 1 Kill auf Level 1 = (130+18) x 5 = 740 XP -> Level 6 (+5). 1 Elite-Pentagon = 1.900 XP -> Level 9 (+8). 1 Guardian = 600 x 5 = 3.000 XP -> Level 11 (+10 Punkte, ein Toast, Einzahl).

**Szenario:** Zweite Spielsekunde, erste Pentagon zerplatzt. Der Spieler liest 'Level 5 – Du hast einen neuen Upgrade-Punkt erhalten', schaut ins Panel und sieht dort eine 4. Die einzige Erklaerung, die das Spiel zu seinem Kernsystem gibt, ist in genau dem Moment falsch, in dem sie zum ersten Mal auftaucht – und der Spieler lernt daraus, dass die Meldungen nicht stimmen.

**Vorschlag:** Die Differenz mitgeben: `const gewonnen = updatedSelf.level - previousSelf.level;` und im Text pluralisieren ('+4 Punkte'). Kostet zwei Zeilen und macht die Meldung an der Stelle richtig, an der sie am meisten gelesen wird.


#### 37. Im HUD steht in jeder Sitzung „MAZERS ALPHA"

`apps/client/src/main.ts:410` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** main.ts:410: `ui.setConnection('online', modus === 'maze' ? 'MAZERS ALPHA' : `MAZERS · ${ARENA_MODES[modus].label.toUpperCase()}`)`. `maze` ist der Standardmodus (index.ts:129 faellt bei unbekanntem `ARENA_MODE` auf maze zurueck), also ist „ALPHA" der Normalfall. Der Text sitzt in der `network-pill` – oben Mitte, fest positioniert (style.css:39: `.network-pill{position:absolute;top:var(--edge-y);left:50%…}`), sichtbar die ganze Runde. Nebenbei ist die Beschriftung inkonsistent: In FFA und Royale steht dort der Modus, in Maze ein Entwicklungsstand.

**Szenario:** Ein Spieler betritt die Arena und hat waehrend der gesamten Runde mittig oben das Wort ALPHA im Blick. GOAL.md verlangt „es fuehlt sich an wie ein fertiges Spiel, nicht wie ein Prototyp" – hier schreibt das Spiel das Gegenteil selbst an die auffaelligste Stelle des HUD.

**Vorschlag:** „MAZERS" im Standardmodus, `MAZERS · FFA` / `MAZERS · ROYALE` sonst – dieselbe Regel fuer alle drei Modi. Wenn ein Versionshinweis gewuenscht ist, gehoert er auf den Startscreen, nicht ins Gefecht.


#### 39. Die leere Bestenliste behauptet, sie sei „nicht eingerichtet" – auch wenn sie laeuft

`apps/client/src/start-leaderboard.ts:118` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** ui.ts:211 setzt als Ruhezustand der Seite: „Die Bestenliste ist auf diesem Server noch nicht eingerichtet." `StartLeaderboard.render` bricht bei `entries.length === 0` in Zeile 118 ab, bevor `this.empty.hidden = true` (Zeile 135) laeuft – der Satz bleibt also stehen. Serverseitig ist das genau der Normalfall am ersten Tag: persistence.ts:684 ff. antwortet mit **200 und `entries: []`**, sobald `state.enabled` gilt und noch kein Lauf geschrieben wurde. Dieselbe falsche Zeile erscheint bei 503 (Supabase nicht erreichbar, persistence.ts:706) und bei Netzausfall/Timeout, weil `load()` in Zeile 108 bzw. 110 still zurueckkehrt. Auch das Abzeichen am Navigationseintrag (`[data-board-meta]`, gesetzt in Zeile 134) bleibt in allen drei Faellen leer.

**Szenario:** Sam setzt die Supabase-Migration `0005_sessions.sql` – laut GOAL.md der naechste Handgriff. Danach ist die Bestenliste **an**. Der erste Besucher klickt auf „Bestenliste – Die besten Laeufe" und liest, sie sei auf diesem Server nicht eingerichtet. Er glaubt das und schaut nie wieder nach. Genauso beim ersten Supabase-Wackler: Die Seite meldet einen dauerhaften Zustand, wo eine Stoerung vorliegt.

**Vorschlag:** Drei Zustaende unterscheiden, statt einen: „nicht eingerichtet" nur bei 404, „Noch keine Laeufe – spiel den ersten" bei 200 mit leerer Liste, „Gerade nicht erreichbar" bei 503/Timeout. `render` muss dafuer auch die leere Liste durchlaufen.


#### 40. Der Handy-Knopf „REPEL" tut bei 55 von 65 Klassen nichts – ausser die Spawn-Unverwundbarkeit zu beenden

`apps/client/src/ui.ts:333` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** ui.ts:333 legt `<button class="secondary-action" id="secondary-action">REPEL</button>` fest verdrahtet an; kein Code aendert die Beschriftung je (einziger weiterer Zugriff: input.ts:125–136). Der Knopf ist nur auf Touch sichtbar (style.css:49, mobile.css:199) und setzt ausschliesslich `secondaryDown` (input.ts:129). Serverseitig wirkt `secondary` an genau zwei Stellen, beide im Drohnen-Schritt (game.ts:497, drone-tuning.ts:159: Ziel hinter den eigenen Tank legen). Drohnen haben laut Build 10 von 65 Klassen (`droneCount > 0`: drone, warden, factory, overseer, carrier, guardian, hive, sovereign, sentinel, aviary). Fuer die uebrigen 55 bleibt eine einzige Wirkung uebrig: game.ts:231 `if (player.invulnerable && (moving || input.primary || input.secondary))` loescht die Spawn-Unverwundbarkeit. Die Beschriftung ist ausserdem doppelt falsch: Das Spiel nennt dieselbe Taste an anderer Stelle „RECHTS DROHNEN" (ui.ts:183), und ein Modul namens „Repulse Pulse" (Kuerzel PULSE) existiert daneben als eigener Knopf.

**Szenario:** Ein Handy-Spieler mit einem Sniper (keine Drohnen) sieht rechts unten dauerhaft einen Knopf „REPEL". Er tippt ihn direkt nach dem Respawn an, um zu sehen, was er tut. Sichtbar passiert nichts – unsichtbar verliert er seinen Spawnschutz und wird von dem Bot erschossen, der neben ihm steht. Danach ist der Knopf fuer ihn kaputt oder das Spiel unfertig; beides stimmt aus seiner Sicht.

**Vorschlag:** Den Knopf nur zeigen, wenn `CLASS_DEFINITIONS[playerClass].droneCount > 0` (das HUD kennt die Klasse bereits in `ui.update`), und ihn in derselben Sprache beschriften wie der Startscreen: „DROHNEN" bzw. „ZURUECK".


#### 41. Alle Drohnen werden gleich gross gezeichnet, obwohl der Server zehn verschiedene Radien rechnet

`apps/client/src/renderer.ts:920` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** renderer.ts:920 zeichnet jede Drohne als `polygon(3, 13, angle)` – ein Dreieck mit festem Umkreisradius 13, unabhaengig von Besitzer und Klasse. Der Server fuehrt dagegen zehn Archetypen mit eigenem Kollisionsradius (drone-tuning.ts:28–59): hive 7,5 · aviary 8,5 · overseer 9,5 · warden 10,5 · drone 12 · guardian 13 · factory/sovereign 13,5 · carrier/sentinel 15,5. Spanne 2,07x. Gerechnet wird damit auch wirklich (drone-tuning.ts:170/177/186: `moveCircle(..., radius)`, `Math.pow(candidate.radius + radius, 2)`). Der Client kann es gar nicht wissen: `DroneSnapshot` (packages/shared/src/index.ts:757) hat kein `radius`-Feld. Folge: Eine Hive-Drohne wird mit 1,73-facher Kantenlaenge, also 3,0-facher Flaeche gezeigt; eine Carrier-Drohne hat 2,5 Einheiten Trefferflaeche, die man nicht sieht. Zusaetzlich: `health` und `maxHealth` liegen auf der Leitung (index.ts:757, WireDroneSnapshot uebernimmt beide) und werden nirgends gezeichnet – Formen (renderer.ts:895) und Spieler (renderer.ts:944) bekommen ihren Balken, Drohnen nicht.

**Szenario:** Ein Spieler weicht einem Carrier-Schwarm aus. Er zieht knapp an einer Drohne vorbei, sieht Luft dazwischen – und nimmt trotzdem Schaden. Beim naechsten Gegner, einem Hive, weicht er genauso grosszuegig aus und verliert unnoetig Boden, weil die Drohnen in Wahrheit halb so gross sind. Optisch sind beide Flotten nicht auseinanderzuhalten: zehn Drohnenklassen mit voellig verschiedenem Charakter (18 bis 72 Leben, 3 bis 10 Stueck) zeigen dasselbe Dreieck.

**Vorschlag:** `radius` in `DroneSnapshot` aufnehmen (der Server hat den Wert bereits als `gameplayRadius`, drone-tuning.ts:132) und in renderer.ts:920 statt der 13 verwenden. Wenn Bandbreite das Argument ist: einmal beim ersten Auftauchen der ID senden, wie es die Formen mit `radius`/`maxHealth` schon tun (WireShapeSnapshot, index.ts:1004).


#### 42. 40 von 55 Klassen mit Rohr klingen beim Schuss identisch – vier ganze Familien haben keinen eigenen Ton

`apps/client/src/audio.ts:4` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** audio.ts:4–5 fuehren zwei handgepflegte ID-Listen: `HEAVY_CLASSES` (8 IDs) und `RAPID_CLASSES` (7 IDs). `shot()` (audio.ts:50–56) waehlt daraus drei Klangbilder; alles andere faellt auf den mittleren Standardton (175 Hz, triangle, 0,06 s). Gerechnet ueber den Build: 15 von 65 Klassen haben einen eigenen Klang, 50 nicht, davon 40 mit `barrelCount > 0` – also hoerbar. Nach Familien aufgeschluesselt haben SIEGE (6/6), AEGIS (6/6), TEMPEST (6/6) und SPECTER (6/6) **keine einzige** Klasse mit eigenem Ton; die 15 Ausnahmen verteilen sich nur auf precision (6), rapid (7) und impact (2). Die Information waere da: Jede Definition traegt `branch` und alle acht Familien sind benannt.

**Szenario:** Ein Spieler steigt vom Start-Core ueber SIEGE bis zur Apex-Klasse auf. Sein Tank sieht anders aus, rechnet anders (Stellung statt Nachladen) und heisst anders – aber jeder Schuss klingt vom ersten bis zum letzten Level exakt wie der des Level-1-Anfaengers. Genauso im Gefecht: Ein Fortress, der neben einem zielt, ist am Klang nicht von einem beliebigen Bot zu unterscheiden. GOAL.md nennt „nicht nur langweilige Kugeln" als Sams Wunsch; das Ohr hoert genau das.

**Vorschlag:** Den Klang aus `CLASS_DEFINITIONS[playerClass].branch` ableiten statt aus zwei ID-Listen – acht Familien, acht Grundklaenge, mit `damage`/`reload` als Feinabstimmung. Das deckt alle 65 Klassen ab und kann nicht mehr veralten, wenn Klassen dazukommen.


#### 43. Das Klassenrad laesst sich auf dem Handy nicht zoomen – 48 von 65 Klassen bleiben namenlose Punkte

`apps/client/src/class-wheel.ts:137` · verstaendlichkeit · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `installiereZoom` (class-wheel.ts:137–181) kennt genau drei Wege: `wheel` (Mausrad, Zeile 137), Ein-Zeiger-Ziehen zum Verschieben (Zeile 154 ff.) und `dblclick` zum Zuruecksetzen (Zeile 177). Kein Pinch-Handler, kein Zoom-Knopf – `zentriereAuf` (Zeile 200) hat trotz des Kommentars „der Knopf ‚auf mich zentrieren' nutzt das" keinen einzigen Aufrufer im Repo. Auf Touch bleibt der Zoom damit auf 1, und Zeile 131 setzt dann `data-detail='grob'`; class-tree.css:509–511 blendet in diesem Zustand die Beschriftungen von Ring 2 und Ring 3 aus (`opacity: 0`). Gezaehlt ueber `ringOf(unlockLevel)`: Ring 2 (Level 6–15) 24 Klassen, Ring 3 (Level 16–28) 24 Klassen – also 48 von 65 ohne Namen. Sichtbar bleiben Core, die 8 Familien und die 8 Apex-Klassen. Die Rettungsregeln in class-tree.css:517–521 helfen nicht: `:hover` gibt es auf Touch nicht, `is-selected` immer nur fuer einen Knoten. Dazu steht unter dem Rad unveraendert „Mausrad zoomt · Ziehen verschiebt · Doppelklick zeigt alles" (class-wheel.ts:106) – zwei der drei genannten Bedienungen existieren auf dem Handy nicht.

**Szenario:** Ein Handy-Spieler tippt auf dem Startscreen „Klassen – Alle 65 Klassen und ihre Signature". Er sieht 17 beschriftete Knoten und 48 stumme Punkte, versucht instinktiv zu pinchen (nichts passiert) und liest darunter eine Anleitung fuer eine Maus, die er nicht hat. Die Seite, die vor dem ersten Spiel die Frage „was werde ich eigentlich?" beantworten soll (Kommentar start-nav.ts:37), beantwortet sie fuer drei Viertel des Baums nicht.

**Vorschlag:** Pinch-Zoom ergaenzen (zwei Zeiger ueber die vorhandenen `pointerdown/move`-Handler, `zoom` wie beim Mausrad setzen) oder zwei +/−-Knoepfe neben das Rad haengen – `zentriereAuf` und `zuruecksetzen` sind bereits fertig. Den Hinweistext wie in class-codex.ts:88 nach `pointer: coarse` verzweigen.


#### 44. Das Loadout-Menue zeigt rohe englische Code-Bezeichner: „Dash · mobility", „Front Barrier · defense"

`apps/client/src/gameplay-ui.ts:75` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** gameplay-ui.ts:75 baut jede Option als `${definition.label} · ${definition.role}`. `role` ist ein interner Aufzaehlungstyp (packages/shared/src/gameplay.ts:14: `'mobility' | 'control' | 'defense' | 'sustain'`) und wird unuebersetzt in die Oberflaeche geschrieben. Aus dem Build ausgelesen ergibt das genau vier Eintraege: „Dash · mobility", „Repulse Pulse · control", „Front Barrier · defense", „Repair Cycle · sustain". Das zweite Auswahlfeld daneben ist komplett englisch: „Standard Frame", „Lightweight Frame", „Projectile Stabilizer", „Reinforced Core" – mit deutschen Beschreibungen darunter („Keine Veraenderung. Empfohlene Basis."). Ueberschrift und Feldnamen mischen ebenfalls: „CORE LOADOUT", „AKTIVES MODUL", „FRAME" (gameplay-ui.ts:58–62).

**Szenario:** Ein Spieler oeffnet Einstellungen, um vor der ersten Runde seine Faehigkeit zu waehlen – die einzige Vorab-Entscheidung, die das Spiel ihm anbietet. Er liest ein Klappmenue, in dem hinter jedem Eintrag ein englisches Wort aus dem Quelltext steht, und ein zweites, dessen vier Optionen alle auf Englisch heissen. Der Kasten liest sich wie ein Entwicklerwerkzeug, nicht wie eine Spielerentscheidung – ausgerechnet an der Stelle, an der er zum ersten Mal etwas ueber sich bestimmen darf.

**Vorschlag:** `role` uebersetzen (Mobilitaet · Kontrolle · Verteidigung · Erholung) – am besten als `roleLabel` neben `label` in der Definition, damit es eine Quelle bleibt. Die vier Frame-Namen eindeutschen oder als Eigennamen kenntlich machen, aber nicht halb.


#### 54. Der Name – die einzige Spur, die ein Gast oeffentlich hinterlaesst – heisst standardmaessig "Player" und wird nie gemerkt

`apps/client/src/ui.ts:173` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `<input id="player-name" maxlength="18" autocomplete="off" value="Player" />` (ui.ts:173). `autocomplete="off"` schaltet zusaetzlich das Merken durch den Browser ab. Beim Beitritt: `const name = ...value.trim() || 'Player'` (ui.ts:401). Kein localStorage-Schluessel dafuer (siehe Befund 1), und ZUM STARTSCREEN laedt die Seite neu (ui.ts:431), setzt das Feld also auf den Ausgangswert zurueck. Genau dieser String landet als `player_name` in der Bestenliste (persistence.ts:921, 0001_runs.sql:15) und wird dort als einziges Erkennungsmerkmal angezeigt (start-leaderboard.ts:127).

**Szenario:** Der Startscreen zeigt ein Feld, in dem schon etwas steht, und einen grossen Knopf daneben. Der schnellste Weg ins Spiel ist, das Feld nicht anzufassen. Dieser Spieler heisst also "Player", steht als "Player" in der Bestenliste, und wenn er am naechsten Tag wiederkommt, heisst er wieder "Player" – er kann seine eigene Zeile von gestern nicht von der eines Fremden unterscheiden. Bei mehreren solchen Spielern ist die Bestenliste eine Liste von "Player"-Zeilen: das oeffentliche Gesicht des Spiels, und es hat keins.

**Vorschlag:** Den eingegebenen Namen im localStorage merken und beim Laden vorbelegen (dieselbe Stelle wie `prefillPlayerName`, ui.ts:479-484, respektiert schon `nameTouched`). Zusaetzlich statt `value="Player"` ein `placeholder` mit einem zufaelligen Vorschlag – ein Feld, das leer aussieht, wird ausgefuellt; ein Feld, in dem schon etwas steht, nicht.


#### 55. Der Gast wird genau einmal nach dem Login gefragt – auf einer Unterseite, die er nicht betreten muss, und der einzige Satz dazu redet ihm den Login aus

`apps/client/src/auth-panel.ts:73` · wiederkommen · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Der Login-Container `#start-auth` liegt im Markup ausschliesslich in der Unterseite `data-view="profil"` (ui.ts:191-197). Die Startkarte selbst traegt nur Logo, Namensfeld, ARENA BETRETEN und die Navigationszeile (ui.ts:162-183). Der Navigationseintrag heisst "Profil / Konto, Bestwerte, Anzeigename" (start-nav.ts:40) – kein Wort davon, dass dort etwas zu gewinnen waere. Der einzige Text am Knopf ist "optional – als Gast spielen geht immer" (auth-panel.ts:73-76), also ein Argument DAGEGEN. Der zweite Satz steht ebenfalls auf derselben Unterseite (profile-panel.ts:98-101). Der Death-Screen (ui.ts:295-330) hat kein Login-Angebot, und ZUM STARTSCREEN fuehrt per Reload auf die Seite 'start', nicht auf 'profil' (start-nav.ts:60). Erschwerend: `signIn()` ist ein OAuth-Redirect (apps/client/src/auth.ts:129-135), und der gerade gespielte Lauf ist bereits mit `user_id = null` geschrieben (persistence.ts:928) – er laesst sich nachtraeglich nicht mehr einem Konto zuordnen.

**Szenario:** Ein Spieler kommt auf die Seite, tippt einen Namen, klickt ARENA BETRETEN. Er hat den Login-Knopf nie gesehen – er liegt zwei Klicks entfernt auf einer Seite namens "Profil", und wer noch nie gespielt hat, hat kein Profil und keinen Grund dorthin zu gehen. Nach dem Lauf laedt er zurueck auf den Startscreen und sieht ihn wieder nicht. Er wird also nie gefragt, und selbst wenn er von allein hinfaende, saehe er als einziges Argument den Satz, dass er ihn nicht braucht.

**Vorschlag:** Den Login dorthin stellen, wo er einen Preis hat: eine Zeile auf dem Death-Screen, die erscheint, wenn der Lauf den lokalen Bestwert schlaegt ("Bestwert 12.400 – anmelden, damit er bleibt"). Und den Hinweistext von "optional" auf das Versprechen umstellen: Bestwerte, Spielzeit, Achievements ueber Geraete hinweg. Der Gast-Weg bleibt unveraendert offen – die Zusage aus docs/SUPABASE.md wird davon nicht beruehrt.


#### 56. Die Bestenliste sagt nie, wo man selbst steht – und wird nach dem Lauf gar nicht neu geholt

`apps/client/src/start-leaderboard.ts:117` · wiederkommen · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `render()` (start-leaderboard.ts:117-138) baut 50 Zeilen ohne jede Selbstmarkierung – anders als die In-Game-Liste, die das eigene Ich schon kennt (`leader-row self`, ui.ts:756). Geladen wird die Liste genau einmal beim Seitenstart (main.ts:148 `void new StartLeaderboard(ui.root).load()`), und die Antwort darf bis zu 30 s alt sein (persistence.ts:33 DEFAULT_LEADERBOARD_CACHE_MS = 30_000) waehrend der eigene Lauf bis zu 5 s im Schreibpuffer liegt (persistence.ts:32 DEFAULT_FLUSH_INTERVAL_MS = 5_000). Es gibt keine Route, die einen Rang zu einem Punktestand liefert – `/leaderboard` kennt nur `limit` (persistence.ts:684-710).

**Szenario:** Ein Spieler stirbt mit 6.200 Punkten, klickt ZUM STARTSCREEN, klickt in der Navigation auf "Bestenliste" und liest 50 Zeilen durch, um zu sehen, ob er dabei ist. Ist er es nicht, erfaehrt er nichts – nicht, ob er knapp dran war oder um Faktor fuenf daneben. Ist er dabei, muss er seinen eigenen Namen selbst suchen; nichts hebt ihn hervor. Ein Ziel, dessen Abstand man nicht kennt, ist kein Ziel.

**Vorschlag:** Beim Rendern die Zeilen markieren, deren `playerName` dem zuletzt gespielten Namen entspricht (Befund 7 liefert ihn aus dem localStorage). Und einen Satz ueber der Liste: "Dein bester Lauf: 6.200 – Platz 50 liegt bei 8.100". Beides ist aus der bereits geholten Antwort rechenbar, ohne neue Route.


#### 57. Ein Battle-Royale-Sieg hinterlaesst keine Spur – der einzige teilbare Moment des Spiels verfaellt mit der Rundenpause

`apps/server/src/arena-royale.ts:391` · inhalt · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `state.winnerName` (arena-royale.ts:111, gesetzt bei :391) existiert ausschliesslich im laufenden Snapshot (packages/shared/src/gameplay.ts:197 `winnerName: string | null` in `RoyaleZoneSnapshot`). Die Tabelle `runs` hat keine Spalte fuer Siege und keine fuer den Modus (supabase/migrations/applied/0001_runs.sql:12-22: created_at, player_name, score, level, player_class, kills, best_streak, duration_seconds). `profile_stats` aggregiert nichts dergleichen (0003_achievements.sql:63-77). Im Achievement-Katalog gibt es keinen Eintrag dazu (packages/shared/src/gameplay.ts:250-258, sieben IDs, keine Royale). Und der Sieger geht in die naechste Runde durch denselben Reset wie alle (docs/GOAL.md: "halbes Level und Klasse zurueck, wie nach einem Tod").

**Szenario:** Jemand ueberlebt eine ganze Royale-Runde – zehn Minuten, schrumpfende Zone, letzter von achtzig. Sein Name steht waehrend der Pause auf dem Bildschirm. Dann startet die neue Runde, er ist wieder Level 20 im Core-Tank, und es gibt im ganzen System keinen Ort, an dem steht, dass er gewonnen hat: nicht auf dem Startscreen, nicht im Profil, nicht in der Bestenliste, nicht in den Erfolgen. Der Modus, dessen ganzes Versprechen "letzter Ueberlebender" ist, belohnt genau das mit nichts.

**Vorschlag:** Sofort und ohne Migration: ein Achievement `royaleWinner` im Katalog, ausgeloest an derselben Stelle, an der `winnerName` gesetzt wird. Danach eine `wins`-Spalte in `runs` (oder ein `mode`-Feld plus `won`), damit das Profil "3 Royale-Siege" zeigen kann – das ist die Zahl, die jemanden am naechsten Tag zurueckholt.


#### 58. "Kills gesamt" im Profil zaehlt dreieckig hoch – und die Death-Karte mischt Werte des Lebens mit Werten der Sitzung

`apps/server/src/persistence.ts:925` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Der `RunRecord` uebernimmt `target.kills` (persistence.ts:925). `killPlayer` setzt `kills` nie zurueck (game.ts:546-576 – zurueckgesetzt werden nur `streak`, Zustand und Position), und `respawn` auch nicht (game.ts:578-606 setzt `score`, `streak`, `bestStreak`, `level`, `upgrades` zurueck, `kills` und `deaths` bleiben stehen). `runs.kills` ist damit der SITZUNGS-Stand, nicht der des Laufs – und `profile_stats.total_kills = sum(kills)` (0003_achievements.sql:74) summiert diese Staende auf. Rechenbeispiel: Leben mit 2, 3 und 2 Abschuessen erzeugen die Zeilen 2, 5, 7 -> Summe 14 statt 7; bei n gleich starken Leben ist der Faktor (n+1)/2, bei zehn Toden also 5,5-fach. Genau diese Falle ist einen Modul weiter erkannt und dokumentiert (sessions.ts:519-533, mit demselben Zahlenbeispiel) – aber nur fuer die Admin-Tabelle behoben. Angezeigt wird die falsche Zahl im Profil als "Kills gesamt" (profile-panel.ts:169). Dasselbe Feld steht auf der Death-Karte unter "Kills" (ui.ts:717-718), waehrend Level, Score, Ueberlebt und Beste Streak dort je Leben gelten.

**Szenario:** Ein angemeldeter Spieler kommt nach einer Woche zurueck und sieht in seinem Profil "Kills gesamt: 412". Er hat rund 80 gemacht. Die eine Zahl, die seine Geschichte erzaehlen soll, ist um das Fuenffache aufgeblasen – und sie waechst umso falscher, je oefter er stirbt. Im selben Lauf sieht er auf der Death-Karte unter der Ueberschrift RUN BEENDET "7 KILLS", obwohl er in diesem Leben zwei gemacht hat; die Kachel daneben ("Beste Streak") zaehlt dagegen nur dieses Leben.

**Vorschlag:** `kills` (und `deaths`) beim Respawn zuruecksetzen und dafuer eine Sitzungssumme fuehren – oder, ohne Eingriff ins Spiel, im `RunRecord` die Differenz zum Stand beim letzten Tod schreiben (persistence.ts fuehrt mit `lifeStartedAt` bereits eine Buchhaltung je Leben). Auf der Death-Karte die Kills des Lebens zeigen und die Sitzungssumme, wenn ueberhaupt, getrennt beschriften.


#### 59. Zwei Drittel der Klassen liegen jenseits dessen, was ein normaler Spieler je sieht – und zwischen Level 19 und Level 60 nennt das Spiel kein einziges Ziel

`packages/shared/src/index.ts:836` · inhalt · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Freischaltstufen: 1 Klasse auf Level 1, 8 auf Level 5, 24 auf Level 15, 24 auf Level 28, 8 Apex auf Level 42 (CLASS_DEFINITIONS, z. B. index.ts:328 und :446). 32 der 65 Klassen liegen also auf Level 28 oder hoeher. Die Kurve `58L + 15L² + 0,55L³` (index.ts:836) ergibt: L15 = 6.101 XP, L28 = 25.457, L42 = 69.644, L60 = 176.280. Eine Form gibt im Mittel 30,6 XP (world.ts:5-9: 18/45/120 bei Ziehungsgewichten 0,70/0,24/0,06, world.ts:143) – Level 42 sind damit rund 2.276 Formen, Level 60 rund 5.761. Der Tod halbiert das Level (`respawnLevelFrom`, index.ts:839), Level 42 muss also aus Level 21 heraus in EINEM Leben erreicht werden: 58.084 XP oder ~1.900 Formen ohne einen einzigen Tod. Gemessen: der Anfaenger endet nach 5 Minuten auf Level 1–2 und stirbt alle ~2 Minuten (first-run-probe, dieser Build); der staerkste Bot in der vollen Arena brauchte 180 s ununterbrochenes Farmen fuer Level 41 und starb dann. Im Erfolgskatalog klafft dieselbe Luecke: `score10k` liegt bei ~Level 19 (10.289 XP), der naechste genannte Meilenstein ist `maxLevel` bei 176.280 XP – Faktor 17, ohne eine einzige Sprosse dazwischen.

**Szenario:** Ein Spieler oeffnet mit Taste C das Klassenrad und sieht 65 Klassen, darunter acht Apex-Tanks auf Level 42. Er spielt eine Woche lang Abende und kommt nie ueber Level 25 hinaus, weil ihn jeder Tod halbiert. Die Haelfte des Inhalts, mit dem das Spiel wirbt, ist fuer ihn Dekoration – und das Spiel sagt ihm nirgends, wie weit er davon weg ist oder was der naechste erreichbare Schritt waere. Zwischen "10.000 Punkte" und "Level 60" gibt es kein benanntes Zwischenziel, an dem er seinen Fortschritt messen koennte.

**Vorschlag:** Keine Balance-Aenderung noetig – die Distanz sichtbar machen und die Leiter fuellen: Erfolge fuer Level 15 / 28 / 42 (die drei Stufen, die es im Klassenbaum ohnehin gibt), auf dem Death-Screen die Zeile "Naechste Klassenstufe: Level 28", und im Klassenrad die noch fehlenden Level statt nur der Stufe. Ob die Kurve selbst zu steil ist, ist eine Balance-Frage und gehoert Sam – die fehlenden Zwischenziele sind es nicht.


#### 65. Die Telemetrie meldet fuer jeden Modus 'maze-alpha' - der Nordstern behauptet das Gegenteil

`apps/server/src/telemetry.ts:36` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** telemetry.ts:36 `const SERVER_MODE = 'maze-alpha';` ist unveraendert hartkodiert und wird an zwei Stellen ausgegeben: telemetry.ts:509 als Feld `mode` der `/telemetry`-Antwort und telemetry.ts:567 als Label in `maze_build_info{mode="maze-alpha"}` fuer `/metrics`. index.ts liest den Modus dagegen korrekt aus `ARENA_MODE` und gibt ihn in `/health` (index.ts:797-798) und in der `welcome`-Nachricht (index.ts:645) heraus. 'maze-alpha' ist nicht einmal ein gueltiger Wert: `ARENA_MODE_IDS` ist ['maze','ffa','royale']. docs/GOAL.md:136-140 schreibt woertlich: "`mode: 'maze-alpha'` war ein hartkodiertes Etikett in `index.ts` und `telemetry.ts` ... heute ist `ARENA_MODE` der Schalter, und der Modus steht in `/health`, **in der Telemetrie** und im Etikett des Clients." Fuer die Telemetrie stimmt das nicht. Die mode-probe deckt es nicht ab - sie prueft laut GOAL.md:566 nur, dass "welcome und /health denselben Modus nennen".

**Szenario:** Sam betreibt Maze und Battle Royale so, wie GOAL.md:143-146 es vorsieht - als zwei Dienste. Beide Prozesse melden in Prometheus `maze_build_info{mode="maze-alpha"}` und in `/telemetry` `"mode": "maze-alpha"`. Die Klassenstatistik der beiden Arenen laesst sich weder auseinanderhalten noch nachtraeglich trennen. Genau das ist fatal: Im Royale gibt es kein Respawn, die Lebensdauer je Klasse und die Kills/Minute bedeuten dort etwas voellig anderes als im Maze. Wer die Zahlen liest, sieht einen Mittelwert aus zwei unvergleichbaren Spielen und haelt ihn fuer Balance-Daten.

**Vorschlag:** `SERVER_MODE` durch den tatsaechlichen Modus ersetzen - entweder ueber denselben `ARENA_MODE`-Zugriff wie index.ts oder als Parameter von `tuneTelemetry`. Danach die Zeile in docs/GOAL.md:138-140 pruefen statt sie stehenzulassen: Sie hat den Befund gedeckt, statt ihn zu verhindern - dieselbe Klasse wie die beiden am 12.08. gefundenen falschen Zusicherungen. Und die mode-probe um `/telemetry` erweitern, sonst faellt derselbe Fehler beim naechsten Mal wieder durch.


#### 66. Der Ladebalken der Faehigkeit springt beim Druecken auf 40 %, sobald man in Abklingzeit investiert hat

`apps/server/src/loadout-system.ts:147` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** loadout-system.ts:147 rechnet `moduleCharge = 1 - (readyAt - now) / ACTIVE_MODULE_DEFINITIONS[activeModule].cooldownMs` - also gegen die BASIS-Abklingzeit. Gesetzt wird `readyAt` in Zeile 233 aber mit dem Upgrade: `now + definition.cooldownMs * Math.pow(0.95, player.upgrades.moduleCooldown ?? 0)`. Der Nenner ist damit zu gross, und der Balken startet bei `1 - 0.95^n` statt bei 0. Nachgemessen gegen apps/server/dist mit Dash (10 s Basis): moduleCooldown 0 -> 0 % beim Druecken, 50 % zur Halbzeit (richtig). moduleCooldown 5 -> 23 % beim Druecken, 61 % zur Halbzeit. moduleCooldown 10 -> 40 % beim Druecken, 70 % zur Halbzeit, waehrend der Zahlentext daneben korrekt 6,0 s Restzeit nennt. Angezeigt wird der Wert auf dem Faehigkeits-Knopf als Fuellbreite (gameplay-ui.ts:204 -> gameplay-ui.css:45) und auf dem Handy als Ringsegment (mobile.css:218). `moduleCooldown` ist ein regulaerer, kaufbarer Upgrade-Platz (UPGRADE_IDS, zwoelfter Eintrag).

**Szenario:** Ein Spieler steckt zehn Punkte in die Abklingzeit seiner Faehigkeit - der teuerste einzelne Ausbau, den er kaufen kann. Er drueckt SPACE, und der Ladebalken auf dem Knopf springt im selben Moment auf 40 % und behauptet, die Faehigkeit sei schon zu zwei Fuenfteln zurueck. Direkt daneben steht "6,0S". Zwei Anzeigen auf demselben Knopf widersprechen sich, und ausgerechnet der Spieler, der in diese Anzeige investiert hat, bekommt die falsche.

**Vorschlag:** Denselben Nenner benutzen, mit dem `readyAt` gesetzt wurde. Am saubersten, indem die tatsaechlich gewaehlte Abklingzeit beim Aktivieren im `LoadoutState` mitgeschrieben wird (z. B. `lastCooldownMs`) und Zeile 147 daraus rechnet - dann kann die Formel nicht mehr auseinanderlaufen, wenn jemand die 0,95 in Zeile 233 anfasst.


#### 67. 40 von 55 schiessenden Klassen klingen identisch, weil der Ton an zwei handgepflegten Namenslisten haengt

`apps/client/src/audio.ts:5` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** audio.ts:4-5 fuehrt zwei feste Sets mit 8 bzw. 7 Klassennamen; `shot()` (audio.ts:50-56) waehlt daraus schwer (105 Hz Square + Rauschen), schnell (215 Hz, 0,04 s) oder faellt sonst auf 175 Hz Triangle zurueck. Ausgezaehlt gegen packages/shared/dist: 65 Klassen, davon 55 mit `barrelCount > 0`. Erkannt werden 8 schwere und 7 schnelle - die restlichen 40 bekommen denselben Standardton. Betroffen sind komplette Familien: alle sechs SIEGE-Klassen (siege, bombard, mortar, howitzer, trebuchet, ragnarok), alle sechs TEMPEST-, alle sechs AEGIS- und alle sechs SPECTER-Klassen sowie acht der neun IMPACT-Klassen. Drei davon sind sogar falsch einsortiert: vortex, vanguard und hailstorm liegen im RAPID-Zweig, stehen aber nicht in `RAPID_CLASSES` und klingen deshalb wie ein Core-Tank statt wie ihre Familie. Die Information, die fehlt, liegt griffbereit: `CLASS_DEFINITIONS[playerClass].branch`, dieselbe Quelle, aus der renderer.ts:955 und family-upgrades.ts:79 lesen.

**Szenario:** Ein Spieler farmt sich vom Core zum Ragnarok hoch - der Apex der SIEGE-Familie, der Klasse, die laut Nordstern durch Stillstehen zur Kanone wird. Sein Schuss klingt exakt so wie in Minute eins auf Level 1. Der gesamte Aufstieg, den das Spiel als seine Fortschrittsschleife verkauft, ist im Ohr nicht vorhanden. Und wer von Gatling (schneller heller Ton) auf Hailstorm wechselt - dieselbe Familie, dieselbe Feuerrate - hoert einen langsameren, dumpferen Schuss und schliesst daraus das Falsche ueber seine neue Klasse.

**Vorschlag:** Die beiden Sets durch `CLASS_DEFINITIONS[playerClass].branch` ersetzen und je Familie ein Klangprofil vergeben (acht Zweige plus core). Das ist derselbe Schnitt, den der Renderer und die Upgrade-Beschriftung schon fahren, und er kann nicht veralten, wenn der Klassenbaum weiter waechst - genau daran sind die Namenslisten hier gescheitert.


#### 68. Autofire wird bei jedem Tod stillschweigend abgeschaltet

`apps/client/src/input.ts:211` · spielgefuehl · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `resetAll()` (input.ts:208-213) setzt `this.autoFire = false` und meldet die Aenderung zurueck. Aufgerufen wird es in main.ts:495 bei jedem Uebergang von lebendig zu tot: `if (updatedSelf.dead && !wasDead) { if (input?.resetAll()) ui.setAutoFire(false); }`. Bemerkenswert ist der Kontrast im selben Modul: `resetTransient()` (input.ts:201-206) raeumt Tasten, Maustasten und Sticks - also fluechtigen Eingabezustand - und laesst `autoFire` bewusst stehen. Autofire ist dort als bleibende Einstellung behandelt; `resetAll` widerspricht dem ohne einen erklaerenden Kommentar, waehrend praktisch jede andere Entscheidung in dieser Datei einen traegt.

**Szenario:** Ein Spieler drueckt E, weil er nicht die ganze Runde die Maustaste halten will - das ist im Genre der Normalfall. Er stirbt, tippt RESPAWN und faehrt los. Sein Tank schiesst nicht. Der Grund steht klein im HUD ("AUTO OFF"), aber im Blick liegt die Arena. Bei einer Sterberate von mehreren Toden pro Runde bedeutet das: eine bewusst getroffene Einstellung, die der Spieler nach jedem Leben neu treffen muss, ohne dass ihm jemand sagt warum.

**Vorschlag:** `resetAll()` beim Tod nicht mehr aufrufen - main.ts:495 auf `resetTransient()` umstellen, genau wie es die Zeile darunter beim Respawn schon tut. `resetAll()` bleibt fuer den Verbindungsabbruch (main.ts:363) sinnvoll, wo wirklich alles auf Anfang geht. Falls Autofire nach dem Tod aus SOLL, gehoert die Begruendung als Kommentar an input.ts:208 - sonst ist beim naechsten Lesen wieder unklar, ob es Absicht ist.


#### 69. Das Verbindungslimit je IP greift bei IPv6 praktisch nie - die /64-Kuerzung trifft nur die Schreibweise, die Node gar nicht liefert

`apps/server/src/rate-limits.ts:206` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** rate-limits.ts:203-207 kuerzt eine IPv6-Adresse nur dann auf ihr /64-Praefix, wenn `groups.length > 4 && !address.includes('::')`. Node liefert `socket.remoteAddress` aber in der komprimierten Form, und die enthaelt fast immer `::`. Nachgemessen gegen apps/server/dist: `2a02:8109:abcd:1234::5` -> unveraendert, `2a02:8109:abcd:1234::9` -> unveraendert, also zwei verschiedene Buckets fuer zwei Adressen aus demselben /64. Nur die voll ausgeschriebene Form wird gekuerzt (`2001:0db8:85a3:0000:0000:8a2e:0370:7334` -> `2001:0db8:85a3:0000::/64`), und die traegt dann die fuehrenden Nullen mit, faellt also nochmals in einen anderen Bucket als dieselbe Adresse in Kurzform. Der Kommentar in Zeile 189-194 beschreibt genau die Absicht, die damit nirgends greift: "IPv6 wird auf das /64-Praefix gekuerzt - ein Anschluss bekommt ueblicherweise ein ganzes /64, sonst waere das Limit mit einer neuen Adresse je Verbindung wertlos." Das Limit selbst ist `RATE_LIMIT_CONNECTIONS_PER_IP`, Standard 5 (rate-limits.ts:262-263), gegen `maxPlayers` 80.

**Szenario:** Ein einzelner Rechner mit einer normalen IPv6-Zuteilung (ein /64, also 2^64 Adressen) oeffnet 80 Verbindungen von 80 verschiedenen Quelladressen. Jede bekommt ihren eigenen Zaehler, keine laeuft ins Limit von 5. Die Arena ist voll, echte Spieler bekommen "Zu viele Verbindungen" oder gar keinen Platz - und `abuse.rejectedConnections` in `/health` steht auf 0, das Portal sieht also einen gut besuchten Server statt eines Angriffs. Genau in dem Moment, in dem die dreizehnte Zeile des Nordsterns zu messen anfaengt, misst sie dann Muell.

**Vorschlag:** Die Adresse vor dem Kuerzen normalisieren, statt auf der Schreibweise zu arbeiten: `::` expandieren, jede Gruppe auf vier Stellen auffuellen, dann die ersten vier Gruppen nehmen. Ein Test mit den drei Schreibweisen derselben Adresse (kurz, lang, mit fuehrenden Nullen) haelt fest, dass alle drei in denselben Bucket fallen - der fehlende Test ist der Grund, warum die Regel nie gegriffen hat.


#### 77. Das Labyrinth ist einseitige Deckung: ein Schritt von 120 px löscht den Bot-Kontakt in 0,13 s, und der Bot kommt nie um die Ecke

`/home/user/project-maze/apps/server/src/bot-brain.ts:384` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** Zeile 384 verwirft jeden Kandidaten ohne `hasLineOfSight`, und zwar bei JEDER Entscheidung neu, nicht nur bei der Zielaufnahme. Es gibt keine letzte bekannte Position, keine Wegpunkte, keine Wegfindung: Die einzige Wandreaktion im ganzen Gehirn ist der Stuck-Detektor in Zeile 347-356 (90°-Umweg für 700 ms, wenn in 350 ms weniger als 7 px zurückgelegt wurden). GEMESSEN (Maze, Hunter-Bot bei 1640/600, Mensch 320 px entfernt mit freier Sicht): Zielaufnahme nach 0,38 s. Ein Schritt von 120 px um die Ecke, Abstand danach 414 px: Ziel fallengelassen nach 0,13 s, neues Ziel = eine Form. Danach 60 s frei laufen lassen – der Bot findet den ortsfesten Menschen nie wieder und steht am Ende 3602 px entfernt. Gegenprobe im selben Aufbau ohne Sichtlinie von Anfang an: nach 40 s ist der Bot 1891 px weit weg.

**Szenario:** docs/GOAL.md beschreibt Maze als den Modus mit „Wänden in Bahnen, Deckung, Ecken" – im Unterschied zu FFA. Für den Spieler stimmt das: eine Ecke schützt ihn zuverlässig. Für den Bot existiert sie nicht als Taktik, nur als Sichtsperre. Wer angeschlagen ist, tritt einen Schritt hinter eine Wand und ist sofort und vollständig aus dem Spiel genommen; wer angreifen will, tritt heraus und hat 0,38 s Vorsprung, bevor der Bot überhaupt zielt. Deckung ist damit kein Zug im Duell, sondern ein Ausschalter – und der Modus, nach dem das Spiel heißt, gibt dem Menschen ein Werkzeug und dem Gegner nichts.

**Vorschlag:** Ein Gedächtnis statt Wegfindung: Beim Sichtverlust die letzte bekannte Position speichern und das Ziel für die Dauer des huntTimeout (8 s) behalten, dabei auf diese Position zufahren; erst wenn sie erreicht ist und der Mensch nicht auftaucht, `escapedUntil` setzen. Das ist eine Erweiterung des bereits vorhandenen Jagd-Timeouts (Zeile 361-374), keine neue Schicht. Gegenprobe: die Eckenmessung oben – der Bot muss nach dem Schritt um die Ecke noch mindestens 3 s am Ziel bleiben und sich der letzten bekannten Position auf unter 200 px nähern.


#### 78. Jeder Bot kämpft auf 430 px – auch mit einer Waffe, die 4446 px weit reicht

`/home/user/project-maze/apps/server/src/game.ts:168` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** `preferredDistance` (game.ts:168) hängt am Stil, nicht an der Klasse: kiter 620, brawler 80, controller 390, alle übrigen 430. Der Feuerdeckel (bot-brain.ts:535) ist `min(900 bzw. kiter 1150, Reichweite × 0,92 + 60)`. Mit `tunedStatsFor` auf Level 40 ohne Upgrades ausgerechnet: der Hunter-Pfad sniper > ballista > siegebreaker > eclipse hat 2400 / 2646 / 3456 / 4446 px Kugelreichweite – der Bot fährt trotzdem auf 430 px heran, das sind 18 / 16 / 12 / 10 % seiner Reichweite, und er feuert nie über 900 px. Der Farmer-Pfad rapid > repeater > gatling > vortex hat 1138–1218 px und denselben Wunschabstand 430. Der Kiter mit deadeye/eclipse (2835 / 4446 px) hält 620 px, also 22 bzw. 14 %.

**Szenario:** Ein Spieler stellt sich gegen einen Eclipse – den Familien-Apex der Präzisionslinie, eine Waffe mit über vier Bildschirmbreiten Reichweite. Statt ihn aus der Distanz zu zwingen, fährt der Bot auf Schrotflintenabstand heran und feuert dort mit einer Nachladezeit von rund einer Sekunde. Ein Gatling-Bot tut auf demselben Abstand dasselbe. Für den Spieler bedeutet das: Reichweite ist keine Eigenschaft, die er beim Gegner respektieren muss, jede Begegnung findet auf derselben Distanz statt, und 65 Klassen fühlen sich beim Bekämpfen wie fünf an.

**Vorschlag:** `preferredDistance` aus den Klassenwerten ableiten statt aus dem Stil – z. B. ein Anteil der tatsächlichen Reichweite (`projectileSpeed × projectileLife`), nach unten gedeckelt durch den Stil (brawler bleibt bei 80). Der Feuerdeckel 900 wird dann zum Engpass und muss mitwachsen; die Zielsuchweite 1050 (bot-brain.ts:384) ebenfalls. Gegenprobe: Tabelle Wunschabstand gegen Reichweite über alle Bot-Klassenpfade – kein Eintrag unter 25 % und keiner über 75 %.


#### 79. Die Farmer-Bots tragen das einzige Heilmittel der Arena und können es nicht auslösen – sie kämpfen dauerhaft angeschlagen

`/home/user/project-maze/apps/server/src/signature-rapid.ts:204` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** BOT_LOADOUTS.farmer trägt `repair` (bot-brain.ts:50), die Aktivierung verlangt HP < 68 % und Gegner weiter als 650 px (bot-brain.ts:442), und die Reparatur selbst verlangt Stillstand: `Math.hypot(velocity) > REPAIR_MOVE_LIMIT` (40) lehnt sie ab (loadout-system.ts:226 und 443). Die Bot-Steuerung setzt dafür `player.move = {0,0}` (bot-brain.ts:465). Genau das nimmt `tuneRapidBots` wieder zurück: Zeile 200-206 setzt für jede Rapid-Klasse `move` zurück auf die Fahrtrichtung, sobald die Bewegungsabsicht unter 0.2 fällt – die Schicht läuft in Produktion (Opt-out, index.ts). Vier der fünf Farmer-Klassenpfade sind Rapid-Klassen. GEMESSEN (18 Bots, Maze, 4 min): Rapid-Farmer sind in 2,92 % der Ticks langsam genug für eine Reparatur und verbringen 35,4 % ihrer Zeit unter 68 % HP. Dieselbe Messung mit abgeschalteter Schicht: 10,17 % bzw. 16,5 % – die Zeit im angeschlagenen Zustand verdoppelt sich.

**Szenario:** Der Kommentar in signature-rapid.ts:184-186 sagt ausdrücklich, die Reparatur breche dadurch nicht ab, weil weiterhin nicht gefeuert werde. Sie bricht auch nicht ab – sie fängt gar nicht erst an. Für den Spieler heißt das: Die zahlenmäßig größte Bot-Gruppe der Arena läuft dauerhaft mit rund zwei Dritteln Leben herum und stirbt entsprechend schnell. Das ist kein sichtbarer Fehler, sondern ein stiller Rabatt auf die Gegnerstärke – und es erklärt einen Teil davon, warum sich Bots wie Zielscheiben anfühlen.

**Vorschlag:** In `tuneRapidBots` den gewollten Stillstand von der versehentlichen Bewegungslosigkeit unterscheiden: Die Schicht darf `move` nur dann überschreiben, wenn der Bot gerade keine Reparatur anstrebt. Am einfachsten über den Zustand, den `think` ohnehin führt (`brain.holdUntil`), oder indem `tuneBotBrain` beim Repair-Halt eine Markierung setzt, die die äußere Schicht respektiert. Gegenprobe: die Messung oben – Anteil der Ticks unter REPAIR_MOVE_LIMIT muss für Rapid-Farmer über 8 % steigen und die Zeit unter 68 % HP unter 20 % fallen.


### Schwere: niedrig (8)


#### 23. Das Link-Vorschaubild verspricht 29 Tankklassen, das Spiel hat 65

`apps/client/index.html:8` · inhalt · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `<meta name="description" content="MAZERS: Farmen, leveln, 29 Tankklassen, ...">` (Zeile 8) und `<meta property="og:description" ... 29 Tankklassen ...>` (Zeile 16). Tatsaechlich: `PLAYER_CLASS_IDS.length === 65` (nachgezaehlt gegen `packages/shared/dist`), GOAL.md nennt "65 Klassen in 8 Familien" als erste Zeile unter "Was schon steht". Der Startscreen selbst rechnet es richtig aus: `start-nav.ts:39` bildet den Hinweis aus `PLAYER_CLASS_IDS.length` und zeigt gemessen "Alle 65 Klassen und ihre Signature". Nur die beiden Meta-Zeilen stehen als feste Zahl da -- dieselbe Fehlerklasse, die GOAL.md schon zweimal beschreibt (Achievement "Ausgereizt" mit Level 45, Familiensperre mit Level 10).

**Szenario:** Jemand teilt den Link in einem Chat. Die Vorschaukarte sagt "29 Tankklassen". Wer das Genre kennt, vergleicht mit Diep.io (rund 40) und liest: kleiner als das Original. Genau das Merkmal, das MAZERS von der Konkurrenz abhebt -- 65 Klassen in acht Familien --, wird auf der einzigen Flaeche, die ein Fremder vor dem ersten Klick sieht, um mehr als die Haelfte untertrieben.

**Vorschlag:** Die Zahl aus den Daten erzeugen statt sie zu tippen: Die Meta-Tags beim Build aus `PLAYER_CLASS_IDS.length` fuellen (Vite-Plugin oder eine `%KLASSEN%`-Ersetzung), so wie `start-nav.ts` es zur Laufzeit schon macht. Dann kann die naechste Familie die Zahl nicht wieder stehen lassen.


#### 24. In den ersten zwoelf Sekunden feuert derselbe Level-up-Toast sechsmal mit demselben Satz

`apps/client/src/main.ts:492` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `ui.toast('Level ' + updatedSelf.level, 'Du hast einen neuen Upgrade-Punkt erhalten.', 'success')` bei jedem Levelaufstieg bis Level 60, Text immer identisch. Standzeit je Toast 2.600 ms (ui.ts:668). Die Kurve macht daraus einen Stapel: `xpThresholdForLevel` liefert 73/180/323/507/733/1006 (index.ts:836), `XP_MULTIPLIER = 5` macht aus einem Wuerfel 90 XP -- Level 2 kostet also einen Wuerfel. Gemessen gegen den echten Server: Level 2 nach 0,3 s, 3 nach 2,6 s, 4 nach 8,6 s, 5 nach 10,2 s, 6 nach 11,4 s, 7 nach 12,3 s -- sechs Toasts in 12,3 Sekunden, drei davon (Level 5, 6, 7) innerhalb von 2,1 Sekunden und damit gleichzeitig auf dem Schirm. In denselben Moment faellt die automatisch aufklappende Klassenwahl (Level 5) und die Onboarding-Karte.

**Szenario:** Der Fremde hat gerade gelernt, wo WASD liegt. In den naechsten zehn Sekunden erscheinen sechsmal hintereinander dieselben zwei Zeilen, teils uebereinander gestapelt, waehrend links unten die Klassenwahl aufgeht und oben die Hinweiskarte steht. Der einzige Aufstieg, der wirklich etwas bedeutet -- Level 5, ab dem es Klassen gibt --, sieht dabei genauso aus wie Level 6 und Level 7 und geht in der Reihe unter.

**Vorschlag:** Den Toast nur fuer die Level ausloesen, an denen sich wirklich etwas oeffnet (5, 15, 28, 42 -- die `unlockLevel`-Stufen aus `CLASS_DEFINITIONS`) und dort auch sagen, was: "Level 5 - acht neue Klassen stehen offen". Fuer alle uebrigen reicht das Punkte-Badge, das ohnehin blinkt (`#points-badge`). Alternativ die Toasts im selben Sekundenfenster zusammenfassen ("Level 7 - 3 Punkte offen").


#### 34. Das Upgrade-Panel zeigt 120 Pips, von denen 61 nie gefuellt werden koennen

`packages/shared/src/index.ts:838` · spielgefuehl · Aufwand mittel

**Beweis (Behauptung des Suchers, ungeprüft):** UPGRADE_IDS hat 12 Eintraege (shared/index.ts:63 ff.), GAME.maxUpgradeLevel ist 10 – das Panel rendert 12 x 10 = 120 Pips (apps/client/src/ui.ts:271). Punkte gibt es upgradePointsAtLevel(60) = 59, also fuellt der theoretisch bestmoegliche Lauf 49 % des Panels; 61 Pips bleiben unter allen Umstaenden grau. Voll werden hoechstens fuenf Slots (sechs volle Slots braeuchten Level 61). Fuer die zehn Drohnenklassen sind es 9 wirksame Slots (90 Pips, 66 % fuellbar), fuer core 10. Realistisch ist es weit weniger: Der Durchschnittslauf der 10-Minuten-Messung endete auf Level 31,8, also 30 Punkte = 25 % der Pips.

**Szenario:** Der Spieler oeffnet das Panel, das laut seinem eigenen Kommentar die einzige Darstellung dessen ist, 'was habe ich eigentlich gebaut'. Er sieht zwoelf Reihen mit je zehn Kaestchen, in denen nach einer typischen Runde drei Reihen halb voll sind und der Rest leer. Das Panel verspricht viermal so viel Aufbau, wie das Spiel in einem Leben hergibt – der dominante Eindruck des eigenen Fortschritts ist Leere, obwohl der Spieler jeden verfuegbaren Punkt ausgegeben hat.

**Vorschlag:** Die Skala an das anpassen, was erreichbar ist: maxUpgradeLevel auf 5 (12 x 5 = 60 Pips gegen 59 Punkte) – dann ist ein voll ausgebauter Tank auch optisch voll ausgebaut. Die Stufenwerte muessten dabei verdoppelt werden (Damage 14 % statt 7 % je Punkt), damit sich am Endzustand nichts aendert. Wer die zehn Stufen behalten will, sollte im Panel wenigstens anzeigen, wieviele Punkte ein Lauf ueberhaupt noch bringen kann.


#### 45. Die Oberflaeche wechselt mitten im Satz die Sprache – teils im selben Element

`apps/client/src/gameplay-ui.ts:201` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** Ein und dasselbe Feld wechselt die Sprache je nach Zustand: gameplay-ui.ts:201 setzt an den Faehigkeiten-Knopf nacheinander `'NACH RESPAWN'`, `'ACTIVE'`, `'READY'` und `'2.4S'`. Weitere Stellen im Spielerpfad: ui.ts:266 und ui.ts:751 ueberschreiben die Bestenliste im HUD mit „TOP PLAYERS", waehrend dieselbe Liste auf dem Startscreen „Bestenliste" heisst (start-nav.ts:42); ui.ts:297 „RUN BEENDET" ueber „ELIMINIERT" (ui.ts:306); ui.ts:652 Toast „Run beendet". Inhaltlich am teuersten ist die Doppelbenennung der Sammelobjekte: Onboarding und Begruessungs-Toast nennen sie „Formen" (onboarding.ts, Schritt `farm`: „Zerlege die Formen – sie geben XP."; main.ts:411: „Farme Formen und entwickle deinen Tank."), das Event-Banner nennt dieselben Dinger „Shapes" (gameplay-ui.ts:25: „mehr Shapes und Elites im Zentrum").

**Szenario:** Ein Spieler lernt in den ersten 60 Sekunden vom Onboarding das Wort „Formen". Wenige Minuten spaeter blinkt oben CORE SURGE mit „mehr Shapes und Elites im Zentrum" – er muss kurz uebersetzen, ob damit dasselbe gemeint ist. Waehrenddessen zaehlt sein Faehigkeiten-Knopf abwechselnd auf Deutsch und Englisch herunter. Nichts davon ist kaputt; zusammen liest es sich wie eine Oberflaeche, die nie jemand am Stueck durchgegangen ist.

**Vorschlag:** Eine Sprachentscheidung durchziehen: Genrewoerter (SCORE, KILLS, BOSS) duerfen englisch bleiben, Zustandsanzeigen nicht – `READY`/`ACTIVE` zu BEREIT/AKTIV, „TOP PLAYERS" zu „BESTENLISTE", „Shapes und Elites" zu „Formen und Eliten".


#### 46. Sechs der achtzehn Bots heissen wie ein anderer Bot

`apps/server/src/game.ts:93` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `BOT_NAMES` (game.ts:93) hat 12 Eintraege: Vektor, Nyx, Orbit, Kairo, Mako, Echo, Rift, Nova, Flux, Onyx, Astra, Mira. Die Standardbesetzung ist 18 (index.ts:113: `integerEnvironment('BOT_COUNT', 18, 0, 40)`, arena-director.ts:56: `baseBots: 18`), und beide Namensvergaben rechnen modulo: game.ts:204 und arena-director.ts:193 `BOT_NAMES[index % BOT_NAMES.length]`. Ausgerechnet fuer 18 Bots: Vektor, Nyx, Orbit, Kairo, Mako und Echo kommen je zweimal vor. Der Direktor zaehlt `spawnIndex` ueber die Laufzeit weiter hoch, die Wiederholungen setzen sich also fort. Sichtbar sind die Namen in der HUD-Bestenliste (game.ts:297, Top 8), im Killfeed (game.ts:298) und ueber jedem Tank (renderer.ts:963).

**Szenario:** Ein Spieler schaut auf die Bestenliste und sieht zweimal „Nyx · BOT" auf verschiedenen Plaetzen. Im Killfeed steht „Echo eliminierte Echo". Er kann nicht sagen, welcher Nyx ihn gerade verfolgt hat und welcher gestorben ist. Die Arena wirkt dadurch weniger bevoelkert, nicht mehr – zwoelf Namen fuer achtzehn Gegner.

**Vorschlag:** Die Namensliste auf mindestens 40 erweitern (der Deckel von `BOT_COUNT`) – reine Datenarbeit in game.ts:93. Alternativ bei Wiederholung ein Suffix vergeben, aber ein zweiter Vorrat an Namen liest sich besser als „Nyx 2".


#### 47. Die PWA-Icons liegen im Deploy, aber es gibt kein Manifest – „Zum Startbildschirm" ergibt eine namenlose Verknuepfung

`apps/client/index.html:10` · qualitaet · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `apps/client/public/` enthaelt `icon-192.png` und `icon-512.png` – exakt die beiden von der Web-App-Manifest-Spezifikation verlangten Groessen. Auf beide verweist nichts: `grep -rn 'manifest|icon-192|icon-512' apps/client --include=*.html --include=*.ts --include=*.conf --include=*.json` liefert null Treffer. index.html:10–13 verlinkt nur favicon.ico, favicon-16, favicon-32 und apple-touch-icon; ein `<link rel="manifest">` fehlt, und eine manifest.json existiert im Repo nicht (`git ls-files` fuehrt sie nicht). Die passende `theme-color` steht bereits in index.html:6 und wird von themes.ts:53 sogar dynamisch gepflegt – die halbe Arbeit ist also getan.

**Szenario:** Ein Spieler, dem das Spiel auf dem Handy gefaellt, waehlt in Chrome „Zur Startseite hinzufuegen" – die uebliche Geste, wenn man wiederkommen will. Statt eines Icons mit dem Namen MAZERS bekommt er eine Browser-Verknuepfung mit generischem Bild, die beim Oeffnen mit voller Adressleiste startet und die ohnehin knappe Hoehe im Querformat weiter frisst. Genau der Weg, auf dem ein Fremder ein zweites Mal kommt (GOAL.md, dreizehnte Zeile), fuehrt ins Unfertige – obwohl die Bilddateien in jedem Deploy mitgeliefert werden.

**Vorschlag:** Eine `public/manifest.webmanifest` mit name/short_name „MAZERS", `display: standalone`, `orientation: landscape`, den beiden vorhandenen Icons und `background_color`/`theme_color` `#070910` anlegen und in index.html verlinken. Ohne die Datei sind die beiden Icons totes Gewicht im Auslieferungspfad.


#### 60. Der Client kann nicht wissen, ob der Server Achievements ueberhaupt vergibt – die Navigation verspricht sieben Erfolge, die auf einem Standard-Server nie fallen koennen

`apps/server/src/index.ts:170` · verstaendlichkeit · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** `const ACHIEVEMENTS_ENABLED = process.env.ACHIEVEMENTS_ENABLED === 'true'` (index.ts:170) – ohne den Schalter wird die Schicht gar nicht angehaengt (achievements.ts:181-182) und `attachAchievementSnapshots` bleibt aus (index.ts:517). Standard ist aus: .env.example:52 `ACHIEVEMENTS_ENABLED=false`, docs/DEPLOYMENT.md:70 Standard `false`. Am eigenen Server nachgeprueft: `/health` meldet `"features":{"achievements":false,...}`. Der Client erfaehrt davon nichts – die `welcome`-Nachricht traegt nur `selfId` und `mode` (packages/shared/src/index.ts:778), und main.ts liest `/health` nirgends. Die Navigation zeigt trotzdem "Achievements / Alles, was es zu holen gibt" (start-nav.ts:41) und die Galerie sieben Kacheln mit Bedingungen (profile-panel.ts:186-223).

**Szenario:** Jemand startet das Spiel per docker-compose oder mit der Beispiel-Umgebung. Er sieht in der Navigation "Achievements – Alles, was es zu holen gibt", oeffnet die Seite, liest sieben Bedingungen und spielt gezielt darauf hin. Es faellt nie eines, weil der Server die Schicht gar nicht angehaengt hat, und nichts auf der Seite sagt ihm das. Er haelt das Spiel fuer kaputt oder sich fuer zu schlecht – beides falsch.

**Vorschlag:** `achievements: boolean` in die `welcome`-Nachricht aufnehmen (das Feld `mode` liegt dort schon) und die Galerie bei `false` mit einem Satz versehen, wie es die Bestenliste bei fehlender Persistenz schon tut ("Die Bestenliste ist auf diesem Server noch nicht eingerichtet.", ui.ts:212). Ein Versprechen, das der Server nicht einloesen kann, gehoert nicht auf den Startscreen.


#### 70. Leertaste auf einem fokussierten Knopf loest ihn nicht mehr aus - der Faehigkeits-Hotkey schluckt sie ueberall

`apps/client/src/gameplay-ui.ts:145` · bug · Aufwand klein

**Beweis (Behauptung des Suchers, ungeprüft):** gameplay-ui.ts:142-147 haengt einen `keydown`-Handler ans `window`, der bei Space/ShiftLeft/ShiftRight `event.preventDefault()` ruft - und zwar VOR jeder Pruefung, ob die Faehigkeit ueberhaupt ausloest (`activate()` in Zeile 240 steigt bei `!this.connected`, `self.dead` oder deaktiviertem Knopf aus, da ist das Default-Verhalten aber schon unterdrueckt). Der Schutzfilter `editableTarget` (gameplay-ui.ts:19-22) deckt `input, textarea, select, [contenteditable]` ab - `<button>` steht nicht darin. Ein `<button>` wird per Spezifikation von der Leertaste beim keyup aktiviert; ein `preventDefault()` auf dem keydown verhindert genau das. Der Handler wird beim Modulladen registriert (main.ts:133), gilt also ab dem ersten Bild des Startscreens. Betroffen sind unter anderem `#respawn-button` (ui.ts:324), `#exit-to-start` (ui.ts:326), der Join-Knopf und `#fullscreen-toggle`.

**Szenario:** Jemand bedient die Seite mit der Tastatur: Er tippt seinen Namen, tabbt weiter auf ARENA BETRETEN und drueckt Leertaste - nichts passiert, ohne jede Rueckmeldung. Dasselbe im Spiel: Er stirbt, tabbt auf RESPAWN, Leertaste - nichts. Der Knopf sieht fokussiert aus und tut nichts, was von aussen wie ein defekter Knopf aussieht und nicht wie eine belegte Taste.

**Vorschlag:** `preventDefault()` erst rufen, wenn `activate()` tatsaechlich zugeschlagen hat (der Rueckgabewert sagt es bereits), und `button, [role="button"], a[href]` in `editableTarget` aufnehmen. Dann bleibt Space der Faehigkeits-Hotkey im Gefecht und die Knoepfe behalten ihr normales Verhalten.


## Die acht Urteile, die noch fertig wurden

Die Gegenprüfung lief zum Sitzungsende erst acht Befunde weit. Die Urteile
stehen hier ohne Zuordnung zum Befund – die Zuordnung ging mit dem Container
verloren –, aber ihre Begründungen sind als Muster brauchbar: Sie zeigen, wie
genau nachgemessen werden muss.


**Urteil 1** – haltbar: `True`, Sicherheit: `sicher`

**1. STIMMT DIE ZEILE? — Ja, alle acht Fundstellen sind korrekt.**

- `apps/client/src/main.ts:507-537` — `playSnapshotAudio` kennt genau die drei behaupteten Ereignisse am eigenen Tank (Schadenseinschlag 519-522, Kill 523-526, Tod 527-530), dazu Level (531) und Schuss (537). Ein „ich habe getroffen" existiert nicht.
- `apps/client/src/audio.ts` — acht öffentliche Ereignis-Methoden (`shot`, `module`, `damage`, `kill`, `death`, `level`, `eventHorn`, `bounty`). Kein Treffer-Ton. Aufrufstellen im Client: `main.ts` 484, 520, 524, 528, 531, 537, 542, 546 = 8. Zahl stimmt exakt.
- `renderer.ts:462` setzt `flashUntil=now+130`, `renderer.ts:600` blendet mit `.62*((flashUntil-now)/130)` aus, die Scheibe wird in `renderer.ts:926` als `flash.circle(0,0,26)` angelegt. r=26, Alpha 0.62, 130 ms — alle drei Zahlen korrekt.
- `renderer.ts:464` — Zahl `0xffe9b0`, Größe 12 für Fremde (14 und `0xff8091` für einen selbst). Lebensdauer 0,75 s, Steiggeschwindigkeit −46 px/s (`FloatingNumbers`, renderer.ts:93-107). Korrekt.
- `renderer.ts:468` — Partikel-Burst nur beim Tod (24 Stück). Korrekt.
- `renderer.ts:545` — Formen bekommen 3 Partikel je Schadensereignis. Korrekt.
- `renderer.ts:512` — Projektile werden ersatzlos aus der Map gelöscht, kein Einschlagseffekt. Korrekt.
- `renderer.ts:1044-1051` — `drawCrosshair` wechselt r=10→12 nur bei `primary||secondary`, nie bei einem Treffer. Korrekt.
- `renderer.shake` hat im ganzen Client exakt vier Aufrufer: `renderer.ts:403` (Wand-Ereignis) und `main.t

*Korrektur:* **Titel — falsch, ersetzen.** „Ein Kanal gegen drei" stimmt in beiden Zahlen nicht (Gegner: Flash + Zahl + Lebensbalken = 3 sichtbare Kanäle; man selbst: dieselben 3 plus HUD-Balken plus Ton plus Shake). Besser: **„Beim Austeilen von Schaden schweigt der Client — Ton und Erschütterung kennen nur den eigenen Tank"**. Das ist die Aussage, die dem Code standhält.

**Schwere — „hoch" ist nicht haltbar, auf „niedrig" korrigieren.** Die einzige Begründung für „hoch" war „der Spieler kann nicht sagen, ob er trifft"; das ist widerlegt (Flash-Deckungsgrad 95,9 % bei Gatling, 21 % beim Lancer mit „−82"-


**Urteil 2** – haltbar: `False`, Sicherheit: `sicher`

1. ZEILE: Der Code existiert, die Zeilennummern stimmen nicht. Der Schadens-Ruck steht in apps/client/src/main.ts:521, der Kill-Ruck in :525 — nicht 512/516 (Versatz 9). Inhaltlich korrekt zitiert: `renderer.shake(Math.min(6, 1.5 + healthDrop * 0.12))` bzw. `renderer.shake(3)`. renderer.ts:647 nimmt tatsaechlich das Maximum (`Math.min(9,Math.max(this.shakeAmplitude,strength))`). packages/shared/src/index.ts:252 hat sniper damage 38, und 1,5+38*0,12 = 6,06 -> gedeckelt auf 6. Die Arithmetik des Einzelfalls stimmt.

2. TITEL WIDERLEGT (der schwerste Punkt). "Getroffen werden erschuettert doppelt so stark" gilt nur fuer den Deckelfall. Ich habe den Ruck fuer alle 65 Klassen aus packages/shared/dist gerechnet: nur 11 von 65 Klassen erreichen ueberhaupt den 6er-Deckel (Schaden >= 37,5). 25 von 65 Klassen erzeugen einen Ruck SCHWAECHER als die 3 des Kills (z. B. rapid 10,5 -> 2,76; gatling 4,3 -> 2,02). Der Median-Schaden ist 15 -> Ruck 3,30, also 1,1x statt 2x. Die Startklasse core (Level 1, 16 Schaden) liegt bei 3,42 gegen 3,00 — ausgerechnet im ersten Eindruck ist das Verhaeltnis praktisch 1:1. Selbst mit voll ausgebautem Schadens-Upgrade (game.ts:185, x1,9 bei 10 Punkten) erreichen nur 20 von 65 Klassen den Deckel, 7 bleiben unter dem Kill-Ruck. Das Verhaeltnis 2:1 ist der Ausreisser, nicht die Regel.

3. SZENARIO RECHNERISCH FALSCH. Der Befund laesst den Deadeye "jeden Treffer um +-6 px" rucken. Deadeye macht 34 Schaden -> 1,5+4,08 = 5,58, nicht 6. Der Befund rechnet mit der S

*Korrektur:* Der Befund als Ganzes faellt: Titel ("doppelt so stark") gilt fuer 11 von 65 Klassen, wird fuer 25 von 65 sogar umgekehrt; die Tonhaelfte ist bei gehoerrichtiger Messung und auf normalen Lautsprechern invertiert; Zeilennummern (512/516 statt 521/525) und die Deadeye-Zahl (5,58 statt 6) stimmen nicht. Schwere "hoch" ist damit nicht zu halten.

Ein kleiner, belegbarer Rest bleibt — aber das ist ein anderer Befund, nicht dieser:
Titel: "Der Kill-Ruck ist der einzige Reiz, der nie mitwaechst". Beleg: main.ts:525 setzt fest `shake(3)` — unabhaengig von Streak, Opferlevel oder Score. Alle anderen Ka


**Urteil 3** – haltbar: `True`, Sicherheit: `sicher`

1. STIMMT DIE ZEILE? Ja, im Kern — mit falschen Nebenzeilen.
renderer.ts:495-501 sagt exakt das Behauptete: nur wenn ein Projektil NEU im Snapshot auftaucht, laufen `particles.muzzle` (500) und `fireRecoil` (501). `fireRecoil` steht bei 629 und ruft `startRecoil` (recoil.ts:26). `prediction.ts:410-417` liefert wirklich nur position/velocity/signature — kein Feuern. Falsch sind die main.ts-Zeilen: der Ton-Vergleich steht bei 533-538 (nicht 524-528), das Eingabe-Intervall bei 550-557 (nicht 548), `prediction.record` bei 556 (nicht 547). Arbeitsbaum ist sauber (`git status` leer), die Zeilen sind also schlicht um ~9 daneben. Inhaltlich stimmt jede dieser drei Behauptungen.

2. FÄNGT ES JEMAND AB? Teilweise — und das fehlt im Befund.
`grep` über alle Client-Quellen: `startRecoil` wird ausschließlich von `fireRecoil` gerufen, `fireRecoil` ausschließlich von syncProjectiles, `audio.shot` ausschließlich von main.ts:537. Es gibt keinen zweiten Pfad. ABER: renderer.ts:1046 vergrößert das Fadenkreuz bei gedrückter Feuertaste von Radius 10 auf 12, gespeist aus `input.isPrimary` über `renderer.setInput` im Ticker (main.ts:246-253) — also lokal, ohne Server. Das ist eine echte Sofortreaktion auf den Klick. Sie ist aber ~2 Welteinheiten ≈ 2,4 px auf 1080p, bleibt beim Halten konstant und pulst nicht je Schuss. Sie schließt die Lücke nicht, aber „gar nichts passiert" ist falsch und gehört in den Befund.

3. IST ES ABSICHT? Nein — und das Haus hat die Gegenentscheidung schon getroffen.
Weder

*Korrektur:* TITEL (leicht geschärft): „Der Schuss meldet sich erst nach der Serverantwort — an der Druckflanke Ø 110 ms bei 60 ms Ping"

SCHWERE: hoch → **mittel**. Begründung: (a) Diep.io/Arras.io sagen das Feuern ebenfalls nicht voraus — es ist keine Abweichung vom Maßstab, den der Nordstern nennt, sondern fehlender Feinschliff darüber. (b) Es fehlt kein Feature: Blitz, Feder und Ton lösen je Schuss korrekt aus, nur verspätet. (c) Im Dauerfeuer — dem Normalfall auf dem Handy (input.ts:186) und mit AUTO — ist es ein konstanter Versatz von Ø 55 ms, keine Klick-Latenz. Gerechtfertigt bleibt „mittel" wegen 


**Urteil 4** – haltbar: `True`, Sicherheit: `sicher`

Ich bin mit "haltbar: false" gestartet und habe den Befund nicht widerlegen koennen — im Gegenteil, der Code ist haerter als die Behauptung.

1. STIMMT DIE ZEILE? Ueberwiegend ja, zwei Zitate sind falsch.
- /home/user/project-maze/apps/client/src/renderer.ts:551 stimmt woertlich: `if(reward>0)this.numbers.spawn(previous.position,`+${elite?reward+260:reward}`,0xf3c45f,elite?15:12)`. renderer.ts:70 `SHAPE_REWARDS={square:18,triangle:45,pentagon:120}` — und das sind exakt die Server-Belohnungen aus apps/server/src/world.ts:6-8. Die goldene Zahl IST also die echte XP.
- renderer.ts:464 (Schadenszahl) und 468-469 (24 Partikel, Ring maxRadius 86 / width 4 / life .5) stimmen. `numbers.spawn` hat im GESAMTEN Client genau zwei Aufrufstellen: 464 und 551. Die Kernbehauptung "die einzigen zwei Fliesszahlen" ist damit belegt, nicht behauptet.
- ui.ts:772-795 renderKillfeed: keine 'self'-Klasse — stimmt. ui.ts:756 setzt `leader-row ${entry.id===snapshot.selfId?'self':''}` — stimmt (Befund sagt 754, das ist das forEach zwei Zeilen darueber).
- hud-layout.css:227-230 stimmt woertlich.
- FALSCH: apps/server/src/game.ts:572 ist `if (target.dead || target.invulnerable) return;`. Die Kill-XP steht in game.ts:604: `this.awardXp(attacker, 130 + target.level * 18)`.
- FALSCH: apps/client/src/main.ts:514 ist `let previousBountyId`. Der Snapshot-Vergleich steht in main.ts:523-526.
Beide Fehlzitate zeigen auf die richtige Datei, der Mechanismus liegt wenige Zeilen daneben. Kein Zitat auf Code, den es

*Korrektur:* TITEL — praeziser, weil der Code mehr hergibt:
"Ein Spieler-Kill hinterlaesst weniger auf dem Schirm als ein Quadrat, das jemand anders abschiesst"
(renderer.ts:546-551 prueft keine Urheberschaft: die goldene Zahl erscheint auch fuer fremde Formen-Abschuesse. Der eigene Kill bekommt nichts.)

SCHWERE — "hoch" bleibt, und ist eher noch zu niedrig als zu hoch.
Begruendung: Es trifft den Belohnungsmoment der Kernschleife, nicht eine Randansicht; es ist im eigenen Masterplan (MASTERPLAN_V2 Teil 1 §4 und Teil 2 §D.3) als Defekt benannt und als Aufgabe beschlossen worden; und die interne Rangfolge d


**Urteil 5** – haltbar: `True`, Sicherheit: `wahrscheinlich`

Ich bin mit "haltbar: false" gestartet und habe den Kern nicht kippen koennen -- wohl aber die Haelfte der Beweisfuehrung.

**1. STIMMEN DIE ZEILEN? Ja, alle sieben.**
- `apps/client/src/gameplay-effects.ts:133` -- `const richtung = Math.atan2(zone.center.y - self.position.y, ...)`, davor der Kommentar Z.122-132 woertlich: "wer in die falsche Richtung laeuft, stirbt schneller, als wenn er stehen bliebe". Der Zonenpfeil-Praezedenzfall existiert genau so.
- `apps/client/src/audio.ts:65-68` -- `damage()` = `tone(78, 0.12, ..., 'sawtooth')` + `noise(0.08, 0.02, 420)`. Kein `StereoPannerNode` in der ganzen Datei; `tone`/`noise` haengen direkt an `master` (Z.107, Z.126). Richtungslos.
- `apps/client/src/renderer.ts:609-610` -- `shakeX=(Math.random()-.5)*2*amp`, `shakeY` identisch. Zufall in beiden Achsen.
- `renderer.ts:462` (`view.flashUntil=now+130`) und `:464` (`numbers.spawn({x:view.current.x, y:view.current.y-26}, '-'+amount, ...)`) -- beides auf/ueber dem eigenen Tank, zentriert. (Kleine Ungenauigkeit: der Flash gilt fuer *jeden* getroffenen Spieler, nicht nur den eigenen -- aendert nichts.)
- `apps/client/src/ui.ts:619` -- `this.vignette.classList.toggle('active', !self.dead && healthRatio < 0.35)`. CSS `style.css:56`: `radial-gradient(ellipse at center, transparent 52%, ...)` -- gleichmaessig rundum, plus 1,6-s-Dauerpuls. Zustand, kein Ereignis. Bestaetigt.
- `ENTITY_CULL_HALF` steht in **packages/shared/src/index.ts:828-831** (nicht `apps/server/src/index.ts` -- der Befund

*Korrektur:* **Titel** (die zweite Haelfte ist falsch begruendet):
"Ein Treffer sagt nicht, woher -- und das gelieferte Rechteck ist schmaler als die Distanz, aus der geschossen wird"

**Schwere: hoch -> mittel.** Begruendung fuer die Absenkung: (a) Der Massstab des Nordsterns (Diep.io/Arras.io) hat selbst keinen Trefferrichtungsanzeiger -- das ist keine Genre-Luecke, sondern eine Verbesserung darueber hinaus. (b) Ein partielles Richtungssignal existiert: das eingehende Projektil ist 0,51-1,44 s vor dem Treffer im Bild (nachgerechnet, s. o.). (c) Nichts ist kaputt, keine Regel wird verletzt, keine Probe fa


**Urteil 6** – haltbar: `True`, Sicherheit: `wahrscheinlich`

Ich bin mit "haltbar: false" gestartet und habe den Kern nicht umgebracht — aber Titel, Schwere und die halbe Beweisführung schon.

1. STIMMT DIE ZEILE? Ja, wörtlich. apps/client/src/renderer.ts:957 lautet `const ratio=view.isSelf&&signatureLabel(player.playerClass)!==null?signatureRatio(player.signature):null;`. Auch die Nebenzitate stimmen: renderer.ts:955-956 (Specter-Tarnung, `1-0.85*stealth` für Fremde), 960-961 (Balken 50×2 in `this.palette.self`), ui.ts:259 und 537-544 (Textzeile `MOMENTUM 72 %` im Panel oben links, 9 px). Die Angabe "index.ts:754" ist packages/shared/src/index.ts:754 — `signature?: number;` im `PlayerSnapshot`, also für ALLE Spieler, nicht nur den eigenen.

2. IST DIE ZAHL WIRKLICH AUF DER LEITUNG? Nicht nur behauptet, gemessen. Gegen apps/server/dist gebaut: `playerSnapshot` (game.ts:199-204) spreadet das ganze Spielerobjekt, `snapshot()` (game.ts:325) filtert nur nach Sichtradius. Zwei Spieler, 300 Einheiten Abstand, der eine ein stehender `bombard`: der Snapshot des BEOBACHTERS enthält `signature: 100` des Gegners. Auch mit SNAPSHOT_DELTAS + SHORT_NET_IDS an — `stripPlayerStatics` (snapshot-encoding.ts:186-198) entfernt nur name/playerClass/isBot/upgrades. Der Client bekommt den Füllstand des Gegners in jeder Konfiguration und wirft ihn weg.

3. FÄNGT ES JEMAND AB? Ich habe den ganzen Client durchsucht. `signature` wird gelesen in renderer.ts (955 Tarnung, 957 eigener Balken), ui.ts:537 (eigener Text), prediction.ts (nur eigener Tank), class-tree/c

*Korrektur:* TITEL (ersetzen — der alte ist in beiden Hälften falsch und widerspricht dem eigenen Beweistext):
"Der Füllstand eines Gegners ist im Spielbild nirgends ablesbar, obwohl der Server ihn für jeden Spieler mitschickt"

SCHWERE: hoch → mittel.
Begründung für die Abwertung: (a) Der eigene Balken existiert und funktioniert für ALLE acht Familien — er ist dünn, nicht unsichtbar. (b) Die Füllbedingung ist bei fünf Familien sichtbares Verhalten (fahren, stehen, Dauerfeuer, Treffer einstecken), und GOAL.md:256-258 macht genau das zum Entwurfspunkt. (c) Treffer erzeugen auch über fremden Tanks Schadensza


**Urteil 7** – haltbar: `True`, Sicherheit: `sicher`

Ich bin mit "haltbar: false" gestartet und habe vier Angriffe versucht. Drei sind gescheitert, einer hat Teile des Befunds zerlegt – der Kern bleibt.

1) STIMMT DIE ZEILE? Ja, wörtlich. signature-aegis.ts:75 ist `dischargeRadius: 240`, :71 ist `dischargeDamage: 34`, :35 der Satz "Kein Knopf, keine Zieleingabe". family-upgrades.ts:101 ist `aegis: { powerBase: 12, powerPerPoint: 3.2 }`. packages/shared/src/gameplay.ts:119–129 ist `PlayerGameplaySnapshot` (neun Felder, keins davon ein Ereignis), :202–220 ist `GameplayWorldExtension` (gameplay, eliteShapeIds, arenaEvent, royaleZone, bountyTargetId, bountyValue, arenaGuardianId, freshAchievements, spectatorTargetId – kein Entladungsfeld). gameplay-effects.ts:201–205 zeichnet für Repulse Kreis + Füllung + Kontur. renderer.ts:469 ist der Todes-ShockRing mit `maxRadius:86`. In audio.ts gibt es genau sieben Methoden (shot, module, damage, kill, death, level, eventHorn, bounty) – keine für eine Signature. `grep -rni "discharge|entladung"` über apps/ und packages/ trifft ausserhalb von Server, Test, Doku-Tabelle und zwei Beschriftungstexten NICHTS im Client-Renderpfad. Zeilenprüfung: bestanden.

2) FAENGT ES JEMAND AB? Ich habe aktiv gesucht und drei Kandidaten gefunden – keiner schliesst die Lücke, aber zwei widerlegen die Formulierung des Befunds:
   - ui.ts:259/535–543 zeigt eine HUD-Zeile "SCHILD n %". Der Befund behauptet, der 2-px-Balken sei "das einzige Zeichen". Das ist auf dem Desktop falsch. Auf dem Handy stimmt es: mobile.css

*Korrektur:* TITEL zu absolut, korrigieren zu: "Die AEGIS-Entladung hat keine Ursachenanzeige – der Spieler sieht die Folge, aber nie den Auslöser (und nie die vollen 100 %)". Grund: "kein einziges Zeichen" ist widerlegt – renderer.ts:460–464 gibt jedem Ziel 130 ms Weissblitz und eine Schadenszahl, der Rückstoß ist als Verschiebung sichtbar (gemessen vx 260 auf halbem Radius, rund 95 px Weg bei Beschleunigung 1420). Was fehlt, ist ausschliesslich das Zeichen, das die Wirkung dem Träger, dem Zeitpunkt und dem Radius 240 zuordnet.

BEWEIS, zwei Korrekturen:
1. "34–44 Schaden" ersetzen durch "12–44 Schaden (1


**Urteil 8** – haltbar: `True`, Sicherheit: `sicher`

Ich habe versucht, den Befund zu kippen, und bin an jeder Stelle am Code gescheitert. Der Kern ist belegt; drei Nebenbelege sind falsch und gehoeren korrigiert.

1) STIMMT DIE ZEILE? Teils.
- audio.ts:50 ist `shot(playerClass)`, der Beginn der Klangmethoden — als Anker richtig. Die oeffentlichen Klaenge sind genau acht: shot(50), module(58), damage(65), kill(70), death(77), level(82), eventHorn(84), bounty(88). Der Befund schreibt "neun Klaenge" und zaehlt dann acht auf. FEHLER (kosmetisch), aber die Kernaussage stimmt: keiner davon gehoert zur Formenzerstoerung.
- "game.ts:536 vergibt die Belohnung" ist FALSCH. Zeile 536 ist `else if (owner.primary) target = {...}` mitten in `stepDrones`. Die Belohnung steht in `damageShape` an apps/server/src/game.ts:568: `if (owner) this.awardXp(owner, SHAPE_CONFIG[shape.kind].reward);` — 32 Zeilen daneben. Die Aussage selbst (Belohnung ohne jedes Ereignis Richtung Client) ist trotzdem korrekt: `damageShape` loescht die Form aus `this.shapes` und vergibt XP, mehr passiert nicht.
- Gegengeprueft, ob eine Schicht doch ein Ereignis anhaengt: `arena-systems.ts:298-308` umschliesst `damageShape` (bindet das Original, ersetzt es nicht) und vergibt bei Elite-Formen nur weitere 260 XP. `simulation-hardening.ts:158/180` und `drone-tuning.ts:180` rufen `damageShape` nur auf. Kein Ereignis, kein Killfeed-Eintrag, nichts.

2) FAENGT ES JEMAND AB? Nein — akustisch nirgends.
- `GameAudio` wird an genau einer Stelle instanziiert (main.ts:84) und ausschli

*Korrektur:* TITEL (geschaerft, weil "stumm/leer" widerlegt ist): "Kein Klang sagt, ob der Schuss getroffen hat — der Hit-Confirm aus dem eigenen Plan fehlt". Alternativ naeher am Original: "Der haeufigste Vorgang des Spiels hat keinen Klang — Formentreffer und -zerstoerung sind akustisch nicht von einem Fehlschuss zu unterscheiden".

SCHWERE: mittel — bestaetigt, keine Aenderung.

AUFWAND: klein — bestaetigt, aber der Ausloeseort im Vorschlag ist falsch (siehe unten).

BELEGE, DIE ZU KORRIGIEREN SIND:
1. "neun Klaenge" -> acht Klaenge (shot/module/damage/kill/death/level/eventHorn/bounty, audio.ts:50-90).
