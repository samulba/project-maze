import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  DEFAULT_MOMENTUM,
  SIGNATURE_MAX,
  isRapidClass,
  momentumFireRate,
  momentumFor,
  momentumReloadScale,
  tuneRapidBots,
  tuneRapidSignature
} from './signature-rapid';
import { isFree } from './world';

const DT = 0.025;
/** Nachweislich freies Feld – der Tank muss beschleunigen können, nicht anecken. */
const OPEN_GROUND = { x: 2800, y: 2200 };

interface Internals {
  players: Map<string, any>;
  stepPlayer(player: any, dt: number, now: number): void;
}

const createGame = (enabled = true): MazeGame =>
  tuneRapidSignature(tuneCombatScaling(new MazeGame(0)), enabled);

/** Ein fahrbereiter Spieler der gewünschten Klasse auf freiem Feld. */
const spawn = (game: MazeGame, playerClass: PlayerClass) => {
  const internals = game as unknown as Internals;
  const id = game.addPlayer('Fahrer');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.position = { ...OPEN_GROUND };
  player.velocity = { x: 0, y: 0 };
  player.level = 45;
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  return { internals, id, player };
};

/**
 * N Ticks fahren (oder stehen) und dabei feuern oder nicht.
 *
 * Der Tank läuft auf einem Laufband: Nach jedem Tick wird die Position auf den
 * Startpunkt zurückgesetzt, die Geschwindigkeit bleibt. Sonst wäre nach zehn
 * Sekunden Geradeausfahrt der Weltrand erreicht – und ein Tank an der Wand hat
 * zu Recht kein Momentum mehr, was die Messung überdecken würde.
 */
const drive = (
  internals: Internals,
  player: any,
  options: { ticks: number; moving: boolean; firing: boolean; start?: number }
): number => {
  let now = options.start ?? 100_000;
  for (let i = 0; i < options.ticks; i += 1) {
    player.move = options.moving ? { x: 1, y: 0 } : { x: 0, y: 0 };
    if (!options.moving) player.velocity = { x: 0, y: 0 };
    player.aim = { x: 200, y: 0 };
    player.primary = options.firing;
    now += DT * 1000;
    internals.stepPlayer(player, DT, now);
    player.position = { ...OPEN_GROUND };
  }
  return now;
};

