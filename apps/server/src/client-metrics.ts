import type { Request, Response } from 'express';
import { z } from 'zod';

/**
 * Anonyme Client-Perf-Telemetrie.
 *
 * Leitplanke Nr. 1 des Masterplans heißt „läuft auf alten PCs". Bisher war das
 * ein Glaube; dieses Modul macht Zahlen daraus. Der Client schickt höchstens
 * einmal pro Minute einen winzigen Bericht, der Server aggregiert ihn über ein
 * gleitendes Fenster und exportiert das Ergebnis über `/metrics`.
 *
 * Regeln:
 *
 * 1. **Anonym.** Kein Token, keine ID, keine IP – gespeichert wird
 *    ausschließlich die Aggregation. Ein einzelner Bericht ist nach dem
 *    Verarbeiten nicht mehr einer Person zuzuordnen.
 * 2. **Begrenzte Kardinalität.** Drei Label-Achsen mit festem Vokabular:
 *    Geräteklasse, Renderpfad und Qualitätsstufe. Vier mal vier mal vier
 *    Kombinationen, mehr nicht – und exportiert werden nur die, die im Fenster
 *    tatsächlich belegt sind. Die 64 ist die harte Obergrenze, nicht der
 *    Normalfall.
 * 3. **Unvertrauenswürdige Quelle.** Die Route ist offen, also sind die Zahlen
 *    ein Indiz und kein Beweis. Strikte Validierung, Rate-Limit und ein
 *    begrenztes Fenster halten den Schaden klein; wer sie bewusst verfälschen
 *    will, kann das. Für Balance- oder Abrechnungsentscheidungen taugen sie
 *    deshalb nicht – für „wie viele Leute rendern in Software" sehr wohl.
 */

/**
 * Grobe Geräteklasse. Der Client leitet sie aus Speicher, Kernen und
 * Pixelverhältnis ab – siehe Spezifikation im Statusbericht 08.
 */
export const CLIENT_DEVICE_CLASSES = ['low', 'mid', 'high', 'unknown'] as const;
export type ClientDeviceClass = (typeof CLIENT_DEVICE_CLASSES)[number];

/**
 * Renderpfad, der im Client tatsächlich hochgekommen ist. Bewusst genau die
 * Labels aus `renderer.ts` – der Client muss dafür nichts Neues erfinden, und
 * `webgl-kompat` (Software-Rendering) ist exakt der „alte PC", um den es geht.
 */
export const CLIENT_RENDER_PATHS = ['webgl', 'webgl-kompat', 'webgpu', 'unknown'] as const;
export type ClientRenderPath = (typeof CLIENT_RENDER_PATHS)[number];

/**
 * Qualitätsstufe aus der Automatik des Clients (R4). Bewusst eine **eigene
 * Achse** neben `quality` statt eines kombinierten Labels `webgl-mid`: So lässt
 * sich über Stufen hinweg aggregieren, ohne Labels zerlegen zu müssen.
 *
 * `unknown` ist der Platz für ältere Clients, die das Feld noch nicht schicken –
 * und für alles, was ein manipulierter Client hineinschreibt. Das Vokabular ist
 * abgeschlossen; ein fremder Wert wird auf `unknown` zurückgebogen und nicht
 * durchgereicht, sonst könnte ein einziger Client den Export beliebig aufblähen.
 */
export const CLIENT_QUALITY_TIERS = ['high', 'mid', 'low', 'unknown'] as const;
export type ClientQualityTier = (typeof CLIENT_QUALITY_TIERS)[number];

/** Gleitendes Fenster. Bei einem Bericht je Minute und Client sind 15 Minuten
 * genug Stichproben, ohne dass die Zahlen an gestrigen Geräten hängen. */
const WINDOW_MS = 15 * 60_000;
/** Ringpuffer: reicht für rund 250 gleichzeitige Clients über das Fenster. */
const CAPACITY = 4_000;
/** Unter dieser Bildrate ruckelt es sichtbar – das ist die Alarmschwelle. */
const LOW_FPS_THRESHOLD = 30;
/** Ein Bericht ist ein einziges flaches Objekt; mehr als das ist ein Angriff. */
export const CLIENT_METRICS_BODY_LIMIT = '2kb';
/**
 * Kosten im HTTP-Budget. Bei 60/min je IP bleiben rund 30 Berichte pro Minute –
 * genug für ein ganzes Haus oder einen Mobilfunk-NAT, zu wenig für eine
 * Statistikschleuder.
 */
