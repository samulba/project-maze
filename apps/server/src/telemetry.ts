import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  CLASS_DEFINITIONS,
  PLAYER_CLASS_IDS,
  type PlayerClass,
  type PlayerSnapshot,
  type WorldSnapshot
} from '@project-maze/shared';
import { classTier, type ClassTier } from '@project-maze/shared/balance';
import {
  ACTIVE_MODULE_DEFINITIONS,
  ACTIVE_MODULE_IDS,
  PASSIVE_MODIFIER_DEFINITIONS,
  PASSIVE_MODIFIER_IDS,
  type ActiveModuleId,
  type GameplayWorldExtension,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';

/**
 * Anonyme Server-Telemetrie als eigenständige Tuning-Schicht.
 *
 * Gesammelt werden ausschließlich aggregierte Balance-Kennzahlen je Klasse,
 * Core Module und passivem Frame: Pickraten, Lebensdauer, Kills und Deaths.
 * Es werden zu keinem Zeitpunkt Spieler-IDs, Namen, Adressen oder Zeitstempel
 * einzelner Personen gespeichert oder exportiert – die Spieler-IDs im
 * Laufzeit-Ledger existieren nur im Arbeitsspeicher, um Wechsel zu erkennen,
 * und verlassen den Prozess nie.
 */

const TELEMETRY_VERSION = 1;
const SERVER_MODE = 'maze-alpha';
const SERVER_VERSION = '1.0.0-alpha';
/** Round-Robin-Abstand für die Loadout-Erhebung (ein Spieler pro Intervall). */
const LOADOUT_SAMPLE_INTERVAL_MS = 250;

export type TelemetrySubject = 'human' | 'bot';
export type TelemetrySubjectFilter = TelemetrySubject | 'all';

const SUBJECTS: readonly TelemetrySubject[] = ['human', 'bot'];

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface TelemetryInternals {
  players: Map<string, RuntimePlayer>;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}

interface LoadoutObservation {
  activeModule: ActiveModuleId;
  passiveModifier: PassiveModifierId;
}

interface LifeStat {
  lives: number;
  seconds: number;
  longestSeconds: number;
}

type Counter = Map<string, number>;

interface TelemetryState {
  startedAt: number;
  classPicks: Counter;
  modulePicks: Counter;
  framePicks: Counter;
  classKills: Counter;
  classDeaths: Counter;
  moduleKills: Counter;
  moduleDeaths: Counter;
  frameKills: Counter;
  frameDeaths: Counter;
  lifetimes: Map<string, LifeStat>;
  /** Laufzeit-Ledger: letzter beobachteter Zustand je Spieler (nie exportiert). */
  loadouts: Map<string, LoadoutObservation>;
  lifeStartedAt: Map<string, number>;
  lastSampleAt: number;
  sampleCursor: number;
}

const states = new WeakMap<MazeGame, TelemetryState>();

const createState = (now: number): TelemetryState => ({
  startedAt: now,
  classPicks: new Map(),
  modulePicks: new Map(),
  framePicks: new Map(),
  classKills: new Map(),
  classDeaths: new Map(),
  moduleKills: new Map(),
  moduleDeaths: new Map(),
  frameKills: new Map(),
  frameDeaths: new Map(),
  lifetimes: new Map(),
  loadouts: new Map(),
  lifeStartedAt: new Map(),
  lastSampleAt: 0,
  sampleCursor: -1
});

const stateFor = (game: MazeGame, now = Date.now()): TelemetryState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = createState(now);
  states.set(game, created);
  return created;
};

const counterKey = (subject: TelemetrySubject, id: string): string => `${subject}|${id}`;
const subjectOf = (player: PlayerSnapshot): TelemetrySubject => (player.isBot ? 'bot' : 'human');

const bump = (counter: Counter, subject: TelemetrySubject, id: string, by = 1): void => {
  const key = counterKey(subject, id);
  counter.set(key, (counter.get(key) ?? 0) + by);
};

const readCounter = (counter: Counter, filter: TelemetrySubjectFilter, id: string): number => {
  if (filter !== 'all') return counter.get(counterKey(filter, id)) ?? 0;
  return SUBJECTS.reduce((total, subject) => total + (counter.get(counterKey(subject, id)) ?? 0), 0);
};

const addLifetime = (state: TelemetryState, subject: TelemetrySubject, playerClass: PlayerClass, seconds: number): void => {
  const key = counterKey(subject, playerClass);
  const existing = state.lifetimes.get(key) ?? { lives: 0, seconds: 0, longestSeconds: 0 };
  existing.lives += 1;
  existing.seconds += seconds;
  existing.longestSeconds = Math.max(existing.longestSeconds, seconds);
  state.lifetimes.set(key, existing);
};

