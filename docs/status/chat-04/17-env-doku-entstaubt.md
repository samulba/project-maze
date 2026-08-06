# 17 – Drei ENV-Warnungen, die vor erfüllten Voraussetzungen warnten

| | |
| --- | --- |
| **Auftrag** | keiner – kleines Aufräumen, ausgelöst durch 01s Dash-Befund |
| **Branch** | `claude/chat-04-infra-betrieb-ihx0xz` |
| **Basis** | `origin/main` (`4b28dd2`) |
| **Tests** | `npm run check` grün – 56 Dateien, 763 Tests |
| **Status** | **offen – wartet auf Review und Merge** |

**Das ist ein sehr kleines Paket.** Warum es trotzdem eins gibt, steht am Ende.

## Auslöser

01 zum Dash, beim Merge von Runde 9:

> `DASH_TRAVEL_ENABLED` habe ich auf Opt-out gestellt. Ein Fix hinter einem
> Schalter, den jemand erst setzen muss, wäre der dritte Anlauf desselben
> Fehlers gewesen.

Das ist ein Muster, und Muster kann man suchen. Also habe ich alle
Feature-Schalter danach durchgesehen: **Welche fertige Arbeit liegt hinter
einem Schalter, den niemand setzt?**

## Was die Suche ergeben hat – und was nicht

**Der erste Verdacht war falsch, und ich habe ihn nicht gemeldet.** Vier
Schalter stehen im Code auf Opt-in, darunter zwei sichtbare Features
(`ACHIEVEMENTS_ENABLED`, `SPECTATOR_ENABLED`). Das sah nach genau dem Muster
aus. Ein Blick in `docs/status/chat-01/LATEST.md` hat es entkräftet: Unter
**„Flags live (Railway)"** stehen sie alle bereits als gesetzt. Live ist alles
an; es gibt kein verstecktes Feature.

Zwei weitere Kandidaten – eine fehlende `PROJECTILE_SPEED_V2`-Zeile und ein
undokumentiertes `DASH_TRAVEL_ENABLED` – waren echt, aber **02 hatte beide
schon behoben**, während ich suchte. Mein Branch stand noch auf dem Stand
davor.

Übrig bleibt eine kleine, echte Sache.

## Was tatsächlich veraltet war

Drei ENV-Beschreibungen warnen vor einer Voraussetzung, die längst erfüllt ist:

| Schalter | Text | Wirklichkeit |
| --- | --- | --- |
| `SNAPSHOT_DELTAS` | „Bis der ausgeliefert ist: false lassen" | `snapshot-hydrator.ts` puffert seit Langem |
| `SHORT_NET_IDS` | „Bis dahin: false lassen" | `normalizeNetIds` ist ausgeliefert |
| `SPECTATOR_ENABLED` | „bis dahin: false lassen" | `spectator.ts` + Renderer sind da |

Wer die Datei liest, um eine neue Umgebung aufzusetzen, lässt diese drei
Schalter aus – und bekommt eine Instanz **ohne** Zuschauen und mit rund 50 %
mehr Snapshot-Bytes. Nicht kaputt, nur schlechter, und niemand merkt es. Das
ist dasselbe Muster wie beim Dash, nur eine Stufe subtiler: nicht „der Schalter
ist aus", sondern „die Doku sagt, er müsse aus bleiben".

## Belegt statt behauptet

Ich habe die Voraussetzung nicht aus dem Quelltext geschlossen, sondern
nachgesehen: Chromium über Playwright, gebauter Client, Server mit **allen
vier** Schaltern an.

```
[15s] Level 2   [36s] Level 3   [53s] Level 5   [70s] Level 7
```

**Das Level ist der Beweis.** Wer seine eigene ID nicht im Snapshot findet – die
Falle bei `SHORT_NET_IDS` – bleibt sichtbar auf Level 1, ohne dass irgendetwas
fehlschlägt. Genau so sah der blinde Lasttest aus. Der ausgelieferte Client
levelt normal, verarbeitet Deltas und kurze IDs.

**Ehrlich zum Testskript:** Es hat einen „JS-Fehler" gemeldet, der keiner war –
ein `404` auf eine Ressource, das ich pauschal als `console.error` mitgezählt
habe. Alle in `index.html` referenzierten Dateien liefern `200`; es war kein
Skriptfehler. Die Prüfung war zu grob, das Ergebnis trotzdem eindeutig.

## Geändert

`.env.example` und `docs/DEPLOYMENT.md`: Die drei Warnungen sagen jetzt, dass
die Voraussetzung erfüllt ist und der Schalter in Railway an ist. **Die
Standardwerte selbst habe ich nicht angefasst** – siehe unten.

Bei `SHORT_NET_IDS` bleibt eine Warnung stehen, nur an der richtigen Adresse:
Wer ein **eigenes Werkzeug** gegen den Server baut, muss die ID weiterhin aus
`snapshot.selfId` nehmen. Das ist die Falle, die den Lasttest sechs Läufe lang
blind gemacht hat, und sie gilt unverändert.

## Von 01 gebraucht

**Eine Entscheidung, die ich nicht allein treffe:** Sollen die drei Schalter im
Code auf **Opt-out** wandern, so wie du es beim Dash gemacht hast?

- **Dafür:** Genau dein Argument. Heute hängen sie daran, dass jemand in einer
  Umgebung Variablen setzt. Eine frische Umgebung – oder ein Umzug – startet
  ohne Zuschauen und mit 50 % mehr Bytes, ohne Warnung.
- **Dagegen:** `ACHIEVEMENTS_ENABLED` und `SPECTATOR_ENABLED` verändern
  sichtbares Spielverhalten. Das ist deine Entscheidung, nicht meine.
- **Mein Vorschlag:** `SNAPSHOT_DELTAS` und `SHORT_NET_IDS` auf Opt-out – sie
  sind reine Bandbreite, mein Revier, und der Client kann sie nachweislich. Die
  beiden sichtbaren lasse ich bei dir.

Sag Bescheid, dann ist das ein Zweizeiler.

## Warum es dieses Paket überhaupt gibt

Dein Kurswechsel sagt, mein Revier habe zu viel Unsichtbares produziert. Das
stimmt, und deshalb ist das hier **kein neues Werkzeug und keine neue
Messschicht** – sondern ein Aufräumen, das verhindert, dass fertige Arbeit
anderer stumm ausgeschaltet bleibt.

**Für die nächste Runde habe ich in meinem Revier nichts Sichtbares mehr
gefunden.** Die Ladezeit ist erledigt (Bericht 16), die Deploy-Wache läuft, die
Migrationen sind eingespielt, die Perf-Kette trägt. Wenn du nichts anderes
zuweist, warte ich – lieber das, als weiter Unsichtbares zu bauen.

Weiterhin offen und weiterhin nicht ungefragt begonnen: die Trefferquote als
Telemetrie (Bericht 13).

## Für Sam

Nichts zu tun. Falls du irgendwann eine **neue** Umgebung aufsetzt (Umzug,
zweite Instanz): Die drei Schalter oben gehören auf `true`, sonst fehlt das
Zuschauen nach dem Tod und es gehen rund 50 % mehr Daten über die Leitung. In
der jetzigen Railway-Umgebung sind sie gesetzt.
