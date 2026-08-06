# Integrationsstand – Chat 01 (Zentrale)

**Stand: 2026-08-06**

## KONSOLIDIERUNG auf einen Stand (07.08.) – das Team wird zur Zentrale

Sam löst die Chats 02/03/04 auf; 01 arbeitet ab jetzt allein. Die drei
Abschlusslieferungen sind gesichtet und verarbeitet:

- **02 (gemerged):** Die restlichen unsichtbaren Fähigkeiten. Wichtigster
  Fund: **Der Bot-Dash sprang weiter** – die Fahrt hing am vierten Parameter
  von `activateModule`, den nur der Spieler-Pfad setzte. In der Arena sind
  fast alle Dashes Bot-Dashes; genau über die hatte Sam sich beschwert. Der
  Schalter sitzt jetzt am Spiel, der Parameter ist weg. Dazu: Repair
  verbrannte sich in Fahrt unsichtbar (17 s Abklingzeit für nichts), Repulse-
  Konstanten liegen in shared, und `REPULSE_TRAVEL_ENABLED` (Default aus,
  bewusst: Wirkungs-VERDOPPLUNG, Entscheidung nach der Messrunde).
- **04 (gemerged):** `.env`-/Deploy-Doku entstaubt und auf den Flag-Stand
  gebracht.
- **03 (Berichte übernommen, Code bewusst NICHT gemerged):** 03 hat parallel
  zur Welle B dieselbe Idee gebaut – eine Rumpf-Datenquelle, aber auf dem
  29-Klassen-Stand, nur im Client, ohne Rad/Death-Screen. Die shared-Lösung
  aus Welle B (45 Klassen, vier Verbraucher) ersetzt sie vollständig. Zwei
  Dinge aus dem Bericht sind trotzdem Gold und bleiben festgehalten: **Die
  Korrektur, dass die Impact-Klassen im Spiel nie identisch waren** (das war
  ein Artefakt der alten Kreis-Vorschau; wirklich dublettiert waren Core/
  Controller/Twin/Warden/Guardian – in Welle B sind alle fünf verschieden),
  und der Hinweis, dass der Prüfstand Panels misst, aber keine **Geschwister
  im selben Panel** – ein offener Prüfstand-Ausbau für die nächste Runde.

816 Tests grün. Die Branches der drei Chats bleiben als Archiv stehen.

**Arbeitsmodell ab jetzt:** Sams Nachricht ist der Auftrag. 01 plant, baut
(mit Subagenten für Parallelisierbares), prüft (Check, Prüfstand, Blindtest,
Screenshots) und pusht auf `main`. Diese Datei bleibt das Gedächtnis.

## KLASSEN 4.0, Welle B – umgesetzt von 01 (06.08. nachts, zweiter Push)

- **Perks:** 38 Klassen ab L15 tragen je ein benanntes Alleinstellungsmerkmal
  aus 15 Mechaniken (Daten `shared/perks`, Wirkung `apps/server/perks.ts`,
  18 Tests). Auf der Wahlkarte ersetzt der Perk die generische Beschreibung.
  `PERKS_ENABLED` Opt-out.
- **Eine Geometrie-Quelle:** `shared/appearance` liefert Zeichenbefehle je
  Klasse; Renderer (Pixi), Wahlkarte (SVG), Rad und Death-Screen zeichnen
  identisch. Der 45-Silhouetten-Blindtest ist erzeugt und bestanden –
  Familien-Grundkörper (Kreis/Sechseck-lang/Orbit/Panzer/Diamant/Dreieck),
  Stufen wachsen sichtbar, Apex trägt den Kronenring.
- **Wahlkarten:** Bild + Rolle + Perk + „führt zu →"; Prüfstand von 63 auf
  **75 Fälle** erweitert worden (6-Karten-Wahl auf L5) und **75/75 grün** –
  unterwegs vier echte Regressionen gefangen (0/6 Karten sichtbar auf Touch
  und Desktop, Höhendeckel, 4:3-Kollisionen) und behoben.
- **Rad:** echte Silhouetten in den Knoten, sechs Familienfarben.
- **Death-Screen:** Porträt des eigenen Tanks.
- 807 Tests grün (59 Dateien).

**Welle C (offen):** Sams Live-Urteil, dann die Messrunde (Seeds,
Dominanzprüfung, Familien-Erkennbarkeit) und KL4-Slots für Specter/Tempest.

## KLASSEN 4.0, Welle A – umgesetzt von 01 (06.08. nachts)

Sams Direktauftrag, gebaut von der Zentrale selbst (Arbeits-Chats angehalten):

- **Progression:** Max-Level 60, Wahlstufen 5/15/28/42, Cap 10, zwei neue
  Basis-Slots (Reichweite +6 %/P auf Lebenszeit, Fähigkeit −5 %/P auf
  Modul-Abklingzeit). Wire append-only, Indizes stabil.
- **Baum:** 45 Klassen. Erste Wahl auf L5 zwischen SECHS Familien – neu
  SPECTER (Tarnung, Erstschlag-Bonus, Bewegung erlaubt, Schuss enttarnt) und
  TEMPEST (Hitze: +Schaden bis +40 %, Überhitzung 1,2 s). Je Familie ein Apex
  (L42), erreichbar aus jeder Klasse der Familie (`apexOf`).
- **Signature-Schichten** specter/tempest nach dem bewährten Muster, 25 neue
  Tests; Flags Opt-out. KL4-Slots für die neuen Familien bewusst noch zu
  (Welle B). Tarnung ist im Renderer sichtbar (Gegner bis 85 % ausgeblendet).
