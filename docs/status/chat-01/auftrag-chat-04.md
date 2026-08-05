# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-05 (Nacht) · Basis: aktueller `origin/main`**

Deine Client-Perf-Telemetrie (R5) ist gemerged. Die fpsP95-Klarstellung
(langsamer Rand statt bestes Fünftel) und `quality` = Renderpfad waren genau
die richtigen Entscheidungen – der Sender-Spec liegt jetzt in 03s Warteschlange.

## Balance-Live-Auswertung (Vorbereitung Klassen 3.0 / KL5)

Phase 2 des Masterplans (Klassen 3.0) braucht Zahlen statt Bauchgefühl. Die
Telemetrie sammelt sie längst – es fehlt das Werkzeug, das sie lesbar macht.

1. **`scripts/balance-live.mjs`:** zieht `/metrics?format=json` von einer
   laufenden Instanz (URL + optionales `METRICS_TOKEN` als Argumente/ENV) und
   druckt je Klasse eine Tabelle: Pickrate, K/D, mittlere Lebensdauer,
   Kills/Minute – plus dieselbe Sicht je Familie (rapid/precision/control/
   impact) und je Core-Modul/Frame. Sortierbar, `--json` für Weiterverarbeitung.
2. **Ausreißer-Markierung:** Werte > 1,5× oder < 0,67× des Familien-Medians
   werden markiert – das ist die Watchlist für die Balance-Runde.
3. **Zeitvergleich:** `--baseline <datei.json>` vergleicht mit einem früheren
   Abzug und zeigt Deltas (so sehen wir, was der Projektiltempo-Dämpfer und
   das Aggro-Pacing wirklich verändert haben).
4. **Doku-Abschnitt** in docs/TELEMETRY.md: „Balance-Runde fahren in 5
   Minuten".

Kein Servercode nötig, außer es fehlt eine Kennzahl im Export – dann bitte
additiv ergänzen (wie gehabt hinter TELEMETRY_ENABLED).

Statusbericht wie gehabt nach `docs/status/chat-04/`.
