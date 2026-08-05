# 08 – Client-Perf-Telemetrie, Server-Seite (R5)

| | |
| --- | --- |
| **Auftrag** | `docs/status/chat-01/auftrag-chat-04.md` → R5 |
| **Branch** | `claude/maze-client-perf-telemetry-dfb335` |
| **Commit** | `69ade20` |
| **Basis** | `origin/main` (`7a69f18`) |
| **Tests** | `npm run check` grün – 36 Dateien, 443 Tests (14 neu) |
| **Status** | **offen – wartet auf Review und Merge** |

## Was gebaut wurde

Neues Modul `apps/server/src/client-metrics.ts`, alles hinter
`TELEMETRY_ENABLED`.

**`POST /client-metrics`** – anonym, kein Token, strikte `zod`-Prüfung,
Body-Limit 2 kB, Rate-Limit über das bestehende Modul (Kosten 2 → rund 30
Berichte pro Minute und IP; das reicht für ein ganzes Haus hinter einem NAT).
Antwort `204` ohne Inhalt. Ein `400` nennt **keinen** Grund – ein offener
Endpunkt soll kein Schema-Orakel sein; der Grund steht als Zähler in
`/metrics`.

**Aggregation** – gleitendes 15-Minuten-Fenster in einem Ringpuffer (4 000
Stichproben). Gespeichert wird ausschließlich die Aggregation: keine IDs, keine
IP-Adressen, keine Einzelberichte.

**Export** über `/metrics`, aufgeschlüsselt nach `deviceClass` × `quality` –
vier mal vier Kombinationen, mehr kann nie entstehen.

## Zwei Entscheidungen, die der Auftrag offen ließ

**1. `quality` ist der Renderpfad, keine neue Qualitätsstufe.**
Der Client hat noch gar keine Qualitätseinstellung – aber `renderer.ts` bootet
bereits über drei Wege und weiß, welcher hochgekommen ist: `webgl`,
`webgl-kompat` (Software-Rendering, ohne Antialiasing, Auflösung 1) und
`webgpu`. Genau diese Labels sind jetzt das Vokabular. 03 muss nichts erfinden,
und **`webgl-kompat` ist per Definition der „alte PC"**, um den es in
Handlungsfeld 1 geht.

**2. `fpsP95` ist der langsame Rand, nicht der schnelle.**
Bei Bildraten ist das 95. Perzentil das *beste* Fünftel – als Kennzahl
wertlos. Gemeint und dokumentiert ist die Bildrate bei der
**95-Perzentil-Framedauer**, also der Wert im langsamen Fünftel; er ist
*kleiner* als `fpsP50`. Weil sich nicht erzwingen lässt, wie herum ein Client
zählt, nimmt der Server schlicht den kleineren der beiden Werte als Rand und
zählt vertauschte Berichte in `maze_client_reports_inverted_total`. So kostet
ein Client-Fehler keine Daten, bleibt aber sichtbar.

## Verifiziert

Am laufenden Server (`PORT=12620`):

| Aufruf | Ergebnis |
| --- | --- |
| gültiger Bericht (high/webgl) | `204` |
| gültiger Bericht (low/webgl-kompat) | `204` |
| `quality: "vulkan"` | `400` |
| Extrafeld `userId` | `400` |
| kein JSON | `400` |
| 12 Berichte am Stück | 7 × `204`, dann `429` |
| `/metrics` | alle Serien korrekt, `low_fps_ratio` 1 für den Kompat-Pfad, 0 für WebGL |
| `/health` | `clientMetrics`-Block mit Fenster, Stichproben und Ablehnungen |
| `TELEMETRY_ENABLED=false` | `404` auf `POST /client-metrics` **und** `GET /metrics` |

## Von 01 gebraucht

- Review und Merge von `claude/maze-client-perf-telemetry-dfb335`.
- `index.ts` ist an drei Stellen berührt (Import, `app.post('/client-metrics')`,
  `clientMetrics` in `/health`), `telemetry.ts` an zwei (Import und eine Zeile
  am Ende von `renderMetricsText`).

---

# Spezifikation für Chat 03 – der Client-Sender

Alles unten ist reines Client-Revier. Der Server ist fertig und wartet.

## 1. Wann gesendet wird

- **Frühestens 60 Sekunden nach dem Betreten der Arena** – vorher misst man
  Ladezeit und Shader-Kompilierung, nicht das Spiel.
- **Danach einmal pro Minute**, solange der Tab sichtbar ist.
- **Nicht senden**, wenn `document.hidden` war: Browser drosseln
  `requestAnimationFrame` in Hintergrund-Tabs auf 1 Hz, das ergäbe frei
  erfundene 1-fps-Berichte. Beim Zurückkommen das Fenster verwerfen und neu
  anfangen.
