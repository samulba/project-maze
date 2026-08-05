#!/usr/bin/env node
/**
 * Project Maze – Balance-Auswertung einer laufenden Instanz.
 *
 * Zieht `/metrics?format=json` von einem laufenden Server und macht daraus die
 * Tabellen, mit denen eine Balance-Runde gefahren wird: je Klasse, je Familie
 * und je Core Module / Frame jeweils Pickrate, K/D, mittlere Lebensdauer und
 * Kills pro Minute. Werte, die deutlich aus ihrer Vergleichsgruppe fallen,
 * landen auf der Watchlist.
 *
 *   npm run balance:live -- --url https://mazers.de
 *   npm run balance:live -- --url https://mazers.de --json > abzug-vorher.json
 *   npm run balance:live -- --url https://mazers.de --baseline abzug-vorher.json
 *
 * Das Skript liest nur – es braucht keine Datenbank, keinen gebauten Workspace
 * und kennt den Klassenkatalog nicht: Familie, Tier und Labels kommen aus dem
 * Export, damit die Auswertung auch gegen eine fremde Instanz stimmt.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  url: 'http://localhost:2567',
  token: '',
  subject: 'human',
  sort: 'pickRate',
  peer: 'family',
  minSamples: 5,
  outlierHigh: 1.5,
  outlierLow: 0.67,
  top: 8,
  baseline: '',
  asc: false,
  all: false,
  json: false
};

const NUMERIC_OPTIONS = new Set(['minSamples', 'outlierHigh', 'outlierLow', 'top']);
const BOOLEAN_OPTIONS = new Set(['asc', 'all', 'json', 'help']);
const SUBJECTS = new Set(['human', 'bot', 'all']);
const PEERS = new Set(['family', 'tier']);

/** Spalten, nach denen sortiert werden kann – Schlüssel ist auch der Feldname. */
export const SORT_KEYS = {
  pickRate: 'Pickrate',
  picks: 'Picks',
  killsPerDeath: 'K/D',
  averageLifetimeSeconds: 'Lebensdauer',
  killsPerMinute: 'Kills/min',
  kills: 'Kills',
  deaths: 'Deaths',
  lives: 'Leben',
  id: 'Name'
};

/** Kennzahlen, die auf Ausreißer geprüft werden – mit ihrer Stichprobenquelle. */
const OUTLIER_METRICS = [
  { key: 'pickRate', label: 'Pickrate', sample: 'picks', format: (value) => `${(value * 100).toFixed(1)} %` },
  { key: 'killsPerDeath', label: 'K/D', sample: 'deaths', format: (value) => value.toFixed(2) },
  { key: 'averageLifetimeSeconds', label: 'Lebensdauer', sample: 'lives', format: (value) => `${value.toFixed(1)} s` },
  { key: 'killsPerMinute', label: 'Kills/min', sample: 'lives', format: (value) => value.toFixed(2) }
];

export const DUMP_FORMAT_VERSION = 1;
/** Ab dieser Telemetrie-Version liefert der Export Familie und exakte Lebenszeit. */
export const REQUIRED_TELEMETRY_VERSION = 3;

export function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    url: process.env.METRICS_URL?.trim() || DEFAULTS.url,
    token: process.env.METRICS_TOKEN?.trim() || DEFAULTS.token
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unbekanntes Argument: ${token}`);
    const [flag, inlineValue] = token.slice(2).split('=', 2);
    const key = flag.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (BOOLEAN_OPTIONS.has(key)) {
      options[key] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    if (!(key in DEFAULTS)) throw new Error(`Unbekannte Option: --${flag}`);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${flag} braucht einen Wert`);
    if (NUMERIC_OPTIONS.has(key)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${flag} braucht eine Zahl >= 0`);
      options[key] = parsed;
    } else {
      options[key] = value;
    }
  }
  if (!SUBJECTS.has(options.subject)) throw new Error('--subject kennt nur human, bot oder all');
  if (!PEERS.has(options.peer)) throw new Error('--peer kennt nur family oder tier');
  if (!(options.sort in SORT_KEYS)) {
    throw new Error(`--sort kennt nur ${Object.keys(SORT_KEYS).join(', ')}`);
  }
  if (options.outlierHigh <= 1) throw new Error('--outlier-high braucht einen Faktor > 1');
  if (options.outlierLow <= 0 || options.outlierLow >= 1) throw new Error('--outlier-low braucht einen Faktor zwischen 0 und 1');
  return options;
}

/**
 * Macht aus der Nutzereingabe die Abfrage-URL. Erlaubt sind die nackte Basis
 * (`https://mazers.de`), ein fertiger Pfad (`.../metrics`) und beides mit
 * bereits gesetzten Query-Parametern.
 */
export function metricsUrl(base, subject = 'human') {
  // Ohne Schema wird https angenommen – ein Token darf nicht versehentlich im
  // Klartext rausgehen. Nur lokale Adressen bleiben http.
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(base);
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(base) ? base : `${local ? 'http' : 'https'}://${base}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`--url ist keine gültige Adresse: ${base}`);
  }
  if (!/\/metrics\/?$/.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/metrics`;
  }
  url.searchParams.set('format', 'json');
  url.searchParams.set('subject', subject);
  return url.toString();
}

