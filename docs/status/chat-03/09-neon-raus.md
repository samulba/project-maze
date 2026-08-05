# 09 – Design-Beruhigung II: „Neon raus"

**Branch:** `claude/project-maze-neon-raus-o2q3n4` · **Basis:** `origin/main` @ `a36a0dd` · **Status: OFFEN – wartet auf Merge**

Zweite Stufe nach „Ruhe & Gewicht", auf Sams Live-Test: ruhiger, cleaner,
minimalistischer – und ausdrücklich auch der Startscreen.

## 1. Startscreen entschärft

Der Hauptgrund für den „Neon City"-Eindruck waren **zwei violette
Radial-Verläufe über dem ganzen Screen** plus ein Halo hinter dem Logo. Beides
ist ersatzlos weg.

| Element | vorher | jetzt |
|---|---|---|
| Hintergrund | 2 Radial-Verläufe (Brand 15 % / 7 %) + Verlauf | eine dunkle Fläche |
| Logo | Halo (Brand 30 %, 12 px Weichzeichner) + violetter Rand | nur Tiefenschatten + Haarlinie |
| Wortmarke „RS" | Farbverlauf Brand-soft → Brand | eine Farbe |
| ARENA BETRETEN | Verlauf + Schein (Brand 24 %, 32 px) + Innenglanz | ruhige Fläche, Hover über Helligkeit |
| Fokusring Namensfeld | 4 px Brand 22 % | 3 px Brand 14 % (bleibt – hat eine Funktion) |
| Ladering | Kegelverlauf aus zwei Akzentfarben | eine Farbe, gedeckter |

Der **Ladering bleibt**, obwohl er pulst: Er ist die einzige Rückmeldung,
solange PixiJS nachlädt. Ein Ladezustand ohne Anzeige wäre schlechter als ein
ruhiger Ring.

Der driftende Hintergrund zieht mit: Seine Formen nutzen jetzt dieselbe
gedeckte Palette wie das Spielfeld, der Marken-Akzent ist dort raus.

## 2. Glow-Inventur

Jede `box-shadow`/`text-shadow` im Client durchgegangen. Entfernt:

- Achievement-Popup: goldener Schein (22 px)
- Onboarding-Karte: Akzent-Schein (30 px)
- Verbindungspunkt im Eyebrow: Halo-Ring (5 px)
- Aim-Stick im Zug: Akzent-Schein (18 px)
- Stick-Ringe: Innenleuchten (`inset 0 0 40px`)
- Startknopf und Respawn-Knopf: Verlauf + farbiger Schein

**Übrig geblieben sind 23 Schatten – und keiner davon leuchtet:**
Tiefenschatten in Schwarz (`0 Ypx Npx`), Haarlinien (`0 0 0 1px`) und
Fokusringe (`0 0 0 3–4px`). Fokusringe bleiben bewusst: Sie beantworten „wo
stehe ich?" und sind keine Deko.

**Nicht angefasst:** der Block `:root[data-theme=neon] …` in `style.css`. Er
gilt nur für das Theme „Neon", und das ist nicht erreichbar, solange
`DEFAULT_THEME = midnight` gilt und es keine Auswahl gibt. Wenn das Theme ganz
verschwinden soll, ist das eine eigene Entscheidung – dann fällt auch
`themes.ts` an.

## 3. Farbdisziplin im Spielfeld

Eine Stufe weiter als in „Ruhe & Gewicht". Gesättigt bleiben genau vier Dinge:
eigener Tank, Gegner, Drohnen (eigene Mechanik) und Geschosse (muss man sehen).

| | vorher | jetzt |
|---|---|---|
| Quadrat | `0x515d9c` | `0x565f85` |
| Dreieck | `0xa8834a` | `0x877a60` |
| Fünfeck | `0x93588a` | `0x7d6379` |
| Wand / Kante | `0x1b2130` / `0x2f3749` | `0x191d27` / `0x2b313d` |
| Raster / Rand | `0x121724` / `0x2c3347` | `0x11141c` / `0x2a2f3c` |
| Drohne | `0x5f9e94` | `0x5c8b84` |
| weißer Umriss auf Formen | Alpha .22 | Alpha .12 |

Die drei Formenarten bleiben unterscheidbar – Geometrie trägt ohnehin mehr als
Farbe, und ihre Belohnung hängt an der Form, nicht am Farbton. Zum Vergleich
liegt ein Screenshot bei, in dem alle drei nebeneinander stehen (per
untergeschobenem Snapshot erzwungen, weil sie sonst selten zusammen im Bild
sind).

## 4. Death-Screen und Panels

Der Respawn-Knopf ist wie der Startknopf eine ruhige Fläche mit klarer
Aufhellung beim Hover statt eines Verlaufs. „ZUM STARTSCREEN" war schon flach.

## Geänderte Dateien

`start.css`, `style.css`, `boot.css`, `achievements.css`, `onboarding.css`,
`mobile.css`, `start-backdrop.ts`, `renderer.ts`

## Tests

`npm run check` grün: 36 Dateien, 449 Tests, Build in Ordnung.
Vorher/Nachher-Screenshots (Startscreen, HUD, Death-Screen, je Desktop und
Handy) liegen beim Bericht an Sam.

## Von 01 gebraucht

Merge. Danach Sams Urteil – „ruhig genug?" ist keine Zahl, die ich messen kann.

## Abweichungen und Grenzen

- **Der Startknopf bleibt voll im Markenviolett.** „EIN Akzent" heißt für mich:
  genau eine Fläche darf Farbe tragen, und das ist die Hauptaktion. Wenn auch
  die zu laut ist, ist die nächste Stufe ein dunkleres Violett – eine
  Entscheidung, keine Ableitung.
- **Der Körper-Kickback bleibt bei 0**, wie von 01 gesetzt. Nicht angefasst.
- **Gemessen ist nur, was zählbar ist** (Anzahl und Art der Schatten,
  Farbwerte). Ob das Gesamtbild jetzt „clean" wirkt, entscheidet der Blick auf
  echtem Gerät.
