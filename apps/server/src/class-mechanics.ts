import {
  CLASS_DEFINITIONS,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type Vector2
} from '@project-maze/shared';
import { type PassiveModifierId } from '@project-maze/shared/gameplay';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  velocity: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  bot: unknown | null;
  passiveModifier?: PassiveModifierId;
}
interface RuntimeProjectile extends ProjectileSnapshot {
  damage: number;
  life: number;
}
interface RuntimeStats {
  damage: number;
  projectileSpeed: number;
  penetration: number;
  barrelSpread: number;
}
interface MechanicsInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  fire(player: RuntimePlayer, stats: RuntimeStats): void;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
}

const PRECISION_RECOIL: Partial<Record<PlayerClass, number>> = {
  sniper: 20,
  hunter: 16,
  railgun: 34,
  phantom: 26,
  lancer: 52,
  arbalest: 18,
  deadeye: 24
};

/** Deadeye: Bonusschaden gegen schwer verwundete Ziele (Exekution). */
const EXECUTION_THRESHOLD = 0.3;
const EXECUTION_BONUS = 1.25;

const FIRE_RECOIL: Partial<Record<PlayerClass, number>> = {
  core: 3,
  rapid: 2,
  twin: 2.5,
  repeater: 3,
  storm: 4,
  gatling: 5,
  sniper: 7,
  hunter: 6,
  railgun: 14,
  phantom: 10,
  lancer: 20,
  arbalest: 9,
  deadeye: 12,
  rammer: 2,
  crusher: 2,
  bulwark: 4,
  juggernaut: 2,
  fortress: 5,
  flanker: 2.5,
  octo: 3,
  blitz: 2,
  comet: 2
};

interface GatlingState {
  heat: number;
  lastShotAt: number;
}

const gatlingStates = new Map<string, GatlingState>();

const frontalArmor = (playerClass: PlayerClass): number => {
  if (playerClass === 'fortress') return 0.38;
  if (playerClass === 'bulwark') return 0.26;
  return 0;
};

const directionFrom = (from: Vector2, to: Vector2): Vector2 => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return length < 0.001 ? { x: 0, y: 0 } : { x: dx / length, y: dy / length };
};

/**
 * Fairness gegen niedrigstufige Ziele (Sam, 13.08.: „high lvl nicht schnell
 * killen aber dafür [die kleinen] schneller abhauen können").
 *
 * Gemessen an einem Vortex L60 gegen einen frischen L1: Der L60 trug bei
 * ausgewogenem Punkteeinsatz 273 statt 96 DPS (2,84x), aber nur 224 statt
 * 118 Leben (1,9x) und 364 statt 280 Tempo (1,3x) – die Zeit bis zum Tod fiel
 * von rund 4,2 s (L1 gegen L60) auf 0,4 s (L60 gegen L1), ein Faktor 10.
 * Genau das ist „fühlt sich unbesiegbar an".
 *
 * Zwei Hebel, ein Auslöser (der Treffer selbst):
 * 1. Schaden eines deutlich höherstufigen Angreifers wird gedämpft – gedeckelt,
 *    nicht aufgehoben, sonst würde Fortschritt gegen Unterlegene wertlos.
 * 2. Wer so getroffen wird, bekommt kurz mehr Tempo – das Fenster, um
 *    tatsächlich abzuhauen, nicht nur langsamer zu sterben.
 *
 * Unter `FREIE_DIFFERENZ` passiert nichts: normale Levelspannen (z. B. L20
 * gegen L30) sind gewolltes Matchmaking, keine Schieflage.
 */
const LEVEL_FAIRNESS = {
  /** Bis zu dieser Differenz: unverändert. */
  freieDifferenz: 15,
  /** Ab dieser Differenz: volle Wirkung. */
  volleDifferenz: 45,
  /** Schadensabschlag am Deckel. 0.35 = −35 %. */
  maxSchadensabschlag: 0.35,
  /** Tempo-Zuschlag am Deckel für die Flucht. 0.3 = +30 %. */
  fluchtBonus: 0.3,
  /** Dauer des Flucht-Tempos. */
  fluchtDauerMs: 2500
};

/** 0 unterhalb der freien Differenz, linear bis 1 am Deckel. */
const stufenFaktor = (differenz: number): number => {
  const ueberschuss = Math.max(0, differenz - LEVEL_FAIRNESS.freieDifferenz);
  const spanne = LEVEL_FAIRNESS.volleDifferenz - LEVEL_FAIRNESS.freieDifferenz;
  return Math.min(1, ueberschuss / spanne);
};

/** Wer gerade flieht: Spieler-Id → Ablaufzeit und Tempofaktor. */
const fluchtBoost = new Map<string, { until: number; factor: number }>();

