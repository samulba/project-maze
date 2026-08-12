/**
 * Die ersten Minuten eines Fremden – gemessen statt geschätzt.
 *
 * Warum es das braucht: Die dreizehnte Zeile in `docs/GOAL.md` ist die einzige,
 * die zählt („Fremde kommen wieder"), und entschieden wird sie in den ersten
 * Minuten. Alles, was wir darüber wussten, war gelesen: die XP-Kurve, die
 * Freischaltstufen, die Respawn-Regel. Wie sich das zusammen anfühlt, sagt
 * keine Kurve.
 *
 * Diese Probe spielt deshalb wie jemand, der nichts weiß:
 *
 * * Dauerfeuer an, weil der Startscreen „LINKS FEUER" sagt.
 * * Alle 2,5 Sekunden eine andere Richtung – kein Zielen, kein Ausweichen,
 *   kein Kiten. Wer das Spiel kennt, fährt zu den Formen; ein Anfänger fährt.
 * * RESPAWN, sobald der Knopf freigeht.
 * * Die erste Klassenkarte nehmen, die angeboten wird.
 *
 * Gemessen wird, was ein Mensch nach der Sitzung erzählen würde: Wie weit bin
 * ich gekommen, wie oft bin ich gestorben, **habe ich überhaupt etwas
 * getroffen** – und wie lange hat die erste Entscheidung gedauert.
 *
 * ## Was hier KEIN Kriterium ist
 *
 * Die Probe fällt nicht durch, weil das Spiel schwer ist. Schwierigkeit ist
 * eine Balance-Frage und gehört Sam. Sie fällt durch, wenn der Anfang
 * **kaputt** ist: kein Beitritt, kein einziger Aufstieg, kein Wiedereinstieg
 * nach dem Tod. Alles andere ist Bericht, keine Note – und genau deshalb
 * taugen die Zahlen zum Vergleichen über die Zeit.
 *
 * ## Aufruf – der Server muss laufen (Client wird mitgeliefert)
 *
 *   npm run build
 *   PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
 *   URL=http://127.0.0.1:2599 npm run first-run-probe
 *
 * Umgebung: `URL`, `PW_CHROMIUM`, `MINUTEN` (Standard 5), `LAEUFE`
 * (Standard 3), `SHOTS` (Verzeichnis für ein Bild je Lauf).
 *
 * **Nichts Schweres nebenher laufen lassen.** Die Probe misst einen echten
 * Browser in Echtzeit; unter Last bewegt sich der Tank weniger weit und die
 * Zahlen fallen pessimistischer aus (gemessen: höchstes Level 3 statt 5 bei
 * gleichzeitig laufender Analyse). Das gilt für dieselbe Maschine, nicht für
 * den Server.
 *
 * Gemessene Grundwerte vom 12.08. (vier Läufe, 1280 × 720): höchstes Level 3
 * bis 19, Ende zwischen LVL 2 und LVL 9, **null Abschüsse in drei von vier
 * Läufen**, Zeit bis Level 5 zwischen 11 und 146 Sekunden.
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const URL = process.env.URL ?? 'http://127.0.0.1:2599';
const MINUTEN = Number(process.env.MINUTEN ?? 5);
const LAEUFE = Number(process.env.LAEUFE ?? 3);
const SHOTS = process.env.SHOTS ?? null;

const RICHTUNGEN = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
/** Erste Familie, erster echter Entscheidungspunkt. */
const ERSTE_KLASSE_AB = 5;

const zahl = (text, muster) => Number((String(text).match(muster) ?? [0, 0])[1] ?? 0);

/**
 * Ein Lauf. Gibt nur Zahlen zurück – die Bewertung passiert am Ende über alle
 * Läufe zusammen, weil ein einzelner Lauf im Wesentlichen Würfeln ist.
 */
