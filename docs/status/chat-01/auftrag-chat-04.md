# Auftrag für Chat 04 – Infra/Betrieb

**Ausgestellt: 2026-08-06 (4. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-04/UEBERGABE.md` – Rolle, Regeln,
> Sicherheitsauflagen und die Fallen, die uns schon Zeit gekostet haben.
> Danach diese Datei.

Die verdichteten Balance-Läufe sind gemerged. **Du hast die Frage beantwortet,
an der die letzte Messung hing:** Der gleichzeitige Einbruch von Control und
Impact war Streuung, keine Wirkung – Control-K/D schwankte zwischen zwei
identisch konfigurierten Läufen von 0,43 bis 1,23. Damit ist eine Fährte
erledigt, der wir sonst hinterhergelaufen wären.

Der `--seed` ist die eigentliche Ausbeute. Besonders die Begründung, warum
**jeder Client einen eigenen Strom** bekommt statt eines gemeinsamen: Wer wann
aus einem geteilten Strom zieht, hängt an der Antwortreihenfolge der Sockets –
also genau an dem Timing, das ein Seed nicht kontrolliert. Ein gemeinsamer
Strom hätte reproduzierbar ausgesehen und es nicht sein müssen. Genau die Sorte
Falle, die eine Messung still wertlos macht.

## Das Paket

### 1. Die Deploy-Wache scharf machen (offen aus der letzten Runde)

`scripts/deploy-watch.mjs` pollt weiterhin nur `commit`. Du hast
`uptimeSeconds` selbst eingebaut, aber die Wache benutzt es nicht – das ist die
Lücke. Solange `RAILWAY_GIT_COMMIT_SHA` möglicherweise fest verdrahtet ist,
kann die Wache heute nie grün werden, und eine dauerhaft rote Wache wird nach
drei Tagen ignoriert.

Die Wache muss **drei Fälle unterscheiden** und in der Fehlermeldung benennen:

- `commit` stimmt → alles gut.
- `commit` stimmt nicht, aber `uptimeSeconds` ist klein → der Deploy **ist**
  angekommen, die Git-Variable lügt. Das ist kein Deploy-Problem, und die Wache
  darf es nicht als solches melden.
- `commit` stimmt nicht **und** der Prozess läuft seit Stunden → jetzt ist es
  wirklich ein Deploy-Stopp.

Halte es klein. Der Wert liegt in der richtigen Diagnose, nicht im Umfang.

### 2. KL5 vorbereiten: die erste gepaarte Messung

Du hast jetzt das Werkzeug, das dafür fehlte. Auf `main` liegen seit heute drei
neue Schalter, die alle Balance verändern und **alle noch aus sind**:

- `PROJECTILE_SPEED_V2` – Dämpfer, Level-Deckel, Boden (02, Paket 14)
- `FAMILY_UPGRADES_ENABLED` – Familien-Upgrades (02, Paket 13)
- `SIGNATURE_PRECISION_ENABLED` – Ladeschuss für Precision (02, Paket 15)

Fahr davon die gepaarten A/B-Vergleiche, die dich am meisten interessieren –
deine Wahl, welche und wie viele, begründet im Bericht. Mich interessiert vor
allem: **Was macht das Projektiltempo mit den Familien?** 02 hat gerechnet,
dass der Deckel bei den schnellen Klassen bindet und die langsamen unberührt
lässt. Gerechnet ist nicht gemessen.

Ergebnis als eingefrorener Abzug unter `docs/balance/`, die alten bleiben
liegen.

## Kontext

- **Sam beurteilt die drei Schalter gerade live.** Sein Urteil kann Zahlen
  ändern; miss den Ist-Stand, aber bau nicht darauf, als wäre er endgültig.
- **03 hat die Ränder gemessen** und meine Vermutung widerlegt: Die
  Viewport-Härtung hält, die Ränder waren das feste 16:9. Es gibt jetzt einen
  zweiten Sichtfeld-Modus, der die Fläche konstant hält. Für dich nur relevant,
  falls Sam über Optik berichtet.
- `RATE_LIMIT_CONNECTIONS_PER_IP` bleibt in Produktion **5**.

Statusbericht wie gehabt nach `docs/status/chat-04/`, als nummerierte Datei
plus `LATEST.md`.
