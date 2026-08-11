/**
 * End-to-End-Probe der Touch-Bedienung.
 *
 * Warum es das braucht: `scripts/ui-layout-check.mjs` prüft, ob auf dem Handy
 * nichts überlappt und keine Trefferfläche zu klein ist – also ob die Bedienung
 * *aussieht*, als ginge sie. Ob man damit wirklich spielen kann, prüft nichts.
 * Ein Stick, der sauber sitzt und trotzdem keine Eingabe schickt, kommt durch
 * jeden bestehenden Test.
 *
 * Deshalb spielt hier ein echter Browser mit echtem Touch auf einem echten
 * Handyformat.
 *
 * **Was diese Probe beweist – und was nicht.** Sie prüft den Weg vom Finger bis
 * in die Eingabeschicht des Spiels: dass die Sticks Touch annehmen, dass sie
 * die Feuerschwelle erreichen, und dass zwei Daumen gleichzeitig funktionieren.
 * Genau dort sitzen die Fehler, die es nur auf dem Handy gibt – ein Overlay,
 * das Berührungen schluckt, ein `pointer-events`, das zu viel abfängt, zwei
 * Finger, die um denselben Zeiger streiten.
 *
 * Sie beweist **nicht**, dass die Eingabe beim Server ankommt. Der
 * Onboarding-Schritt „Beweg dich" hängt an `input.isMoving`, also am Client
 * (`main.ts`: `onboarding.update(snapshot, input?.isMoving ?? false)`). Für den
 * Weg zum Server ist `npm run wire-probe` zuständig, und der ist auf Handy und
 * Desktop derselbe.
 *
 * Die geernteten XP stehen deshalb im Bericht, **entscheiden aber nicht**, und
 * dafür gibt es zwei Gründe – beide gemessen:
 *
 * * Sie würfeln. Ob man in fünfzehn Sekunden eine Form trifft, ist
 *   Spawn-Glück; drei Läufe auf 932 × 430 ergaben Stufe 3, Stufe 2 und Stufe 1
 *   bei identischer Software. Ein Test, der würfelt, wird ignoriert – und dann
 *   nützt auch der Teil nichts mehr, der zuverlässig misst.
 * * Sie beweisen nicht einmal das Richtige. Im Sabotage-Lauf mit vollständig
 *   toten Sticks stieg die XP trotzdem auf 45 und der Spieler auf Stufe 3 –
 *   Rammschaden und Auto-Feuer reichen dafür. Als hartes Kriterium hätte die
 *   XP die Sabotage also durchgewinkt.
 *
 * Touch-Events müssen über CDP kommen: `page.mouse` erzeugt `pointerType:
 * 'mouse'`, und genau darauf reagieren die Sticks absichtlich nicht
 * (`input.ts`). Eine Probe mit der Maus würde also grün melden, während auf dem
 * Handy nichts geht.
 *
 * Gegengeprüft per Sabotage (`bindStick` überbrückt): Die Probe meldet dann
 * weiterhin `sticksSichtbar: {move: true, aim: true}` – die Sticks sitzen also
 * tadellos und die Layout-Harness bliebe grün – und trotzdem `okay: false`,
 * weil kein Stick anspringt, Multi-Touch ausbleibt und das Onboarding auf
 * „Beweg dich" hängt. Das ist genau der Fall, für den es diese Datei gibt.
 *
 * Aufruf – Server und Client müssen laufen:
 *   node apps/server/dist/index.js &          # Port 2567
 *   npx vite --port 5199 apps/client &
 *   node scripts/touch-probe.mjs
 *
 * Umgebung: `URL`, `BREITE`/`HOEHE` (Standard 844×390, iPhone 13 quer),
 * `SHOT`, `PW_CHROMIUM`.
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:5199/';
const BREITE = Number(process.env.BREITE ?? 844);
const HOEHE = Number(process.env.HOEHE ?? 390);
/**
 * Der Bewegungs-Schritt des Onboardings hat einen Zeit-Notausgang: Nach
 * 14 s **Arena-Zeit** verschwindet er, damit der Ablauf nie hängen bleibt
 * (`onboarding.ts`, `isDone`). Wer den Schritt als Beweis nimmt, muss ihn
 * deshalb gegen diese Uhr abgrenzen – sonst belegt ein grüner Lauf nur, dass
 * die Zeit vergangen ist.
 *
 * Gemessen wird gegen die ARENA-Uhr, nicht gegen die Wanduhr, und das ist der
 * Unterschied zwischen einer verlässlichen und einer würfelnden Probe: In
 * diesem Container kostet **ein einziges** Touch-Event rund 500 ms und
 * `boundingBox()` 1,5 s (nachgemessen). Ein Daumenzug ist damit nach Wanduhr
 * gut vier Sekunden alt, bevor er überhaupt ankommt. Die alte Frist von 11 s
 * Wanduhr hat deshalb unter Last zwei von fünf Formaten rot gemeldet, die
 * einzeln grün waren – gemessen wurde die Rechenlast, nicht der Stick.
 *
 * Die Arena-Uhr steht im Fortschrittsbalken des Onboardings (`elapsedMs` als
 * Anteil des 60-s-Fensters) und ist genau die Zahl, gegen die der Notausgang
 * prüft.
 */
