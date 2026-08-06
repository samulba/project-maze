import { GAME, type PlayerClass } from '@project-maze/shared';
import { tunedStatsFor } from './combat-tuning.js';
import { familyBuildRate, familyUpgradeLevel } from './family-upgrades.js';
import { MazeGame } from './game.js';
import {
  SIGNATURE_MAX,
  advanceSignature,
  classBranch,
  signatureStateFor,
  type SignatureRuntimePlayer
} from './signature.js';

/**
 * Klassen 3.0 – Signature der CONTROL-Familie: **Einheiten-Budget**.
 *
 * Statt eines Zeitgebers, der jede verlorene Drohne stur nach `droneRespawn`
 * ersetzt, hat ein Controller ein **Nachschub-Konto**. Es füllt sich stetig,
 * und jede neue Einheit bezahlt daraus.
 *
 * ## Die Normierung, aus der alles folgt
 *
 * **Volles Budget = eine komplette Flotte.** Eine Einheit kostet damit
 * `100 / droneCount`, und die Nachfüllrate ist so gewählt, dass ein volles Konto
 * genau so lange braucht wie heute der Wiederaufbau der ganzen Flotte:
 * `100 / (droneCount × droneRespawn)` je Sekunde. Beides kommt aus den Werten
 * der Klasse, nicht aus einer zweiten Zahlenquelle.
 *
 * | Klasse | Drohnen | Flotte neu (heute) | Kosten je Einheit | Nachschub |
 * |---|---|---|---|---|
 * | Hive | 10 | 5,5 s | 10,0 | 18,2/s |
 * | Drone | 4 | 5,8 s | 25,0 | 17,2/s |
 * | Warden | 6 | 6,7 s | 16,7 | 14,9/s |
 * | Overseer | 8 | 7,0 s | 12,5 | 14,3/s |
 * | Carrier | 6 | 9,0 s | 16,7 | 11,1/s |
 *
 * **Im Mittel ändert sich damit nichts** – die Nachschubgeschwindigkeit ist
 * dieselbe wie heute. Was sich ändert, ist die *Verteilung*: Wer eine Weile
 * nichts verliert, hat ein volles Konto und stellt eine ausgelöschte Flotte
 * **sofort** wieder hin. Wer zum zweiten Mal in kurzer Folge Einheiten verliert,
 * steht ohne Nachschub da und muss sich zurückziehen. Genau das ist die
 * Management-Handlung, die die Familie ausmacht.
 *
 * ## Was hier bewusst **nicht** drin ist
 *
 * Der Masterplan sieht ein Budget vor, das sich Drohnen **und Deployables**
 * (Mini-Turm, Verlangsamungsfeld) teilen; das Umschichten zwischen beiden ist
 * die Kernhandlung. Deployables sind neue Entitäten im Snapshot und damit eine
 * Änderung an der Wire-Form – die baue ich nicht auf Verdacht. Der exakte
 * Vorschlag steht im Statusbericht; das Budget hier ist so gebaut, dass eine
 * zweite Einheitenart nur einen weiteren Kostensatz braucht.
 *
 * Und die Warnung aus dem KL4-Konzept gilt weiter: `signatureRate` hebt bei
 * Control ausschließlich das **Nachschub-Tempo**, nie die Zahl der Einheiten.
 * Sonst skalierte die Serverlast mit dem Build.
 */

export interface BudgetConfig {
  /**
   * Anteil des Budgets, den eine Einheit kostet, relativ zu „volles Budget =
   * eine Flotte". 1.0 heißt: `droneCount` Einheiten leeren ein volles Konto.
   */
  readonly fleetsPerBudget: number;
  /**
   * Nachschub relativ zum heutigen Flotten-Wiederaufbau. 1.0 = im Mittel exakt
   * das heutige Tempo.
   */
  readonly refillFactor: number;
  /** Aufschlag auf das Leben einer Einheit bei vollem `signaturePower`. */
  readonly maxUnitHealthBonus: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  fleetsPerBudget: 1,
  refillFactor: 1,
  maxUnitHealthBonus: 0.45
};

export const isControlClass = (playerClass: PlayerClass): boolean => classBranch(playerClass) === 'control';

/** Budgetkosten einer einzelnen Einheit. */
export function unitCost(droneCount: number, config: BudgetConfig = DEFAULT_BUDGET): number {
  return SIGNATURE_MAX / Math.max(1, droneCount * config.fleetsPerBudget);
}

/**
 * Nachschub je Sekunde. Aus `droneCount × droneRespawn` gerechnet – dem, was
 * die Klasse heute für eine ganze Flotte braucht.
 */
export function refillPerSecond(
  droneCount: number,
  droneRespawn: number,
  config: BudgetConfig = DEFAULT_BUDGET
): number {
  const fleetSeconds = Math.max(0.05, droneCount * droneRespawn);
  return (SIGNATURE_MAX / fleetSeconds) * config.refillFactor;
}

