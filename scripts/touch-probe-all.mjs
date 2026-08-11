/**
 * Die Touch-Probe über alle Handy-Formate, die das Ziel nennt.
 *
 * Warum es das braucht: `npm run touch-probe` beweist genau **ein** Format –
 * bisher 844 × 390. Das Ziel verlangt aber „auf dem Handy lässt sich spielen",
 * und Handys unterscheiden sich in der Höhe um 55 px. Genau dort sitzen die
 * Fehler dieser Klasse: Ein Stick, der auf 430 px Höhe sitzt, kann auf 375 px
 * unter der Bedienleiste liegen oder von einem Panel überdeckt sein. Die
 * Layout-Prüfung sieht das nicht – sie misst Flächen, nicht Eingaben.
 *
 * Jedes Format läuft in einem **eigenen Prozess**. Das ist keine Umständlichkeit,
 * sondern der Zweck: Jeder Lauf bekommt einen frischen Browser, und ein Absturz
 * in einem Format nimmt die übrigen nicht mit. Der Bericht sagt am Ende, welche
 * Formate belegt sind – und welche nicht.
 *
 * Aufruf – der Server muss laufen (Client wird mit ausgeliefert):
 *
 *   npm run build
 *   PORT=2599 HOST=127.0.0.1 node apps/server/dist/index.js &
 *   URL=http://127.0.0.1:2599 npm run touch-probe:all
 *
 * Umgebung: `URL`, `PW_CHROMIUM`, `FORMATE` (Komma-Liste `BREITExHOEHE`,
 * Standard sind die fünf Handy-Querformate der Layout-Matrix), `SHOTS`
 * (Verzeichnis für je ein Bild pro Format).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));

/** Dieselben Handys wie in `scripts/ui-layout-check.mjs` (GERAETE, touch). */
const STANDARD = [
  ['iphone-se', 667, 375],
  ['iphone-13', 844, 390],
  ['iphone-15', 852, 393],
  ['pixel', 915, 412],
  ['iphone-15-max', 932, 430]
];

const formate = process.env.FORMATE
  ? process.env.FORMATE.split(',').map((eintrag) => {
      const [breite, hoehe] = eintrag.trim().toLowerCase().split('x').map(Number);
      return [`${breite}x${hoehe}`, breite, hoehe];
    })
  : STANDARD;

const laufen = (name, breite, hoehe) => new Promise((fertig) => {
  const umgebung = { ...process.env, BREITE: String(breite), HOEHE: String(hoehe) };
  if (process.env.SHOTS) umgebung.SHOT = join(process.env.SHOTS, `touch-${name}.png`);
  const kind = spawn(process.execPath, [join(HIER, 'touch-probe.mjs')], { env: umgebung });
  let ausgabe = '';
  kind.stdout.on('data', (teil) => { ausgabe += teil; });
  kind.stderr.on('data', (teil) => { ausgabe += teil; });
  kind.on('close', (code) => {
    let bericht = null;
    // Die Probe schreibt JSON auf stdout und Klartext-Befunde auf stderr –
    // gesucht ist das JSON, und zwar auch dann, wenn beides vermischt ankommt.
    const anfang = ausgabe.indexOf('{');
    const ende = ausgabe.lastIndexOf('}');
    if (anfang >= 0 && ende > anfang) {
      try { bericht = JSON.parse(ausgabe.slice(anfang, ende + 1)); } catch { /* unlesbar */ }
    }
    fertig({ name, format: `${breite}×${hoehe}`, code, bericht, ausgabe });
  });
});

const ergebnisse = [];
for (const [name, breite, hoehe] of formate) {
  process.stdout.write(`${name.padEnd(15)} ${String(breite).padStart(4)}×${String(hoehe).padEnd(4)} … `);
  const ergebnis = await laufen(name, breite, hoehe);
  const b = ergebnis.bericht;
  if (ergebnis.code === 0) {
    console.log(`ok   Sticks ${b?.sticksReagieren?.move ? '✓' : '✗'}/${b?.sticksReagieren?.aim ? '✓' : '✗'}`
      + ` · Multi-Touch ${b?.multiTouch ? '✓' : '✗'} · Bewegung bei ${b?.bewegung?.arenaMs} ms Arena-Zeit`
      + ` · ${b?.tode ?? 0} Tode · ${b?.gefarmt?.hinweis ?? ''}`);
  } else {
    console.log('FEHLER');
    const gruende = [];
    if (b) {
      if (!b.sticksSichtbar?.move || !b.sticksSichtbar?.aim) gruende.push('Stick nicht sichtbar');
      if (!b.sticksReagieren?.move) gruende.push('Bewegungs-Stick springt nicht an');
      if (!b.sticksReagieren?.aim) gruende.push('Ziel-Stick erreicht die Feuerschwelle nicht');
      if (!b.multiTouch) gruende.push('zwei Daumen gleichzeitig gehen nicht');
      if (!b.bewegung?.gewertet) gruende.push('Bewegung kommt nicht an');
      for (const f of b.fehler ?? []) gruende.push(f);
    } else {
      gruende.push(ergebnis.ausgabe.trim().split('\n').slice(-3).join(' | '));
    }
    for (const grund of gruende) console.log(`         · ${grund}`);
  }
  ergebnisse.push(ergebnis);
}

const gruen = ergebnisse.filter((e) => e.code === 0).length;
console.log(`\n${gruen}/${ergebnisse.length} Formate spielbar.`);
process.exit(gruen === ergebnisse.length ? 0 : 1);
