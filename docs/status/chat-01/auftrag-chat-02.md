# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 · Basis: aktueller `origin/main`**

Momentum ist gemerged – die Entscheidung „Aufbau hängt an primary, nicht am
Schuss" und der Tick-davor-Stand beim Feuern sind genau richtig begründet.
Flag bleibt aus, bis 03 den Momentum-Balken liefert (nächstes 03-Paket).

## KL2-IMPACT: Signature „Wucht" (zweite Familie)

Hinter Flag **`SIGNATURE_IMPACT_ENABLED`** (Default aus), nach deiner eigenen
KL1-Analyse:

1. **Mechanik:** Anlauf-Skalar 0–100 je Spieler der Impact-Familie – gleiche
   Bauart wie Momentum (läuft bei Fahrt hoch, Stillstand baut ab); Code mit
   `signature-rapid.ts` teilen, wo es sich anbietet (gemeinsames Modul oder
   gemeinsame Helfer, deine Entscheidung). Wirkung: Multiplikator auf den
   Körperschaden am bestehenden Kontaktpunkt (`bodyDamage * 0.08`-Stelle).
2. **Ohne Wandmechanik** – wie von dir empfohlen: `moveCircle` bleibt
   unangetastet, Wucht rein über Strecke. Wand-Erhalt kommt frühestens nach N2.
3. **One-Shot-Deckel (deine Falle 2):** Obergrenze so wählen, dass voller
   Anlauf einen gleichlevelig-frischen Tank NIE in einem Kontakt tötet;
   Verzahnung mit `ROOKIE_PROTECTION_LEVEL` (gegen Geschützte wirkt der Bonus
   gar nicht). Test dafür ist Pflicht.
4. **Snapshot:** `signature` für Impact-Klassen bei aktivem Flag (Feld ist da).
5. **Bots:** Impact-Bots (brawler) fahren ohnehin an – prüfen, ob die
   bestehende Bewegung reicht, sonst kleine Regel wie bei Rapid.
6. **Balance-Sichtbarkeit:** Wucht-Spalte im Report analog zur Momentum-Spalte;
   Prediction-Notiz in docs/CLIENT_PREDICTION.md ergänzen.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
