import {
  UPGRADE_IDS,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type UpgradeId,
  type WireWorldSnapshot,
  type WorldSnapshot
} from '@project-maze/shared';
import { describe, expect, it } from 'vitest';
import { SnapshotHydrator, isWireSnapshot } from './snapshot-hydrator';

const upgrades = (value = 0): Record<UpgradeId, number> =>
  Object.fromEntries(UPGRADE_IDS.map((id) => [id, value])) as Record<UpgradeId, number>;

function player(id: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id,
    name: `Name-${id}`,
    playerClass: 'railgun',
    position: { x: 1, y: 2 },
    velocity: { x: 0, y: 0 },
    angle: 0,
    health: 100,
    maxHealth: 100,
    level: 5,
    xp: 0,
    xpForNextLevel: 100,
    availablePoints: 0,
    upgrades: upgrades(),
    score: 0,
    kills: 0,
    deaths: 0,
    streak: 0,
    bestStreak: 0,
    invulnerable: false,
    isBot: true,
    dead: false,
    deathLevel: 1,
    respawnLevel: 1,
    canRespawnAt: 0,
    autoRespawnAt: 0,
    killerName: '',
    ...overrides
  };
}

function shape(id: string, overrides: Partial<ShapeSnapshot> = {}): ShapeSnapshot {
  return {
    id,
    kind: 'pentagon',
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    radius: 26,
    rotation: 0,
    health: 80,
    maxHealth: 80,
    ...overrides
  };
}

/** Ein vollständiger Snapshot, wie ihn `SNAPSHOT_DELTAS=false` liefert. */
function full(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    type: 'snapshot',
    selfId: 'me',
    tick: 1,
    serverTime: 1000,
    players: [player('me', { isBot: false }), player('bot-1')],
    projectiles: [],
    drones: [],
    shapes: [shape('s1')],
    walls: [{ id: 'w1', x: 0, y: 0, width: 40, height: 200 }],
    leaderboard: [{ id: 'me', name: 'Ich', score: 10, level: 5, playerClass: 'railgun', isBot: false }],
    killfeed: [{ id: 1, killer: 'A', victim: 'B', at: 900, streak: 1 }],
    ...overrides
  };
}

/**
 * Bildet nach, was `stripPlayerStatics`/`stripShapeStatics`/`stripWalls` auf der
 * Serverseite tun: Felder, die der Client schon kennt, fallen weg.
 */
function stripped(source: WorldSnapshot, options: {
  playerStatics?: boolean;
  shapeStatics?: boolean;
  walls?: boolean;
  leaderboard?: boolean;
  killfeed?: boolean;
} = {}): WireWorldSnapshot {
  const wire = JSON.parse(JSON.stringify(source)) as Record<string, unknown> & WireWorldSnapshot;
  if (options.playerStatics) {
    wire.players = wire.players.map((entry) => {
      const { name: _n, playerClass: _c, isBot: _b, upgrades: _u, ...rest } = entry as PlayerSnapshot;
      return rest;
    });
  }
  if (options.shapeStatics) {
    wire.shapes = wire.shapes.map((entry) => {
      const { kind: _k, radius: _r, maxHealth: _m, ...rest } = entry as ShapeSnapshot;
      return rest;
    });
  }
  if (options.walls) delete wire.walls;
  if (options.leaderboard) delete wire.leaderboard;
  if (options.killfeed) delete wire.killfeed;
  return wire;
}

describe('SnapshotHydrator with SNAPSHOT_DELTAS=false', () => {
  it('passes full snapshots through unchanged', () => {
    const hydrator = new SnapshotHydrator();
    const source = full();
    const result = hydrator.hydrate(JSON.parse(JSON.stringify(source)) as WireWorldSnapshot);
    expect(result).toEqual(source);
    expect(hydrator.missingStatics).toBe(0);
  });

  it('stays correct over many full snapshots', () => {
    const hydrator = new SnapshotHydrator();
    for (let tick = 0; tick < 5; tick += 1) {
      const source = full({ tick });
      const result = hydrator.hydrate(JSON.parse(JSON.stringify(source)) as WireWorldSnapshot);
      expect(result).toEqual(source);
    }
    expect(hydrator.missingStatics).toBe(0);
  });
});

