# Statusordner Chat 02 – Server-Gameplay

Hier liegt das, was bisher am Ende jedes Chats von Hand an die Zentrale
weitergereicht wurde: pro Paket ein Statusblock mit Branch, Basis, geänderten
Dateien, Testergebnis, offenen Punkten für 01 und bewussten Abweichungen.

**Chat 02 pflegt diesen Ordner selbst.** Nach jedem fertigen Paket kommt eine
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
wenn sein Branch in `main` ist **und** die dort genannten Shared-Typen stehen.

## Format eines Pakets

- **Branch / Basis** – worauf gebaut wurde, damit 01 nicht raten muss
- **Was drin ist** – knapp, in Prosa
- **Tests** – Anzahl neu / gesamt, plus durchgeführte Mutationsproben
- **Von 01 gebraucht** – exakte Shared-Vorschläge, fertig zum Einbauen
- **Abweichungen** – alles, was vom Auftrag abweicht, mit Begründung

## Revier und Regeln

Chat 02 arbeitet nach `docs/TEAMPLAN.md`: Simulation, Events, Balance und
Netz-Encoding in `apps/server`. `packages/shared` und `apps/client` fasst 02
nicht an – nötige Typänderungen stehen als fertiger Vorschlag im jeweiligen
Paket.

Ausnahme von Regel 2 („nur 01 pusht auf main"): Dieser Ordner wird auf
ausdrückliche Anweisung von Sam direkt nach `main` geschrieben. Er enthält
ausschließlich Dokumentation – kein Code, keine Konfiguration.
