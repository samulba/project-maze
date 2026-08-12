import { chromium } from 'playwright-core';
const URL = 'http://127.0.0.1:2701';
const SHIM = `
  window.__zustand = { level: 5, playerClass: 'core', punkte: 4 };
  const Original = window.WebSocket;
  window.WebSocket = class extends Original {
    addEventListener(type, listener, options) {
      if (type !== 'message') return super.addEventListener(type, listener, options);
      super.addEventListener(type, (event) => {
        let data = event.data;
        try { const p = JSON.parse(String(data));
          if (p.type === 'snapshot' && Array.isArray(p.players)) {
            const z = window.__zustand;
            const ich = p.players.find((x) => String(x.id) === String(p.selfId));
            if (ich) { ich.level=z.level; ich.xp=0; ich.xpForNextLevel=999; ich.playerClass=z.playerClass; ich.availablePoints=z.punkte; }
            data = JSON.stringify(p);
          }
        } catch {}
        listener({ ...event, data, type: 'message' });
      }, options);
    }
  };`;
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name, viewport, touch] of [['Desktop 1920x1080',{width:1920,height:1080},false],['Handy 844x390',{width:844,height:390},true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(SHIM);
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#join-button:not([disabled])',{timeout:60000});
  await page.fill('#player-name','Up'); await page.click('#join-button');
  await page.waitForTimeout(5000);
  // Klassenwahl zuklappen, damit das Upgrade-Panel frei liegt
  await page.click('#class-selection-close').catch(()=>{});
  await page.click('#points-badge').catch(()=>{});
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#upgrades [data-upgrade]')];
    return btns.map(b => ({
      id: b.dataset.upgrade,
      sichtbar: getComputedStyle(b).display !== 'none' && !b.hidden && b.getBoundingClientRect().height > 1,
      taste: b.querySelector('kbd')?.textContent ?? '-',
      label: b.querySelector('[data-upgrade-label]')?.textContent,
      disabled: b.disabled,
      gesperrt: b.classList.contains('locked'),
      titel: b.title
    })).filter(x=>x.sichtbar);
  });
  console.log('###', name, 'sichtbare Slots:', r.length);
  for (const x of r) console.log(`  Taste ${String(x.taste).padEnd(2)} ${String(x.label).padEnd(18)} disabled=${x.disabled} locked=${x.gesperrt} title="${x.titel}"`);
  await ctx.close();
}
await browser.close();
