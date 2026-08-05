# Statusordner – Chat 01 (Zentrale)

Hier dokumentiert die Zentrale den Integrationsstand: was zuletzt auf `main`
gemerged wurde, welche Flags live sind und was von wem als Nächstes erwartet
wird. `LATEST.md` ist immer der aktuelle Stand.

Die Paket-Berichte der anderen Chats liegen daneben:
[chat-02](../chat-02/README.md) · [chat-03](../chat-03/README.md) ·
[chat-04](../chat-04/README.md). Roadmap: [MASTERPLAN.md](../../MASTERPLAN.md).

## Aufträge (der Rückkanal)

Die Zentrale legt den jeweils NÄCHSTEN Auftrag je Chat hier ab:
`auftrag-chat-02.md` · `auftrag-chat-03.md` · `auftrag-chat-04.md`.

**Stehende Anweisung für die Chats 02/03/04:** Wenn Sam „weiter" schreibt
(oder Ähnliches), gilt:

```
git fetch origin main
git show origin/main:docs/status/chat-01/auftrag-chat-0X.md
```

→ Auftrag lesen, Branch ab `origin/main` starten, Paket bauen, Statusbericht
in den eigenen Statusordner, pushen. Die Auftragsdatei beschreibt immer genau
EIN nächstes Paket; erledigte Aufträge überschreibt die Zentrale mit dem
nächsten.

