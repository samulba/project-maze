import {
  CLASS_DEFINITIONS,
  GAME,
  type ClassDefinition,
  type PlayerClass,
  type PlayerSnapshot,
  type Vector2
} from '@project-maze/shared';
import { activeArenaEventFor, type ServerArenaEvent } from './arena-systems.js';
import { arenaGuardianIdFor, fracturedWallIdsFor } from './arena-events.js';
import { MazeGame } from './game.js';
import { distanceSquared } from './physics.js';
import { segmentCrossesWalls } from './world.js';

/**
 * Achievement-Engine als Tuning-Schicht.
 *
 * Die Engine beobachtet ausschließlich – sie verändert keine einzige Regel und
 * greift nirgends in Schaden, Bewegung oder Belohnungen ein. Ohne
 * `ACHIEVEMENTS_ENABLED` wird sie gar nicht erst angehängt, der Server verhält
 * sich dann exakt wie vorher.
 *
 * Der Fortschritt liegt im Arbeitsspeicher und gilt je Verbindung: Beim
 * Verlassen der Arena ist er weg. Dauerhafte Speicherung ist ein eigenes Paket.
 * Ein Achievement wird höchstens einmal je Verbindung vergeben – Farmen durch
 * Sterben und Wiederholen ist damit ausgeschlossen. Bots bekommen nichts.
 */

export const ACHIEVEMENT_IDS = [
  'firstStreak5',
  'guardianSlayer',
  'maxLevel',
  'threeFamilies',
  'overchargeDuelist',
  'fractureFlanker',
  'score10k'
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

type ClassFamily = ClassDefinition['branch'];

/** Zählt für „Klassenfamilien" – `core` ist der gemeinsame Anfang, keine Familie. */
export const CLASS_FAMILIES: readonly ClassFamily[] = ['rapid', 'precision', 'control', 'impact'];

/** Laufender Fortschritt eines Spielers. Nur die Engine schreibt hier hinein. */
export interface AchievementProgress {
  unlocked: Set<AchievementId>;
  /** Seit dem letzten Abholen freigeschaltet – der Client bekommt das später als Snapshot-Feld. */
  fresh: AchievementId[];
  /** Gespielte Klassenfamilien dieser Verbindung, ohne `core`. */
  families: Set<ClassFamily>;
  guardianKills: number;
  overchargeZoneKills: number;
  fractureWallKills: number;
}

export interface AchievementContext {
  player: PlayerSnapshot;
  progress: AchievementProgress;
}

export interface AchievementDefinition {
  id: AchievementId;
  name: string;
  description: string;
  /** Wird je Spieler nach jedem Tick und direkt nach jedem Abschuss geprüft. */
  condition(context: AchievementContext): boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'firstStreak5',
    name: 'Lauf ohne Ende',
    description: 'Erreiche eine Serie von fünf Abschüssen, ohne zu sterben.',
    condition: ({ player }) => player.streak >= 5
  },
  {
    id: 'guardianSlayer',
    name: 'Signal gebrochen',
    description: 'Erlege den neutralen Guardian des Hunter-Signal-Events.',
    condition: ({ progress }) => progress.guardianKills > 0
  },
  {
    id: 'maxLevel',
    name: 'Ausgereizt',
    description: `Erreiche Level ${GAME.maxLevel}.`,
    condition: ({ player }) => player.level >= GAME.maxLevel
  },
  {
    id: 'threeFamilies',
    name: 'Allrounder',
    description: 'Spiele drei verschiedene Klassenfamilien in einer Verbindung.',
    condition: ({ progress }) => progress.families.size >= 3
  },
  {
    id: 'overchargeDuelist',
    name: 'Überladen',
    description: 'Besiege einen Gegner während Overcharge innerhalb der Eventzone.',
    condition: ({ progress }) => progress.overchargeZoneKills > 0
  },
  {
    id: 'fractureFlanker',
    name: 'Durch die Bresche',
    description: 'Besiege einen Gegner durch ein von Fracture aufgebrochenes Wandsegment.',
    condition: ({ progress }) => progress.fractureWallKills > 0
  },
  {
    id: 'score10k',
    name: 'Fünfstellig',
    description: 'Erreiche 10.000 Punkte in einem Lauf.',
    condition: ({ player }) => player.score >= 10_000
  }
];

const CATALOG = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement] as const));
export const achievementById = (id: AchievementId): AchievementDefinition | undefined => CATALOG.get(id);

interface RuntimePlayer extends PlayerSnapshot {
  bot: unknown | null;
}

interface AchievementInternals {
  players: Map<string, RuntimePlayer>;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}