export async function fetchReport(url, token, fetchImpl = globalThis.fetch) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetchImpl(url, { headers });
  } catch (error) {
    throw new Error(`${url} ist nicht erreichbar: ${error.message ?? error}`);
  }
  if (response.status === 401) {
    throw new Error('401 – /metrics ist mit METRICS_TOKEN geschützt. Token über --token oder ENV setzen.');
  }
  if (response.status === 404) {
    throw new Error('404 – /metrics antwortet nicht. Läuft die Instanz mit TELEMETRY_ENABLED=true?');
  }
  if (!response.ok) throw new Error(`${url} antwortet mit ${response.status}`);
  let report;
  try {
    report = await response.json();
  } catch {
    throw new Error(`${url} liefert kein JSON – zeigt die URL wirklich auf den Spielserver?`);
  }
  if (!Array.isArray(report?.classes)) throw new Error(`${url} liefert keinen Telemetriebericht`);
  return report;
}

/** Median über bereits gefilterte Werte – bei gerader Anzahl das Mittel der Mitte. */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

const rate = (value, total) => (total > 0 ? value / total : 0);
const ratio = (kills, deaths) => (deaths > 0 ? kills / deaths : kills);

/**
 * Rechnet die abgeleiteten Kennzahlen immer aus den Rohzählern – nur so liefert
 * ein Zeitfenster (`aktuell − Baseline`) dieselben Formeln wie ein Vollabzug.
 */
export function deriveRow(raw, pickTotal) {
  return {
    ...raw,
    pickRate: rate(raw.picks, pickTotal),
    killsPerDeath: ratio(raw.kills, raw.deaths),
    averageLifetimeSeconds: raw.lives > 0 ? raw.lifetimeSeconds / raw.lives : 0,
    killsPerMinute: raw.lifetimeSeconds > 0 ? (raw.kills * 60) / raw.lifetimeSeconds : 0
  };
}

const rawOf = (entry, extra = {}) => ({
  id: entry.id,
  label: entry.label ?? entry.id,
  ...extra,
  picks: entry.picks ?? 0,
  kills: entry.kills ?? 0,
  deaths: entry.deaths ?? 0,
  lives: entry.lives ?? 0,
  lifetimeSeconds: entry.lifetimeSeconds ?? 0
});

const sumRaw = (rows, identity) => rows.reduce((total, row) => ({
  ...total,
  picks: total.picks + row.picks,
  kills: total.kills + row.kills,
  deaths: total.deaths + row.deaths,
  lives: total.lives + row.lives,
  lifetimeSeconds: total.lifetimeSeconds + row.lifetimeSeconds
}), { ...identity, picks: 0, kills: 0, deaths: 0, lives: 0, lifetimeSeconds: 0 });

const FAMILY_LABELS = {
  core: 'Core',
  rapid: 'Rapid',
  precision: 'Precision',
  control: 'Control',
  impact: 'Impact'
};

