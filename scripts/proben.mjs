/**
 * Alle Proben hintereinander – ein Befehl statt einer Wand aus Shell.
 *
 * Warum es das braucht: Die Tabelle in `docs/GOAL.md` behauptet zwölf grüne
 * Zeilen, und der Beweis für jede einzelne steht als Codeblock daneben – mit
 * eigenem Server, eigenen Umgebungsvariablen, eigenem Port. Das hat zwei
 * Folgen, beide belegt:
 *
 * * **Niemand fährt sie alle.** Am 12.08. war der Beitritt zwei Stunden lang
 *   kaputt (`insertBefore` gegen einen Knopf, der kein direktes Kind mehr war).
 *   996 Unit-Tests blieben grün, 196 Layout-Fälle auch. Gefunden hat es
 *   `wire-probe` – eine Probe, die zufällig gelaufen ist, weil ich sie von Hand
 *   angestoßen habe.
 * * **Eine falsche Konfiguration fällt nicht auf.** `royale-probe` lief
 *   monatelang mit `ARENA_DIRECTOR_ENABLED=false` und konnte deshalb genau den
 *   Fehler nicht sehen, der in Produktion lief.
 *
 * Dieses Skript startet für jede Probe einen eigenen Server mit der richtigen
 * Konfiguration, wartet, bis er antwortet, fährt die Probe und räumt auf.
 *
 * ## Aufruf
 *
 *   npm run build
 *   npm run proben              # alles ausser der Layout-Matrix
 *   npm run proben -- --alles   # inklusive ui-layout-check (dauert ~25 min)
 *   npm run proben -- --nur wire,duo
 *
 * Umgebung: `PW_CHROMIUM`. Ports werden ab 2700 vergeben, damit ein laufender
 * Entwicklungsserver nicht im Weg steht.
 *
 * **Nichts Schweres nebenher laufen lassen.** Vier der Proben messen einen
 * echten Browser in Echtzeit (`progress-probe`, `touch-probe`,
 * `first-run-probe`, `ui-layout-check`); unter Last fallen ihre Zahlen
 * pessimistischer aus, und `progress-probe` kann in ihr Zeitbudget laufen --
 * gemessen: 163 s und durchgefallen mit einer Analyse nebenher, 67 s und gruen
 * ohne. Wer einen Befund sieht, faehrt die Probe einzeln nach
 * (`npm run proben -- --nur progress`), bevor er ihn glaubt.
 */
import { spawn } from 'node:child_process';
import { setTimeout as warte } from 'node:timers/promises';

const argumente = process.argv.slice(2);
const alles = argumente.includes('--alles');
const nurIndex = argumente.indexOf('--nur');
const nur = nurIndex >= 0 ? (argumente[nurIndex + 1] ?? '').split(',').filter(Boolean) : null;

let naechsterPort = 2700;
const port = () => naechsterPort++;

/**
 * Die Liste. `lang: true` heisst: nur mit `--alles`, weil die Probe im
 * zweistelligen Minutenbereich liegt.
 */
