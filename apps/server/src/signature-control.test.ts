import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  PLAYER_CLASS_IDS,
  type PlayerClass
} from '@project-maze/shared';
import { messfeld } from './messfeld';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { tuneFamilyUpgrades } from './family-upgrades';
import { MazeGame } from './game';
import { SIGNATURE_MAX } from './signature';
import {
  DEFAULT_BUDGET,
  budgetFor,
  isControlClass,
  refillPerSecond,
  tuneControlSignature,
  unitCost,
  unitHealthScale
} from './signature-control';

const DT = 0.025;
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Die feste
// Koordinate stammte von einer aelteren Karte und hatte nach dem
// Labyrinth-Umbau nur noch 200 px Luft.
const OPEN_GROUND = messfeld(340);
const CONTROL_CLASSES = PLAYER_CLASS_IDS.filter(
  (id) => CLASS_DEFINITIONS[id].branch === 'control' && CLASS_DEFINITIONS[id].droneCount > 0
);

interface Internals {
  players: Map<string, any>;
  drones: Map<string, any>;
  shapes: Map<string, any>;
  spawnInitialDrones(owner: any, now: number): void;
}

const createGame = (enabled = true, familyUpgrades = false) => {
  const game = tuneControlSignature(
    tuneDrones(tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), familyUpgrades ? ['control'] : [])),
    enabled,
    DEFAULT_BUDGET,
    familyUpgrades
  );
  const internals = game as unknown as Internals;
  // Formen wachsen nach und zerlegen Drohnen – fuer jede Messung hier nur Rauschen.
  internals.shapes.clear();
  return { game, internals };
};

const spawn = (game: MazeGame, internals: Internals, playerClass: PlayerClass) => {
  const id = game.addPlayer('Dirigent');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.level = GAME.maxLevel;
  player.position = { ...OPEN_GROUND };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  // Denselben Weg wie `chooseClass` im Spiel: Die Startflotte kommt ueber
  // `spawnInitialDrones` und ist geschenkt. Wer stattdessen nur die Klasse
  // setzt, laesst die Flotte ueber `maintainDrones` entstehen – und die zahlt
  // aus dem Budget. Genau daran ist die erste Fassung dieses Tests gescheitert.
  internals.spawnInitialDrones(player, 100_000);
  return { id, player };
};

const dronesOf = (internals: Internals, ownerId: string): any[] =>
  [...internals.drones.values()].filter((drone) => drone.ownerId === ownerId);

const run = (game: MazeGame, internals: Internals, player: any, seconds: number, start = 100_000): number => {
  let now = start;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    now += DT * 1000;
    game.step(DT, now);
    player.position = { ...OPEN_GROUND };
    // **Jeden Tick**, nicht nur einmal beim Aufbau: Formen wachsen waehrend
    // eines Laufs nach, und eine Form neben der Flotte zerlegt Drohnen. Genau
    // daran ist ein Lauf dieser Datei einmal gescheitert, drei danach nicht –
    // die wiederkehrende Falle aus der UEBERGABE.
    internals.shapes.clear();
  }
  return now;
};

describe('control signature – die normierung', () => {
  it('setzt Testannahmen: eine reine Control-Familie mit Drohnen', () => {
    expect(isControlClass('overseer')).toBe(true);
    expect(isControlClass('hive')).toBe(true);
    expect(isControlClass('lancer')).toBe(false);
    expect(isControlClass('core')).toBe(false);
    expect(CONTROL_CLASSES.length).toBeGreaterThanOrEqual(6);
  });

  it('macht ein volles Budget zu genau einer Flotte', () => {
    for (const id of CONTROL_CLASSES) {
      const count = CLASS_DEFINITIONS[id].droneCount;
      expect(unitCost(count) * count, id).toBeCloseTo(SIGNATURE_MAX, 9);
    }
  });

  it('füllt im Mittel genau so schnell nach, wie die Flotte heute wächst', () => {
    // Der Angelpunkt: Die Nachschubrate kommt aus `droneCount × droneRespawn`,
    // also aus dem, was die Klasse heute fuer eine ganze Flotte braucht.
    for (const id of CONTROL_CLASSES) {
      const stats = tunedStatsFor({ playerClass: id, level: GAME.maxLevel, upgrades: EMPTY_UPGRADES() } as never);
      const secondsPerUnit = unitCost(stats.droneCount) / refillPerSecond(stats.droneCount, stats.droneRespawn);
      expect(secondsPerUnit, id).toBeCloseTo(stats.droneRespawn, 6);
    }
  });

  it('skaliert das Einheitenleben nur über signaturePower', () => {
    expect(unitHealthScale(0)).toBe(1);
    expect(unitHealthScale(GAME.maxUpgradeLevel)).toBeCloseTo(1 + DEFAULT_BUDGET.maxUnitHealthBonus, 9);
  });
});

