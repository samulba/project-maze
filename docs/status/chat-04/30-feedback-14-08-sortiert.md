# 30 – Sams Spieltest 14.08.: Rohmaterial und sortierter Plan

| | |
| --- | --- |
| **Auftrag** | Sam, 14.08.: „das ist MEIN FEEDBACK, sortier den erstmal gescheit und lass das dann CLEAN step by step fixen / durcharbeiten! NIX DARF VERLOREN GEHEN & ALLES MUSS GEFIXT WERDEN! und das RICHTIG" |
| **Branch** | `claude/mazers-feedback-testspiel-7y5cmj` |
| **Vorlauf** | [Bericht 25](25-sams-spieltest-feedback.md) (13.08.), [Bericht 26](26-plan-rework.md) (Stufenplan), [Bericht 29](29-drohnen-rework-2.md) |
| **Basis** | `npm run check` grün – 89 Dateien, 1214 Tests |

## Sams Worte, unverändert

1. RÜCKSTOSS der KUGELN viel zu STARK z.B. nicht sinnvoll eingesetzt z.B. beim
   ANFANGSTANK zu stark.
2. KUGELN verschwinden zu ABRUPT, sollten cleaner verschwinden, verblassen wenn
   die zu weit wegfliegen oder irgendwas hitten wie die Wand z.B.
3. RUN-BEENDET-KARTE, LINKS UNTEN DROPDOWN richtig hässlich, muss viel schöner
   gemacht werden.
4. RECHTS oben NEUE SPEZIALISIERUNG: reicht nur die BILDER und evtl. NAME (z.B.
   RAPID etc.), aber nicht auch noch Beschreibung – klaut zu viel Platz, und so
   können wir die BILDER größer machen!
5. WENN Kugeln irgendwas hitten wie z.B. einen SQUARE, den aber nicht direkt
   töten, sollen die nicht einfach DURCH fliegen! Das macht kein SINN!
6. Bei Klassen, die sehr viele KUGELN spammen können, muss es immer diese LOGIK
   geben, dass sie einmal schießen, wenn man einmal drückt! Also z.B. bei
   REPEATER immer die drei Kugeln von links nach rechts – aber halt: nur wenn
   ich gedrückt halte, ist auf AUTO-Modus, sonst eben nur einmal die drei, damit
   man kontrollierter spielen kann. + Diese ganzen SPAM-Tanks: da schaut es, wie
   es aus dem ROHR am Anfang rauskommt, komisch aus, weil man die Kugel schon
   vorm Rohr sieht etc.! Und das Design, wie die Rohre bei einigen Tanks sind,
   obwohl die anders schießen, ist komisch.
7. MAN KANN KEINE DROHNEN kaputt schießen!!! DAS IST VIEL ZU OP! Und die gehen
   nicht kaputt, wenn die WÄNDE berühren, und fliegen auch einfach wie Schüsse
   durch Objekte durch, obwohl sie die entweder killen oder dort sterben
   sollten, die Drohnen, checkst du?
8. Die DROHNEN-Klasse fühlt sich noch immer MEGA MEGA komisch an zu spielen. Ich
   will das EINS ZU EINS wie in DIEP.IO haben vom FEELING, dort haben sie das
   perfekt gemacht. Analysier das RICHTIG und mach das genau so, so ist super.
   (Kleiner Nachfix: die Drohnen gehen doch kaputt, wenn sie Wände berühren, das
   ist gut.)
9. Ich finde, paar Tanks bewegen sich noch überdurchschnittlich schnell, OP!

## Wie sortiert wird – und warum nicht in Sams Reihenfolge

Sams Liste ist nach Auffälligkeit sortiert, nicht nach Abhängigkeit. Drei
Beobachtungen schneiden den Plan anders:

