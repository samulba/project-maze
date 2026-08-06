# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (2. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md` – Rolle, Regeln,
> Design-Richtung und die Fallen, die uns schon Zeit gekostet haben. Danach
> diese Datei.

R1/R2/R4 ist gemerged – Handlungsfeld 1 ist damit client-seitig durch. Der
eigentliche Fund deines Pakets war nicht der Vollbild-Knopf, sondern dass die
Renderauflösung auf dem Startwert klebte: ein Zoom- oder Monitorwechsel ändert
nur `devicePixelRatio` und löst kein `resize`. Der Sekundenvergleich als Netz
unter der Medienabfrage ist genau die richtige Antwort auf „sauber, aber nicht
überall zuverlässig".

**Merge-Hinweis:** Dein Branch saß auf dem Commit *vor* dem Design-Umbau. Die
Konflikte lagen in `start.css` und `controls.css` – deine neuen Elemente
(Grafikstufe, Vollbild, Dropdown-Optionen) trugen noch Dunkel-Festwerte
(`#141926`, `#7d859b`, `#cfd4e4`) und nutzen jetzt die Theme-Variablen. Dein
Letterbox-Rand zeichnet mit `palette.outside` und passte sich von selbst an –
das war gut gebaut. Bitte ab jetzt konsequent über die Variablen gehen, das
Standard-Theme ist hell.

## Design-Basis: der helle Look ist zurückgebaut (bitte zuerst lesen)

Falls du irgendwo noch vom „Diep-Look" liest – der ist Geschichte. Sam hat den
hellen Grundlook live gesehen und verworfen; **01 hat ihn am 06.08.
zurückgebaut** (Revert von `77f8a3f`). Der Grundlook ist wieder der dunkle
Stand: `:root` dunkel (`--bg:#151a26`, `--text:#e8ebf3`, Akzent `#6f7ad6`),
kein `STYLE`-Block und kein `darken()` mehr im `renderer.ts`.

Deine Elemente aus R1/R2/R4 (Grafikstufe, Vollbild-Knopf, Letterbox) haben den
Rückbau überlebt und hängen an den Theme-Variablen – **bitte weiter über die
Variablen gehen**, dann trägt so ein Wechsel dich nicht mehr mit.

Merksatz aus dem MASTERPLAN, der beide Richtungswechsel überlebt hat: **ruhig
und minimalistisch JA, düster NEIN.** Grundlook-Änderungen nur nach
Screenshot-Freigabe durch Sam über 01.

## VORRANG (Sam, 06.08. live): drei Befunde aus dem Spiel

N2 rutscht dahinter. Das hier hat Sam beim Spielen gestört, in seinen Worten:

**1. „Die Ränder links rechts sind jetzt nur noch fetter ingame, das ist nicht
responsive!"**

Ich habe es nachgestellt (Screenshot-Pipeline, 2560×1080): Das Spielfeld steht
als schmale Spalte in der Mitte, links und rechts je rund ein Viertel der
Breite ist tote Fläche – und die HUD-Elemente (Spielerkarte, Killfeed, TOP
PLAYERS, Minimap, DASH) liegen **in** diesen toten Bändern, weil sie am
Fenster hängen und nicht am Spielfeld. Auf dem Stand vor R2 lief die Arena
randlos über die volle Breite.

