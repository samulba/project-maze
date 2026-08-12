import { chromium } from 'playwright-core';
const URL = process.env.URL ?? 'http://127.0.0.1:2701';
const SHIM = `
  window.__zustand = { level: 5, playerClass: 'core', punkte: 4 };
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
            if (ich) { ich.level = z.level; ich.xp = 0; ich.xpForNextLevel = 999; ich.playerClass = z.playerClass; ich.availablePoints = z.punkte; }
            data = JSON.stringify(p);
          }
        } catch {}
        listener({ ...event, data, type: 'message' });
      }, options);
    }
  };`;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name, viewport, touch] of [['Desktop 1920x1080', {width:1920,height:1080}, false], ['Handy 844x390', {width:844,height:390}, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(SHIM);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#join-button:not([disabled])', { timeout: 60000 }); await page.fill('#player-name','Karte');
  await page.click('#join-button');
  await page.waitForTimeout(6000);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const b = document.querySelector('#class-choices button[data-enhanced="true"]');
    const sicht = (el) => { if (!el) return 'fehlt'; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return cs.display === 'none' ? 'display:none' : (r.width<1||r.height<1) ? '0px' : `sichtbar ${Math.round(r.width)}x${Math.round(r.height)}`; };
    const sel = document.querySelector('#class-selection');
    const stickA = document.querySelector('#move-stick'); const stickB = document.querySelector('#aim-stick');
    return {
      karten: document.querySelectorAll('#class-choices button').length,
      klasse: b?.dataset.classChoice,
      name: sicht(b?.querySelector('strong')),
      bild: sicht(b?.querySelector('.class-choice-preview')),
      rolle: sicht(b?.querySelector('.class-choice-role')),
      beschreibung: sicht([...(b?.children??[])].find(c=>c.tagName==='SPAN'&&!c.className)),
      balken: sicht(b?.querySelector('.class-choice-bars')),
      level: sicht(b?.querySelector('small')),
      fuehrtZu: sicht(b?.querySelector('.class-choice-leads')),
      wahlOffen: sel && !sel.hasAttribute('hidden') && sel.dataset.collapsed !== 'true',
      moveStick: stickA ? getComputedStyle(stickA).pointerEvents + ' / opacity ' + getComputedStyle(stickA).opacity : 'fehlt',
      aimStick: stickB ? getComputedStyle(stickB).pointerEvents + ' / opacity ' + getComputedStyle(stickB).opacity : 'fehlt',
      abilityBtn: (()=>{const e=document.querySelector('.core-ability'); return e? getComputedStyle(e).pointerEvents+' / opacity '+getComputedStyle(e).opacity : 'fehlt';})(),
      secondaryBtn: (()=>{const e=document.querySelector('#secondary-action'); return e? getComputedStyle(e).display+' / '+e.textContent : 'fehlt';})(),
      onboardingKlasse: document.documentElement.classList.contains('onboarding-active'),
      eventBanner: (()=>{const e=document.querySelector('.arena-event-banner'); return e? getComputedStyle(e).display : 'fehlt';})()
    };
  });
  console.log('###', name, JSON.stringify(r, null, 1));
  await ctx.close();
}
await browser.close();
