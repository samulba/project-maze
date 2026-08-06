# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-06**

## Zuletzt auf main gemerged

- 01 **Design-Entscheid „Diep-Basis"**: Standard-Theme hell (Arena `0xcdcdcd`
  + Gitter, Konturen in abgedunkelter Füllfarbe via `STYLE`/`darken()` in
  `renderer.ts`, UI `color-scheme:light`, selbst Cyan / Gegner Rot).
  Verbindlich im MASTERPLAN („Design-Richtung") – Grundlook-Änderungen nur
  nach Screenshot-Freigabe durch Sam. Wahl-Themes void/neon/classic bleiben
  dunkel. Ein Review-Sweep hat vier Stellen gefunden, die durch den
  Hell-Umbau unlesbar geworden wären (Guardian-Label, Schadens- und
  Belohnungszahlen, Gold-Effekte, Kleinschrift am Startscreen) – alle gefixt.
- 03 **Paket 12 R1/R2/R4**: Vollbild-Knopf, Auflösung folgt jetzt Zoom- und
  Monitorwechsel (die klebte vorher am Startwert), weicher Letterbox-Abschluss
  ohne Rahmenstrich, drei Qualitätsstufen mit Automatik (`localStorage`:
  `project-maze-quality`). Handlungsfeld 1 ist damit client-seitig durch.
- 04 **Paket 10 Lastprobe + Baseline**: Der Lasttest war mit `SHORT_NET_IDS`
  blind (eigene ID aus `welcome` statt aus dem Snapshot) und meldete 0
  Klassenwahlen/0 Upgrades. Nach dem Fix: „alle Schalter an" kostet ~10 % mehr
  Tickzeit und spart 44 % Bandbreite, bei 11 % Auslastung des Tickbudgets.
  Zwei eingefrorene Balance-Abzüge unter `docs/balance/`.
- 02 **Paket 12 KL4-Konzept** (reines Konzept, kein Code): Familien-Upgrades
  als Sockel + Punkte statt als Aufschlag auf einen Festwert.
- davor: K2 Profil-Tab, KL2-IMPACT „Wucht", Signature-HUD, Momentum,
  Balance-Live, Aggro-Pacing, R3 Mobile.

## Flags live (Railway)

`SNAPSHOT_DELTAS=true` · `SHORT_NET_IDS=true` · `ACHIEVEMENTS_ENABLED=true` ·
`AUTH_ENABLED=true` · `SPECTATOR_ENABLED=true` · Rate-Limits/Direktor
default-an · **`SIGNATURE_RAPID_ENABLED` + `SIGNATURE_IMPACT_ENABLED` →
zündbar, HUD ist da** (offen: hat Sam sie gesetzt?)

Kommt als Nächstes dazu: `FAMILY_UPGRADES_ENABLED` (02, Default aus).

## Entscheidungen der Zentrale vom 06.08.

- **KL4 Variante B angenommen:** Der Signature-Festwert wandert in die
  Punkte-Ökonomie (Sockel + Punkte). Ändert rückwirkend, wie sich Rapid und
  Impact ohne Investition anfühlen – bewusst, sonst gibt es kein Fenster
  zwischen „toter Slot" und „zwei Werte multiplizieren sich".
- **Shared-Änderung freigegeben:** `signatureRate` + `signaturePower` werden
  an `UPGRADE_IDS` angehängt; 02 baut sie selbst, die 8 Basis-IDs behalten
  Reihenfolge und Indizes.
- **`tier` als eigenes Perf-Feld** statt kombiniertem Label (03s Vorschlag,
  Kardinalität 4 statt 12). 04 erweitert die Serverseite, 03 zieht nach.

## Erwartet als Nächstes

- **02:** KL4 Server-Seite hinter `FAMILY_UPGRADES_ENABLED` – Familiensperre,
  Skalierung an Momentum und Wucht, Bot-Pfade (Slots auf Position 2 und 4),
  Endlosschleifen-Fix in `spendBotPoints`, Dominanzprüfung im Report
- **03:** N2 Client-Prediction; dazu zwei kleine Zulieferungen (`Digit0` auf
  Index 9, Beschriftung der KL4-Knöpfe, `tier` senden sobald 04 es annimmt)
- **04:** `tier` im Perf-Report erlauben (blockiert 03), danach die
  Balance-Läufe mehrfach fahren statt einmal
- **Sam:** `SIGNATURE_RAPID_ENABLED=true` + `SIGNATURE_IMPACT_ENABLED=true`
  setzen, falls noch nicht; den neuen hellen Look auf www.mazers.de ansehen;
  Momentum, Wucht und Spectator beurteilen

## Betriebsstand – zwei Fakten von Sam (06.08., merken)

1. **`SIGNATURE_RAPID_ENABLED` und `SIGNATURE_IMPACT_ENABLED` sind in Railway
   gesetzt.** Die Frage ist damit erledigt und wird nicht wieder gestellt.
   Momentum und Wucht sind live wirksam – der Code dafür steckt seit
   `d8568b6` im Build.
2. **Railway deployt normal.** Sam hat die Deploy-Historie geprüft.

## Wie `/health` uns angelogen hat (Lehrstück 06.08.)

Ein `/health` zeigte `commit: d8568b6`, zwölf Commits hinter `main`. Ich habe
daraus einen Deploy-Stillstand geschlossen und ihn 04 als Vorrang in den
Auftrag geschrieben. **Falsch** – siehe oben. Der Fehler war, aus einem
einzelnen Feld eines Endpunkts, der drei kaputte Freshness-Signale hatte, eine
Betriebsstörung abzuleiten.

Alle drei repariert (`apps/server/src/index.ts`):

- **`/health` hatte kein `Cache-Control`.** Express liefert `res.json()` mit
  ETag; ein Browser-Tab zeigt nach dem Neuladen den alten Rumpf. Ausgerechnet
  unser Testprotokoll kam aus dem Cache. Jetzt `no-store`.
- **`build` ist ein Festwert** aus Sprint B (`sprint-b2+static-renderers`) und
  sieht nur aus wie eine Build-Kennung. Bleibt stehen, ist jetzt als Etikett
  kommentiert.
- **`commit` allein reicht nicht:** Wird ein Deploy durch eine
  Variablenänderung ausgelöst, kann dieselbe Abbildung mit derselben
  Git-Variable erneut starten. Neu daneben: **`startedAt`** (Prozessstart über
  `process.uptime()`) und **`deploymentId`**.
- Dazu die fehlenden Flags: `signatureRapid` und `signatureImpact` stehen jetzt
  im `features`-Block.

**Regel für die Zukunft:** Ein alter `commit` im `/health` ist ab jetzt ein
Verdacht, kein Befund – erst gegen `startedAt` und die Deploy-Historie halten,
bevor daraus ein Auftrag wird.

## Übergabedokumente für 02/03/04 (06.08.)

Sam setzt die drei Arbeits-Chats neu auf. Damit ein frischer Chat ohne
Rückfragen weiterarbeiten kann, liegt das Rollenwissen jetzt in Git statt im
Chatverlauf: `docs/status/chat-0X/UEBERGABE.md`, je Chat eine Datei mit Revier,
eisernen Regeln, Architektur-Kurzabriss und der Fallenliste seines Reviers.
Die drei Auftragsdateien verweisen in der Kopfzeile darauf.

## Notizen der Zentrale (Aufträge ausgegeben, Wartestand)

- **`CLIENT_PREDICTION.md` korrigiert** (Abschnitt 4 + Kurzcheck): Die Doku
  behauptete noch, `ACCELERATION_SCALE` stehe „nur im Server" und müsse im
  Client von Hand gespiegelt werden. Seit Paket 09 liegt der Faktor in
  `packages/shared` (`index.ts`), der Server importiert ihn von dort. 03 baut
  gerade N2 gegen genau diese Doku – ein handgespiegelter Zweitwert wäre der
  Anfang einer stillen Divergenz gewesen (N3).
- **`lastProcessedInput` gegengeprüft:** `tuneInputAck` hängt ohne Flag und als
  äußerste Schicht (`index.ts:212`), setzt das Feld in jedem Snapshot, Fallback
  `NO_INPUT_PROCESSED = -1`. Die Zusage an 03 hält.
- **Baseline grün** auf `2ac1e59`: 43 Testdateien / 566 Tests, Build sauber.
- **www.mazers.de ist aus dem Container von 01 nicht erreichbar** (Egress-Policy
  blockt den Host, 403 auf CONNECT). `/health`-Prüfungen und `balance:live`
  gegen die Live-Instanz kann 01 nicht selbst fahren – das läuft über Sam.