describe('rapid signature – momentum', () => {
  it('setzt Testannahmen: freies Feld und eine reine Rapid-Familie', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    expect(isRapidClass('storm')).toBe(true);
    expect(isRapidClass('gatling')).toBe(true);
    expect(isRapidClass('core')).toBe(false);
    expect(isRapidClass('deadeye')).toBe(false);
  });

  it('baut Momentum beim Feuern in Bewegung auf und deckelt bei 100', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'storm');
    expect(player.signature).toBeUndefined();

    // 1 s fahren und feuern: exakt eine Sekunde Aufbaurate, minus der Ticks,
    // in denen der Tank noch unter der Bewegungsschwelle beschleunigt.
    drive(internals, player, { ticks: 40, moving: true, firing: true });
    expect(momentumFor(game, id)).toBeGreaterThan(DEFAULT_MOMENTUM.buildPerSecond * 0.7);
    expect(momentumFor(game, id)).toBeLessThanOrEqual(DEFAULT_MOMENTUM.buildPerSecond);

    // Lange genug für den Vollausschlag – und darüber hinaus.
    drive(internals, player, { ticks: 400, moving: true, firing: true });
    expect(momentumFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
  });

  it('baut im Stillstand schneller ab als in Bewegung ohne Feuer', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'storm');
    drive(internals, player, { ticks: 400, moving: true, firing: true });
    expect(momentumFor(game, id)).toBe(SIGNATURE_MAX);

    // Eine Sekunde fahren ohne zu feuern: hält fast.
    drive(internals, player, { ticks: 40, moving: true, firing: false });
    const rolling = momentumFor(game, id);
    expect(SIGNATURE_MAX - rolling).toBeCloseTo(DEFAULT_MOMENTUM.holdDecayPerSecond, 0);

    // Eine Sekunde stehen kostet deutlich mehr.
    drive(internals, player, { ticks: 40, moving: false, firing: true });
    expect(rolling - momentumFor(game, id)).toBeCloseTo(DEFAULT_MOMENTUM.decayPerSecond, 0);

    // Stehen bleiben führt bis auf null – und nicht darunter.
    drive(internals, player, { ticks: 200, moving: false, firing: true });
    expect(momentumFor(game, id)).toBe(0);
    expect(player.signature).toBe(0);
  });

  it('verkürzt die Nachladezeit im selben Maß wie momentumReloadScale', () => {
    const game = createGame();
    const { internals, player } = spawn(game, 'storm');
    const reload = tunedStatsFor(player).reload;

    // Ohne Momentum: der Cooldown nach dem Schuss ist exakt die Nachladezeit.
    player.cooldown = 0;
    drive(internals, player, { ticks: 1, moving: false, firing: true });
    expect(player.cooldown).toBeCloseTo(reload, 6);

    // Mit vollem Momentum: um genau den Bonus kürzer.
    drive(internals, player, { ticks: 400, moving: true, firing: true });
    player.cooldown = 0;
    drive(internals, player, { ticks: 1, moving: true, firing: true });
    expect(player.cooldown).toBeCloseTo(reload * momentumReloadScale(SIGNATURE_MAX), 6);
    expect(player.cooldown).toBeCloseTo(reload * (1 - DEFAULT_MOMENTUM.maxReloadBonus), 6);
  });

  it('rechnet die Skala an den Rändern und darüber hinaus richtig', () => {
    expect(momentumReloadScale(0)).toBe(1);
    expect(momentumReloadScale(SIGNATURE_MAX)).toBeCloseTo(1 - DEFAULT_MOMENTUM.maxReloadBonus, 10);
    expect(momentumReloadScale(50)).toBeCloseTo(1 - DEFAULT_MOMENTUM.maxReloadBonus / 2, 10);
    // Werte außerhalb 0..100 dürfen die Nachladezeit nie ins Absurde ziehen.
    expect(momentumReloadScale(-40)).toBe(1);
    expect(momentumReloadScale(400)).toBe(momentumReloadScale(SIGNATURE_MAX));

    const storm = CLASS_DEFINITIONS.storm.reload;
    expect(momentumFireRate(storm, 0)).toBeCloseTo(1 / storm, 10);
    expect(momentumFireRate(storm, SIGNATURE_MAX) / momentumFireRate(storm, 0)).toBeCloseTo(1 / 0.75, 10);
  });

  it('lässt Klassen außerhalb der Rapid-Familie unberührt', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'deadeye');
    const reload = tunedStatsFor(player).reload;

    drive(internals, player, { ticks: 400, moving: true, firing: true });
    expect(player.signature).toBeUndefined();
    expect(momentumFor(game, id)).toBe(0);

    player.cooldown = 0;
    drive(internals, player, { ticks: 1, moving: true, firing: true });
    expect(player.cooldown).toBeCloseTo(reload, 6);
  });

  it('räumt das Feld, wenn ein Spieler die Familie verlässt', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'storm');
    drive(internals, player, { ticks: 400, moving: true, firing: true });
    expect(player.signature).toBe(SIGNATURE_MAX);

    // Respawn auf niedrigem Level macht aus dem Storm wieder einen Core.
    player.playerClass = 'core';
    drive(internals, player, { ticks: 1, moving: true, firing: true });
    expect(player.signature).toBeUndefined();
    expect(momentumFor(game, id)).toBe(0);
  });

  it('setzt Momentum beim Tod zurück', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'storm');
    drive(internals, player, { ticks: 400, moving: true, firing: true });
    expect(momentumFor(game, id)).toBe(SIGNATURE_MAX);

    player.dead = true;
    drive(internals, player, { ticks: 1, moving: true, firing: true });
    expect(player.signature).toBe(0);
    expect(momentumFor(game, id)).toBe(0);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const game = createGame(false);
    const { internals, id, player } = spawn(game, 'storm');
    const reload = tunedStatsFor(player).reload;

    drive(internals, player, { ticks: 400, moving: true, firing: true });
    // Kein Feld im Snapshot …
    expect(player.signature).toBeUndefined();
    expect(momentumFor(game, id)).toBe(0);
    expect(game.snapshot(id).players[0]?.signature).toBeUndefined();

    // … und keine Sekunde weniger Nachladezeit.
    player.cooldown = 0;
    drive(internals, player, { ticks: 1, moving: true, firing: true });
    expect(player.cooldown).toBeCloseTo(reload, 6);
  });

  it('hält Rapid-Bots in Bewegung, sobald die Steuerung anhalten will', () => {
    // Die Bot-Steuerung wird durch einen Stub ersetzt, der immer anhält – so
    // hängt der Test an der Regel und nicht am Verhalten von `tuneBotBrain`.
    const game = tuneCombatScaling(new MazeGame(2));
    const internals = game as unknown as Internals & { updateBot(player: any, now: number): void };
    internals.updateBot = (player: any): void => { player.move = { x: 0, y: 0 }; };
    tuneRapidBots(game, true);

    const bots = [...internals.players.values()].filter((player) => player.bot);
    const [rapid, other] = bots;
    Object.assign(rapid, { playerClass: 'storm', invulnerable: false, velocity: { x: 0, y: 0 } });
    Object.assign(other, { playerClass: 'deadeye', invulnerable: false, velocity: { x: 0, y: 0 } });

    internals.updateBot(rapid, 10_000);
    internals.updateBot(other, 10_000);
    expect(Math.hypot(rapid.move.x, rapid.move.y)).toBeCloseTo(1, 6);
    // Wer nicht zur Familie gehört, darf weiter stehen bleiben.
    expect(Math.hypot(other.move.x, other.move.y)).toBe(0);

    // Mit Fahrt behält er die Richtung, statt ins Kreisen zu verfallen.
    rapid.velocity = { x: 0, y: -220 };
    internals.updateBot(rapid, 10_050);
    expect(rapid.move.x).toBeCloseTo(0, 6);
    expect(rapid.move.y).toBeCloseTo(-1, 6);

    // Spawnschutz bleibt unangetastet – sonst würde die Regel ihn beenden.
    rapid.invulnerable = true;
    internals.updateBot(rapid, 10_100);
    expect(Math.hypot(rapid.move.x, rapid.move.y)).toBe(0);
  });

  it('respektiert den gewollten Reparatur-Halt der Bot-Steuerung (Befund 79)', () => {
    // Der Stub hält an UND markiert den Halt als gewollt – wie es die echte
    // Steuerung beim „erst anhalten, dann reparieren" tut. Vorher übersetzte
    // die Schicht genau diesen Halt zurück in Fahrt, das Tempo fiel nie unter
    // das Reparatur-Limit, und der Zyklus begann nie.
    const game = tuneCombatScaling(new MazeGame(1));
    const internals = game as unknown as Internals & { updateBot(player: any, now: number): void };
    internals.updateBot = (player: any): void => {
      player.move = { x: 0, y: 0 };
      player.bot.holdsStill = true;
    };
    tuneRapidBots(game, true);

    const [rapid] = [...internals.players.values()].filter((player) => player.bot);
    Object.assign(rapid, { playerClass: 'storm', invulnerable: false, velocity: { x: 0, y: -220 } });

    internals.updateBot(rapid, 10_000);
    expect(Math.hypot(rapid.move.x, rapid.move.y)).toBe(0);

    // Fällt die Markierung, greift die Momentum-Regel wieder.
    internals.updateBot = (player: any): void => {
      player.move = { x: 0, y: 0 };
      player.bot.holdsStill = false;
    };
    tuneRapidBots(game, true);
    internals.updateBot(rapid, 10_050);
    expect(Math.hypot(rapid.move.x, rapid.move.y)).toBeCloseTo(1, 6);
  });

  it('überschreibt keine Bot-Entscheidung, die ohnehin fährt', () => {
    const game = tuneCombatScaling(new MazeGame(2));
    const internals = game as unknown as Internals & { updateBot(player: any, now: number): void };
    internals.updateBot = (player: any): void => { player.move = { x: 0.6, y: -0.8 }; };
    tuneRapidBots(game, true);

    const rapid = [...internals.players.values()].find((player) => player.bot);
    Object.assign(rapid, { playerClass: 'storm', invulnerable: false, velocity: { x: 300, y: 0 } });
    internals.updateBot(rapid, 10_000);
    expect(rapid.move).toEqual({ x: 0.6, y: -0.8 });
  });

  it('lässt Bots ohne Flag stehen, wo die Steuerung sie stehen lässt', () => {
    const game = tuneCombatScaling(new MazeGame(2));
    const internals = game as unknown as Internals & { updateBot(player: any, now: number): void };
    internals.updateBot = (player: any): void => { player.move = { x: 0, y: 0 }; };
    tuneRapidBots(game, false);

    const rapid = [...internals.players.values()].find((player) => player.bot);
    Object.assign(rapid, { playerClass: 'storm', invulnerable: false, velocity: { x: 0, y: 0 } });
    internals.updateBot(rapid, 10_000);
    expect(Math.hypot(rapid.move.x, rapid.move.y)).toBe(0);
  });

  it('trägt den gerundeten Wert in den Snapshot', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'gatling');
    drive(internals, player, { ticks: 60, moving: true, firing: true });

    const entry = game.snapshot(id).players.find((candidate) => candidate.id === id);
    expect(entry?.signature).toBe(Math.round(momentumFor(game, id)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBeGreaterThan(0);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
  });
});
