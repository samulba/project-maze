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
            if (z.zuschauen) {
              // Ein Ziel muss her – im Sichtradius ist nicht immer jemand.
              let fremd = p.players.find((x) => String(x.id) !== String(p.selfId));
              if (!fremd && ich) {
                fremd = JSON.parse(JSON.stringify(ich));
                fremd.id = 999999; fremd.name = 'Nova'; fremd.dead = false;
                fremd.position = { x: ich.position.x + 120, y: ich.position.y };
                p.players.push(fremd);
              }
              if (fremd) p.spectatorTargetId = fremd.id;
            }
            if (z.event) {
              p.arenaEvent = { kind: z.event, phase: 'active', endsAt: p.serverTime + 30000,
                center: ich ? { x: ich.position.x, y: ich.position.y } : { x: 3000, y: 2000 }, radius: 700 };
            }
            if (z.bounty) {
              const opfer = p.players.find((x) => String(x.id) !== String(p.selfId));
              if (opfer) { p.bountyTargetId = opfer.id; p.gameplay = p.gameplay || {};
                p.gameplay[String(opfer.id)] = { ...(p.gameplay?.[String(opfer.id)] ?? {}), bountyValue: 1200 }; }
            }
            if (z.achievements && !window.__achievementsGesendet) {
              // freshAchievements ist das Feld, aus dem der Client seine Popups
              // speist – einmal senden, sonst laufen sie endlos nach.
              window.__achievementsGesendet = true;
              p.freshAchievements = z.achievements;
            }
            data = JSON.stringify(p);
          }
        } catch { /* keine JSON-Nachricht */ }
        listener({ ...event, data, type: 'message' });
      }, options);
    }
  };