/** Baut aus dem Telemetriebericht die vier Gruppen mit Roh- und Ableitungswerten. */
export function buildGroups(report) {
  const classRaw = report.classes.map((entry) => rawOf(entry, {
    branch: entry.branch ?? 'unbekannt',
    tier: entry.tier ?? 0
  }));
  const moduleRaw = (report.modules ?? []).map((entry) => rawOf(entry));
  const frameRaw = (report.frames ?? []).map((entry) => rawOf(entry));

  const branches = [...new Set(classRaw.map((row) => row.branch))];
  const familyRaw = branches.map((branch) => sumRaw(
    classRaw.filter((row) => row.branch === branch),
    { id: branch, label: FAMILY_LABELS[branch] ?? branch, classes: classRaw.filter((row) => row.branch === branch).length }
  ));

  const derive = (rows) => {
    const pickTotal = rows.reduce((total, row) => total + row.picks, 0);
    return rows.map((row) => deriveRow(row, pickTotal));
  };

  return {
    classes: derive(classRaw),
    families: derive(familyRaw),
    modules: derive(moduleRaw),
    frames: derive(frameRaw)
  };
}

/**
 * Markiert Ausreißer gegen den Median ihrer Vergleichsgruppe. In die
 * Medianbildung geht nur ein, wer die Mindest-Stichprobe erreicht – sonst
 * verschiebt eine einzige Zeile mit zwei Leben die ganze Referenz.
 */
export function markOutliers(groups, options) {
  const { minSamples, outlierHigh, outlierLow, peer } = options;
  const watchlist = [];

  const peerKeyFor = (groupName, row) => {
    if (groupName !== 'classes') return 'alle';
    return peer === 'tier' ? `T${row.tier}` : row.branch;
  };
  const peerLabelFor = (groupName, key) => {
    if (groupName !== 'classes') return 'Gruppen-Median';
    return peer === 'tier' ? `Median Tier ${key.slice(1)}` : `Median ${FAMILY_LABELS[key] ?? key}`;
  };

  for (const [groupName, rows] of Object.entries(groups)) {
    for (const row of rows) row.marks = {};
    for (const metric of OUTLIER_METRICS) {
      const peers = new Map();
      for (const row of rows) {
        const key = peerKeyFor(groupName, row);
        if (!peers.has(key)) peers.set(key, []);
        if (row[metric.sample] >= Math.max(1, minSamples)) peers.get(key).push(row[metric.key]);
      }
      for (const row of rows) {
        const key = peerKeyFor(groupName, row);
        const sample = peers.get(key) ?? [];
        // Unter drei Vergleichszeilen ist ein Median keine Referenz, sondern Zufall.
        if (row[metric.sample] < Math.max(1, minSamples) || sample.length < 3) {
          row.marks[metric.key] = { mark: '·', reason: 'zu wenig Daten' };
          continue;
        }
        const reference = median(sample);
        if (!reference) {
          row.marks[metric.key] = { mark: ' ', reason: 'kein Median' };
          continue;
        }
        const factor = row[metric.key] / reference;
        const mark = factor > outlierHigh ? '▲' : factor < outlierLow ? '▼' : ' ';
        row.marks[metric.key] = { mark, factor, reference };
        if (mark === ' ') continue;
        watchlist.push({
          group: groupName,
          id: row.id,
          label: row.label,
          metric: metric.key,
          metricLabel: metric.label,
          mark,
          value: row[metric.key],
          reference,
          factor,
          peerLabel: peerLabelFor(groupName, key),
          formatted: metric.format(row[metric.key]),
          formattedReference: metric.format(reference)
        });
      }
    }
  }

  // Die stärkste Abweichung zuerst – in beide Richtungen gleich gewichtet. Ein
  // Wert von genau 0 hat keinen Logarithmus und gilt als maximale Abweichung;
  // bei Gleichstand entscheidet der Name, damit die Reihenfolge reproduzierbar
  // bleibt.
  const spread = (hit) => (hit.factor > 0 && Number.isFinite(hit.factor) ? Math.abs(Math.log(hit.factor)) : Number.MAX_VALUE);
  watchlist.sort((a, b) => (spread(b) - spread(a)) || a.id.localeCompare(b.id) || a.metric.localeCompare(b.metric));
  return watchlist;
}

export function sortRows(rows, key, ascending) {
  const direction = ascending ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'id') return a.id.localeCompare(b.id) * direction;
    const delta = (a[key] ?? 0) - (b[key] ?? 0);
    return delta === 0 ? a.id.localeCompare(b.id) : delta * direction;
  });
}

