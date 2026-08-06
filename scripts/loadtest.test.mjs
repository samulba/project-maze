import { describe, expect, it } from 'vitest';
import {
  clientRandom,
  exitCodeFor,
  formatReport,
  mulberry32,
  parseArgs,
  quantile,
  readSelf,
  summarize
} from './loadtest.mjs';

const report = (overrides = {}) => ({
  target: 'ws://localhost:2567',
  requestedClients: 10,
  rampSeconds: 2,
  inputRateHz: 40,
  measuredSeconds: 30,
  stoppedEarly: false,
  connections: {
    joined: 10,
    joinRate: 1,
    liveAtEnd: 10,
    rejectedArenaFull: 0,
    connectionErrors: 0,
    rejectedJoins: 0,
    droppedDuringRun: 0,
    closeCodes: {},
    ...overrides.connections
  },
  throughput: {
    snapshots: 9000,
    snapshotsPerClientPerSecond: 30,
    inputsSent: 12000,
    upgradesSent: 40,
    classChoicesSent: 2,
    megabytesReceived: 12.5,
    kilobytesPerClientPerSecond: 42.7
  },
  latencyMs: summarize([4, 8, 12]),
  snapshotIntervalMs: summarize([33, 34, 35]),
  rttMs: summarize([2, 3, 4]),
  joinMs: summarize([5, 6, 7])
});

describe('loadtest arguments', () => {
  it('falls back to a local arena with sane defaults', () => {
    const options = parseArgs([]);
    expect(options.url).toBe('ws://localhost:2567');
    expect(options.clients).toBe(20);
    expect(options.rate).toBe(40);
    expect(options.json).toBe(false);
  });

  it('accepts both --flag value and --flag=value', () => {
    const options = parseArgs(['--url', 'wss://arena.example.com', '--clients=64', '--duration', '5', '--json']);
    expect(options.url).toBe('wss://arena.example.com');
    expect(options.clients).toBe(64);
    expect(options.duration).toBe(5);
    expect(options.json).toBe(true);
  });

  it('rejects nonsense instead of load-testing with it', () => {
    expect(() => parseArgs(['--clients', 'viele'])).toThrow(/Zahl/);
    expect(() => parseArgs(['--clients', '0'])).toThrow(/mindestens 1/);
    expect(() => parseArgs(['--rate', '0'])).toThrow(/mindestens 1/);
    expect(() => parseArgs(['--unbekannt', '1'])).toThrow(/Unbekannte Option/);
    expect(() => parseArgs(['clients'])).toThrow(/Unbekanntes Argument/);
    expect(() => parseArgs(['--url'])).toThrow(/braucht einen Wert/);
  });
});