export const CLIENT_METRICS_COST = 2;

/** Strikte Prüfung: Alles außerhalb dieser Grenzen ist kein echter Browser. */
export const clientMetricsSchema = z.object({
  /** Bildrate bei der mittleren Framedauer. */
  fpsP50: z.number().finite().min(1).max(240),
  /** Bildrate bei der 95-Perzentil-Framedauer – also der langsame Rand. */
  fpsP95: z.number().finite().min(1).max(240),
  /** Frames über 100 ms im Messzeitraum. */
  frameHangs: z.number().int().min(0).max(100_000),
  dpr: z.number().finite().min(0.5).max(8),
  viewportW: z.number().int().min(160).max(20_000),
  viewportH: z.number().int().min(120).max(20_000),
  deviceClass: z.enum(CLIENT_DEVICE_CLASSES),
  quality: z.enum(CLIENT_RENDER_PATHS),
  /**
   * Qualitätsstufe, optional: Clients vor R4 kennen das Feld nicht, und ein
   * `.strict()`-Schema würde ihre Berichte sonst mit 400 abweisen.
   *
   * `.catch()` statt harter Ablehnung ist Absicht. Ein dauerhaft abgelehnter
   * Client fällt im Spiel nicht auf – die 400 wäre unsichtbar, und wir hätten
   * schlicht keine Perf-Daten mehr, ohne es zu merken. Ein unbekannter Wert
   * kostet deshalb nur sich selbst: er wird zu `unknown`, der Rest des Berichts
   * bleibt verwertbar. Sichtbar bleibt es über `maze_client_tier_coerced_total`.
   */
  tier: z.enum(CLIENT_QUALITY_TIERS).catch('unknown').optional()
}).strict();

export type ClientMetricsReport = z.infer<typeof clientMetricsSchema>;

export type RejectionReason = 'disabled' | 'schema' | 'flooded';

interface ClientSample {
  at: number;
  deviceClass: ClientDeviceClass;
  quality: ClientRenderPath;
  tier: ClientQualityTier;
  /** Der größere der beiden gemeldeten FPS-Werte. */
  fpsMedian: number;
  /** Der kleinere – der langsame Rand, unabhängig davon, wie herum der Client zählt. */
  fpsSlow: number;
  frameHangs: number;
  dpr: number;
  pixels: number;
}

interface ClientMetricsState {
  samples: ClientSample[];
  index: number;
  size: number;
  accepted: number;
  /** Berichte, deren beide FPS-Werte vertauscht ankamen (Client-Fehler). */
  inverted: number;
  /**
   * Berichte, deren `tier` kein erlaubter Wert war und auf `unknown`
   * zurückgebogen wurde. Ohne diesen Zähler wäre das Verwerfen unsichtbar –
   * genau der Fehler, den die weiche Annahme oben vermeiden soll.
   */
  tierCoerced: number;
  rejected: Map<RejectionReason, number>;
  hangsTotal: Map<string, number>;
  reportsTotal: Map<string, number>;
}

const createState = (): ClientMetricsState => ({
  samples: [],
  index: 0,
  size: 0,
  accepted: 0,
  inverted: 0,
  tierCoerced: 0,
  rejected: new Map(),
  hangsTotal: new Map(),
  reportsTotal: new Map()
});

let state = createState();

/** Setzt alle Werte zurück – für Tests und manuelle Messläufe. */
export function resetClientMetrics(): void {
  state = createState();
}

/**
 * Eigene Flag-Prüfung statt eines Imports aus `telemetry.ts`: Die Telemetrie
 * bindet dieses Modul für den `/metrics`-Export ein, ein Import zurück wäre ein
 * Zyklus. Es ist dieselbe Variable und dieselbe Bedeutung.
 */
