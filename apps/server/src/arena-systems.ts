import crypto from 'node:crypto';
import {
  ARENA_MODES,
  GAME,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import type { ArenaEventKind, ArenaEventSnapshot, GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { distanceSquared } from './physics.js';
import { createShape, currentArenaMode, isFree } from './world.js';

/** Der geteilte `ArenaEventKind` deckt inzwischen alle Events ab – Aliase bleiben für die Event-Schicht. */
export type ServerArenaEventKind = ArenaEventKind;
export type ServerArenaEvent = ArenaEventSnapshot;

interface ArenaEventTiming {
  warningMs: number;
  activeMs: number;
  radius: number;
}

/** Die Arena rotiert fest durch alle Events, damit keines dominiert. */
export const ARENA_EVENT_ROTATION: readonly ServerArenaEventKind[] = ['coreSurge', 'overcharge', 'hunterSignal', 'fracture'];
export const ARENA_EVENT_TIMINGS: Record<ServerArenaEventKind, ArenaEventTiming> = {
  coreSurge: { warningMs: 10_000, activeMs: 40_000, radius: 620 },
  overcharge: { warningMs: 8_000, activeMs: 35_000, radius: 560 },
  hunterSignal: { warningMs: 8_000, activeMs: 45_000, radius: 520 },
  fracture: { warningMs: 8_000, activeMs: 40_000, radius: 620 }
};

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface ArenaInternals {
  players: Map<string, RuntimePlayer>;
  shapes: Map<string, ShapeSnapshot>;
  damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
  awardXp(player: RuntimePlayer, amount: number): void;
}

interface ArenaState {
  eliteShapeIds: Set<string>;
  eventBonusShapeIds: Set<string>;
  nextEliteAt: number;
  event: ServerArenaEvent | null;
  nextEventAt: number;
  eventSpawnAt: number;
  eventId: number;
  eventIndex: number;
  bountyTargetId: string | null;
  bountyValue: number;
  lastBountyCheckAt: number;
  recentClaims: Map<string, number>;
}

const states = new WeakMap<MazeGame, ArenaState>();
const stateFor = (game: MazeGame): ArenaState => {
  const existing = states.get(game);
  if (existing) return existing;
  const now = Date.now();
  const created: ArenaState = {
    eliteShapeIds: new Set(),
    eventBonusShapeIds: new Set(),
    nextEliteAt: now + 18_000,
    event: null,
    nextEventAt: now + 65_000,
    eventSpawnAt: 0,
    eventId: 0,
    eventIndex: 0,
    bountyTargetId: null,
    bountyValue: 0,
    lastBountyCheckAt: 0,
    recentClaims: new Map()
  };
  states.set(game, created);
  return created;
};

const kartenMitte = (): Vector2 => ({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 });

/**
 * Wo das nächste Arena-Event stattfindet.
 *
 * Bis zur Vergrößerung der Arena stand hier fest die Kartenmitte, und auf
 * 6000 × 4000 ging das durch: Die Zone (Radius rund 600) deckte 5 % der Karte
 * ab, und weiter als 3600 Einheiten war niemand je entfernt.
 *
 * Auf 9000 × 6000 rechnet sich das anders. Dieselbe Zone deckt nur noch 2,2 %
 * ab, die Entfernung wächst auf bis zu 5400 Einheiten – bei rund 300 Tempo also
 * achtzehn Sekunden Anfahrt für ein Event, das vierzig Sekunden dauert. Und die
 * Ecken der Karte wären für immer belanglos, weil dort nie etwas passiert.
 *
 * Deshalb sucht sich das Event jetzt einen Platz in Reichweite der Spieler:
 * ausgehend von einem zufälligen Lebenden, um gut eine Zonenbreite versetzt.
 * Nah genug, dass es sich lohnt loszufahren; weit genug, dass es niemandem
 * einfach in den Schoß fällt. Der Radius bleibt unverändert – bei gleicher
 * Spielerdichte stehen damit gleich viele Leute in der Zone wie vorher.
 */
function eventCenter(internals: ArenaInternals, radius: number): Vector2 {
  const lebende = [...internals.players.values()].filter((player) => !player.dead);
  // Menschen zuerst: Ein Event, das nur Bots erreichen, ist kein Ereignis.
  const menschen = lebende.filter((player) => !player.isBot);
  const auswahl = menschen.length > 0 ? menschen : lebende;
  if (auswahl.length === 0) return kartenMitte();

  const anker = auswahl[Math.floor(Math.random() * auswahl.length)]!;
  const rand = radius + 260;
  for (let versuch = 0; versuch < 24; versuch += 1) {
    const winkel = Math.random() * Math.PI * 2;
    const abstand = radius * (1.2 + Math.random() * 0.8);
    const kandidat = {
      x: Math.min(GAME.worldWidth - rand, Math.max(rand, anker.position.x + Math.cos(winkel) * abstand)),
      y: Math.min(GAME.worldHeight - rand, Math.max(rand, anker.position.y + Math.sin(winkel) * abstand))
    };
    if (istFreiePlatz(kandidat)) return kandidat;
  }
  return kartenMitte();
}

/**
 * Taugt dieser Punkt als Mittelpunkt einer Event-Zone?
 *
 * Es reicht nicht, dass er begehbar ist. Ein Event in einem engen Gang sieht
 * auf der Karte aus wie eines auf freiem Feld, spielt sich aber völlig anders:
 * Die Hälfte der Bonus-Formen findet keinen Platz, und der Guardian des
 * Hunter-Signals steht in seiner eigenen Wand statt im Weg – gemessen an einem
 * Test, der ihn dann in der Hälfte der Läufe gar nicht erst schießen sah.
 *
 * Deshalb muss ringsum Platz sein. Sechs von acht Richtungen frei ist bewusst
 * nicht „alle acht": Ein Platz darf an eine Wand grenzen, er darf nur kein
 * Schlauch sein.
 */
function istFreiePlatz(punkt: Vector2): boolean {
  if (!isFree(punkt, 40)) return false;
  let frei = 0;
  for (let richtung = 0; richtung < 8; richtung += 1) {
    const winkel = (richtung / 8) * Math.PI * 2;
    const probe = {
      x: punkt.x + Math.cos(winkel) * 260,
      y: punkt.y + Math.sin(winkel) * 260
    };
    if (isFree(probe, 40)) frei += 1;
  }
  return frei >= 6;
}

function shapePositionInZone(center: Vector2, radius: number): Vector2 | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    const position = {
      x: center.x + Math.cos(angle) * distance,
      y: center.y + Math.sin(angle) * distance
    };
    if (isFree(position, 34)) return position;
  }
  return null;
}