const ONBOARDING_FENSTER_MS = 60_000;
const BEWEGUNG_ARENAZEIT_GRENZE_MS = 12_000;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const context = await browser.newContext({
  viewport: { width: BREITE, height: HOEHE },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const fehler = [];
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) fehler.push(`error: ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !/\/leaderboard|favicon/.test(r.url())) fehler.push(`HTTP ${r.status()}: ${r.url()}`);
});

/**
 * Zieht einen Finger von der Mitte eines Elements aus und hält ihn dort.
 *
 * `beobachten` wird während des Haltens wiederholt gefragt und beendet den Zug,
 * sobald es `true` meldet. Das ist der Unterschied zwischen „nach dem Halten
 * nachsehen" und „mitschreiben, wann es passiert ist": Der Onboarding-Schritt
 * wechselt binnen eines Snapshots, und wer erst danach liest, schreibt die
 * ganze Haltezeit dem Wechsel zu.
 */
async function stickZiehen(auswahl, dx, dy, haltenMs, beobachten = null) {
  const kasten = await page.locator(auswahl).boundingBox();
  if (!kasten) throw new Error(`${auswahl} hat keine Fläche – Stick nicht sichtbar?`);
  const x = kasten.x + kasten.width / 2;
  const y = kasten.y + kasten.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  // In Schritten ziehen: Ein einzelner Sprung sieht für die Stick-Logik wie ein
  // Ausrutscher aus, mehrere Zwischenschritte wie ein gehaltener Daumen.
  for (let schritt = 1; schritt <= 4; schritt += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * schritt) / 4, y: y + (dy * schritt) / 4, id: 1 }]
    });
    await page.waitForTimeout(40);
  }
  /*
   * Mitschreiben, ob der Stick überhaupt angesprungen ist. Ohne das ist ein
   * ausbleibendes Ergebnis nicht deutbar: „der Stick nimmt keine Eingabe" und
   * „geschossen, aber nichts getroffen" sähen beide gleich aus – und nur das
   * erste ist ein Fehler.
   */
  const angesprungen = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return Boolean(el && (el.classList.contains('touching') || el.classList.contains('engaged')));
  }, auswahl);
  const ende = Date.now() + haltenMs;
  while (Date.now() < ende) {
    if (beobachten && await beobachten()) break;
    await page.waitForTimeout(120);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return angesprungen;
}

/**
 * Arena-Zeit in Millisekunden, abgelesen am Fortschrittsbalken des Onboardings.
 * Das ist dieselbe Uhr, gegen die der Zeit-Notausgang des Schritts prüft –
 * anders als die Wanduhr enthält sie weder Startzeit noch Event-Latenz.
 */
const arenaZeitMs = () => page.evaluate((fenster) => {
  const breite = document.querySelector('[data-onboarding-progress]')?.style?.width ?? '';
  const prozent = Number.parseFloat(breite);
  return Number.isFinite(prozent) ? (prozent / 100) * fenster : null;
}, ONBOARDING_FENSTER_MS);

const text = (auswahl) => page.evaluate(
  (sel) => document.querySelector(sel)?.textContent?.trim() ?? null,
  auswahl
);

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('#join-button', { timeout: 90_000 });
await page.fill('#player-name', 'TouchProbe').catch(() => {});
await page.tap('#join-button');
await page.waitForSelector('#move-stick', { timeout: 60_000 });
/*
 * Erst ziehen, wenn wirklich Snapshots fließen.
 *
 * `#move-stick` steht von Anfang an im Markup – es beweist nur, dass die Seite
 * da ist, nicht dass das Spiel läuft. `moving` wird dagegen ausschließlich beim
 * Eintreffen eines Snapshots gelesen (`main.ts`), und die Arena-Uhr des
 * Onboardings läuft erst ab dem ersten. Wer vorher zieht, misst die Ladezeit
 * mit. Der Kartentext ist der ehrlichste Beleg dafür, dass ein Snapshot mit
 * eigenem Spieler angekommen ist: Er wird erst dort gesetzt.
 */
await page.waitForFunction(
  () => Boolean(document.querySelector('[data-onboarding-title]')?.textContent?.trim()),
  { timeout: 60_000 }
);
const beginn = Date.now();

const zaehlerVorher = await text('[data-onboarding-counter]');
const schrittVorher = await text('[data-onboarding-title]');
const sticksSichtbar = await page.evaluate(() => {
  const sichtbar = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
  };
  return { move: sichtbar('#move-stick'), aim: sichtbar('#aim-stick') };
});

/*
 * 1. Bewegung: Daumen nach rechts, gut vier Sekunden halten – und dabei
 * mitschreiben, WANN der Onboarding-Schritt wechselt, gemessen an der Arena-Uhr.
 * Erst diese Zahl trennt „der Stick bewegt den Tank" vom Zeit-Notausgang.
 */
let arenaZeitBeimWechsel = null;
const moveAngesprungen = await stickZiehen('#move-stick', 60, 0, 4_200, async () => {
  const stand = await page.evaluate(() => ({
    titel: document.querySelector('[data-onboarding-title]')?.textContent?.trim() ?? null,
    breite: document.querySelector('[data-onboarding-progress]')?.style?.width ?? ''
  }));
  if (stand.titel === schrittVorher) return false;
  const prozent = Number.parseFloat(stand.breite);
  arenaZeitBeimWechsel = Number.isFinite(prozent) ? (prozent / 100) * ONBOARDING_FENSTER_MS : null;
  return true;
});
const zaehlerNachher = await text('[data-onboarding-counter]');
const schrittNachher = await text('[data-onboarding-title]');
const bewegungMs = Date.now() - beginn;
// Der Wechsel kann auch zwischen zwei Blicken passiert sein – dann steht die
// Arena-Uhr von jetzt da, und die ist nie kleiner als die zum Wechsel.
if (arenaZeitBeimWechsel === null && schrittVorher !== schrittNachher) arenaZeitBeimWechsel = await arenaZeitMs();

/*
 * 2. Feuern – mit BEIDEN Daumen gleichzeitig, und zwar aus zwei Gründen.
 *
 * Der eine ist Realismus: So spielt man auf einem Handy. Damit prüft dieser
 * Abschnitt nebenbei Multi-Touch, also dass zwei Finger nicht um denselben
 * Zeiger streiten – ein Fehler, der auf dem Desktop nie auffällt.
 *
 * Der andere ist Verlässlichkeit. Eine frühere Fassung stand still und feuerte
 * nur in vier Richtungen; ob dabei zufällig eine Form in Reichweite stand, war
 * Spawn-Glück. Drei Läufe auf 932 × 430 ergaben Stufe 3, Stufe 2 und Stufe 1 –
 * dieselbe Software, dreimal ein anderes Urteil. Ein Test, der würfelt, ist
 * schlimmer als keiner. Wer fährt, kommt an Formen vorbei.
 */
const daumen = new Map();
const mitteVon = async (auswahl) => {
  const k = await page.locator(auswahl).boundingBox();
  if (!k) throw new Error(`${auswahl} hat keine Fläche – Stick nicht sichtbar?`);
  return { x: k.x + k.width / 2, y: k.y + k.height / 2 };
};
const senden = (type) => cdp.send('Input.dispatchTouchEvent', {
  type,
  touchPoints: [...daumen.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }))
});