/** Adds readable branch mechanics without weakening server authority. */
export function tuneClassMechanics<T extends MazeGame>(game: T): T {
  const internals = game as unknown as MechanicsInternals;

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    const attacker = attackerId ? internals.players.get(attackerId) : undefined;
    let adjustedDamage = damage;

    const armor = frontalArmor(target.playerClass);
    if (armor > 0 && attacker) {
      const toAttacker = directionFrom(target.position, attacker.position);
      const forward = { x: Math.cos(target.angle), y: Math.sin(target.angle) };
      const frontDot = forward.x * toAttacker.x + forward.y * toAttacker.y;
      if (frontDot > 0.25) adjustedDamage *= 1 - armor;
    }
    if (target.playerClass === 'juggernaut') adjustedDamage *= 0.92;
    if (
      attacker?.playerClass === 'deadeye' &&
      target.health <= target.maxHealth * EXECUTION_THRESHOLD
    ) adjustedDamage *= EXECUTION_BONUS;

    if (attacker) {
      const faktor = stufenFaktor(attacker.level - target.level);
      if (faktor > 0) {
        adjustedDamage *= 1 - faktor * LEVEL_FAIRNESS.maxSchadensabschlag;
        fluchtBoost.set(target.id, {
          until: now + LEVEL_FAIRNESS.fluchtDauerMs,
          factor: 1 + faktor * LEVEL_FAIRNESS.fluchtBonus
        });
      }
    }

    const healthBefore = target.health;
    originalDamagePlayer(target, adjustedDamage, attackerId, now);

    if (!attacker || target.dead || target.health >= healthBefore) return;
    const impulse = PRECISION_RECOIL[attacker.playerClass] ?? 0;
    if (impulse <= 0) return;
    const away = directionFrom(attacker.position, target.position);
    target.velocity.x += away.x * impulse;
    target.velocity.y += away.y * impulse;
  };

  const originalFire = internals.fire.bind(internals);
  internals.fire = (player: RuntimePlayer, stats: RuntimeStats): void => {
    const existing = new Set(internals.projectiles.keys());
    let firingStats = stats;

    if (player.playerClass === 'gatling') {
      const now = Date.now();
      const previous = gatlingStates.get(player.id);
      const heat = previous && now - previous.lastShotAt <= 720
        ? Math.min(1, previous.heat + 0.2)
        : 0.2;
      gatlingStates.set(player.id, { heat, lastShotAt: now });
      firingStats = {
        ...stats,
        barrelSpread: stats.barrelSpread * (1 - heat * 0.55)
      };
    } else {
      gatlingStates.delete(player.id);
    }

    originalFire(player, firingStats);

    const aimLength = Math.hypot(player.aim.x, player.aim.y);
    const direction = aimLength < 0.001
      ? { x: Math.cos(player.angle), y: Math.sin(player.angle) }
      : { x: player.aim.x / aimLength, y: player.aim.y / aimLength };
    const recoil = FIRE_RECOIL[player.playerClass] ?? 0;
    player.velocity.x -= direction.x * recoil;
    player.velocity.y -= direction.y * recoil;

    const movementSpeed = Math.hypot(player.velocity.x, player.velocity.y);
    for (const [id, projectile] of internals.projectiles) {
      if (existing.has(id)) continue;
      if (player.playerClass === 'phantom' && movementSpeed > CLASS_DEFINITIONS.phantom.moveSpeed * 0.55) {
        projectile.damage *= 1.1;
        projectile.integrity *= 1.08;
        projectile.maxIntegrity *= 1.08;
      }
      if (player.playerClass === 'hunter') {
        projectile.velocity.x += player.velocity.x * 0.14;
        projectile.velocity.y += player.velocity.y * 0.14;
      }
      if (player.playerClass === 'lancer') projectile.life *= 1.08;
      if (player.playerClass === 'storm') {
        // 0.95 statt 1.18: Der Projektiltempo-Dämpfer verlängert die Lebenszeit
        // um ein Viertel – also stehen dauerhaft ~25 % mehr Storm-Kugeln in der
        // Luft. Der gesenkte Bonus fängt genau diesen Neben-Buff der Kugelwand
        // wieder ein (Analyse 02, .probe/damper2.mjs).
        projectile.integrity *= 0.95;
        projectile.maxIntegrity *= 0.95;
      }
    }
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    originalStepPlayer(player, dt, now);
    if (player.dead) return;
    const boost = fluchtBoost.get(player.id);
    if (!boost) return;
    if (now >= boost.until) { fluchtBoost.delete(player.id); return; }
    /*
     * Deckel statt Multiplikation, gemessen (`messung-bal2-fairness.mjs`):
     * `velocity *= factor` JEDEN Tick, wie perks.ts es mit seinen eigenen
     * Tempo-Faktoren macht, geht hier schief. Dort zieht `moveVectorToward`
     * die Geschwindigkeit nur um `acceleration * dt` Richtung Wunschtempo
     * zurück – eine FESTE Schrittweite –, während die Multiplikation
     * PROPORTIONAL zur aktuellen Geschwindigkeit wächst. Ab einer Geschwin-
     * digkeit, bei der 30 % mehr als die feste Schrittweite sind, gewinnt
     * die Multiplikation gegen die Korrektur, und beide schaukeln sich über
     * wenige Ticks zu absurden Werten hoch (10 550 statt 351 px/s gemessen).
     * Ein harter Deckel auf `Tempo × Faktor` kann das nicht: Das Ergebnis
     * ist rechnerisch nie größer als die Decke, egal wie oft der Tick läuft.
     */
    const stats = tunedStatsFor(player);
    const decke = stats.moveSpeed * boost.factor;
    const tempo = Math.hypot(player.velocity.x, player.velocity.y);
    if (tempo > 0.001 && tempo < decke) {
      const skala = Math.min(decke / tempo, boost.factor);
      player.velocity.x *= skala;
      player.velocity.y *= skala;
    }
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    gatlingStates.delete(id);
    fluchtBoost.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