function promoteElite(state: ArenaState, shape: ShapeSnapshot): void {
  if (state.eliteShapeIds.has(shape.id)) return;
  const eliteRadius = shape.radius * 1.55;
  if (!isFree(shape.position, eliteRadius + 4)) return;
  state.eliteShapeIds.add(shape.id);
  shape.radius = eliteRadius;
  shape.maxHealth = Math.round(shape.maxHealth * 4);
  shape.health = shape.maxHealth;
  shape.velocity.x *= 0.55;
  shape.velocity.y *= 0.55;
}

function pickEliteCandidate(internals: ArenaInternals, state: ArenaState, preferCenter: boolean): ShapeSnapshot | null {
  // Der Mittelpunkt des LAUFENDEN Events, nicht ein neu gewuerfelter: Seit die
  // Zone wandert, waeren das zwei verschiedene Orte – die Elite entstuende dann
  // irgendwo, nur nicht dort, wo der Ring gezeichnet ist.
  const center = state.event?.center ?? kartenMitte();
  const candidates = [...internals.shapes.values()].filter((shape) => {
    if (state.eliteShapeIds.has(shape.id) || !isFree(shape.position, shape.radius * 1.55 + 4)) return false;
    if (!preferCenter) return true;
    return distanceSquared(shape.position, center) <= 720 * 720;
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

function spawnEventShape(internals: ArenaInternals, center: Vector2, radius: number): string | null {
  const position = shapePositionInZone(center, radius);
  if (!position) return null;
  const shape = createShape(crypto.randomUUID());
  shape.position = position;
  shape.velocity.x *= 0.7;
  shape.velocity.y *= 0.7;
  internals.shapes.set(shape.id, shape);
  return shape.id;
}

function updateEvent(internals: ArenaInternals, state: ArenaState, now: number): void {
  if (!state.event && now >= state.nextEventAt) {
    /*
     * Fracture bricht Wandsegmente auf – in einer Arena ohne Wände ist das ein
     * Ereignis, bei dem nichts passiert. Ein angekündigtes Event, das dann
     * folgenlos bleibt, ist schlimmer als eines weniger: Es lehrt Spieler, die
     * Ankündigung zu ignorieren.
     *
     * Die Rotation wird deshalb nach Modus gefiltert, nicht das einzelne Event
     * übersprungen – sonst käme in FFA jedes vierte Mal eine Pause statt eines
     * Events.
     */
    const rotation = ARENA_MODES[currentArenaMode()].walls
      ? ARENA_EVENT_ROTATION
      : ARENA_EVENT_ROTATION.filter((art) => art !== 'fracture');
    const kind = rotation[state.eventIndex % rotation.length] ?? 'coreSurge';
    const timing = ARENA_EVENT_TIMINGS[kind];
    const startsAt = now + timing.warningMs;
    state.eventIndex += 1;
    state.event = {
      id: ++state.eventId,
      kind,
      phase: 'warning',
      startsAt,
      endsAt: startsAt + timing.activeMs,
      center: eventCenter(internals, timing.radius),
      radius: timing.radius
    };
    state.eventSpawnAt = startsAt;
    return;
  }

  if (!state.event) return;
  if (state.event.phase === 'warning' && now >= state.event.startsAt) state.event.phase = 'active';
  if (now >= state.event.endsAt) {
    for (const id of state.eventBonusShapeIds) internals.shapes.delete(id);
    state.eventBonusShapeIds.clear();
    state.event = null;
    state.nextEventAt = now + 120_000;
    state.eventSpawnAt = 0;
    return;
  }
  // Nur Core Surge flutet die Zone mit Formen; die anderen Events verändern Regeln, keine Beute.
  if (state.event.kind !== 'coreSurge' || state.event.phase !== 'active' || now < state.eventSpawnAt) return;

  state.eventSpawnAt = now + 2_400;
  if (state.eventBonusShapeIds.size < 42) {
    for (let index = 0; index < 3; index += 1) {
      const id = spawnEventShape(internals, state.event.center, state.event.radius * 0.9);
      if (id) state.eventBonusShapeIds.add(id);
    }
  }
  if (state.eliteShapeIds.size < 4 && Math.random() < 0.45) {
    const candidate = pickEliteCandidate(internals, state, true);
    if (candidate) promoteElite(state, candidate);
  }
}

function bountyCandidate(internals: ArenaInternals): RuntimePlayer | null {
  const eligible = [...internals.players.values()]
    .filter((player) => !player.dead && player.level >= 10 && player.kills >= 3 && player.score >= 1_500)
    .sort((a, b) => (b.kills * 550 + b.score) - (a.kills * 550 + a.score));
  return eligible[0] ?? null;
}

function updateBounty(internals: ArenaInternals, state: ArenaState, now: number): void {
  if (now - state.lastBountyCheckAt < 1_000) return;
  state.lastBountyCheckAt = now;

  for (const [key, expiresAt] of state.recentClaims) if (expiresAt <= now) state.recentClaims.delete(key);
  const current = state.bountyTargetId ? internals.players.get(state.bountyTargetId) : undefined;
  if (current && !current.dead) {
    state.bountyValue = Math.min(1_200, 250 + current.kills * 85 + Math.floor(current.score * 0.06));
    return;
  }

  const next = bountyCandidate(internals);
  state.bountyTargetId = next?.id ?? null;
  state.bountyValue = next ? Math.min(1_200, 250 + next.kills * 85 + Math.floor(next.score * 0.06)) : 0;
}

/** Aktuelles Bounty-Ziel für andere Systeme (z. B. Bot-Zielwahl). */
export function bountyTargetIdFor(game: MazeGame): string | null {
  return stateFor(game).bountyTargetId;
}

/** Laufendes Arena-Event für andere Systeme (z. B. Event-Mechaniken). Nur lesen. */
export function activeArenaEventFor(game: MazeGame): ServerArenaEvent | null {
  return stateFor(game).event;
}

/** Adds world-level objectives without changing the one-button combat model. */
export function tuneArenaSystems<T extends MazeGame>(game: T): T {
  const internals = game as unknown as ArenaInternals;
  const state = stateFor(game);

  const originalDamageShape = internals.damageShape.bind(internals);
  internals.damageShape = (shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void => {
    const elite = state.eliteShapeIds.has(shape.id);
    const destroyed = shape.health - Math.max(0, damage) <= 0;
    originalDamageShape(shape, damage, ownerId, now);
    if (!elite || !destroyed) return;
    state.eliteShapeIds.delete(shape.id);
    state.eventBonusShapeIds.delete(shape.id);
    const owner = internals.players.get(ownerId);
    if (owner && !owner.dead) internals.awardXp(owner, 260);
  };

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const bountyValue = target.id === state.bountyTargetId ? state.bountyValue : 0;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (bountyValue <= 0 || !attackerId || attackerId === target.id) return;
    const attacker = internals.players.get(attackerId);
    const claimKey = `${attackerId}:${target.id}`;
    if (attacker && !state.recentClaims.has(claimKey)) {
      internals.awardXp(attacker, bountyValue);
      state.recentClaims.set(claimKey, now + 120_000);
    }
    state.bountyTargetId = null;
    state.bountyValue = 0;
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    for (const id of state.eliteShapeIds) if (!internals.shapes.has(id)) state.eliteShapeIds.delete(id);
    for (const id of state.eventBonusShapeIds) if (!internals.shapes.has(id)) state.eventBonusShapeIds.delete(id);

    const surging = state.event?.kind === 'coreSurge' && state.event.phase === 'active';
    const eliteLimit = surging ? 4 : 3;
    if (now >= state.nextEliteAt && state.eliteShapeIds.size < eliteLimit) {
      const candidate = pickEliteCandidate(internals, state, surging);
      if (candidate) promoteElite(state, candidate);
      state.nextEliteAt = now + (surging ? 8_000 : 22_000);
    }

    updateEvent(internals, state, now);
    updateBounty(internals, state, now);
  }) as T['step'];

  const originalSnapshot = game.snapshot.bind(game);
  game.snapshot = ((selfId: string, now = Date.now()): WorldSnapshot => {
    const snapshot = originalSnapshot(selfId, now) as WorldSnapshot & Partial<GameplayWorldExtension>;
    snapshot.eliteShapeIds = snapshot.shapes.filter((shape) => state.eliteShapeIds.has(shape.id)).map((shape) => shape.id);
    snapshot.arenaEvent = state.event ? { ...state.event, center: { ...state.event.center } } : null;
    snapshot.bountyTargetId = state.bountyTargetId;
    snapshot.bountyValue = state.bountyValue;
    const targetGameplay = state.bountyTargetId && snapshot.gameplay ? snapshot.gameplay[state.bountyTargetId] : undefined;
    if (targetGameplay) targetGameplay.bountyValue = state.bountyValue;
    return snapshot;
  }) as T['snapshot'];

  return game;
}
