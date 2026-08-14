import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { messfeld } from './messfeld';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  DEFAULT_HEAT,
  SIGNATURE_MAX,
  heatDamageScale,
  heatFor,
  isTempestClass,
  tuneTempestSignature
} from './signature-tempest';
import { isFree } from './world';

const DT = 0.025;
/** Nachweislich freies Feld – die Messung soll nie an einer Wand hängen. */
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Die feste
// Koordinate stammte von einer aelteren Karte und hatte nach dem
// Labyrinth-Umbau nur noch 200 px Luft.
const OPEN_GROUND = messfeld(340);
/** Salven bis zur Überhitzung: bei +12 je Salve die neunte. */
const SALVOS_TO_OVERHEAT = Math.ceil(SIGNATURE_MAX / DEFAULT_HEAT.heatPerShot);

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  shapes: Map<string, any>;
  stepPlayer(player: any, dt: number, now: number): void;
  stepBurstQueue(dt: number): void;
}

const createGame = (enabled = true): MazeGame =>
  tuneTempestSignature(tuneCombatScaling(new MazeGame(0)), enabled);

/** Ein feuerbereiter Spieler der gewünschten Klasse auf freiem Feld. */
const spawn = (game: MazeGame, playerClass: PlayerClass) => {
  const internals = game as unknown as Internals;
  // Formen wegräumen: Sie wachsen nur über `game.step` nach, und die Tests
  // ticken einzelne Spieler – so kann keine Form eine Messung verfälschen.
  internals.shapes.clear();
  const id = game.addPlayer('Heizer');
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
 * Eine Salve im Renntempo: Der Cooldown wird auf 0 gezwungen, ein Tick feuert.
 * So bestimmt der Test die Salvenzahl exakt, statt an der Nachladezeit der
 * jeweiligen Klasse zu hängen – nur der Überhitzungstest lässt den Cooldown
 * bewusst in Ruhe, denn genau der ist dort der Prüfling.
 */
const salvo = (internals: Internals, player: any, now: number): number => {
  player.cooldown = 0;
  player.primary = true;
  player.aim = { x: 200, y: 0 };
  player.move = { x: 0, y: 0 };
  now += DT * 1000;
  internals.stepPlayer(player, DT, now);
  return now;
};

/** N Ticks verstreichen lassen – wahlweise mit gedrückter Feuertaste. */
const idle = (internals: Internals, player: any, now: number, ticks: number, firing = false): number => {
  for (let i = 0; i < ticks; i += 1) {
    player.primary = firing;
    player.aim = { x: 200, y: 0 };
    player.move = { x: 0, y: 0 };
    now += DT * 1000;
    internals.stepPlayer(player, DT, now);
  }
  return now;
};

describe('tempest signature – hitze', () => {
  it('setzt Testannahmen: freies Feld, eine reine Tempest-Familie, neun Salven bis 100', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    for (const id of ['tempest', 'scorch', 'surge', 'inferno', 'overload', 'cataclysm'] as const) {
      expect(isTempestClass(id)).toBe(true);
    }
    expect(isTempestClass('storm')).toBe(false);
    expect(isTempestClass('juggernaut')).toBe(false);
    expect(isTempestClass('core')).toBe(false);
    expect(SALVOS_TO_OVERHEAT).toBe(9);
  });

  it('heizt je Salve um den Festwert – ein fire-Aufruf zählt einmal, egal wie viele Läufe', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'scorch');
    expect(player.signature).toBeUndefined();

    let now = salvo(internals, player, 100_000);
    // Scorch hat zwei Läufe: der erste feuert sofort, der zweite folgt als
    // Salve statt Fächer (Klassen 4.2) einen Wimpernschlag später aus der
    // Warteschlange – aber die ganze Salve trägt trotzdem nur EINEN Aufschlag.
    expect(internals.projectiles.size).toBe(1);
    internals.stepBurstQueue(CLASS_DEFINITIONS.scorch.burstDelay ?? 0);
    expect(internals.projectiles.size).toBe(2);
    expect(heatFor(game, id)).toBe(DEFAULT_HEAT.heatPerShot);
    expect(player.signature).toBe(DEFAULT_HEAT.heatPerShot);

    now = salvo(internals, player, now);
    salvo(internals, player, now);
    expect(heatFor(game, id)).toBe(3 * DEFAULT_HEAT.heatPerShot);
  });

  it('gibt der Salve den Bonus des Standes, den sie vorfindet', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    const base = tunedStatsFor(player).damage;

    // Erste Salve: kalter Reaktor, exakt Grundschaden.
    let now = salvo(internals, player, 100_000);
    expect([...internals.projectiles.values()][0].damage).toBeCloseTo(base, 6);

    // Zweite Salve findet 12 vor, dritte 24 – nie den frisch erhöhten Stand.
    internals.projectiles.clear();
    now = salvo(internals, player, now);
    expect([...internals.projectiles.values()][0].damage)
      .toBeCloseTo(base * heatDamageScale(DEFAULT_HEAT.heatPerShot), 6);

    internals.projectiles.clear();
    salvo(internals, player, now);
    expect([...internals.projectiles.values()][0].damage)
      .toBeCloseTo(base * heatDamageScale(2 * DEFAULT_HEAT.heatPerShot), 6);
    expect(heatFor(game, id)).toBe(3 * DEFAULT_HEAT.heatPerShot);
  });

  it('kühlt erst nach der Feuerpause ab, dann mit voller Rate – und nie unter 0', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    let now = salvo(internals, player, 100_000);
    now = salvo(internals, player, now);
    expect(heatFor(game, id)).toBe(2 * DEFAULT_HEAT.heatPerShot);

    // 15 Ticks = 0,375 s Pause: noch unter der Schwelle, kein Verlust.
    now = idle(internals, player, now, 15);
    expect(heatFor(game, id)).toBe(2 * DEFAULT_HEAT.heatPerShot);

    // Ab Tick 16 (0,4 s) läuft der Zerfall: 41 Ticks à 20/s ergeben −20,5.
    now = idle(internals, player, now, 41);
    expect(heatFor(game, id)).toBeCloseTo(2 * DEFAULT_HEAT.heatPerShot - 20.5, 6);

    // Lange genug warten führt auf 0 – und nicht darunter.
    idle(internals, player, now, 200);
    expect(heatFor(game, id)).toBe(0);
    expect(player.signature).toBe(0);
  });

  it('überhitzt bei 100: sperrt 1,2 s über den Cooldown und setzt dann auf 0 zurück', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    const base = tunedStatsFor(player).damage;

    let now = 100_000;
    for (let i = 0; i < SALVOS_TO_OVERHEAT; i += 1) now = salvo(internals, player, now);
    expect(heatFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
    // Die Sperre nutzt den vorhandenen Nachlademechanismus statt eines neuen.
    expect(player.cooldown).toBeCloseTo(DEFAULT_HEAT.overheatLockSeconds, 6);

    // 47 Ticks = 1,175 s mit gedrückter Feuertaste: kein einziger Schuss,
    // die Anzeige glüht weiter auf 100.
    internals.projectiles.clear();
    now = idle(internals, player, now, 47, true);
    expect(internals.projectiles.size).toBe(0);
    expect(heatFor(game, id)).toBe(SIGNATURE_MAX);

    // Zwei weitere Ticks decken die Fließkomma-Kante bei exakt 1,2 s ab: Der
    // Reaktor ist kalt, der erste Schuss fällt – mit Grundschaden.
    idle(internals, player, now, 2, true);
    expect(internals.projectiles.size).toBe(1);
    expect([...internals.projectiles.values()][0].damage).toBeCloseTo(base, 6);
    expect(heatFor(game, id)).toBe(DEFAULT_HEAT.heatPerShot);
  });

  it('lässt Klassen außerhalb der Tempest-Familie unberührt', () => {
    const game = createGame();
    // twin statt storm: storm trägt seit den Pro-Lauf-Profilen (Klassen 4.2)
    // absichtlich unterschiedlichen Schaden je Lauf – das würde hier die
    // eigentliche Frage (rührt DIESE Schicht den Schaden an?) verdecken.
    const { internals, id, player } = spawn(game, 'twin');
    const stats = tunedStatsFor(player);

    let now = 100_000;
    for (let i = 0; i < SALVOS_TO_OVERHEAT; i += 1) now = salvo(internals, player, now);
    expect(player.signature).toBeUndefined();
    expect(heatFor(game, id)).toBe(0);
    // Weder Bonus auf den Schuss noch Sperre auf den Cooldown.
    expect([...internals.projectiles.values()][0].damage).toBeCloseTo(stats.damage, 6);
    expect(player.cooldown).toBeCloseTo(stats.reload, 6);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const game = createGame(false);
    const { internals, id, player } = spawn(game, 'tempest');
    const stats = tunedStatsFor(player);

    let now = 100_000;
    for (let i = 0; i < SALVOS_TO_OVERHEAT; i += 1) now = salvo(internals, player, now);
    // Kein Feld im Snapshot, kein Zähler, keine Überhitzung, kein Bonus.
    expect(player.signature).toBeUndefined();
    expect(heatFor(game, id)).toBe(0);
    expect(game.snapshot(id).players[0]?.signature).toBeUndefined();
    expect(player.cooldown).toBeCloseTo(stats.reload, 6);
    for (const projectile of internals.projectiles.values()) {
      expect(projectile.damage).toBeCloseTo(stats.damage, 6);
    }
  });

  it('setzt die Hitze beim Tod zurück', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    let now = salvo(internals, player, 100_000);
    now = salvo(internals, player, now);
    expect(heatFor(game, id)).toBe(2 * DEFAULT_HEAT.heatPerShot);

    player.dead = true;
    idle(internals, player, now, 1);
    expect(player.signature).toBe(0);
    expect(heatFor(game, id)).toBe(0);
  });

  it('räumt das Feld, wenn ein Spieler die Familie verlässt', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    let now = salvo(internals, player, 100_000);
    now = salvo(internals, player, now);
    expect(player.signature).toBe(2 * DEFAULT_HEAT.heatPerShot);

    // Respawn auf niedrigem Level macht aus dem Tempest wieder einen Core.
    player.playerClass = 'core';
    idle(internals, player, now, 1);
    expect(player.signature).toBeUndefined();
    expect(heatFor(game, id)).toBe(0);
  });

  it('trägt den gerundeten Wert in den Snapshot', () => {
    const game = createGame();
    const { internals, id, player } = spawn(game, 'tempest');
    let now = salvo(internals, player, 100_000);
    now = salvo(internals, player, now);
    // 16 Ticks Pause bringen den Füllstand auf einen krummen Wert (23,5).
    idle(internals, player, now, 16);
    expect(Number.isInteger(heatFor(game, id))).toBe(false);

    const entry = game.snapshot(id).players.find((candidate) => candidate.id === id);
    expect(entry?.signature).toBe(Math.round(heatFor(game, id)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBeGreaterThan(0);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
  });

  it('rechnet die Schadensskala an den Rändern und darüber hinaus richtig', () => {
    expect(heatDamageScale(0)).toBe(1);
    expect(heatDamageScale(SIGNATURE_MAX)).toBeCloseTo(1 + DEFAULT_HEAT.maxBonus, 10);
    expect(heatDamageScale(50)).toBeCloseTo(1 + DEFAULT_HEAT.maxBonus / 2, 10);
    // Werte außerhalb 0..100 dürfen den Schaden nie ins Absurde ziehen.
    expect(heatDamageScale(-40)).toBe(1);
    expect(heatDamageScale(400)).toBe(heatDamageScale(SIGNATURE_MAX));
  });
});