/** Der weiterverarbeitbare Abzug – zugleich das Format für `--baseline`. */
export function buildDump(report, options, capturedAt, source) {
  const groups = buildGroups(report);
  const watchlist = markOutliers(groups, options);
  return {
    tool: 'maze-balance-live',
    formatVersion: DUMP_FORMAT_VERSION,
    capturedAt,
    source,
    subject: report.subject ?? options.subject,
    telemetryVersion: report.telemetryVersion ?? 0,
    serverMode: report.mode ?? 'unbekannt',
    serverVersion: report.version ?? 'unbekannt',
    uptimeSeconds: report.uptimeSeconds ?? 0,
    population: report.population ?? null,
    totals: report.totals ?? null,
    peer: options.peer,
    minSamples: options.minSamples,
    outlier: { high: options.outlierHigh, low: options.outlierLow },
    ...groups,
    watchlist
  };
}

const GROUP_NAMES = ['classes', 'families', 'modules', 'frames'];

/**
 * Vergleicht zwei Abzüge. Sind die Zähler seit dem Abzug nur gewachsen, wird
 * das reine Zeitfenster (`aktuell − Baseline`) ausgewertet – das ist die Sicht,
 * die eine Balance-Änderung wirklich beantwortet. Wurde der Server dazwischen
 * neu gestartet, fangen die Zähler wieder bei null an; dann bleibt nur der
 * Vergleich zweier Gesamtstände.
 */
export function diffDumps(baseline, current, options) {
  const counters = ['picks', 'kills', 'deaths', 'lives', 'lifetimeSeconds'];
  const baseIndex = new Map();
  for (const name of GROUP_NAMES) {
    for (const row of baseline[name] ?? []) baseIndex.set(`${name}|${row.id}`, row);
  }

  let restarted = (current.uptimeSeconds ?? 0) < (baseline.uptimeSeconds ?? 0);
  if (!restarted) {
    for (const name of GROUP_NAMES) {
      for (const row of current[name] ?? []) {
        const before = baseIndex.get(`${name}|${row.id}`);
        if (before && counters.some((key) => row[key] < before[key])) restarted = true;
      }
    }
  }

  const mode = restarted ? 'compare' : 'interval';
  const groups = {};
  for (const name of GROUP_NAMES) {
    const rows = current[name] ?? [];
    const rawRows = rows.map((row) => {
      const before = baseIndex.get(`${name}|${row.id}`);
      if (mode === 'compare' || !before) return { ...row };
      const windowed = { ...row };
      for (const key of counters) windowed[key] = row[key] - before[key];
      return windowed;
    });
    const pickTotal = rawRows.reduce((total, row) => total + row.picks, 0);
    groups[name] = rawRows.map((row) => {
      const derived = deriveRow(row, pickTotal);
      const before = baseIndex.get(`${name}|${row.id}`) ?? null;
      derived.before = before;
      derived.delta = before
        ? {
          pickRate: derived.pickRate - before.pickRate,
          killsPerDeath: derived.killsPerDeath - before.killsPerDeath,
          averageLifetimeSeconds: derived.averageLifetimeSeconds - before.averageLifetimeSeconds,
          killsPerMinute: derived.killsPerMinute - before.killsPerMinute
        }
        : null;
      return derived;
    });
  }

  const watchlist = markOutliers(groups, options);
  const seconds = mode === 'interval'
    ? (current.uptimeSeconds ?? 0) - (baseline.uptimeSeconds ?? 0)
    : (current.uptimeSeconds ?? 0);
  return { mode, restarted, windowSeconds: Math.max(0, seconds), baseline, current, ...groups, watchlist };
}

const percent = (value) => `${(value * 100).toFixed(1)} %`;
const seconds = (value) => `${value.toFixed(1)} s`;
const signed = (value, digits = 2) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
const signedPoints = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)} pp`;

export function formatDuration(totalSeconds) {
  const value = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${String(value % 60).padStart(2, '0')} s`;
  return `${value} s`;
}

const cell = (text, width, align = 'right') => {
  const value = String(text);
  // Nur Text wird gekürzt; Zahlen dürfen lieber die Spalte sprengen als lügen.
  if (align === 'left') return (value.length > width ? `${value.slice(0, width - 1)}…` : value).padEnd(width);
  return value.padStart(width);
};
const marked = (row, key) => row.marks?.[key]?.mark ?? ' ';