**Erstens: Punkt 5 und Punkt 7 sind derselbe Fehler an zwei Stellen.** Beides
ist „ein Körper fliegt durch einen anderen hindurch, als wäre er nicht da". Im
Code sind es dieselben zwei Funktionen (`stepProjectiles`,
`stepDrones`) und dieselbe fehlende Regel: Es gibt keinen Kontakt, der einen
Flugkörper stoppt. Nacheinander gefixt kostet das zweimal dieselbe Denkarbeit;
zusammen ist es **eine** Stufe.

**Zweitens: Punkt 7 enthält einen Befund, der schon stimmt – und Sam sagt es in
Punkt 8 selbst dazu.** Der Wandtod der Drohnen existiert seit
[Bericht 29](29-drohnen-rework-2.md) (`WANDTOD_MIN_ANLAUF_ANTEIL`). Sam
korrigiert sich im Nachsatz von Punkt 8. Aus Punkt 7 bleiben damit **zwei**
echte Aufträge übrig: Drohnen abschießbar machen, und Drohnen an Objekten
stoppen statt hindurchfliegen zu lassen.

**Drittens: Punkt 6 sind drei verschiedene Aufträge in einem Absatz.** Die
Feuer-Kadenz (Server, Eingabe), der Mündungsversatz (Server, Spawnpunkt) und
das Rohr-Design (Client, Zeichnung) haben nichts miteinander zu tun außer dem
Satz, in dem sie stehen. Sie werden getrennt gefixt, damit jeder einzeln
prüfbar bleibt.

Daraus fünf Stufen. Die Reihenfolge ist: erst was das Spiel *tut* (Physik,
Kadenz), dann was man *sieht* (Rohr, Kugel), zuletzt die Oberfläche.

## Stufe 1 – Körper, die sich nicht durchdringen (Punkte 5 + 7)

| Sams Punkt | Befund im Code | Fix |
| --- | --- | --- |
| 5 – Kugeln fliegen durch Squares | `stepProjectiles` zieht bei Treffer nur `integrity` ab; bleibt davon etwas übrig, fliegt die Kugel unverändert weiter | Nur ein **Kill** darf durchschlagen. Überlebt das Ziel, ist die Kugel verbraucht |
| 7a – Drohnen nicht abschießbar | `stepProjectiles` prüft `shapes` und `players` – Drohnen kommen in der Funktion **nicht vor** | Drohnen werden reguläre Projektilziele |
| 7b – Drohnen fliegen durch Objekte | `stepDrones` macht Schaden bei Kontakt, ändert die Bewegung aber nicht | Kontakt schiebt die Drohne heraus, statt sie durchzulassen |
| 7c – Drohnen sterben nicht an Wänden | **Stimmt nicht mehr** (Bericht 29), Sam korrigiert sich in Punkt 8 | nichts zu tun, bleibt dokumentiert |

Warum „nur ein Kill schlägt durch" und nicht „jede Kugel stirbt beim ersten
Treffer": Der `penetration`-Slot ist ein gekaufter Aufwertungsplatz. Stürbe
jede Kugel am ersten Kontakt, wäre er ein toter Platz. Mit dieser Regel
bedeutet er genau das, was er in Diep.io bedeutet – wie viele Ziele eine Kugel
*wegräumen* kann, bevor sie verbraucht ist. Ein Ziel, das überlebt, hält sie
auf; das ist Sams Punkt.

## Stufe 2 – Drohnen wie in Diep.io (Punkt 8)

Sam will das Gefühl 1:1. Die Analyse von Diep.io führt auf vier Regeln, von
denen der Server heute **eine** hat:

| Diep.io | Heute im Code |
| --- | --- |
| Drohnen **kreisen** um ihren Zielpunkt, sie halten nie an | `speed = min(tempo, abstand / BREMS_SEKUNDEN)` – sie bremsen bis zum Stillstand und stehen dann auf dem Punkt |
| Drohnen kommen **aus dem Spawner-Rohr**, mit Schwung nach außen | `position: { ...owner.position }` – sie erscheinen im Mittelpunkt des Panzers |
| Im Leerlauf ein **wanderndes Karussell** um den Panzer | vorhanden (`orbitAngle`) ✔ |
| Nichts an der Flotte ist **unzerstörbar** | Stufe 1 |