export const clientMetricsEnabled = (): boolean => {
  const value = process.env.TELEMETRY_ENABLED?.trim().toLowerCase();
  if (value === undefined || value === '') return true;
  return value === 'true' || value === '1' || value === 'yes';
};

const bucketKey = (deviceClass: string, quality: string, tier: string): string =>
  `${deviceClass}|${quality}|${tier}`;
/** Zerlegt einen Bucket-Schlüssel wieder in seine drei Achsen. Die Werte
 * stammen ausnahmslos aus den Whitelists und enthalten daher kein `|`. */
const splitKey = (key: string): [string, string, string] => {
  const [deviceClass, quality, tier] = key.split('|');
  return [deviceClass ?? 'unknown', quality ?? 'unknown', tier ?? 'unknown'];
};
const bump = (counter: Map<string, number>, key: string, by = 1): void => {
  counter.set(key, (counter.get(key) ?? 0) + by);
};

/**
 * Nimmt einen geprüften Bericht auf. Läuft in konstanter Zeit und ohne
 * Allokation im Normalfall.
 */
export function recordClientMetrics(report: ClientMetricsReport, now = Date.now()): void {
  // Wie herum der Client seine Perzentile zählt, ist nicht zu erzwingen: Bei
  // Framedauern ist p95 der langsame Rand, bei Bildraten wäre es der schnelle.
  // Statt Berichte deswegen abzulehnen (und im Zweifel gar keine Daten zu
  // bekommen) gilt schlicht: der kleinere Wert ist der Rand.
  const fpsMedian = Math.max(report.fpsP50, report.fpsP95);
  const fpsSlow = Math.min(report.fpsP50, report.fpsP95);
  if (report.fpsP95 > report.fpsP50) state.inverted += 1;

  // Fehlt das Feld (Client vor R4), ist die Stufe schlicht unbekannt.
  const tier: ClientQualityTier = report.tier ?? 'unknown';

  const sample: ClientSample = {
    at: now,
    deviceClass: report.deviceClass,
    quality: report.quality,
    tier,
    fpsMedian,
    fpsSlow,
    frameHangs: report.frameHangs,
    dpr: report.dpr,
    pixels: report.viewportW * report.viewportH
  };
  if (state.size < CAPACITY) {
    state.samples.push(sample);
    state.size += 1;
  } else {
    state.samples[state.index] = sample;
  }
  state.index = (state.index + 1) % CAPACITY;

  const key = bucketKey(report.deviceClass, report.quality, tier);
  state.accepted += 1;
  bump(state.reportsTotal, key);
  bump(state.hangsTotal, key, report.frameHangs);
}

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank] ?? 0;
};

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export interface ClientBucketReport {
  deviceClass: ClientDeviceClass;
  quality: ClientRenderPath;
  tier: ClientQualityTier;
  samples: number;
  /** Median über die gemeldeten Mittelwerte. */
  fpsP50: number;
  /** Median über die gemeldeten Randwerte – die Bildrate im langsamen Fünftel. */
  fpsP95: number;
  /** Schlechtester gemeldeter Randwert im Fenster. */
  fpsWorst: number;
  frameHangsMedian: number;
  /** Anteil der Berichte, deren Randwert unter 30 fps liegt. */
  lowFpsRatio: number;
  dprMedian: number;
  megapixelsMedian: number;
}

export interface ClientMetricsSummary {
  enabled: boolean;
  windowSeconds: number;
  samples: number;
  acceptedTotal: number;
  invertedTotal: number;
  /** Berichte mit unbekannter Qualitätsstufe, die auf `unknown` fielen. */
  tierCoercedTotal: number;
  rejectedTotal: number;
  rejected: Record<string, number>;
  buckets: ClientBucketReport[];
}

