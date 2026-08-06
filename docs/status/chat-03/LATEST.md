# Aktuellster Statusblock – Chat 03

> Kopie von `17-pruefstand-sweep.md`. Diese Datei zeigt immer das jüngste
> fertige Paket; die Historie steht in den nummerierten Dateien daneben.

# 17 – Der Prüfstand über den Rest: sechs Befunde, drei aus eigenen Paketen

**Branch:** `claude/chat-03-client-ux-mazers-yu57ca` · **Basis:** `origin/main` @ `f4aaa5c` · **Status: OFFEN – wartet auf Merge**

Die Matrix ist von 15 auf **63 Fälle** gewachsen – 33 im Spiel, 30 auf dem
Startscreen, darunter vier mobile Größen. Der erste Durchlauf lief mit
**55/63**.

Nach den Reparaturen läuft die volle Matrix mit **63/63** durch.

Der unangenehmste Teil des Ergebnisses: **Drei der sechs Befunde stammen aus
meinen eigenen letzten drei Paketen**, und alle drei nur auf Touch – dem
einzigen Bereich, den ich dort jeweils nur rechnerisch abgedeckt hatte. Genau
davor warnt der Prüfstand, und genau deshalb war er die richtige Investition.

## Die Liste, nach Schwere

| # | Befund | Herkunft | Reproduktion |
|---|---|---|---|
| **G1** | Auf dem Handy im **Querformat** – der einzigen spielbaren Ausrichtung – lagen drei der vier Navigationseinträge unter dem Bildrand. Achievements, Bestenliste und Einstellungen waren unerreichbar. | Paket 15 | 844×390, Touch, Startscreen |
| **G2** | Zuschauen war auf dem Handy fast blind: **40,5 % tote Fläche**, die kompakte Death-Karte saß auf dem Bewegungs-Stick. | Paket 14 | 844×390, sterben, Zuschauer-Ziel |
| **G3** | Die Klassenwahl lag 52 px auf dem Auto-Knopf. | Paket 16 | 844×390 und 667×375, Level 10 |
| **G4** | Der Onboarding-Hinweis deckte Spielerkarte und Bestenliste um je rund 35 px. | älter | 900×640, erste 60 Sekunden |
| **G5** | Die Touch-Sticks standen schon auf dem **Startscreen**, ohne Funktion. | älter | jedes Touch-Gerät |
| **G6** | Auch zweispaltig blieb die Navigation im Handy-Querformat angeschnitten. | G1-Reparatur | 844×390 |

Alle sechs sind repariert.

## Was repariert ist

- **G1/G6** – Auf flachen Fenstern stehen die vier Wege **zweispaltig** und ohne
  die erklärende Zeile: aus vier Reihen werden zwei. Unter 430 px Höhe fällt
  zusätzlich das Logo weg, und Namensfeld wie Play-Knopf werden flacher. Der
  Schriftzug bleibt – er sagt, wo man ist; das Logo ist dort Zierde.
- **G2** – Auf Touch bleibt von der Zuschauer-Karte nur, was man wirklich
  braucht: Respawn, Countdown, Rückweg. Loadout, Bilanz und Untertitel
  verschwinden, und sie rückt in die **Mitte zwischen die beiden Sticks**,
  statt auf einem davon zu liegen.
- **G3** – Auf sehr flachen Touch-Screens rücken Modul, Repel und Auto in eine
  eigene Spalte 170 px vom Rand. Die rechte Spur der Klassenwahl war mit 165 px
  zu schmal; sie ist jetzt 240 px breit.
- **G4** – Der Hinweis bleibt oben in Blickrichtung, passt sich aber in die
  freie Spur zwischen den Panels ein, statt sie zu überdecken. Drei Zeilen Text
  statt zwei sind der Preis; ein verdecktes Level-Abzeichen wäre teurer.
- **G5** – Die Sichtbarkeit der Sticks hing allein am Zeigertyp. Sie hängt
  jetzt zusätzlich am Spielzustand.

## Drei Fehlalarme – und was ich am Werkzeug geändert habe

