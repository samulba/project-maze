import { chromium } from 'playwright-core';
const URL='http://127.0.0.1:2701';
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport:{width:1920,height:1080} });
const page = await ctx.newPage();
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#join-button:not([disabled])',{timeout:60000});
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const form = document.querySelector('#join-form');
  const bedien = [...form.querySelectorAll('input, select, button, textarea')]
    .filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.start-nav'));
  const text = (s)=>document.querySelector(s)?.textContent?.trim();
  return {
    bedienelemente: bedien.map(e => `${e.tagName.toLowerCase()}#${e.id||e.className}`),
    loadoutSichtbar: (()=>{const l=document.querySelector('.core-loadout'); return l? getComputedStyle(l).display+' im '+(l.closest('#join-form')?'Startformular':'?') : 'fehlt';})(),
    loadoutText: text('.core-loadout-heading'),
    modulOptionen: [...document.querySelectorAll('[data-module-select] option')].map(o=>o.textContent),
    frameOptionen: [...document.querySelectorAll('[data-modifier-select] option')].map(o=>o.textContent),
    beschreibung: text('[data-loadout-description]'),
    steuerzeile: text('.start-note'),
    tagline: text('.start-tagline'),
    metaDescription: document.querySelector('meta[name=description]')?.content,
    ogDescription: document.querySelector('meta[property="og:description"]')?.content,
    navHinweise: [...document.querySelectorAll('.start-nav [data-goto]')].map(b=>b.textContent.trim())
  };
});
console.log(JSON.stringify(r,null,1));
await page.screenshot({ path: '/tmp/claude-0/-home-user-project-maze/7c512f2b-0720-5a60-87ad-f4eb84dd29dc/scratchpad/start.png' });
await browser.close();
