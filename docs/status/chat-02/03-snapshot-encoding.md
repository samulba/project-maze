# 03 – Snapshot-Bandbreite: Runden und Deltas

**Branch:** `claude/arena-events-overcharge-hunter-s4sipx` · **Basis:** `origin/main` @ `050b51f` · **Status: in main**

## Ausgangslage

Chat 04 hatte gemessen: bei 40 Spielern ist der Snapshot-Versand der
Flaschenhals, nicht die Physik. Ziel war −40 % Bytes je Snapshot.

## Messreihe (`npm run loadtest --clients 40`)

| Stand | KB/s je Client | Bytes/Snapshot | Δ |
|---|---|---|---|
| Basis | 256,8 | 8619 | – |
| nur Runden | 228,9 | 7688 | −10,9 % |
| + Statik/Wände wie beauftragt | 208,2 | 6997 | −18,9 % |
| + Bestenliste, Killfeed, Upgrades, Formstatik | **153,1** | **5127** | **−40,4 %** |

**Die drei beauftragten Maßnahmen allein bringen 18,9 %, nicht 40.** Runden
greift nur an Fließkommazahlen, der Löwenanteil steckt in Schlüsseln, UUIDs und
Feldern, die sich schlicht nie ändern. Deshalb wurden dieselben zwei Techniken
konsequent weitergezogen – das ist die Abweichung vom Auftrag.

## Gefundener Fehler

`send(socket, game.snapshot(id), true)` hat den Snapshot **erst gebaut und dann
bei Backpressure verworfen**. Mit Delta-Versand wäre das Datenverlust gewesen:
Der Server hätte Name und Wände als „übertragen" verbucht, der Client hätte sie
nie bekommen. Die Prüfung läuft jetzt vor dem Bauen – spart nebenbei die
Serialisierung, die niemand bekommen hätte. Zusätzlich gibt es
`resetSnapshotBaseline(game, id)`.

## Dateien

`apps/server/src/snapshot-encoding.ts` (neu), `snapshot-encoding.test.ts` (neu),
`index.ts`, `README.md`, `.env.example`, `docs/DEPLOY.md`, `docs/DEPLOYMENT.md`

## Tests

12 neu / 206 gesamt grün.

## Von 01 gebraucht

Erledigt: Wire-Typen in shared (`WirePlayerSnapshot`, `WireShapeSnapshot`,
`WireWorldSnapshot`), Hydrierungsfunktion an der Socket-Grenze im Client,
`SNAPSHOT_DELTAS=true`.
