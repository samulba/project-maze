import { beforeEach, describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { MazeGame } from './game';
import { hardenSimulation } from './simulation-hardening';
import { INPUT_IDLE_MS, tuneInputIdle } from './input-idle';
import { setArenaMode } from './world';

/**
 * Der Geist-Tank. Ein stiller Verbindungsverlust liess den Spieler bis zu
 * eine Minute lang weiterfahren und weiterfeuern -- `applyInput` ist der
 * einzige Schreiber von `move`/`primary`/`secondary`, und ohne Nachrichten
 * schrieb eben niemand mehr.
 */

interface Innereien {
  players: Map<string, any>;
}

const eingabe = (sequence: number, move = { x: 1, y: 0 }) => ({
  type: 'input' as const,
  sequence,
  move,
  aim: { x: 100, y: 0 },
  primary: true,
  secondary: false
});

const bauen = () => {
  const game = tuneInputIdle(hardenSimulation(new MazeGame(0)));
  (game as unknown as { shapes: Map<string, unknown> }).shapes.clear();
  return game;
};

describe('Eingabe-Zeitfenster', () => {
  beforeEach(() => setArenaMode('maze'));

  it('haelt einen Tank an, der nichts mehr schickt', () => {
    const game = bauen();
    const internals = game as unknown as Innereien;
    const id = game.addPlayer('Mensch');
    let now = Date.now();
    game.step(1 / GAME.tickRate, now);

    game.applyInput(id, eingabe(1));
    const spieler = internals.players.get(id);
    expect(spieler.move.x).toBeCloseTo(1);
    expect(spieler.primary).toBe(true);

    // Kurz vor der Frist faehrt er weiter -- ein Ruckler ist kein Abbruch.
    now += INPUT_IDLE_MS - 200;
    game.step(1 / GAME.tickRate, now);
    expect(spieler.move.x).toBeCloseTo(1);
    expect(spieler.primary).toBe(true);

    // Danach steht er, ohne dass ihn jemand entfernt haette.
    now += 400;
    game.step(1 / GAME.tickRate, now);
    expect(spieler.move).toEqual({ x: 0, y: 0 });
    expect(spieler.primary).toBe(false);
    expect(spieler.secondary).toBe(false);
    expect(internals.players.has(id)).toBe(true);
    expect(spieler.dead).toBe(false);
  });

  it('setzt die Frist mit jeder Eingabe neu', () => {
    const game = bauen();
    const internals = game as unknown as Innereien;
    const id = game.addPlayer('Mensch');
    let now = Date.now();
    game.step(1 / GAME.tickRate, now);

    // Zehn Sekunden am Stueck fahren, mit Eingaben im Sekundentakt.
    for (let i = 1; i <= 10; i += 1) {
      game.applyInput(id, eingabe(i));
      now += 1_000;
      game.step(1 / GAME.tickRate, now);
      expect(internals.players.get(id).move.x).toBeCloseTo(1);
    }
  });

  /**
   * Bots haben nie eine Eingabe geschickt -- ihre Bewegung kommt aus
   * `updateBot`. Ein Zeitfenster ueber sie hinweg fraeche die halbe Arena ein.
   */
  it('laesst Bots in Ruhe', () => {
    const game = tuneInputIdle(hardenSimulation(new MazeGame(3)));
    const internals = game as unknown as Innereien;
    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    // Weit ueber die Frist hinaus laufen lassen.
    for (let i = 0; i < 5 * GAME.tickRate; i += 1) {
      now += (1 / GAME.tickRate) * 1000;
      game.step(1 / GAME.tickRate, now);
    }
    const bots = [...internals.players.values()].filter((p: any) => p.isBot);
    expect(bots.length).toBe(3);
    const bewegt = bots.some((bot: any) => Math.hypot(bot.move.x, bot.move.y) > 0.01);
    expect(bewegt).toBe(true);
  });

  it('vergisst einen Spieler, der die Arena verlaesst', () => {
    const game = bauen();
    const id = game.addPlayer('Mensch');
    game.step(1 / GAME.tickRate, Date.now());
    game.applyInput(id, eingabe(1));
    game.removePlayer(id);
    // Kein Eintrag mehr, und der naechste Tick stolpert nicht darueber.
    expect(() => game.step(1 / GAME.tickRate, Date.now() + 10_000)).not.toThrow();
  });
});
