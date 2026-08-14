/**
 * Bildzeiten des Clients messen – „ULTRA LAGGY" in Zahlen.
 *
 * Anlass: Sam, 14.08.: „ok das game ist jetzt ULTRA LAGGY das müssen wir
 * schnell fixen!" Der Server war es nachweislich nicht (Tick-p50 4,7 ms bei
 * 25 ms Budget, unverändert gegenüber der Basis) – also misst dieses Skript
 * die andere Hälfte: wie lange der Client an einem Bild rechnet.
 *
 * Gemessen wird mit `requestAnimationFrame`-Abständen im echten Chromium, bei
 * laufendem Spiel, mit gedrücktem Feuerknopf – der Fall, in dem am meisten auf
 * dem Schirm ist. Ein Fenster über 20 ms ist ein verlorenes 50-Hz-Bild.
 *
 *   npm run build
 *   PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
 *   node scripts/frame-probe.mjs
 *
 * Umgebungsvariablen: `URL` (Standard `http://127.0.0.1:2599`),
 * `PW_CHROMIUM`, `SEKUNDEN` (Standard 20), `KLASSE` (Standard `overseer` –
 * Drohnen und Kugeln gleichzeitig).
 */

import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599';
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
const SEKUNDEN = Number(process.env.SEKUNDEN ?? 20);

/** Sammelt rAF-Abstände in `window.__frames`, bevor der Client startet. */
const SHIM = `
  window.__frames = [];
  let letzte = performance.now();
  const tick = () => {
    const jetzt = performance.now();
    window.__frames.push(jetzt - letzte);
    letzte = jetzt;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
`;

const quantil = (sortiert, anteil) => sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * anteil))] ?? 0;

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(SHIM);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#join-button:not([disabled])', { timeout: 60_000 });
  await page.fill('#player-name', 'Messung');
  await page.click('#join-button', { timeout: 90_000 });
  await page.waitForSelector('#hud:not([hidden])', { timeout: 60_000 });
  // Aufwärmen: Shader, Texturen, erste Snapshots. Diese Bilder zählen nicht.
  await page.waitForTimeout(4000);

  // Dauerfeuer und Bewegung – sonst misst man einen stehenden Tank.
  await page.mouse.move(900, 300);
  await page.mouse.down();
  await page.keyboard.down('w');
  await page.evaluate('window.__frames.length = 0');
  await page.waitForTimeout(SEKUNDEN * 1000);
  await page.keyboard.up('w');
  await page.mouse.up();

  const frames = await page.evaluate('window.__frames');
  await browser.close();

  const sortiert = [...frames].sort((a, b) => a - b);
  const summe = frames.reduce((a, b) => a + b, 0);
  console.log(JSON.stringify({
    bilder: frames.length,
    fps: +(frames.length / (summe / 1000)).toFixed(1),
    p50: +quantil(sortiert, 0.5).toFixed(2),
    p95: +quantil(sortiert, 0.95).toFixed(2),
    p99: +quantil(sortiert, 0.99).toFixed(2),
    max: +sortiert[sortiert.length - 1].toFixed(2),
    ueber20ms: sortiert.filter((wert) => wert > 20).length,
    ueber100ms: sortiert.filter((wert) => wert > 100).length
  }));
}

main().catch((error) => { console.error(error); process.exit(1); });