const readLifetime = (state: TelemetryState, filter: TelemetrySubjectFilter, playerClass: PlayerClass): LifeStat => {
  const subjects = filter === 'all' ? SUBJECTS : [filter];
  return subjects.reduce<LifeStat>((total, subject) => {
    const entry = state.lifetimes.get(counterKey(subject, playerClass));
    if (!entry) return total;
    return {
      lives: total.lives + entry.lives,
      seconds: total.seconds + entry.seconds,
      longestSeconds: Math.max(total.longestSeconds, entry.longestSeconds)
    };
  }, { lives: 0, seconds: 0, longestSeconds: 0 });
};

function observeLoadout(
  state: TelemetryState,
  player: PlayerSnapshot,
  activeModule: ActiveModuleId,
  passiveModifier: PassiveModifierId
): void {
  const subject = subjectOf(player);
  const previous = state.loadouts.get(player.id);
  if (!previous) {
    state.loadouts.set(player.id, { activeModule, passiveModifier });
    bump(state.modulePicks, subject, activeModule);
    bump(state.framePicks, subject, passiveModifier);
    return;
  }
  if (previous.activeModule !== activeModule) {
    previous.activeModule = activeModule;
    bump(state.modulePicks, subject, activeModule);
  }
  if (previous.passiveModifier !== passiveModifier) {
    previous.passiveModifier = passiveModifier;
    bump(state.framePicks, subject, passiveModifier);
  }
}

function observeSnapshot(state: TelemetryState, internals: TelemetryInternals, snapshot: WorldSnapshot): void {
  const gameplay = (snapshot as WorldSnapshot & Partial<GameplayWorldExtension>).gameplay;
  if (!gameplay) return;
  for (const [playerId, entry] of Object.entries(gameplay)) {
    const player = internals.players.get(playerId);
    if (player) observeLoadout(state, player, entry.activeModule, entry.passiveModifier);
  }
}

/**
 * Hält das Loadout-Ledger auch dann vollständig, wenn niemand zusieht: pro
 * Intervall wird genau ein Spieler über die öffentliche Snapshot-API erhoben.
 */
function sampleLoadouts(
  state: TelemetryState,
  internals: TelemetryInternals,
  snapshotFor: (selfId: string, now: number) => WorldSnapshot,
  now: number
): void {
  if (now - state.lastSampleAt < LOADOUT_SAMPLE_INTERVAL_MS) return;
  state.lastSampleAt = now;
  const ids = [...internals.players.keys()];
  if (ids.length === 0) return;
  state.sampleCursor = (state.sampleCursor + 1) % ids.length;
  const id = ids[state.sampleCursor];
  if (!id) return;
  observeSnapshot(state, internals, snapshotFor(id, now));
}

function syncLives(state: TelemetryState, internals: TelemetryInternals, now: number): void {
  for (const player of internals.players.values()) {
    if (player.dead) state.lifeStartedAt.delete(player.id);
    else if (!state.lifeStartedAt.has(player.id)) state.lifeStartedAt.set(player.id, now);
  }
  if (state.lifeStartedAt.size <= internals.players.size && state.loadouts.size <= internals.players.size) return;
  for (const id of state.lifeStartedAt.keys()) if (!internals.players.has(id)) state.lifeStartedAt.delete(id);
  for (const id of state.loadouts.keys()) if (!internals.players.has(id)) state.loadouts.delete(id);
}

function commitLife(
  state: TelemetryState,
  playerId: string,
  subject: TelemetrySubject,
  playerClass: PlayerClass,
  now: number
): void {
  const startedAt = state.lifeStartedAt.get(playerId);
  state.lifeStartedAt.delete(playerId);
  if (startedAt === undefined) return;
  addLifetime(state, subject, playerClass, Math.max(0, now - startedAt) / 1000);
}

/** Legt alle gesammelten Werte zurück – für Tests und manuelle Messläufe. */
export function resetTelemetry(game: MazeGame, now = Date.now()): void {
  states.set(game, createState(now));
}

export interface TelemetryEntry {
  id: string;
  label: string;
  picks: number;
  pickRate: number;
  kills: number;
  deaths: number;
  killsPerDeath: number;
}

export interface TelemetryClassEntry extends TelemetryEntry {
  id: PlayerClass;
  tier: ClassTier;
  lives: number;
  averageLifetimeSeconds: number;
  longestLifetimeSeconds: number;
}

