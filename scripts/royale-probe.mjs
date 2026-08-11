/**
 * End-to-End-Probe des Battle Royale: Zone sehen → draußen bluten →
 * ausscheiden → Sieger → neue Runde.
 *
 * Warum es das braucht: Die Unit-Tests in `arena-royale.test.ts` prüfen die
 * Regeln des Modus (Schrumpfen, Schaden, Ausscheiden, Rundenwechsel) am
 * Serverzustand. Sie sagen nichts darüber, ob ein Spieler davon je etwas
 * mitbekommt – und genau dort lag der Fehler, der diese Datei ausgelöst hat:
 * Der Server schiebt `canRespawnAt` beim Ausscheiden auf Unendlich, der
 * Death-Screen rechnete daraus ungerührt „Respawn verfügbar in Infinitys" und
 * bot einen Knopf an, der nie freigeht. Alle Servertests waren dabei grün.
 *
 * Ein Battle Royale, dessen Runde man nicht ablesen kann, ist kein Modus,
 * sondern eine Karte mit tödlichem Rand. Deshalb prüft diese Probe am
 * sichtbaren Ergebnis, nicht am Zustand:
 *
 * 1. **Die Runde ist ablesbar** – die Leiste nennt die Zahl der Lebenden und
 *    was die Zone als Nächstes tut.
 * 2. **Draußen kostet Leben** – wer in der Ecke steht, verliert HP.
 * 3. **Ausscheiden wird erklärt** – der Death-Screen sagt „Ausgeschieden" statt
 *    einen Countdown zu behaupten, und der Respawn-Knopf ist weg statt tot.
 * 4. **Die Runde endet sichtbar** – Sieger und Wartezeit stehen auf dem Schirm.
 * 5. **Es geht weiter** – nach der Pause lebt der Ausgeschiedene wieder.
 *
 * Nirgends wird `Infinity` oder `NaN` als Text akzeptiert: Das ist der
 * konkrete Fehler von oben, und er wäre ohne diese Zeile stumm zurückgekommen.
 *
 * Aufruf – der Server muss im Royale-Modus laufen, mit Zeitraffer und genau
 * einem Bot (mehr Spieler heißt: die Runde endet nicht in der Geduld dieser
 * Probe, und der Direktor stellt sonst welche nach):
 *
 *   npm run build
 *   ARENA_MODE=royale ROYALE_SPEED=20 BOT_COUNT=1 ARENA_DIRECTOR_ENABLED=false \
 *     PORT=2599 node apps/server/dist/index.js &
 *   URL=http://127.0.0.1:2599 node scripts/royale-probe.mjs
 *
 * Umgebung: `URL`, `SHOT` (Bilderverzeichnis), `PW_CHROMIUM`,
 * `GEDULD_MS` (Standard 120000).
 */
import { chromium } from 'playwright-core';

const URL = process.env.URL ?? 'http://127.0.0.1:2599/';
const GEDULD_MS = Number(process.env.GEDULD_MS ?? 120_000);
const SHOT = process.env.SHOT ?? null;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const fehler = [];
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) fehler.push(`error: ${m.text()}`);
});

const lies = () => page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
  const sichtbar = (sel) => {
    const el = document.querySelector(sel);
    return Boolean(el && !el.hasAttribute('hidden') && el.getBoundingClientRect().height > 0);
  };
  const leben = /(\d+)\s*\/\s*(\d+)/.exec(text('#health-text'));
  return {
    leiste: sichtbar('.royale-bar'),
    lebende: Number(text('.royale-bar b') || 0),
    zonenText: text('.royale-bar-status'),
    ton: document.querySelector('.royale-bar')?.dataset.tone ?? '',
    leben: leben ? Number(leben[1]) : 0,
    tot: sichtbar('#death-screen'),
    // Der Satz auf der Todeskarte -- der, den ein Mensch wirklich sieht.
    // `#respawn-countdown` steht weiter unten und ist auf 720 px abgeschnitten.
    todesNotiz: sichtbar('#royale-death-note') ? text('#royale-death-note') : '',
    todesText: text('#respawn-countdown'),
    respawnKnopf: sichtbar('#respawn-button')
  };
});

/** Wartet auf eine Bedingung und gibt den Stand zurück, bei dem sie eintrat. */
async function warteAuf(bedingung, grenzeMs, waehrenddessen = null) {
  const ende = Date.now() + grenzeMs;
  let letzter = await lies();
  while (Date.now() < ende) {
    if (bedingung(letzter)) return letzter;
    if (waehrenddessen) await waehrenddessen();
    await page.waitForTimeout(250);
    letzter = await lies();
  }
  return letzter;
}

const bild = async (name) => { if (SHOT) await page.screenshot({ path: `${SHOT}/${name}.png` }); };

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('#join-button', { timeout: 90_000 });
await page.fill('#player-name', 'RoyaleProbe').catch(() => {});
await page.click('#join-button');
await page.waitForSelector('canvas', { timeout: 60_000 });

