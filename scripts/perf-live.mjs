#!/usr/bin/env node
/**
 * Project Maze – Client-Perf-Auswertung einer laufenden Instanz (R5).
 *
 * Beantwortet die Messlatte aus dem MASTERPLAN, Handlungsfeld 1:
 *
 *   „FPS-p95 ≥ 55 auf dem Referenz-Altgerät, keine Hänger über 100 ms"
 *
 * Bisher stand das unter „glauben wir". Die Zahlen dafür liefert
 * `POST /client-metrics`; dieses Skript holt sie aus `/metrics` und stellt sie
 * getrennt nach Geräteklasse, Renderpfad und Qualitätsstufe nebeneinander.
 *
 *   node scripts/perf-live.mjs --url https://www.mazers.de
 *   node scripts/perf-live.mjs --url http://localhost:2567 --json
 *
 * **Was dieses Skript nicht kann:** Die Berichte kommen aus einer offenen,
 * ungeprüften Route. Sie sind ein Indiz und kein Beweis – wer sie bewusst
 * verfälschen will, kann das. Für die Frage „ruckelt es auf schwachen Geräten"
 * taugen sie, für Abrechnungen nicht.
 */

const DEFAULTS = {
  url: process.env.METRICS_URL ?? 'http://localhost:2567',
  token: process.env.METRICS_TOKEN ?? '',
  /** Unter dieser Zahl Berichte ist ein Bucket eine Anekdote, keine Messung. */
  minSamples: 5,
  json: false
};

