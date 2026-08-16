# Auftrag: Kompletter Neuentwurf aller Panzerklassen für „Mazers"

Du bist Game- und Visual-Designer für einen .io-Arena-Shooter. Deine Aufgabe ist
ein **vollständiger, umsetzungsreifer Neuentwurf aller 67 Klassen** – wie sie
aussehen, wie sie schießen und wie sie sich anfühlen.

Vier Anläufe eines anderen Entwicklers wurden verworfen. Die Kritik des
Auftraggebers, wörtlich: **„Die Designs, wie die ausschauen, wie die schießen
und sich anfühlen – komplett Dogshit."** Nimm das als Ausgangspunkt: Es geht
nicht um Feinschliff, sondern um einen neuen Entwurf.

---

## 1. Das Spiel

* Top-Down-Arena-Shooter im Stil von **diep.io / arras.io**. Der Auftraggeber
  nennt diep.io ausdrücklich als Vorbild („die haben's perfekt gemacht").
* **Karte:** 9000 × 6000 px **Labyrinth** mit 232 Wänden auf einem 480-px-Raster;
  Gänge sind 320 px breit. Wände sind für Projektile und Drohnen **tödlich**.
  Das ist der wichtigste Unterschied zu diep.io, das eine offene Fläche hat.
* **Spielfigur:** Kreis mit Radius 22 px. Sichtfenster ca. 1600 × 900 px.
* **Level 1–45**, Klassenwahl auf Level 5, 15, 28 und 42 entlang eines
  Baums (Spalte „Eltern" unten).
* **Aufwertungen** je Klasse: Nachladen, Schaden, Kugeltempo, Durchschlag,
  Leben, Regeneration, Tempo, Körperschaden.
* Steuerung: WASD, Maus zielt, Linksklick feuert, E ist Dauerfeuer,
  Rechtsklick ist die Zweitfunktion (bei Drohnenklassen: Abstoßen).
* Tickrate 40 Hz, autoritativer Server, Client-Vorhersage für die eigene Figur.

## 2. Was technisch schon existiert

Der Renderer zeichnet einen Panzer aus genau zwei Dingen. **Halte dich an dieses
Vokabular** – alles, was du entwirfst, muss sich damit ausdrücken lassen, sonst
ist es nicht baubar.

**a) Der Rumpf.** Aktuell für JEDE Klasse derselbe Kreis (Radius 22), einzige
Ausnahme ist ein stacheliges Sechseck für die rohrlose Klasse `smasher`. Das ist
bewusst so, nach dem Vorbild. Du darfst das ändern – wenn du es tust, begründe
es und beschreibe die Form als Polygon oder Kreis.

**b) Die Rohre.** Jedes Rohr ist ein Trapez mit fünf Zahlen:

| Feld | Bedeutung | Einheit |
|---|---|---|
| `angle` | Richtung relativ zur Zielrichtung | Grad (0 = geradeaus) |
| `versatz` | seitlicher Abstand von der Mittellinie, senkrecht | in Rohrbreiten (±0,58 = zwei Rohre bündig nebeneinander) |
| `laenge` | Faktor auf die Rohrlänge der Klasse | 1,0 = Standard |
| `breite` | Breite an der Wurzel, Faktor | 1,0 = Standard (≈14–20 px) |
| `muendungsbreite` | Breite an der Mündung, Faktor | > `breite` = Trapez, das sich öffnet |

Damit lassen sich alle diep.io-Formen bauen: Twin (zwei parallele Rohre über
`versatz`), Triple Shot (Winkel), Penta (Winkel + gestaffelte `laenge`),
Machine Gun und Drohnen-Launcher (`muendungsbreite` > `breite`), Destroyer
(große `breite`), Sniper (kleine `breite`, große `laenge`).

Zusätzlich gibt es **Zier-Rohre** (`launchers`): werden gezeichnet, feuern nie.
Dafür gedacht, wo eine Form gebraucht wird, die keinen Schaden machen soll –
Drohnen-Launcher, Schubdüsen, Panzerplatten.

## 3. Harte Regeln, die du nicht brechen darfst

