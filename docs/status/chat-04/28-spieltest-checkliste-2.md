# 28 – Checkliste für den zweiten Spieltest (nach Stufe 0–3)

| | |
| --- | --- |
| **Auftrag** | Sam, 13.08.: „gib mir jetzt eine KOMPLETTE CHECKLISTE an Fragen die ich beantworten soll" |
| **Stand** | `442dfe4`, live in Produktion (Deploy-Wächter grün) |
| **Vorgänger** | [Bericht 24](24-spieltest-checkliste.md) – die erste Checkliste (F1–F26) |

Geändert seit deinem letzten Spieltest sind **vier Stufen**: der Strich-Bug (0),
die Drohnen (1), Projektile und Rückstoß (2) und die Karte (3). Diese Liste
fragt genau das ab – und die Stellen, an denen ich mir unsicher bin, sind
markiert: **⚠️ = hier kann ich falsch liegen, deine Antwort entscheidet.**

Antworte einfach mit Nummer und Stichwort („4: zweimal, einmal tödlich"). Was
du nicht beantwortest, lasse ich offen statt zu raten.

## Spielauftrag: drei Runden, damit alles drankommt

Ohne die richtigen Klassen bleiben Hälfte der Änderungen ungetestet:

1. **Eine Drohnenklasse** (overseer, sovereign, factory, aviary …) – Stufe 1
2. **Eine schnell feuernde Klasse** (gatling, rapid-Familie) – Rückstoß, Stufe 2
3. **Eine Fernkampfklasse** (sniper, lancer, railgun) – Reichweite, Stufe 2

---

## A · Die Karte (Stufe 3, die größte Änderung)

**1.** Fühlt es sich beim Losfahren wie ein **Labyrinth** an – oder immer noch
wie ein Feld mit Klötzen?

**2. ⚠️** Die **Gänge sind 320 px breit** (sieben Panzerbreiten, fünf passen
nebeneinander auf den Bildschirm). Zu eng · genau richtig · immer noch zu weit?

**3. ⚠️** **Orientierung:** Weißt du beim Fahren noch, wo du bist? Das ist das
Risiko, das ich mit dieser Änderung eingekauft habe – vorher war die Karte
offen genug, dass man immer etwas sah.

**4.** **Sackgassen:** Bist du in eine gelaufen? Wie oft, und hat es dich
gekostet? (14 von 216 Zellen sind Sackgassen – ich kann das runterdrehen,
verliere dafür Labyrinth.)

**5.** **Die Wände sind jetzt 160 px dick** statt 54. Sehen sie aus wie Mauern
oder wie Klötze? Kann man sich wirklich dahinter verstecken?

**6.** **Sichtweite:** Man sieht jetzt im Median 400 px statt 760 weit. Zu
kurz? Fühlt es sich beklemmend an oder spannend?

**7.** **Spawn:** Bist du je in einer blöden Ecke aufgewacht – eingemauert,
direkt an einer Wand, mitten im Feuer?

**8.** **Kampf im Gang:** Wie fühlt sich ein Duell in einem 320-px-Gang an?
Kann man ausweichen, oder ist es nur noch stumpfes Aufeinander-Zufahren?

## B · Die zwei Hauptplätze (Stufe 3)

Sie liegen **links und rechts auf halber Höhe**, sind je **800 × 800 px offen**,
haben **vier Tore** und **ein Drittel aller Formen erscheint dort**.

**9. ⚠️** **Hast du einen gefunden?** Wenn ja: nach wie langer Zeit, und durch
Zufall oder gezielt?

**10.** Hast du überhaupt **gemerkt**, dass das ein besonderer Ort ist – oder
sah es aus wie ein zufällig größerer Raum?

**11.** **Lohnt er sich?** Merkst du die höhere Formen-Dichte?

**12.** Kam es dort zu **Kämpfen**? Sind Bots dorthin gekommen?

**13. ⚠️ Entscheidung:** Es gibt **keine Anzeige**, um einen Hauptplatz zu
finden – die Minikarte ist ein Nahradar, keine Weltkarte. Was willst du?
* (a) Plätze aufs Nahradar zeichnen – billig, hilft nur in der Nähe
* (b) Richtungspfeil am Bildrand
* (c) Echte Weltkarte auf Tastendruck
* (d) Nichts – Finden ist Teil des Spiels

## C · Schießen: Reichweite, Tempo, Rückstoß (Stufe 2)

**14.** Dein Befund war „die Schüsse gehen noch immer zu weit". Es gibt jetzt
einen **Deckel bei 1400 px** – *und* die Wände stoppen Kugeln viel früher.
**Immer noch zu weit?**

**15. ⚠️** „…und sind von Anfang an zu schnell." **Daran habe ich noch nichts
geändert** – ich wollte dir erst die Zahlen zeigen, statt zu raten. Über
400 px braucht eine Kugel je nach Klasse **0,48–0,89 s**. Zu schnell?
Und: soll die Kugel **schnell starten und abbremsen** (so macht es Diep.io)
oder **gleichmäßig langsamer** fliegen?

**16.** **Ausweichen:** Kannst du einem Schuss ausweichen, den du kommen
siehst?

**17.** **Rückstoß** (neu): Spürst du ihn überhaupt? Bei welchen Klassen?

**18. ⚠️** Rückstoß **zu stark oder zu schwach**? Du hattest gesagt „aber jetzt
auch nicht zu stark" – er schiebt beim Dauerfeuer rund 25 px je Sekunde, etwa
ein Zehntel deiner Laufgeschwindigkeit.

**19.** Stört der Rückstoß beim **Zielen** oder beim **Stehenbleiben** (z. B.
beim Reparieren, oder mit einer SIEGE-Klasse)?

## D · Drohnen (Stufe 1 + der Strich-Bug aus Stufe 0)

**Bitte mindestens eine Runde mit einer Drohnenklasse.**

**20.** **Der Strich zur Bildecke** – weg?

**21.** **Greifen die Drohnen ohne Kommando an?** Das war dein Hauptbefund
(„sie schweben einfach um dich und dann passiert nix"). Tun sie jetzt etwas?

**22. ⚠️** **Zu stark?** Ohne jedes Kommando macht sovereign gemessen
**165 Schaden je Sekunde**, drone nur 47. Fühlt sich das nach „die spielen für
mich" an?

**23.** **Rechtsklick:** Die Drohnen werden jetzt **vom Cursor weggestoßen**
(so wie in Diep.io), nicht mehr hinter den Tank gespiegelt. Fühlt sich das
richtig an?

**24.** **Cursor-Steuerung:** Kannst du die Flotte dorthin schicken, wo du
hinwillst? Wo hört es auf zu funktionieren?

**25. ⚠️ Neu durch die Karte:** Bleiben Drohnen an **Wänden** hängen? Kommen
sie durch die Gänge hinter dir her?

**26.** Wenn du **nichts** tust (Maus still): Was machen sie? Bleiben sie
sinnvoll bei dir?

**27.** **Factory** hat noch **keine echten Minions** – das steht erst in
Stufe 4. Merkst du, dass da etwas fehlt?

## E · Bots (das größte Risiko der Kartenänderung)

Bots haben **keine Wegfindung** und nehmen sich nur Ziele, die sie **sehen**.
Gemessen halten sie es aus – aber Messung ist nicht Spielgefühl.

**28. ⚠️** Fahren sie **sinnvoll**, oder siehst du welche gegen Wände drücken?

**29. ⚠️** Steht irgendwo einer **fest**?

**30.** Sind sie **schwerer oder leichter** geworden als beim letzten Test?

**31.** Benutzen sie die Deckung – verlieren sie dich hinter Wänden, kommen sie
um die Ecke?

## F · Klassen (das ist die Vorbereitung für Stufe 4)

Dein Befund: „der eine schießt halt drei nach vorne, der andere zwei". **Daran
ist noch nichts geändert** – das ist der nächste und größte Brocken.

**32.** Welche Klassen hast du gespielt?

**33.** Fühlen sich zwei davon **wirklich unterschiedlich** an – oder immer
noch gleich mit anderer Rohrzahl?

**34.** Welche Klasse hat sich **am besten** angefühlt, und **warum genau**?

**35.** Welche am **langweiligsten**?

**36.** Gibt es eine Klasse aus einem anderen Spiel, die du hier haben willst?
(Diep.io-Namen reichen – Smasher, Trapper, Booster …)

## G · Alles andere

**37.** **Ruckler, Lags, Hänger?** Die Karte kostet jetzt mehr Rechenzeit
(12,5 % vom Budget statt 11,2 %) – das sollte man nicht merken.

**38.** Ist irgendetwas **kaputt oder komisch**, das hier nicht steht?

**39.** Was hat am meisten **Spaß** gemacht?

**40.** Was hat am meisten **genervt**?

---

## Was ich mit den Antworten mache

* **2, 3, 6** entscheiden, ob die Zellgröße (480) bleibt. Sie ist die eine
  Zahl, die das Labyrinthgefühl fast allein bestimmt – nach unten wird es
  dichter, nach oben wieder offener.
* **4** entscheidet über die Verflechtung (heute 0,20).
* **13** entscheidet, ob und wie Hauptplätze auffindbar werden.
* **15** ist die letzte offene Zahl aus Stufe 2.
* **22** entscheidet, ob der Drohnen-Auto-Angriff gedrosselt wird.
* **28, 29** entscheiden, ob Bot-Wegfindung vorgezogen wird.
* **32–36** sind der Bauplan für Stufe 4.