describe('control signature – im spiel', () => {
  it('startet mit vollem Konto und stellt die Startflotte kostenlos', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'overseer');
    run(game, internals, player, 0.1);
    expect(dronesOf(internals, id).length).toBeGreaterThan(0);
    expect(budgetFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
  });

  it('bezahlt jede nachgestellte Einheit aus dem Konto', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'drone');
    run(game, internals, player, 0.1);
    const stats = tunedStatsFor(player);
    const full = dronesOf(internals, id).length;
    expect(full).toBe(stats.droneCount);

    // Eine Einheit abschießen: Der Nachschub kostet, und zwar genau `unitCost`.
    internals.drones.delete(dronesOf(internals, id)[0].id);
    const before = budgetFor(game, id);
    run(game, internals, player, 0.15, 200_000);
    expect(dronesOf(internals, id).length).toBe(full);
    const spent = before - budgetFor(game, id);
    // Waehrend der Zeit fliesst auch Nachschub zu – deshalb der Toleranzrahmen.
    expect(spent).toBeGreaterThan(unitCost(stats.droneCount) * 0.5);
    expect(spent).toBeLessThanOrEqual(unitCost(stats.droneCount) + 1e-9);
  });

  it('stellt eine ausgelöschte Flotte bei vollem Konto sofort wieder hin', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'warden');
    run(game, internals, player, 0.1);
    const count = dronesOf(internals, id).length;
    expect(budgetFor(game, id)).toBe(SIGNATURE_MAX);

    for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
    // Ein einziger Tick je Einheit reicht – das Konto zahlt, nicht die Uhr.
    run(game, internals, player, count * DT + 0.05, 200_000);
    expect(dronesOf(internals, id).length).toBe(count);
    expect(budgetFor(game, id)).toBeLessThan(SIGNATURE_MAX * 0.2);
  });

  it('lässt den zweiten Verlust in Folge auf leeres Konto laufen', () => {
    // Das ist die eigentliche Aenderung: Wer zweimal kurz hintereinander
    // verliert, steht ohne Nachschub da und muss sich zurueckziehen.
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'warden');
    let now = run(game, internals, player, 0.1);
    const count = dronesOf(internals, id).length;

    for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
    now = run(game, internals, player, count * DT + 0.05, now);
    expect(dronesOf(internals, id).length).toBe(count);

    for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
    now = run(game, internals, player, count * DT + 0.05, now);
    expect(dronesOf(internals, id).length).toBeLessThan(count);
    expect(budgetFor(game, id)).toBeLessThan(unitCost(tunedStatsFor(player).droneCount));
  });

  it('gilt für Bots genauso – sie brauchen keine eigene Regel', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'overseer');
    player.bot = { style: 'controller', upgradePath: [] };
    run(game, internals, player, 0.1);
    const count = dronesOf(internals, id).length;
    expect(count).toBeGreaterThan(0);

    for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
    run(game, internals, player, count * DT + 0.05, 200_000);
    expect(dronesOf(internals, id).length).toBe(count);
    expect(budgetFor(game, id)).toBeLessThan(SIGNATURE_MAX * 0.25);
  });

  it('räumt das Feld bei Tod und Familienwechsel', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'overseer');
    run(game, internals, player, 0.2);
    expect(player.signature).toBeGreaterThan(0);

    player.dead = true;
    game.step(DT, 300_000);
    expect(player.signature).toBe(0);
    expect(budgetFor(game, id)).toBe(0);

    player.dead = false;
    player.playerClass = 'overseer';
    player.level = GAME.maxLevel;
    run(game, internals, player, 0.2, 300_000);
    expect(budgetFor(game, id)).toBeGreaterThan(0);
    player.playerClass = 'storm';
    game.step(DT, 400_000);
    expect(player.signature).toBeUndefined();
    expect(budgetFor(game, id)).toBe(0);
  });
});

