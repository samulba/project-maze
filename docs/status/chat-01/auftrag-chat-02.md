# Auftrag für Chat 02 – Server-Gameplay

**Ausgestellt: 2026-08-06 (6. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-02/UEBERGABE.md` – Rolle, Regeln
> und die Fallen, die uns schon Zeit gekostet haben. Danach diese Datei.

KL2 Control ist gemerged (707 Tests grün). **Klassen 3.0 ist damit mechanisch
vollständig** – alle vier Familien haben ihre Signature, gebaut von dir, in
vier Runden. Der Schnitt war richtig: Budget und Drohnen jetzt, Deployables als
Vorschlag, damit die Wire-Form unangetastet bleibt.

Am stärksten fand ich, dass beide Zahlen aus den Werten der Klasse fallen und
sich im Mittel nichts ändert – was sich ändert, ist die **Verteilung**. Wer
eine Weile nichts verliert, stellt eine ausgelöschte Flotte sofort wieder hin;
wer zweimal kurz hintereinander verliert, steht ohne Nachschub da. Das ist die
Management-Handlung, die ein Zeitgeber prinzipiell nicht leisten kann.

## Etwas, das dich betrifft: deine Pakete lagen dunkel

`PROJECTILE_SPEED_V2` war als Opt-in gebaut, wie unsere Regel es vorschreibt.
Ergebnis: Sam hat **zweimal** „die Kugeln sind viel zu schnell" gemeldet,
während dein Paket fertig und getestet auf `main` lag und keine einzige Kugel
angefasst hat. Niemand hatte den Schalter umgelegt.

Ich habe daraus die Regel geändert (steht in meiner UEBERGABE): Default aus
gilt beim Mergen; sobald das Paket integriert ist und nichts mehr blockiert,
stellt **01** auf Opt-out um. Alle vier Signature-Flags, die Familien-Upgrades
und das Projektiltempo stehen jetzt auf an.

Beim Umstellen habe ich dein Tempo-Paket gleich eine Stufe schärfer gezogen,
weil zwei Runden ins Leere gelaufen waren: **Dämpfer 0,70 → 0,60, Deckel
2,6/1,8 → 2,0/1,35.** Deinen Boden habe ich nicht angefasst – er tut genau das,
wofür du ihn gebaut hast, und Fortress bleibt bei 450 px/s unverändert. Das
obere Ende fällt damit von 4,36× auf 1,62× Spielertempo. **Wenn du diese Zahlen
für falsch hältst, sag es** – ich habe sie nach Sams Ungeduld gewählt, nicht
nach einer Messung.

## Das Paket: KL5 – die Balance-Runde, die das alles zusammenbindet

Vier Signatures, Familien-Upgrades und ein neues Projektiltempo sind seit heute
gleichzeitig live. **Keine dieser Wirkungen ist zusammen mit den anderen
gemessen worden.** Genau dafür ist KL5 im Masterplan vorgesehen, und jetzt ist
der Zeitpunkt.

04 hat dir das Werkzeug gebaut, das bisher fehlte: `--seed` im Lasttest, mit
einem eigenen Zufallsstrom je Client. Damit treffen beide Seiten eines A/B
dieselben Entscheidungen und lassen sich **paarweise** vergleichen, statt zwei
unabhängige Stichproben gegeneinanderzuhalten. Ohne das war die letzte Messung
an der Streuung gescheitert – Control-K/D schwankte zwischen zwei identischen
Läufen von 0,43 bis 1,23.

Was ich wissen will:

1. **Ist jede Familie am Spielgefühl erkennbar?** Das ist die Messlatte aus dem
   Masterplan. Übersetze sie in Zahlen, die du messen kannst – Pickrate, K/D,
   Überlebenszeit, Trefferquote, wie oft eine Signature überhaupt zum Tragen
   kommt.
2. **Dominiert eine?** Mit den Schwellen, die du für die Dominanzprüfung schon
   definiert hast.
3. **Was hat mein schärferes Projektiltempo angerichtet?** Ich habe an deinen
   Zahlen gedreht, ohne zu messen. Miss es nach und widersprich mir, wenn es
   Schaden anrichtet – bei Precision zuerst, die Familie hängt am Tempo.

Abstimmung mit 04 läuft über mich: Wenn du Läufe brauchst, die deren Revier
berühren, schreib es in den Bericht, ich gebe es weiter.

**Wenn du dabei Balance-Werte ändern willst: erst Zahlen, dann Code** – wie
immer, und es hat jedes Mal funktioniert.

Statusbericht wie gehabt nach `docs/status/chat-02/`.
