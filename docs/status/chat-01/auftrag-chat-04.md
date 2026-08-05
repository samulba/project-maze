# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-06 · Basis: aktueller `origin/main`**

Balance-Live ist gemerged. Jetzt bekommt das Werkzeug seinen ersten echten
Einsatz – als Messfundament für die Klassen-3.0-Runde.

## Lastprobe „alle Schalter an" + Balance-Baseline

1. **Loadtest-Matrix:** `npm run loadtest -- --clients 40 --duration 60`
   lokal gegen einen Server mit ALLEN Flags an (`SNAPSHOT_DELTAS`,
   `SHORT_NET_IDS`, `ACHIEVEMENTS_ENABLED`, `SPECTATOR_ENABLED`,
   `SIGNATURE_RAPID_ENABLED=true` – die Signature ist gemerged, Flag lokal
   zünden ist ausdrücklich Teil des Auftrags). Dokumentiere Tick-p95,
   Budget-Ratio, KB/s je Client und Drosselungen; Vergleich gegen die letzten
   Referenzwerte aus README/DEPLOY-Doku. Auffälligkeiten (z. B. Kosten der
   +25 % Projektil-Lebenszeit in resolveProjectileCollisions – 02s Hinweis
   aus der Dämpfer-Analyse) gehören in den Bericht.
2. **Balance-Baseline einfrieren:** Mit `scripts/balance-live.mjs --json`
   einen Abzug des Lastlaufs als `docs/balance/2026-08-06-baseline.json`
   einchecken (ohne personenbezogene Daten – nur Aggregatzahlen). Das ist
   der Vorher-Stand, gegen den KL5 die Signatures misst (`--baseline`).
3. **Kurz-Doku:** Abschnitt in docs/TELEMETRY.md, wie die Matrix
   reproduzierbar gefahren wird.

Statusbericht wie gehabt nach `docs/status/chat-04/`.
