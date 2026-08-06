import { type PlayerClass } from '@project-maze/shared';
import { ROOKIE_PROTECTION_LEVEL } from './bot-brain.js';
import { tunedStatsFor } from './combat-tuning.js';
import { familyBuildRate, familyUpgradeLevel, wuchtConfigFor } from './family-upgrades.js';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  isMovingFast,
  signatureStateFor,
  type SignatureRuntimePlayer,
  type SignatureState
} from './signature.js';

/**
 * Klassen 3.0 – Signature der IMPACT-Familie: **Wucht**.
 *
 * Der Anlauf-Skalar läuft in Fahrt hoch und im Stand ab – gleiche Bauart wie
 * Momentum, gemeinsamer Unterbau in `signature.ts`. Zwei Dinge machen ihn zu
 * einer anderen Spielweise:
 *
 * 1. **Er hängt nicht am Feuern.** Impact lädt allein durch Fahren auf. Wer
 *    Abstand nimmt und wieder Anlauf holt, ist der bessere Impact-Spieler.
 * 2. **Er wird beim Aufprall verbraucht.** Ein Kontakt zieht die Ladung in
 *    Sekundenbruchteilen leer (`contactDrainPerSecond`). Wucht ist damit ein
 *    *Rammstoß*, kein Dauerbuff – und genau deshalb kann sie sich nicht zu
 *    einem One-Shot aufstauen.
 *
 * Bewusst **ohne Wandmechanik**: `moveCircle` nullt die blockierte Achse, ein
 * Anlauf-Erhalt an Wänden wäre eine Änderung der Bewegungsintegration – also
 * genau der Stelle, die der Client für N2 identisch nachbauen muss. Kommt
 * frühestens danach (KL1-Empfehlung, von 01 übernommen).
 */

export interface WuchtConfig {
  /** Aufbau je Sekunde in Fahrt. */
  readonly buildPerSecond: number;
  /** Abbau je Sekunde im Stillstand. */
  readonly decayPerSecond: number;
  /** Ab diesem Anteil der eigenen Höchstgeschwindigkeit gilt „in Fahrt". */
  readonly moveThreshold: number;
  /** Aufschlag auf den Körperschaden bei vollem Anlauf. 1.5 = ×2,5. */
  readonly maxBodyDamageBonus: number;
  /** So schnell verbraucht ein Dauerkontakt die Ladung. */
  readonly contactDrainPerSecond: number;
  /**
   * Harte Obergrenze: Ein einzelner Kontakttick nimmt nie mehr als diesen
   * Anteil des Maximallebens des Opfers. Senkt nie unter den Grundschaden –
   * ohne Wucht ändert sich dadurch nichts.
   */
  readonly maxContactShare: number;
}

export const DEFAULT_WUCHT: WuchtConfig = {
  // Gleiche Taktung wie Momentum: 3,3 s bis Vollausschlag, 2 s zurück auf null.
  buildPerSecond: 30,
  decayPerSecond: 50,
  moveThreshold: 0.45,
  maxBodyDamageBonus: 1.5,
  // 0,17 s Dauerkontakt verbrauchen eine volle Ladung. Dieser Wert ist der
  // eigentliche Schutz gegen den Ramm-Tod: Er begrenzt, was *ein* Anlauf
  // insgesamt austeilen kann, statt nur den einzelnen Tick zu deckeln.
  // Kalibriert gegen WUCHT_MAX_TTK_GAIN (siehe unten): 250/s ergaben −50 %
  // Zeit bis zum Tod, 600/s ergeben −23 %.
  contactDrainPerSecond: 600,
  maxContactShare: 0.08
};

/**
 * Der Prüfstein für „kein Ramm-Tod aus dem Nichts": Ein voller Anlauf darf die
 * Zeit bis zum Tod eines **frischen, gleichlevelig** Gegners um höchstens ein
 * Viertel verkürzen. Ein Test misst das für jede Impact-Klasse gegen den
 * dünnsten Tank derselben Freischaltstufe.
 *
 * Warum nicht „tötet nie in einem Kontakt", wie ursprünglich gefordert: Das ist
 * ohne Wucht schon nicht wahr. Ein Juggernaut tötet einen frischen Lancer heute
 * in 0,45 s Dauerkontakt, ein Crusher einen Railgun in 0,70 s. Die Wucht kann
 * nur dafür sorgen, dass sie daran nichts Wesentliches ändert – und genau das
 * ist hier festgeschrieben.
 */
export const WUCHT_MAX_TTK_GAIN = 0.25;

export const isImpactClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'impact';

/**
 * Körperschaden mit Wucht. Zwei Grenzen, die schärfere gewinnt: der
 * Aufschlag selbst und der Anteil am Maximalleben des Opfers. Gegen
 * Anfängergeschützte wirkt die Wucht gar nicht.
 */