const PROBEN = [
  {
    key: 'wire',
    titel: 'Leitung Server→Client',
    umgebung: {},
    befehl: (p) => ['npm', ['run', 'wire-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'progress',
    titel: 'Fortschrittsschleife',
    umgebung: {},
    befehl: (p) => ['npm', ['run', 'progress-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'mode-maze',
    titel: 'Modus maze',
    umgebung: { ARENA_MODE: 'maze', BOT_COUNT: '2' },
    befehl: (p) => ['npm', ['run', 'mode-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'mode-ffa',
    titel: 'Modus ffa',
    umgebung: { ARENA_MODE: 'ffa', BOT_COUNT: '2' },
    befehl: (p) => ['npm', ['run', 'mode-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'mode-royale',
    titel: 'Modus royale',
    umgebung: { ARENA_MODE: 'royale', BOT_COUNT: '2' },
    befehl: (p) => ['npm', ['run', 'mode-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'royale',
    titel: 'Eine ganze Royale-Runde',
    // Direktor AN, wie in Produktion -- die frühere Ausnahme hat einen Befund
    // gedeckt, den die Probe dadurch nie sehen konnte.
    umgebung: { ARENA_MODE: 'royale', ROYALE_SPEED: '20', BOT_COUNT: '1' },
    befehl: (p) => ['npm', ['run', 'royale-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'duo',
    titel: 'Zwei Menschen in einer Arena',
    umgebung: { ARENA_MODE: 'ffa', BOT_COUNT: '0', ARENA_DIRECTOR_ENABLED: 'false' },
    befehl: (p) => ['npm', ['run', 'duo-probe'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'touch',
    titel: 'Fünf Handy-Querformate',
    umgebung: {},
    lang: true,
    befehl: (p) => ['npm', ['run', 'touch-probe:all'], { URL: `http://127.0.0.1:${p}` }]
  },
  {
    key: 'erstlauf',
    titel: 'Die ersten Minuten',
    umgebung: {},
    lang: true,
    befehl: (p) => ['npm', ['run', 'first-run-probe'], { URL: `http://127.0.0.1:${p}`, MINUTEN: '3', LAEUFE: '2' }]
  },
  {
    key: 'layout',
    titel: 'UI auf 17 Gerätegrößen (196 Fälle)',
    umgebung: {},
    lang: true,
    befehl: (p) => ['node', ['scripts/ui-layout-check.mjs'], { URL: `http://127.0.0.1:${p}` }]
  }
];

const laufen = (befehl, argumenteListe, umgebung) => new Promise((fertig) => {
  const kind = spawn(befehl, argumenteListe, {
    env: { ...process.env, ...umgebung },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let ausgabe = '';
  kind.stdout.on('data', (d) => { ausgabe += d; });
  kind.stderr.on('data', (d) => { ausgabe += d; });
  kind.on('close', (code) => fertig({ code, ausgabe }));
});

/** Wartet, bis der Server antwortet – oder gibt auf. */
async function bereit(p, versuche = 40) {
  for (let i = 0; i < versuche; i += 1) {
    try {
      const antwort = await fetch(`http://127.0.0.1:${p}/health`);
      if (antwort.ok) return true;
    } catch { /* noch nicht da */ }
    await warte(500);
  }
  return false;
}

const ergebnisse = [];
for (const probe of PROBEN) {
  if (nur && !nur.includes(probe.key)) continue;
  if (probe.lang && !alles && !nur) continue;

  const p = port();
  const server = spawn('node', ['apps/server/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(p),
      HOST: '127.0.0.1',
      // Die Proben haengen mehrere Clients von derselben IP an -- ohne das
      // greift das Join-Limit und die Messung misst den Rate-Limiter.
      RATE_LIMIT_CONNECTIONS_PER_IP: '100',
      RATE_LIMIT_JOINS_PER_MINUTE: '200',
      ...probe.umgebung
    },
    stdio: 'ignore'
  });

  const start = Date.now();
  process.stderr.write(`\n▶ ${probe.titel} (Port ${p}) … `);
  if (!await bereit(p)) {
    server.kill();
    ergebnisse.push({ key: probe.key, titel: probe.titel, okay: false, grund: 'Server kam nicht hoch' });
    process.stderr.write('FEHLER: Server kam nicht hoch\n');
    continue;
  }

  const [befehl, argumenteListe, umgebung] = probe.befehl(p);
  const { code, ausgabe } = await laufen(befehl, argumenteListe, umgebung);
  server.kill();
  // Dem Server einen Moment zum Loslassen des Ports geben.
  await warte(400);

  const sekunden = Math.round((Date.now() - start) / 1000);
  const okay = code === 0;
  ergebnisse.push({ key: probe.key, titel: probe.titel, okay, sekunden, ausgabe });
  process.stderr.write(okay ? `ok (${sekunden}s)\n` : `FEHLER (${sekunden}s)\n`);
  if (!okay) {
    // Nur die letzten Zeilen: Der ganze Bericht steht in der Probe selbst.
    process.stderr.write(ausgabe.split('\n').slice(-14).map((z) => `    ${z}`).join('\n') + '\n');
  }
}

const gruen = ergebnisse.filter((e) => e.okay).length;
process.stderr.write('\n────────────────────────────────────────\n');
for (const e of ergebnisse) {
  process.stderr.write(`${e.okay ? 'ok    ' : 'FEHLER'}  ${e.titel.padEnd(34)} ${e.sekunden ? e.sekunden + 's' : e.grund ?? ''}\n`);
}
process.stderr.write(`\n${gruen}/${ergebnisse.length} Proben gruen.\n`);
if (!alles && !nur) process.stderr.write('(--alles nimmt zusaetzlich Touch, Erstlauf und die Layout-Matrix mit.)\n');
process.exit(gruen === ergebnisse.length ? 0 : 1);