/** Die Messlatte aus dem MASTERPLAN. Steht hier, damit sie nicht driftet. */
export const ZIEL_FPS_P95 = 55;

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unbekanntes Argument: ${token}`);
    const [flag, inlineValue] = token.slice(2).split('=', 2);
    const key = flag.replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
    if (key === 'json') { options.json = inlineValue === undefined ? true : inlineValue !== 'false'; continue; }
    if (key === 'help') { options.help = true; continue; }
    if (!(key in DEFAULTS)) throw new Error(`Unbekannte Option: --${flag}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${flag} braucht einen Wert`);
    if (key === 'minSamples') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error('--min-samples braucht eine Zahl >= 0');
      options.minSamples = parsed;
    } else options[key] = value;
  }
  return options;
}

/** `/metrics` anhängen, falls nur der Host angegeben wurde. */
export function metricsUrl(base) {
  const trimmed = String(base).replace(/\/+$/, '');
  return trimmed.endsWith('/metrics') ? `${trimmed}?format=json` : `${trimmed}/metrics?format=json`;
}

/**
 * Das Referenz-Altgerät ist nicht eine einzelne Geräteklasse, sondern beides:
 * ein als schwach erkanntes Gerät **oder** der Software-Renderpfad. Zweiteres
 * ist per Definition der alte PC – dort läuft WebGL ohne Grafikkarte.
 */
export const istAltgeraet = (bucket) =>
  bucket.deviceClass === 'low' || bucket.quality === 'webgl-kompat';

/**
 * Urteil je Bucket. `null` heißt „zu wenig Daten" – und das ist ausdrücklich
 * kein Bestehen. Ein leeres Ergebnis, das wie ein grünes aussieht, ist genau
 * die Falle, die uns hier schon zweimal Zeit gekostet hat.
 */
export function bewerte(bucket, minSamples = DEFAULTS.minSamples) {
  if (bucket.samples < minSamples) return { urteil: 'zu wenig Daten', erfuellt: null };
  const fpsOk = bucket.fpsP95 >= ZIEL_FPS_P95;
  const hangOk = bucket.frameHangsMedian === 0;
  if (fpsOk && hangOk) return { urteil: 'erfuellt', erfuellt: true };
  const gruende = [];
  if (!fpsOk) gruende.push(`FPS-p95 ${bucket.fpsP95} < ${ZIEL_FPS_P95}`);
  if (!hangOk) gruende.push(`Haenger ${bucket.frameHangsMedian}`);
  return { urteil: gruende.join(', '), erfuellt: false };
}

const pad = (value, width) => String(value).padStart(width);
const padEnd = (value, width) => String(value).padEnd(width);

export function formatReport(client, options = DEFAULTS) {
  const lines = [];
  lines.push('\nPROJECT MAZE — CLIENT-PERF (R5)\n');

  if (!client || client.enabled === false) {
    lines.push('  Telemetrie ist am Server abgeschaltet (TELEMETRY_ENABLED=false).');
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    `  Fenster ${client.windowSeconds} s · ${client.samples} Berichte darin · `
    + `${client.acceptedTotal} seit Serverstart · ${client.rejectedTotal} verworfen`
  );
  if (client.invertedTotal > 0) lines.push(`  ${client.invertedTotal} Berichte mit vertauschten Perzentilen (Client-Fehler, verwertet)`);
  if (client.tierCoercedTotal > 0) lines.push(`  ${client.tierCoercedTotal} Berichte mit unbekannter Qualitaetsstufe (auf "unknown" gesetzt)`);

  // Der wichtigste Fall zuerst: gar keine Daten. Eine leere Tabelle sieht sonst
  // aus wie ein bestandener Test.
  if (!client.buckets || client.buckets.length === 0) {
    lines.push('');
    lines.push('  KEINE BERICHTE IM FENSTER — die Messlatte ist damit UNBEANTWORTET,');
    lines.push('  nicht erfuellt. Moegliche Ursachen, in dieser Reihenfolge pruefen:');
    lines.push('    1. Es hat schlicht niemand lange genug am Stueck gespielt. Der Client');
    lines.push('       sendet fruehestens nach 120 s ununterbrochenem Spiel (60 s Aufwaermen');
    lines.push('       + 60 s Messfenster), danach einmal pro Minute.');
    lines.push('    2. Der Server wurde neu gestartet — die Zaehler leben nur im');
    lines.push('       Arbeitsspeicher. `uptimeSeconds` in /health sagt, wie lange er laeuft.');
    lines.push(`    3. ${client.rejectedTotal > 0 ? 'Es wurden Berichte VERWORFEN — siehe oben, das ist die heisse Spur.' : 'Der Client sendet nicht. Dann ist es ein Befund fuer Chat 03.'}`);
    return `${lines.join('\n')}\n`;
  }

  lines.push('');
  lines.push(
    padEnd('GERAET', 8) + padEnd('RENDERPFAD', 15) + padEnd('STUFE', 9)
    + pad('BERICHTE', 9) + pad('FPS p50', 9) + pad('FPS p95', 9) + pad('SCHLECHT.', 10)
    + pad('HAENGER', 8) + pad('<30fps', 8) + pad('MPx', 7)
  );
  lines.push('─'.repeat(92));
  for (const bucket of client.buckets) {
    lines.push(
      padEnd(bucket.deviceClass, 8) + padEnd(bucket.quality, 15) + padEnd(bucket.tier, 9)
      + pad(bucket.samples, 9) + pad(bucket.fpsP50.toFixed(1), 9) + pad(bucket.fpsP95.toFixed(1), 9)
      + pad(bucket.fpsWorst.toFixed(1), 10) + pad(bucket.frameHangsMedian.toFixed(1), 8)
      + pad(bucket.lowFpsRatio.toFixed(2), 8) + pad(bucket.megapixelsMedian.toFixed(2), 7)
    );
  }

  lines.push('');
  lines.push(`MESSLATTE (MASTERPLAN): FPS-p95 >= ${ZIEL_FPS_P95}, keine Haenger ueber 100 ms`);
  lines.push('');

  const alt = client.buckets.filter(istAltgeraet);
  if (alt.length === 0) {
    lines.push('  Kein Bericht von einem Referenz-Altgeraet (deviceClass=low oder');
    lines.push('  quality=webgl-kompat). Die Messlatte bleibt damit UNBEANTWORTET —');
    lines.push('  die Zahlen oben stammen von staerkeren Geraeten.');
  } else {
    for (const bucket of alt) {
      const { urteil, erfuellt } = bewerte(bucket, options.minSamples);
      const zeichen = erfuellt === true ? '✔' : erfuellt === false ? '✘' : '·';
      lines.push(`  ${zeichen} ${padEnd(`${bucket.deviceClass}/${bucket.quality}/${bucket.tier}`, 32)} ${bucket.samples} Berichte — ${urteil}`);
    }
    const bewertet = alt.map((b) => bewerte(b, options.minSamples)).filter((v) => v.erfuellt !== null);
    lines.push('');
    if (bewertet.length === 0) {
      lines.push(`  URTEIL: UNBEANTWORTET — kein Altgeraet-Bucket hat ${options.minSamples} Berichte erreicht.`);
    } else if (bewertet.every((v) => v.erfuellt)) {
      lines.push('  URTEIL: Messlatte ERFUELLT auf allen ausreichend belegten Altgeraet-Buckets.');
    } else {
      lines.push('  URTEIL: Messlatte VERFEHLT — siehe die markierten Zeilen.');
    }
  }

  const dünn = client.buckets.filter((b) => b.samples < options.minSamples).length;
  if (dünn > 0) lines.push(`\n  Hinweis: ${dünn} Bucket(s) unter ${options.minSamples} Berichten — als Anekdote lesen, nicht als Messung.`);

  return `${lines.join('\n')}\n`;
}

const HELP = `Project Maze – Client-Perf-Auswertung (R5)

  node scripts/perf-live.mjs [Optionen]

  --url <url>          Instanz oder /metrics-Pfad (Default ${DEFAULTS.url}, ENV METRICS_URL)
  --token <token>      Bearer-Token fuer /metrics (ENV METRICS_TOKEN)
  --min-samples <n>    Mindestzahl Berichte je Bucket (Default ${DEFAULTS.minSamples})
  --json               Nur den client-Block als JSON ausgeben
  --help               Diese Hilfe
`;

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(2);
  }
  if (options.help) { console.log(HELP); return; }

  const url = metricsUrl(options.url);
  const headers = { accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let report;
  try {
    const response = await fetch(url, { headers });
    if (response.status === 401) throw new Error('401 – /metrics verlangt ein Token (--token oder METRICS_TOKEN).');
    if (response.status === 404) throw new Error('404 – Telemetrie ist am Server abgeschaltet.');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    report = await response.json();
  } catch (error) {
    console.error(`Abruf von ${url} fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  if (options.json) { console.log(JSON.stringify(report.client ?? null, null, 2)); return; }
  process.stdout.write(formatReport(report.client, options));
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
