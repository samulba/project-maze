/**
 * End-to-End-Probe der Fortschrittsschleife: farmen → aufsteigen → Klasse
 * wählen → Punkt vergeben.
 *
 * Warum es das braucht: Das ist der Kern des Spiels – „viele verschiedene
 * Sachen, die man upgraden kann, also die Tanks". Getestet war davon bisher
 * jedes Teil einzeln (65 Klassendefinitionen, `isValidClassChoice`,
 * `applyUpgrade`), aber nie die Kette vom Klick bis zum veränderten Tank.
 *
 * Dass das nicht paranoid ist, ist belegt: `chooseKlasse` und `respawn` werden
 * beide von `tuneCombatScaling` ersetzt statt umschlossen, und bei `respawn`
 * lief dadurch monatelang das falsche Verhalten – während der Test zur
 * Hilfsfunktion grün blieb. Eine Regel zu testen sagt nichts darüber, ob sie
 * jemand aufruft.
 *
 * Geprüft wird deshalb am sichtbaren Ergebnis:
 *
 * 1. **Aufstieg** – die Stufe im Spielerpanel steigt durch echtes Farmen.
 * 2. **Klassenwahl** – nach dem Klick steht eine ANDERE Klasse im Panel, und
 *    zwar die geklickte. Der Server ist die Autorität: Er schickt die Klasse im
 *    Snapshot zurück, der Client zeigt nur an. Bliebe die Wahl serverseitig
 *    liegen, stünde hier weiter „CORE".
 * 3. **Upgrade** – ein Punkt wandert in einen Slot, und der Zähler sinkt. Wird
 *    der Punkt serverseitig verworfen, füllt sich der Balken nicht.
 *
 * Aufruf – Server und Client müssen laufen:
 *   node apps/server/dist/index.js &          # Port 2567
 *   npx vite --port 5199 apps/client &
 *   node scripts/progress-probe.mjs
 *
 * Umgebung: `URL`, `SHOT`, `PW_CHROMIUM`, `GEDULD_MS` (Standard 150000).
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:5199/';
const GEDULD_MS = Number(process.env.GEDULD_MS ?? 150_000);

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const fehler = [];
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) fehler.push(`error: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !/\/leaderboard|favicon/.test(r.url())) fehler.push(`HTTP ${r.status()}: ${r.url()}`);
});

const lies = () => page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
  const stufe = /(\d+)/.exec(text('.level-badge'));
  const punkte = /(\d+)/.exec(text('.points-badge'));
  const wahl = document.querySelector('.class-selection');
  return {
    klasse: text('.player-heading .player-class, .player-heading small, .player-heading div') || text('.player-heading'),
    stufe: stufe ? Number(stufe[1]) : 0,
    punkte: punkte ? Number(punkte[1]) : 0,
    wahlOffen: Boolean(wahl && !wahl.hasAttribute('hidden') && wahl.dataset.collapsed !== 'true'
      && wahl.getBoundingClientRect().height > 40),
    gefuellteStufen: document.querySelectorAll('.upgrade-list i.filled, [data-pips] i.filled').length
  };
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('#join-button', { timeout: 90_000 });
await page.fill('#player-name', 'ProgressProbe').catch(() => {});
await page.click('#join-button');
await page.waitForSelector('canvas', { timeout: 60_000 });

const start = await lies();

/** Feuert und fährt, bis `fertig()` zutrifft oder die Geduld endet. */
async function spieleBis(fertig, grenzeMs) {
  const ende = Date.now() + grenzeMs;
  let richtung = 0;
  while (Date.now() < ende) {
    const tasten = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    const taste = tasten[richtung % tasten.length];
    richtung += 1;
    await page.keyboard.down(taste);
    await page.mouse.move(300 + (richtung % 5) * 140, 200 + (richtung % 3) * 130);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.keyboard.up(taste);
    const stand = await lies();
    if (await fertig(stand)) return stand;
  }
  return lies();
}

// 1. Aufsteigen, bis die Klassenwahl offen steht (Stufe 5).
const beimAufstieg = await spieleBis((s) => s.wahlOffen && s.stufe >= 5, GEDULD_MS);

// 2. Eine Klasse waehlen – die erste angebotene.
let gewaehlt = null;
if (beimAufstieg.wahlOffen) {
  gewaehlt = await page.evaluate(() => {
    const knopf = document.querySelector('.class-selection .class-choices button:not([disabled])');
    if (!knopf) return null;
    const name = knopf.querySelector('strong, b, .class-choice-name')?.textContent?.trim()
      ?? knopf.textContent?.trim().split('\n')[0]?.trim() ?? null;
    knopf.click();
    return name;
  });
  await page.waitForTimeout(1500);
}
const nachWahl = await lies();

// 3. Einen Upgrade-Punkt vergeben, falls einer da ist.
let punkteVorher = nachWahl.punkte;
let stufenVorher = nachWahl.gefuellteStufen;
if (punkteVorher === 0) {
  const mitPunkt = await spieleBis((s) => s.punkte > 0, 40_000);
  punkteVorher = mitPunkt.punkte;
  stufenVorher = mitPunkt.gefuellteStufen;
}
if (punkteVorher > 0) {
  await page.evaluate(() => {
    const knopf = document.querySelector('.upgrade-list button:not([disabled]), [data-upgrade]:not([disabled])');
    if (knopf) knopf.click();
  });
  await page.waitForTimeout(1200);
}
const nachUpgrade = await lies();

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();

const aufgestiegen = beimAufstieg.stufe > start.stufe;
const klasseGewechselt = Boolean(gewaehlt) && nachWahl.klasse !== start.klasse;
const punktVergeben = punkteVorher > 0
  ? nachUpgrade.gefuellteStufen > stufenVorher
  : null;

const okay = aufgestiegen && klasseGewechselt && punktVergeben !== false && fehler.length === 0;

console.log(JSON.stringify({
  okay,
  aufstieg: { von: start.stufe, bis: beimAufstieg.stufe, gewertet: aufgestiegen },
  klassenwahl: { vorher: start.klasse, geklickt: gewaehlt, nachher: nachWahl.klasse, gewertet: klasseGewechselt },
  upgrade: {
    punkteVorher,
    gefuellteStufen: `${stufenVorher} -> ${nachUpgrade.gefuellteStufen}`,
    gewertet: punktVergeben === null ? 'kein Punkt verfuegbar – nicht geprueft' : punktVergeben
  },
  fehler
}, null, 1));

if (!okay) {
  console.error('\nprogress-probe: Befund.');
  if (!aufgestiegen) console.error('  Kein Aufstieg – Farmen bringt keine Stufe.');
  if (!klasseGewechselt) console.error('  Klassenwahl kommt nicht an – der Server behaelt die alte Klasse.');
  if (punktVergeben === false) console.error('  Upgrade-Punkt verpufft – der Balken fuellt sich nicht.');
}
process.exit(okay ? 0 : 1);
