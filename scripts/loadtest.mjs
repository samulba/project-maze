#!/usr/bin/env node
/**
 * Project Maze – Lasttest.
 *
 * Simuliert N WebSocket-Clients gegen eine laufende Arena: jeder joint, sendet
 * plausible Eingaben mit der Tickrate und wählt gelegentlich Upgrades und
 * Klassen. Gemessen werden Join-Erfolg, Snapshot-Latenz und Abbrüche – also
 * genau das, was beantwortet, wie viele Spieler eine Instanz trägt.
 *
 *   npm run loadtest -- --clients 50 --duration 30
 *   npm run loadtest -- --url wss://maze.example.com --clients 80 --json
 *
 * Exit-Code 1, sobald ein Client unerwartet scheitert (Verbindungsfehler,
 * ausbleibender Join, Abbruch während des Laufs). Eine volle Arena ist kein
 * Fehler, sondern ein Messergebnis und wird separat ausgewiesen.
 */

import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  url: 'ws://localhost:2567',
  clients: 20,
  duration: 30,
  rate: 40,
  ramp: 2,
  json: false
};

/** Obergrenze je Messreihe, damit sehr lange Läufe nicht den Speicher fluten. */
const MAX_SAMPLES = 500_000;

const NUMERIC_OPTIONS = new Set(['clients', 'duration', 'rate', 'ramp']);

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unbekanntes Argument: ${token}`);
    const [flag, inlineValue] = token.slice(2).split('=', 2);
    const key = flag.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    if (key === 'json') {
      options.json = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    if (key === 'help') {
      options.help = true;
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
  if (options.clients < 1) throw new Error('--clients braucht mindestens 1');
  if (options.rate < 1) throw new Error('--rate braucht mindestens 1');
  return options;
}

/** Nearest-Rank-Quantil über eine aufsteigend sortierte Liste. */
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank];
}

export function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    average: sorted.length > 0 ? total / sorted.length : 0,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.length > 0 ? sorted[sorted.length - 1] : 0
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const push = (list, value) => { if (list.length < MAX_SAMPLES) list.push(value); };

async function resolveWebSocket() {
  if (typeof globalThis.WebSocket === 'function') return globalThis.WebSocket;
  const module = await import('ws');
  return module.default ?? module.WebSocket;
}

async function resolveShared() {
  try {
    return await import('../packages/shared/dist/index.js');
  } catch {
    throw new Error(
      'packages/shared ist nicht gebaut. Bitte "npm run loadtest" verwenden oder vorher '
      + '"npm run build -w @project-maze/shared" ausführen.'
    );
  }
}

/**
 * Plausible Eingabe: gerichteter Random Walk statt Zufallsrauschen, damit die
 * Simulation dieselbe Arbeit leistet wie bei echten Spielern (Kollisionen,
 * Sichtbarkeit, Projektile).
 */
function nextInput(client, maxAim) {
  client.heading += (Math.random() - 0.5) * 0.6;
  client.aimAngle += (Math.random() - 0.5) * 0.9;
  if (Math.random() < 0.02) client.firing = !client.firing;
  const aimDistance = 180 + Math.random() * (maxAim - 180);
  return {
    type: 'input',
    sequence: ++client.sequence,
    move: { x: Math.cos(client.heading), y: Math.sin(client.heading) },
    aim: { x: Math.cos(client.aimAngle) * aimDistance, y: Math.sin(client.aimAngle) * aimDistance },
    primary: client.firing,
    secondary: false
  };
}

export async function runLoadTest(options, hooks = {}) {
  const WebSocketImpl = await resolveWebSocket();
  const shared = await resolveShared();
  const { GAME, UPGRADE_IDS, availableClassChoices } = shared;
  const log = hooks.log ?? (() => {});

  const stats = {
    joined: 0,
    rejectedArenaFull: 0,
    connectionErrors: 0,
    rejectedJoins: 0,
    droppedDuringRun: 0,
    closeCodes: {},
    snapshots: 0,
    inputsSent: 0,
    upgradesSent: 0,
    classChoicesSent: 0,
    bytesReceived: 0,
    latency: [],
    interval: [],
    rtt: [],
    joinMs: []
  };

  let measuring = false;
  const clients = [];

  const createClient = (index) => {
    const client = {
      index,
      socket: null,
      joined: false,
      finished: false,
      closingByUs: false,
      selfId: null,
      level: 1,
      playerClass: 'core',
      sequence: 0,
      heading: Math.random() * Math.PI * 2,
      aimAngle: Math.random() * Math.PI * 2,
      firing: Math.random() < 0.6,
      lastSnapshotAt: 0,
      bestRtt: Infinity,
      clockOffset: 0,
      startedAt: Date.now()
    };
    clients.push(client);

    const socket = new WebSocketImpl(options.url);
    client.socket = socket;

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'join', name: `Load${index + 1}` }));
    });

    socket.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data);
      stats.bytesReceived += raw.length;
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      if (message.type === 'welcome') {
        client.joined = true;
        client.selfId = message.selfId;
        stats.joined += 1;
        push(stats.joinMs, Date.now() - client.startedAt);
        socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
        return;
      }
      if (message.type === 'error') {
        if (String(message.message).includes('voll')) stats.rejectedArenaFull += 1;
        else stats.rejectedJoins += 1;
        client.finished = true;
        return;
      }
      if (message.type === 'pong') {
        const now = Date.now();
        const rtt = now - message.sentAt;
        if (measuring) push(stats.rtt, rtt);
        if (rtt < client.bestRtt) {
          client.bestRtt = rtt;
          // NTP-Prinzip: der Serverzeitstempel gehört zur Clientzeit sentAt + rtt/2.
          client.clockOffset = message.serverTime - (message.sentAt + rtt / 2);
        }
        return;
      }
      if (message.type !== 'snapshot') return;

      stats.snapshots += 1;
      const now = Date.now();
      if (measuring) {
        if (client.lastSnapshotAt > 0) push(stats.interval, now - client.lastSnapshotAt);
        if (client.bestRtt < Infinity && typeof message.serverTime === 'number') {
          push(stats.latency, Math.max(0, now - (message.serverTime - client.clockOffset)));
        }
      }
      client.lastSnapshotAt = now;
      const self = message.players?.find((player) => player.id === client.selfId);
      if (self) {
        client.level = self.level;
        client.playerClass = self.playerClass;
        client.availablePoints = self.availablePoints ?? 0;
        if (self.dead) socket.send(JSON.stringify({ type: 'respawn' }));
      }
    });

    socket.addEventListener('close', (event) => {
      // Der eigene Abbau am Ende des Laufs ist kein Abbruch.
      if (!client.closingByUs) {
        stats.closeCodes[event?.code ?? 0] = (stats.closeCodes[event?.code ?? 0] ?? 0) + 1;
        if (client.joined && !client.finished) stats.droppedDuringRun += 1;
      }
      client.finished = true;
      client.joined = false;
    });

    socket.addEventListener('error', () => {
      if (!client.joined && !client.finished) stats.connectionErrors += 1;
      client.finished = true;
    });
  };

  const rampDelay = options.clients > 1 ? (options.ramp * 1000) / options.clients : 0;
  for (let index = 0; index < options.clients; index += 1) {
    createClient(index);
    if (rampDelay > 0) await sleep(rampDelay);
  }
  log(`${clients.length} Clients verbunden, Messfenster startet.`);
  measuring = true;
  const measureStartedAt = Date.now();

  const isLive = (client) => client.joined && client.socket.readyState === 1;

  const inputTimer = setInterval(() => {
    for (const client of clients) {
      if (!isLive(client)) continue;
      client.socket.send(JSON.stringify(nextInput(client, GAME.maxAimDistance)));
      stats.inputsSent += 1;
    }
  }, 1000 / options.rate);

  const pingTimer = setInterval(() => {
    for (const client of clients) {
      if (!isLive(client)) continue;
      client.socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
    }
  }, 1000);

  const progressTimer = setInterval(() => {
    for (const client of clients) {
      if (!isLive(client)) continue;
      if ((client.availablePoints ?? 0) > 0) {
        const upgrade = UPGRADE_IDS[Math.floor(Math.random() * UPGRADE_IDS.length)];
        client.socket.send(JSON.stringify({ type: 'upgrade', upgrade }));
        stats.upgradesSent += 1;
      }
      const choices = availableClassChoices(client.playerClass, client.level);
      if (choices.length > 0) {
        const target = choices[Math.floor(Math.random() * choices.length)];
        client.socket.send(JSON.stringify({ type: 'chooseClass', playerClass: target }));
        stats.classChoicesSent += 1;
      }
    }
  }, 2000);

  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop);

  const endsAt = measureStartedAt + options.duration * 1000;
  while (!stopped && Date.now() < endsAt) await sleep(100);

  clearInterval(inputTimer);
  clearInterval(pingTimer);
  clearInterval(progressTimer);
  process.off('SIGINT', stop);

  const measuredSeconds = Math.max(0.001, (Date.now() - measureStartedAt) / 1000);
  const stillLive = clients.filter(isLive).length;
  for (const client of clients) {
    client.closingByUs = true;
    if (client.socket.readyState === 0 || client.socket.readyState === 1) client.socket.close(1000, 'loadtest done');
  }
  await sleep(250);

  return {
    target: options.url,
    requestedClients: options.clients,
    rampSeconds: options.ramp,
    inputRateHz: options.rate,
    measuredSeconds: Number(measuredSeconds.toFixed(2)),
    stoppedEarly: stopped,
    connections: {
      joined: stats.joined,
      joinRate: options.clients > 0 ? stats.joined / options.clients : 0,
      liveAtEnd: stillLive,
      rejectedArenaFull: stats.rejectedArenaFull,
      connectionErrors: stats.connectionErrors,
      rejectedJoins: stats.rejectedJoins,
      droppedDuringRun: stats.droppedDuringRun,
      closeCodes: stats.closeCodes
    },
    throughput: {
      snapshots: stats.snapshots,
      snapshotsPerClientPerSecond: stats.joined > 0
        ? Number((stats.snapshots / stats.joined / measuredSeconds).toFixed(2))
        : 0,
      inputsSent: stats.inputsSent,
      upgradesSent: stats.upgradesSent,
      classChoicesSent: stats.classChoicesSent,
      megabytesReceived: Number((stats.bytesReceived / 1024 / 1024).toFixed(2)),
      kilobytesPerClientPerSecond: stats.joined > 0
        ? Number((stats.bytesReceived / 1024 / stats.joined / measuredSeconds).toFixed(1))
        : 0
    },
    latencyMs: summarize(stats.latency),
    snapshotIntervalMs: summarize(stats.interval),
    rttMs: summarize(stats.rtt),
    joinMs: summarize(stats.joinMs)
  };
}

const ms = (value) => `${value.toFixed(1)} ms`.padStart(9, ' ');

function formatRow(label, series) {
  return [
    `  ${label.padEnd(10, ' ')}`,
    ms(series.p50),
    ms(series.p95),
    ms(series.p99),
    ms(series.max)
  ].join('');
}

export function formatReport(report) {
  const lines = [];
  const percent = (value) => `${(value * 100).toFixed(1)} %`;
  lines.push('', 'PROJECT MAZE — LASTTEST', '');
  lines.push(`  Ziel          ${report.target}`);
  lines.push(`  Clients       ${report.requestedClients} (Ramp ${report.rampSeconds.toFixed(1)} s)`);
  lines.push(`  Messfenster   ${report.measuredSeconds.toFixed(1)} s${report.stoppedEarly ? ' (vorzeitig gestoppt)' : ''}`);
  lines.push(`  Input-Rate    ${report.inputRateHz} Hz`);

  const c = report.connections;
  lines.push('', 'VERBINDUNGEN', '');
  lines.push(`  Join erfolgreich          ${c.joined} / ${report.requestedClients}  (${percent(c.joinRate)})`);
  lines.push(`  Am Ende noch verbunden    ${c.liveAtEnd}`);
  lines.push(`  Abgewiesen (Arena voll)   ${c.rejectedArenaFull}`);
  lines.push(`  Abbrüche während des Laufs ${c.droppedDuringRun}`);
  lines.push(`  Verbindungsfehler         ${c.connectionErrors}`);
  if (c.rejectedJoins > 0) lines.push(`  Abgelehnte Joins          ${c.rejectedJoins}`);
  const codes = Object.entries(c.closeCodes);
  lines.push(`  Unerwartete Close-Codes   ${codes.length > 0 ? codes.map(([code, count]) => `${code}×${count}`).join(', ') : 'keine'}`);

  const t = report.throughput;
  lines.push('', 'DURCHSATZ', '');
  lines.push(`  Snapshots empfangen       ${t.snapshots} (${t.snapshotsPerClientPerSecond}/s je Client)`);
  lines.push(`  Inputs gesendet           ${t.inputsSent}`);
  lines.push(`  Upgrades / Klassenwahlen  ${t.upgradesSent} / ${t.classChoicesSent}`);
  lines.push(`  Empfangen                 ${t.megabytesReceived} MB (${t.kilobytesPerClientPerSecond} KB/s je Client)`);

  lines.push('', 'LATENZ', '');
  lines.push(`  ${''.padEnd(10, ' ')}${'p50'.padStart(9, ' ')}${'p95'.padStart(9, ' ')}${'p99'.padStart(9, ' ')}${'max'.padStart(9, ' ')}`);
  lines.push(formatRow('Snapshot', report.latencyMs));
  lines.push(formatRow('Abstand', report.snapshotIntervalMs));
  lines.push(formatRow('RTT', report.rttMs));
  lines.push(formatRow('Join', report.joinMs));
  lines.push('');
  lines.push('  Snapshot = uhrversatzkorrigiertes Alter beim Eintreffen, Abstand = Lücke');
  lines.push(`  zwischen zwei Snapshots (Soll ~${(1000 / 30).toFixed(0)} ms bei 30 Hz).`);
  lines.push('');
  return lines.join('\n');
}

/** Exit-Code: 1, sobald Clients unerwartet scheitern. Volle Arena zählt nicht. */
export function exitCodeFor(report) {
  const c = report.connections;
  const unexpected = c.connectionErrors + c.rejectedJoins + c.droppedDuringRun;
  const expectedJoins = report.requestedClients - c.rejectedArenaFull;
  return unexpected > 0 || c.joined < expectedJoins ? 1 : 0;
}

const HELP = `Project Maze – Lasttest

  node scripts/loadtest.mjs [Optionen]

  --url <ws-url>     Zielserver          (Default ${DEFAULTS.url})
  --clients <n>      Parallele Clients   (Default ${DEFAULTS.clients})
  --duration <s>     Messfenster         (Default ${DEFAULTS.duration})
  --rate <hz>        Input-Rate          (Default ${DEFAULTS.rate})
  --ramp <s>         Verteilung der Joins(Default ${DEFAULTS.ramp})
  --json             Nur JSON ausgeben
  --help             Diese Hilfe
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

  const report = await runLoadTest(options, {
    log: (message) => { if (!options.json) console.log(message); }
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exit(exitCodeFor(report));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(2);
  });
}
