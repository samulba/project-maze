/**
 * HUD-Kollisionsprüfung.
 *
 * Anlass: Sams „ES GIBT VIELE UI PROBLEME z.B. beim aussuchen der klasse".
 * Die Fehler saßen nicht in einem einzelnen Panel, sondern im Zusammenspiel –
 * jedes Stück war für sich geprüft, nie alle zusammen. Genau das prüft dieses
 * Skript: Es schiebt dem Client Spielerzustände unter (Level, Klasse, Punkte,
 * Tod, Signature), fährt eine Matrix aus Fenstergrößen ab und misst im DOM,
 * ob sich Flächen überlappen, verdecken, aus dem Bild ragen – oder ob eine
 * Klassenwahl unvollständig sichtbar ist.
 *
 * Unit-Tests können das nicht: Es ist Layout, und Layout entsteht erst im
 * Browser. Deshalb liegt die Prüfung hier statt in `npm run check` – sie
 * braucht einen laufenden Server und einen echten Chromium.
 *
 * ## Aufruf
 *
 * ```bash
 * npm run build
 * PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
 * npm i --no-save playwright-core        # Chromium ist im Container vorhanden
 * node scripts/ui-layout-check.mjs       # Exit 1, wenn etwas kollidiert
 * ```
 *
 * `playwright-core` steht bewusst **nicht** in `package.json`: Die Prüfung ist
 * ein Werkzeug für die Fehlersuche, kein Teil des Builds, und soll niemandem
 * eine Abhängigkeit aufzwingen.
 *
 * Umgebungsvariablen: `URL` (Standard `http://127.0.0.1:2599`),
 * `PW_CHROMIUM` (Standard `/opt/pw-browsers/chromium`), `SHOTS=1` legt zu
 * jedem Fall ein Bild unter `.probe/` ab.
 */

import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599';
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
const SHOTS = process.env.SHOTS === '1';

/**
 * Zustand unterschieben. Der Server kennt keinen Weg, einen Client auf Level 10
 * mit vier Punkten und offener Klassenwahl zu setzen – hier wird der Snapshot
 * auf der Leitung ergänzt, bevor der Client ihn sieht.
 */
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
              if (z.tot !== undefined) { ich.dead = z.tot; ich.killerName = 'Nova'; ich.canRespawnAt = p.serverTime + 2000; ich.deathLevel = 12; }
              if (z.signature !== undefined) ich.signature = z.signature;
            }
            data = JSON.stringify(p);
          }
        } catch { /* keine JSON-Nachricht */ }
        listener({ ...event, data, type: 'message' });
      }, options);
    }
  };
