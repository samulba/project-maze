import { describe, expect, it } from 'vitest';
import { GAME, type PlayerClass } from '@project-maze/shared';
import { ACTIVE_MODULE_DEFINITIONS } from '@project-maze/shared/gameplay';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { DASH_SPEED, activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system';

const DT = 0.025;
const OPEN_GROUND = { x: 2800, y: 2200 };
const DASH = ACTIVE_MODULE_DEFINITIONS.dash;

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
}

const setup = (dashTravel: boolean, playerClass: PlayerClass = 'storm') => {
  const game = tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)), dashTravel);
  const internals = game as unknown as Internals;
  internals.shapes.clear();
  const id = game.addPlayer('Dasher');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.level = GAME.maxLevel;
  player.position = { ...OPEN_GROUND };
  player.velocity = { x: 0, y: 0 };
  player.move = { x: 1, y: 0 };
  player.aim = { x: 200, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  equipLoadout(game, id, 'dash', 'standard', 100_000);
  return { game, internals, id, player };
};

/** Positionen Tick für Tick – das ist genau, was der Client als Snapshots sieht. */
const track = (game: MazeGame, internals: Internals, player: any, seconds: number, start: number): number[] => {
  const steps: number[] = [];
  let now = start;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    now += DT * 1000;
    game.step(DT, now);
    internals.shapes.clear();
    steps.push(player.position.x);
  }
  return steps;
};

describe('dash – fahren statt springen', () => {
  it('springt ohne Schalter in einem einzigen Tick', () => {
    const { game, id, player } = setup(false);
    const before = player.position.x;
    expect(activateModule(game, id, 100_100, false)).toBe(true);
    // Der ganze Weg ist schon zurueckgelegt, bevor ein einziger Tick lief.
    expect(player.position.x - before).toBeGreaterThan(150);
  });

  it('verteilt dieselbe Strecke über die Wirkdauer', () => {
    const { game, internals, id, player } = setup(true);
    const before = player.position.x;
    expect(activateModule(game, id, 100_100, true)).toBe(true);
    // Vor dem ersten Tick hat sich nichts bewegt – die Fahrt beginnt erst.
    expect(player.position.x).toBe(before);

    const steps = track(game, internals, player, DASH.activeMs / 1000, 100_100);
    const travelled = player.position.x - before;
    // Dieselbe Gesamtstrecke wie beim Sprung: Tempo mal Wirkdauer – bis auf
    // den angebrochenen letzten Tick (180 ms sind 7,2 Ticks zu 25 ms).
    const nominal = DASH_SPEED * (DASH.activeMs / 1000);
    expect(travelled).toBeLessThanOrEqual(nominal + 1e-6);
    expect(travelled).toBeGreaterThan(nominal - DASH_SPEED * DT);

    // Und sie verteilt sich: Bei 30 Snapshots je Sekunde liegen in 180 ms
    // fuenf bis sechs Bilder – genug fuer eine Spur.
    const perTick = steps.map((x, index) => x - (index === 0 ? before : steps[index - 1]!));
    expect(perTick.length).toBeGreaterThanOrEqual(7);
    for (const [index, delta] of perTick.entries()) {
      expect(delta, `Tick ${index}`).toBeGreaterThan(DASH_SPEED * DT * 0.9);
    }
  });

  it('endet an der Wand, statt hindurchzuspringen', () => {
    // Der sichtbare Unterschied, der nebenbei abfällt: Eine Fahrt kann
    // anstoßen. Der Sprung nahm den Endpunkt und fragte nicht nach dem Weg.
    const { game, internals, id, player } = setup(true);
    player.position = { x: GAME.worldWidth - GAME.playerRadius - 40, y: 2200 };
    activateModule(game, id, 100_100, true);
    track(game, internals, player, DASH.activeMs / 1000, 100_100);
    expect(player.position.x).toBeLessThanOrEqual(GAME.worldWidth - GAME.playerRadius + 1e-6);
  });

  it('lässt die Fahrt nach der Wirkdauer enden', () => {
    const { game, internals, id, player } = setup(true);
    activateModule(game, id, 100_100, true);
    track(game, internals, player, DASH.activeMs / 1000 + 0.2, 100_100);
    const afterDash = player.position.x;
    // Danach zaehlt wieder die normale Bewegung – kein Dauer-Dash.
    player.move = { x: 0, y: 0 };
    player.velocity = { x: 0, y: 0 };
    const later = track(game, internals, player, 0.2, 200_000);
    expect(Math.abs(later[later.length - 1]! - afterDash)).toBeLessThan(DASH_SPEED * 0.2 * 0.5);
  });
});
