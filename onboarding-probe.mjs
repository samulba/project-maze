import { chromium } from 'playwright-core';
const URL = process.env.URL ?? 'http://127.0.0.1:2701';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
for (const [name, viewport, touch] of [['Desktop 1280x720', {width:1280,height:720}, false], ['Handy 844x390', {width:844,height:390}, true]]) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.addInitScript(`try{localStorage.setItem('project-maze-quality','low');localStorage.removeItem('project-maze-onboarded');}catch{}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#join-button:not([disabled])', { timeout: 60000 });
  await page.fill('#player-name','Onb');
  await page.click('#join-button');
  await page.waitForTimeout(2000);
  await page.keyboard.press('KeyE');            // Autofeuer
  await page.keyboard.press('Space');           // Faehigkeit -> usedAbility
  const t0 = Date.now();
  let gewaehlt = false, punkt = false;
  while (Date.now() - t0 < 75000) {
    const r = Math.random();
    const k = r < .25 ? 'KeyW' : r < .5 ? 'KeyA' : r < .75 ? 'KeyS' : 'KeyD';
    await page.keyboard.down(k); await page.waitForTimeout(700); await page.keyboard.up(k);
    await page.mouse.move(viewport.width/2 + (Math.random()-.5)*400, viewport.height/2 + (Math.random()-.5)*300);
    if (!punkt) { await page.keyboard.press('Digit1'); punkt = true; }
    if (!gewaehlt) {
      const btn = await page.$('#class-choices button');
      if (btn) { await btn.click({ timeout: 3000 }).catch(()=>{}); gewaehlt = true; }
    }
    await page.keyboard.press('Space');
  }
  const r = await page.evaluate(() => {
    const karte = document.querySelector('.onboarding');
    const lb = document.querySelector('.leaderboard');
    const ban = document.querySelector('.arena-event-banner');
    const cs = getComputedStyle(document.documentElement);
    return {
      onboardingKarteVersteckt: karte ? karte.hidden : 'fehlt',
      htmlKlasseOnboardingActive: document.documentElement.classList.contains('onboarding-active'),
      topStackStart: cs.getPropertyValue('--top-stack-start').trim(),
      leaderboardDisplay: lb ? getComputedStyle(lb).display : 'fehlt',
      eventBannerDisplay: ban ? getComputedStyle(ban).display : 'fehlt',
      level: document.querySelector('#ui-level')?.textContent,
      klasse: document.querySelector('#ui-class')?.textContent
    };
  });
  console.log('###', name, JSON.stringify(r));
  await ctx.close();
}
await browser.close();