`;

/** Läuft im Browser: sammelt Flächen und sucht die vier Fehlerarten. */
function messenImBrowser() {
  const namen = {
    '#class-selection': 'Klassenwahl',
    '#upgrades': 'Upgrades',
    '#death-screen .death-card': 'Death-Karte',
    '#player-panel': 'Spielerkarte',
    '#leaderboard': 'Bestenliste',
    '.minimap': 'Minimap',
    '.auto-fire': 'Auto-Knopf',
    '.secondary-action': 'Repel',
    '.network-pill': 'Statuspille',
    '.killfeed': 'Killfeed',
    '.core-ability': 'Modul',
    '.onboarding': 'Onboarding',
    '.arena-event-banner': 'Event-Banner',
    '.spectator-banner': 'Zuschauerband',
    '.points-badge': 'Punkte-Badge'
  };
  const sichtbar = (e) => {
    if (!e || e.hidden) return false;
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const flaechen = [];
  for (const [sel, name] of Object.entries(namen)) {
    const e = document.querySelector(sel);
    if (!sichtbar(e)) continue;
    const r = e.getBoundingClientRect();
    flaechen.push({ name, sel, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  }

  const ueberlappungen = [];
  for (let i = 0; i < flaechen.length; i += 1) {
    for (let j = i + 1; j < flaechen.length; j += 1) {
      const a = flaechen[i], b = flaechen[j];
      const ea = document.querySelector(a.sel), eb = document.querySelector(b.sel);
      // Eltern und Kind teilen sich naturgemäß Fläche – das ist keine Kollision.
      if (ea.contains(eb) || eb.contains(ea)) continue;
      const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ox > 2 && oy > 2) ueberlappungen.push({ a: a.name, b: b.name, ox, oy });
    }
  }

  // Verdeckung: An neun Punkten je Fläche nachsehen, wer dort wirklich oben
  // liegt. Nur so unterscheidet sich „zwei Panels teilen sich Platz" von
  // „ein Panel liegt ÜBER einem anderen und macht es unlesbar".
  const verdeckt = [];
  for (const f of flaechen) {
    const el = document.querySelector(f.sel);
    let getroffen = 0;
    const taeter = {};
    for (const px of [0.15, 0.5, 0.85]) {
      for (const py of [0.15, 0.5, 0.85]) {
        const x = f.x + f.w * px, y = f.y + f.h * py;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        const oben = document.elementFromPoint(x, y);
        if (!oben || el.contains(oben) || oben.contains(el)) continue;
        // Der Canvas liegt unter der Bedienebene – dass er „oben" gemeldet
        // wird, heißt nur, dass die Fläche keine Klicks nimmt.
        const treffer = Object.entries(namen).find(([sel]) => oben.closest(sel));
        if (!treffer) continue;
        getroffen += 1;
        taeter[treffer[1]] = (taeter[treffer[1]] || 0) + 1;
      }
    }
    if (getroffen > 0) verdeckt.push({ name: f.name, punkte: getroffen, durch: taeter });
  }

  // Ein zugefahrenes Bottom-Sheet liegt absichtlich unter dem Rand.
  const zugefahren = (f) => {
    const e = document.querySelector(f.sel);
    return e.classList.contains('upgrade-panel') && !e.classList.contains('sheet-open')
      && getComputedStyle(e).transform !== 'none';
  };
  const ausserhalb = flaechen
    .filter((f) => !zugefahren(f))
    .filter((f) => f.x < -1 || f.y < -1 || f.x + f.w > window.innerWidth + 1 || f.y + f.h > window.innerHeight + 1)
    .map((f) => ({ name: f.name, unter: Math.max(0, f.y + f.h - window.innerHeight), rechts: Math.max(0, f.x + f.w - window.innerWidth), ueber: Math.max(0, -f.y), links: Math.max(0, -f.x) }));

  // Eine Klassenwahl, von der man die Hälfte nicht sieht, ist keine Wahl.
  const wahl = document.querySelector('#class-selection');
  let wahlKarten = null;
  if (wahl && !wahl.hidden) {
    const box = wahl.getBoundingClientRect();
    const karten = [...wahl.querySelectorAll('[data-class-choice]')];
    wahlKarten = {
      gesamt: karten.length,
      sichtbar: karten.filter((k) => {
        const r = k.getBoundingClientRect();
        return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
      }).length
    };
  }

  // Wie viel des Bildes nimmt keine Klicks mehr an? Gefeuert wird über den
  // Canvas; wo ein Panel darüber liegt, kommt kein Schuss an. Im Tod ist die
  // ganze Fläche belegt – das ist Absicht und wird nicht gemessen.
  const totenschirm = document.querySelector('#death-screen');
  const imTod = totenschirm && !totenschirm.hidden;
  const canvas = document.querySelector('canvas');
  let tot = 0, raster = 0;
  if (!imTod) for (let x = 8; x < window.innerWidth; x += 24) {
    for (let y = 8; y < window.innerHeight; y += 24) {
      raster += 1;
      const oben = document.elementFromPoint(x, y);
      if (oben && oben !== canvas && !canvas.contains(oben)) tot += 1;
    }
  }

  return { flaechen, ueberlappungen, verdeckt, ausserhalb, wahlKarten, imTod,
    totAnteil: raster > 0 ? +(tot / raster * 100).toFixed(1) : null };
}

/**
 * Die Matrix. Jede Zeile ist eine Zustandskombination, die es im echten Spiel
 * gibt – die meisten davon entstehen beim selben Level-Up.
 */
const FAELLE = [
  { name: 'wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core' } },
  { name: 'wahl-punkte', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-punkte-schmal', w: 900, h: 640, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-flach', w: 1280, h: 600, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-tot', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, tot: true } },
  { name: 'wahl-21-9', w: 2560, h: 1080, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-21-9-fuellend', w: 2560, h: 1080, sicht: 'flaechengleich', zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-4-3', w: 1280, h: 1024, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-1080', w: 1920, h: 1080, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'wahl-stufe2', w: 1280, h: 720, zustand: { level: 24, playerClass: 'storm', punkte: 4 } },
  { name: 'wahl-stufe3', w: 1280, h: 720, zustand: { level: 38, playerClass: 'gatling', punkte: 4 } },
  { name: 'wahl-ladung', w: 1280, h: 720, zustand: { level: 24, playerClass: 'sniper', punkte: 4, signature: 72 } },
  { name: 'wahl-touch', w: 900, h: 500, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'upgrades-zehn', w: 1280, h: 720, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'ruhig', w: 1280, h: 720, zustand: { level: 9, playerClass: 'core' } }
];

/** Ab hier gilt eine tote Fläche als Fehler – gemessen ohne Wahl sind es 1,4 %. */
const TOT_GRENZE = 32;

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const befunde = [];
  for (const fall of FAELLE) {
    const page = await browser.newPage({
      viewport: { width: fall.w, height: fall.h },
      ...(fall.touch ? { hasTouch: true, isMobile: true } : {})
    });
    const fehler = [];
    page.on('pageerror', (e) => fehler.push(String(e).slice(0, 140)));
    await page.addInitScript(
      `try{localStorage.setItem('project-maze-quality','low');localStorage.setItem('project-maze-view','${fall.sicht ?? 'fest'}');}catch{};`
      + `window.__zustand = ${JSON.stringify(fall.zustand)};`
    );
    await page.addInitScript(SHIM);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#join-button:not([disabled])', { timeout: 60_000 });
    await page.fill('#player-name', fall.name.slice(0, 18));
    await page.click('#join-button');
    await page.waitForSelector('#hud:not([hidden])', { timeout: 60_000 });
    await page.waitForTimeout(3000);
    const messung = await page.evaluate(messenImBrowser);
    if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
    await page.close();

    const zeile = [];
    for (const f of fehler) zeile.push(`Skriptfehler: ${f}`);
    // Der Death-Screen liegt bewusst über allem – seine Treffer sind kein Befund.
    const echt = (name) => !(messung.imTod && (name === 'Death-Karte' || messung.imTod));
    for (const u of messung.ueberlappungen) if (echt(u.a) && echt(u.b)) zeile.push(`${u.a} überlappt ${u.b} (${u.ox}×${u.oy} px)`);
    for (const v of messung.verdeckt) if (echt(v.name)) zeile.push(`${v.name} verdeckt durch ${Object.keys(v.durch).join(', ')}`);
    for (const a of messung.ausserhalb) zeile.push(`${a.name} ragt aus dem Bild (${JSON.stringify(a)})`);
    if (messung.wahlKarten && messung.wahlKarten.sichtbar < messung.wahlKarten.gesamt) {
      zeile.push(`Klassenwahl nur ${messung.wahlKarten.sichtbar}/${messung.wahlKarten.gesamt} Karten sichtbar`);
    }
    if (messung.totAnteil !== null && messung.totAnteil > TOT_GRENZE) {
      zeile.push(`${messung.totAnteil} % der Bildfläche nimmt keine Klicks an (Grenze ${TOT_GRENZE} %)`);
    }
    befunde.push({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: messung.totAnteil, probleme: zeile });
  }
  await browser.close();

  let kaputt = 0;
  for (const b of befunde) {
    if (b.probleme.length === 0) {
      console.log(`ok    ${b.fall.padEnd(20)} ${b.fenster.padEnd(11)} tote Fläche ${b.tot === null ? '– (tot)' : b.tot + ' %'}`);
      continue;
    }
    kaputt += 1;
    console.log(`FEHLER ${b.fall.padEnd(19)} ${b.fenster.padEnd(11)} tote Fläche ${b.tot === null ? '– (tot)' : b.tot + ' %'}`);
    for (const p of b.probleme) console.log(`         · ${p}`);
  }
  console.log(`\n${befunde.length - kaputt}/${befunde.length} Fälle ohne Befund.`);
  process.exitCode = kaputt > 0 ? 1 : 0;
}

await main();