async function einLauf(browser, index) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const seitenfehler = [];
  page.on('pageerror', (e) => seitenfehler.push(e.message.slice(0, 140)));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
  } catch (fehler) {
    // Kein Stapelspeicher-Auswurf für den häufigsten Fall: Server läuft nicht.
    console.error(`first-run-probe: ${URL} antwortet nicht. Laeuft der Server?`);
    console.error(`  ${String(fehler).split('\n')[0]}`);
    process.exit(2);
  }
  await page.waitForTimeout(1500);
  await page.fill('#player-name', `Erstspieler${index + 1}`);
  await page.click('#join-button');
  await page.waitForTimeout(2500);

  const start = Date.now();
  const lauf = {
    beigetreten: false,
    hoechstesLevel: 0,
    endLevel: 0,
    endScore: 0,
    kills: 0,
    tode: 0,
    sekundenTot: 0,
    sekundenBisLevel5: null,
    sekundenBisErsterKill: null,
    klassenwechsel: [],
    wiedereinstiegGelungen: null,
    seitenfehler
  };

  // Dauerfeuer wie auf dem Startscreen angekündigt.
  await page.mouse.move(900, 360);
  await page.mouse.down();
  let richtung = 0;
  const fahren = setInterval(() => {
    void (async () => {
      try {
        await page.keyboard.up(RICHTUNGEN[richtung % RICHTUNGEN.length]);
        richtung += 1;
        await page.keyboard.down(RICHTUNGEN[richtung % RICHTUNGEN.length]);
        await page.mouse.move(640 + Math.cos(richtung) * 300, 360 + Math.sin(richtung) * 200);
      } catch { /* Seite zeichnet gerade neu */ }
    })();
  }, 2500);

  let letztesLevel = 0;
  let letzteKlasse = '';
  let warTot = false;
  const ende = start + MINUTEN * 60_000;

  while (Date.now() < ende) {
    await page.waitForTimeout(1000);
    const stand = await page.evaluate(() => {
      const t = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
      return {
        level: t('.level-badge'),
        klasse: t('.player-heading span'),
        kd: t('#kd'),
        score: t('#score'),
        tot: !document.querySelector('#death-screen')?.hasAttribute('hidden'),
        respawnFrei: !document.querySelector('#respawn-button')?.disabled
          && !document.querySelector('#respawn-button')?.hasAttribute('hidden'),
        wahlKarten: [...document.querySelectorAll('[data-class-choice]')].map((b) => b.getAttribute('data-class-choice'))
      };
    });

    const sekunden = Math.round((Date.now() - start) / 1000);
    const level = zahl(stand.level, /(\d+)/);
    const kills = zahl(stand.kd, /(\d+)\s*K/);
    const tode = zahl(stand.kd, /(\d+)\s*D/);

    if (level > 0) lauf.beigetreten = true;
    lauf.hoechstesLevel = Math.max(lauf.hoechstesLevel, level);
    lauf.endLevel = level;
    lauf.endScore = zahl(stand.score.replace(/\./g, ''), /(\d+)/);
    if (level >= ERSTE_KLASSE_AB && lauf.sekundenBisLevel5 === null) lauf.sekundenBisLevel5 = sekunden;
    if (kills > lauf.kills && lauf.sekundenBisErsterKill === null) lauf.sekundenBisErsterKill = sekunden;
    lauf.kills = Math.max(lauf.kills, kills);
    lauf.tode = Math.max(lauf.tode, tode);
    if (stand.klasse && stand.klasse !== letzteKlasse) {
      lauf.klassenwechsel.push({ s: sekunden, klasse: stand.klasse });
      letzteKlasse = stand.klasse;
    }
    letztesLevel = level;

    if (stand.tot) {
      lauf.sekundenTot += 1;
      warTot = true;
      if (stand.respawnFrei) {
        await page.click('#respawn-button').catch(() => { /* Knopf gerade neu gezeichnet */ });
      }
    } else {
      if (warTot) {
        // Einmal zurück im Spiel reicht als Nachweis, dass der Weg trägt.
        lauf.wiedereinstiegGelungen = true;
        warTot = false;
      }
      if (stand.wahlKarten.length > 0) {
        /*
         * Klick im Seitenkontext, nicht über `page.click`.
         *
         * Playwright liefert einen Klick nicht aus, solange die Maustaste für
         * das Dauerfeuer gedrückt ist -- gemessen 80 Sekunden Timeouts an
         * einer Karte, die `elementFromPoint` an ihrem Mittelpunkt zurückgibt,
         * also von nichts verdeckt ist. Das sah nach „Klassenwahl nicht
         * klickbar" aus und war das Werkzeug.
         */
        await page.evaluate((id) => {
          document.querySelector(`[data-class-choice="${id}"]`)?.click();
        }, stand.wahlKarten[0]).catch(() => { /* Karte gerade ersetzt */ });
      }
    }
  }

  clearInterval(fahren);
  if (warTot) lauf.wiedereinstiegGelungen = false;
  if (SHOTS) {
    await mkdir(SHOTS, { recursive: true }).catch(() => {});
    await page.screenshot({ path: `${SHOTS}/erstlauf-${index + 1}.png` }).catch(() => {});
  }
  await page.close();
  return lauf;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});

