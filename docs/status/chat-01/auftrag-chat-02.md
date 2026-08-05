# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-05 · Basis: aktueller `origin/main`**

Zwei Teile, ein Branch.

## Teil 1 – P1: Bot-Aggro-Pacing (MASTERPLAN.md, Handlungsfeld 2)

Sams Feedback: Dauerbeschuss, nie eine Verschnaufpause. Ziel: Kämpfe enden
auch mal.

1. **Disengage-Fenster:** Nach einem Kill lässt der Bot ~6 s von Menschen ab
   (farmt oder repositioniert).
2. **Jagd-Timeout:** Verfolgt ein Bot einen Menschen > 8 s ohne eigenen
   Treffer, bricht er ab – wer entkommt, ist entkommen.
3. **Angreifer-Deckel:** Maximal 2 Bots gleichzeitig im Angriffsmodus auf
   denselben Menschen (Anti-Gang-up verschärfen); weitere weichen auf Formen
   oder andere Ziele aus.
4. **Stil-Verteilung:** Farmer-Anteil erhöhen.

Alle Werte als benannte Konstanten (spätere Telemetrie-Tuning-Runde),
deterministisch getestet (Teamplan-Regel 8).

## Teil 2 – KL1: Machbarkeits-Kommentar Klassen 3.0

Zu den vier Signature-Mechaniken in MASTERPLAN.md Handlungsfeld 5 (Momentum /
Ladeschuss / Einheiten-Budget / Wucht): je Familie Aufwandseinschätzung,
technische Fallen, empfohlene Reihenfolge. Nur Kommentar (in deinen
Statusbericht), noch keine Umsetzung.

## Kontext seit deinem letzten Stand

- Deine Input-Quittung ist gemerged; `lastProcessedInput` steht in shared –
  als **optionales** Feld (Abweichung von deinem Vorschlag: Dutzende
  Test-Fixtures bauen Snapshot-Literale; der Server setzt es trotzdem immer,
  der Client liest `?? -1`). Einspruch gern über deinen Statusbericht.
- `ACCELERATION_SCALE` liegt jetzt in `packages/shared` (dein Vorschlag 2).
- Statusbericht wie gehabt nach `docs/status/chat-02/`.