`;

/**
 * Läuft im Browser: prüft den Startscreen und seine Unterseiten. Andere Fragen
 * als im Spiel – dort geht es um Kollisionen, hier um Erreichbarkeit: Passt
 * alles ohne Seitenscrollen, bleibt der Weg ins Spiel sichtbar, ragt nichts
 * über den Rand?
 */
function messenStartscreen(seite) {
  const el = (sel) => document.querySelector(sel);
  const kasten = (sel) => { const e = el(sel); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width < 1 ? null : r; };
  const ganzImBild = (r) => r && r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
  const probleme = [];

  const bildschirm = el('#start-screen');
  if (bildschirm.scrollHeight > window.innerHeight + 1) probleme.push('Startscreen scrollt als Ganzes');

  if (seite === 'start') {
    const play = kasten('#join-button');
    const name = kasten('#player-name');
    if (!ganzImBild(play)) probleme.push('Play-Knopf nicht vollständig im Bild');
    if (!ganzImBild(name)) probleme.push('Namensfeld nicht vollständig im Bild');
    const bedien = [...el('#join-form').querySelectorAll('input, select, button, textarea')]
      .filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('.start-nav'));
    if (bedien.length > 2) probleme.push(`Startseite trägt ${bedien.length} Bedienelemente statt 2`);
    for (const knopf of el('.start-nav').querySelectorAll('[data-goto]')) {
      if (!ganzImBild(knopf.getBoundingClientRect())) probleme.push(`Navigationseintrag ${knopf.dataset.goto} ragt aus dem Bild`);
    }
  } else {
    const abschnitt = el(`[data-view="${seite}"]`);
    if (!abschnitt || abschnitt.hidden) return { probleme: [`Seite ${seite} öffnet nicht`] };
    const kopf = abschnitt.querySelector('.start-page-head').getBoundingClientRect();
    if (!ganzImBild(kopf)) probleme.push('Seitenkopf mit Zurück-Weg nicht im Bild');
    const koerper = abschnitt.querySelector('.start-page-body');
    const kr = koerper.getBoundingClientRect();
    if (kr.bottom > window.innerHeight + 1) probleme.push('Seiteninhalt ragt unter den Bildrand');
    if ((koerper.textContent || '').trim().length < 20) probleme.push('Seite ist praktisch leer – kein erklärender Text');
    // Waagerecht darf nichts überlaufen: Das ist der klassische Fehler auf schmalen Geräten.
    for (const kind of koerper.querySelectorAll('*')) {
      const r = kind.getBoundingClientRect();
      if (r.width > 0 && (r.left < kr.left - 2 || r.right > kr.right + 2)) {
        probleme.push(`Element läuft waagerecht über: ${kind.className || kind.tagName}`);
        break;
      }
    }
  }
  return { probleme };
}

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
    '.points-badge': 'Punkte-Badge',
    '.move-stick': 'Bewegungs-Stick',
    '.aim-stick': 'Ziel-Stick',
    '.class-overlay .codex-card': 'Klassen-Karte',
    '.class-overlay .codex-wheel': 'Klassenrad'
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
  // Leseansicht des Klassenrades: Dort tritt die Bedienung bewusst zurück –
  // die tote Fläche misst dann nicht mehr, was sie messen soll.
  const rad = document.querySelector('.class-overlay');
  const spielerkarte = document.querySelector('#player-panel');
  const leseansicht = Boolean(rad && !rad.hidden && spielerkarte
    && Number(getComputedStyle(spielerkarte).opacity) < 0.05);
  const canvas = document.querySelector('canvas');
  const kompakt = totenschirm && totenschirm.classList.contains('spectating');
  let tot = 0, raster = 0;
  if ((!imTod || kompakt) && !leseansicht) for (let x = 8; x < window.innerWidth; x += 24) {
    for (let y = 8; y < window.innerHeight; y += 24) {
      raster += 1;
      const oben = document.elementFromPoint(x, y);
      if (oben && oben !== canvas && !canvas.contains(oben)) tot += 1;
    }
  }

  return { flaechen, ueberlappungen, verdeckt, ausserhalb, wahlKarten, imTod,
    kompakterTod: Boolean(totenschirm && totenschirm.classList.contains('spectating')),
    totAnteil: raster > 0 ? +(tot / raster * 100).toFixed(1) : null };
}

/**
 * Die Matrix. Jede Zeile ist eine Zustandskombination, die es im echten Spiel
 * gibt – die meisten davon entstehen beim selben Level-Up.
 */
const FAELLE = [
  // --- Klassenwahl (Runde 6) --------------------------------------------
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
  { name: 'ruhig', w: 1280, h: 720, zustand: { level: 9, playerClass: 'core' } },

  // --- Tod und Zuschauen (Runde 7) --------------------------------------
  // Der Death-Screen schrumpft beim Zuschauen, während darunter weitergespielt
  // wird – zwei Zustände übereinander, die es vorher nicht gab.
  { name: 'tod', w: 1280, h: 720, zustand: { tot: true } },
  { name: 'tod-flach', w: 1280, h: 600, zustand: { tot: true } },
  { name: 'tod-hoch', w: 900, h: 1180, zustand: { tot: true } },
  { name: 'zuschauen', w: 1280, h: 720, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-flach', w: 1280, h: 600, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-21-9', w: 2560, h: 1080, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-touch', w: 844, h: 390, touch: true, zustand: { tot: true, zuschauen: true } },
  { name: 'zuschauen-wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, tot: true, zuschauen: true } },

  // --- Der obere Bereich: alles gleichzeitig -----------------------------
  // Onboarding, Event-Banner, Bounty und Achievement-Popup teilen sich die
  // Mitte oben. Was passiert, wenn drei zusammen kommen?
  { name: 'oben-event', w: 1280, h: 720, zustand: { event: 'overcharge' } },
  { name: 'oben-event-bounty', w: 1280, h: 720, zustand: { event: 'overcharge', bounty: true } },
  { name: 'oben-alles', w: 1280, h: 720, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-wahl', w: 1280, h: 720, zustand: { level: 10, playerClass: 'core', punkte: 4, event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-schmal', w: 900, h: 640, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },
  { name: 'oben-alles-touch', w: 390, h: 844, touch: true, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },

  // --- Das Rad (KL3) ----------------------------------------------------
  // Ein Vollbild-Overlay auf 844×390 ist die härteste Prüfung, die es gibt –
  // und es öffnet mitten im Gefecht, also mit allem anderen zusammen.
  { name: 'rad', w: 1280, h: 720, rad: true, zustand: {} },
  { name: 'rad-punkte', w: 1280, h: 720, rad: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'rad-wahl', w: 1280, h: 720, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-flach', w: 1280, h: 600, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-schmal', w: 900, h: 640, rad: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'rad-21-9', w: 2560, h: 1080, rad: true, zustand: {} },
  { name: 'rad-1080', w: 1920, h: 1080, rad: true, zustand: { level: 38, playerClass: 'gatling' } },
  { name: 'rad-4-3', w: 1280, h: 1024, rad: true, zustand: {} },
  { name: 'rad-tot', w: 1280, h: 720, rad: true, zustand: { tot: true } },
  { name: 'rad-touch', w: 844, h: 390, touch: true, rad: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'rad-touch-klein', w: 667, h: 375, touch: true, rad: true, zustand: {} },
  { name: 'rad-oben-alles', w: 1280, h: 720, rad: true, zustand: { event: 'fracture', bounty: true, achievements: ['fivestreak'] } },

  // --- Mobil (R3 ist lange her) -----------------------------------------
  { name: 'mobil-hoch', w: 390, h: 844, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'mobil-quer', w: 844, h: 390, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } },
  { name: 'mobil-tablet', w: 820, h: 1180, touch: true, zustand: { level: 24, playerClass: 'storm', punkte: 6 } },
  { name: 'mobil-klein-quer', w: 667, h: 375, touch: true, zustand: { level: 10, playerClass: 'core', punkte: 4 } }
];

/**
 * Startscreen und Unterseiten. Andere Frage als im Spiel, deshalb eigene Liste:
 * Hier geht es um Erreichbarkeit, nicht um Kollision.
 */
const START_FAELLE = [];
for (const [w, h, label, touch] of [
  [1280, 900, 'desktop', false],
  [1280, 620, 'flach', false],
  [2560, 1080, '21-9', false],
  [390, 844, 'handy', true],
  [844, 390, 'handy-quer', true],
  [820, 1180, 'tablet', true]
]) {
  for (const seite of ['start', 'profil', 'achievements', 'bestenliste', 'einstellungen']) {
    START_FAELLE.push({ name: `seite-${seite}-${label}`, w, h, touch, seite });
  }
}

/**
 * Ab hier gilt eine tote Fläche als Fehler – gemessen ohne Wahl sind es 1,4 %.
 *
 * **Nur für Zeigergeräte.** Auf Touch misst die Kennzahl das Falsche: Dort
 * wird nicht über den Canvas gezielt, sondern über die Sticks, und die beiden
 * belegen allein schon 20 % eines 844×390-Schirms. Sie sind die Bedienung,
 * nicht ihr Hindernis. Der Wert wird trotzdem gemeldet – nur nicht bewertet.
 */
const TOT_GRENZE = 32;

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const befunde = [];

  /**
   * Sofort ausgeben, nicht erst am Ende: Der volle Durchlauf dauert Minuten,
   * und ein Werkzeug, das so lange schweigt, benutzt niemand zweimal.
   */
  const melden = (b) => {
    befunde.push(b);
    const flaeche = b.tot === null ? '' : `tote Fläche ${b.tot} %`;
    console.log(`${b.probleme.length ? 'FEHLER' : 'ok    '} ${b.fall.padEnd(26)} ${b.fenster.padEnd(11)} ${flaeche}`);
    for (const p of b.probleme) console.log(`         · ${p}`);
  };

  /** Eine Seite mit Zustand und Fenstergröße öffnen. */
  const oeffnen = async (fall) => {
    const page = await browser.newPage({
      viewport: { width: fall.w, height: fall.h },
      ...(fall.touch ? { hasTouch: true, isMobile: true } : {})
    });
    const fehler = [];
    page.on('pageerror', (e) => fehler.push(String(e).slice(0, 140)));
    await page.addInitScript(
      `try{localStorage.setItem('project-maze-quality','low');localStorage.setItem('project-maze-view','${fall.sicht ?? 'fest'}');`
      + `localStorage.setItem('project-maze-onboarding-done','');}catch{};`
      + `window.__zustand = ${JSON.stringify(fall.zustand ?? {})};`
    );
    await page.addInitScript(SHIM);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#join-button:not([disabled])', { timeout: 60_000 });
    return { page, fehler };
  };

  // Mit `ONLY=<text>` lässt sich die Matrix auf passende Fälle einengen – beim
  // Reparieren will man nicht jedes Mal alle 75 abwarten.
  const nurWenn = (name) => !process.env.ONLY || name.includes(process.env.ONLY);

  // --- Startscreen und Unterseiten --------------------------------------
  for (const fall of START_FAELLE.filter((f) => nurWenn(f.name))) {
    try {
    const { page, fehler } = await oeffnen(fall);
    if (fall.seite !== 'start') {
      await page.click(`[data-goto="${fall.seite}"]`);
      await page.waitForTimeout(350);
    }
    const messung = await page.evaluate(messenStartscreen, fall.seite);
    if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
    await page.close();
    melden({
      fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
      probleme: [...fehler.map((f) => `Skriptfehler: ${f}`), ...messung.probleme]
    });
    } catch (error) {
      // Ein Fall, der gar nicht erst hochkommt, ist der schwerste Befund –
      // aber er darf die restliche Matrix nicht abbrechen.
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
        probleme: [`kommt nicht hoch: ${String(error).split('\n')[0].slice(0, 120)}`] });
    }
  }

  // --- Spiel-HUD ---------------------------------------------------------
  for (const fall of FAELLE.filter((f) => nurWenn(f.name))) {
    try {
    const { page, fehler } = await oeffnen(fall);
    await page.fill('#player-name', fall.name.slice(0, 18));
    await page.click('#join-button');
    // Touch im Hochformat ist kein Spielzustand: Das Spiel blendet das HUD aus
    // und zeigt „Bitte Gerät drehen". Statt auf ein HUD zu warten, das
    // absichtlich nicht kommt, wird genau dieser Zustand geprüft.
    if (fall.touch && fall.h > fall.w) {
      await page.waitForTimeout(2500);
      const hinweis = await page.evaluate(() => {
        const n = document.querySelector('.rotate-notice');
        const hud = document.querySelector('#hud');
        return { sichtbar: Boolean(n) && getComputedStyle(n).display !== 'none',
          hudAus: Boolean(hud) && getComputedStyle(hud).visibility === 'hidden' };
      });
      if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
      await page.close();
      const p = [];
      if (!hinweis.sichtbar) p.push('Drehen-Hinweis fehlt im Hochformat');
      if (!hinweis.hudAus) p.push('HUD bleibt im Hochformat sichtbar');
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null, probleme: p });
      continue;
    }
    await page.waitForSelector('#hud:not([hidden])', { timeout: 60_000 });
    await page.waitForTimeout(3000);
    // Das Rad ist ein Zustand wie jeder andere – es wird geöffnet und dann
    // zusammen mit allem übrigen gemessen.
    if (fall.rad) {
      await page.keyboard.press('KeyC');
      await page.waitForTimeout(600);
    }
    const messung = await page.evaluate(messenImBrowser);
    if (SHOTS) await page.screenshot({ path: `.probe/ui-${fall.name}.png` });
    await page.close();

    const zeile = fehler.map((f) => `Skriptfehler: ${f}`);
    // Der Death-Screen liegt bewusst über allem – in seiner großen Fassung
    // sind Verdeckungen kein Befund, in der kompakten schon.
    const grossImTod = messung.imTod && !messung.kompakterTod;
    for (const u of messung.ueberlappungen) {
      if (grossImTod && (u.a === 'Death-Karte' || u.b === 'Death-Karte')) continue;
      zeile.push(`${u.a} überlappt ${u.b} (${u.ox}×${u.oy} px)`);
    }
    for (const v of messung.verdeckt) {
      if (grossImTod && Object.keys(v.durch).every((d) => d === 'Death-Karte')) continue;
      zeile.push(`${v.name} verdeckt durch ${Object.keys(v.durch).join(', ')}`);
    }
    for (const a of messung.ausserhalb) zeile.push(`${a.name} ragt aus dem Bild (${JSON.stringify(a)})`);
    if (messung.wahlKarten && messung.wahlKarten.sichtbar < messung.wahlKarten.gesamt) {
      zeile.push(`Klassenwahl nur ${messung.wahlKarten.sichtbar}/${messung.wahlKarten.gesamt} Karten sichtbar`);
    }
    if (!fall.touch && messung.totAnteil !== null && messung.totAnteil > TOT_GRENZE) {
      zeile.push(`${messung.totAnteil} % der Bildfläche nimmt keine Klicks an (Grenze ${TOT_GRENZE} %)`);
    }
    melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: messung.totAnteil, probleme: zeile });
    } catch (error) {
      melden({ fall: fall.name, fenster: `${fall.w}×${fall.h}`, tot: null,
        probleme: [`kommt nicht hoch: ${String(error).split('\n')[0].slice(0, 120)}`] });
    }
  }
  await browser.close();

  const kaputt = befunde.filter((b) => b.probleme.length > 0).length;
  console.log(`\n${befunde.length - kaputt}/${befunde.length} Fälle ohne Befund.`);
  process.exitCode = kaputt > 0 ? 1 : 0;
}

await main();