const laeufe = [];
for (let i = 0; i < LAEUFE; i += 1) {
  process.stderr.write(`first-run-probe: Lauf ${i + 1}/${LAEUFE} (${MINUTEN} min) …\n`);
  laeufe.push(await einLauf(browser, i));
}
await browser.close();

const mittel = (werte) => (werte.length === 0 ? null : Math.round(werte.reduce((a, b) => a + b, 0) / werte.length));
const gesetzt = (feld) => laeufe.map((l) => l[feld]).filter((v) => typeof v === 'number');

const bericht = {
  laeufe: LAEUFE,
  minutenJeLauf: MINUTEN,
  beigetreten: laeufe.filter((l) => l.beigetreten).length,
  hoechstesLevel: { min: Math.min(...laeufe.map((l) => l.hoechstesLevel)), max: Math.max(...laeufe.map((l) => l.hoechstesLevel)) },
  endLevel: laeufe.map((l) => l.endLevel),
  laeufeMitKill: laeufe.filter((l) => l.kills > 0).length,
  killsGesamt: laeufe.reduce((summe, l) => summe + l.kills, 0),
  todeGesamt: laeufe.reduce((summe, l) => summe + l.tode, 0),
  sekundenBisLevel5: gesetzt('sekundenBisLevel5'),
  sekundenBisLevel5Mittel: mittel(gesetzt('sekundenBisLevel5')),
  sekundenBisErsterKill: gesetzt('sekundenBisErsterKill'),
  sekundenTotMittel: mittel(laeufe.map((l) => l.sekundenTot)),
  klassenwechsel: laeufe.map((l) => l.klassenwechsel),
  wiedereinstieg: laeufe.map((l) => l.wiedereinstiegGelungen),
  seitenfehler: laeufe.flatMap((l) => l.seitenfehler)
};

/*
 * Durchgefallen ist der Anfang nur, wenn er KAPUTT ist -- nicht, wenn er
 * schwer ist. Drei Bedingungen, alle drei über den Weg eines Spielers:
 * hereinkommen, aufsteigen, nach dem Tod zurückkommen.
 */
const jedesMalBeigetreten = bericht.beigetreten === LAEUFE;
const jedesMalAufgestiegen = laeufe.every((l) => l.hoechstesLevel >= 2);
const wiedereinstiegHeil = laeufe.every((l) => l.wiedereinstiegGelungen !== false);
const keineSeitenfehler = bericht.seitenfehler.length === 0;
const okay = jedesMalBeigetreten && jedesMalAufgestiegen && wiedereinstiegHeil && keineSeitenfehler;

console.log(JSON.stringify({ okay, bericht }, null, 1));
console.error(
  `\nfirst-run-probe: ${bericht.laeufeMitKill}/${LAEUFE} Laeufe mit mindestens einem Abschuss · `
  + `Level 5 nach ${bericht.sekundenBisLevel5Mittel ?? '–'} s im Mittel · `
  + `${bericht.todeGesamt} Tode`
);
if (!okay) console.error('first-run-probe: Befund. Der Anfang traegt nicht -- Beitritt, Aufstieg oder Wiedereinstieg fehlt.');
process.exit(okay ? 0 : 1);
