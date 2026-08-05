# Screenshot-Pipeline (Design-Vorschauen für Sam)

Sams Design-Protokoll: Vorschläge werden **als Screenshot in den Chat**
geschickt, umgesetzt/gepusht wird erst nach seinem „Ja". Diese Pipeline
rendert das Spiel headless und liefert Start- und In-Game-Bilder.

## Setup (einmal pro Session)

```bash
# Playwright lokal in ein Arbeitsverzeichnis außerhalb des Repos installieren
mkdir -p /tmp/shots && cd /tmp/shots && npm install playwright
# Chromium ist im Container vorinstalliert – NICHT `playwright install` laufen
# lassen, sondern den Symlink nutzen:
export PW_CHROMIUM=/opt/pw-browsers/chromium
```

## Lokalen Server starten

```bash
npm run build                       # im Repo-Root: shared + server + client
PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
curl -s http://127.0.0.1:2599/health   # Warten bis ok:true
```

`express.static` liest `apps/client/dist` **pro Request** – nach einem
Client-Rebuild reicht ein neuer Screenshot-Lauf, der Server muss nicht neu
gestartet werden.

## Screenshot-Skript

`/tmp/shots/shot.mjs` (Startscreen + 2 In-Game-Bilder; SwiftShader-Flags sind
Pflicht, sonst startet WebGL headless nicht):

```js
import { chromium } from 'playwright';
const [, , baseUrl, prefix] = process.argv;
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const label = await page.locator('#join-button span').textContent();
await page.screenshot({ path: `${prefix}-start.png` });
if ((label || '').includes('ARENA')) {
  await page.fill('#player-name', 'Sam');
  await page.click('#join-button');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${prefix}-game.png` });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${prefix}-game2.png` });
}
await browser.close();
```

Aufruf: `node shot.mjs http://127.0.0.1:2599 mein-prefix`

Tipp für Bilder mit Wänden/Formen im Blick: nach dem Join per
`page.keyboard.down('s')` / `down('d')` ein paar Sekunden in die Arena
fahren (der Spawn liegt oft am Rand), dann fotografieren.

## Design-Varianten bauen

Der Grundlook liegt an drei Stellen (siehe MASTERPLAN „Design-Richtung"):

1. `apps/client/src/renderer.ts` – `PALETTES.midnight` (Arena-Farben) und der
   `STYLE`-Block (floor: grid/dots/checker/plain · outline · wall3d · shadows)
2. `apps/client/src/style.css` – `:root`-Variablen (UI-Farbwelt)
3. `apps/client/src/start.css` – Startscreen (nutzt seit dem Diep-Umbau die
   `:root`-Variablen; `--brand` = `var(--accent)`)

Variante patchen → `npm run build --workspace @project-maze/client` →
Screenshot-Lauf → Arbeitsverzeichnis mit `git checkout -- .` zurücksetzen,
falls die Variante nicht gewinnt.