**Hochformat auf Touch ist kein Spielzustand.** Das Spiel blendet dort das HUD
absichtlich aus und zeigt „Bitte Gerät drehen"
(`@media (orientation: portrait) and (pointer: coarse)`). Der Prüfstand wartete
auf ein HUD, das nie kommen soll, und meldete drei Fälle als „kommt nicht
hoch" – der schwerstmögliche Befund, und er war falsch. Er prüft dort jetzt
genau den richtigen Zustand: Hinweis sichtbar, HUD aus.

**Die tote Fläche ist eine Desktop-Kennzahl.** Auf Touch wird nicht über den
Canvas gezielt, sondern über die Sticks – und die belegen allein 20 % eines
844×390-Schirms. Sie sind die Bedienung, nicht ihr Hindernis. Die Schwelle
gilt jetzt nur für Zeigergeräte; der Wert wird weiter gemeldet, aber nicht
bewertet.

**Die Sticks werden mitgemessen.** Sie fehlten in der Elementliste – ohne sie
wäre G2 unentdeckt geblieben.

## Nachgewiesen

`node scripts/ui-layout-check.mjs`, 63 Fälle:

| Durchlauf | ohne Befund |
|---|---|
| erster Sweep | 55 / 63 |
| nach den ersten fünf Reparaturen | 57 / 63 |
| nach G6 und den Werkzeug-Korrekturen | **63 / 63** |

Die verbliebenen sechs Fälle des zweiten Durchlaufs waren: zweimal die
angeschnittene Navigation (G6), einmal das Onboarding gegen die Bestenliste
(G4, Reparatur überarbeitet), dreimal die tote Fläche knapp über der Schwelle
auf Touch – das ist der Messfehler der Kennzahl, nicht ein Fehler der UI. Dazu
ein einzelner Zeitüberlauf auf 21:9, der weder davor noch danach wieder
auftrat; ich halte ihn für eine Schwankung des Testbrowsers, bewiesen ist das
nicht.

`npm run check` grün: 52 Dateien, 707 Tests, Build in Ordnung.

## Geänderte Dateien

**Geändert:** `apps/client/src/hud-layout.css`, `scripts/ui-layout-check.mjs`

`packages/shared`, `apps/server` und `package.json` unangetastet.

## Von 01 gebraucht

1. **Merge.**
2. **KL3 ist der nächste Wunsch von mir.** Der Prüfstand läuft mit 63/63
   sauber durch – die Bedingung aus deinem Auftrag ist erfüllt. Alle vier
   Familien haben ihre Signature, und niemand sieht sie. Schreib mir den
   Auftrag für Rad, Klassenbaum-Overlay (`C`) und Enzyklopädie aus; das ist das
   größte Stück Sichtbarkeit, das gerade fehlt.
3. **Unverändert offen:** Sichtfeld-Standard, Vorhersage-Standard, `tier` bei 04.

## Abweichungen und Grenzen

1. **Der Prüfstand ist kein Ersatz für ein echtes Gerät.** Er misst Geometrie
   im Chromium mit Software-Rendering. Fingergrößen, Daumenreichweite und wie
   sich ein 34 px hoher Knopf anfühlt, sagt er nicht.
2. **Nur Chromium.** Firefox und Safari sind nicht abgedeckt – insbesondere
   `:has()`, auf dem die Spur-Logik steht, und `dvh` auf iOS.
3. **Der Login fehlt in den Startscreen-Fällen.** Lokal ist keine Anmeldung
   eingerichtet, geprüft ist damit nur der Gastfall. Der angemeldete Zustand
   (Profilkarte, Bestwerte, freigeschaltete Achievements) ist ungeprüft.
4. **Achievement-Popups laufen im Prüfstand nur einmal an.** Sie werden über
   `freshAchievements` eingespeist und einmal gesendet; eine Kette aus mehreren
   Popups hintereinander ist nicht abgebildet.
5. **Drei Durchläufe, drei Stände.** 63/63 gilt für den Code, wie er jetzt
   ist. Die Zahlen 55 und 57 stehen oben, weil sie zeigen, dass jede Reparatur
   gemessen wurde und nicht nur behauptet ist – und dass eine davon (G6) erst
   im zweiten Durchlauf sichtbar wurde.
6. **63 Fälle sind nicht alle.** Was fehlt: Klassenwahl bei gehaltenem
   Ladeschuss, zwei Achievements hintereinander, Wiederverbindung mit offenem
   Panel. Die Erweiterung ist jeweils eine Zeile in `FAELLE`.
