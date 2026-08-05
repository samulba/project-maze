# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-06 (2. Fassung) · Basis: aktueller `origin/main`**

Paket 10 ist gemerged. Der wichtigste Teil war nicht die Lastprobe, sondern
dass du dem eigenen Messergebnis nicht geglaubt hast: „alle Schalter an kostet
nichts" war ein blinder Lasttest, kein Serverbefund. Die `welcome`-Falle bei
`SHORT_NET_IDS` hätte jede weitere Messung geschönt – und der Schalter ist
live an. Die Warnung in `.env.example` und `DEPLOYMENT.md` bleibt genau da,
wo sie steht.

Dein Befund für die Kapazitätsplanung ist notiert: Der Tick-Abstand p95 liegt
bei 26–28 ms über dem 25-ms-Soll, während die Simulation nur ein Zehntel des
Budgets braucht – der Flaschenhals ist der Snapshot-Versand, nicht die
Physik. Das wird das Thema, sobald echte Spieler dazukommen.

Die Dämpfer-Frage habe ich an 02 weitergegeben (1,5 Prozentpunkte
Tickbudget – kein Problem). Ein A/B-Lauf mit temporärem Flag kommt nur, wenn
02 die exakte Zahl anfordert.

## Das Paket: Perf-Report um `tier` erweitern + Balance-Läufe verdichten

**1. `tier` im Perf-Report (blockiert 03, deshalb zuerst).**
03 hat R4 gebaut: drei Qualitätsstufen (hoch/mittel/niedrig) mit Automatik.
Die Stufe soll als **eigenes Feld** neben `quality` laufen –
`{"quality":"webgl","tier":"mid"}` – statt als kombiniertes Label
`webgl-mid`, das die Kardinalität von 4 auf 12 heben und deinen
`/metrics`-Export sprengen würde. Ich habe den Vorschlag angenommen.

Du brauchst: `tier` im Zod-Schema von `POST /client-metrics` erlauben (sonst
400 – und ein dauerhaft abgelehnter Client fällt im Spiel nicht auf), den
`/metrics`-Export um die Dimension erweitern (Renderpfade × 3 Stufen, plus
„unbekannt" für ältere Clients), und die Labelgrenzen so setzen, dass ein
manipulierter Client den Export nicht aufbläht. Erlaubte Werte: `high` ·
`mid` · `low` – alles andere wird verworfen, nicht durchgereicht.

**2. Balance-Baseline verdichten.**
Deine eigene Einschränkung war „ein Lauf je Konfiguration ist noch keine
Messung" – Control und Impact brechen gleichzeitig ein, das kann Folge eines
stärkeren Rapid oder schlicht Streuung sein. Fahr die Läufe wie bei der
Matrix mehrfach (deine Wahl, wie viele – begründe die Zahl im Bericht) und
sag, welche der beiden Erklärungen die Zahlen stützen. Ergebnis als
zusätzlicher eingefrorener Abzug neben den beiden vorhandenen; die alten
bleiben liegen, sie sind der Vorher-Stand für KL5.

## Kontext, der dich betrifft

- **Neu auf main: der Diep-Design-Umbau** (heller Grundlook, Sams Entscheid).
  Rein client-seitig, keine Server- oder Deploy-Wirkung – aber wenn Sam über
  Optik berichtet, weißt du, woher es kommt.
- **KL4 kommt:** 02 baut die Server-Seite der Familien-Upgrades hinter
  `FAMILY_UPGRADES_ENABLED` (Default aus). Für dich erst relevant, wenn der
  Balance-Report den Block `FAMILIEN-UPGRADES — DOMINANZPRUEFUNG` bekommt.
- `RATE_LIMIT_CONNECTIONS_PER_IP=200` war korrekt nur lokal für den Lastlauf.
  Produktionswert bleibt 5 – steht so auch in deinem Bericht, ich bestätige
  es hier nur, damit es nicht versehentlich wandert.
- Paket 08 (Client-Perf-Telemetrie) hängt weiterhin, blockiert aber nichts
  davon. Wenn du es beiläufig abräumen kannst: gern, sonst später.

Statusbericht wie gehabt nach `docs/status/chat-04/`.
