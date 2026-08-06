# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (9. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md`. Danach diese Datei.

**Dein Befund war der wichtigste dieser Runde.** „Ein Dash sieht aus wie ein
Teleport-Bug" haben wir alle als Darstellungsproblem gelesen – du hast
nachgesehen und festgestellt, dass der Dash **einer ist**: die ganzen 189 px in
einem einzigen `moveCircle`-Aufruf, im selben Tick. Beim Client kommt eine
Positionsänderung zwischen zwei Snapshots an; es gibt nichts zu interpolieren.
03 hätte mit Trails und Nachbildern monatelang das Symptom poliert und die
Ursache stehengelassen. Genau deshalb war die Reihenfolge „erst Server, dann
Grafik" richtig.

## Zwei Entscheidungen von mir

1. **Freigegeben: `REPULSE_RADIUS` und `BARRIER_FRONT_DOT` nach
   `shared/gameplay`.** Null Snapshot-Kosten, und die Alternative wäre, dass 03
   die Zahlen abschreibt – dieselbe stille Divergenz wie damals bei
   `ACCELERATION_SCALE`. Bau es selbst, wie bei den KL4-IDs.
2. **`DASH_TRAVEL_ENABLED` steht auf Default an – gegen deine Empfehlung.** Du
   wolltest ihn zusammen mit 03s Spur zünden. Ich habe anders entschieden: Der
   Sprung ist genau das, was Sam gemeldet hat, und die Fahrt allein behebt ihn
   schon, auch ohne Trail. Nach zwei Runden, in denen fertige Pakete
   ausgeschaltet auf `main` lagen, ist mir „zu früh sichtbar" lieber als „gar
   nicht sichtbar". Wenn dir dabei ein Balance-Risiko auffällt – die Fahrt
   endet jetzt an Wänden statt am Endpunkt –, sag es, das ist dein Urteil.

`moduleDirection` bleibt liegen, bis 03 danach fragt. Einverstanden.

## Das Paket: die restlichen Fähigkeiten lesbar machen

Der Dash war die schlimmste, aber nicht die einzige. Geh dieselbe Frage für die
übrigen Module und Signatures durch: **Passiert serverseitig etwas, das man
prinzipiell nicht sehen kann?** Ein Zeitfenster, das kürzer ist als ein
Snapshot-Abstand; ein Effekt, der nur im selben Tick existiert; ein Zustand, der
nirgends im Snapshot auftaucht.

Was du unter „Was serverseitig sonst noch fehlt" schon aufgeschrieben hast, ist
der Anfang – arbeite es ab, und wo du etwas findest, repariere es wie beim
Dash: an der Ursache, nicht an der Anzeige.

**Klein und schnell halten.** Sam wartet auf Sichtbares, nicht auf
Vollständigkeit.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
