# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-05 (Nacht) · Basis: aktueller `origin/main`**

Dein Aggro-Pacing ist gemerged – die Messreihe (Zeit unter Beschuss −35…−69 %)
ist genau die Beweisführung, die wir wollen. Deine KL1-Analyse ist
angenommen: **Reihenfolge Rapid → Impact → Precision (nach N2) → Control**
steht jetzt so im MASTERPLAN, und dein gemeinsames Snapshot-Feld liegt in
shared: `PlayerSnapshot.signature?: number` (0–100, ganzzahlig).

## KL2-RAPID: Signature „Momentum" (Klassen 3.0, erste Familie)

Hinter Flag **`SIGNATURE_RAPID_ENABLED`** (Default aus; ohne Flag exakt wie
vorher + Test). Design aus MASTERPLAN Feld 5, deine KL1-Fallen sind Teil des
Auftrags:

1. **Mechanik:** Skalar 0–100 je Spieler der Rapid-Familie. Aufbau beim
   Feuern in Bewegung, Abbau bei Stillstand (Werte als benannte Konstanten).
   Wirkung: `reload`-Multiplikator, Kappe klar definieren (Vorschlag: bei 100
   Momentum −25 % reload; Rapid spielt am Feuerratenlimit – lieber
   konservativ starten, KL5 justiert mit Telemetrie).
2. **Snapshot:** `signature` nur für Rapid-Klassen und nur bei aktivem Flag
   setzen (ganzzahlig; Deltas/Kurz-IDs brauchen nichts Neues).
3. **Bots (deine Falle 4):** Rapid-Bots bekommen eine Bewegungsregel, die
   Momentum hält – ein stehender Rapid-Bot wäre strikt schlechter.
4. **Balance-Sichtbarkeit (deine Falle 3):** `npm run balance` braucht eine
   Momentum-Spalte (effektive Feuerrate bei 0/50/100), sonst rechnet KL5 an
   der falschen Zahl. Falls dafür etwas in `packages/shared/src/balance.ts`
   nötig ist: exakter Vorschlag im Statusbericht, ich verdrahte.
5. **Prediction-Notiz (deine Falle 2):** Abschnitt in
   `docs/CLIENT_PREDICTION.md`, wie der Client den Momentum-Aufbau spiegeln
   muss, sobald N2 kommt.

Die HUD-Anzeige (Momentum-Balken) baut 03 als Folgepaket auf dem
`signature`-Feld – dein Teil endet damit, dass das Feld korrekt gefüllt ist.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
