# 15 – Befund 2: Der Startscreen wird eine Navigation

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `07155a8` · **Status: OFFEN – wartet auf Merge**

Die Startseite trägt jetzt Logo, Namensfeld und ARENA BETRETEN – und darunter
vier ruhige Zeilen, die woanders hinführen. Profil, Achievements, Bestenliste
und Einstellungen sind eigene Seiten geworden. Dazu Sams offene Vollbild-Frage,
siehe ganz unten.

## Was auf der Startseite steht

Nachgemessen, nicht behauptet: **Auf der Startseite gibt es genau zwei
Bedienelemente** – das Namensfeld und den Play-Knopf. Alles andere sind
Navigationszeilen ohne eigenen Inhalt.

| | vorher | nachher |
|---|---|---|
| Bedienelemente auf der Startseite | Name, Play, Login, Profil-Aufklapper, Bestenlisten-Aufklapper, Sound, Grafik, Vollbild, Sichtfeld, Vorhersage, Loadout ×2 | **Name, Play** |
| Klicks bis ins Spiel | Name tippen, Play | **Name tippen, Play** |
| Startseite scrollt | bei aufgeklapptem Loadout ja | **nein** (auch 390×844) |

Der Weg ins Spiel ist damit unverändert – das war Auflage 1.

## Die vier Seiten

**Profil** – Login, Anzeigename, Mitglied seit, Lieblingsklasse, sechs
Bestwerte. **Achievements** – die vollständige Galerie mit der Bedingung unter
jedem Namen. **Bestenliste** – die Top-Läufe ohne Aufklapper und ohne
Höhenbegrenzung. **Einstellungen** – Sound, Grafik, Vollbild, Sichtfeld,
Vorhersage und das Core-Loadout.

Jede Seite hat denselben Aufbau: Zurück-Weg, Überschrift, Inhalt. Genau **eine
Ebene tief** – von überall geht es zum Start zurück, nirgends tiefer. Ein
Startscreen mit Verlaufsstapel wäre ein zweites Problem, kein gelöstes erstes.
Zurück geht auch mit **Escape**, und der Fokus wandert beim Seitenwechsel auf
den Zurück-Knopf, damit die Tastatur nicht auf einem unsichtbaren Element
hängen bleibt.

### Der Gastfall (Auflage 3)

Es gibt **keine ausgegrauten oder fehlenden Einträge** – alle vier Wege stehen
immer da. Was fehlt, erklärt die jeweilige Seite selbst:

- **Profil ohne Login:** „Melde dich an, um Bestwerte, Spielzeit und
  freigeschaltete Achievements zu behalten. Spielen geht auch ohne."
- **Profil ohne eingerichtete Anmeldung:** „Auf diesem Server ist keine
  Anmeldung eingerichtet. Du spielst als Gast – Läufe werden nicht
  gespeichert." Vorher stand dort ein Hinweis auf eine Anmeldung, die es
  überhaupt nicht gab.
- **Achievements ohne Login:** die **vollständige Galerie in gesperrtem
  Zustand**, mit der Bedingung unter jedem Namen. Der Katalog liegt im Client;
  zu sehen, was es zu holen gibt, ist für einen Gast wertvoller als eine leere
  Seite – und es ist der beste Grund, sich anzumelden, den die Seite hat.
- **Bestenliste ohne Persistenz:** „Die Bestenliste ist auf diesem Server noch
  nicht eingerichtet." Vorher blieb das Panel schlicht unsichtbar; auf einer
  eigenen Seite wäre das eine kaputte Seite.

### Die Schalter haben Platz bekommen (Auflage 4)

Grafikstufe, Vollbild, Sichtfeld und Vorhersage standen als nackte Wörter in
einem Aufklapper. Jetzt trägt jede Einstellung einen Satz, der sagt, was sie
tut – bei „Sichtfeld" zum Beispiel, dass „Bildschirmfüllend" genauso viel Arena
zeigt, nur breiter und flacher. Das war im alten Aufklapper nicht unterzubringen
und ist der Grund, warum die Zeile dort auch fehl am Platz war.

### Design

Ausschließlich über die Theme-Variablen (Auflage 2) – kein einziger Festwert in
den neuen Flächen. Die Farbwelt bleibt unverändert; der eine helle Punkt des
Screens ist weiterhin ARENA BETRETEN. Es ist ein Navigationsumbau, kein
Grundlook-Wechsel.

## Nachgewiesen

Chromium, Startseite und alle vier Unterseiten:

| Seite | öffnet | Start verborgen | Fokus | Escape zurück | Inhalt |
|---|---|---|---|---|---|
| Profil | ja | ja | Zurück-Knopf | ja | Gasttext |
| Achievements | ja | ja | Zurück-Knopf | ja | 7 Einträge, 0/7 |
| Bestenliste | ja | ja | Zurück-Knopf | ja | Hinweistext |
| Einstellungen | ja | ja | Zurück-Knopf | ja | 5 Blöcke, 594 px, scrollt intern |