describe('control signature – ohne flag', () => {
  it('ersetzt Einheiten weiter über den Zeitgeber, ohne Konto', () => {
    const { game, internals } = createGame(false);
    const { id, player } = spawn(game, internals, 'warden');
    run(game, internals, player, 0.1);
    const count = dronesOf(internals, id).length;
    expect(count).toBe(tunedStatsFor(player).droneCount);
    expect(player.signature).toBeUndefined();
    expect(budgetFor(game, id)).toBe(0);

    // Ohne Flag braucht jede Einheit ihre volle Nachladezeit – und bekommt sie.
    for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
    const stats = tunedStatsFor(player);
    run(game, internals, player, stats.droneRespawn * count + 0.3, 200_000);
    expect(dronesOf(internals, id).length).toBe(count);
    expect(player.signature).toBeUndefined();
  });
});

describe('control signature – familien-upgrades (KL4)', () => {
  it('hebt mit signatureRate nur das Nachschub-Tempo, nie die Zahl der Einheiten', () => {
    const fleet = (points: number): { count: number; budget: number } => {
      const { game, internals } = createGame(true, true);
      const { id, player } = spawn(game, internals, 'warden');
      player.upgrades.signatureRate = points;
      run(game, internals, player, 0.1);
      const count = dronesOf(internals, id).length;
      for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
      run(game, internals, player, 1.0, 200_000);
      return { count: dronesOf(internals, id).length, budget: budgetFor(game, id) };
    };
    const sockel = fleet(0);
    const voll = fleet(GAME.maxUpgradeLevel);
    // Die Flottenstaerke ist in beiden Faellen dieselbe – nur das Konto steht
    // besser da. Genau die Zusage aus dem KL4-Konzept: Der Slot skaliert den
    // Nachschub, nicht die Serverlast.
    expect(voll.count).toBe(sockel.count);
    expect(voll.budget).toBeGreaterThan(sockel.budget);
  });

  it('macht Einheiten mit signaturePower zäher', () => {
    const health = (points: number): number => {
      const { game, internals } = createGame(true, true);
      const { id, player } = spawn(game, internals, 'overseer');
      // Erst die Punkte, dann die Flotte – `spawn` hat sie schon gestellt, und
      // eine Einheit traegt den Aufschlag ihres Bauzeitpunkts.
      player.upgrades.signaturePower = points;
      for (const drone of dronesOf(internals, id)) internals.drones.delete(drone.id);
      internals.spawnInitialDrones(player, 100_000);
      return dronesOf(internals, id)[0]?.maxHealth ?? 0;
    };
    const sockel = health(0);
    expect(sockel).toBeGreaterThan(0);
    expect(health(GAME.maxUpgradeLevel) / sockel).toBeCloseTo(unitHealthScale(GAME.maxUpgradeLevel), 6);
  });

  it('gibt die Slots für Control frei, sobald die Signature läuft', () => {
    const { game, internals } = createGame(true, true);
    const { id, player } = spawn(game, internals, 'overseer');
    player.availablePoints = 4;
    expect(game.applyUpgrade(id, 'signatureRate')).toBe(true);
    expect(game.applyUpgrade(id, 'signaturePower')).toBe(true);
  });
});