/** Aggregierter Bericht über das gleitende Fenster. */
export function clientMetricsSummary(now = Date.now()): ClientMetricsSummary {
  const cutoff = now - WINDOW_MS;
  const grouped = new Map<string, ClientSample[]>();
  for (let index = 0; index < state.size; index += 1) {
    const sample = state.samples[index];
    if (!sample || sample.at < cutoff) continue;
    const key = bucketKey(sample.deviceClass, sample.quality, sample.tier);
    const list = grouped.get(key);
    if (list) list.push(sample);
    else grouped.set(key, [sample]);
  }

  const buckets: ClientBucketReport[] = [];
  for (const [key, list] of grouped) {
    const medians = list.map((sample) => sample.fpsMedian).sort((a, b) => a - b);
    const slows = list.map((sample) => sample.fpsSlow).sort((a, b) => a - b);
    const hangs = list.map((sample) => sample.frameHangs).sort((a, b) => a - b);
    const dprs = list.map((sample) => sample.dpr).sort((a, b) => a - b);
    const pixels = list.map((sample) => sample.pixels).sort((a, b) => a - b);
    const [deviceClass, quality, tier] = splitKey(key) as [
      ClientDeviceClass,
      ClientRenderPath,
      ClientQualityTier
    ];
    buckets.push({
      deviceClass,
      quality,
      tier,
      samples: list.length,
      fpsP50: round(quantile(medians, 0.5), 1),
      fpsP95: round(quantile(slows, 0.5), 1),
      fpsWorst: round(slows[0] ?? 0, 1),
      frameHangsMedian: round(quantile(hangs, 0.5), 1),
      lowFpsRatio: round(list.filter((sample) => sample.fpsSlow < LOW_FPS_THRESHOLD).length / list.length, 3),
      dprMedian: round(quantile(dprs, 0.5), 2),
      megapixelsMedian: round(quantile(pixels, 0.5) / 1_000_000, 2)
    });
  }
  buckets.sort(
    (a, b) =>
      a.deviceClass.localeCompare(b.deviceClass) ||
      a.quality.localeCompare(b.quality) ||
      a.tier.localeCompare(b.tier)
  );

  const rejected: Record<string, number> = {};
  let rejectedTotal = 0;
  for (const [reason, count] of state.rejected) {
    rejected[reason] = count;
    rejectedTotal += count;
  }

  return {
    enabled: clientMetricsEnabled(),
    windowSeconds: WINDOW_MS / 1_000,
    samples: buckets.reduce((total, bucket) => total + bucket.samples, 0),
    acceptedTotal: state.accepted,
    invertedTotal: state.inverted,
    tierCoercedTotal: state.tierCoerced,
    rejectedTotal,
    rejected,
    buckets
  };
}

/**
 * Baut das Labelset. Jeder Wert wird gegen seine Whitelist gehalten, bevor er
 * in den Export geht – dies ist die letzte Stelle vor der Ausgabe, und sie
 * verlässt sich nicht darauf, dass weiter oben schon geprüft wurde. Was nicht
 * im Vokabular steht, wird zu `unknown`; damit ist die Zahl der Zeitreihen
 * durch 4 × 4 × 4 gedeckelt, egal was ein Client schickt.
 */
const allow = <T extends string>(allowed: readonly T[], value: string): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : ('unknown' as T);

const label = (deviceClass: string, quality: string, tier: string): string =>
  `{deviceClass="${allow(CLIENT_DEVICE_CLASSES, deviceClass)}",` +
  `quality="${allow(CLIENT_RENDER_PATHS, quality)}",` +
  `tier="${allow(CLIENT_QUALITY_TIERS, tier)}"}`;

/**
 * Prometheus-Block für `/metrics`. Eigenes Rendern statt eines Imports aus
 * `telemetry.ts` – dieses Modul bleibt damit frei von Rückwärtsabhängigkeiten.
 */