- **Balance-Netz hat dreimal gefangen:** Vortex 161,9 DPS (Korridor 100),
  Sovereign/Leviathan über Korridor, Specter-Reichweiten über 1300
  (unsichtbarer Sniper wäre Frust – Tarnung kauft Nähe). Und einmal MICH:
  Das Cap-10 hätte über den Boden sechs Klassen still BESCHLEUNIGT –
  Bezugsgröße jetzt auf 8 verankert (`REFERENCE_UPGRADE_POINTS`).
- **KL4-Steigungen gestreckt** (×0,8): Vollausbau behält die geeichte Stärke,
  One-Shot-Viertel und Ladezeit-Zusage bleiben bewiesen.
- **Bots** spielen die neuen Familien (Kiter → Specter, Farmer/Brawler →
  Tempest) und enden in ihrem Familien-Apex. Live gesehen: Shade L23 auf
  Platz 1 der Bot-Bestenliste.
- 789 Tests grün (58 Dateien, +26).

**Welle B (nächster Schritt):** Perks je Klasse, geteilte Rumpf-Geometrie mit
Blindtest über 45 Silhouetten, Wahl-UI-Neubau, KL4-Slots für Specter/Tempest.

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

## Runde 3 vollständig (06.08. abends) – 628 Tests grün

**03 Paket 13 – N2 Client-Prediction + KL4-UI** ist dazugekommen. Die
Vorhersage importiert `ACCELERATION_SCALE` aus shared statt die Zahl
abzuschreiben und ist gegen den echten Server gemessen: Rechenfehler ~3
Einheiten Median, eingesparter Rückstand 39 Einheiten bei 120 ms RTT, keine
Hartkorrektur in 75 s. Schalter im Startscreen statt ENV, damit sich beide
Zustände ohne Deploy vergleichen lassen.

**Integrationsnaht, von 01 zusammengesetzt:** 03 hat auf `de7546c` gebaut,
also vor 02s KL4. Die neuen Upgrade-IDs `signatureRate`/`signaturePower`
fehlten im Testobjekt von `prediction.test.ts` und brachen den Typecheck.

**Die Betriebssperre ist weg:** `Digit0` bildet jetzt auf Index 9 ab.
`FAMILY_UPGRADES_ENABLED` darf eingeschaltet werden, sobald dieser Stand live
ist.

**Der Design-Rückbau hat den Merge überstanden** – 03s neue Flächen hängen an
den Theme-Variablen und sind von selbst mitgewandert. Per Screenshot geprüft.

**Alle drei Chats haben ihren Vorrang nicht gesehen** (Kugeln bei 02, die drei
Live-Befunde bei 03). Die Anweisungen landeten in Git, nachdem die Chats
gestartet waren. Lehre für die Zentrale: Ein Auftrag, der nach dem Start eines
Chats geschrieben wird, erreicht ihn nicht mehr – bei laufenden Chats muss die
Änderung über Sam gehen.

## Runde 3, erster Teil (02 und 04) – 588 Tests grün

- **02 Paket 13 – KL4 Server:** Familien-Upgrades hinter
  `FAMILY_UPGRADES_ENABLED`, Variante B. Die Familiensperre hängt **auch ohne
  Flag** (sonst wären die Slots allein durch die Shared-Erweiterung kaufbar
  gewesen – vom eigenen Test gefunden), und `FAMILY_UPGRADE_BRANCHES` öffnet
  Slots nur für Familien, deren Signature wirklich läuft. Korrektur am
  Konzept: Der Impact-Festwert wird bei 6 Punkten erreicht, nicht bei 5.
- **04 Paket 11 – Deploy-Wache, `tier`, `uptimeSeconds`:** `deploy-watch` als
  eigener CI-Job, `tier` im Perf-Report (entblockt 03), `uptimeSeconds` in
  `/health`.
- **01 Konfliktauflösung:** 04 und ich hatten unabhängig dieselbe Idee
  (`uptimeSeconds` gegen `startedAt`). `uptimeSeconds` hat gewonnen, weil die
  Deploy-Wache darauf zugreift; `deploymentId` bleibt daneben, weil es etwas
  anderes sagt.

**Der Deploy-Stillstand ist aufgeklärt – es gab keinen.** 04 hat die
Watch-Path-Erklärung widerlegt (`d8568b6` hat selbst keine Server-Datei
angefasst und wurde trotzdem deployt) und die Gegenhypothese aufgestellt: eine
fest verdrahtete `RAILWAY_GIT_COMMIT_SHA` meldet für immer denselben Commit.
Ihre Prüffrage „ist die Seite hell oder dunkel?" konnte ich aus Sams Screenshot
selbst beantworten: **hell** – der Diep-Umbau war live, während `/health` noch
`d8568b6` meldete. Die Deploys liefen also durchgehend.

**Betriebswarnung von 02:** `FAMILY_UPGRADES_ENABLED=true` bleibt aus, bis 03
die `Digit0`-Zuordnung geliefert hat. Variante B senkt die Signature auf den
Sockel, und `Digit0` bildet heute auf Index −1 ab – `signaturePower` ist über
die Tastatur nicht erreichbar. Der Spieler verlöre Stärke, die er nicht
zurückkaufen kann. Die beiden Schalter gehören zusammen umgelegt.

**02 hat den Kugel-Vorrang nicht gesehen** – die Anweisung lag noch nicht in
Git, als sie angefangen haben. Sie steht jetzt als einziges Paket in ihrem
Auftrag.

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
