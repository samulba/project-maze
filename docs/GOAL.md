# MAZERS – das Ziel

Stand: 11.08.2026. Dieses Dokument ist der Nordstern. Wenn eine Aufgabe nicht
auf eine der Zeilen hier einzahlt, ist sie nicht dran.

---

## In einem Satz

MAZERS ist eine gesunde Mischung aus Diep.io und Arras.io: viele Tanks mit
echten Rollen statt nur unterschiedlich schneller Kugeln, mehrere Modi, eine
Karte, die sich groß anfühlt – und es fühlt sich an wie ein fertiges Spiel,
nicht wie ein Prototyp.

„Fertig" ist kein Gefühl, das wir uns selbst bescheinigen. Es ist die Liste
unten, und die ist prüfbar.

---

## Was „fertig" heißt

| Zeile | Womit geprüft | Stand heute |
|---|---|---|
| Regeln und Typen stimmen | `npm run check` grün | ✅ |
| Keine UI, die sich überlappt oder aus dem Bild läuft | `scripts/ui-layout-check.mjs` 181/181 | ✅ |
| Kein Tank ist Müll, keiner ist Pflicht | Balance-Korridore in `packages/shared/src/balance.test.ts` | ✅ |
| Kein Upgrade ohne Wirkung | `upgradeAppliesTo` + Test „haelt Projektil-Upgrades von Klassen ohne Rohr fern" | ✅ |
| Kein Knopf ohne Server-Antwort | Alle 8 Familien-Signatures serverseitig verdrahtet | ✅ |
| Keine Serverlags bei voller Arena | Tick p95 < 25 ms **und ≤ 160 KB/s pro Spieler** | ✅ 118,8 KB/s (war 229,6) |
| Die Leitung Server→Client ist heil | `npm run wire-probe` grün | ✅ |
| Mehrere Modi | Zwei spielbare Modi im Client wählbar | ❌ 0 von 2 |
| Es fühlt sich groß an | Karte + Spielerzahl laut Entscheidung 3 | ❌ |
| **Fremde kommen wieder** | Admin-Portal: wiederkehrende `device_id` über 7 Tage | 🔍 misst ab jetzt |

Die letzte Zeile ist die einzige, die wir nicht selbst bestehen können. Alles
darüber kann grün sein und das Spiel trotzdem langweilig – deswegen steht sie
drin.

---

## Die drei Entscheidungen

Drei Dinge waren im ursprünglichen Zielsatz offen. Sie sind jetzt entschieden,
weil ein unentscheidbares Ziel kein Ziel ist.

### 1. Welche Modi? → FFA + Team-Arena. Genau zwei.

Im Code gibt es **keine** Modi-Infrastruktur; `mode: 'maze-alpha'` ist ein
hartkodiertes Etikett in `index.ts` und `telemetry.ts`. „Mehrere Modi" ist also
Neuland, kein Feinschliff.

Deshalb genau ein zweiter Modus zum 1.0, und zwar der, der die vorhandene
Maschine am stärksten wiederverwendet: **Team-Arena, zwei Teams.** Er braucht
ein Team-Feld am Spieler, kein Friendly Fire, Teamfarben und einen Teamscore.
Kein neuer Kartentyp, keine neue Siegbedingung-Maschinerie.

Battle Royale (schrumpfende Zone), Boss-Runden und 2v2 sind **nach** 1.0. Sie
brauchen je ein eigenes System und würden das Ziel unabschließbar machen.

### 2. Handy drin oder raus? → Drin, aber als „spielbar", nicht als „gleichwertig".

Es steckt bereits viel fertige Touch-Arbeit im Code: `.move-stick`,
`.aim-stick`, `.auto-fire`, `.secondary-action`, `.core-ability`, 44-px-Ziele
unter `@media (pointer: coarse)`, und die Harness prüft 17 echte Gerätegrößen
inklusive Handys im Querformat. Das wieder rauszureißen wäre Vernichtung
fertiger Arbeit.

Die Latte ist aber bewusst niedriger als am Desktop: **Handy = Querformat, alle
Handy-Fälle der Harness grün, keine tote Klickfläche.** Kein Versprechen, dass
man per Daumen gegen Maus-Spieler gewinnt.

### 3. Wie viel größer? → Die Karte wächst nur zusammen mit der Spielerzahl.

Das ist die wichtigste Entscheidung, weil „größere Karte" allein das Spiel
**schlechter** macht: gleiche 40 Spieler auf doppelter Fläche heißt leere
Karte und lange Wege ohne Gegner.