**Sams Nachtrag, und der verschiebt die Diagnose:** *„immer wenn ich
Vollbildmodus wechsle oder in keinem bin, gibt es die – also es gibt viele
Bugs."* Es ist also nicht in erster Linie die Ultrawide-Grundsatzfrage,
sondern **ein Fehler rund um den Vollbildwechsel und den Fensterbetrieb**.
Genau das war R1s Auftrag („auf `fullscreenchange`, `orientationchange`,
`visualViewport.resize` und devicePixelRatio-Wechsel reagieren"), und es hält
offensichtlich nicht.

Fang bei der Reproduktion an, nicht beim Umbau: rein und raus aus dem
Vollbild, im Fenster, Fenstergröße ziehen, Zoomstufe wechseln, zweiter
Monitor. Sag im Bericht, welcher dieser Wege die Bänder erzeugt und warum –
mein Verdacht ist eine Reihenfolge zwischen `fullscreenchange` und dem
Neuberechnen von Auflösung, Maske und Letterbox, aber das ist geraten und du
misst es.

Drei Dinge, die dabei mit auf den Tisch gehören:

1. **Das HUD hängt am Fenster, nicht am Spielfeld.** Deshalb landen
   Spielerkarte, Killfeed, TOP PLAYERS und Minimap in der toten Fläche, sobald
   es eine gibt. Das ist unabhängig von der Ursache falsch.
2. **Die Grundsatzfrage bleibt offen:** Der Masterplan hat die feste
   16:9-Sicht mit Fairness begründet (wer breiter sieht, sieht Gegner früher).
   Wenn deine Messung zeigt, dass die Bänder auch bei korrektem Verhalten
   bleiben, sag mir, was du für richtig hältst – Sichtfeld mitwachsen lassen
   oder 16:9 halten und die Bänder gestalten.
3. **Kein Bug ohne Test.** Was du reproduzieren kannst, kannst du auch
   festnageln, damit es nicht ein drittes Mal wiederkommt.

**2. „Der HOMESCREEN – dass man da direkt alle Achievements + Leaderboard
sieht, ist komplett kake. Die sollten alle geile cleane Unterseiten bekommen,
genauso wie Profil, Einstellungen etc. Nicht alles auf eine Seite
reinballern."**

Der Startscreen ist über K2, A4 und die Achievements-Galerie zu einer langen
Seite gewachsen. Bau ihn zu einer Navigation um: Start bleibt Logo, Name und
**ARENA BETRETEN** – nichts sonst. Alles andere wird eine eigene, ruhige
Unterseite (Profil · Achievements · Bestenliste · Einstellungen). Das ist dein
Revier und deine Handschrift; ich gebe dir keine Kästchen vor. Zwei Auflagen:
der Weg ins Spiel wird **nicht** länger als heute, und die Unterseiten laufen
über die Theme-Variablen.

**3. „‚Du siehst Killer zu' funktioniert nicht so geil, weil ja drüber immer
das Popup ist und ich gar nichts sehe."**

Bestätigt, ich sehe es auf seinem Screenshot: Das Banner „DU SIEHST NOVA ZU"
steht oben, aber die große ELIMINIERT-Karte liegt mittig im Bild und verdeckt
genau das, was man zusehen soll. Der Zuschauermodus nach dem Tod ist damit
funktionslos. Löse den Konflikt – die Karte kompakt an den Rand, oder sie
zieht sich nach ein paar Sekunden zusammen, oder Zuschauen ist ein bewusster
Schritt aus dem Death-Screen heraus. Respawn und „ZUM STARTSCREEN" müssen
jederzeit erreichbar bleiben.

## Danach: N2 Client-Prediction

Das größte verbleibende Feel-Paket (`docs/CLIENT_PREDICTION.md`;
`lastProcessedInput ?? -1`). Der Server setzt das Feld bereits immer.
Bei Fragen zur Bewegungsintegration ist 02s Doku maßgeblich, nicht der
Code-Augenschein – `ACCELERATION_SCALE` liegt in `packages/shared` und die
Vorhersage muss ihn spiegeln, sonst driftet sie systematisch.

## Zwei kleine Zulieferungen, die mit ins Paket können

1. **Deinen `tier`-Vorschlag nehme ich an:** Die Qualitätsstufe läuft als
   eigenes Feld (`{"quality":"webgl","tier":"mid"}`), nicht als kombiniertes
   Label – deine Begründung mit der Kardinalität (4 → 12) ist richtig, und der
   bestehende `/metrics`-Export ist auf 4×4 ausgelegt. **04 erweitert die
   erlaubten Felder serverseitig** (steht in deren Auftrag). Deine zwei Zeilen
   im Client kannst du danach nachziehen; solange der Server `tier` noch mit
   400 ablehnt, bleibt das Feld ungesendet – dass du es nicht auf Verdacht
   eingebaut hast, war richtig.
2. **KL4-UI (klein, aber blockierend für 02):** `Digit0` in `input.ts` auf
   Index 9 abbilden – heute liefert die Taste `-1` und ist tot. Dazu die zwei
   neuen Upgrade-Knöpfe familienabhängig beschriften (RAPID: Momentum-Aufbau /
   Momentum-Maximum · IMPACT: Wucht-Skalierung / Aufprall-Erholung · Precision
   und Control bekommen ihre Wörter, wenn deren Signatures stehen) und die
   Core-Sperre sichtbar machen. 02 baut die Server-Seite hinter
   `FAMILY_UPGRADES_ENABLED` – ohne Flag ändert sich nichts, ihr könnt also
   unabhängig voneinander fertig werden.

Wenn N2 dadurch zu groß wird: N2 zuerst, die zwei Zulieferungen im Paket
danach. Sag im Statusbericht, wie du geschnitten hast.

Statusbericht wie gehabt nach `docs/status/chat-03/`.
