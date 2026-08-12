import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport:{width:1920,height:1080} })).newPage();
await page.goto('http://127.0.0.1:2701',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#join-button:not([disabled])',{timeout:60000});
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => {
  const l = document.querySelector('.core-loadout');
  const kette = []; let e = l;
  while (e && e !== document.body) { kette.push(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ').join('.'):'')); e = e.parentElement; }
  const r = l.getBoundingClientRect();
  return { kette, rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, imBild: r.bottom<=window.innerHeight && r.top>=0, sichtbarkeit: getComputedStyle(l).visibility, opacity: getComputedStyle(l).opacity };
}),null,1));
await browser.close();