export interface TelemetryReport {
  telemetryVersion: number;
  mode: string;
  version: string;
  subject: TelemetrySubjectFilter;
  uptimeSeconds: number;
  population: { humans: number; bots: number; entities: Record<string, number> };
  totals: {
    classPicks: number;
    modulePicks: number;
    framePicks: number;
    kills: number;
    deaths: number;
    lives: number;
    averageLifetimeSeconds: number;
  };
  classes: TelemetryClassEntry[];
  modules: TelemetryEntry[];
  frames: TelemetryEntry[];
}

const rate = (value: number, total: number): number => (total > 0 ? value / total : 0);
const ratio = (kills: number, deaths: number): number => (deaths > 0 ? kills / deaths : kills);
const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Aggregierter, vollständig anonymer Telemetriebericht. */
export function telemetryReport(
  game: MazeGame,
  options: { subject?: TelemetrySubjectFilter; now?: number } = {}
): TelemetryReport {
  const subject = options.subject ?? 'all';
  const now = options.now ?? Date.now();
  const state = stateFor(game, now);

  const classPickTotal = PLAYER_CLASS_IDS.reduce((total, id) => total + readCounter(state.classPicks, subject, id), 0);
  const modulePickTotal = ACTIVE_MODULE_IDS.reduce((total, id) => total + readCounter(state.modulePicks, subject, id), 0);
  const framePickTotal = PASSIVE_MODIFIER_IDS.reduce((total, id) => total + readCounter(state.framePicks, subject, id), 0);

  const classes: TelemetryClassEntry[] = PLAYER_CLASS_IDS.map((id) => {
    const picks = readCounter(state.classPicks, subject, id);
    const kills = readCounter(state.classKills, subject, id);
    const deaths = readCounter(state.classDeaths, subject, id);
    const life = readLifetime(state, subject, id);
    return {
      id,
      label: CLASS_DEFINITIONS[id].label,
      tier: classTier(id),
      picks,
      pickRate: round(rate(picks, classPickTotal)),
      kills,
      deaths,
      killsPerDeath: round(ratio(kills, deaths), 2),
      lives: life.lives,
      averageLifetimeSeconds: round(life.lives > 0 ? life.seconds / life.lives : 0, 2),
      longestLifetimeSeconds: round(life.longestSeconds, 2)
    };
  });

  const modules: TelemetryEntry[] = ACTIVE_MODULE_IDS.map((id) => {
    const picks = readCounter(state.modulePicks, subject, id);
    const kills = readCounter(state.moduleKills, subject, id);
    const deaths = readCounter(state.moduleDeaths, subject, id);
    return {
      id,
      label: ACTIVE_MODULE_DEFINITIONS[id].label,
      picks,
      pickRate: round(rate(picks, modulePickTotal)),
      kills,
      deaths,
      killsPerDeath: round(ratio(kills, deaths), 2)
    };
  });

  const frames: TelemetryEntry[] = PASSIVE_MODIFIER_IDS.map((id) => {
    const picks = readCounter(state.framePicks, subject, id);
    const kills = readCounter(state.frameKills, subject, id);
    const deaths = readCounter(state.frameDeaths, subject, id);
    return {
      id,
      label: PASSIVE_MODIFIER_DEFINITIONS[id].label,
      picks,
      pickRate: round(rate(picks, framePickTotal)),
      kills,
      deaths,
      killsPerDeath: round(ratio(kills, deaths), 2)
    };
  });

  const lives = classes.reduce((total, entry) => total + entry.lives, 0);
  const lifeSeconds = PLAYER_CLASS_IDS.reduce((total, id) => total + readLifetime(state, subject, id).seconds, 0);
  const humans = game.humanCount;

  return {
    telemetryVersion: TELEMETRY_VERSION,
    mode: SERVER_MODE,
    version: SERVER_VERSION,
    subject,
    uptimeSeconds: round(Math.max(0, now - state.startedAt) / 1000, 1),
    population: {
      humans,
      bots: Math.max(0, (game.entityCounts.players ?? humans) - humans),
      entities: { ...game.entityCounts }
    },
    totals: {
      classPicks: classPickTotal,
      modulePicks: modulePickTotal,
      framePicks: framePickTotal,
      kills: classes.reduce((total, entry) => total + entry.kills, 0),
      deaths: classes.reduce((total, entry) => total + entry.deaths, 0),
      lives,
      averageLifetimeSeconds: round(lives > 0 ? lifeSeconds / lives : 0, 2)
    },
    classes,
    modules,
    frames
  };
}

