# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 · Basis: aktueller `origin/main`**

Profil-Tab ist gemerged – die Galerie-Entscheidung (ganzer Katalog statt nur
Freigeschaltetes) und die vier Zustände ohne Fehlertext sind genau richtig.

## R1/R2/R4: Desktop-Fullscreen, Letterbox-Feinschliff, Qualitätsstufen

MASTERPLAN Feld 1, die verbliebenen Punkte (R3 Mobile ist durch):

1. **R1 Fullscreen-Härtung Desktop:** Vollbild rein/raus (F11 UND
   Fullscreen-API), Fenstergrößen-Wechsel, Monitor-Wechsel mit anderem
   devicePixelRatio, Browser-Zoom. Die syncSize-Grundlage liegt im Renderer;
   dein Paket ist der Nachweis über eine Testmatrix wie bei R3 plus Fixes für
   das, was dabei auffällt.
2. **R2 Letterbox & HUD-Skalierung:** Balken auf Ultrawide/4:3 als gestaltete
   Ruhe (Design-Richtung beachten: hell, nicht düster!), HUD-Typo mit clamp()
   auf großen Bildschirmen.
3. **R4 Qualitätsstufen:** hoch/mittel/niedrig (Partikelmenge, Glow-Effekte im
   Canvas, Antialias, Auflösungs-Cap). Auto-Einstufung: Start „mittel", nach
   10 s FPS-Messung (die Infrastruktur aus deinem Perf-Sender kann die Messung
   liefern) hoch- oder runterstufen; manuelle Wahl im Startscreen unter
   Sound & Loadout. `quality` im Perf-Report entsprechend erweitern
   (Renderpfad + Stufe – mit 04 kurz über die Label-Kardinalität abstimmen,
   deren /metrics-Export ist auf 4×4 ausgelegt; Vorschlag im Statusbericht).

## Danach

**N2 Client-Prediction** (docs/CLIENT_PREDICTION.md; `lastProcessedInput ?? -1`)
– das größte verbleibende Feel-Paket. Bei Fragen zur Bewegungsintegration ist
02s Doku maßgeblich, nicht der Code-Augenschein.

## Nachtrag 06.08. – Design-Basis ist jetzt der Diep-Look

Sam hat nach zwei Screenshot-Runden entschieden: **Startbasis = so nah wie
möglich an Diep.io.** 01 hat das umgesetzt (auf main): Standard-Theme hell
(`:root` mit `color-scheme:light`, Arena `0xcdcdcd` + Gitter), Konturen in
abgedunkelter Füllfarbe über den neuen `STYLE`-Block + `darken()` in
`renderer.ts`. Details im MASTERPLAN („Design-Richtung"). Für dich heißt das:

- R2-Letterbox-Balken gegen den HELLEN Grundton gestalten (Außenfarbe ist
  `outside`/`#b7b7b7`), nicht mehr gegen Dunkelblau.
- Neue UI-Flächen immer über die CSS-Variablen (`--surface`, `--text`, …),
  keine hartkodierten Hell-auf-Dunkel-Farben – das Standard-Theme ist jetzt
  light, die Wahl-Themes void/neon/classic bleiben dunkel.
- Grundlook-Änderungen (Palette, Konturen, Boden) nur nach
  Screenshot-Freigabe durch Sam über 01.

Statusbericht wie gehabt nach `docs/status/chat-03/`.