describe('loadtest seed', () => {
  it('leaves the clients on Math.random when no seed is given', () => {
    expect(parseArgs([]).seed).toBeUndefined();
    expect(clientRandom(undefined, 0)).toBe(Math.random);
  });

  it('accepts a seed like any other numeric option', () => {
    expect(parseArgs(['--seed', '42']).seed).toBe(42);
    expect(parseArgs(['--seed=7']).seed).toBe(7);
  });

  it('repeats the same sequence for the same seed', () => {
    const draw = (seed) => Array.from({ length: 8 }, mulberry32(seed));
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it('stays inside [0,1) so index arithmetic can never leave the array', () => {
    const rnd = mulberry32(12345);
    for (let index = 0; index < 5_000; index += 1) {
      const value = rnd();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('gives each client its own stream, so join order cannot shuffle the draw', () => {
    // Ein gemeinsamer Strom waere wertlos: Wer zuerst zieht, haengt daran, in
    // welcher Reihenfolge die Sockets antworten - genau das Timing, das ein
    // Seed nicht kontrolliert.
    const first = clientRandom(1000, 0);
    const second = clientRandom(1000, 1);
    expect(Array.from({ length: 5 }, first)).not.toEqual(Array.from({ length: 5 }, second));

    // Derselbe Client zieht dieselbe Folge, egal wann er drankommt.
    expect(Array.from({ length: 5 }, clientRandom(1000, 3)))
      .toEqual(Array.from({ length: 5 }, clientRandom(1000, 3)));
  });
});

describe('loadtest statistics', () => {
  it('uses nearest-rank quantiles', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(sorted, 0.5)).toBe(5);
    expect(quantile(sorted, 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
    expect(quantile([7], 0.99)).toBe(7);
  });

  it('summarizes an unsorted series without mutating it', () => {
    const samples = [30, 10, 20];
    const summary = summarize(samples);
    expect(samples).toEqual([30, 10, 20]);
    expect(summary).toMatchObject({ count: 3, average: 20, p50: 20, max: 30 });
  });

  it('reports zeros for an empty series instead of NaN', () => {
    expect(summarize([])).toMatchObject({ count: 0, average: 0, p50: 0, p95: 0, max: 0 });
  });
});

describe('loadtest verdict', () => {
  it('passes a clean run', () => {
    expect(exitCodeFor(report())).toBe(0);
  });

  it('treats a full arena as a result, not a failure', () => {
    expect(exitCodeFor(report({ connections: { joined: 40, rejectedArenaFull: 5 }, }))).toBe(0);
  });

  it('fails on drops, connection errors and missing joins', () => {
    expect(exitCodeFor(report({ connections: { droppedDuringRun: 1 } }))).toBe(1);
    expect(exitCodeFor(report({ connections: { connectionErrors: 2 } }))).toBe(1);
    expect(exitCodeFor(report({ connections: { joined: 7 } }))).toBe(1);
  });
});

describe('loadtest report', () => {
  it('names the target, the join rate and every latency series', () => {
    const text = formatReport(report());
    expect(text).toContain('ws://localhost:2567');
    expect(text).toContain('10 / 10  (100.0 %)');
    expect(text).toContain('Unerwartete Close-Codes   keine');
    for (const label of ['Snapshot', 'Abstand', 'RTT', 'Join']) expect(text).toContain(label);
  });

  it('surfaces unexpected close codes', () => {
    const text = formatReport(report({ connections: { closeCodes: { 1006: 3 } } }));
    expect(text).toContain('1006×3');
  });
});

describe('loadtest self tracking', () => {
  const client = (overrides = {}) => ({
    selfId: 'uuid-self', level: 1, playerClass: 'core', availablePoints: 0, dead: false, ...overrides
  });
  const player = (overrides = {}) => ({
    id: 'uuid-self', level: 12, playerClass: 'rapid', availablePoints: 3, dead: false, ...overrides
  });

  it('reads level, class, points and death from a full snapshot', () => {
    const c = client();
    expect(readSelf(c, { selfId: 'uuid-self', players: [player()] })).not.toBeNull();
    expect(c).toMatchObject({ level: 12, playerClass: 'rapid', availablePoints: 3, dead: false });
  });

  it('follows the id the snapshot names, not the one from the welcome', () => {
    // SHORT_NET_IDS nummeriert alle Entitäten durch – auch selfId. Die
    // welcome-Nachricht trägt weiterhin die UUID. Wer daran festhält, findet
    // sich nie im Snapshot und bleibt für immer Level 1.
    const c = client();
    const self = readSelf(c, { selfId: 7, players: [{ ...player(), id: 7 }, { ...player(), id: 8 }] });
    expect(self).not.toBeNull();
    expect(c.selfId).toBe(7);
    expect(c.level).toBe(12);
  });

  it('keeps the last known value when a delta leaves the field out', () => {
    // SNAPSHOT_DELTAS lässt playerClass weg, solange sie unverändert ist.
    // Fehlend heißt unverändert – nicht undefined.
    const c = client();
    readSelf(c, { selfId: 'uuid-self', players: [player({ playerClass: 'sniper' })] });
    expect(c.playerClass).toBe('sniper');

    readSelf(c, { selfId: 'uuid-self', players: [{ id: 'uuid-self', level: 13, availablePoints: 1, dead: false }] });
    expect(c.playerClass).toBe('sniper');
    expect(c.level).toBe(13);
  });

  it('reports no self when the own tank is not in the snapshot', () => {
    const c = client();
    expect(readSelf(c, { selfId: 'uuid-self', players: [{ ...player(), id: 'jemand-anders' }] })).toBeNull();
    expect(readSelf(c, { selfId: 'uuid-self' })).toBeNull();
    expect(c.level).toBe(1);
  });

  it('survives a snapshot without selfId', () => {
    const c = client();
    readSelf(c, { players: [player()] });
    expect(c.selfId).toBe('uuid-self');
    expect(c.level).toBe(12);
  });

  it('notices death and recovery', () => {
    const c = client();
    readSelf(c, { selfId: 'uuid-self', players: [player({ dead: true })] });
    expect(c.dead).toBe(true);
    readSelf(c, { selfId: 'uuid-self', players: [player({ dead: false })] });
    expect(c.dead).toBe(false);
  });
});
