/**
 * End-to-End-Probe des Snapshot-Wire-Formats.
 *
 * Warum es das braucht: `npm run check` kann eine Delta-Regression nicht
 * finden. Die Hydrator-Tests füttern selbstgebaute Snapshots, und die
 * UI-Harness setzt den HUD-Zustand direkt im Browser – beide sehen die Leitung
 * zwischen Server und Client nie. Genau dort sitzen aber `SNAPSHOT_DELTAS` und
 * `SHORT_NET_IDS`: Der Server lässt Felder weg bzw. kürzt IDs, und nur der
 * Hydrator setzt sie wieder zusammen. Läuft das auseinander, rendert der Client
 * `undefined` – und kein einziger Unit-Test merkt es.
 *
 * Deshalb joint hier ein echter Browser einen echten Server, spielt ein paar
 * Sekunden und wird danach gefragt: Steht die Bestenliste mit Klasse und Level
 * da (die kommt ausschliesslich aus Snapshots), und hat die Konsole geschwiegen?
 *
 * Aufruf – Server und Client muessen laufen:
 *   node apps/server/dist/index.js &          # Port 2567
 *   npx vite --port 5199 apps/client &
 *   node scripts/wire-probe.mjs
 *
 * Umgebung: `URL` (Standard http://127.0.0.1:5199/), `SEKUNDEN` (Standard 12),
 * `SHOT` (Zielpfad des Screenshots), `PW_CHROMIUM` (Browser-Pfad).
 *
 * Exit 0 = Leitung in Ordnung, Exit 1 = Befund.
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:5199/';
const SEKUNDEN = Number(process.env.SEKUNDEN ?? 12);

/**
 * Lokale Nebengeraeusche, die nichts ueber das Wire-Format sagen.
 *
 * `/leaderboard` ist der persistente Bestenlisten-Endpunkt: ohne Supabase
 * antwortet er absichtlich mit 404 (`persistence.ts`), in Produktion nicht.
 *
 * „Failed to load resource" ist der Konsolen-Zwilling jedes HTTP-Fehlers und
 * traegt keine URL. Er faellt hier raus, weil der `response`-Listener unten
 * denselben Fehler mit vollem Pfad meldet – sonst wuerde ein gefilterter
 * 404 durch die Hintertuer doch wieder zum Befund.
 */
const HARMLOS = /favicon|\/leaderboard|WebGL|SwiftShader|deprecat|sourcemap|Failed to load resource/i;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const fehler = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') fehler.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) fehler.push(`HTTP ${r.status()}: ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('#join-button', { timeout: 90_000 });
await page.fill('#player-name', 'WireProbe').catch(() => {});
await page.click('#join-button');

// Spielen statt stillstehen: Bewegung und Schuesse erzeugen Projektile, Treffer
// und Formwechsel – also genau die Felder, die der Delta-Versand auslaesst.
const ende = Date.now() + SEKUNDEN * 1000;
while (Date.now() < ende) {
  await page.keyboard.down('KeyW');
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyD');
}

const befund = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
  return {
    canvas: !!document.querySelector('canvas'),
    name: text('.player-heading strong'),
    level: text('.level-badge'),
    /*
     * Der Beitritt selbst, an der Anzeige abgelesen.
     *
     * Am 12.08. warf `onWelcome` mitten im Welcome-Zweig (`insertBefore` gegen
     * einen Knopf, der kein direktes Kind mehr war). Der Startscreen ging weg,
     * das HUD stand da -- aber `input.setEnabled(true)` wurde nie erreicht,
     * und der Tank liess sich nicht bewegen. Aufgefallen ist es nur ueber die
     * Konsolenfehler. Faengt jemand den Fehler kuenftig ab, bliebe die Probe
     * gruen, also steht die Anzeige jetzt als eigenes Kriterium hier: Sie geht
     * erst NACH der letzten Zeile des Welcome-Zweigs auf 'online'.
     */
    verbindung: document.querySelector('#connection')?.dataset.state
      ?? (document.querySelector('#connection')?.className.includes('online') ? 'online' : null),
    verbindungText: text('#connection'),
    // Die Bestenliste ist der schaerfste Zeuge: Name, Klasse und Level je
    // Eintrag stammen aus Feldern, die der Server im Delta-Betrieb auslaesst,
    // sobald der Client sie einmal kannte.
    bestenliste: document.querySelector('#leaderboard')?.textContent?.trim() ?? ''
  };
});

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();

const echte = fehler.filter((f) => !HARMLOS.test(f));
const beigetreten = befund.verbindung === 'online' || /MAZERS/i.test(befund.verbindungText ?? '');
const okay = befund.canvas
  && befund.name === 'WireProbe'
  && befund.bestenliste.length > 40
  && beigetreten
  && echte.length === 0;

// Ein kaputtes Wire-Format wirft denselben Fehler 30 Mal pro Sekunde – einmal
// je Snapshot. Ungefiltert ersaeuft der Befund in Wiederholungen, und genau
// dann liest ihn niemand mehr. Also: erste Zeile als Schluessel, Rest zaehlen.
const gebuendelt = [...echte.reduce((map, f) => {
  const schluessel = f.split('\n')[0].slice(0, 200);
  return map.set(schluessel, (map.get(schluessel) ?? 0) + 1);
}, new Map())].map(([text, anzahl]) => (anzahl > 1 ? `${text}  (${anzahl}×)` : text));

console.log(JSON.stringify({ okay, beigetreten, befund, fehler: gebuendelt }, null, 1));
if (!okay) console.error('\nwire-probe: Befund. Snapshot-Leitung zwischen Server und Client pruefen.');
process.exit(okay ? 0 : 1);