function table(rows, columns) {
  const header = columns.map((column) => cell(column.title, column.width, column.align)).join(' ');
  const lines = ['  ' + header, '  ' + '─'.repeat(header.length)];
  for (const row of rows) {
    lines.push('  ' + columns.map((column) => cell(column.value(row), column.width, column.align)).join(' '));
  }
  return lines;
}

const METRIC_COLUMNS = [
  { title: 'Picks', width: 7, value: (row) => row.picks },
  { title: 'Pickrate', width: 8, value: (row) => percent(row.pickRate) },
  { title: '', width: 1, value: (row) => marked(row, 'pickRate') },
  { title: 'K/D', width: 6, value: (row) => row.killsPerDeath.toFixed(2) },
  { title: '', width: 1, value: (row) => marked(row, 'killsPerDeath') },
  { title: 'Leben', width: 6, value: (row) => row.lives },
  { title: '⌀ Leben', width: 8, value: (row) => seconds(row.averageLifetimeSeconds) },
  { title: '', width: 1, value: (row) => marked(row, 'averageLifetimeSeconds') },
  { title: 'K/min', width: 6, value: (row) => row.killsPerMinute.toFixed(2) },
  { title: '', width: 1, value: (row) => marked(row, 'killsPerMinute') }
];

const DELTA_COLUMNS = [
  { title: 'Pickrate', width: 8, value: (row) => percent(row.pickRate) },
  { title: 'Δ', width: 9, value: (row) => (row.delta ? signedPoints(row.delta.pickRate) : 'neu') },
  { title: 'K/D', width: 6, value: (row) => row.killsPerDeath.toFixed(2) },
  { title: 'Δ', width: 7, value: (row) => (row.delta ? signed(row.delta.killsPerDeath) : 'neu') },
  { title: '⌀ Leben', width: 8, value: (row) => seconds(row.averageLifetimeSeconds) },
  { title: 'Δ', width: 8, value: (row) => (row.delta ? `${signed(row.delta.averageLifetimeSeconds, 1)} s` : 'neu') },
  { title: 'K/min', width: 6, value: (row) => row.killsPerMinute.toFixed(2) },
  { title: 'Δ', width: 7, value: (row) => (row.delta ? signed(row.delta.killsPerMinute) : 'neu') }
];

const nameColumn = (title, width) => ({ title, width, align: 'left', value: (row) => row.label });

