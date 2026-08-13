/**
 * Sams Bug: "wenn man eine klasse aussuchen kann, kann man nicht mehr upgraden
 * (die stats), solange man nicht eine neue klasse ausgesucht hat"
 *
 * Diese Probe stellt genau diesen Zustand her und fragt DREI Dinge getrennt:
 *  1. Ist der Knopf disabled?              -> Logikfehler im Client
 *  2. Liegt etwas anderes darueber?        -> Layout/z-index
 *  3. Kommt der Punkt beim Server an?      -> Serverregel
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('#join-button', { timeout: 90_000 });
await page.fill('#player-name', 'BugProbe').catch(() => {});
await page.click('#join-button');
await page.waitForTimeout(2500);

const liesRoh = () => page.evaluate(() => {
  const text = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
  const wahl = document.querySelector('.class-selection');
  return {
    stufe: Number(/(\d+)/.exec(text('.level-badge'))?.[1] ?? 0),
    punkte: Number(/(\d+)/.exec(text('.points-badge'))?.[1] ?? 0),
    wahlSichtbar: Boolean(wahl && !wahl.hasAttribute('hidden')),
    wahlEingeklappt: wahl?.dataset.collapsed === 'true',
    gefuellt: document.querySelectorAll('[data-pips] i.filled').length
  };
});
// Nach einem Tod laedt der Client neu – dann ist der Kontext kurz weg.
const lies = async () => {
  for (let versuch = 0; versuch < 5; versuch += 1) {
    try { return await liesRoh(); } catch { await page.waitForTimeout(600); }
  }
  return liesRoh();
};

// Farmen, bis eine Klassenwahl offensteht.
const frist = Date.now() + 150_000;
let stand = await lies();
while (Date.now() < frist && !(stand.wahlSichtbar && stand.punkte > 0)) {
  await page.mouse.move(300 + Math.random() * 600, 200 + Math.random() * 400);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(220); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(220); await page.keyboard.up('KeyD');
  await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
  stand = await lies();
}
console.log('Zustand hergestellt:', JSON.stringify(stand));
if (!stand.wahlSichtbar) { console.log('KEINE Klassenwahl erreicht – Probe unbrauchbar'); await browser.close(); process.exit(2); }

// Die drei Fragen.
const befund = await page.evaluate(() => {
  const knopf = [...document.querySelectorAll('[data-upgrade]')]
    .find((b) => !b.hidden && b.getBoundingClientRect().width > 0);
  if (!knopf) return { fehler: 'kein sichtbarer Upgrade-Knopf' };
  const r = knopf.getBoundingClientRect();
  const mitte = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const oben = document.elementFromPoint(mitte.x, mitte.y);
  const wahl = document.querySelector('.class-selection');
  const wr = wahl?.getBoundingClientRect();
  return {
    slot: knopf.dataset.upgrade,
    disabled: knopf.disabled,
    knopfRect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    wahlRect: wr ? { x: Math.round(wr.left), y: Math.round(wr.top), w: Math.round(wr.width), h: Math.round(wr.height) } : null,
    ueberlappt: Boolean(wr && wr.left < r.right && wr.right > r.left && wr.top < r.bottom && wr.bottom > r.top),
    obenAufDemKnopf: oben ? `${oben.tagName}.${oben.className}`.slice(0, 80) : null,
    trifftDenKnopf: Boolean(oben && (oben === knopf || knopf.contains(oben))),
    panelSichtbar: !document.querySelector('.upgrade-panel')?.hidden,
    panelReadOnly: document.querySelector('.upgrade-panel')?.classList.contains('read-only'),
    // Wer liegt an dieser Stelle uebereinander?
    stapel: document.elementsFromPoint(mitte.x, mitte.y).slice(0, 6)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${e.className}`.slice(0, 60)),
    // Und was sagen die berechneten Stile?
    knopfPointer: getComputedStyle(knopf).pointerEvents,
    panelPointer: getComputedStyle(document.querySelector('.upgrade-panel')).pointerEvents,
    panelZ: getComputedStyle(document.querySelector('.upgrade-panel')).zIndex,
    wahlZ: wahl ? getComputedStyle(wahl).zIndex : null,
    wahlLinks: wahl ? getComputedStyle(wahl).getPropertyValue('--wahl-links') : null,
    trefferUpgradePanelSelektor: Boolean(document.querySelector('.upgrade-panel:not([hidden])')),
    hudPointer: getComputedStyle(document.querySelector('.upgrade-panel').parentElement).pointerEvents,
    hudKette: (() => {
      const kette = [];
      let e = knopf;
      while (e && e !== document.documentElement) {
        const st = getComputedStyle(e);
        kette.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : '.' + String(e.className).split(' ')[0]} pe=${st.pointerEvents} z=${st.zIndex} pos=${st.position}`);
        e = e.parentElement;
      }
      return kette;
    })()
  };
});
console.log('Befund:', JSON.stringify(befund, null, 1));

// Kommt ein echter Klick an?
const vorher = await lies();
await page.click(`[data-upgrade="${befund.slot}"]`, { timeout: 3000 }).catch((e) => console.log('Klick scheiterte:', e.message.split('\n')[0]));
await page.waitForTimeout(1200);
const nachKlick = await lies();
console.log(`Klick auf ${befund.slot}: Pips ${vorher.gefuellt} -> ${nachKlick.gefuellt}, Punkte ${vorher.punkte} -> ${nachKlick.punkte}`);

// Und die Tastatur (Sam spielt mit Zifferntasten)?
const vorTaste = await lies();
await page.keyboard.press('Digit1');
await page.waitForTimeout(1200);
const nachTaste = await lies();
console.log(`Taste 1: Pips ${vorTaste.gefuellt} -> ${nachTaste.gefuellt}, Punkte ${vorTaste.punkte} -> ${nachTaste.punkte}`);

await page.screenshot({ path: process.env.SHOT ?? '/tmp/claude-0/-home-user-project-maze/042957da-1e9d-5336-a83a-ddf23f76c79d/scratchpad/bug-upgrade.png' });
await browser.close();
