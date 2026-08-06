#!/usr/bin/env node
/**
 * Legt neben jede ausgelieferte Client-Datei eine vorkomprimierte Fassung.
 *
 * **Warum beim Build und nicht zur Laufzeit.** Die naheliegende Lösung wäre die
 * `compression`-Middleware. Sie ist hier die falsche: Dieser Prozess ist ein
 * Spielserver mit 40 Hz Tick, und der Tick-Abstand liegt schon heute über dem
 * 25-ms-Soll. Ein 630-KB-Bundle zur Laufzeit zu gzippen kostet 15 bis 25 ms
 * CPU – also einen ganzen Tick, jedes Mal, wenn jemand die Seite lädt. Ein
 * Ruckler für alle in der Arena, ausgelöst durch einen einzigen Seitenaufruf.
 *
 * Vorkomprimiert kostet die Auslieferung **nichts** und komprimiert obendrein
 * stärker, weil die Rechenzeit beim Build keine Rolle spielt.
 *
 * Ohne Abhängigkeiten – `zlib` steckt in Node.
 *
 *   node scripts/precompress.mjs [verzeichnis]
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Komprimieren lohnt nur für Text. Bilder und Schriften sind es schon. */
const KOMPRIMIERBAR = new Set(['.js', '.css', '.html', '.json', '.svg', '.map', '.txt', '.webmanifest']);

/** Darunter kostet der Header mehr, als die Kompression spart. */
const MINDESTGROESSE = 1024;

export function istKomprimierbar(datei, groesse) {
  return KOMPRIMIERBAR.has(path.extname(datei).toLowerCase()) && groesse >= MINDESTGROESSE;
}

function* dateien(wurzel) {
  for (const eintrag of readdirSync(wurzel, { withFileTypes: true })) {
    const voll = path.join(wurzel, eintrag.name);
    if (eintrag.isDirectory()) yield* dateien(voll);
    else if (eintrag.isFile() && !voll.endsWith('.gz') && !voll.endsWith('.br')) yield voll;
  }
}

export function precompress(wurzel) {
  const ergebnis = { dateien: 0, roh: 0, gzip: 0, brotli: 0 };
  for (const datei of dateien(wurzel)) {
    const groesse = statSync(datei).size;
    if (!istKomprimierbar(datei, groesse)) continue;
    const inhalt = readFileSync(datei);

    // Höchste Stufe: Die Rechenzeit fällt einmal beim Build an, die Ersparnis
    // bei jedem Abruf.
    const gz = gzipSync(inhalt, { level: 9 });
    const br = brotliCompressSync(inhalt, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: inhalt.length
      }
    });

    // Nur schreiben, wenn es wirklich kleiner ist – sonst liefern wir mehr
    // Bytes aus als ohne.
    if (gz.length < groesse) writeFileSync(`${datei}.gz`, gz);
    if (br.length < groesse) writeFileSync(`${datei}.br`, br);

    ergebnis.dateien += 1;
    ergebnis.roh += groesse;
    ergebnis.gzip += Math.min(gz.length, groesse);
    ergebnis.brotli += Math.min(br.length, groesse);
  }
  return ergebnis;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const wurzel = path.resolve(process.argv[2] ?? 'apps/client/dist');
  try {
    statSync(wurzel);
  } catch {
    console.error(`Kein Verzeichnis: ${wurzel} – erst "npm run build" ausführen.`);
    process.exit(1);
  }
  const r = precompress(wurzel);
  if (r.dateien === 0) {
    console.log(`precompress: nichts zu tun in ${wurzel}`);
  } else {
    const sparen = Math.round((1 - r.brotli / r.roh) * 100);
    console.log(
      `precompress: ${r.dateien} Dateien · roh ${kb(r.roh)} → gzip ${kb(r.gzip)} → brotli ${kb(r.brotli)} (−${sparen} %)`
    );
  }
  // Ein Fingerabdruck macht im Build-Log sichtbar, ob überhaupt neu gebaut wurde.
  console.log(`precompress: Stand ${createHash('sha1').update(String(r.roh)).digest('hex').slice(0, 8)}`);
}