- Fehler beim Senden werden verschluckt: `fetch(...).catch(() => {})`. Die
  Telemetrie darf nie ein Spielproblem verursachen.
- `keepalive: true` setzen, damit ein Bericht beim Tab-Wechsel noch rausgeht.

## 2. Wie FPS gemessen wird

Framedauern über `requestAnimationFrame`-Deltas sammeln, **nicht** einen
FPS-Zähler mitteln:

```ts
const frames: number[] = [];      // Framedauern in ms
let last = performance.now();
let hangs = 0;

function onFrame(now: number) {
  const delta = now - last;
  last = now;
  // Erster Frame nach einem Tab-Wechsel ist Müll.
  if (delta > 0 && delta < 5_000) {
    frames.push(delta);
    if (delta > 100) hangs += 1;
  }
  requestAnimationFrame(onFrame);
}
```

Beim Senden aus den gesammelten Framedauern:

```ts
const sorted = [...frames].sort((a, b) => a - b);
const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
const fpsP50 = Math.round(1000 / at(0.50));   // mittlere Framedauer
const fpsP95 = Math.round(1000 / at(0.95));   // langsame Framedauer → KLEINERE Zahl
```

**Merksatz:** `fpsP95 <= fpsP50`. Wer es andersherum schickt, wird nicht
abgelehnt, taucht aber in `maze_client_reports_inverted_total` auf.

Nach dem Senden `frames.length = 0` und `hangs = 0` – jedes Fenster steht für
sich.

## 3. Wie `deviceClass` bestimmt wird

Bewusst grob, nur drei Stufen. `navigator.deviceMemory` gibt es nur in
Chromium; fehlt es, entscheiden Kerne und DPR allein:

```ts
function deviceClass(): 'low' | 'mid' | 'high' | 'unknown' {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if (memory === undefined && !cores) return 'unknown';
  const score =
      (memory === undefined ? 1 : memory >= 8 ? 2 : memory >= 4 ? 1 : 0)
    + (!cores ? 1 : cores >= 8 ? 2 : cores >= 4 ? 1 : 0)
    + ((window.devicePixelRatio || 1) >= 2 ? 1 : 0);
  return score >= 4 ? 'high' : score >= 2 ? 'mid' : 'low';
}
```

Der Wert wird einmal beim Start bestimmt, nicht je Bericht.

## 4. Wie `quality` bestimmt wird

Der Renderer probiert in `renderer.ts` drei Wege durch und bricht beim ersten
Erfolg ab. Das `attempt.label` dieses Versuchs ist der Wert – erlaubt sind
**exakt** `'webgl'`, `'webgl-kompat'`, `'webgpu'`; wenn unklar, `'unknown'`.
Andere Werte lehnt der Server ab (und zählt es).

## 5. Der Aufruf

```ts
void fetch('/client-metrics', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  keepalive: true,
  body: JSON.stringify({
    fpsP50, fpsP95,
    frameHangs: hangs,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    viewportW: Math.round(window.innerWidth),
    viewportH: Math.round(window.innerHeight),
    deviceClass: deviceClassValue,
    quality: renderPathLabel
  })
}).catch(() => {});
```

**Der Body ist strikt** – jedes zusätzliche Feld führt zu `400`. Alle acht
Felder sind Pflicht.

## 6. Grenzen (die der Server erzwingt)

| Feld | Bereich |
| --- | --- |
| `fpsP50`, `fpsP95` | 1 – 240 |
| `frameHangs` | ganze Zahl, 0 – 100 000 |
| `dpr` | 0,5 – 8 |
| `viewportW` | ganze Zahl, 160 – 20 000 |
| `viewportH` | ganze Zahl, 120 – 20 000 |
| `deviceClass` | `low` · `mid` · `high` · `unknown` |
| `quality` | `webgl` · `webgl-kompat` · `webgpu` · `unknown` |

Bei einem Vertipper im Vokabular kommen dauerhaft `400` zurück, **ohne dass es
im Spiel auffällt**. Gegenprobe nach dem Ausrollen:
`maze_client_reports_rejected_total{reason="schema"}` in `/metrics` muss bei
null bleiben, `maze_client_reports_total` muss steigen.

## Für Sam

- Nichts zu tun. Keine neue ENV-Variable, keine Migration.
- Nach dem Ausrollen des Client-Senders lohnt ein Blick auf
  `maze_client_low_fps_ratio{quality="webgl-kompat"}` – das ist die Zahl
  hinter „läuft auf alten PCs".
