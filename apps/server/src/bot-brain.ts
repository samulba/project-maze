import {
  GAME,
  type PlayerClass,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';
import type { ActiveModuleId, PassiveModifierId } from '@project-maze/shared/gameplay';
import { bountyTargetIdFor } from './arena-systems.js';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { REPAIR_MOVE_LIMIT, activateModule, cancelRepairFor, equipLoadout } from './loadout-system.js';
import { clamp, distanceSquared, normalize } from './physics.js';
import { compensatedLeadFactor, projectileSpeedEnabled } from './projectile-speed.js';
import { hasLineOfSight } from './world.js';

export type BotSkillTier = 'rookie' | 'veteran' | 'elite';
export type BotStyle = 'farmer' | 'hunter' | 'kiter' | 'brawler' | 'controller';

export interface TierProfile {
  reactionMs: number;
  aimError: number;
  /** Anteil der Zielbewegung, der beim Vorhalten berücksichtigt wird. */
  leadFactor: number;
  dodgeChance: number;
}

/**
 * Vorhalten ist DER Hebel für Ausweichbarkeit: Ein Bot mit leadFactor nahe 1
 * trifft rechnerisch immer, egal wie langsam das Projektil fliegt – er zielt
 * einfach weiter voraus. Erst ein Faktor deutlich unter 1 lässt Querbewegung
 * tatsächlich Kugeln ins Leere laufen. Deshalb hält selbst Elite nur ~0.78 vor.
 */
export const TIER_PROFILES: Record<BotSkillTier, TierProfile> = {
  rookie: { reactionMs: 430, aimError: 0.19, leadFactor: 0.3, dodgeChance: 0 },
  veteran: { reactionMs: 330, aimError: 0.13, leadFactor: 0.52, dodgeChance: 0.45 },
  elite: { reactionMs: 260, aimError: 0.09, leadFactor: 0.78, dodgeChance: 0.75 }
};

/** 40 % Rookie, 40 % Veteran, 20 % Elite – die Arena bleibt eine faire Mischung. */
export const TIER_SEQUENCE: readonly BotSkillTier[] = ['rookie', 'veteran', 'rookie', 'veteran', 'elite'];

/**
 * Start-Versätze der Rotation je Stil (Befund 75).
 *
 * Vorher hingen Tier und Klassenpfad am selben globalen Zähler wie der Stil
 * (Periode 10 gegen Periode 5): Der Bestand war in jeder Sitzung bit-identisch,
 * 12 Archetypen auf 18 Plätzen, kein Hunter je Elite – und die Siege-/Aegis-
 * Pfade unten wurden NIE gezogen, obwohl der Kommentar an der Controller-
 * Rotation sie ausdrücklich will. Jetzt zählt jeder Stil für sich, und die
 * Versätze sind so gewählt, dass die Standardarena (7/4/2/3/2 Bots je Stil)
 * alle acht Familien enthält: Siege über kiter[2], Aegis über brawler[3],
 * Impact über brawler[5], und der Hunter erreicht Elite. Tier-Mischung damit
 * 6/8/4 statt vorher 7/8/3. Gegenprobe: scripts/messungen/messung-75.mjs.
 */
const BOT_PATH_OFFSET: Record<BotStyle, number> = { farmer: 0, hunter: 0, kiter: 2, brawler: 3, controller: 0 };
const BOT_TIER_OFFSET: Record<BotStyle, number> = { farmer: 0, hunter: 3, kiter: 0, brawler: 2, controller: 3 };

export interface BotLoadout {
  module: ActiveModuleId;
  frame: PassiveModifierId;
}

export const BOT_LOADOUTS: Record<BotStyle, BotLoadout> = {
  farmer: { module: 'repair', frame: 'standard' },
  hunter: { module: 'dash', frame: 'stabilizer' },
  kiter: { module: 'dash', frame: 'lightweight' },
  brawler: { module: 'repulse', frame: 'reinforced' },
  controller: { module: 'repulse', frame: 'standard' }
};

export const BOT_CLASS_PATHS: Record<BotStyle, PlayerClass[][]> = {
  // Klassen 4.0: Jeder Pfad endet in seinem Familien-Apex, und je Stil kommt
  // ein Pfad durch eine der neuen Familien dazu (Kiter: SPECTER passt zum
  // Flankieren-und-Verschwinden; Farmer/Brawler: TEMPEST als Feuerteppich
  // bzw. schwerer Puls; Hunter: SPECTER als schwerer Schatten).
  farmer: [
    ['rapid', 'twin', 'storm', 'vortex'],
    ['rapid', 'repeater', 'gatling', 'vortex'],
    ['rapid', 'flanker', 'octo', 'vortex'],
    ['rapid', 'vanguard', 'hailstorm', 'vortex'],
    ['tempest', 'scorch', 'inferno', 'cataclysm']
  ],
  hunter: [
    ['sniper', 'railgun', 'lancer', 'eclipse'],
    ['sniper', 'hunter', 'phantom', 'eclipse'],
    ['specter', 'shade', 'eidolon'],
    ['sniper', 'ballista', 'siegebreaker', 'eclipse'],
    ['sniper', 'arbalest', 'deadeye', 'eclipse']
  ],
  kiter: [
    ['specter', 'wraith', 'mirage', 'eidolon'],
    ['sniper', 'hunter', 'phantom', 'eclipse'],
    ['siege', 'mortar', 'trebuchet', 'ragnarok'],
    ['sniper', 'arbalest', 'deadeye', 'eclipse'],
    ['specter', 'shade', 'eidolon']
  ],
  brawler: [
    ['rammer', 'crusher', 'juggernaut', 'leviathan'],
    ['rammer', 'bulwark', 'fortress', 'leviathan'],
    ['specter', 'shade', 'revenant'],
    ['aegis', 'reflector', 'retributor', 'sanctum'],
    ['tempest', 'surge', 'overload', 'cataclysm'],
    ['rammer', 'rampart', 'behemoth', 'leviathan'],
    ['rammer', 'blitz', 'comet', 'leviathan']
  ],
  controller: [
    ['drone', 'warden', 'overseer', 'sovereign'],
    ['drone', 'factory', 'carrier', 'sovereign'],
    // Klassen 4.1: die beiden neuen Familien gehoeren hierher, weil beide
    // Flaeche halten statt zu jagen - SIEGE ueber Stellung, AEGIS ueber Schild.
    ['siege', 'bombard', 'howitzer', 'ragnarok'],
    ['aegis', 'bulwarker', 'paladin', 'sanctum'],
    ['drone', 'sentinel', 'aviary', 'sovereign'],
    ['drone', 'guardian', 'hive', 'sovereign']
  ]
};

/** Frische Spieler unter diesem Level werden nicht aktiv gejagt. */
export const ROOKIE_PROTECTION_LEVEL = 8;
/** Höchstens so viele Bots verfolgen gleichzeitig dasselbe Ziel. */
export const MAX_ATTACKERS_PER_TARGET = 2;
/** So lange merkt sich ein Bot, wer ihn zuletzt getroffen hat. */
export const RETALIATION_MEMORY_MS = 6_000;

/**
 * Aggro-Pacing – die Regeln, nach denen ein Kampf auch mal endet.
 *
 * Der Befund (Sam, MASTERPLAN Handlungsfeld 2): Es wird durchgehend geschossen,
 * es gibt nie eine Verschnaufpause. Ursache ist nicht die einzelne Bot-Regel,
 * sondern dass keine davon je eine Jagd *beendet*: Wer im Sichtfeld ist, bleibt
 * Ziel, bis er tot ist oder außer Reichweite. Drei Zeitfenster und ein harter
 * Deckel ändern das – und der Farmer-Anteil steigt (`BOT_STYLES` in `game.ts`).
 *
 * Alle Werte sind bewusst benannt und über die Konfiguration austauschbar: Die
 * Telemetrie-Runde (P2) dreht später daran, ohne die Logik anzufassen.
 */
export interface BotPacingConfig {
  /** Nach einem Abschuss lässt der Bot so lange von allen Menschen ab. */
  readonly killDisengageMs: number;
  /** So lange darf ein Bot einen Menschen ohne eigenen Treffer verfolgen. */
  readonly huntTimeoutMs: number;
  /** Nach dem Abbruch ist genau dieser Mensch für diesen Bot so lange tabu. */
  readonly huntGiveUpMs: number;
  /** Harte Obergrenze gleichzeitiger Angreifer auf denselben Menschen. */
  readonly maxAttackersPerHuman: number;
  /** Wahrscheinlichkeit je Stil, einen sichtbaren Gegner überhaupt anzugehen. */
  readonly styleAggression: Readonly<Record<BotStyle, number>>;
}

export const DEFAULT_BOT_PACING: BotPacingConfig = {
  killDisengageMs: 6_000,
  huntTimeoutMs: 8_000,
  huntGiveUpMs: 6_000,
  maxAttackersPerHuman: 2,
  // Hunter und Brawler bleiben bei 1.0 – sie sind per Definition die Gegner,
  // die kommen. Die Ruhe entsteht bei den anderen drei Stilen und über die
  // Zeitfenster oben, nicht dadurch, dass jeder Bot zum Farmer wird.
  styleAggression: { farmer: 0.2, hunter: 1, kiter: 0.45, brawler: 1, controller: 0.4 }
};

interface BotState {
  style: BotStyle;
  targetId: string | null;
  targetShapeId: string | null;
  decisionAt: number;
  strafe: number;
  reactionMs: number;
  aimError: number;
  preferredDistance: number;
  fleeHealth: number;
  classPath: PlayerClass[];
  upgradePath: UpgradeId[];
  /** Gewollter Reparatur-Halt – Markierung für tuneRapidBots (Befund 79). */
  holdsStill?: boolean;
}

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  passiveModifier?: PassiveModifierId;
  bot: BotState | null;
}

