# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-05 (Nacht) · Basis: aktueller `origin/main`**

Dein R3-Mobile-Paket ist gemerged – die Testmatrix mit dem automatischen
Überlappungs-Check ist genau der Standard, den wir halten wollen.

## Design-Beruhigung II: „Neon raus" (Sams direktes Feedback)

Sam nach dem Live-Test: Das Gesamtbild ist ihm trotz „Ruhe & Gewicht" noch zu
„Neon City" – Ziel ist **ruhiger, cleaner, minimalistischer**. Das betrifft
ausdrücklich auch den **Startscreen**, nicht nur das HUD:

1. **Startscreen entschärfen:** Logo-Glow, pulsierender Ring, Radial-Verläufe
   und Akzent-Schatten deutlich reduzieren oder streichen. Ruhige dunkle
   Fläche, klare Typo, EIN Akzent.
2. **Glow-Inventur im ganzen Client:** jede `box-shadow`/`text-shadow` mit
   Leuchtwirkung begründen oder entfernen (`--accent`-Glows, Badge-Schatten,
   Button-Schein). Verläufe nur noch, wo sie Funktion haben (HP/XP-Balken).
3. **Farbdisziplin im Spielfeld:** Die Palette aus „Ruhe & Gewicht" war die
   richtige Richtung – eine Stufe weiter: Formen/Wände noch zurückhaltender,
   Sättigung nur für Bedeutung (Schaden, Events, eigener Tank, Gegner).
4. **Death-Screen und Panels:** gleiche Behandlung (Verlauf-Buttons → ruhige
   Flächen mit klarer Hover-Reaktion).

Der Körper-Kickback beim Schießen ist bereits von 01 auf 0 gesetzt (nur das
Rohr federt) – Sams Wunsch, nicht rückgängig machen.

Vorher/Nachher-Screenshots (Startscreen + HUD) in den Statusbericht.

## Danach in dieser Reihenfolge (je ein Paket)

1. **K2 Profil-Tab** – Backend ist live: `GET /profile/:userId` liefert
   displayName, memberSince, Bestwerte, `favoriteClass(+Runs/Seconds)`,
   `totalSeconds`, Achievements mit Katalogtexten; `POST /profile` ändert den
   Anzeigenamen (Supabase-Token im Authorization-Header, 202 = angenommen).
   Startscreen-Tab mit Profilkarte + Achievements-Galerie; Gast sieht einen
   dezenten Login-Hinweis.
2. **Mini-Paket Perf-Sender** – Spezifikation von 04 in
   `docs/status/chat-04/08-client-perf-telemetrie.md` (POST /client-metrics,
   einmal pro Minute, fpsP50/fpsP95-Konvention beachten: P95 = langsamer Rand).
3. **R1/R2/R4** Desktop-Fullscreen-Härtung + Qualitätsstufen.
4. **N2 Client-Prediction** (docs/CLIENT_PREDICTION.md).

Statusbericht wie gehabt nach `docs/status/chat-03/`.
