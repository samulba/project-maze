import { GAME, type PlayerSnapshot, type Vector2 } from '@project-maze/shared';
import { BOT_NAMES, MazeGame, botState, type BotState } from './game.js';
import { distanceSquared } from './physics.js';

/**
 * Arena-Direktor: hält die Bot-Population passend zur Zahl der Menschen.
 *
 * Die Arena soll sich immer bevölkert anfühlen, ohne dass ein voller Server
 * zusätzlich von Bots überrannt wird. Der Direktor greift dafür ausschließlich
 * auf die vorhandenen internen Wege zurück – er erzeugt Bots wie der
 * Konstruktor und entfernt sie über `removePlayer`. An Schaden, Bewegung,
 * Belohnungen oder Bot-Verhalten ändert er nichts.
 *
 * Drei Regeln bestimmen das Verhalten:
 *
 * 1. **Zielgröße** – ein Mensch bekommt eine volle Arena, jeder weitere nimmt
 *    zwei Bots weg, bis eine Untergrenze erreicht ist.
 * 2. **Sanftes Phasing** – höchstens eine Änderung alle fünf Sekunden. Die
 *    Population atmet dadurch, statt zu springen.
 * 3. **Schonendes Despawnen** – ein Bot verschwindet nur, wenn er tot ist oder
 *    weit weg von jedem Menschen und gerade nicht im Gefecht. Niemand sieht je
 *    einen Gegner ins Nichts verschwinden.
 */

export interface ArenaDirectorConfig {
  /** Bots bei genau einem Menschen (und in der leeren Arena). */
  readonly baseBots: number;
  /** So viele Bots weniger je zusätzlichem Menschen. */
  readonly botsPerHuman: number;
  readonly minimumBots: number;
  /** Mindestabstand zwischen zwei Populationsänderungen. */
  readonly phaseIntervalMs: number;
  /** Ab diesem Abstand zu jedem Menschen darf ein lebender Bot gehen. */
  readonly despawnDistance: number;
  /** So lange nach einem Treffer gilt ein Bot als im Gefecht. */
  readonly combatMs: number;
  /** Anteil des Median-Levels, mit dem ein neuer Bot startet. */
  readonly levelFactor: number;
}

export const DEFAULT_DIRECTOR_CONFIG: ArenaDirectorConfig = {
  // 8 statt 11: Elf Bots hießen Dauerbeschuss ohne Verschnaufpause (Feedback
  // Sam). Acht halten die Arena lebendig, lassen aber Räume zum Farmen.
  baseBots: 8,
  botsPerHuman: 1,
  minimumBots: 3,
  phaseIntervalMs: 5_000,
  // Deutlich jenseits des festen Sichtfensters (1600 × 900) – niemand kann es sehen.
  despawnDistance: 1_600,
  combatMs: 5_000,
  levelFactor: 0.85
};

/**
 * Zielgröße der Bot-Population. Die leere Arena wird wie „ein Mensch"
 * behandelt: Wer als Erster hereinkommt, findet sofort Betrieb vor, statt auf
 * das Einphasen zu warten.
 */
export function targetBotCount(humans: number, config: ArenaDirectorConfig = DEFAULT_DIRECTOR_CONFIG): number {
  const extraHumans = Math.max(0, humans - 1);
  const target = config.baseBots - extraHumans * config.botsPerHuman;
  return Math.max(config.minimumBots, Math.min(config.baseBots, target));
}

/** Median einer Zahlenreihe; bei gerader Länge der Mittelwert der beiden mittleren Werte. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Startlevel eines neuen Bots: am Median der Menschen, aber bewusst darunter.
 * Ein frischer Gegner soll erreichbar sein und nicht sofort überlegen.
 */
export function botLevelFor(
  humanLevels: readonly number[],
  config: ArenaDirectorConfig = DEFAULT_DIRECTOR_CONFIG
): number {
  if (humanLevels.length === 0) return 1;
  const scaled = Math.round(medianOf(humanLevels) * config.levelFactor);
  return Math.max(1, Math.min(GAME.maxLevel, scaled));
}

interface RuntimePlayer extends PlayerSnapshot {
  lastDamageAt: number;
  /** Nur vom Direktor erzeugte Bots haben einen Bot-Zustand – Guardian und Debug-Dummies nicht. */
  bot: BotState | null;
}

interface DirectorInternals {
  players: Map<string, RuntimePlayer>;
  createPlayer(name: string, isBot: boolean, bot: BotState | null): string;
  respawn(player: RuntimePlayer, now: number): void;
}

interface DirectorState {
  nextChangeAt: number;
  /** Fortlaufender Index für Stil, Namen und Klassenpfad neuer Bots. */
  spawnIndex: number;
}

const states = new WeakMap<MazeGame, DirectorState>();
const stateFor = (game: MazeGame): DirectorState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: DirectorState = { nextChangeAt: 0, spawnIndex: 0 };
  states.set(game, created);
  return created;
};