interface RuntimeProjectile {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
}

interface BrainInternals {
  players: Map<string, RuntimePlayer>;
  shapes: Map<string, ShapeSnapshot>;
  projectiles: Map<string, RuntimeProjectile>;
  drones: Map<string, { ownerId: string; position: Vector2 }>;
  updateBot(player: RuntimePlayer, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
}

interface BotBrain {
  tier: BotSkillTier;
  equipped: boolean;
  lastAttackerId: string | null;
  lastAttackedAt: number;
  currentAimError: number;
  targetAcquiredAt: number;
  lastPosition: Vector2;
  /** Letzte Position, an der das Ziel SICHTBAR war – die Verfolgung fährt dorthin (Befund 77). */
  lastSeenPosition: Vector2 | null;
  lastMoveCheckAt: number;
  detourUntil: number;
  detourSign: number;
  nextModuleTryAt: number;
  holdUntil: number;
  /** Bis dahin sind Menschen nach einem eigenen Abschuss komplett tabu. */
  calmUntil: number;
  /** Der Mensch, dem dieser Bot die Flucht zugesteht – und bis wann. */
  escapedId: string | null;
  escapedUntil: number;
  /** Letzter eigener Treffer: gegen wen und wann (stellt den Jagd-Timeout neu). */
  lastHitTargetId: string | null;
  lastHitAt: number;
  /** Leerlauf-Richtung ohne Ziel (BO1) – gehalten bis wanderUntil, dann neu gewürfelt. */
  wanderAngle: number;
  wanderUntil: number;
}

interface GameBrainState {
  brains: Map<string, BotBrain>;
  /** Rotationszähler je Stil – entkoppelt Tier und Pfad vom Spawn-Index (Befund 75). */
  perStyle: Map<BotStyle, number>;
}

const states = new WeakMap<MazeGame, GameBrainState>();
const stateFor = (game: MazeGame): GameBrainState => {
  const existing = states.get(game);
  if (existing) return existing;
  const created: GameBrainState = { brains: new Map(), perStyle: new Map() };
  states.set(game, created);
  return created;
};

const rotate = (vector: Vector2, angle: number): Vector2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: vector.x * cosine - vector.y * sine, y: vector.x * sine + vector.y * cosine };
};

