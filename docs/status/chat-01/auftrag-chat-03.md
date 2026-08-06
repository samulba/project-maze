# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (4. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md` – Rolle, Regeln,
> Design-Richtung und die Fallen, die uns schon Zeit gekostet haben. Danach
> diese Datei.

Paket 14 ist gemerged (686 Tests grün). **Du hast mich korrigiert, und das war
richtig.** Ich hatte behauptet, das HUD hänge am Fenster statt am Spielfeld und
die Viewport-Härtung halte nicht – geraten, aus einem einzelnen Screenshot. Du
hast über 24 Übergänge gemessen und gezeigt, dass beides nicht stimmt: Die
Härtung hält, das HUD sitzt richtig, und die Ränder sind schlicht das feste
16:9 auf einem breiten Schirm.

Genauso wertvoll: Statt den Nicht-Fehler zu „reparieren", hast du die
eigentliche Frage beantwortet und einen zweiten Sichtfeld-Modus gebaut, der
die **Fläche** konstant hält statt der Form – bei 16:9 auf sechs
Nachkommastellen identisch, auf 21:9 bildschirmfüllend, geklemmt aus der
Sichtgrenze des Servers. Dass die Geometrie jetzt als prüfbare Funktion in
`viewport.ts` liegt und die zweite Kopie derselben Rechnung verschwunden ist,
war überfällig.

Der geschrumpfte Death-Screen beim Zuschauen (22 % → 6,6 % der Bildfläche, ohne
Abdunklung) trifft Sams Befund genau.

**Sams offene Frage bleibt trotzdem:** Er berichtet Ränder *beim Wechsel* des
Vollbildmodus. Deine Messung 120 ms nach dem Umschalten sagt, dass danach alles
stimmt. Möglich, dass er einen kurzen Zwischenzustand sieht, den eine Messung
nach 120 ms nicht mehr findet – ein Frame mit alter Auflösung. Wenn dir dazu
etwas einfällt, nimm es mit; wenn nicht, lassen wir es liegen, bis er es mit
dem neuen Modus erneut beurteilt.

## Das Paket: Befund 2 – der Startscreen wird eine Navigation

Den hattest du geschnitten, mit Begründung – das war in Ordnung, aber jetzt ist
er dran. Es ist der letzte von Sams fünf Live-Befunden, der noch offen ist.

Sam: *„der HOMESCREEN – dass man da direkt alle Achievements + Leaderboard
sieht, ist komplett kake. Die sollten alle geile cleane Unterseiten bekommen,
genauso wie Profil, Einstellungen etc. Nicht alles auf eine Seite
reinballern."*

Der Startscreen ist über K2, A4 und die Achievements-Galerie zu einer langen
Seite gewachsen. Start bleibt **Logo, Name und ARENA BETRETEN** – nichts sonst.
Alles andere wird eine eigene, ruhige Unterseite: Profil · Achievements ·
Bestenliste · Einstellungen.

Das ist dein Revier und deine Handschrift, ich gebe dir keine Kästchen vor.
Vier Auflagen:

1. **Der Weg ins Spiel wird nicht länger als heute.** Name tippen, Knopf
   drücken – das darf keinen Klick mehr kosten.
2. **Alles über die Theme-Variablen.** Der Grundlook ist dunkel und wurde am
   06.08. zurückgebaut; deine bisherigen Flächen haben das von selbst
   überstanden, weil sie an den Variablen hingen.
3. **Der Gastfall muss gut aussehen**, nicht nur der angemeldete. Ohne Login
   gibt es kein Profil und keine Achievements – die Navigation darf dann nicht
   wie eine kaputte Seite wirken.
4. **Die neuen Schalter finden ihren Platz.** Grafikstufe, Vollbild,
   Sichtfeld-Modus und der Vorhersage-Schalter stecken heute in einem
   Aufklapper. In einer Einstellungs-Unterseite sind sie besser aufgehoben –
   und du hast dann Platz, sie zu erklären.

Wenn du einen Screenshot für Sam brauchst, bevor du dich festlegst: Sag es im
Bericht, ich fahre die Pipeline und lege ihm die Varianten vor. Grundlook
ändern darfst du weiterhin nicht ohne sein Ja – ein Navigationsumbau ist aber
kein Grundlook-Wechsel, solange die Farbwelt bleibt.

Statusbericht wie gehabt nach `docs/status/chat-03/`.
