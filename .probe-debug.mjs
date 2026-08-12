import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599';
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
await page.addInitScript(`try{localStorage.setItem('project-maze-quality','low');localStorage.setItem('project-maze-view','fest');}catch{};window.__zustand={level:10,playerClass:'core',punkte:4};`);
const SHIM = `
  window.__zustand = window.__zustand || {};
  const Original = window.WebSocket;
  window.WebSocket = class extends Original {
    addEventListener(type, listener, options) {
      if (type !== 'message') return super.addEventListener(type, listener, options);
      super.addEventListener(type, (event) => {
        let data = event.data;
        try {
          const p = JSON.parse(String(data));
          if (p.type === 'snapshot' && Array.isArray(p.players)) {
            const z = window.__zustand;
            const ich = p.players.find((x) => String(x.id) === String(p.selfId));
            if (ich) {
              if (z.level !== undefined) { ich.level = z.level; ich.xp = 0; ich.xpForNextLevel = 999; }
              if (z.playerClass !== undefined && ich.playerClass !== undefined) ich.playerClass = z.playerClass;
              if (z.punkte !== undefined) ich.availablePoints = z.punkte;
            }
            data = JSON.stringify(p);
          }
        } catch {}
        listener({ ...event, data, target: event.target });
      }, options);
    }
  };
`;
await page.addInitScript(SHIM);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#join-button:not([disabled])', { timeout: 60_000 });
await page.fill('#player-name', 'Debug').catch(() => {});
await page.click('#join-button');
await page.waitForSelector('#hud:not([hidden])', { timeout: 60_000 });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const liste = document.querySelector('.upgrade-list');
  const out = { liste: { cw: liste.clientWidth, sw: liste.scrollWidth, style: getComputedStyle(liste).gridTemplateColumns } };
  out.buttons = [...liste.querySelectorAll('button')].filter((b) => !b.hidden).map((b) => {
    const s = getComputedStyle(b);
    return {
      cls: b.className, cw: b.clientWidth, sw: b.scrollWidth, cols: s.gridTemplateColumns,
      kinder: [...b.children].map((k) => {
        const ks = getComputedStyle(k);
        return `${k.tagName}.${k.className} w=${Math.round(k.getBoundingClientRect().width)} sw=${k.scrollWidth} disp=${ks.display} ws=${ks.whiteSpace} text=${(k.textContent ?? '').slice(0, 30)}`;
      })
    };
  }).filter((b) => b.sw > b.cw + 2 || b.cls.includes('locked'));
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
