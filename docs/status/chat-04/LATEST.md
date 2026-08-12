# 21 – Stand vom 12.08. (zweite Sitzung) und wie es weitergeht

| | |
| --- | --- |
| **Auftrag** | Sam: „erst nachmessen, dann anfassen" – die 79 Rohbefunde aus Bericht 19 |
| **Branch** | `claude/validate-bericht-19-findings-85aiaz` (Sitzungs-Vorgabe; der Merge nach main ist Sams Handgriff) |
| **Basis** | `3834b52` |
| **Tests** | `npm run check` grün – 76 Dateien, 1038 Tests |
| **Status** | 51 Befunde gegengeprüft, **39 behoben** (plus 53 teilweise), 10 bestätigt-aber-offen, 20 ungeprüft |

Dieses Dokument ist der Einstieg für die nächste Sitzung. Der volle Bericht
mit allen Urteilen und Belegen ist
[`21-bericht-19-nachgemessen.md`](21-bericht-19-nachgemessen.md).

## 1. Was diese Sitzung getan hat

Acht Prüf-Agenten haben 51 der 79 Rohbefunde nach dem Schema der ersten
Analyse gegengeprüft (Zeile? andere Schicht? Absicht? erreichbar? Zahlen?).
**48 hielten im Kern – aber fast keiner unverändert:** Befund 2 fiel ganz,
Befund 60 war durch die 29er-Behebung überholt, und quer durch alle gab es
Zeilendrifts, falsche Zählungen und eine falsche Matrix-Behauptung (13: die
Fälle existierten, es fehlte die Messschicht).

**39 Befunde sind behoben und gepusht**, jeder Server-Fix mit Test:

* **Server:** Dash-Abschlag nur noch auf Körperkontakt (62), Telemetrie nennt
  den echten Modus (65), Ladebalken der Fähigkeit springt nicht mehr (66),
  IPv6-/64-Buckets funktionieren gegen echte Angreifer (69), wer lebend geht
  hinterlässt seinen Lauf (52), `runs.kills` zählt je Leben statt je Sitzung
  (58).
* **Respawn-Trilogie Handy:** Sticks überleben den Tod mit liegenden Daumen
  (61), Autofire bleibt an (68), die Klassenwahl klappt auf Touch nicht mehr
  von selbst auf (13). Die touch-probe testet den Fall jetzt so, wie ein
  Mensch spielt – vorher hat sie ihn wegtestet.
* **Beschriftung des Todes (15/28):** Toast und Neustart-Kachel nennen
  Klasse, halbierten Score und XP-Behalt (16–24 %), gerechnet aus denselben
  shared-Formeln wie die Server-Regel. Die Regel selbst ist unangetastet.
* **Handy-Sichtbarkeit (38):** Die Bestenliste ist auf Touch wieder da
  (Top 4, kompakt, weicht der Abruf-Minimap) – die „Übergangslösung" hatte
  das fertige Mobile-Paket monatelang tot geschaltet.
* **Kampfrückmeldung (1, 4, 8, 9, 10, 42/67):** Treffer-Bestätigung mit
  Urheber-Prüfung, der eigene Kill bekommt Zahl und Killfeed-Hervorhebung,
  Drohnen zeigen Treffer/Verlust/Lebensbogen und CONTROL hat eine Tonspur,
  Formen klingen beim eigenen Abschuss, der Schuss-Klang hängt an der Familie
  statt an zwei veralteten Namenslisten, die Klassenwahl hat einen Moment und
  ihre Karte nennt die Füllbedingung der Signature (12).
* **Dazu:** onboarding-active-Leck (14), Level-Toast-Flut samt falscher
  Einzahl (24/33), tote Space-Taste auf Knöpfen (70), klassenabhängige
  Zifferntasten (17), Level im Namensschild (11), eine Familienfarbe je
  Familie (21), Sprachmix (45), roleLabel (44), Startscreen-Steuerzeile (22),
  DROHNEN-Knopf nur für Drohnenklassen (40), kein „ALPHA" im HUD (37), der
  Name überlebt den Reload (54).