1. **Der Gesamtschaden je Klasse bleibt.** Du darfst Schaden über die Rohre
   umverteilen (`damageScale` je Rohr, Summe muss der Rohrzahl entsprechen),
   aber die Klasse insgesamt nicht stärker oder schwächer machen. Vorhandene
   Werte für Nachladen, Schaden, Kugeltempo stehen unten und bleiben.
2. **Rohre, die nach hinten oder zur Seite zeigen, zählen nicht als
   Frontschaden.** Eine Klasse, die vier ihrer acht Rohre nach hinten richtet,
   halbiert damit ihren effektiven DPS nach vorn. Berücksichtige das.
3. **Die Klassenbeschreibung ist bindend.** Wenn dort „vier kurze Läufe im engen
   Fächer – eine Wand aus Nadeln" steht, darf die Form kein Rundum-Tank sein.
   Wenn du eine Beschreibung ändern willst, schlage den neuen Text vor.
4. **Blindtest:** Zwei Klassen dürfen nie dieselbe Silhouette haben. Prüfe deine
   eigene Liste am Ende darauf.
5. **Das Labyrinth.** Weit ausschwingende Bewegungen und sehr langsame
   Projektile funktionieren in 320 px breiten Gängen schlecht.

## 4. Was du liefern sollst

### Teil A – Designprinzipien (Fließtext, kurz)

Wie unterscheiden sich die neun Familien auf einen Blick? Woran erkennt man die
Stufe (L5 → L15 → L28 → L42) innerhalb einer Familie? Was ist die Regel, nach
der eine Silhouette entsteht – und warum ist sie besser als „jede Klasse kriegt
eine eigene Sonderform"?

### Teil B – Alle 67 Klassen als Tabelle

Für **jede** Klasse genau diese Spalten:

```
id | Rumpfform | Rohre (Liste von {angle, versatz, laenge, breite, muendungsbreite})
   | Zier-Rohre (dieselben Felder) | Feuerverhalten in einem Satz
   | Warum sie sich anders anfühlt als ihre Geschwister
```

Die Rohrwerte bitte **als konkrete Zahlen**, nicht als Beschreibung. Beispiel
für einen Twin:

```
twin | Kreis | [{angle:0, versatz:-0.58, breite:0.82}, {angle:0, versatz:0.58, breite:0.82}]
     | [] | Zwei parallele Ströme, versetzt | Doppelte Trefferfläche statt Streuung
```

### Teil C – Das Gefühl

Für jede der neun Familien: Was soll sich beim Spielen anders anfühlen, und über
welche der vorhandenen Stellschrauben (Nachladen, Kugeltempo, Kugelgröße,
Rückstoß, Streuung, Rohrzahl, Drohnenverhalten) wird das erzeugt? Konkrete
Zahlenvorschläge, keine Adjektive.

### Teil D – Die Drohnenklassen gesondert

Zehn Klassen mit Drohnen statt Rohren. Wie sehen ihre Launcher aus (Zahl,
Winkel, Trapezform), und wie unterscheiden sich die zehn voneinander in Flotte,
Verhalten und Aussehen? Vorbild sind Overseer, Overlord, Necromancer, Factory
aus diep.io.

### Teil E – Was du weglassen würdest

Wenn 67 Klassen zu viele sind, um sie unterscheidbar zu machen: Sag das, und
schlage vor, welche zusammengelegt oder gestrichen gehören. Eine ehrliche
Antwort ist mehr wert als 67 erzwungene Sonderformen.

---

## 5. Der aktuelle Bestand

Neun Familien, 67 Klassen. „Rohre" ist die Zahl feuernder Läufe, „Drohnen" die
Flottengröße.

### CORE
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| core | 1 | – | 1 | 0 | 0.3s | 16 | 820 | 36 | Stabiler Allrounder für Farming und erste Kämpfe. |