/** Lebensaufschlag einer Einheit bei `n` Punkten in `signaturePower`. */
export function unitHealthScale(powerLevel: number, config: BudgetConfig = DEFAULT_BUDGET): number {
  // Normiert auf das aktuelle Cap: Vollausbau = voller Bonus, egal wie viele
  // Punkte das Cap gerade hat (Klassen 4.0 hob es von 8 auf 10).
  return 1 + config.maxUnitHealthBonus * (Math.max(0, powerLevel) / GAME.maxUpgradeLevel);
}

type RuntimePlayer = SignatureRuntimePlayer;

interface RuntimeStats {
  droneCount: number;
  droneRespawn: number;
}

interface ControlInternals {
  players: Map<string, RuntimePlayer>;
  drones: Map<string, { id: string; ownerId: string; health: number; maxHealth: number }>;
  nextDroneSpawn: Map<string, number>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  maintainDrones(owner: RuntimePlayer, stats: RuntimeStats, now: number): void;
  spawnDrone(owner: RuntimePlayer, slot: number): void;
}

/**
 * Hängt das Einheiten-Budget an. `enabled = false` lässt die Schicht komplett
 * weg – dann ersetzt weiter der Zeitgeber die Einheiten.
 *
 * Die Schicht gehört **außerhalb von `tuneDrones`**: Dort werden `spawnDrone`
 * und `stepDrones` ersetzt, und das Budget will genau die fertige Einheit
 * bezahlen und verstärken, nicht eine halbe.
 */
export function tuneControlSignature<T extends MazeGame>(
  game: T,
  enabled = false,
  config: BudgetConfig = DEFAULT_BUDGET,
  familyUpgrades = false
): T {
  if (!enabled) return game;
  const internals = game as unknown as ControlInternals;
  const budget = signatureStateFor(game, 'control');
  /** Wer schon einmal gelebt hat – ein frischer Controller startet mit vollem Konto. */
  const seeded = new Set<string>();

  const refillFor = (player: RuntimePlayer, stats: RuntimeStats): number => {
    const base = refillPerSecond(stats.droneCount, stats.droneRespawn, config);
    return familyUpgrades
      ? familyBuildRate(base, familyUpgradeLevel(player.upgrades, 'signatureRate'))
      : base;
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    const inFamily = isControlClass(player.playerClass) && !player.dead;
    if (inFamily && !seeded.has(player.id)) {
      // Wer neu in die Familie kommt, fängt mit vollem Konto an: Die
      // Startflotte ist wie bisher geschenkt, das Budget ist der Nachschub.
      seeded.add(player.id);
      budget.set(player.id, SIGNATURE_MAX);
    }
    originalStepPlayer(player, dt, now);
    if (player.dead) seeded.delete(player.id);
    const stats = tunedStatsFor(player as never) as unknown as RuntimeStats;
    advanceSignature(budget, player, dt, isControlClass(player.playerClass), inFamily ? refillFor(player, stats) : 0);
  };

  const originalMaintain = internals.maintainDrones.bind(internals);
  internals.maintainDrones = (owner: RuntimePlayer, stats: RuntimeStats, now: number): void => {
    if (!isControlClass(owner.playerClass)) {
      originalMaintain(owner, stats, now);
      return;
    }
    const available = budget.get(owner.id) ?? 0;
    const cost = unitCost(stats.droneCount, config);
    if (available < cost) return;                       // kein Nachschub, keine Einheit
    // Der Zeitgeber ist durch das Konto ersetzt – die Auswahl des freien Slots
    // bleibt aber die des Originals, statt sie hier nachzubauen.
    internals.nextDroneSpawn.set(owner.id, 0);
    const before = internals.drones.size;
    originalMaintain(owner, stats, now);
    if (internals.drones.size > before) {
      const left = Math.max(0, available - cost);
      budget.set(owner.id, left);
      owner.signature = Math.round(left);
    }
  };

  const originalSpawnDrone = internals.spawnDrone.bind(internals);
  internals.spawnDrone = (owner: RuntimePlayer, slot: number): void => {
    const before = new Set(internals.drones.keys());
    originalSpawnDrone(owner, slot);
    if (!familyUpgrades || !isControlClass(owner.playerClass)) return;
    const scale = unitHealthScale(familyUpgradeLevel(owner.upgrades, 'signaturePower'), config);
    if (scale === 1) return;
    for (const [id, drone] of internals.drones) {
      if (before.has(id) || drone.ownerId !== owner.id) continue;
      drone.maxHealth *= scale;
      drone.health = drone.maxHealth;
    }
  };

  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    budget.delete(id);
    seeded.delete(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}

/** Ungerundeter Kontostand für Tests und Betriebsanzeigen. */
export function budgetFor(game: MazeGame, playerId: string): number {
  return signatureStateFor(game, 'control').get(playerId) ?? 0;
}
