/**
 * Kontaktbogen aller Tank-Silhouetten.
 *
 * Anlass: Sam, 14.08.: „TANK DESIGNS an sich finde ich schauen leider alle noch
 * echt kake aus. ÜBERARBEITE DIE ALLE KOMPLETT."
 *
 * Warum es das als Skript gibt und nicht als einmaligen Screenshot: Die
 * Silhouetten stehen in `packages/shared/src/appearance.ts`, die Rohre in
 * `barrels.ts`, die Farben in `class-choice.css` – drei Dateien, die man einzeln
 * ändert und deren Zusammenspiel man nur SIEHT. Vorher gab es dafür kein
 * Werkzeug, und genau deshalb konnten Rohre und Rümpfe monatelang
 * auseinanderlaufen, ohne dass es jemandem auffiel.
 *
 * Ein Bogen zeigt alle Klassen nebeneinander, in Familienfarbe, mit Namen. Wer
 * eine Form ändert, sieht in einem Bild, ob sie sich noch von ihren Nachbarn
 * unterscheidet – das ist der Blindtest aus dem MASTERPLAN, nur als Bild.
 *
 * Aufruf (kein Server nötig, die Vorschau ist reines SVG):
 *   npm i --no-save playwright-core esbuild
 *   node scripts/tank-sheet.mjs [.probe/tanks.png]
 */
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';

const ZIEL = process.argv[2] ?? '.probe/tanks.png';
const EINSTIEG = '.probe/tank-sheet-entry.ts';

mkdirSync('.probe', { recursive: true });
writeFileSync(EINSTIEG, `
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { classPreviewSvg } from '../apps/client/src/class-preview';
const FARBEN: Record<string, string> = {
  core: '#7f8aa8', rapid: '#5b8cff', precision: '#e0a44a', control: '#46b98d',
  impact: '#d2606f', specter: '#8f7ff0', tempest: '#e0954e', siege: '#b0a24e', aegis: '#4ea9a4'
};
const gitter = document.querySelector('#g')!;
for (const id of PLAYER_CLASS_IDS) {
  const d = CLASS_DEFINITIONS[id];
  const z = document.createElement('div');
  z.className = 'zelle';
  z.innerHTML = \`<div class="bild" style="color:\${FARBEN[d.branch] ?? '#888'}">\${classPreviewSvg(id)}</div>\`
    + \`<div class="name">\${d.label}</div><div class="fam">\${d.branch} · L\${d.unlockLevel}</div>\`;
  gitter.append(z);
}
`);

const gebaut = await build({ entryPoints: [EINSTIEG], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const css = readFileSync('apps/client/src/class-choice.css', 'utf8');
const seite = `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
body{margin:0;background:#12151f;font:600 11px system-ui,sans-serif;color:#cdd3e2}
.gitter{display:grid;grid-template-columns:repeat(9,1fr);gap:3px;padding:8px}
.zelle{display:grid;justify-items:center;gap:2px;padding:6px 2px;background:#171b27;border-radius:8px}
.bild{width:88px;height:88px;display:grid;place-items:center}
.bild svg{width:88px;height:88px;overflow:visible}
.name{font-size:9px;letter-spacing:.06em;text-transform:uppercase;opacity:.9}
.fam{font-size:7px;opacity:.5}
</style></head><body><div class="gitter" id="g"></div>
<script type="module">${gebaut.outputFiles[0].text}</script></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
const fehler = [];
page.on('pageerror', (e) => fehler.push(String(e).split('\n')[0]));
await page.setContent(seite, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.screenshot({ path: ZIEL, fullPage: true });
await browser.close();
rmSync(EINSTIEG, { force: true });
if (fehler.length) { console.error('Skriptfehler:', fehler.join(' | ')); process.exit(1); }
console.log('geschrieben:', ZIEL);
