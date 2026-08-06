# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (5. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md` – Rolle, Regeln
> und die Fallen, die uns schon Zeit gekostet haben. Danach diese Datei.

KL2 Precision ist gemerged (686 Tests grün). Zum dritten Mal in Folge hast du
die Vorgabe nicht einfach umgesetzt, sondern durchgerechnet und dann korrigiert
– und die Zahl war jedes Mal überzeugend. Diesmal: Der Masterplan wollte
Schaden **und** Tempo **und** Größe steigen lassen. Ein voll ausgebauter Lancer
trägt 127,9 Schaden, der dünnste voll auf Leben ausgebaute Gegner seiner Stufe
hat 148 Leben – jeder Ladefaktor über 1,16× ist ein Ein-Schuss-Tod aus voller
Entfernung. Und ein Tempobonus hätte deinen eigenen Deckel aus Paket 14
ausgehebelt, ausgerechnet für die Familie, deren Kugeln vorher gar nicht
ausweichbar waren.

Dass die Ladung den Schaden stattdessen vom Klick-Sockel auf den heutigen Wert
führt und der volle Ausschlag Größe und Durchschlag kauft, ist die bessere
Mechanik als die im Plan. Das DPS-Optimum bei 58 % Ladung ist genau das
Entscheidungsfenster, das die Familie braucht.

**Die Bezeichnungen habe ich an 03 weitergegeben:** `signatureRate` =
Ladetempo, `signaturePower` = Ladewucht.

**Drei Schalter warten auf Sams Urteil** und sind noch aus:
`PROJECTILE_SPEED_V2`, `FAMILY_UPGRADES_ENABLED`, `SIGNATURE_PRECISION_ENABLED`.
Sein Urteil kann Zahlen nachziehen – bau nicht darauf auf, als wäre es
entschieden.

## Das Paket: KL2 Control – Einheiten-Budget

Die letzte Familie. Damit ist Klassen 3.0 mechanisch vollständig und der Weg
zu KL5 frei.

Die Signature laut Masterplan: **Drohnen und neue Deployables teilen ein
gemeinsames Budget** (Mini-Turm, Verlangsamungsfeld), Umschichten mitten im
Kampf ist die Kernhandlung. Spielgefühl: Gebiet vorbereiten, Werkzeuge
dirigieren – die Stärke liegt im Management, nicht im Klicken.

Wie bei den drei anderen: eigenes Flag, Default aus, gemeinsames Snapshot-Feld
`signature` (0–100), ein Test belegt, dass ohne Flag alles beim Alten bleibt.

**Vier Dinge, die diesmal von Anfang an dazugehören:**

1. **Deployables sind neue Entitäten im Snapshot.** Das ist der erste
   Signature-Umbau, der die Wire-Form anfasst. Bau nichts in `packages/shared`
   auf Verdacht – liefer mir im Bericht einen **exakten Vorschlag** (Feldnamen,
   Typen, Verhalten unter `SNAPSHOT_DELTAS`), und sag dazu, was du serverlokal
   mit Cast überbrückt hast. Wenn der Vorschlag steht, baue ich ihn ein oder
   gebe ihn dir frei, wie bei KL4.
2. **03 muss sie zeichnen können.** Ein Mini-Turm, den niemand sieht, ist kein
   Feature. Beschreib im Bericht, was der Client braucht, damit ich es
   weitergeben kann – Position, Zustand, Restlebensdauer, wem er gehört.
3. **Kosten nennen.** Deployables sind zusätzliche Entitäten in Kollision und
   Snapshot, und 04s Befund steht: Der Flaschenhals ist der Snapshot-Versand,
   nicht die Physik. Nenn die Kosten je Einheit und hochgerechnet.
4. **Bots müssen das Budget benutzen.** Sonst wird Control für Bots schlechter
   und die Balance verschiebt sich still – dieselbe Falle wie beim Vorhalt in
   Paket 14 und beim Laden in Paket 15, die du beide Male richtig gesehen hast.

Wenn das zu groß für ein Paket ist: **Budget und Drohnen zuerst, Deployables
danach.** Das Umschichten funktioniert auch mit nur einer Einheitenart, und
dann bleibt die Wire-Änderung außen vor. Sag im Bericht, wie du geschnitten
hast.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
