# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-05 · Basis: aktueller `origin/main` · HOHE PRIORITÄT**

## R3: Mobile-Erlebnis (MASTERPLAN.md, Handlungsfeld 1, „R3 im Detail")

Direktes Sam-Feedback mit iPhone-Screenshot: Spielfeld unsichtbar, HUD-Chaos.
Der Viewport-Bug ist von 01 bereits behoben (visualViewport-Kopplung, 100dvh,
viewport-fit=cover; Bestenliste/Ping auf Touch übergangsweise ausgeblendet).
Dein Paket ist das eigentliche Redesign nach der Spezifikation im MASTERPLAN:

1. Kompakte Statusleiste oben links (Level + HP + XP, max. 44 px) statt
   Player-Panel; Name/K/D/Score nur im Death-Screen.
2. Aktions-Stapel über dem Aim-Stick (Modul + AUTO; REPEL in den Stick oder
   in den Stapel), einheitliche Größen, Daumen-Ergonomie, Safe-Areas.
3. EIN Meldungs-Slot oben Mitte für Events/Bounty/Achievements/Kills –
   eine Meldung zur Zeit.
4. Upgrades als Bottom-Sheet über Punkte-Badge an der Statusleiste.
5. Sticks größer; Minimap nur auf Abruf.

**Pflicht-Testmatrix aus dem MASTERPLAN in den Report** (iPhone Safari quer
mit/ohne Leisten, Android Chrome, Tablet, Rotation im Spiel, App-Switcher).

Dein „Ruhe & Gewicht" ist gemerged (Konfliktauflösung: deine Letterbox +
01s visualViewport-Kopplung koexistieren in `syncSize()`/`resizeViewport()`).

**Sam-Feedback nach dem Live-Test dazu (fürs Mobile-Paket gleich
mitdenken, als eigenes Paket danach ausführen): Das Design ist ihm insgesamt
noch zu „Neon City" – Ziel ist ruhiger, cleaner, minimalistischer.** Das
betrifft ausdrücklich auch den STARTSCREEN (Logo-Glow, Verläufe, Ring), nicht
nur das HUD: Glow-Effekte weitgehend raus, Verläufe durch ruhige Flächen
ersetzen, Akzentfarbe nur noch funktional (Schaden, Events, eigener Tank).
Der Körper-Kickback beim Schießen ist auf Sams Wunsch bereits von 01 auf 0
gesetzt – nur das Rohr federt noch.

Danach als eigene Pakete: Design-Beruhigung II (siehe oben) → R1/R2/R4
(Desktop-Fullscreen, Qualitätsstufen) → N2 Client-Prediction
(docs/CLIENT_PREDICTION.md von 02 ist dafür geschrieben;
`lastProcessedInput` liegt in shared, optional → `?? -1`).

Statusbericht wie gehabt nach `docs/status/chat-03/`.