Die feste Größe ist deshalb nicht die Kantenlänge, sondern die **Dichte**:

> **600.000 px² pro Spieler.** (Heute: 6000 × 4000 ÷ 40.)

„Größere Karte" heißt damit automatisch „mehr Spieler". Und genau das war die
Frage, ob das ohne Lags geht. Gemessen, nicht geschätzt:

| Arena | Spieler | Schalter | KB/s pro Spieler | Tick p95 | Budget |
|---|---|---|---|---|---|
| 6000 × 4000 | 32 | aus (heute) | **229,6** | 2,2 ms | 7 % |
| 6000 × 4000 | 32 | `SNAPSHOT_DELTAS` | 142,1 | – | – |
| 6000 × 4000 | 32 | beide | 118,8 | 2,6 ms | 7 % |
| 9000 × 6000 | 80 | aus | 281,4 | 9,4 ms | 24 % |
| **9000 × 6000** | **80** | **beide** | **155,1** | 9,3 ms | 21 % |

Ergebnis: Eine **2,25-fach größere Karte mit doppelt so vielen Spielern kostet
pro Kopf weniger** als die heutige kleine Arena – 155,1 gegen 229,6 KB/s. Das
Tick-Budget ist dabei zu 21 % ausgelastet, also fast vierfache Luft.

Die Bedingung dafür sind zwei Schalter, die **fertig und getestet im Repo
liegen und trotzdem aus sind**: `SNAPSHOT_DELTAS` und `SHORT_NET_IDS`. Der
Client kann beide seit Langem (`snapshot-hydrator.ts`, 20 Tests); ein echter
Browser joint, spielt und rendert damit sauber – Wände, Formen, Killfeed,
Bestenliste mit Klasse und Level.

Ohne die Schalter ist die große Karte mit 281,4 KB/s pro Spieler das teuerste
Szenario überhaupt. **Die Schalter sind die Voraussetzung, nicht die Kür.**

---

## Was schon steht

- 65 Klassen in 8 Familien, jede Familie mit einer **eigenen Mechanik** statt
  nur anderer Kugeln: MOMENTUM, LADUNG, EINHEITEN, WUCHT, TARNUNG, HITZE,
  STELLUNG, SCHILD. Genau das war „nicht nur langweilige Kugeln".
- Wechselnde Ziele in der Arena: Elite Shapes, Core Surge, Bounty auf den
  dominanten Spieler.
- Serverautorität sauber durchgezogen, Client schickt nur Eingaben.
- Admin-Portal, das beantworten kann, ob Spieler wiederkommen.

## Was fehlt

1. ~~Die zwei Bandbreiten-Schalter anschalten.~~ ✅ **erledigt** – beide sind
   jetzt Opt-out statt Opt-in, gesichert durch `npm run wire-probe`.
2. Karte und Spielerzahl bei 600.000 px²/Spieler hochziehen.
   Nächster Schritt: `GAME.worldWidth/worldHeight/maxPlayers/shapeTargetCount`
   in `packages/shared/src/index.ts` – das sind die vier Zahlen, mit denen die
   Messung oben gemacht wurde.
3. Team-Arena als zweiter Modus.
4. Handy auf die „spielbar"-Latte bringen.

In dieser Reihenfolge – 1 war Voraussetzung für 2, und 2 macht 3 erst
interessant (Teams auf einer engen Karte sind ein Knäuel).

### Warum die Reihenfolge so ist

Ohne Schritt 1 hätte Schritt 2 das Spiel *verschlechtert*: die große Arena ohne
Deltas war mit 281,4 KB/s pro Spieler das teuerste Szenario der ganzen Messung.
Erst mit den Schaltern wird „größer" billiger als „klein von vorher".

## Wie man das nachmisst

```bash
# Bandbreite und Tick-Budget unter Last
node apps/server/dist/index.js &
npm run loadtest -- --url ws://127.0.0.1:2567 --clients 32 --duration 30 --json

# Leitung Server→Client (braucht zusaetzlich: npx vite --port 5199 apps/client)
npm run wire-probe

# UI auf 17 echten Geraetegroessen
PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/ui-layout-check.mjs
```

---

## Was das Ziel *nicht* ist

Damit es abschließbar bleibt: kein Battle Royale, keine Boss-Runden, kein
Ranked, keine Clans, keine Skins, kein Handy-Hochformat. Alles davon kann gut
sein – aber nach 1.0.
