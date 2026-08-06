# 16 – Die Seite lud dreimal zu viele Bytes

| | |
| --- | --- |
| **Auftrag** | keiner – Reaktion auf Sams Befund „ich merke einfach viel zu wenig davon" |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`999d66e`) |
| **Tests** | `npm run check` grün – 54 Dateien, 745 Tests (14 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Warum dieses Paket

01s Kurswechsel benennt das Problem, und er benennt dabei mein Revier:

> Die letzten Runden gingen an Prüfstände, Balance-Läufe, Telemetrie und
> Deploy-Wachen – alles richtig, nichts davon sichtbar.

Das stimmt, und die letzten fünf Pakete von mir waren genau das. Also habe ich
**keine weitere Telemetrie gebaut**, sondern die einzige Sache in meinem Revier
gesucht, die Sam unmittelbar merkt: wie schnell die Seite lädt.

Und da lag etwas.

## Der Befund

`express.static` komprimiert nicht. Der Browser fragt bei jedem Abruf nach
`Accept-Encoding: gzip, deflate, br` – der Server hat die Frage ignoriert und
das volle Bundle geschickt:

```
GET /assets/index-*.js
  Accept-Encoding: gzip, deflate, br
  → 200, Content-Length: 643983      (kein Content-Encoding)
```

**Über die Leitung gingen 926 KB, nötig wären 218 KB.** Das ist der Unterschied
zwischen „ist sofort da" und „lädt spürbar" – und er trifft ausgerechnet den
ersten Eindruck, jedes Mal aufs Neue, am stärksten auf Mobilfunk.

Dass es niemandem auffiel, hat einen Grund: **`apps/client/nginx.conf` hat
`gzip on`.** Der Compose-Pfad war also immer in Ordnung. Nur läuft
www.mazers.de nicht über nginx, sondern über den Node-Server im
Single-Service-Betrieb – und dort gab es die Schicht nicht. Zwei Betriebsarten,
eine davon seit jeher unkomprimiert.

## Was gebaut wurde

| | über die Leitung |
| --- | --- |
| vorher | **926 KB** |
| gzip | 261 KB |
| brotli | **218 KB** (−76 %) |

Gemessen am größten Einzelbrocken: `643 983` → `157 427` Bytes.

**`scripts/precompress.mjs`** legt beim Build neben jede Textdatei eine `.br`-
und eine `.gz`-Fassung. Ohne neue Abhängigkeit – `zlib` steckt in Node.

**`apps/server/src/static-assets.ts`** liefert sie aus, wenn der Browser sie
akzeptiert, und fällt sonst still auf das Original zurück.

## Die eine Entscheidung, die hier zählt

**Komprimiert wird beim Build, nicht zur Laufzeit.** Die naheliegende Lösung
wäre die `compression`-Middleware gewesen – drei Zeilen statt zweier Dateien.
Sie ist hier trotzdem die falsche:

Dieser Prozess ist ein **Spielserver mit 40 Hz Tick**, und der Tick-Abstand
liegt schon heute bei 26–28 ms über dem 25-ms-Soll. Ein 630-KB-Bundle zur
Laufzeit zu gzippen kostet 15 bis 25 ms CPU – **einen ganzen Tick, jedes Mal,
wenn jemand die Seite lädt.** Ein einzelner Seitenaufruf hätte für alle in der
Arena einen Ruckler erzeugt. Ausgerechnet beim Betreten des Spiels.

Vorkomprimiert kostet die Auslieferung **nichts** und komprimiert obendrein
stärker, weil die Rechenzeit beim Build keine Rolle spielt (Brotli auf Stufe 11
statt der Laufzeit-Voreinstellung).

## Vier Dinge, die leicht schiefgehen

**1. Der Content-Type darf nicht von der Endung kommen.** Wer
`app.js.br` ausliefert und den Typ aus dem Dateinamen ableitet, schickt
`application/brotli` – und der Browser weigert sich, das als Skript
auszuführen. Der Typ kommt deshalb aus der **Originalendung**.

**2. `Vary: Accept-Encoding` gehört auf jede Antwort**, auch auf die
unkomprimierte. Ohne den Header liefert ein Proxy die Brotli-Antwort an einen
Client aus, der sie nicht lesen kann. Ist als Test hinterlegt.

**3. Kein Verzeichniswechsel nach oben.** Der angefragte Pfad wird aufgelöst
und danach geprüft, dass das Ergebnis wirklich unterhalb des Client-Ordners
liegt. `/../../etc/passwd.js` läuft ins Leere – ebenfalls getestet.

**4. Ein vergessener Build-Schritt macht die Seite langsamer, nie kaputt.**
Fehlt die `.br`-Datei, geht das Original raus wie vorher.

## Verifiziert

Gegen einen laufenden Server, alle vier Fälle:

| Anfrage | Ergebnis |
| --- | --- |
| `Accept-Encoding: gzip, deflate, br` | `br`, 157 427 Bytes, `Content-Type: text/javascript` |
| `Accept-Encoding: gzip` | `gzip`, 190 101 Bytes |
| ohne `Accept-Encoding` | Original, 643 983 Bytes, `Vary` gesetzt |
| Inhalt dekomprimiert | identisch mit dem Original |

Dazu **14 neue Tests**, darunter die vier Fallen oben und die Fälle, in denen
gar nichts komprimiert ausgeliefert werden darf.

## Grenzen

- **`index.html` selbst wird nicht vorkomprimiert ausgeliefert.** Sie geht über
  den SPA-Fallback, nicht über diese Schicht. Bei 1 749 Bytes wäre der Gewinn
  rund 800 Bytes – das ist die Komplexität nicht wert, und den Fallback dafür
  anzufassen wäre Routing-Risiko für nichts.
- **Der Compose-Pfad ist unberührt.** Dort komprimiert nginx weiterhin selbst.
- Bilder und Schriften bleiben außen vor – die sind bereits komprimiert.

## Bewusste Abweichungen

**Dieses Paket war nicht beauftragt**, und es ist bewusst *kein*
Telemetrie-Paket. Nach 01s Kurswechsel wäre noch eine Messschicht das Gegenteil
dessen, was gerade gebraucht wird. Wenn 01 die Reihenfolge anders sieht: Das
Paket ist in sich abgeschlossen und blockiert nichts.

**Ich habe die Trefferquote-Telemetrie weiterhin nicht angefangen** (offen aus
Bericht 13). Sie wäre der nächste Schritt für eine Zahl beim Projektiltempo –
und genau die Sorte unsichtbare Arbeit, die gerade zurückstehen soll.

## Von 01 gebraucht

1. **Merge.** Danach ist die Seite beim nächsten Deploy dreimal schneller
   geladen – ohne dass jemand etwas umstellen muss.
2. **Zum Nachprüfen nach dem Deploy**, ein Befehl:
   ```bash
   curl -sI -H 'Accept-Encoding: br' https://www.mazers.de/assets/<datei>.js \
     | grep -i 'content-encoding\|content-length'
   ```
   Steht dort kein `Content-Encoding`, lief der Build ohne `precompress`.
3. **Falls Railway einen eigenen Build-Befehl gesetzt hat** (`npm ci && npm run
   build` laut `DEPLOY.md`), greift der Schritt automatisch – er hängt an
   `npm run build`. Sollte dort etwas anderes stehen, muss `npm run precompress`
   ergänzt werden.

## Für Sam

Das ist eines der wenigen Dinge aus meinem Revier, die du direkt merken
solltest: **Die Seite sollte nach dem nächsten Deploy spürbar schneller
aufgehen**, besonders beim ersten Besuch und auf dem Handy. Statt 926 KB gehen
218 KB über die Leitung.

Wenn sich nichts ändert, sag Bescheid – dann ist der Build-Schritt bei Railway
nicht mitgelaufen, und das steht oben unter Punkt 2 zum Nachprüfen.
