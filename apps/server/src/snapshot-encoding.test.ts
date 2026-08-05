import { describe, expect, it } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { hardenSimulation } from './simulation-hardening';
import { resetSnapshotBaseline, tuneSnapshotEncoding } from './snapshot-encoding';
import { WALLS } from './world';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (deltas: boolean): MazeGame =>
  tuneSnapshotEncoding(
    tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(hardenSimulation(new MazeGame(0))))),
    deltas
  );

const decimals = (value: number): number => {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
};

describe('snapshot rounding', () => {
  it('kürzt Positionen auf eine und Winkel auf drei Nachkommastellen', () => {
    const game = createGame(false);
    const viewerId = game.addPlayer('Viewer');
    const internals = game as unknown as Internals;
    const viewer = internals.players.get(viewerId);
    viewer.position = { x: 2843.2716063857124, y: 1502.998765432 };
    viewer.velocity = { x: -12.34567, y: 98.7654321 };
    viewer.angle = 1.2345678901;
    viewer.health = 104.32000000000012;

    const snapshot = game.snapshot(viewerId);
    const self = snapshot.players.find((player) => player.id === viewerId)!;
    expect(self.position.x).toBe(2843.3);
    expect(self.position.y).toBe(1503);
    expect(decimals(self.velocity.x)).toBeLessThanOrEqual(1);
    expect(self.angle).toBe(1.235);
    expect(self.health).toBe(104.3);

    for (const shape of snapshot.shapes) {
      expect(decimals(shape.position.x)).toBeLessThanOrEqual(1);
      expect(decimals(shape.rotation)).toBeLessThanOrEqual(3);
    }
  });

  it('lässt den Simulationszustand und die geteilten Wandobjekte unangetastet', () => {
    const game = createGame(false);
    const viewerId = game.addPlayer('Viewer');
    const internals = game as unknown as Internals;
    const viewer = internals.players.get(viewerId);
    viewer.position = { x: 2843.2716063857124, y: 1502.998765432 };
    const wallsBefore = WALLS.map((wall) => ({ ...wall }));

    game.snapshot(viewerId);
    // Der Server rechnet unverändert mit voller Genauigkeit weiter.
    expect(viewer.position.x).toBe(2843.2716063857124);
    expect(WALLS.map((wall) => ({ ...wall }))).toEqual(wallsBefore);
  });

  it('sendet ohne Delta-Schalter weiterhin jedes Feld in jedem Snapshot', () => {
    const game = createGame(false);
    const viewerId = game.addPlayer('Viewer');
    game.addPlayer('Other');
    game.step(1 / 40);

    for (let index = 0; index < 3; index += 1) {
      const snapshot = game.snapshot(viewerId);
      expect(snapshot.walls).toBeDefined();
      expect(snapshot.leaderboard).toBeDefined();
      expect(snapshot.killfeed).toBeDefined();
      for (const player of snapshot.players) {
        expect(player.name).toBeDefined();
        expect(player.playerClass).toBeDefined();
        expect(player.upgrades).toBeDefined();
      }
      for (const shape of snapshot.shapes) expect(shape.kind).toBeDefined();
    }
  });
});

