# 19 – Warum Impact verliert

**Branch:** `claude/chat-02-server-gameplay-w1i4o8` · **Basis:** `origin/main` @ `43c879d`
**Kein Code, kein Flag.** Einlösung der Zusage aus Paket 18 („Wenn du willst,
liefere ich vorher eine Analyse wie beim Projektiltempo") – ein neuer Auftrag
lag noch nicht vor.

Paket 18 hat gemessen, **dass** Impact verliert: K/D 0,21 über neun Läufe, in
jeder Konfiguration. Hier steht, **warum** – und die Antwort ist nicht die, die
ich erwartet habe.

---

## Die Hypothese, die sich nicht bestätigt hat

Ich hatte im Bericht geschrieben: „Impact-Bots fahren per Bauart in den Gegner
hinein – ein Mensch spielt anders." Also habe ich es getestet: dieselbe Arena,
aber Impact-Bots halten Abstand (`preferredDistance` 430 statt 80,
`fleeHealth` 0,3 statt 0,1).

| Variante | Kills | Tode | K/D | Lebensdauer | Kontakt-Ticks | davon gegen Geschützte | je Lauf |
|---|---|---|---|---|---|---|---|
| heute | 30 | 161 | **0,19** | 25 s | 42 | **71 %** | 0,21 · 0,14 · 0,20 |
| Abstand | 13 | 77 | **0,17** | **56 s** | 16 | 13 % | 0,03 · 0,16 · 0,36 |

*(16 Bots, 12 Simulationsminuten, drei Läufe je Variante.)*

**Abstand halten verdoppelt die Lebensdauer – und ändert am K/D nichts.** Die
Einzelwerte überlappen vollständig. Die Bot-Steuerung ist also nicht die
Ursache. Sie ist nicht einmal ein Faktor.

---

## Die eigentliche Ursache: Impact hat auf Distanz nichts anzubieten

Stufe-38-Klassen auf Level 45, ohne Upgrades:

| Familie | Leben | Tempo | Projektil-DPS |
|---|---|---|---|
| **Impact** | **213** | 273 | **16,0** |
| Rapid | 109 | 274 | 119,3 |
| Precision | 89 | 241 | 76,2 |
| Control | 137 | 239 | 0,0 (Drohnen) |

Impact bringt das **doppelte Leben** und ein **Siebtel** der Projektil-Feuerkraft
einer Rapid-Klasse mit. Der gesamte Schaden der Familie hängt am Körperkontakt.
Und der findet nicht statt:

**42 Kontakt-Ticks in 36 Simulationsminuten**, über alle Impact-Bots zusammen.
Kontaktschaden wird **je Tick** angewandt, solange sich zwei Spieler überlappen –
42 Ticks sind also gut **eine Sekunde Kontakt in 36 Minuten**.

Der Grund steht in `resolvePlayerCollisions`: Bei jeder Überlappung werden beide
Spieler um die halbe Überlappung **auseinandergeschoben**, bevor der Schaden
fällt. Kontakt hält nur, wer in jedem Tick härter nachdrückt, als die Auflösung
schiebt. Ein Rammer muss also nicht treffen, sondern **drücken** – und das ist
etwas anderes, als die Bot-Steuerung kann.

### Und die Wucht kommt fast nie zum Tragen

**71 % der Kontakte trafen Anfängergeschützte** (Level unter 8), gegen die die
Wucht per Bauart gar nicht wirkt. Von den 42 Kontakt-Ticks bleiben damit rund
zwölf, in denen die Signature der Familie überhaupt etwas tun konnte.

Das ist die unbequeme Schlussfolgerung zu meinem eigenen Paket 11: **Die Wucht
ist in der Simulation nahezu wirkungslos – nicht weil sie zu schwach ist,
sondern weil die Gelegenheit fehlt.** An ihren Zahlen zu drehen, würde nichts
ändern. Die Messung aus Paket 18 sagt dasselbe von der anderen Seite: Impact
war die einzige Familie, deren K/D sich durch das Einschalten der Signatures
nicht bewegt hat (0,23 → 0,21).

---

## Was daraus folgt – drei Wege, keiner davon gebaut

1. **Am Kontakt ansetzen.** Die Auseinanderschiebung in
   `resolvePlayerCollisions` ist symmetrisch: Ein 250-kg-Juggernaut wird von
   einem Sniper genauso weggeschoben wie umgekehrt. Eine massenabhängige
   Auflösung (schwerere Klasse weicht weniger) würde Kontakt für Impact
   überhaupt erst haltbar machen. **Das ist ein Eingriff in die
   Bewegungsintegration** – genau die Stelle, die der Client für die
   Vorhersage identisch nachbauen muss. Nicht nebenbei, und nicht ohne 03.
2. **Impact eine zweite Schadensquelle geben**, die keinen Kontakt braucht.
   Das wäre neues Klassendesign, kein Balancing.
3. **Akzeptieren, dass Impact eine Menschen-Klasse ist.** Möglich – ein Mensch
   drückt gezielt nach. Dann darf die Familie in Bot-Messungen schlecht
   dastehen, und wir brauchen Sams Urteil statt einer Zahl.

**Meine Empfehlung: erst (3) prüfen, dann (1).** Wenn Sam mit einem Rammer
fünf Minuten spielt und Kontakt halten kann, ist die Bot-Zahl ein
Messartefakt und die Familie in Ordnung. Kann er es nicht, ist die
Auseinanderschiebung die Ursache, und dann lohnt der Eingriff.

Was ich **nicht** empfehle: an den Wucht-Zahlen zu drehen. Sie sind nicht das
Problem, und eine Erhöhung würde die seltenen Kontakte gefährlich machen,
statt die Familie spielbar.

---

## Von 01 gebraucht

1. **Fünf Minuten Rammer von Sam** – die Frage, die keine Messung beantwortet:
   Kann ein Mensch den Kontakt halten? Alles Weitere hängt daran.
2. **Wenn nein: Freigabe für einen Blick auf `resolvePlayerCollisions`.** Der
   Eingriff berührt die Bewegungsintegration und damit 03s Vorhersage – das
   entscheidest du, nicht ich.
3. **Kein Nachschärfen der Wucht.** Die Signature ist nicht zu schwach, sie
   kommt nicht zum Zug.

## Abweichungen

Kein Auftrag, kein Code – das hier ist die in Paket 18 angebotene Analyse, und
sie endet bewusst vor jeder Änderung. Die Zahlen stammen aus derselben
headless Bot-Arena wie in Paket 18, mit demselben Vorbehalt: **Es sind Bots.**
Der Vorbehalt wiegt hier schwerer als sonst – die ganze Frage lautet ja, ob ein
Mensch etwas kann, was ein Bot nicht kann.