### RAPID
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| rapid | 5 | core | 1 | 0 | 0.19s | 10.5 | 840 | 34 | Schneller Drucktank mit guter Mobilität. |
| twin | 15 | rapid | 2 | 0 | 0.25s | 9.5 | 850 | 35 | Zwei Läufe erzeugen konstanten, kontrollierbaren Druck. |
| repeater | 15 | rapid | 3 | 0 | 0.34s | 8 | 835 | 32 | Drei Läufe feuern im schnellen Stakkato statt auf einmal – ein Nachlade-Hebel spürbar in jedem Schuss. |
| flanker | 15 | rapid | 2 | 0 | 0.24s | 11 | 845 | 34 | Ein Lauf nach vorn, einer nach hinten – Druck und Rückendeckung zugleich. |
| vanguard | 15 | rapid | 4 | 0 | 0.33s | 6.5 | 831 | 32 | Vier kurze Läufe im engen Fächer - eine Wand aus Nadeln. |
| storm | 28 | twin | 4 | 0 | 0.26s | 6 | 860 | 34 | Vier Läufe fächern auf – die Mitte trifft härter, außen schwirrt es schneller und leichter heraus. |
| gatling | 28 | repeater | 6 | 0 | 0.28s | 4.3 | 875 | 31 | Sechs leichte Läufe liefern konzentriertes Dauerfeuer. |
| octo | 28 | flanker | 8 | 0 | 0.3s | 6.5 | 855 | 32 | Acht Läufe decken jede Richtung ab – niemand flankiert dich. |
| hailstorm | 28 | vanguard | 7 | 0 | 0.36s | 4.2 | 847 | 30 | Sieben Läufe, ein Hagelschlag - Deckung gibt es nicht. |
| vortex | 42 | rapid | 5 | 0 | 0.27s | 5.2 | 865 | 33 | Fünf Läufe im Fächer, Momentum ohne Ende – die wandelnde Schrotwand. |

### PRECISION
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| sniper | 5 | core | 1 | 0 | 0.68s | 38 | 1200 | 52 | Hoher Burst und Reichweite, aber wenig Fehlertoleranz. |
| railgun | 15 | sniper | 1 | 0 | 1s | 60 | 1420 | 62 | Schwerer Präzisionsschuss mit hoher Durchschlagskraft. |
| hunter | 15 | sniper | 1 | 0 | 0.5s | 32 | 1100 | 47 | Mobiler Präzisionstank mit schnellerer Schussfolge. |
| arbalest | 15 | sniper | 2 | 0 | 0.75s | 26 | 1150 | 50 | Zwei parallele Präzisionsläufe für doppelten Druck auf Distanz. |
| ballista | 15 | sniper | 1 | 0 | 0.88s | 46 | 1260 | 58 | Ein Bolzen, der durch alles geht, was in einer Reihe steht. |
| lancer | 28 | railgun | 1 | 0 | 1.3s | 82 | 1640 | 70 | Extremer Einzelschuss mit langer Vorbereitung. |
| phantom | 28 | hunter | 1 | 0 | 0.62s | 50 | 1500 | 58 | Schneller Final-Sniper für Bewegung, Winkel und präzise Picks. |
| deadeye | 28 | arbalest | 2 | 0 | 0.8s | 34 | 1350 | 56 | Vollstrecker: Doppelläufe mit Bonusschaden auf schwer verwundete Ziele. |
| siegebreaker | 28 | ballista | 1 | 0 | 1.18s | 70 | 1440 | 68 | Bricht Stellungen: schwerster Bolzen der Arena. |
| eclipse | 42 | sniper | 1 | 0 | 1.15s | 86 | 1560 | 66 | Ein Schuss wie eine Finsternis – wer ihn sieht, sieht ihn zu spät. |

### CONTROL
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| drone | 5 | core | 0 | 4 | 0.72s | 8.5 | 0 | 26 | Vier Drohnen für Farming und Raumkontrolle. |
| warden | 15 | drone | 0 | 6 | 0.62s | 10.5 | 0 | 26 | Sechs Drohnen für defensive Kontrolle und Gegenangriffe. |
| factory | 15 | drone | 0 | 5 | 0.8s | 13 | 0 | 26 | Weniger, stärkere Drohnen mit langsamerer Wiederherstellung. |
| guardian | 15 | drone | 0 | 5 | 0.7s | 11 | 0 | 26 | Fünf zähe Schildwächter-Drohnen in engem Verteidigungsorbit. |
| sentinel | 15 | drone | 0 | 3 | 0.9s | 19 | 0 | 26 | Drei schwere Wächter statt eines Schwarms. |
| overseer | 28 | warden | 0 | 8 | 0.58s | 11.5 | 0 | 26 | Acht leichtere Drohnen für anspruchsvolle Schwarmkontrolle. |
| carrier | 28 | factory | 0 | 6 | 0.85s | 16 | 0 | 26 | Sechs schwere Drohnen für langsamen, massiven Flächendruck. |
| hive | 28 | guardian | 0 | 10 | 0.55s | 6.5 | 0 | 26 | Zehn Mikro-Drohnen mit blitzschnellem Nachschub überfluten das Feld. |
| aviary | 28 | sentinel | 0 | 9 | 0.56s | 8 | 0 | 26 | Neun flinke Vögel - der Himmel gehört ihm. |
| sovereign | 42 | drone | 0 | 7 | 0.6s | 14.5 | 0 | 26 | Sieben Wächter, ein Wille – der Hofstaat regiert das Feld. |

