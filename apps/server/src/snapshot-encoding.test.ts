import { describe, expect, it } from 'vitest';
import { tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { hardenSimulation } from './simulation-hardening';
import { resetSnapshotBaseline, shortIdStats, tuneSnapshotEncoding } from './snapshot-encoding';
import { WALLS } from './world';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (deltas: boolean, shortIds = false): MazeGame =>
  tuneSnapshotEncoding(
    tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(hardenSimulation(new MazeGame(0))))),
    deltas,
    shortIds
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

describe('leaderboard ranks (Befund 19)', () => {
  it('haengt den Betrachter mit echtem Rang an, wenn er nicht in den Top 8 steht', () => {
    const game = createGame(false);
    const internals = game as unknown as Internals;
    const viewerId = game.addPlayer('Elfter');
    for (let index = 0; index < 9; index += 1) {
      const id = game.addPlayer(`Spitze${index}`);
      internals.players.get(id).score = 10_000 - index * 100;
    }
    const snapshot = game.snapshot(viewerId);
    expect(snapshot.leaderboard).toHaveLength(9);
    expect(snapshot.leaderboard.slice(0, 8).map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const eigene = snapshot.leaderboard[8]!;
    expect(eigene.id).toBe(viewerId);
    expect(eigene.rank).toBe(10);
  });

  it('haengt keine Doppelzeile an, wenn der Betrachter ohnehin oben steht', () => {
    const game = createGame(false);
    const internals = game as unknown as Internals;
    const viewerId = game.addPlayer('Spitzenreiter');
    internals.players.get(viewerId).score = 99_999;
    game.addPlayer('Zweiter');
    const snapshot = game.snapshot(viewerId);
    expect(snapshot.leaderboard.filter((entry) => entry.id === viewerId)).toHaveLength(1);
    expect(snapshot.leaderboard[0]?.rank).toBe(1);
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

  // Befund 19: Die Bestenliste ist seither je Betrachter verschieden (die
  // eigene Zeile mit echtem Rang haengt hinten an). Die Delta-Logik darf
  // deshalb nicht mehr mit einer geteilten Signatur je Tick arbeiten --
  // sonst bekaeme jeder zweite Viewer seine Liste in jedem Snapshot neu.
  it('haelt die Bestenlisten-Deltas auch bei je-Betrachter-Listen', () => {
    const { game, viewerId, otherId, internals } = seatedGame();
    internals.players.get(otherId).score = 5_000;
    game.step(1 / 40);
    expect(Object.hasOwn(game.snapshot(viewerId), 'leaderboard')).toBe(true);
    expect(Object.hasOwn(game.snapshot(otherId), 'leaderboard')).toBe(true);
    // Unveraendert: beide Viewer bekommen ihre Liste NICHT erneut.
    expect(Object.hasOwn(game.snapshot(viewerId), 'leaderboard')).toBe(false);
    expect(Object.hasOwn(game.snapshot(otherId), 'leaderboard')).toBe(false);
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

describe('kurze Netz-IDs', () => {
  /** Zwei Spieler nebeneinander, einer schießt – liefert Spieler und Projektile im Sichtfeld. */
  const seated = (shortIds: boolean): { game: MazeGame; internals: Internals; viewerId: string; otherId: string } => {
    const game = createGame(false, shortIds);
    const internals = game as unknown as Internals;
    const viewerId = game.addPlayer('Viewer');
    const otherId = game.addPlayer('Other');
    internals.players.get(viewerId).position = { x: 3_000, y: 2_000 };
    const other = internals.players.get(otherId);
    other.position = { x: 3_120, y: 2_000 };
    other.primary = true;
    other.aim = { x: 300, y: 0 };
    game.step(1 / 40, 1_000);
    return { game, internals, viewerId, otherId };
  };

  it('lässt ohne Schalter jede ID unverändert', () => {
    const { game, viewerId } = seated(false);
    const snapshot = game.snapshot(viewerId) as any;
    expect(typeof snapshot.selfId).toBe('string');
    expect(snapshot.selfId).toBe(viewerId);
    for (const player of snapshot.players) expect(typeof player.id).toBe('string');
    for (const shape of snapshot.shapes) expect(typeof shape.id).toBe('string');
  });

  it('ersetzt jede Entitäts-ID durch eine Zahl', () => {
    const { game, viewerId } = seated(true);
    const snapshot = game.snapshot(viewerId) as any;

    expect(typeof snapshot.selfId).toBe('number');
    expect(snapshot.players.length).toBeGreaterThan(0);
    for (const player of snapshot.players) expect(Number.isInteger(player.id)).toBe(true);
    for (const shape of snapshot.shapes) expect(Number.isInteger(shape.id)).toBe(true);
    for (const projectile of snapshot.projectiles) {
      expect(Number.isInteger(projectile.id)).toBe(true);
      expect(Number.isInteger(projectile.ownerId)).toBe(true);
    }
    for (const entry of snapshot.leaderboard) expect(Number.isInteger(entry.id)).toBe(true);
    // Wände tragen bereits kurze Namen und bleiben, wie sie sind.
    for (const wall of snapshot.walls) expect(typeof wall.id).toBe('string');
  });

  it('hält Querverweise innerhalb eines Snapshots konsistent', () => {
    const { game, viewerId, otherId } = seated(true);
    const snapshot = game.snapshot(viewerId) as any;

    const byName = new Map(snapshot.players.map((player: any) => [player.name, player.id]));
    expect(snapshot.selfId).toBe(byName.get('Viewer'));
    // `gameplay` ist nach denselben Nummern verschlüsselt wie die Spielerliste.
    for (const player of snapshot.players) expect(snapshot.gameplay[String(player.id)]).toBeDefined();
    expect(Object.keys(snapshot.gameplay)).toHaveLength(snapshot.players.length);
    // Jedes Projektil gehört zu einem Spieler aus derselben Liste.
    const playerIds = new Set(snapshot.players.map((player: any) => player.id));
    expect(snapshot.projectiles.length).toBeGreaterThan(0);
    for (const projectile of snapshot.projectiles) expect(playerIds.has(projectile.ownerId)).toBe(true);
    expect(byName.get('Other')).toBeDefined();
    expect(otherId).not.toBe(byName.get('Other'));
  });

  it('vergibt für dieselbe Entität dauerhaft dieselbe Nummer', () => {
    const { game, viewerId } = seated(true);
    const first = game.snapshot(viewerId) as any;
    game.step(1 / 40, 2_000);
    const second = game.snapshot(viewerId) as any;

    expect(second.selfId).toBe(first.selfId);
    const firstShapes = new Map(first.shapes.map((shape: any) => [shape.id, shape.kind]));
    let matched = 0;
    for (const shape of second.shapes) {
      if (!firstShapes.has(shape.id)) continue;
      expect(shape.kind).toBe(firstShapes.get(shape.id));
      matched += 1;
    }
    expect(matched).toBeGreaterThan(0);
  });

  it('vergibt niemals zweimal dieselbe Nummer', () => {
    const { game, viewerId } = seated(true);
    const snapshot = game.snapshot(viewerId) as any;
    const numbers = [
      ...snapshot.players.map((entity: any) => entity.id),
      ...snapshot.projectiles.map((entity: any) => entity.id),
      ...snapshot.drones.map((entity: any) => entity.id),
      ...snapshot.shapes.map((entity: any) => entity.id)
    ];
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('gibt Nummern verschwundener Entitäten nicht erneut aus', () => {
    const { game, internals, viewerId } = seated(true);
    const before = game.snapshot(viewerId) as any;
    const usedBefore = new Set<number>(
      [...before.shapes, ...before.players, ...before.projectiles].map((entity: any) => entity.id)
    );
    expect(usedBefore.size).toBeGreaterThan(0);
    const nextBefore = shortIdStats(game).next;

    // Alle Formen verschwinden, die Zuordnung wird aufgeräumt.
    internals.shapes.clear();
    game.step(1 / 40, 100_000);

    // Wer danach neu dazukommt, bekommt garantiert eine unbenutzte Nummer –
    // keine der freigewordenen wird recycelt.
    const newcomerId = game.addPlayer('Nachzügler');
    internals.players.get(newcomerId).position = { x: 3_000, y: 2_000 };
    const after = game.snapshot(viewerId, 200_000) as any;
    const newcomer = after.players.find((player: any) => player.name === 'Nachzügler');
    expect(newcomer).toBeDefined();
    expect(newcomer.id).toBeGreaterThanOrEqual(nextBefore);
    expect(usedBefore.has(newcomer.id)).toBe(false);
  });

  it('räumt die Zuordnung auf, statt unbegrenzt zu wachsen', () => {
    const { game, internals, viewerId } = seated(true);
    game.snapshot(viewerId);
    const assignedBefore = shortIdStats(game).assigned;
    expect(assignedBefore).toBeGreaterThan(0);

    internals.shapes.clear();
    game.step(1 / 40, 100_000);
    expect(shortIdStats(game).assigned).toBeLessThan(assignedBefore);
  });

  it('arbeitet mit den Delta-Feldern zusammen', () => {
    const game = createGame(true, true);
    const internals = game as unknown as Internals;
    const viewerId = game.addPlayer('Viewer');
    const otherId = game.addPlayer('Other');
    internals.players.get(viewerId).position = { x: 3_000, y: 2_000 };
    internals.players.get(otherId).position = { x: 3_120, y: 2_000 };
    game.step(1 / 40, 1_000);

    const first = game.snapshot(viewerId) as any;
    const otherShort = first.players.find((player: any) => player.name === 'Other').id;
    expect(Number.isInteger(otherShort)).toBe(true);

    const second = game.snapshot(viewerId) as any;
    const repeated = second.players.find((player: any) => player.id === otherShort);
    // Statik weggelassen, Nummer trotzdem stabil.
    expect(repeated).toBeDefined();
    expect(Object.hasOwn(repeated, 'name')).toBe(false);
    expect(Object.hasOwn(second, 'walls')).toBe(false);
  });

  it('macht den Snapshot bei identischem Weltzustand spürbar kleiner', () => {
    // Beide Varianten müssen denselben Zustand codieren – zwei eigene Spiele
    // hätten zwei verschiedene Welten und wären als Vergleich wertlos.
    const source = tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(hardenSimulation(new MazeGame(0)))));
    const raw = source as any;
    const viewerId = source.addPlayer('Viewer');
    const otherId = source.addPlayer('Other');
    raw.players.get(viewerId).position = { x: 3_000, y: 2_000 };
    const other = raw.players.get(otherId);
    other.position = { x: 3_120, y: 2_000 };
    other.primary = true;
    other.aim = { x: 300, y: 0 };
    source.step(1 / 40, 1_000);
    const frozen = JSON.parse(JSON.stringify(source.snapshot(viewerId)));

    const encoded = (shortIds: boolean): string => {
      const stub = {
        players: raw.players,
        projectiles: raw.projectiles,
        drones: raw.drones,
        shapes: raw.shapes,
        snapshot: () => JSON.parse(JSON.stringify(frozen)),
        removePlayer: () => {},
        step: () => {}
      } as unknown as MazeGame;
      tuneSnapshotEncoding(stub, false, shortIds);
      return JSON.stringify(stub.snapshot(viewerId));
    };

    const plain = encoded(false);
    const short = encoded(true);
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
    // Der eigentliche Beweis: Auf der Leitung bleibt keine einzige UUID übrig.
    expect(uuid.test(plain)).toBe(true);
    expect(uuid.test(short)).toBe(false);
    expect(short.length).toBeLessThan(plain.length);
  });
});