/**
 * Leerlauf-Richtung ohne Ziel (BO1) – Sam: „Die Bots bewegen sich sehr
 * komisch und sehr random und bothaft, nicht wie echte Spieler."
 *
 * Vorher: `Math.cos(now / 1800) …` – ein Bot ohne Ziel driftete in einem
 * mathematisch perfekten Kreis, ewig und ohne Beschleunigung. Gemessen
 * (messung-bot-bewegung.mjs) betrifft das nur 2,5 % aller Bot-Ticks, aber
 * genau dann fällt es am meisten auf: kein Mensch fährt einen exakten Kreis.
 *
 * Jetzt eine Richtung, gehalten für 1,4–3 s, dann neu gewürfelt – dieselbe
 * „entscheiden, dann eine Weile dabei bleiben"-Form wie `bot.decisionAt` im
 * Kampf, nur ohne Ziel. Die Richtung selbst bleibt Zufall (kein echtes
 * Pathfinding durchs Labyrinth) – das wäre ein eigenes, größeres Paket –,
 * aber sie hält lange genug, um wie eine Absicht statt wie ein Skript zu
 * wirken.
 */
const wanderDirection = (brain: BotBrain, now: number): Vector2 => {
  if (now >= brain.wanderUntil) {
    brain.wanderAngle = Math.random() * Math.PI * 2;
    brain.wanderUntil = now + 1400 + Math.random() * 1600;
  }
  return { x: Math.cos(brain.wanderAngle), y: Math.sin(brain.wanderAngle) };
};

/**
 * Ersetzt die eingebaute Bot-Steuerung durch faire, menschlichere Gegner:
 * Vorhalte-Zielen mit Streuung, Skill-Tiers, Wand-Ausweichen, Projektil-Dodge,
 * Modul-/Frame-Nutzung über dieselben Wege wie echte Spieler und eine
 * Zielwahl mit Anfängerschutz und Anti-Gang-up.
 *
 * `pacing = null` schaltet ausschließlich die Aggro-Pacing-Regeln ab; die
 * Zielwahl verhält sich dann exakt wie vor dem Paket (Test dafür vorhanden).
 */