/** Menschen sind alle echten Clients – der neutrale Guardian zählt als Bot. */
const humansOf = (internals: DirectorInternals): RuntimePlayer[] =>
  [...internals.players.values()].filter((player) => !player.isBot);

/**
 * Nur Bots mit Bot-Zustand gehören dem Direktor. Der Hunter-Signal-Guardian und
 * Debug-Dummies sind ebenfalls `isBot`, werden aber von ihren eigenen Systemen
 * verwaltet und dürfen hier niemals angefasst werden.
 */
const directorBotsOf = (internals: DirectorInternals): RuntimePlayer[] =>
  [...internals.players.values()].filter((player) => player.isBot && player.bot !== null);

/** Abstand zum nächsten Menschen; ohne Menschen gilt jeder Bot als weit weg. */
const distanceToNearestHuman = (position: Vector2, humans: readonly RuntimePlayer[]): number => {
  let nearest = Infinity;
  for (const human of humans) {
    if (human.dead) continue;
    nearest = Math.min(nearest, distanceSquared(position, human.position));
  }
  return nearest === Infinity ? Infinity : Math.sqrt(nearest);
};

/**
 * Wählt den Bot, der am wenigsten fehlt: zuerst ein toter, sonst der am
 * weitesten entfernte, der gerade kein Gefecht führt. Gibt es keinen solchen
 * Bot, wird in diesem Durchgang niemand entfernt.
 */
export function pickDespawnCandidate(
  bots: readonly RuntimePlayer[],
  humans: readonly RuntimePlayer[],
  now: number,
  config: ArenaDirectorConfig = DEFAULT_DIRECTOR_CONFIG
): RuntimePlayer | null {
  // Ein frisch Gefallener bleibt kurz liegen: Abschuss, Killfeed und Explosion
  // sollen sichtbar zu Ende gehen, bevor der Direktor die Leiche aufräumt.
  const dead = bots.find((bot) => bot.dead && now - bot.lastDamageAt >= config.combatMs);
  if (dead) return dead;

  let best: RuntimePlayer | null = null;
  let bestDistance = config.despawnDistance;
  for (const bot of bots) {
    if (now - bot.lastDamageAt < config.combatMs) continue;
    const distance = distanceToNearestHuman(bot.position, humans);
    if (distance <= bestDistance) continue;
    best = bot;
    bestDistance = distance;
  }
  return best;
}

/**
 * Hängt den Direktor an. `enabled = false` lässt die Schicht komplett weg – der
 * Server verhält sich dann exakt wie vorher, die Bot-Anzahl bleibt starr bei
 * dem, was der Konstruktor erzeugt hat.
 */
export function tuneArenaDirector<T extends MazeGame>(
  game: T,
  enabled = true,
  config: ArenaDirectorConfig = DEFAULT_DIRECTOR_CONFIG
): T {
  if (!enabled) return game;
  const internals = game as unknown as DirectorInternals;
  const state = stateFor(game);

  const spawnBot = (now: number): void => {
    const humans = humansOf(internals);
    const index = state.spawnIndex++;
    const name = BOT_NAMES[index % BOT_NAMES.length] ?? `Bot ${index + 1}`;
    const id = internals.createPlayer(name, true, botState(index));
    const bot = internals.players.get(id);
    if (!bot) return;
    // Über `respawn` einsteigen: derselbe Weg, den auch jeder Wiedereinstieg
    // nimmt – inklusive Upgrade-Verteilung, Klassenaufstieg und Spawnschutz.
    bot.respawnLevel = botLevelFor(humans.map((human) => human.level), config);
    internals.respawn(bot, now);
  };

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    originalStep(dt, now);
    if (now < state.nextChangeAt) return;

    const humans = humansOf(internals);
    const bots = directorBotsOf(internals);
    const target = targetBotCount(humans.length, config);
    if (bots.length === target) return;

    if (bots.length < target) {
      spawnBot(now);
      state.nextChangeAt = now + config.phaseIntervalMs;
      return;
    }
    const candidate = pickDespawnCandidate(bots, humans, now, config);
    // Kein unauffälliger Kandidat: lieber einen Bot zu viel als einen, der
    // mitten im Kampf verschwindet. Im nächsten Durchgang erneut versuchen.
    if (!candidate) return;
    game.removePlayer(candidate.id);
    state.nextChangeAt = now + config.phaseIntervalMs;
  }) as T['step'];

  return game;
}

/** Aktuelle Zielgröße für Tests und Betriebsanzeigen. */
export function arenaDirectorStatus(
  game: MazeGame,
  config: ArenaDirectorConfig = DEFAULT_DIRECTOR_CONFIG
): { humans: number; bots: number; target: number; nextChangeAt: number } {
  const internals = game as unknown as DirectorInternals;
  const humans = humansOf(internals).length;
  return {
    humans,
    bots: directorBotsOf(internals).length,
    target: targetBotCount(humans, config),
    nextChangeAt: states.get(game)?.nextChangeAt ?? 0
  };
}