const moveMitte = await mitteVon('#move-stick');
const aimMitte = await mitteVon('#aim-stick');
daumen.set(1, { ...moveMitte });
daumen.set(2, { ...aimMitte });
await senden('touchStart');

let aimAngesprungen = false;
let beideGleichzeitig = false;
let tode = 0;
const SCHRITTE = 60;
for (let schritt = 0; schritt < SCHRITTE; schritt += 1) {
  // Beide Daumen kreisen, gegenläufig: fahren in die eine, zielen in die
  // andere Richtung deckt in kurzer Zeit viel Umgebung ab.
  const t = (schritt / SCHRITTE) * Math.PI * 2;
  daumen.set(1, { x: moveMitte.x + Math.cos(t) * 60, y: moveMitte.y + Math.sin(t) * 45 });
  daumen.set(2, { x: aimMitte.x + Math.cos(-t * 2) * 60, y: aimMitte.y + Math.sin(-t * 2) * 45 });
  await senden('touchMove');
  const zustand = await page.evaluate(() => ({
    aim: document.querySelector('#aim-stick')?.classList.contains('engaged') ?? false,
    move: document.querySelector('#move-stick')?.classList.contains('engaged') ?? false,
    tot: !(document.querySelector('#death-screen')?.hasAttribute('hidden') ?? true)
  }));
  if (zustand.aim) aimAngesprungen = true;
  if (zustand.aim && zustand.move) beideGleichzeitig = true;

  /*
   * Sterben gehört dazu – ein Spieler auf Stufe 1 zwischen achtzehn Bots hält
   * selten fünfzehn Sekunden durch. Nach dem Tod schaltet `setEnabled(false)`
   * die Sticks ab; wer das nicht behandelt, misst ab da nur noch Totenstille
   * und meldet je nach Todeszeitpunkt mal grün, mal rot. Genau das ist auf
   * 844 × 390 passiert.
   */
  if (zustand.tot) {
    tode += 1;
    daumen.clear();
    await senden('touchEnd');
    await page.waitForSelector('#respawn-button:not([disabled])', { timeout: 20_000 }).catch(() => {});
    await page.tap('#respawn-button').catch(() => {});
    await page.waitForTimeout(600);
    daumen.set(1, { ...moveMitte });
    daumen.set(2, { ...aimMitte });
    await senden('touchStart');
    continue;
  }
  await page.waitForTimeout(250);
}
daumen.clear();
await senden('touchEnd');

