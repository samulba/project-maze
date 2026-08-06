# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (4. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md` – Rolle, Regeln
> und die Fallen, die uns schon Zeit gekostet haben. Danach diese Datei.

Projektiltempo 2.0 ist gemerged (639 Tests grün). Das war die beste Analyse,
die in diesem Projekt bisher geliefert wurde: Du hast den naheliegenden Weg –
kräftigerer globaler Dämpfer – durchgerechnet und mit einer Zahl erledigt, die
niemand von uns auf dem Schirm hatte (Fortress-Projektil 450 px/s gegen 447
px/s Spielertempo). Dass das Problem die **Spreizung** ist und nicht der
Mittelwert, hat Sams zweite Forderung sauber getroffen. Und dass Precision
seine Sonderbehandlung verliert, weil die Kugel dort als einzige gar nicht
ausweichbar war, ist eine Revision deiner eigenen früheren Entscheidung – genau
so soll das laufen.

Eine Kleinigkeit habe ich beim Merge korrigiert: Der neue Flag-Block war
zwischen den Kommentar von `RATE_LIMITS_ENABLED` und die Konstante geraten.

**Der Schalter ist noch aus.** Sam beurteilt zuerst live, ob sich das Tempo
jetzt richtig anfühlt. Sein Urteil kann Zahlen nachziehen – bau nicht darauf
auf, als wäre es entschieden.

## Das Paket: KL2 Precision – Ladeschuss

N2 ist gemerged, damit ist die Reihenfolge aus dem MASTERPLAN erfüllt:
**Rapid → Impact → Precision (nach N2) → Control.** Precision ist dran.

Die Signature laut Masterplan: **Halten lädt den Schuss auf** (Schaden, Tempo
und Größe steigen), ein Sofortklick ist ein schwacher Schuss. Spielgefühl:
Timing und Positionsspiel statt Klick-Spam – wer spammt, produziert nur
Schwachschüsse.

Wie bei Rapid und Impact: hinter einem eigenen Flag, Default aus, gemeinsames
Snapshot-Feld `signature` (0–100), ein Test belegt, dass ohne Flag alles beim
Alten bleibt.

**Drei Dinge, die diesmal von Anfang an dazugehören:**

1. **Der Ladeschuss trifft direkt auf dein eigenes Projektiltempo 2.0.** Ein
   aufgeladener Schuss soll schneller fliegen – aber über dem Deckel liegt er
   dann trotzdem nicht, und genau der Deckel war Sams Anliegen. Sag im Bericht,
   wie du das auflöst: Ladung hebt den Deckel an, oder Ladung wirkt auf Schaden
   und Größe statt auf Tempo. Ich habe eine Vermutung, aber du hast die Zahlen.
2. **Der Slot `signatureRate`/`signaturePower` existiert schon** (KL4).
   Precision bekommt seine Wörter, sobald diese Signature steht – nenn mir im
   Bericht die beiden Bezeichnungen, dann gebe ich sie an 03 weiter
   (Vorschlag aus dem Masterplan: Ladetempo / Ladebonus).
3. **Bots müssen laden können.** Sonst wird Precision für Bots schlechter, und
   das verschiebt die Balance still – dieselbe Falle wie beim Vorhalt, den du
   diesmal richtig ausgeglichen hast.

Wenn du die Machbarkeit anders einschätzt als der Masterplan – etwa weil
Halten-und-Loslassen über das Netz schlechter funktioniert, als es sich liest –
dann sag das **vor** dem Bau. Ein Konzept mit Zahlen ist genauso wertvoll wie
Code.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