describe('snapshot deltas', () => {
  const seatedGame = (): { game: MazeGame; viewerId: string; otherId: string; internals: Internals } => {
    const game = createGame(true);
    const viewerId = game.addPlayer('Viewer');
    const otherId = game.addPlayer('Other');
    const internals = game as unknown as Internals;
    internals.players.get(viewerId).position = { x: 3000, y: 2000 };
    internals.players.get(otherId).position = { x: 3120, y: 2000 };
    return { game, viewerId, otherId, internals };
  };

  it('sendet Statik einmal und lässt sie danach weg', () => {
    const { game, viewerId, otherId } = seatedGame();
    const first = game.snapshot(viewerId);
    const firstOther = first.players.find((player) => player.id === otherId)!;
    expect(firstOther.name).toBe('Other');
    expect(firstOther.upgrades).toBeDefined();

    const second = game.snapshot(viewerId);
    const secondOther = second.players.find((player) => player.id === otherId)!;
    expect(Object.hasOwn(secondOther, 'name')).toBe(false);
    expect(Object.hasOwn(secondOther, 'playerClass')).toBe(false);
    expect(Object.hasOwn(secondOther, 'isBot')).toBe(false);
    expect(Object.hasOwn(secondOther, 'upgrades')).toBe(false);
    // Alles Bewegliche bleibt selbstverständlich drin.
    expect(secondOther.position).toBeDefined();
    expect(secondOther.health).toBeDefined();
  });

  it('sendet Statik erneut, sobald sie sich ändert', () => {
    const { game, viewerId, otherId, internals } = seatedGame();
    game.snapshot(viewerId);
    game.snapshot(viewerId);

    const other = internals.players.get(otherId);
    other.level = 24;
    game.chooseClass(otherId, 'rapid');
    const afterClass = game.snapshot(viewerId);
    expect(afterClass.players.find((player) => player.id === otherId)!.playerClass).toBe('rapid');

    game.snapshot(viewerId);
    other.availablePoints = 1;
    game.applyUpgrade(otherId, 'damage');
    const afterUpgrade = game.snapshot(viewerId);
    expect(afterUpgrade.players.find((player) => player.id === otherId)!.upgrades).toBeDefined();
  });

  it('sendet Statik erneut, wenn ein Spieler das Sichtfeld verlässt und zurückkommt', () => {
    const { game, viewerId, otherId, internals } = seatedGame();
    game.snapshot(viewerId);
    game.snapshot(viewerId);

    internals.players.get(otherId).position = { x: 300, y: 300 };
    const away = game.snapshot(viewerId);
    expect(away.players.some((player) => player.id === otherId)).toBe(false);

    internals.players.get(otherId).position = { x: 3120, y: 2000 };
    const back = game.snapshot(viewerId);
    expect(back.players.find((player) => player.id === otherId)!.name).toBe('Other');
  });

  it('sendet Wände nur, wenn sich die Liste im Sichtfeld ändert', () => {
    const { game, viewerId, internals } = seatedGame();
    const first = game.snapshot(viewerId);
    expect(first.walls.length).toBeGreaterThan(0);
    expect(Object.hasOwn(game.snapshot(viewerId), 'walls')).toBe(false);

    internals.players.get(viewerId).position = { x: 900, y: 3200 };
    const moved = game.snapshot(viewerId);
    expect(Object.hasOwn(moved, 'walls')).toBe(true);
    expect(Object.hasOwn(game.snapshot(viewerId), 'walls')).toBe(false);
  });

  it('sendet Bestenliste und Killfeed nur bei Änderung', () => {
    const { game, viewerId, otherId, internals } = seatedGame();
    game.step(1 / 40);
    expect(Object.hasOwn(game.snapshot(viewerId), 'leaderboard')).toBe(true);
    game.step(1 / 40);
    expect(Object.hasOwn(game.snapshot(viewerId), 'leaderboard')).toBe(false);

    internals.players.get(otherId).score = 9_999;
    game.step(1 / 40);
    expect(Object.hasOwn(game.snapshot(viewerId), 'leaderboard')).toBe(true);

    const killfeedBefore = game.snapshot(viewerId);
    expect(Object.hasOwn(killfeedBefore, 'killfeed')).toBe(false);
    const target = internals.players.get(otherId);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    internals.killPlayer(target, viewerId, Date.now(), 'Arena');
    expect(Object.hasOwn(game.snapshot(viewerId), 'killfeed')).toBe(true);
    expect(Object.hasOwn(game.snapshot(viewerId), 'killfeed')).toBe(false);
  });

  it('sendet Formstatik einmal und für neue Formen erneut', () => {
    const { game, viewerId, internals } = seatedGame();
    const first = game.snapshot(viewerId);
    const known = first.shapes[0];
    expect(known?.kind).toBeDefined();

    const second = game.snapshot(viewerId);
    const repeated = second.shapes.find((shape) => shape.id === known!.id)!;
    expect(Object.hasOwn(repeated, 'kind')).toBe(false);
    expect(Object.hasOwn(repeated, 'radius')).toBe(false);
    expect(Object.hasOwn(repeated, 'maxHealth')).toBe(false);
    expect(repeated.position).toBeDefined();
    expect(repeated.health).toBeDefined();

    // Elite-Beförderung ändert Radius und maximales Leben – die Statik muss neu kommen.
    const shape = internals.shapes.get(known!.id);
    shape.radius *= 1.55;
    shape.maxHealth *= 4;
    const promoted = game.snapshot(viewerId);
    expect(promoted.shapes.find((entry) => entry.id === known!.id)!.radius).toBeDefined();
  });

  it('baut den Stand nach einem verworfenen Snapshot vollständig neu auf', () => {
    const { game, viewerId, otherId } = seatedGame();
    game.snapshot(viewerId);
    expect(Object.hasOwn(game.snapshot(viewerId).players.find((p) => p.id === otherId)!, 'name')).toBe(false);

    resetSnapshotBaseline(game, viewerId);
    const rebuilt = game.snapshot(viewerId);
    expect(rebuilt.players.find((player) => player.id === otherId)!.name).toBe('Other');
    expect(Object.hasOwn(rebuilt, 'walls')).toBe(true);
    expect(Object.hasOwn(rebuilt, 'leaderboard')).toBe(true);
  });

  it('vergisst einen Client beim Verlassen der Arena', () => {
    const { game, viewerId, otherId } = seatedGame();
    game.snapshot(viewerId);
    game.snapshot(viewerId);
    game.removePlayer(otherId);
    const rejoinId = game.addPlayer('Other');
    (game as unknown as Internals).players.get(rejoinId).position = { x: 3120, y: 2000 };
    expect(game.snapshot(viewerId).players.find((player) => player.id === rejoinId)!.name).toBe('Other');
  });

  it('macht den Snapshot spürbar kleiner', () => {
    const { game, viewerId } = seatedGame();
    game.step(1 / 40);
    const full = JSON.stringify(game.snapshot(viewerId)).length;
    const delta = JSON.stringify(game.snapshot(viewerId)).length;
    expect(delta).toBeLessThan(full * 0.75);
  });
});