const befund = await page.evaluate(() => {
  const roh = document.querySelector('.player-panel, #player-panel')?.textContent ?? '';
  const xp = /(\d+)\s*\/\s*(\d+)\s*XP/.exec(roh);
  const stufe = /LVL\s*(\d+)/i.exec(document.querySelector('.level-badge')?.textContent ?? '');
  return {
    canvas: !!document.querySelector('canvas'),
    name: document.querySelector('.player-heading strong')?.textContent?.trim() ?? null,
    xp: xp ? Number(xp[1]) : null,
    xpZiel: xp ? Number(xp[2]) : null,
    level: stufe ? Number(stufe[1]) : null
  };
});

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();

const bewegt = schrittVorher !== schrittNachher
  && arenaZeitBeimWechsel !== null && arenaZeitBeimWechsel < BEWEGUNG_ARENAZEIT_GRENZE_MS;
/*
 * Aufgestiegen zaehlt genauso wie XP auf der Uhr.
 *
 * Erst stand hier nur `xp > 0` – und das meldete auf 667 × 375 rot, obwohl
 * alles funktionierte: Der Spieler hatte so gut gefarmt, dass er im letzten
 * Moment aufstieg, und beim Levelaufstieg springt der Zaehler auf 0 zurueck.
 * Die Probe haette also ausgerechnet den besten Lauf als Fehler gemeldet. Am
 * Ziel-XP sieht man es: 73 ist Stufe 1, alles darueber ist ein Aufstieg.
 */
const gefeuert = (befund.xp ?? 0) > 0 || (befund.level ?? 1) > 1;
/*
 * Bestehenskriterium: nur das, was zuverlaessig messbar ist. Das Farmen ist
 * absichtlich NICHT dabei -- siehe Kopfkommentar.
 */
const okay = befund.canvas && sticksSichtbar.move && sticksSichtbar.aim
  && moveAngesprungen && aimAngesprungen && beideGleichzeitig && bewegt && fehler.length === 0;

console.log(JSON.stringify({
  okay,
  format: `${BREITE}×${HOEHE}`,
  sticksSichtbar,
  sticksReagieren: { move: moveAngesprungen, aim: aimAngesprungen },
  multiTouch: beideGleichzeitig,
  tode,
  bewegung: {
    vorher: schrittVorher,
    nachher: schrittNachher,
    zaehler: zaehlerVorher + ' -> ' + zaehlerNachher,
    // Arena-Uhr entscheidet, Wanduhr steht nur zur Einordnung dabei: Sie
    // enthaelt die Ereignis-Latenz des Containers (rund 500 ms je Touch-Event).
    arenaMs: arenaZeitBeimWechsel === null ? null : Math.round(arenaZeitBeimWechsel),
    notausgangBeiMs: 14_000,
    wanduhrMs: bewegungMs,
    gewertet: bewegt
  },
  gefarmt: { xp: befund.xp, von: befund.xpZiel, level: befund.level, hinweis: gefeuert ? 'getroffen' : 'nichts getroffen (Spawn-Glueck, kein Fehler)' },
  spieler: befund.name,
  fehler
}, null, 1));

if (!okay) {
  console.error('\ntouch-probe: Befund.');
  if (!bewegt) {
    console.error(schrittVorher === schrittNachher
      ? '  Bewegung nicht nachgewiesen – der linke Stick schickt keine Eingabe.'
      : `  Schritt wechselte erst nach ${Math.round(arenaZeitBeimWechsel ?? 0)} ms Arena-Zeit –`
        + ' das kann auch der Zeit-Notausgang (14 s) gewesen sein.');
  }
  if (!beideGleichzeitig) console.error('  Zwei Daumen gleichzeitig gehen nicht – Multi-Touch streitet um denselben Zeiger.');
  if (!aimAngesprungen) console.error('  Der Ziel-Stick erreichte nie die Feuerschwelle – die Eingabe kommt nicht durch.');
  if (!moveAngesprungen) console.error('  Der Bewegungs-Stick sprang nie an.');
}
process.exit(okay ? 0 : 1);