export function tuneBotBrain<T extends MazeGame>(game: T, pacing: BotPacingConfig | null = DEFAULT_BOT_PACING): T {
  const internals = game as unknown as BrainInternals;
  const state = stateFor(game);

  const brainFor = (player: RuntimePlayer): BotBrain => {
    const existing = state.brains.get(player.id);
    if (existing) return existing;
    const bot = player.bot!;
    // Rotation je Stil statt am globalen Zähler (Befund 75): Pfad läuft die
    // Liste des Stils der Reihe nach ab; das Tier rückt bei jedem Pfad-Umlauf
    // eine Stufe weiter, damit sich (Tier, Pfad) erst nach 5 × Pfadlänge
    // wiederholt – sieben Farmer bekommen so sieben verschiedene Archetypen.
    const perStyle = state.perStyle.get(bot.style) ?? 0;
    state.perStyle.set(bot.style, perStyle + 1);
    const paths = BOT_CLASS_PATHS[bot.style];
    const tierIndex = (perStyle + Math.floor(perStyle / paths.length) + BOT_TIER_OFFSET[bot.style]) % TIER_SEQUENCE.length;
    const tier = TIER_SEQUENCE[tierIndex] ?? 'rookie';
    const profile = TIER_PROFILES[tier];
    bot.reactionMs = profile.reactionMs;
    bot.aimError = profile.aimError;
    bot.classPath = paths[(perStyle + BOT_PATH_OFFSET[bot.style]) % paths.length] ?? bot.classPath;
    const created: BotBrain = {
      tier,
      equipped: false,
      lastAttackerId: null,
      lastAttackedAt: 0,
      currentAimError: 0,
      targetAcquiredAt: 0,
      lastPosition: { ...player.position },
      lastSeenPosition: null,
      lastMoveCheckAt: 0,
      detourUntil: 0,
      detourSign: 1,
      nextModuleTryAt: 0,
      holdUntil: 0,
      calmUntil: 0,
      escapedId: null,
      escapedUntil: 0,
      lastHitTargetId: null,
      lastHitAt: 0,
      wanderAngle: 0,
      wanderUntil: 0
    };
    state.brains.set(player.id, created);
    return created;
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    // Vor dem Schaden merken, ob er überhaupt ankommt: `damagePlayer` steigt bei
    // toten und unverwundbaren Zielen aus, danach ist `dead` nicht mehr aussagekräftig.
    const landed = !target.dead && !target.invulnerable;
    originalDamagePlayer(target, damage, attackerId, now);
    if (!attackerId || attackerId === target.id) return;
    if (target.bot) {
      const brain = state.brains.get(target.id);
      if (brain) {
        brain.lastAttackerId = attackerId;
        brain.lastAttackedAt = now;
        brain.holdUntil = 0;
        // Der Halt ist vorbei – die Markierung fällt mit (Befund 79).
        target.bot.holdsStill = false;
      }
    }
    // Ein eigener Treffer ist Fortschritt und stellt den Jagd-Timeout neu.
    const attackerBrain = landed ? state.brains.get(attackerId) : undefined;
    if (attackerBrain) {
      attackerBrain.lastHitTargetId = target.id;
      attackerBrain.lastHitAt = now;
    }
  };

  // Verschnaufpause nach einem Abschuss: Der Bot zieht sich von Menschen zurück
  // und farmt stattdessen. Ohne das startet die nächste Jagd in der Sekunde, in
  // der das Opfer wieder einsteigt – genau der Dauerdruck aus Sams Feedback.
  const originalKillPlayer = internals.killPlayer.bind(internals);
  internals.killPlayer = (
    target: RuntimePlayer,
    attackerId: string | null,
    now: number,
    environmentName: string
  ): void => {
    const alreadyDead = target.dead;
    originalKillPlayer(target, attackerId, now, environmentName);
    if (!pacing || alreadyDead || !attackerId || attackerId === target.id) return;
    const killer = internals.players.get(attackerId);
    const brain = state.brains.get(attackerId);
    if (!killer?.bot || !brain) return;
    brain.calmUntil = now + pacing.killDisengageMs;
    const quarry = killer.bot.targetId ? internals.players.get(killer.bot.targetId) : undefined;
    if (quarry && !quarry.isBot) killer.bot.targetId = null;
    // Sofort neu entscheiden statt bis zum nächsten Reaktionsfenster weiterzuzielen.
    killer.bot.decisionAt = 0;
  };

  const countTargeters = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const candidate of internals.players.values()) {
      const targetId = candidate.bot?.targetId;
      if (!candidate.dead && targetId) counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
    return counts;
  };

  const think = (player: RuntimePlayer, now: number): void => {
    const bot = player.bot;
    if (!bot) return;
    const brain = brainFor(player);
    const profile = TIER_PROFILES[brain.tier];
    const stats = tunedStatsFor(player);
    const isDroneClass = stats.droneCount > 0;

    if (!brain.equipped && (player.invulnerable || player.dead)) {
      const loadout = BOT_LOADOUTS[bot.style];
      brain.equipped = equipLoadout(game, player.id, loadout.module, loadout.frame, now);
    }

    if (now - brain.lastMoveCheckAt > 350) {
      const moved = Math.hypot(player.position.x - brain.lastPosition.x, player.position.y - brain.lastPosition.y);
      const intending = Math.hypot(player.move.x, player.move.y) > 0.3;
      if (intending && moved < 7 && brain.detourUntil < now) {
        brain.detourUntil = now + 700;
        brain.detourSign = Math.random() < 0.5 ? 1 : -1;
      }
      brain.lastPosition = { ...player.position };
      brain.lastMoveCheckAt = now;
    }

    // Jagd-Timeout: Wer einem Menschen zu lange erfolglos hinterherläuft, gibt
    // auf – wer entkommen ist, ist entkommen. Die Uhr läuft ab dem Zielwechsel
    // und wird von jedem eigenen Treffer auf genau dieses Ziel neu gestellt.
    if (pacing && bot.targetId) {
      const quarry = internals.players.get(bot.targetId);
      if (quarry && !quarry.isBot) {
        const lastProgress = brain.lastHitTargetId === quarry.id
          ? Math.max(brain.targetAcquiredAt, brain.lastHitAt)
          : brain.targetAcquiredAt;
        if (now - lastProgress > pacing.huntTimeoutMs) {
          brain.escapedId = quarry.id;
          brain.escapedUntil = now + pacing.huntGiveUpMs;
          bot.targetId = null;
          bot.decisionAt = 0;
        }
      }
    }

    if (now >= bot.decisionAt) {
      const targetCounts = countTargeters();
      const bountyId = bountyTargetIdFor(game);
      let bestEnemy: RuntimePlayer | null = null;
      let bestScore = -Infinity;
      for (const candidate of internals.players.values()) {
        if (candidate.id === player.id || candidate.dead || candidate.invulnerable) continue;
        const squared = distanceSquared(candidate.position, player.position);
        if (squared > 1050 * 1050 || !hasLineOfSight(player.position, candidate.position)) continue;
        const attackedMe = brain.lastAttackerId === candidate.id && now - brain.lastAttackedAt < RETALIATION_MEMORY_MS;
        if (candidate.level < ROOKIE_PROTECTION_LEVEL && !attackedMe) continue;
        if (pacing && !candidate.isBot) {
          // Drei Sperren, die nur für Menschen gelten – Bots dürfen sich weiter
          // ungebremst zerlegen, das kostet niemanden Nerven.
          if (now < brain.calmUntil) continue;
          if (brain.escapedId === candidate.id && now < brain.escapedUntil) continue;
          // Angreifer-Deckel, jetzt hart: Auch Vergeltung öffnet keinen dritten
          // Platz. Das eigene Ziel zählt nicht mit, sonst gäbe ein Bot seinen
          // bereits belegten Platz bei jeder Entscheidung wieder her.
          const others = (targetCounts.get(candidate.id) ?? 0) - (bot.targetId === candidate.id ? 1 : 0);
          if (others >= pacing.maxAttackersPerHuman) continue;
        } else {
          const alreadyHunted = (targetCounts.get(candidate.id) ?? 0) >= MAX_ATTACKERS_PER_TARGET;
          if (alreadyHunted && bot.targetId !== candidate.id && !attackedMe) continue;
        }
        let score = 900 - Math.sqrt(squared);
        score -= Math.abs(candidate.level - player.level) * 14;
        if (attackedMe) score += 500;
        if (candidate.id === bountyId) score += 260;
        if (score > bestScore) {
          bestScore = score;
          bestEnemy = candidate;
        }
      }

      const wasAttacked = brain.lastAttackerId !== null && now - brain.lastAttackedAt < RETALIATION_MEMORY_MS;
      // Stil entscheidet, wie leicht ein Bot vom Farmen ablässt. Vorher galten
      // pauschal 60 % für alle außer Hunter und Brawler – ein Farmer war damit
      // nur dem Namen nach friedlich.
      //
      // Der Wurf gilt der AUFNAHME eines Gefechts, nicht seiner Fortsetzung
      // (Befund 71, Sams Entscheidung): Vorher wurde je Entscheidung
      // (195–538 ms) neu gewürfelt – ein Farmer hielt ein Ziel im Median
      // 0,38 s, es entstand nie ein Kampf, nur ein Flackern. Wer sein Ziel
      // schon hat, behält es, bis huntTimeout, Sichtverlust, calmUntil oder
      // der Tod es beenden – genau die Bedeutung, die der Kommentar an
      // styleAggression („einen sichtbaren Gegner überhaupt anzugehen")
      // immer schon behauptet hat. Gegenprobe: messung-71a/b.
      const engaged = bestEnemy !== null && bot.targetId === bestEnemy.id;
      const aggressive = engaged || wasAttacked || (pacing
        ? Math.random() < pacing.styleAggression[bot.style]
        : bot.style === 'hunter' || bot.style === 'brawler' || Math.random() > 0.4);
      if (bestEnemy && aggressive) {
        if (bot.targetId !== bestEnemy.id) brain.targetAcquiredAt = now;
        bot.targetId = bestEnemy.id;
        bot.targetShapeId = null;
        brain.lastSeenPosition = { ...bestEnemy.position };
      } else {
        // Gedächtnis statt Wegfindung (Befund 77, Sams Entscheidung): Ein
        // Schritt um die Ecke löschte den Kontakt im Median nach 275 ms
        // ersatzlos – Deckung war ein Ausschalter, kein Zug im Duell. Wer
        // sein Ziel nur aus den Augen verloren hat, behält es und fährt zur
        // letzten bekannten Position (Bewegungsteil unten); erst das
        // Jagd-Timeout, der Tod des Ziels oder das Erreichen des leeren
        // Orts beenden die Verfolgung. Gegenprobe: messung-77.
        const quarry = bot.targetId ? internals.players.get(bot.targetId) : undefined;
        const verfolgt = Boolean(quarry && !quarry.dead && brain.lastSeenPosition
          && now - Math.max(brain.targetAcquiredAt, brain.lastHitTargetId === bot.targetId ? brain.lastHitAt : 0)
            <= (pacing?.huntTimeoutMs ?? 8_000));
        if (!verfolgt) {
          const shape = [...internals.shapes.values()]
            .filter((candidate) => hasLineOfSight(player.position, candidate.position))
            .sort((a, b) => distanceSquared(a.position, player.position) - distanceSquared(b.position, player.position))[0];
          bot.targetShapeId = shape?.id ?? null;
          bot.targetId = null;
          brain.lastSeenPosition = null;
        }
      }
      brain.currentAimError = (Math.random() - 0.5) * 2 * profile.aimError;
      // BO1 – Sam: „bewegen sich sehr komisch und sehr random." Gemessen
      // (messung-bot-bewegung.mjs): Bei 22 % Umkehrchance je Entscheidung
      // (alle 195–538 ms) drehte ein Bot seine Strafe-Richtung im Schnitt
      // alle 2,2 s um – auf 24 Bots zusammen knapp elfmal pro Sekunde ein
      // Richtungssprung, unabhängig vom Kampfgeschehen ausgewürfelt. 10 %
      // hält dieselbe Streuung über die Zeit, aber seltener.
      if (Math.random() < 0.1) bot.strafe *= -1;
      bot.decisionAt = now + bot.reactionMs * (0.75 + Math.random() * 0.5);
    }

    const enemy = bot.targetId ? internals.players.get(bot.targetId) : undefined;
    const shape = bot.targetShapeId ? internals.shapes.get(bot.targetShapeId) : undefined;
    const enemyDistance = enemy ? Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y) : Infinity;
    const healthRatio = player.health / Math.max(1, player.maxHealth);
    // Sichtlinie entscheidet zwischen Jagd auf den Tank und Fahrt zur letzten
    // bekannten Position (Befund 77). Solange das Ziel sichtbar ist, wandert
    // die Merkposition mit; ohne Sicht wird sie angefahren – und wer dort
    // ankommt und niemanden vorfindet, gibt auf wie beim Jagd-Timeout.
    const enemyVisible = enemy !== undefined && hasLineOfSight(player.position, enemy.position);
    if (enemy && enemyVisible) brain.lastSeenPosition = { ...enemy.position };
    let pursuit: Vector2 | null = null;
    if (enemy && !enemyVisible) {
      pursuit = brain.lastSeenPosition;
      const arrived = pursuit !== null
        && Math.hypot(pursuit.x - player.position.x, pursuit.y - player.position.y) < 90;
      if (pursuit === null || arrived) {
        if (pacing && !enemy.isBot) {
          brain.escapedId = enemy.id;
          brain.escapedUntil = now + pacing.huntGiveUpMs;
        }
        bot.targetId = null;
        brain.lastSeenPosition = null;
        bot.decisionAt = 0;
        player.move = wanderDirection(brain, now);
        player.primary = false;
        player.secondary = false;
        return;
      }
    }

    if (!player.invulnerable && now >= brain.nextModuleTryAt) {
      const loadout = BOT_LOADOUTS[bot.style];
      let wantsModule = false;
      if (loadout.module === 'repair') wantsModule = healthRatio < 0.68 && enemyDistance > 650;
      else if (loadout.module === 'dash') wantsModule = healthRatio < bot.fleeHealth && enemyDistance < 600;
      else if (loadout.module === 'repulse') {
        const nearbyDrones = [...internals.drones.values()]
          .filter((drone) => drone.ownerId !== player.id && distanceSquared(drone.position, player.position) < 150 * 150).length;
        wantsModule = nearbyDrones >= 2 || enemyDistance < 130;
      }
      const rolling = Math.hypot(player.velocity.x, player.velocity.y) > REPAIR_MOVE_LIMIT;
      if (wantsModule && loadout.module === 'repair' && rolling) {
        // Erst anhalten, dann reparieren. Ein Zyklus, der in Fahrt beginnt,
        // stirbt im selben Tick – frueher verbrannte der Bot damit still seine
        // Abklingzeit, seit dieser Runde weist die Aktivierung ihn zurueck.
        brain.holdUntil = now + 600;
        brain.nextModuleTryAt = now + 150;
      } else if (wantsModule && activateModule(game, player.id, now)) {
        if (loadout.module === 'repair') brain.holdUntil = now + 3_800;
        brain.nextModuleTryAt = now + 1_200;
      } else if (wantsModule) {
        brain.nextModuleTryAt = now + 900;
      }
    }

    if (brain.holdUntil > now && enemyDistance > 520) {
      // Gewollter Stillstand, als Markierung nach außen sichtbar: tuneRapidBots
      // übersetzte den Halt sonst zurück in Fahrt, und die Reparatur begann
      // nie (Befund 79 – 0 bis 1 Zyklen in 4 min gegen 1 bis 5 ohne Schicht).
      bot.holdsStill = true;
      player.move = { x: 0, y: 0 };
      player.primary = false;
      player.secondary = false;
      return;
    }
    brain.holdUntil = 0;
    bot.holdsStill = false;

    // Während der Verfolgung zählt die Merkposition, nicht der (durch die
    // Wand bekannte) echte Ort des Ziels – sonst zielte der Bot durch Mauern.
    const target = (enemy ? (enemyVisible ? enemy.position : pursuit) : null) ?? shape?.position;
    if (!target) {
      let wander = wanderDirection(brain, now);
      // Dieselbe Ausweich-Erkennung wie im Kampf: Ohne sie lief ein
      // Leerlauf-Bot, der sich in einer Wand verkeilt, dort einfach weiter
      // gegen die Wand, statt auszuweichen wie in Bewegung mit Ziel.
      if (brain.detourUntil > now) wander = rotate(wander, Math.PI / 2 * brain.detourSign);
      player.move = wander;
      player.primary = false;
      player.secondary = false;
      return;
    }

    const delta = { x: target.x - player.position.x, y: target.y - player.position.y };
    const distance = Math.hypot(delta.x, delta.y);
    const direction = normalize(delta);

    let aimPoint = { ...target };
    if (enemy && enemyVisible && stats.projectileSpeed > 0) {
      const travelTime = distance / Math.max(1, stats.projectileSpeed);
      // Langsamere Kugeln heißen längere Flugzeit – und der absolute
      // Vorhaltfehler eines Bots wächst linear mit ihr. Ohne Ausgleich träfen
      // die Bots nach Projektiltempo 2.0 still schlechter, ohne dass jemand am
      // Pacing gedreht hätte. Ohne Schalter ist der Ausgleich wirkungslos.
      const lead = projectileSpeedEnabled()
        ? compensatedLeadFactor(profile.leadFactor, travelTime)
        : profile.leadFactor;
      aimPoint = {
        x: target.x + enemy.velocity.x * travelTime * lead,
        y: target.y + enemy.velocity.y * travelTime * lead
      };
    }
    const aimDelta = { x: aimPoint.x - player.position.x, y: aimPoint.y - player.position.y };
    const aimDirection = rotate(normalize(aimDelta), brain.currentAimError);
    const aimLength = Math.min(GAME.maxAimDistance, Math.max(120, Math.hypot(aimDelta.x, aimDelta.y)));
    player.aim = { x: aimDirection.x * aimLength, y: aimDirection.y * aimLength };

    const badlyOutmatched = enemy !== undefined && enemy.level - player.level > 12 && healthRatio < 0.75;
    const fleeing = healthRatio < bot.fleeHealth || badlyOutmatched;
    /*
     * BO1 – der zweite, größere Anteil an den gemessenen Richtungssprüngen
     * (messung-bot-bewegung.mjs): `radial` war eine Stufenfunktion mit zwei
     * harten Kanten genau bei ±80 px um `preferredDistance`. Pendelt der
     * Abstand knapp um eine dieser Kanten (durch die eigene Streu-Bewegung
     * fast unvermeidlich), sprang `radial` jeden Tick zwischen 0,05 (fast
     * reines Strafen) und ±1/−0,7 (fast reine An- oder Rückfahrt) – ein
     * Vielfaches größerer Ausschlag in `move` als jeder Strafe-Wechsel. Eine
     * einzige geklemmte Rampe trifft dieselben drei Eckwerte (−0,7 nah, ~0
     * Mitte, 1 fern) ohne die Kante dazwischen.
     */
    const radial = fleeing ? -1 : clamp((distance - bot.preferredDistance) / 80, -0.7, 1);
    let move = normalize({
      x: direction.x * radial - direction.y * bot.strafe * 0.55,
      y: direction.y * radial + direction.x * bot.strafe * 0.55
    });

    if (profile.dodgeChance > 0 && Math.random() < profile.dodgeChance) {
      for (const projectile of internals.projectiles.values()) {
        if (projectile.ownerId === player.id) continue;
        if (distanceSquared(projectile.position, player.position) > 300 * 300) continue;
        const toBot = normalize({ x: player.position.x - projectile.position.x, y: player.position.y - projectile.position.y });
        const heading = normalize(projectile.velocity);
        if (heading.x * toBot.x + heading.y * toBot.y < 0.85) continue;
        const side = Math.sign(heading.x * toBot.y - heading.y * toBot.x) || 1;
        move = normalize({ x: move.x - heading.y * side * 1.4, y: move.y + heading.x * side * 1.4 });
        break;
      }
    }

    if (brain.detourUntil > now) move = rotate(move, Math.PI / 2 * brain.detourSign);
    player.move = move;

    // Ohne Sichtlinie wird nicht gefeuert – die Fahrt zur Merkposition ist
    // Verfolgung, kein Beschuss der Wand (Befund 77).
    const mayFire = enemy === undefined || enemyVisible;
    if (isDroneClass) {
      /*
       * Rechtsklick als Rückzugsschild – Sam: „Die Bots benutzen bei Drohnen
       * kein Rechtsklick."
       *
       * Vorher löste `secondary` bei jedem nahen Gegner aus (< 230 px), egal
       * ob der Bot gerade angriff oder floh. Das drückte die eigene Flotte
       * genau dann vom Gegner weg, wenn Kontaktschaden am meisten brachte –
       * die seltenste, am wenigsten sinnvolle Gelegenheit für den Knopf.
       *
       * Jetzt fällt die Entscheidung mit derselben Flucht-Erkennung, die auch
       * die Bewegung umkehrt (`fleeing`, Zeile oben): Ein Bot, der wegläuft,
       * schiebt seine Drohnen als Schild zwischen sich und den Verfolger –
       * `aim` zeigt bereits auf den Gegner, „weg vom Zeiger" trifft also die
       * richtige Richtung. Im Angriff bleibt der Klick aus; dort erledigt die
       * automatische Zielsuche (Stufe 1) den Kontakt ohnehin von selbst.
       */
      player.secondary = Boolean(enemy && enemyVisible && distance < 300 && fleeing);
      player.primary = !player.secondary && distance < 900 && mayFire;
      return;
    }
    player.secondary = false;
    const range = Math.min(bot.style === 'kiter' ? 1150 : 900, stats.projectileSpeed * stats.projectileLife * 0.92 + 60);
    const reactionReady = !enemy || now - brain.targetAcquiredAt >= profile.reactionMs * 0.5;
    player.primary = distance < range && reactionReady && mayFire;
  };

  /*
   * ERSETZT, nicht umschlossen: `updateBot` der Basis wird hier komplett neu
   * geschrieben. Damit gilt dieselbe Pflicht wie in `combat-tuning.ts` -- jede
   * Regel der Basis muss mitgeschrieben werden, und wer eine weitere Methode
   * ersetzt, vergleicht sie vorher Zeile fuer Zeile.
   */
  internals.updateBot = (player: RuntimePlayer, now: number): void => {
    if (!player.bot) return;
    think(player, now);
    // Dieselben Regeln wie für echte Eingaben: Handeln beendet Spawn-Schutz und Repair.
    const acting = Math.hypot(player.move.x, player.move.y) > 0.12 || player.primary || player.secondary;
    if (player.invulnerable && acting) {
      player.invulnerable = false;
      player.invulnerableUntil = 0;
    }
    if (player.primary || player.secondary) cancelRepairFor(game, player.id, now);
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    stateFor(game).brains.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Sichtbarer Skill-Tier eines Bots (für Tests und Debug-Anzeigen). */
export function botTierFor(game: MazeGame, playerId: string): BotSkillTier | null {
  return states.get(game)?.brains.get(playerId)?.tier ?? null;
}