Keine Konsolenfehler, kein `pageerror`.

Auf schmalen Geräten:

| Gerät | Startseite scrollt | Play sichtbar | Seitenkopf sichtbar | Inhalt scrollt |
|---|---|---|---|---|
| 390×844 (Handy hoch) | **nein** | ja | ja | im Körper |
| 844×390 (Handy quer) | **nein** | ja | ja | im Körper |
| 820×1180 (Tablet) | **nein** | ja | ja | im Körper |

Der Rahmen bleibt stehen, gescrollt wird nur der Inhalt – der Zurück-Weg ist
damit immer erreichbar.

## Sams Vollbild-Frage: der Frame kann nicht mehr entstehen

Du hattest vermutet, Sam sehe einen kurzen Zwischenzustand, den meine Messung
nach 120 ms nicht mehr findet. **Ich konnte ihn nicht nachweisen** – aber nicht,
weil er nicht existiert, sondern weil der Testbrowser (Software-GL) in dem
Fenster nur **4 bis 9 Bilder** zeichnet. Ein Ein-Frame-Zustand ist darin nicht
abtastbar. Das ehrlich gesagt: Die Messung schließt ihn nicht aus.

Also habe ich ihn stattdessen **unmöglich gemacht**. Bisher hing das
Nachziehen der Größe allein an Ereignissen (`resize`, `fullscreenchange`,
`visualViewport`) plus einem Nachschlag nach 350 ms. Kommen die in der falschen
Reihenfolge oder erst nach dem nächsten Bild, entsteht genau ein Frame mit
alter Geometrie: Das Fenster ist schon breit, die Maske noch schmal.

Jetzt prüft der Renderer **vor jedem Zeichnen**, ob die Zeichenfläche noch zum
sichtbaren Bereich passt. Damit ist die Reihenfolge der Ereignisse egal – es
braucht gar keins mehr. **Kein Bild wird mit veralteten Maßen gezeichnet, weil
jedes Bild vorher nachsieht.** Das ist eine Eigenschaft des Codes, keine
Messung, und deshalb belastbarer als eine Stichprobe bei 5 fps. Kosten: zwei
Zahlenvergleiche je Frame, gearbeitet wird nur bei echter Änderung.

## Geänderte Dateien

**Neu:** `start-nav.ts(+test)`
**Geändert:** `ui.ts`, `start.css`, `controls.css`, `profile.css`,
`profile-panel.ts`, `start-leaderboard.ts`, `main.ts`, `renderer.ts`

`packages/shared` und `apps/server` unangetastet.

## Tests

`npm run check` grün: 51 Dateien, 693 Tests (7 neu), Build in Ordnung.

## Von 01 gebraucht

1. **Merge.**
2. **Screenshots für Sam.** Startseite, Achievements (Gastfall) und
   Einstellungen gehen in den Chat. Falls er etwas anders will, ist es CSS –
   die Struktur trägt jede Anordnung.
3. **Unverändert offen:** Sichtfeld-Standard („Fest 16:9" oder
   „Bildschirmfüllend") und Vorhersage-Standard – beide stehen jetzt in den
   Einstellungen mit einer Erklärung darunter, was das Beurteilen einfacher
   machen sollte.
4. **Unverändert offen für 04:** `tier` im Perf-Bericht.

## Abweichungen und Grenzen

1. **Die Startseite hat vier Navigationszeilen statt gar nichts.** Der Auftrag
   sagt „Start bleibt Logo, Name und ARENA BETRETEN – nichts sonst". Ohne einen
   sichtbaren Weg wären die vier Seiten aber nicht erreichbar. Ich habe die
   Zeilen so leise wie möglich gehalten (gedeckte Fläche, kein Akzent, kleiner
   Schriftgrad) und sie **unter** den Play-Knopf gelegt.
2. **Kein Verlauf und keine URL.** Die Seiten stehen nicht in der Adresszeile,
   und der Zurück-Knopf des Browsers wirkt nicht auf sie. Für einen Startscreen
   mit einer Ebene halte ich das für richtig; ein `history.pushState` würde den
   Browser-Zurück-Knopf mit dem Spiel-Start verheddern.
3. **Die Achievements-Galerie kennt nur den Katalog, nicht den Fortschritt
   ohne Login.** Ein Gast sieht alle sieben als offen – auch wenn er sie in
   dieser Sitzung erfüllt hätte. Das käme erst mit einer lokalen Buchführung,
   die es nicht gibt und die ich für einen Gastzustand auch nicht bauen würde.
4. **Der Vollbild-Frame ist nicht gemessen, sondern konstruktiv
   ausgeschlossen** – siehe oben. Wenn Sam ihn weiterhin sieht, liegt es an
   etwas anderem, und ich brauche von ihm Fenstergröße und Weg (F11 oder
   Knopf).
5. **Der Startscreen-Hintergrund und die Vignette sind unverändert.** Sie
   gehören zum Grundlook, und der ändert sich nur nach Sams Ja.