describe('SnapshotHydrator with SNAPSHOT_DELTAS=true', () => {
  it('restores player statics the server left out', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));

    const result = hydrator.hydrate(stripped(full({ tick: 2 }), { playerStatics: true }));
    expect(result.players.map((entry) => entry.name)).toEqual(['Name-me', 'Name-bot-1']);
    expect(result.players[0]?.playerClass).toBe('railgun');
    expect(result.players[0]?.isBot).toBe(false);
    expect(result.players[1]?.isBot).toBe(true);
    expect(result.players[0]?.upgrades).toEqual(upgrades());
    expect(hydrator.missingStatics).toBe(0);
  });

  it('restores shape statics the server left out', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));

    const result = hydrator.hydrate(stripped(full({ tick: 2 }), { shapeStatics: true }));
    expect(result.shapes[0]).toMatchObject({ kind: 'pentagon', radius: 26, maxHealth: 80 });
    expect(hydrator.missingStatics).toBe(0);
  });

  it('keeps walls, leaderboard and killfeed from the last snapshot that carried them', () => {
    const hydrator = new SnapshotHydrator();
    const first = full();
    hydrator.hydrate(stripped(first));

    const result = hydrator.hydrate(
      stripped(full({ tick: 2 }), { walls: true, leaderboard: true, killfeed: true })
    );
    expect(result.walls).toEqual(first.walls);
    expect(result.leaderboard).toEqual(first.leaderboard);
    expect(result.killfeed).toEqual(first.killfeed);
  });

  it('takes over fresh values when the server sends them again', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));
    hydrator.hydrate(stripped(full({ tick: 2 }), { walls: true }));

    const changed = full({ tick: 3, walls: [{ id: 'w2', x: 9, y: 9, width: 10, height: 10 }] });
    expect(hydrator.hydrate(stripped(changed)).walls).toEqual(changed.walls);
    // Und der neue Stand hält für die folgenden Snapshots.
    expect(hydrator.hydrate(stripped(full({ tick: 4 }), { walls: true })).walls).toEqual(changed.walls);
  });

  it('follows a player who changes class and upgrades', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));

    const promoted = full({
      tick: 2,
      players: [player('me', { isBot: false, playerClass: 'lancer', upgrades: upgrades(3) }), player('bot-1')]
    });
    hydrator.hydrate(stripped(promoted));

    const later = hydrator.hydrate(stripped(full({ tick: 3 }), { playerStatics: true }));
    expect(later.players[0]?.playerClass).toBe('lancer');
    expect(later.players[0]?.upgrades).toEqual(upgrades(3));
  });

  it('re-learns a player who left the view and came back', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));
    // Zwischendurch ohne den Bot – der Server sendet ihn danach wieder voll.
    hydrator.hydrate(stripped(full({ tick: 2, players: [player('me', { isBot: false })] })));
    const back = hydrator.hydrate(stripped(full({ tick: 3 })));
    expect(back.players[1]?.name).toBe('Name-bot-1');
    expect(hydrator.missingStatics).toBe(0);
  });
});

describe('SnapshotHydrator reset', () => {
  it('forgets everything so a new connection starts clean', () => {
    const hydrator = new SnapshotHydrator();
    hydrator.hydrate(stripped(full()));
    hydrator.reset();

    const result = hydrator.hydrate(stripped(full({ tick: 2 }), {
      playerStatics: true, shapeStatics: true, walls: true, leaderboard: true, killfeed: true
    }));
    // Nichts im Cache: Der Hydrator meldet den Versatz, statt still zu raten.
    expect(hydrator.missingStatics).toBeGreaterThan(0);
    expect(result.walls).toEqual([]);
    expect(result.leaderboard).toEqual([]);
    expect(result.killfeed).toEqual([]);
  });
});

describe('SnapshotHydrator when statics are missing', () => {
  it('never renders undefined into the game', () => {
    const hydrator = new SnapshotHydrator();
    const result = hydrator.hydrate(stripped(full(), { playerStatics: true, shapeStatics: true }));

    for (const entry of result.players) {
      expect(typeof entry.name).toBe('string');
      expect(entry.playerClass).toBe('core');
      expect(typeof entry.isBot).toBe('boolean');
      expect(entry.upgrades).toEqual(upgrades());
    }
    for (const entry of result.shapes) {
      expect(entry.kind).toBe('square');
      expect(entry.radius).toBeGreaterThan(0);
      expect(entry.maxHealth).toBeGreaterThan(0);
    }
    expect(hydrator.missingStatics).toBe(3);
  });

  it('keeps the local player in the snapshot rather than dropping them', () => {
    const hydrator = new SnapshotHydrator();
    const result = hydrator.hydrate(stripped(full(), { playerStatics: true }));
    expect(result.players.find((entry) => entry.id === 'me')).toBeDefined();
  });
});

describe('hydrated snapshots keep everything else', () => {
  it('carries the gameplay extension through untouched', () => {
    const hydrator = new SnapshotHydrator();
    const wire = {
      ...stripped(full()),
      gameplay: { me: { activeModule: 'dash' } },
      eliteShapeIds: ['s1'],
      arenaEvent: null,
      bountyTargetId: null,
      bountyValue: 0,
      arenaGuardianId: null,
      freshAchievements: ['maxLevel']
    } as unknown as WireWorldSnapshot;

    const result = hydrator.hydrate(wire) as WireWorldSnapshot & Record<string, unknown>;
    expect(result.eliteShapeIds).toEqual(['s1']);
    expect(result.freshAchievements).toEqual(['maxLevel']);
    expect(result.gameplay).toEqual({ me: { activeModule: 'dash' } });
  });

  it('leaves projectiles and drones alone', () => {
    const hydrator = new SnapshotHydrator();
    const source = full({
      projectiles: [{
        id: 'p1', ownerId: 'me', position: { x: 5, y: 5 }, velocity: { x: 1, y: 0 },
        radius: 6, integrity: 1, maxIntegrity: 1
      }] as WorldSnapshot['projectiles']
    });
    const result = hydrator.hydrate(stripped(source, { playerStatics: false }));
    expect(result.projectiles).toEqual(source.projectiles);
  });
});

describe('isWireSnapshot', () => {
  it('only accepts snapshot messages', () => {
    expect(isWireSnapshot(stripped(full()))).toBe(true);
    expect(isWireSnapshot({ type: 'welcome', selfId: 'me' })).toBe(false);
    expect(isWireSnapshot({ type: 'pong', sentAt: 1, serverTime: 2 })).toBe(false);
    expect(isWireSnapshot({ type: 'error', message: 'nope' })).toBe(false);
  });
});