export function clientMetricsText(now = Date.now()): string {
  const summary = clientMetricsSummary(now);
  const lines: string[] = [
    `# HELP maze_client_window_samples Client-Berichte im gleitenden ${summary.windowSeconds}-Sekunden-Fenster.`,
    '# TYPE maze_client_window_samples gauge',
    `maze_client_window_samples ${summary.samples}`,
    '# HELP maze_client_reports_total Angenommene Client-Berichte seit Serverstart.',
    '# TYPE maze_client_reports_total counter'
  ];
  for (const [key, count] of state.reportsTotal) {
    const [deviceClass, quality, tier] = splitKey(key);
    lines.push(`maze_client_reports_total${label(deviceClass, quality, tier)} ${count}`);
  }
  lines.push(
    '# HELP maze_client_reports_rejected_total Verworfene Client-Berichte je Grund.',
    '# TYPE maze_client_reports_rejected_total counter'
  );
  for (const [reason, count] of state.rejected) {
    lines.push(`maze_client_reports_rejected_total{reason="${reason}"} ${count}`);
  }
  lines.push(
    '# HELP maze_client_reports_inverted_total Berichte mit vertauschten FPS-Perzentilen.',
    '# TYPE maze_client_reports_inverted_total counter',
    `maze_client_reports_inverted_total ${summary.invertedTotal}`,
    '# HELP maze_client_tier_coerced_total Berichte mit unbekannter Qualitaetsstufe, auf "unknown" zurueckgebogen.',
    '# TYPE maze_client_tier_coerced_total counter',
    `maze_client_tier_coerced_total ${summary.tierCoercedTotal}`
  );

  if (summary.buckets.length === 0) return `${lines.join('\n')}\n`;

  const series: [string, string, keyof ClientBucketReport][] = [
    ['maze_client_fps_p50', 'Bildrate bei mittlerer Framedauer (Median über die Berichte).', 'fpsP50'],
    ['maze_client_fps_p95', 'Bildrate am langsamen Rand (Median über die Berichte).', 'fpsP95'],
    ['maze_client_fps_worst', 'Schlechtester gemeldeter Randwert im Fenster.', 'fpsWorst'],
    ['maze_client_frame_hangs', 'Frames über 100 ms je Bericht (Median).', 'frameHangsMedian'],
    ['maze_client_low_fps_ratio', `Anteil der Berichte unter ${LOW_FPS_THRESHOLD} fps am Rand.`, 'lowFpsRatio'],
    ['maze_client_dpr', 'Pixelverhältnis (Median).', 'dprMedian'],
    ['maze_client_megapixels', 'Sichtfläche in Megapixeln (Median).', 'megapixelsMedian'],
    ['maze_client_bucket_samples', 'Berichte je Kombination im Fenster.', 'samples']
  ];
  for (const [name, help, field] of series) {
    lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`);
    for (const bucket of summary.buckets) {
      lines.push(
        `${name}${label(bucket.deviceClass, bucket.quality, bucket.tier)} ${bucket[field] as number}`
      );
    }
  }
  lines.push(
    '# HELP maze_client_frame_hangs_total Summe aller gemeldeten Hänger seit Serverstart.',
    '# TYPE maze_client_frame_hangs_total counter'
  );
  for (const [key, count] of state.hangsTotal) {
    const [deviceClass, quality, tier] = splitKey(key);
    lines.push(`maze_client_frame_hangs_total${label(deviceClass, quality, tier)} ${count}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Express-Handler für `POST /client-metrics`. Antwortet mit `204` – der Client
 * bekommt nichts zurück, was er verarbeiten müsste, und soll auch nichts
 * erwarten.
 */
export function clientMetricsHandler(): (request: Request, response: Response) => void {
  return (request: Request, response: Response): void => {
    if (!clientMetricsEnabled()) {
      bump(state.rejected as Map<string, number>, 'disabled');
      response.status(404).json({ error: 'Telemetrie ist deaktiviert.' });
      return;
    }
    const parsed = clientMetricsSchema.safeParse(request.body);
    if (!parsed.success) {
      bump(state.rejected as Map<string, number>, 'schema');
      // Bewusst ohne Details: Der Grund steht als Zähler in /metrics, und ein
      // offener Endpunkt soll kein Schema-Orakel sein.
      response.status(400).json({ error: 'Ungültiger Bericht.' });
      return;
    }
    // Ein zurechtgebogener `tier` darf nicht lautlos passieren: `.catch()` hat
    // den Bericht gerettet, aber der Client meldet dann etwas, das wir nicht
    // kennen – das gehört in den Export, nicht in die Stille.
    const rawTier: unknown = (request.body as { tier?: unknown } | null | undefined)?.tier;
    if (rawTier !== undefined && rawTier !== parsed.data.tier) state.tierCoerced += 1;

    recordClientMetrics(parsed.data);
    response.status(204).end();
  };
}