export function formatReport(dump, options, diff = null) {
  const lines = [];
  const sortLabel = SORT_KEYS[options.sort];
  const sorted = (rows) => sortRows(rows, options.sort, options.asc);

  lines.push('', 'PROJECT MAZE — BALANCE LIVE', '');
  lines.push(`  Quelle        ${dump.source}`);
  lines.push(`  Abzug         ${dump.capturedAt}`);
  lines.push(`  Laufzeit      ${formatDuration(dump.uptimeSeconds)} (${dump.serverMode} ${dump.serverVersion}, Telemetrie v${dump.telemetryVersion})`);
  const population = dump.population
    ? `${dump.population.humans} Menschen / ${dump.population.bots} Bots`
    : 'unbekannt';
  lines.push(`  Arena         ${population}`);
  lines.push(`  Sicht         subject=${dump.subject}, Peer-Gruppe ${options.peer === 'tier' ? 'Tier' : 'Familie'}, Mindest-Stichprobe ${options.minSamples}`);
  lines.push(`  Ausreißer     > ${options.outlierHigh}× oder < ${options.outlierLow}× des Medians  (▲ hoch, ▼ niedrig, · zu wenig Daten)`);

  if (dump.telemetryVersion < REQUIRED_TELEMETRY_VERSION) {
    lines.push('');
    lines.push(`  ! Die Instanz liefert Telemetrie v${dump.telemetryVersion}. Familie und exakte`);
    lines.push(`    Lebenszeit gibt es erst ab v${REQUIRED_TELEMETRY_VERSION} – Familien- und K/min-Spalten bleiben leer.`);
  }

  lines.push('', `KLASSEN  (nach ${sortLabel})`, '');
  lines.push(...table(sorted(dump.classes), [
    nameColumn('Klasse', 16),
    { title: 'Familie', width: 9, align: 'left', value: (row) => row.branch },
    { title: 'T', width: 1, value: (row) => row.tier },
    ...METRIC_COLUMNS
  ]));

  lines.push('', `FAMILIEN  (nach ${sortLabel})`, '');
  lines.push(...table(sorted(dump.families), [
    nameColumn('Familie', 16),
    { title: 'Klassen', width: 7, value: (row) => row.classes ?? '' },
    ...METRIC_COLUMNS
  ]));

  lines.push('', `CORE MODULES  (nach ${sortLabel})`, '');
  lines.push(...table(sorted(dump.modules), [nameColumn('Modul', 16), ...METRIC_COLUMNS]));

  lines.push('', `FRAMES  (nach ${sortLabel})`, '');
  lines.push(...table(sorted(dump.frames), [nameColumn('Frame', 16), ...METRIC_COLUMNS]));

  lines.push('', 'WATCHLIST', '');
  if (dump.watchlist.length === 0) {
    lines.push('  Keine Auffälligkeiten – alles innerhalb der Toleranz.');
  } else {
    for (const hit of dump.watchlist) {
      lines.push(
        `  ${hit.mark} ${cell(hit.label, 16, 'left')} ${cell(hit.metricLabel, 11, 'left')}`
        + ` ${cell(hit.formatted, 9)}  gegen ${cell(hit.formattedReference, 9)}`
        + `  ×${hit.factor.toFixed(2)}  (${hit.peerLabel})`
      );
    }
    lines.push('', `  ${dump.watchlist.length} Auffälligkeit(en) – das ist die Liste für die Balance-Runde.`);
  }

  if (diff) lines.push(...formatDiff(diff, options));

  lines.push('');
  lines.push('  Pickrate = Anteil an allen Wahlen der Gruppe, K/D = Kills je Death,');
  lines.push('  ⌀ Leben = mittlere Lebensdauer abgeschlossener Leben, K/min = Kills je');
  lines.push('  gelebter Minute. Module und Frames erben die Lebensdauer vom Loadout');
  lines.push('  beim Tod – wie schon die Deaths.');
  lines.push('');
  return lines.join('\n');
}

export function formatDiff(diff, options) {
  const lines = ['', ''];
  const sorted = (rows) => sortRows(rows, options.sort, options.asc);
  if (diff.mode === 'interval') {
    lines.push(`ZEITFENSTER seit ${diff.baseline.capturedAt}  (${formatDuration(diff.windowSeconds)})`, '');
    lines.push('  Gezeigt wird nur, was seit dem Abzug passiert ist; Δ vergleicht dieses');
    lines.push('  Fenster mit dem Stand davor.', '');
  } else {
    lines.push(`VERGLEICH mit ${diff.baseline.capturedAt}`, '');
    lines.push('  ! Die Zähler sind seit dem Abzug nicht durchgehend gewachsen – der Server');
    lines.push('    wurde zwischendurch neu gestartet. Ein sauberes Zeitfenster ist damit');
    lines.push('    nicht rekonstruierbar; verglichen werden zwei Gesamtstände.', '');
  }

  const movers = [...diff.classes]
    .filter((row) => row.delta)
    .sort((a, b) => Math.abs(b.delta.pickRate) - Math.abs(a.delta.pickRate))
    .slice(0, options.top);
  if (movers.length > 0) {
    lines.push('  GRÖSSTE BEWEGUNGEN (Pickrate)', '');
    lines.push(...table(movers, [nameColumn('Klasse', 16), ...DELTA_COLUMNS]));
    lines.push('');
  }

  const sections = [
    ['classes', 'KLASSEN', 'Klasse'],
    ['families', 'FAMILIEN', 'Familie'],
    ['modules', 'CORE MODULES', 'Modul'],
    ['frames', 'FRAMES', 'Frame']
  ];
  for (const [name, title, columnTitle] of sections) {
    // Im Fenster ist eine Zeile ohne Bewegung wirklich nichts – anders als in
    // der Gesamtsicht, wo sie „nie gespielt" bedeutet und dazugehört.
    const moved = options.all ? diff[name] : diff[name].filter((row) => row.picks > 0 || row.lives > 0 || row.kills > 0);
    const hidden = diff[name].length - moved.length;
    lines.push(`  ${title} IM FENSTER`, '');
    if (moved.length === 0) {
      lines.push('  Keine Bewegung im Fenster.', '');
      continue;
    }
    lines.push(...table(sorted(moved), [nameColumn(columnTitle, 16), ...DELTA_COLUMNS]));
    if (hidden > 0) lines.push('', `  ${hidden} Zeile(n) ohne Bewegung ausgeblendet (--all zeigt alle).`);
    lines.push('');
  }

  lines.push('  WATCHLIST IM FENSTER', '');
  if (diff.watchlist.length === 0) {
    lines.push('  Keine Auffälligkeiten im Fenster.');
  } else {
    for (const hit of diff.watchlist) {
      lines.push(
        `  ${hit.mark} ${cell(hit.label, 16, 'left')} ${cell(hit.metricLabel, 11, 'left')}`
        + ` ${cell(hit.formatted, 9)}  gegen ${cell(hit.formattedReference, 9)}`
        + `  ×${hit.factor.toFixed(2)}  (${hit.peerLabel})`
      );
    }
  }
  return lines;
}