const states = new WeakMap<MazeGame, Map<string, AchievementProgress>>();
const stateFor = (game: MazeGame): Map<string, AchievementProgress> => {
  const existing = states.get(game);
  if (existing) return existing;
  const created = new Map<string, AchievementProgress>();
  states.set(game, created);
  return created;
};
const progressFor = (game: MazeGame, playerId: string): AchievementProgress => {
  const state = stateFor(game);
  const existing = state.get(playerId);
  if (existing) return existing;
  const created: AchievementProgress = {
    unlocked: new Set(),
    fresh: [],
    families: new Set(),
    guardianKills: 0,
    overchargeZoneKills: 0,
    fractureWallKills: 0
  };
  state.set(playerId, created);
  return created;
};

const inEventZone = (position: Vector2, event: ServerArenaEvent): boolean =>
  distanceSquared(position, event.center) <= event.radius * event.radius;

const familyOf = (playerClass: PlayerClass): ClassFamily => CLASS_DEFINITIONS[playerClass].branch;

/** Alles, was zum Zeitpunkt des Abschusses gilt – nach `killPlayer` ist es teils überschrieben. */
interface KillContext {
  attackerId: string;
  attackerPosition: Vector2;
  victimPosition: Vector2;
  guardianKill: boolean;
  event: ServerArenaEvent | null;
}

function recordKill(game: MazeGame, context: KillContext): void {
  const progress = progressFor(game, context.attackerId);
  if (context.guardianKill) progress.guardianKills += 1;

  const event = context.event;
  if (!event || event.phase !== 'active') return;
  if (event.kind === 'overcharge' && inEventZone(context.victimPosition, event)) {
    progress.overchargeZoneKills += 1;
  }
  if (
    event.kind === 'fracture' &&
    segmentCrossesWalls(context.attackerPosition, context.victimPosition, fracturedWallIdsFor(game))
  ) {
    progress.fractureWallKills += 1;
  }
}

/**
 * Hängt die Engine an. `enabled` ist der einzige Schalter: Ohne ihn wird nichts
 * umhüllt, es gibt keinen Fortschritt und keinerlei Zusatzkosten.
 */
export function tuneAchievements<T extends MazeGame>(game: T, enabled = false): T {
  if (!enabled) return game;
  const internals = game as unknown as AchievementInternals;

  const evaluate = (player: RuntimePlayer): void => {
    if (player.isBot) return;
    const progress = progressFor(game, player.id);
    for (const achievement of ACHIEVEMENTS) {
      if (progress.unlocked.has(achievement.id)) continue;
      if (!achievement.condition({ player, progress })) continue;
      progress.unlocked.add(achievement.id);
      progress.fresh.push(achievement.id);
    }
  };

  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    const attacker = attackerId && attackerId !== target.id ? internals.players.get(attackerId) : undefined;
    // Vor dem Abschuss sichern: Danach ist der Guardian abgemeldet und die Positionen wandern weiter.
    const context: KillContext | null = attacker && !attacker.isBot
      ? {
        attackerId: attacker.id,
        attackerPosition: { ...attacker.position },
        victimPosition: { ...target.position },
        guardianKill: target.id === arenaGuardianIdFor(game),
        event: activeArenaEventFor(game)
      }
      : null;
    const wasDead = target.dead;

    originalKillPlayer(target, attackerId, now, environmentName);

    if (wasDead || !target.dead) return;
    if (context) recordKill(game, context);
    // Sofort prüfen: Stirbt der Angreifer im selben Tick, wäre die Serie sonst schon wieder bei null.
    if (attacker) evaluate(attacker);
  };

  const originalChooseClass = game.chooseClass.bind(game);
  game.chooseClass = ((playerId: string, target: PlayerClass): boolean => {
    const accepted = originalChooseClass(playerId, target);
    if (!accepted) return accepted;
    const player = internals.players.get(playerId);
    if (!player || player.isBot) return accepted;
    const family = familyOf(player.playerClass);
    if (family !== 'core') progressFor(game, playerId).families.add(family);
    evaluate(player);
    return accepted;
  }) as T['chooseClass'];

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    for (const player of internals.players.values()) evaluate(player);
  }) as T['step'];

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stateFor(game).delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Alle bisher freigeschalteten Achievements eines Spielers. */
export function unlockedAchievementsFor(game: MazeGame, playerId: string): AchievementId[] {
  return [...(states.get(game)?.get(playerId)?.unlocked ?? [])];
}

/**
 * Holt die seit dem letzten Aufruf freigeschalteten Achievements und leert die
 * Warteschlange. Genau das gehört später einmal je Snapshot in den Snapshot –
 * der Aufrufer muss also sicherstellen, dass dieser Snapshot den Client auch
 * erreicht.
 */
export function drainUnlockedAchievements(game: MazeGame, playerId: string): AchievementId[] {
  const progress = states.get(game)?.get(playerId);
  if (!progress || progress.fresh.length === 0) return [];
  return progress.fresh.splice(0, progress.fresh.length);
}

/** Lesender Blick auf den Fortschritt – für Tests und spätere Persistenz. */
export function achievementProgressFor(game: MazeGame, playerId: string): AchievementProgress | null {
  return states.get(game)?.get(playerId) ?? null;
}