* **Retention-Runde:** Ein Gast nimmt etwas mit – lokaler Rekord auf Start-
  und Death-Screen (48 + erste 53er-Zeile), Freischaltungen überleben den
  Reload und zählen in der Galerie (49), die Start-Bestenliste markiert die
  eigenen Zeilen und nennt den Abstand zum letzten Platz (56), welcome
  trägt `achievements`, damit die Galerie nicht verspricht, was der Server
  nicht vergibt (60), und die HUD-Bestenliste zeigt den eigenen Platz mit
  echtem Rang – auch jenseits der Top 8 (19, mit je-Betrachter-Deltas).
* **Zwei Nachzügler:** Pinch-Zoom im Klassenrad mit passendem Hinweistext
  (43) und Drohnen in echter Größe – der Kollisionsradius lag ungenutzt auf
  der Leitung (41).

**Alle Proben sind gefahren und grün:** wire, progress, mode ×3, royale, duo,
touch ×5 (mit den neuen Kriterien) und die Layout-Matrix **199/199** im
zertifizierenden Volllauf. Die Matrix hat unterwegs fünf Folgefehler der
eigenen Fixes gefunden – alle behoben, Details in Bericht 21 Abschnitt 6.

**Zwei Infrastruktur-Funde:** `playwright-core` stand in keiner package.json
(alle Browser-Proben hingen am Zufall des Containers – jetzt devDependency),
und die mode-probe vergleicht jetzt auch die Telemetrie, sonst wäre Befund 65
wieder durchgerutscht.

## 2. Womit anzufangen ist

1. **Sams Entscheidungen abholen** (Abschnitte 3–4 in Bericht 21):
   * **Repulse (63):** Im Code steht eine bewusst geparkte Entscheidung
     („bleibt aus bis zur Messrunde von Welle C") gegen eine Menü-Beschreibung,
     die etwas verspricht, das nicht eintritt. Messrunde oder ehrlicher Text –
     nicht eigenmächtig drehen.
   * **Gegner-Füllstand sichtbar (6):** eine Zeile Code, aber eine
     Design-Entscheidung über sichtbare Information.
   * **Balance-Liste:** 18, 25, 26, 27, 30, 31, 32, 34, 59 – gemessen und
     benannt, Entscheidung offen.
2. **Bot-Gruppe 71–79 nachmessen** – die 20 ungeprüften Befunde sind fast
   alle hier; jede Prüfung braucht Laufzeitmessungen gegen den echten Server,
   und die Hälfte der Fixes wäre zugleich Schwierigkeits-Balance.
3. **Rest der Retention-Runde:** Login-Zeile auf dem Death-Screen (55,
   Wortlaut mit Sam) und die restlichen 53er-Zeilen. Dazu die kleinen
   Wire-Runden 7 (AEGIS-Ereignis) und 5 (Trefferrichtung), wenn Sam nickt.
4. **Prediction-Messlauf (64):** Proben in beiden Stellungen, dann den
   Default entscheiden – die Hausregel verlangt die Absicherung vor dem
   Umlegen, und Prediction-Fehler sind Gummiband, kein roter Test.
5. **Der einzige echte Blocker bleibt Sams:** Migration `0005_sessions.sql`
   und die Railway-Variablen – ohne sie misst die dreizehnte Zeile nicht.

## 3. Die Lehre der Sitzung, in einem Satz

Die Gegenprüfung hat diesmal vor allem **Behebungen verhindert** – Befund 2
wäre eine Verschlimmbesserung gewesen, 63 hätte eine dokumentierte
Entscheidung überschrieben, 64 die Hausregel abgekürzt – und zweimal lag der
Fehler im Messwerkzeug statt im Spiel: Eine Probe, die den Fall wegtestet
(touch-probe), und eine Matrix, die ihn sieht, aber nicht wertet
(`opacity < 0.05`), sind die teuerste Art von grün.
