# 08 – R3: Mobile-Pass

**Branch:** `claude/project-maze-mobile-r3-o2q3n4` · **Basis:** `origin/main` @ `f4c76e8` · **Status: OFFEN – wartet auf Merge**

Das Handy-Layout nach der Spezifikation in `docs/MASTERPLAN.md` („R3 im
Detail"). Der Viewport-Bug war vorher schon von 01 behoben – dieses Paket ist
das Redesign darüber.

## Was drin ist

**1. Statusleiste statt Panel.** Level, HP-Balken, XP-Strich. Sonst nichts:
Name, Klasse, K/D und Score stehen im Death-Screen und verschwinden aus dem
Dauer-HUD. Gemessen 40–44 px hoch (Vorgabe: max. 44) und 256–283 px breit.
Das Level steht als „L12" in einer Zeile statt „LVL / 12" in zweien.

**2. Aktions-Stapel neben dem Aim-Stick.** Modul, Repel und Auto sind jetzt
gleich große Kreise (58 px, auf flachen Schirmen 52 px) in einer Spalte, von
unten nach oben nach Häufigkeit sortiert: Modul ständig, Repel situativ, Auto
einmal pro Runde. Vorher hatte jeder der drei eine eigene Größe und eine
eigene Ecke.

**3. EIN Meldungs-Slot oben Mitte.** Ereignis-Banner, Kopfgeld,
Achievement-Popup und Toasts teilen sich eine Stelle unter der Statusleiste.
Sichtbar ist immer nur die wichtigste Meldung, und zwar in dieser Reihenfolge:
Toast → Achievement → Kopfgeld → Ereignis. Was von selbst wieder verschwindet,
geht vor – so blockiert ein minutenlanges Ereignis-Banner keine Systemmeldung.

**4. Upgrades als Bottom-Sheet.** Zugang über eine pulsierende Punkte-Badge an
der Statusleiste; das Sheet fährt von unten auf, vier Spalten, Schließen-Knopf
in der Kopfzeile. Der letzte verteilte Punkt schließt es automatisch – sonst
bliebe eine leere Fläche über den Sticks stehen. Das Spiel pausiert nie.

**5. Auf Abruf statt dauernd.** Killfeed auf Touch ganz raus (Kills stehen im
Meldungs-Slot), Minimap nur nach Tipp auf die Statusleiste – dann oben rechts,
wo seit dem Wegfall der Bestenliste Platz ist, und nicht im Daumenbereich.

**6. Sticks größer:** Trefferfläche 168 → 184 px, Ring 122 → 132 px, Knopf
48 → 60 px.

**Verankerung:** Oben hängt das HUD am Sichtfeld (`--view-y` aus
`resizeViewport()`), unten am Schirmrand. Begründung: Ein Tablet hat oben und
unten schwarze Letterbox-Balken – die Statusleiste soll am Spielfeld kleben,
die Daumen liegen aber am Gerät, nicht am Spielfeld. Auf dem Tablet (1180×820,
78 px Balken) beginnt die Leiste dadurch bei y = 88, der Aim-Stick bleibt
14 px über dem Schirmboden.

## Pflicht-Testmatrix

Chromium mit Touch-Emulation, echtem Spiel gegen den lokalen Server. „Null
überlappende Elemente" ist automatisch geprüft: alle sichtbaren HUD-Elemente
werden paarweise geschnitten, jede Überschneidung > 2 px wird gemeldet.

| Format | Sichtfeld-Versatz | Statusleiste | Überlappungen | Canvas = Schirm |
|---|---|---|---|---|
| iPhone quer 844×390 | 75 px seitlich | 263×40 | **keine** | ja |
| iPhone quer **mit Leisten** 844×320 | 138 px seitlich | 256×40 | **keine** | ja |
| Android quer 915×412 | 91 px seitlich | 263×40 | **keine** | ja |
| iPhone SE quer 667×375 | 0 (exakt 16:9) | 256×40 | **keine** | ja |
| Tablet quer 1180×820 | 78 px oben/unten | 283×44 | **keine** | ja |
| Desktop 1920×1080 (Regression) | – | Panel wie vorher | **keine** | ja |

- **Rotation im Spiel:** ins Hochformat → Drehen-Hinweis erscheint, HUD auf
  `visibility: hidden`; zurück ins Querformat → Canvas wieder 844×390, keine
  Überlappungen.
- **Rückkehr aus dem App-Switcher:** `visibilitychange` (hidden → visible) mit
  zwischenzeitlicher Größenänderung 390 → 360 → 390 → Canvas wieder deckend,
  keine Überlappungen.
- **Daumen-Erreichbarkeit:** Abstand der Knopfmitte zur unteren rechten Ecke –
  Modul 211 px, Repel 232 px, Auto 265 px (Tablet: 246/269/305). Alle drei
  liegen im Sweep des rechten Daumens, ohne den Aim-Stick zu berühren
  (198 px Abstand zum Schirmrand gegenüber 184 px Stickbreite).
- **Meldungs-Slot:** alle vier Kombinationen durchgeschaltet und die
  berechnete `display`-Eigenschaft gelesen – nur Ereignis sichtbar; mit
  Kopfgeld verschwindet das Ereignis; mit Achievement verschwindet das
  Kopfgeld; mit Toast verschwinden alle drei. Der Toast sitzt exakt im Slot
  (y = 62 auf 844×390).
- **Bottom-Sheet** mit echten Upgrade-Punkten (Dauerfeuer bis Level-Up):
  zugeklappt steht die Oberkante bei y = 392 auf einem 390 px hohen Schirm,
  also vollständig außerhalb. Aufgeklappt 844×179 ab y = 211. Kauf zählt die
  Badge von 2 auf 1 herunter, das Sheet bleibt für den zweiten Punkt offen,
  der Schließen-Knopf wirkt.

## Geänderte Dateien

`mobile.css` (neu geschrieben), `style.css`, `onboarding.css`, `ui.ts`

## Tests

`npm run check` grün: 35 Dateien, 414 Tests, Build in Ordnung.

## Von 01 gebraucht

Merge. Danach ist Sams Live-Test auf dem iPhone der eigentliche Prüfstein –
siehe „Grenzen" unten.

## Abweichungen und Grenzen

- **Der Stapel steht neben dem Aim-Stick, nicht darüber.** Die Spezifikation
  sagt „rechts über dem Aim-Stick". Drei 58-px-Knöpfe mit Abstand über einem
  184-px-Stick brauchen 388 px Höhe – mehr, als ein Handy im Querformat
  überhaupt hat (390 px). Die Spalte sitzt deshalb unmittelbar links neben dem
  Stick, in derselben Daumenzone. Zahlen oben.
- **Das offene Sheet verdeckt die Sticks.** Es ist 179 px hoch auf 390 px
  Schirm, die obere Hälfte des Spielfelds bleibt sichtbar. Das Spiel läuft
  weiter (kein Pause), aber gesteuert wird währenddessen nicht. Alternative
  wäre gewesen, Taps durchfallen zu lassen – dann fährt man beim Antippen
  eines Upgrades los. Ein Tipp auf ✕ schließt, der letzte Punkt schließt
  von selbst.
- **Kein echtes Safari und keine echte Notch.** Getestet ist Chromium mit
  Touch-Emulation; „mit eingeblendeten Leisten" ist als Geometrie nachgestellt
  (844×320 statt 844×390), weil 01s `visualViewport`-Kopplung genau diese
  Höhe verarbeitet. `env(safe-area-inset-*)` steht überall im Code, lässt sich
  hier aber nicht auf echte Werte bringen – die Ränder an einer echten Notch
  muss Sam beurteilen.
- **Die Minimap ist auf Touch standardmäßig aus.** Die Spezifikation nennt sie
  „optional per Tipp einblendbar" – der Tipp liegt auf der Statusleiste. Wer
  ihn nicht kennt, findet ihn nicht; ein Hinweis dafür wäre ein eigener
  Onboarding-Schritt und ist hier bewusst nicht dazugekommen.
