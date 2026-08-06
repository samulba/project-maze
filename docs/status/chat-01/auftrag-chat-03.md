# Auftrag für Chat 03 – Client/UX

**Ausgestellt: 2026-08-06 (7. Fassung) · Basis: aktueller `origin/main`**

> Neu im Chat? Lies zuerst `docs/status/chat-03/UEBERGABE.md`. Danach diese Datei.

Sieben Fehler statt des einen Beispiels, und der schwerste war keiner fürs
Auge: **Mit offener Klassenwahl nahmen 35 % der Bildfläche keine Klicks mehr
an, zusammen mit dem Upgrade-Panel 48 %** – gegen 1,4 % im normalen Spiel. Wer
auf Level 10 in die untere Bildhälfte gezielt hat, hat schlicht nicht gefeuert.
Das erklärt Sams Ärger besser als jede Beschreibung, die er hätte liefern
können.

Deine Diagnose trifft auch den Grund: Panels, die einzeln geprüft wurden und
zusammen nicht funktionieren. Zwei der sieben sind erst aufgegangen, weil die
Familien-Slots seit heute sichtbar sind – aus acht Upgrade-Reihen werden zehn.
Genau die Zustandskombination, die vorher niemand hatte.

Dass der Prüfstand jetzt im Repo liegt, ist mir mehr wert als die Reparaturen.

## Das Paket: den Prüfstand über den Rest laufen lassen

Die Klassenwahl war Sams Beispiel, nicht die Grenze. Nimm `ui-layout-check.mjs`
und geh damit durch, was noch nicht geprüft ist:

- **Death-Screen und Zuschauen** – der schrumpft jetzt, während darunter
  weitergespielt wird. Zwei Zustände übereinander, die es vorher nicht gab.
- **Onboarding, Event-Banner, Bounty, Killfeed, Achievement-Popups** – die
  liegen alle im selben oberen Bereich. Was passiert, wenn drei gleichzeitig
  kommen?
- **Die neuen Unterseiten** aus deinem letzten Paket, auf schmalen Fenstern und
  auf 21:9, mit und ohne Login.
- **Mobile**, falls der Prüfstand das abbilden kann. R3 ist lange her, und
  seither ist viel dazugekommen.

Wieder: erst auflisten mit Reproduktionsweg und Schwere, dann reparieren. Was
du nicht schaffst, bleibt in der Liste und ist damit nicht verloren.

**Wenn der Prüfstand sauber durchläuft**, ist KL3 dran – das Rad, der sichtbare
Klassenbaum als Overlay (`C`) und Startscreen-Enzyklopädie. Alle vier Familien
haben seit heute ihre Signature, und niemand sieht sie. Sag im Bericht, wenn du
so weit bist, dann schreibe ich dir den Auftrag dafür aus.

Statusbericht wie gehabt nach `docs/status/chat-03/`.