Die stehende Drohne ist der eigentliche Grund für „fühlt sich MEGA komisch
an": Eine Flotte, die auf einem Punkt parkt, ist ein Standbild, kein Schwarm.

## Stufe 3 – Kadenz und Mündung (Punkt 6, Teile a und b)

**6a – ein Klick, eine Salve.** Heute entscheidet allein `player.primary &&
cooldown <= 0`. Ein 200-ms-Klick auf einen Rapid (Nachladen 0,19 s) gibt damit
zwei Schuss, auf einen Vollausbau drei. Neu: Der **Druckflanke** gehört genau
eine Salve; Dauerfeuer beginnt erst, wenn wirklich gehalten wird.

**6b – die Kugel steckt vorm Rohr.** `fireBarrel` setzt den *Mittelpunkt* des
Projektils auf `playerRadius + barrelLength`, also exakt auf die Rohrmündung –
die ganze Kugel liegt damit sichtbar davor. Seit die Kugeln größer sind
(`PROJECTILE_RADIUS_SCALE`, 13.08.) fällt das auf. Neu: Der Mittelpunkt sitzt
so weit im Rohr, dass die Kugel an der Mündung *austritt*.

## Stufe 4 – was man sieht (Punkte 6c + 2)

**6c – Rohre, die anders aussehen als sie schießen.** Der Renderer zeichnet
Mehrlauf-Tanks als **parallele Balken seitlich versetzt**
(`y = offset * 44`), der Server feuert sie als **Winkelfächer**
(`(index/(count-1) - 0.5) * barrelSpread`). Storm zeigt sechs parallele Rohre
und feuert einen 24°-Fächer aus der Mitte. Zusätzlich ignoriert die Zeichnung
das Feld `barrels` (Pro-Lauf-Profile) vollständig. Fix: **eine** geteilte
Quelle für die Lauf-Geometrie, aus der Server und Client lesen.

**2 – Kugeln verschwinden abrupt.** Der Renderer löscht die Ansicht in dem
Tick, in dem das Projektil aus dem Snapshot fällt. Neu: Ausblenden. Und zwar
unterschieden – Sam nennt beide Fälle selbst: ein Einschlag (Wand) ist ein
kurzer Knall, ein Reichweitenende ein weiches Verblassen.

## Stufe 5 – Oberfläche (Punkte 4, 3) und Tempo (Punkt 9)

**4 – Spezialisierungskarten.** Heute trägt jede Karte: Bild (64 px), Rolle,
Signature-Kurzform, Titel, Beschreibungssatz, Level, vier Balken, Perk-Zeile,
„führt zu"-Zeile. Sam will Bild + Name. Alles andere fällt weg, das Bild wächst.

**3 – Dropdown auf der RUN-BEENDET-Karte.** Das CORE-LOADOUT-Panel wird beim
Beitritt in die Todeskarte gehängt und bringt zwei native `<select>` mit. Neu:
ein eigener Auswähler in der Sprache des restlichen HUD.

**9 – zu schnelle Tanks.** Gemessen liegen die Grundtempi zwischen 222 und 340
px/s; mit vollem Tempo-Slot (+5 % je Punkt, 10 Punkte) kommt die Spitze auf
510 px/s. Fix: ein **weicher Deckel** in `movementStatsFor` (shared, damit die
Client-Vorhersage dieselbe Zahl rechnet) – er staucht nur die Spitze und lässt
das Mittelfeld unberührt.

## Was ausdrücklich NICHT passiert

* Der Wandtod der Drohnen bleibt, wie er ist (Sams Nachfix in Punkt 8).
* Die Reichweite und das Tempo der Projektile werden nicht angefasst – beides
  kam am 13.08. neu und steht in Sams Liste diesmal nicht.
* Der `penetration`-Slot behält seine Bedeutung; Stufe 1 verschärft ihn nicht
  zu „jede Kugel stirbt sofort".