export async function loadBaseline(path, read = readFile) {
  let text;
  try {
    text = await read(path, 'utf8');
  } catch (error) {
    throw new Error(`--baseline ${path} ist nicht lesbar: ${error.message ?? error}`);
  }
  let dump;
  try {
    dump = JSON.parse(text);
  } catch {
    throw new Error(`--baseline ${path} ist kein JSON. Erwartet wird ein Abzug aus "--json".`);
  }
  if (dump?.tool !== 'maze-balance-live' || !Array.isArray(dump.classes)) {
    throw new Error(`--baseline ${path} ist kein Abzug dieses Skripts (erwartet wird die Ausgabe von "--json").`);
  }
  if (dump.formatVersion !== DUMP_FORMAT_VERSION) {
    throw new Error(`--baseline ${path} hat Format ${dump.formatVersion}, erwartet wird ${DUMP_FORMAT_VERSION}.`);
  }
  return dump;
}

const HELP = `Project Maze – Balance-Auswertung einer laufenden Instanz

  node scripts/balance-live.mjs [Optionen]

  --url <url>          Instanz oder /metrics-Pfad  (Default ${DEFAULTS.url}, ENV METRICS_URL)
  --token <token>      Bearer-Token für /metrics   (ENV METRICS_TOKEN)
  --subject <wer>      human | bot | all           (Default ${DEFAULTS.subject})
  --sort <spalte>      ${Object.keys(SORT_KEYS).join(' | ')}
                       (Default ${DEFAULTS.sort})
  --asc                Aufsteigend statt absteigend
  --peer <gruppe>      family | tier – Vergleichsgruppe der Klassen (Default ${DEFAULTS.peer})
  --min-samples <n>    Mindest-Stichprobe je Kennzahl (Default ${DEFAULTS.minSamples})
  --outlier-high <f>   Obere Ausreißergrenze       (Default ${DEFAULTS.outlierHigh})
  --outlier-low <f>    Untere Ausreißergrenze      (Default ${DEFAULTS.outlierLow})
  --baseline <datei>   Früheren "--json"-Abzug gegenüberstellen
  --top <n>            Zeilen in "Größte Bewegungen" (Default ${DEFAULTS.top})
  --all                Auch Zeilen ohne Bewegung im Fenster zeigen
  --json               Nur den Abzug als JSON ausgeben
  --help               Diese Hilfe

  Abzug sichern und später vergleichen:

    node scripts/balance-live.mjs --url https://mazers.de --json > vorher.json
    node scripts/balance-live.mjs --url https://mazers.de --baseline vorher.json
`;

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n`);
    console.error(HELP);
    process.exit(2);
  }
  if (options.help) {
    console.log(HELP);
    return;
  }

  const source = metricsUrl(options.url, options.subject);
  const report = await fetchReport(source, options.token);
  const dump = buildDump(report, options, new Date().toISOString(), source);

  if (options.json) {
    console.log(JSON.stringify(dump, null, 2));
    return;
  }

  const diff = options.baseline ? diffDumps(await loadBaseline(options.baseline), dump, options) : null;
  console.log(formatReport(dump, options, diff));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(2);
  });
}
