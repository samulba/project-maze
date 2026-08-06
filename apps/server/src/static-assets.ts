import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * Liefert vorkomprimierte Client-Dateien aus, wenn es sie gibt.
 *
 * `express.static` komprimiert nicht – ohne diese Schicht gingen bisher rund
 * **925 KB statt 261 KB** über die Leitung, obwohl jeder Browser
 * `Accept-Encoding: gzip, br` mitschickt. Das ist der Unterschied zwischen
 * „lädt sofort" und „lädt spürbar", und er trifft ausgerechnet den ersten
 * Eindruck.
 *
 * Komprimiert wird **beim Build** (`scripts/precompress.mjs`), nicht hier: Ein
 * 630-KB-Bundle zur Laufzeit zu gzippen kostet 15 bis 25 ms CPU und damit
 * einen ganzen Tick – ein Ruckler für alle in der Arena, ausgelöst durch einen
 * einzigen Seitenaufruf. Diese Schicht schickt nur eine andere Datei los.
 *
 * Fehlt die vorkomprimierte Fassung, passiert nichts: Dann geht das Original
 * raus wie bisher. Ein vergessener Build-Schritt macht die Seite langsamer,
 * aber nie kaputt.
 */

/** Reihenfolge ist Absicht: Brotli komprimiert deutlich besser als gzip. */
const VARIANTEN = [
  { kodierung: 'br', endung: '.br' },
  { kodierung: 'gzip', endung: '.gz' }
] as const;

/**
 * Wird diese Kodierung akzeptiert? Bewusst einfach gehalten – ein `q=0`
 * bedeutet ausdrücklich „nicht senden" und wird deshalb geprüft, alles andere
 * an Gewichtung ist für zwei Varianten Überbau.
 */
export function akzeptiert(header: string | undefined, kodierung: string): boolean {
  if (!header) return false;
  for (const teil of header.split(',')) {
    const [name, ...rest] = teil.trim().split(';');
    if (name?.trim().toLowerCase() !== kodierung) continue;
    const q = rest.find((entry) => entry.trim().startsWith('q='));
    if (!q) return true;
    return Number.parseFloat(q.trim().slice(2)) > 0;
  }
  return false;
}

/**
 * Wählt die beste vorhandene Variante. `exists` ist injizierbar, damit die
 * Auswahl ohne Dateisystem prüfbar bleibt.
 */
export function waehleVariante(
  dateipfad: string,
  acceptEncoding: string | undefined,
  exists: (p: string) => boolean = existsSync
): { kodierung: string; pfad: string } | null {
  for (const { kodierung, endung } of VARIANTEN) {
    if (!akzeptiert(acceptEncoding, kodierung)) continue;
    const kandidat = `${dateipfad}${endung}`;
    if (exists(kandidat)) return { kodierung, pfad: kandidat };
  }
  return null;
}

/** Content-Type der **Originaldatei** – die Endung `.br` darf ihn nicht kapern. */
const TYPEN: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

export function inhaltstyp(datei: string): string | undefined {
  return TYPEN[path.extname(datei).toLowerCase()];
}

export function servePrecompressed(clientRoot: string, exists: (p: string) => boolean = existsSync) {
  const wurzel = path.resolve(clientRoot);

  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();

    // Ohne diesen Header liefert ein Proxy die komprimierte Antwort an einen
    // Client aus, der sie nicht lesen kann. Er gehört auf **jede** Antwort
    // dieser Schicht, auch auf die unkomprimierte.
    response.setHeader('Vary', 'Accept-Encoding');

    const angefragt = decodeURIComponent(request.path);
    // Kein Verzeichniswechsel nach oben: `path.resolve` erst, dann prüfen, dass
    // das Ergebnis wirklich unterhalb der Wurzel liegt.
    const ziel = path.resolve(wurzel, `.${angefragt}`);
    if (ziel !== wurzel && !ziel.startsWith(`${wurzel}${path.sep}`)) return next();

    const typ = inhaltstyp(ziel);
    if (!typ) return next();

    const variante = waehleVariante(ziel, request.headers['accept-encoding'] as string | undefined, exists);
    if (!variante) return next();

    response.setHeader('Content-Encoding', variante.kodierung);
    response.setHeader('Content-Type', typ);
    response.sendFile(variante.pfad, (fehler?: Error) => {
      // Bricht das Senden ab, darf die Anfrage nicht stumm hängen bleiben.
      if (fehler && !response.headersSent) next();
    });
  };
}