### IMPACT
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| rammer | 5 | core | 1 | 0 | 0.45s | 9 | 700 | 27 | Mobiler Nahkämpfer mit hohem Körperschaden. |
| crusher | 15 | rammer | 1 | 0 | 0.5s | 8.5 | 660 | 24 | Schwerer Rammer mit hoher Haltbarkeit. |
| bulwark | 15 | rammer | 1 | 0 | 0.65s | 13 | 640 | 22 | Defensiver Hybrid mit hoher Haltbarkeit und schweren Projektilen. |
| blitz | 15 | rammer | 1 | 0 | 0.5s | 8 | 680 | 25 | Leichter Sturm-Rammer: Körperschaden wächst mit deinem Tempo. |
| rampart | 15 | rammer | 1 | 0 | 0.7s | 14 | 650 | 23 | Rollt nicht schnell, aber unbeirrt - und trägt schwer. |
| juggernaut | 28 | crusher | 1 | 0 | 0.62s | 8 | 620 | 21 | Extrem widerstandsfähiger Nahkämpfer mit kurzer Reichweite. |
| fortress | 28 | bulwark | 1 | 0 | 0.75s | 16 | 600 | 20 | Langsamer Defensivanker mit maximaler Haltbarkeit und schweren Schüssen. |
| comet | 28 | blitz | 1 | 0 | 0.55s | 7.5 | 660 | 22 | Der schnellste Tank der Arena – bei Vollgas verheerender Aufprall. |
| smasher | 28 | blitz | 0 | 0 | 0s | 0 | 0 | 0 | Kein Rohr, kein Ausweichen nötig – nur der Aufprall zählt. |
| behemoth | 28 | rampart | 1 | 0 | 0.82s | 17 | 630 | 21 | Was ihm in den Weg kommt, war vorher da. |
| leviathan | 42 | rammer | 1 | 0 | 0.8s | 18 | 615 | 20 | Eine Wand aus Stahl, die auf dich zurollt. |

### SPECTER
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| specter | 5 | core | 1 | 0 | 0.55s | 24 | 900 | 40 | Wer nicht schießt, verschwindet – und schlägt aus dem Nichts zu. |
| wraith | 15 | specter | 1 | 0 | 0.42s | 18 | 880 | 36 | Der schnelle Schleicher: flinker enttarnt, flinker verschwunden. |
| shade | 15 | specter | 1 | 0 | 0.78s | 40 | 1000 | 48 | Der schwere Schatten: ein Schuss, der sitzt. |
| mirage | 28 | wraith | 2 | 0 | 0.5s | 17 | 920 | 38 | Zwei Stiche aus dem Dunkel – das Trugbild jagt in Paaren. |
| revenant | 28 | shade | 1 | 0 | 0.6s | 9 | 720 | 26 | Rammt aus der Unsichtbarkeit – kehrt zurück, wenn niemand hinsieht. |
| eidolon | 42 | specter | 1 | 0 | 0.6s | 46 | 1060 | 52 | Das Gespenst der Arena: ganz verschwinden, vernichtend erscheinen. |