export function wuchtContactDamage(
  baseDamage: number,
  wucht: number,
  victimMaxHealth: number,
  victimLevel: number,
  config: WuchtConfig = DEFAULT_WUCHT
): number {
  if (victimLevel < ROOKIE_PROTECTION_LEVEL) return baseDamage;
  const clamped = Math.max(0, Math.min(SIGNATURE_MAX, wucht));
  const boosted = baseDamage * (1 + config.maxBodyDamageBonus * (clamped / SIGNATURE_MAX));
  const ceiling = Math.max(baseDamage, victimMaxHealth * config.maxContactShare);
  return Math.min(boosted, ceiling);
}

type RuntimePlayer = SignatureRuntimePlayer;

interface ImpactInternals {
  players: Map<string, RuntimePlayer>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  resolvePlayerCollisions(now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

/** Schreibt einen Füllstand samt gerundetem Snapshot-Wert. */
const setWucht = (state: SignatureState, player: RuntimePlayer, value: number): void => {
  state.set(player.id, value);
  player.signature = Math.round(value);
};

/**
 * Hängt Wucht an. `enabled = false` lässt die Schicht komplett weg – der Server
 * verhält sich dann exakt wie vorher, `signature` taucht in keinem Snapshot auf
 * und der Körperschaden ist der alte.
 *
 * `familyUpgrades = true` (KL4) verschiebt Anlauf-Tempo und Wucht-Skalierung in
 * die Punkte-Ökonomie (`signatureRate`/`signaturePower`). Der Anteilsdeckel
 * `maxContactShare` bleibt davon unberührt – er ist absolut.
 */
export function tuneImpactSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: WuchtConfig = DEFAULT_WUCHT,
  familyUpgrades = false
): T {
  if (!enabled) return game;
  const internals = game as unknown as ImpactInternals;
  const wucht = signatureStateFor(game, 'impact');
  /** Nur Schaden aus `resolvePlayerCollisions` ist Körperkontakt. */
  let inBodyContact = false;
  /** Wer in diesem Tick zugelangt hat – der Verbrauch gilt einmal je Tick. */
  const spent = new Set<string>();
  let tickDt = 0;

  const originalStep = game.step.bind(game);
  game.step = ((dt: number, now = Date.now()): void => {
    tickDt = dt;
    originalStep(dt, now);
  }) as T['step'];

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    originalStepPlayer(player, dt, now);
    const inFamily = isImpactClass(player.playerClass);
    let rate = 0;
    if (inFamily && !player.dead) {
      const build = familyUpgrades
        ? familyBuildRate(config.buildPerSecond, familyUpgradeLevel(player.upgrades, 'signatureRate'))
        : config.buildPerSecond;
      rate = isMovingFast(player, tunedStatsFor(player).moveSpeed, config.moveThreshold)
        ? build
        : -config.decayPerSecond;
    }
    advanceSignature(wucht, player, dt, inFamily, rate);
  };

  const originalResolve = internals.resolvePlayerCollisions.bind(internals);
  internals.resolvePlayerCollisions = (now: number): void => {
    inBodyContact = true;
    spent.clear();
    try {
      originalResolve(now);
    } finally {
      inBodyContact = false;
    }
    // Verbrauch erst nach der Auflösung: Wer in einem Tick zwei Gegner rammt,
    // zahlt trotzdem nur einmal – sonst wäre ein Getümmel die billigste Art,
    // fremde Ladungen zu löschen.
    for (const id of spent) {
      const attacker = internals.players.get(id);
      if (!attacker) continue;
      const left = Math.max(0, (wucht.get(id) ?? 0) - config.contactDrainPerSecond * tickDt);
      setWucht(wucht, attacker, left);
    }
  };

  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  internals.damagePlayer = (
    target: RuntimePlayer,
    damage: number,
    attackerId: string | null,
    now: number
  ): void => {
    if (!inBodyContact || !attackerId) {
      originalDamagePlayer(target, damage, attackerId, now);
      return;
    }
    const attacker = internals.players.get(attackerId);
    const value = attacker && isImpactClass(attacker.playerClass) ? wucht.get(attackerId) ?? 0 : 0;
    if (value <= 0 || target.level < ROOKIE_PROTECTION_LEVEL) {
      originalDamagePlayer(target, damage, attackerId, now);
      return;
    }
    spent.add(attackerId);
    // Kontakte sind selten – hier darf die Konfiguration je Aufprall entstehen,
    // anders als im Tick. `attacker` steht: Ohne ihn wäre `value` 0 und der
    // Zweig oben hätte schon abgebogen.
    const effective = familyUpgrades && attacker ? wuchtConfigFor(config, attacker.upgrades) : config;
    originalDamagePlayer(
      target,
      wuchtContactDamage(damage, value, target.maxHealth, target.level, effective),
      attackerId,
      now
    );
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    wucht.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Füllstand für Tests und Betriebsanzeigen. */
export function wuchtFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'impact').get(playerId) ?? 0;
}
