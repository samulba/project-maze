import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDump,
  buildGroups,
  deriveRow,
  diffDumps,
  fetchReport,
  formatDuration,
  formatReport,
  loadBaseline,
  markOutliers,
  median,
  metricsUrl,
  parseArgs,
  sortRows
} from './balance-live.mjs';

const OPTIONS = {
  ...parseArgs([]),
  minSamples: 5,
  outlierHigh: 1.5,
  outlierLow: 0.67,
  peer: 'family',
  sort: 'pickRate',
  asc: false,
  top: 8
};

/**
 * Feste Kunst-Telemetrie: sieben Klassen je Familie wie im echten Katalog,
 * damit jede Familie einen tragfähigen Median hat. Alle Zahlen sind gesetzt,
 * nicht gewürfelt – das Ergebnis darf nie vom Zufall abhängen.
 */
const classEntry = (id, branch, tier, picks, kills, deaths, lives, lifetimeSeconds) => ({
  id,
  label: id.toUpperCase(),
  branch,
  tier,
  picks,
  kills,
  deaths,
  lives,
  lifetimeSeconds,
  pickRate: 0,
  killsPerDeath: 0,
  averageLifetimeSeconds: 0,
  longestLifetimeSeconds: 0,
  killsPerMinute: 0
});

const family = (branch, scale = 1) => [
  classEntry(`${branch}1`, branch, 1, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}2`, branch, 2, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}3`, branch, 2, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}4`, branch, 3, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}5`, branch, 3, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}6`, branch, 3, 100 * scale, 100, 100, 100, 3000),
  classEntry(`${branch}7`, branch, 3, 100 * scale, 100, 100, 100, 3000)
];

const report = (overrides = {}) => ({
  telemetryVersion: 3,
  mode: 'maze-alpha',
  version: '1.0.0-alpha',
  subject: 'human',
  uptimeSeconds: 3600,
  population: { humans: 4, bots: 6, entities: {} },
  tick: {},
  totals: {},
  classes: [...family('rapid'), ...family('precision'), ...family('control'), ...family('impact')],
  modules: [
    { id: 'dash', label: 'Dash', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 },
    { id: 'repulse', label: 'Repulse', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 },
    { id: 'barrier', label: 'Barrier', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 },
    { id: 'repair', label: 'Repair', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 }
  ],
  frames: [
    { id: 'standard', label: 'Standard', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 },
    { id: 'reinforced', label: 'Reinforced', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 },
    { id: 'lightweight', label: 'Lightweight', picks: 100, kills: 100, deaths: 100, lives: 100, lifetimeSeconds: 3000 }
  ],
  ...overrides
});

const dumpOf = (source, options = OPTIONS) => buildDump(source, options, '2026-08-05T20:00:00.000Z', 'http://arena/metrics');

afterEach(() => {
  delete process.env.METRICS_URL;
  delete process.env.METRICS_TOKEN;
});

describe('balance-live arguments', () => {
  it('starts from sane defaults', () => {
    const options = parseArgs([]);
    expect(options.url).toBe('http://localhost:2567');
    expect(options.subject).toBe('human');
    expect(options.sort).toBe('pickRate');
    expect(options.peer).toBe('family');
    expect(options.json).toBe(false);
  });

  it('takes url and token from the environment', () => {
    process.env.METRICS_URL = 'https://mazers.de';
    process.env.METRICS_TOKEN = 'geheim';
    const options = parseArgs([]);
    expect(options.url).toBe('https://mazers.de');
    expect(options.token).toBe('geheim');
  });

  it('lets arguments win over the environment', () => {
    process.env.METRICS_TOKEN = 'aus-env';
    expect(parseArgs(['--token', 'aus-argument']).token).toBe('aus-argument');
  });

  it('accepts both --flag value and --flag=value', () => {
    expect(parseArgs(['--min-samples', '12']).minSamples).toBe(12);
    expect(parseArgs(['--min-samples=12']).minSamples).toBe(12);
    expect(parseArgs(['--sort=killsPerMinute', '--asc']).asc).toBe(true);
  });

  it('rejects nonsense instead of guessing', () => {
    expect(() => parseArgs(['--subject', 'menschen'])).toThrow(/subject/);
    expect(() => parseArgs(['--sort', 'winrate'])).toThrow(/sort/);
    expect(() => parseArgs(['--peer', 'klasse'])).toThrow(/peer/);
    expect(() => parseArgs(['--outlier-high', '0.9'])).toThrow(/outlier-high/);
    expect(() => parseArgs(['--outlier-low', '1.4'])).toThrow(/outlier-low/);
    expect(() => parseArgs(['--token'])).toThrow(/braucht einen Wert/);
    expect(() => parseArgs(['metrics'])).toThrow(/Unbekanntes Argument/);
  });
});

describe('balance-live target url', () => {
  it('appends the metrics path and the query the export needs', () => {
    expect(metricsUrl('http://localhost:2567', 'human'))
      .toBe('http://localhost:2567/metrics?format=json&subject=human');
  });

  it('keeps an explicit metrics path and overwrites the query', () => {
    expect(metricsUrl('https://mazers.de/metrics?format=text&subject=bot', 'all'))
      .toBe('https://mazers.de/metrics?format=json&subject=all');
  });

  it('assumes https for remote hosts and http only for local ones', () => {
    expect(metricsUrl('mazers.de')).toBe('https://mazers.de/metrics?format=json&subject=human');
    expect(metricsUrl('localhost:2567')).toBe('http://localhost:2567/metrics?format=json&subject=human');
  });

  it('names a broken address instead of throwing something cryptic', () => {
    expect(() => metricsUrl('http://')).toThrow(/keine gültige Adresse/);
  });
});

describe('balance-live fetch', () => {
  const respond = (init) => async () => init;

  it('sends the token as a bearer header', async () => {
    let seen = null;
    await fetchReport('http://arena/metrics', 'geheim', async (url, init) => {
      seen = init;
      return { ok: true, status: 200, json: async () => report() };
    });
    expect(seen.headers.authorization).toBe('Bearer geheim');
  });

  it('sends no authorization header without a token', async () => {
    let seen = null;
    await fetchReport('http://arena/metrics', '', async (url, init) => {
      seen = init;
      return { ok: true, status: 200, json: async () => report() };
    });
    expect(seen.headers.authorization).toBeUndefined();
  });

  it('translates the answers that actually happen', async () => {
    await expect(fetchReport('http://arena/metrics', '', respond({ ok: false, status: 401 })))
      .rejects.toThrow(/METRICS_TOKEN/);
    await expect(fetchReport('http://arena/metrics', '', respond({ ok: false, status: 404 })))
      .rejects.toThrow(/TELEMETRY_ENABLED/);
    await expect(fetchReport('http://arena/metrics', '', respond({ ok: false, status: 503 })))
      .rejects.toThrow(/503/);
    await expect(fetchReport('http://arena/metrics', '', respond({
      ok: true,
      status: 200,
      json: async () => { throw new Error('kein json'); }
    }))).rejects.toThrow(/kein JSON/);
    await expect(fetchReport('http://arena/metrics', '', respond({ ok: true, status: 200, json: async () => ({}) })))
      .rejects.toThrow(/keinen Telemetriebericht/);
    await expect(fetchReport('http://arena/metrics', '', async () => { throw new Error('ECONNREFUSED'); }))
      .rejects.toThrow(/nicht erreichbar/);
  });
});

describe('balance-live maths', () => {
  it('takes the middle of an even sample, not a neighbour', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('derives every rate from the raw counters', () => {
    const row = deriveRow(
      { id: 'x', label: 'X', picks: 25, kills: 30, deaths: 20, lives: 20, lifetimeSeconds: 600 },
      100
    );
    expect(row.pickRate).toBe(0.25);
    expect(row.killsPerDeath).toBe(1.5);
    expect(row.averageLifetimeSeconds).toBe(30);
    expect(row.killsPerMinute).toBe(3);
  });

  it('never divides by zero', () => {
    const empty = deriveRow({ id: 'x', label: 'X', picks: 0, kills: 0, deaths: 0, lives: 0, lifetimeSeconds: 0 }, 0);
    expect(empty.pickRate).toBe(0);
    expect(empty.killsPerDeath).toBe(0);
    expect(empty.averageLifetimeSeconds).toBe(0);
    expect(empty.killsPerMinute).toBe(0);
  });

  it('rolls classes up into their families', () => {
    const groups = buildGroups(report());
    expect(groups.families).toHaveLength(4);
    const rapid = groups.families.find((row) => row.id === 'rapid');
    expect(rapid.classes).toBe(7);
    expect(rapid.picks).toBe(700);
    expect(rapid.pickRate).toBeCloseTo(0.25, 5);
    expect(rapid.killsPerMinute).toBeCloseTo(2, 5);
  });

  it('sorts by any column in both directions and stays stable on ties', () => {
    const rows = [
      { id: 'b', pickRate: 0.2 },
      { id: 'a', pickRate: 0.2 },
      { id: 'c', pickRate: 0.5 }
    ];
    expect(sortRows(rows, 'pickRate', false).map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'pickRate', true).map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(sortRows(rows, 'id', true).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('formats a runtime a human can read', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(605)).toBe('10 min 05 s');
    expect(formatDuration(11_700)).toBe('3 h 15 min');
  });
});

describe('balance-live outliers', () => {
  it('leaves a balanced arena unmarked', () => {
    const dump = dumpOf(report());
    expect(dump.watchlist).toEqual([]);
  });

  it('marks a class above and below its family median', () => {
    const source = report();
    const strong = source.classes.find((entry) => entry.id === 'rapid4');
    const weak = source.classes.find((entry) => entry.id === 'rapid5');
    strong.kills = 300;
    weak.kills = 30;

    const dump = dumpOf(source);
    const hits = dump.watchlist.filter((hit) => hit.metric === 'killsPerDeath');
    expect(hits.map((hit) => hit.id).sort()).toEqual(['rapid4', 'rapid5']);
    expect(hits.find((hit) => hit.id === 'rapid4').mark).toBe('▲');
    expect(hits.find((hit) => hit.id === 'rapid5').mark).toBe('▼');
    expect(hits.find((hit) => hit.id === 'rapid4').factor).toBeCloseTo(3, 5);
    expect(hits.find((hit) => hit.id === 'rapid4').reference).toBe(1);
    expect(hits.find((hit) => hit.id === 'rapid4').peerLabel).toBe('Median Rapid');
  });

  it('compares against the family, not against the whole roster', () => {
    const source = report();
    // Ganz Impact spielt doppelt so stark – innerhalb der Familie fällt niemand
    // auf, im Gesamtfeld wäre jede einzelne Impact-Klasse ein Ausreißer.
    for (const entry of source.classes) if (entry.branch === 'impact') entry.kills = 200;

    const dump = dumpOf(source);
    expect(dump.watchlist.filter((hit) => hit.group === 'classes')).toEqual([]);
    const familyHit = dump.watchlist.find((hit) => hit.group === 'families' && hit.metric === 'killsPerDeath');
    expect(familyHit.id).toBe('impact');
    expect(familyHit.mark).toBe('▲');
  });

  it('compares against the tier when asked to', () => {
    const source = report();
    for (const entry of source.classes) if (entry.tier === 3) entry.kills = 200;

    const perFamily = dumpOf(source, { ...OPTIONS, peer: 'family' });
    const perTier = dumpOf(source, { ...OPTIONS, peer: 'tier' });
    // Je Familie sind die vier starken Tier-3-Klassen die Mehrheit und ziehen
    // den Median mit; je Tier vergleichen sie sich nur untereinander.
    expect(perFamily.watchlist.some((hit) => hit.group === 'classes' && hit.metric === 'killsPerDeath')).toBe(true);
    expect(perTier.watchlist.some((hit) => hit.group === 'classes' && hit.metric === 'killsPerDeath')).toBe(false);
  });

  it('keeps thin samples out of the median and off the watchlist', () => {
    const source = report();
    const newcomer = source.classes.find((entry) => entry.id === 'control7');
    newcomer.picks = 2;
    newcomer.kills = 8;
    newcomer.deaths = 1;
    newcomer.lives = 1;
    newcomer.lifetimeSeconds = 4;

    const dump = dumpOf(source);
    expect(dump.watchlist.some((hit) => hit.id === 'control7')).toBe(false);
    const row = dump.classes.find((entry) => entry.id === 'control7');
    expect(row.marks.killsPerDeath.mark).toBe('·');
    // Die anderen sechs Control-Klassen bleiben unbeeindruckt.
    expect(dump.watchlist.some((hit) => hit.id.startsWith('control'))).toBe(false);
  });

  it('honours custom thresholds', () => {
    const source = report();
    source.classes.find((entry) => entry.id === 'rapid4').kills = 120;
    expect(dumpOf(source).watchlist).toEqual([]);
    const strict = dumpOf(source, { ...OPTIONS, outlierHigh: 1.1, outlierLow: 0.9 });
    expect(strict.watchlist.some((hit) => hit.id === 'rapid4' && hit.metric === 'killsPerDeath')).toBe(true);
  });
});

describe('balance-live baseline', () => {
  const grown = (source, factor) => ({
    ...source,
    uptimeSeconds: source.uptimeSeconds + 1800,
    classes: source.classes.map((entry) => ({
      ...entry,
      picks: entry.picks * 2,
      kills: entry.kills + Math.round(entry.kills * factor(entry)),
      deaths: entry.deaths * 2,
      lives: entry.lives * 2,
      lifetimeSeconds: entry.lifetimeSeconds * 2
    })),
    modules: source.modules.map((entry) => ({ ...entry, picks: entry.picks * 2, kills: entry.kills * 2, deaths: entry.deaths * 2, lives: entry.lives * 2, lifetimeSeconds: entry.lifetimeSeconds * 2 })),
    frames: source.frames.map((entry) => ({ ...entry, picks: entry.picks * 2, kills: entry.kills * 2, deaths: entry.deaths * 2, lives: entry.lives * 2, lifetimeSeconds: entry.lifetimeSeconds * 2 }))
  });

  it('reads only the window between two dumps when the server kept running', () => {
    const before = dumpOf(report());
    // Im zweiten Fenster halbiert Rapid seine Kills, alle anderen bleiben gleich.
    const after = dumpOf(grown(report(), (entry) => (entry.branch === 'rapid' ? 0.5 : 1)));

    const diff = diffDumps(before, after, OPTIONS);
    expect(diff.mode).toBe('interval');
    expect(diff.restarted).toBe(false);
    expect(diff.windowSeconds).toBe(1800);

    const rapid = diff.classes.find((row) => row.id === 'rapid1');
    expect(rapid.kills).toBe(50);
    expect(rapid.deaths).toBe(100);
    expect(rapid.killsPerDeath).toBe(0.5);
    expect(rapid.delta.killsPerDeath).toBeCloseTo(-0.5, 5);

    const control = diff.classes.find((row) => row.id === 'control1');
    expect(control.killsPerDeath).toBe(1);
    expect(control.delta.killsPerDeath).toBe(0);
  });

  it('falls back to a plain comparison when the counters restarted', () => {
    const before = dumpOf(report({ uptimeSeconds: 7200 }));
    const after = dumpOf(report({ uptimeSeconds: 120 }));
    const diff = diffDumps(before, after, OPTIONS);
    expect(diff.mode).toBe('compare');
    expect(diff.restarted).toBe(true);
    expect(diff.classes.find((row) => row.id === 'rapid1').kills).toBe(100);
  });

  it('spots a restart even when the uptime looks fine', () => {
    const before = dumpOf(report());
    const shrunk = report({ uptimeSeconds: 5400 });
    shrunk.classes.find((entry) => entry.id === 'rapid1').kills = 10;
    const diff = diffDumps(before, dumpOf(shrunk), OPTIONS);
    expect(diff.mode).toBe('compare');
  });

  it('marks rows the baseline did not know as new', () => {
    const before = dumpOf(report({ classes: report().classes.filter((entry) => entry.id !== 'impact7') }));
    const diff = diffDumps(before, dumpOf(report()), OPTIONS);
    expect(diff.classes.find((row) => row.id === 'impact7').delta).toBeNull();
    expect(formatReport(dumpOf(report()), OPTIONS, diff)).toContain('neu');
  });

  it('refuses anything that is not one of its own dumps', async () => {
    await expect(loadBaseline('x.json', async () => 'kein json')).rejects.toThrow(/kein JSON/);
    await expect(loadBaseline('x.json', async () => '{"tool":"etwas-anderes"}')).rejects.toThrow(/kein Abzug/);
    await expect(loadBaseline('x.json', async () => JSON.stringify({ tool: 'maze-balance-live', formatVersion: 99, classes: [] })))
      .rejects.toThrow(/Format 99/);
    await expect(loadBaseline('x.json', async () => { throw new Error('ENOENT'); })).rejects.toThrow(/nicht lesbar/);
  });

  it('survives a round trip through JSON', async () => {
    const dump = dumpOf(report());
    const restored = await loadBaseline('x.json', async () => JSON.stringify(dump));
    expect(diffDumps(restored, dumpOf(grown(report(), () => 1)), OPTIONS).mode).toBe('interval');
  });
});

describe('balance-live report', () => {
  it('prints every section with aligned columns', () => {
    const source = report();
    source.classes.find((entry) => entry.id === 'rapid4').kills = 300;
    const text = formatReport(dumpOf(source), OPTIONS);

    for (const section of ['KLASSEN', 'FAMILIEN', 'CORE MODULES', 'FRAMES', 'WATCHLIST']) {
      expect(text).toContain(section);
    }
    expect(text).toContain('http://arena/metrics');
    expect(text).toContain('1 h 00 min');
    expect(text).toContain('RAPID4');

    const table = text.split('\n').slice(text.split('\n').indexOf('KLASSEN  (nach Pickrate)') + 2);
    const widths = new Set(table.slice(0, 30).filter((line) => line.startsWith('  ')).map((line) => line.length));
    expect(widths.size).toBe(1);
  });

  it('says so when nothing is off', () => {
    expect(formatReport(dumpOf(report()), OPTIONS)).toContain('Keine Auffälligkeiten');
  });

  it('warns when the instance is too old to deliver family and lifetime', () => {
    const text = formatReport(dumpOf(report({ telemetryVersion: 2 })), OPTIONS);
    expect(text).toContain('Telemetrie v2');
    expect(text).toContain('ab v3');
  });

  it('shows the window and the biggest movers with a baseline', () => {
    const before = dumpOf(report());
    const after = dumpOf({
      ...report(),
      uptimeSeconds: 5400,
      classes: report().classes.map((entry) => ({
        ...entry,
        picks: entry.picks + (entry.branch === 'impact' ? 400 : 20),
        kills: entry.kills * 2,
        deaths: entry.deaths * 2,
        lives: entry.lives * 2,
        lifetimeSeconds: entry.lifetimeSeconds * 2
      }))
    });
    const text = formatReport(after, OPTIONS, diffDumps(before, after, OPTIONS));
    expect(text).toContain('ZEITFENSTER seit 2026-08-05T20:00:00.000Z');
    expect(text).toContain('GRÖSSTE BEWEGUNGEN');
    expect(text).toContain('IMPACT1');
    expect(text).toMatch(/[+−]\d+\.\d pp/);
  });

  it('hides rows that did not move in the window and says how many', () => {
    const before = dumpOf(report());
    const after = dumpOf({
      ...report(),
      uptimeSeconds: 5400,
      classes: report().classes.map((entry) => (entry.id === 'rapid1'
        ? { ...entry, picks: entry.picks + 40, kills: entry.kills + 10, deaths: entry.deaths + 10, lives: entry.lives + 10, lifetimeSeconds: entry.lifetimeSeconds + 300 }
        : { ...entry }))
    });
    const diff = diffDumps(before, after, OPTIONS);

    const text = formatReport(after, OPTIONS, diff);
    expect(text).toContain('27 Zeile(n) ohne Bewegung ausgeblendet');
    expect(text).toContain('Keine Bewegung im Fenster.');

    const complete = formatReport(after, { ...OPTIONS, all: true }, diff);
    expect(complete).not.toContain('ausgeblendet');
    expect(complete).toContain('IMPACT7');
  });

  it('sorts a zero value to the top of the watchlist without losing its order', () => {
    const source = report();
    for (const id of ['rapid4', 'rapid5']) source.classes.find((entry) => entry.id === id).kills = 0;
    const hits = dumpOf(source).watchlist.filter((hit) => hit.metric === 'killsPerDeath');
    expect(hits.slice(0, 2).map((hit) => hit.id)).toEqual(['rapid4', 'rapid5']);
    expect(hits.every((hit) => Number.isFinite(hit.factor))).toBe(true);
  });

  it('flags a restart in the printed report instead of pretending', () => {
    const before = dumpOf(report({ uptimeSeconds: 7200 }));
    const after = dumpOf(report({ uptimeSeconds: 120 }));
    const text = formatReport(after, OPTIONS, diffDumps(before, after, OPTIONS));
    expect(text).toContain('VERGLEICH mit');
    expect(text).toContain('neu gestartet');
  });
});
