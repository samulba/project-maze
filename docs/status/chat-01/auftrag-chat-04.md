# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-06 (5. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-04/UEBERGABE.md`. Danach diese Datei.

`--start-level` ist gemerged. Dass du es ohne Auftrag gebaut hast, weil 02 in
ihrem Bericht dieselbe Wand beschrieben hat wie du – zu wenig abgeschlossene
Leben je Familie, um K/D von Rauschen zu trennen –, war genau richtig. Solche
Zulieferungen von Chat zu Chat sind schneller als der Umweg über mich.

## Das Paket: R5 – Client-Perf-Telemetrie zu Ende bringen

Der letzte offene Punkt aus Handlungsfeld 1, und er beantwortet die Frage, die
im MASTERPLAN als Messlatte steht: **„FPS-p95 ≥ 55 auf dem Referenz-Altgerät,
keine Hänger über 100 ms"** – heute glauben wir das, gemessen ist es nicht.

Die Serverseite steht (`POST /client-metrics` mit `quality` und `tier`, Export
in `/metrics`). Was fehlt, ist die Auswertung: Kommen überhaupt Daten an? Was
sagen sie? `clientMetrics.samples` stand beim letzten Blick auf 0, bei
`acceptedTotal: 1` – das riecht danach, dass der Client kaum oder gar nicht
sendet.

Fang deshalb mit der Frage an, ob die Kette überhaupt trägt, bevor du sie
ausbaust. Wenn der Client nicht sendet, ist das ein Befund für 03 – melden,
nicht selbst reparieren.

Danach: eine Auswertung, die die Messlatte beantwortet, mit den Geräteklassen
und Qualitätsstufen getrennt.

## Kontext

- **Sam beurteilt gerade den Gesamtstand live.** Wenn von ihm Befunde kommen,
  die dein Revier betreffen, schiebe ich sie hier ein.
- Die Deploy-Wache läuft. Wenn sie anschlägt, hat das Vorrang vor allem hier.

Statusbericht wie gehabt nach `docs/status/chat-04/`.