### TEMPEST
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| tempest | 5 | core | 1 | 0 | 0.34s | 13 | 815 | 34 | Feuern heizt den Reaktor: mehr Schaden, bis er glüht. |
| scorch | 15 | tempest | 2 | 0 | 0.26s | 9.5 | 800 | 33 | Brennt schnell heiß: zwei Läufe im Wimpernschlag-Abstand statt eines Fächers. |
| surge | 15 | tempest | 1 | 0 | 0.52s | 22 | 760 | 38 | Ein schwerer Puls je Ladung – Hitze als Hammer. |
| inferno | 28 | scorch | 3 | 0 | 0.29s | 7.5 | 810 | 32 | Drei Kehlen, ein Feuersturm im Stakkato – bis die Sicherung kommt. |
| overload | 28 | surge | 1 | 0 | 0.6s | 30 | 740 | 40 | Überladen bis an die Kante: riesige Projektile, kurze Lunte. |
| cataclysm | 42 | tempest | 2 | 0 | 0.4s | 17 | 806 | 36 | Wenn der Reaktor singt, brennt die halbe Arena. |

### SIEGE
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| siege | 5 | core | 1 | 0 | 0.62s | 28 | 881 | 44 | Wer steht, wird zur Kanone: Stillstand baut Stellung auf. |
| trapper | 15 | siege | 1 | 0 | 1.1s | 20 | 620 | 40 | Der Schuss bleibt liegen, wo er landet – eine Falle statt einer Kugel. |
| bombard | 15 | siege | 2 | 0 | 0.72s | 21 | 830 | 42 | Zwei schwere Rohre - die Stellung schlägt breit zu. |
| mortar | 15 | siege | 1 | 0 | 0.95s | 44 | 690 | 38 | Langsame Brocken mit gewaltigem Einschlag. |
| howitzer | 28 | bombard | 3 | 0 | 0.78s | 15 | 844 | 40 | Drei Rohre halten eine ganze Schneise unter Feuer. |
| trebuchet | 28 | mortar | 1 | 0 | 1.25s | 66 | 645 | 48 | Ein Rohr, ein Brocken, eine Entscheidung. |
| ragnarok | 42 | siege | 2 | 0 | 0.85s | 34 | 801 | 46 | Apex der Belagerung: eingegraben ist er nicht zu halten. |

### AEGIS
| id | Level | Eltern | Rohre | Drohnen | Nachladen | Schaden | Kugeltempo | Rohrlänge | Beschreibung |
|---|---|---|---|---|---|---|---|---|---|
| aegis | 5 | core | 1 | 0 | 0.44s | 14 | 744 | 30 | Erlittener Schaden lädt den Schild - die Entladung stößt zurück. |
| bulwarker | 15 | aegis | 1 | 0 | 0.5s | 15 | 732 | 28 | Dickeres Schild, längeres Stehvermögen. |
| reflector | 15 | aegis | 2 | 0 | 0.46s | 13 | 803 | 30 | Der Schild wirft zurück, was er schluckt. |
| paladin | 28 | bulwarker | 1 | 0 | 0.55s | 16 | 712 | 27 | Läuft ins Feuer und kommt stärker heraus. |
| retributor | 28 | reflector | 3 | 0 | 0.48s | 12 | 811 | 29 | Jeder Treffer auf ihn ist eine Anzahlung – drei Läufe zahlen sie in schneller Folge zurück, nicht auf einmal. |
| sanctum | 42 | aegis | 2 | 0 | 0.52s | 17 | 743 | 31 | Apex des Schildes: eine wandelnde Festung, die zurückschlägt. |

---

## 6. Format der Antwort

* Teil B als **Markdown-Tabelle oder JSON** – maschinell übernehmbar. Keine
  Prosa-Beschreibungen statt Zahlen.
* Wenn du eine Zahl nicht sicher festlegen kannst, schreibe sie trotzdem hin und
  markiere sie als Schätzung. Ein konkreter Wert, den man messen und korrigieren
  kann, ist besser als „etwas breiter".
* Widersprüche im Bestand (Beschreibung passt nicht zu den Werten) bitte
  ausdrücklich benennen, statt sie stillschweigend aufzulösen.
* Wo du vom diep.io-Vorbild abweichst, sag warum.

Die Antwort geht direkt an den Entwickler zur Umsetzung. Alles, was nicht in
Zahlen steht, muss er raten – und genau das ist bisher viermal schiefgegangen.