/*
 * 1. Die Runde muss ablesbar sein, bevor irgendetwas passiert.
 *
 * Ausdrücklich auf eine LAUFENDE Runde warten: Wer im Zeitraffer joint, landet
 * gut in einer Rundenpause – dann stünde hier der Siegertext, und die Probe
 * hätte den Normalfall nie gesehen.
 */
const beimStart = await warteAuf((s) => s.leiste && s.zonenText.length > 0 && s.ton !== 'sieg', 40_000);
await bild('01-rundenstand');

/*
 * 2. In die Ecke fahren und dort bleiben. Nach oben links gibt es kein Entkommen
 * vor der Zone – der Kreis liegt immer um die Kartenmitte herum.
 */
const inDieEcke = async () => {
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
};
await inDieEcke();
const beimBluten = await warteAuf((s) => s.leben < beimStart.leben || s.tot, GEDULD_MS / 3, inDieEcke);
await bild('02-ausserhalb');

// 3. Ausscheiden – und der Death-Screen muss erklären, was los ist.
const beimTod = await warteAuf((s) => s.tot, GEDULD_MS / 2, inDieEcke);
await page.keyboard.up('KeyW').catch(() => {});
await page.keyboard.up('KeyA').catch(() => {});
await bild('03-ausgeschieden');

/*
 * 4. Rundenende: Es lebt höchstens noch einer.
 *
 * Geprüft wird, was zu SEHEN ist, nicht was im DOM steht: Wer die Runde
 * überlebt, liest das Ergebnis in der Leiste; wer ausgeschieden ist, auf der
 * Todeskarte (die Leiste weicht dann, sonst läge sie darauf). Ein Blick auf
 * `data-tone` allein wäre grün geblieben, auch wenn die Leiste unsichtbar ist.
 */
const siegerZuSehen = (s) => (s.leiste && /SIEGER|RUNDE VORBEI/i.test(s.zonenText))
  || /gewinnt die Runde|Zone hat den Rest geholt/i.test(s.todesNotiz);
const beimSieg = await warteAuf(siegerZuSehen, GEDULD_MS / 2);
await bild('04-sieger');

// 5. Und weiter geht's: Der Ausgeschiedene lebt in der neuen Runde wieder.
const neueRunde = await warteAuf((s) => !s.tot, GEDULD_MS / 2);
await bild('05-neue-runde');

await browser.close();

const zahlenSauber = [beimTod.todesText, beimTod.todesNotiz, beimSieg.zonenText, beimStart.zonenText]
  .every((t) => !/Infinity|NaN|undefined|null/i.test(t));

const befunde = {
  rundenstandSichtbar: beimStart.leiste && beimStart.lebende >= 1 && beimStart.zonenText.length > 0,
  zoneKostetLeben: beimBluten.leben < beimStart.leben || beimTod.tot,
  // Gewertet wird die SICHTBARE Notiz oben auf der Karte, nicht der Text unten.
  ausscheidenErklaert: beimTod.tot && /Ausgeschieden|Runde/i.test(beimTod.todesNotiz) && !beimTod.respawnKnopf,
  siegerSichtbar: siegerZuSehen(beimSieg),
  neueRundeLaeuft: !neueRunde.tot,
  zahlenSauber
};

const okay = Object.values(befunde).every(Boolean) && fehler.length === 0;

console.log(JSON.stringify({
  okay,
  befunde,
  gesehen: {
    start: { lebende: beimStart.lebende, zone: beimStart.zonenText, leben: beimStart.leben },
    ausserhalb: { leben: `${beimStart.leben} -> ${beimBluten.leben}` },
    tod: { karte: beimTod.todesNotiz, unten: beimTod.todesText, respawnKnopf: beimTod.respawnKnopf },
    sieg: { leisteSichtbar: beimSieg.leiste, zone: beimSieg.zonenText, karte: beimSieg.todesNotiz },
    danach: { tot: neueRunde.tot, lebende: neueRunde.lebende, zone: neueRunde.zonenText }
  },
  fehler
}, null, 1));

if (!okay) {
  console.error('\nroyale-probe: Befund.');
  if (!befunde.rundenstandSichtbar) console.error('  Kein Rundenstand – der Modus laeuft blind.');
  if (!befunde.zoneKostetLeben) console.error('  Draussenstehen kostet nichts – die Zone ist Deko.');
  if (!befunde.ausscheidenErklaert) console.error('  Der Death-Screen erklaert das Ausscheiden nicht.');
  if (!befunde.siegerSichtbar) console.error('  Das Rundenende steht nicht auf dem Schirm.');
  if (!befunde.neueRundeLaeuft) console.error('  Nach der Pause geht es nicht weiter.');
  if (!befunde.zahlenSauber) console.error('  Eine Anzeige zeigt Infinity/NaN.');
}
process.exit(okay ? 0 : 1);
