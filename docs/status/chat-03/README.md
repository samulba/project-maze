# Statusordner Chat 03 – Client/UX

Hier liegt das, was bisher am Ende jedes Chats von Hand an die Zentrale
weitergereicht wurde: pro Paket ein Statusblock mit Branch, Basis, geänderten
Dateien, Testergebnis, offenen Punkten für 01 und bewussten Abweichungen.

**Chat 03 pflegt diesen Ordner selbst.** Nach jedem fertigen Paket kommt eine
neue Datei dazu, `LATEST.md` und `index.json` werden mitgezogen und alles
direkt nach `main` gepusht. Kein Copy-Paste mehr.

## Für die Zentrale (01)

| Was | Wo |
|-----|-----|
| Nur der jüngste Statusblock | `LATEST.md` |
| Maschinenlesbare Übersicht aller Pakete | `index.json` |
| Einzelnes Paket im Detail | `NN-<slug>.md` |

`index.json` trägt je Paket `status` (`in main` oder `offen`) und
`braucht_von_01` – das ist die Arbeitsliste. Ein Paket gilt erst als erledigt,
wenn sein Branch in `main` ist **und** die dort genannten Punkte erledigt sind.

## Format eines Pakets

- **Branch / Basis** – worauf gebaut wurde, damit 01 nicht raten muss
- **Was drin ist** – knapp, in Prosa
- **Nachgewiesen** – wie im Browser geprüft wurde, mit Zahlen statt „sieht gut aus"
- **Von 01 gebraucht** – was nach dem Merge noch passieren muss
- **Abweichungen und Grenzen** – alles, was vom Auftrag abweicht oder ungeprüft
  bleiben musste, mit Begründung

## Revier und Regeln

Chat 03 arbeitet nach `docs/TEAMPLAN.md`: Rendering, HUD, Mobile und Design in
`apps/client`. `packages/shared` und `apps/server` fasst 03 nicht an – nötige
Typen kommen als Wunsch im jeweiligen Paket und werden bis dahin per Cast
überbrückt (Muster: `spectatorTargetId`).

Ausnahme von Regel 2 („nur 01 pusht auf main"): Dieser Ordner wird auf
ausdrückliche Anweisung von Sam direkt nach `main` geschrieben. Er enthält
ausschließlich Dokumentation – kein Code, keine Konfiguration. Jeder Push auf
`main` löst allerdings einen Railway-Redeploy aus; deshalb landet hier nur ein
Commit pro fertigem Paket, nicht jede Zwischennotiz.

## Prüfwerkzeug

Client-Arbeit lässt sich nicht durch Unit-Tests allein belegen. Was hier unter
„Nachgewiesen" steht, kommt aus einem Chromium über `playwright-core`, der die
Seite lädt, dem WebSocket zuhört (oder Snapshots unterschiebt) und Pixel misst.
Die Skripte sind Wegwerfware und liegen nach Regel 7 unter `.probe/`.

**Grenze dieser Umgebung:** Der Testbrowser rendert per Software-GL mit rund
**3 Bildern pro Sekunde**. Alles, was kürzer als eine halbe Sekunde dauert
(Rückstoß, Mündungsblitz, Einblend-Animationen), ist darin nicht abtastbar.
Solche Effekte werden – wo möglich – als reine Funktion herausgezogen und per
Unit-Test belegt; ansonsten steht im Paket ausdrücklich, dass die Wirkung auf
echter Hardware zu beurteilen ist.