interface MetricLine {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  samples: { labels: Record<string, string>; value: number }[];
}

const renderLabels = (labels: Record<string, string>): string => {
  const parts = Object.entries(labels).map(([key, value]) => `${key}="${value.replace(/["\\\n]/g, '')}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
};

const renderMetric = (metric: MetricLine): string => {
  const lines = [`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`];
  for (const sample of metric.samples) lines.push(`${metric.name}${renderLabels(sample.labels)} ${sample.value}`);
  return lines.join('\n');
};

/** Prometheus-Textformat (OpenMetrics-kompatibel) über alle Subjekte. */
export function renderMetricsText(game: MazeGame, now = Date.now()): string {
  const state = stateFor(game, now);
  const humans = game.humanCount;
  const entities = game.entityCounts;
  const bots = Math.max(0, (entities.players ?? humans) - humans);

  const metrics: MetricLine[] = [
    {
      name: 'maze_build_info',
      help: 'Statische Kennung des laufenden Servers.',
      type: 'gauge',
      samples: [{ labels: { mode: SERVER_MODE, version: SERVER_VERSION, telemetry: String(TELEMETRY_VERSION) }, value: 1 }]
    },
    {
      name: 'maze_uptime_seconds',
      help: 'Laufzeit der Telemetrie-Erfassung in Sekunden.',
      type: 'gauge',
      samples: [{ labels: {}, value: round(Math.max(0, now - state.startedAt) / 1000, 1) }]
    },
    {
      name: 'maze_players',
      help: 'Aktuell verbundene Tanks je Subjekt.',
      type: 'gauge',
      samples: [
        { labels: { subject: 'human' }, value: humans },
        { labels: { subject: 'bot' }, value: bots }
      ]
    },
    {
      name: 'maze_entities',
      help: 'Aktive Simulationsobjekte je Art.',
      type: 'gauge',
      samples: Object.entries(entities).map(([kind, value]) => ({ labels: { kind }, value }))
    }
  ];

  const counterMetric = (
    name: string,
    help: string,
    counter: Counter,
    label: string,
    ids: readonly string[]
  ): MetricLine => ({
    name,
    help,
    type: 'counter',
    samples: SUBJECTS.flatMap((subject) => ids
      .map((id) => ({ labels: { [label]: id, subject }, value: readCounter(counter, subject, id) }))
      .filter((sample) => sample.value > 0))
  });

  metrics.push(
    counterMetric('maze_class_picks_total', 'Gewählte Klassen-Upgrades.', state.classPicks, 'class', PLAYER_CLASS_IDS),
    counterMetric('maze_module_picks_total', 'Ausgerüstete Core Modules.', state.modulePicks, 'module', ACTIVE_MODULE_IDS),
    counterMetric('maze_frame_picks_total', 'Ausgerüstete passive Frames.', state.framePicks, 'frame', PASSIVE_MODIFIER_IDS),
    counterMetric('maze_class_kills_total', 'Kills je Klasse.', state.classKills, 'class', PLAYER_CLASS_IDS),
    counterMetric('maze_class_deaths_total', 'Deaths je Klasse.', state.classDeaths, 'class', PLAYER_CLASS_IDS),
    counterMetric('maze_module_kills_total', 'Kills je Core Module.', state.moduleKills, 'module', ACTIVE_MODULE_IDS),
    counterMetric('maze_module_deaths_total', 'Deaths je Core Module.', state.moduleDeaths, 'module', ACTIVE_MODULE_IDS),
    counterMetric('maze_frame_kills_total', 'Kills je passivem Frame.', state.frameKills, 'frame', PASSIVE_MODIFIER_IDS),
    counterMetric('maze_frame_deaths_total', 'Deaths je passivem Frame.', state.frameDeaths, 'frame', PASSIVE_MODIFIER_IDS)
  );

  const lifeSamples = (pick: (life: LifeStat) => number) => SUBJECTS.flatMap((subject) => PLAYER_CLASS_IDS
    .map((id) => ({ labels: { class: id, subject }, value: round(pick(readLifetime(state, subject, id)), 2) }))
    .filter((sample) => sample.value > 0));

  metrics.push(
    {
      name: 'maze_lives_total',
      help: 'Abgeschlossene Leben (Spawn bis Tod) je Klasse.',
      type: 'counter',
      samples: lifeSamples((life) => life.lives)
    },
    {
      name: 'maze_life_seconds_total',
      help: 'Summierte Lebensdauer abgeschlossener Leben je Klasse.',
      type: 'counter',
      samples: lifeSamples((life) => life.seconds)
    },
    {
      name: 'maze_life_seconds_max',
      help: 'Längstes abgeschlossenes Leben je Klasse.',
      type: 'gauge',
      samples: lifeSamples((life) => life.longestSeconds)
    }
  );

  return `${metrics.map(renderMetric).join('\n')}\n`;
}

const environmentFlag = (name: string, fallback: boolean): boolean => {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1' || value === 'yes';
};

/** Telemetrie lässt sich per ENV vollständig abschalten (Standard: an). */
export const telemetryEnabled = (): boolean => environmentFlag('TELEMETRY_ENABLED', true);

function tokenAccepted(header: string | undefined, expected: string): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const presentedBuffer = Buffer.from(presented);
  const expectedBuffer = Buffer.from(expected);
  if (presentedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(presentedBuffer, expectedBuffer);
}

const parseSubject = (value: unknown): TelemetrySubjectFilter =>
  (value === 'human' || value === 'bot' ? value : 'all');

/**
 * Express-Handler für `/metrics`. Antwortet standardmäßig im
 * Prometheus-Textformat, auf `?format=json` (oder `Accept: application/json`)
 * als aggregierter JSON-Bericht.
 */
export function metricsHandler(game: MazeGame): (request: Request, response: Response) => void {
  return (request: Request, response: Response): void => {
    if (!telemetryEnabled()) {
      response.status(404).json({ error: 'Telemetrie ist deaktiviert.' });
      return;
    }
    const token = process.env.METRICS_TOKEN?.trim();
    if (token && !tokenAccepted(request.headers.authorization, token)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      response.status(401).json({ error: 'Metrics-Token erforderlich.' });
      return;
    }

    response.setHeader('Cache-Control', 'no-store');
    const wantsJson = request.query.format === 'json' || request.headers.accept?.includes('application/json');
    if (wantsJson) {
      response.json(telemetryReport(game, { subject: parseSubject(request.query.subject) }));
      return;
    }
    response.type('text/plain; version=0.0.4; charset=utf-8').send(renderMetricsText(game));
  };
}

/**
 * Hängt die Telemetrie als äußerste Tuning-Schicht an das Spiel an. Sie
 * verändert keine Regel, sondern beobachtet nur Klassenwahl, Loadouts,
 * Lebensdauer und Kills/Deaths.
 */
export function tuneTelemetry<T extends MazeGame>(game: T): T {
  if (!telemetryEnabled()) return game;
  const internals = game as unknown as TelemetryInternals;
  const state = stateFor(game);

  const originalChooseClass = game.chooseClass.bind(game);
  game.chooseClass = ((playerId: string, target: PlayerClass): boolean => {
    const changed = originalChooseClass(playerId, target);
    if (!changed) return changed;
    const player = internals.players.get(playerId);
    if (player) bump(state.classPicks, subjectOf(player), target);
    return changed;
  }) as T['chooseClass'];

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    if (target.dead) {
      originalKillPlayer(target, attackerId, now, environmentName);
      return;
    }
    const attacker = attackerId && attackerId !== target.id ? internals.players.get(attackerId) : undefined;
    const attackerSubject = attacker ? subjectOf(attacker) : null;
    const attackerClass = attacker?.playerClass;
    const attackerLoadout = attacker ? state.loadouts.get(attacker.id) : undefined;
    const victimSubject = subjectOf(target);
    const victimClass = target.playerClass;
    const victimLoadout = state.loadouts.get(target.id);

    originalKillPlayer(target, attackerId, now, environmentName);

    commitLife(state, target.id, victimSubject, victimClass, now);
    bump(state.classDeaths, victimSubject, victimClass);
    if (victimLoadout) {
      bump(state.moduleDeaths, victimSubject, victimLoadout.activeModule);
      bump(state.frameDeaths, victimSubject, victimLoadout.passiveModifier);
    }
    if (!attackerSubject || !attackerClass) return;
    bump(state.classKills, attackerSubject, attackerClass);
    if (attackerLoadout) {
      bump(state.moduleKills, attackerSubject, attackerLoadout.activeModule);
      bump(state.frameKills, attackerSubject, attackerLoadout.passiveModifier);
    }
  };

  const originalStep = game.step.bind(game);
  const originalSnapshot = game.snapshot.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    syncLives(state, internals, now);
    sampleLoadouts(state, internals, originalSnapshot, now);
  }) as T['step'];

  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now);
    observeSnapshot(state, internals, snapshot);
    return snapshot;
  }) as T['snapshot'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    state.lifeStartedAt.delete(id);
    state.loadouts.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
