import { GAME, type PlayerSnapshot, type WorldSnapshot } from '@project-maze/shared';
import { describe, expect, it } from 'vitest';
import {
  KILLCAM_MAX_FRAMES,
  KILLCAM_WINDOW_MS,
  KillcamRecorder,
  buildReplay,
  resolveKillerId,
  type KillcamFrame
} from './killcam';
import { framing, lastKnownActor, sampleFrame } from './killcam-view';

function player(id: string, x: number, y: number, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id,
    name: id,
    playerClass: 'core',
    position: { x, y },
    velocity: { x: 0, y: 0 },
    angle: 0,
    health: 100,
    maxHealth: 100,
    level: 1,
    xp: 0,
    xpForNextLevel: 73,
    availablePoints: 0,
    upgrades: {
      maxHealth: 0, regen: 0, moveSpeed: 0, reload: 0,
      damage: 0, projectileSpeed: 0, penetration: 0, bodyDamage: 0
    },
    score: 0,
    kills: 0,
    deaths: 0,
    streak: 0,
    bestStreak: 0,
    invulnerable: false,
    isBot: false,
    dead: false,
    deathLevel: 1,
    respawnLevel: 1,
    canRespawnAt: 0,
    autoRespawnAt: 0,
    killerName: '',
    ...overrides
  };
}

function snapshot(time: number, players: PlayerSnapshot[], projectiles: WorldSnapshot['projectiles'] = []): WorldSnapshot {
  return {
    type: 'snapshot',
    selfId: 'me',
    tick: Math.round(time / 25),
    serverTime: time,
    players,
    projectiles,
    drones: [],
    shapes: [],
    walls: [{ id: 'w1', x: 0, y: 0, width: 40, height: 200 }],
    leaderboard: [],
    killfeed: []
  };
}

const frame = (time: number, actors: KillcamFrame['actors']): KillcamFrame => ({ time, actors, shots: [] });
const actor = (id: string, x: number, y: number, name = id): KillcamFrame['actors'][number] => ({
  id, name, x, y, angle: 0, radius: GAME.playerRadius, dead: false, health: 100, maxHealth: 100
});

describe('KillcamRecorder', () => {
  it('records the local player and nearby opponents', () => {
    const recorder = new KillcamRecorder();
    recorder.record(snapshot(1000, [player('me', 0, 0), player('foe', 120, 0)]));
    const [recorded] = recorder.takeFrames();
    expect(recorded?.actors.map((entry) => entry.id).sort()).toEqual(['foe', 'me']);
  });

  it('drops opponents far outside the recorded area', () => {
    const recorder = new KillcamRecorder();
    recorder.record(snapshot(1000, [player('me', 0, 0), player('far', 5000, 5000)]));
    const [recorded] = recorder.takeFrames();
    expect(recorded?.actors.map((entry) => entry.id)).toEqual(['me']);
  });

  it('forgets frames older than the recording window', () => {
    const recorder = new KillcamRecorder();
    for (let time = 0; time <= 20_000; time += 1000) recorder.record(snapshot(time, [player('me', 0, 0)]));
    const frames = recorder.takeFrames();
    const oldest = frames[0];
    const newest = frames[frames.length - 1];
    expect(newest!.time - oldest!.time).toBeLessThanOrEqual(KILLCAM_WINDOW_MS);
  });

  it('caps the buffer even at a very high snapshot rate', () => {
    const recorder = new KillcamRecorder();
    for (let index = 0; index < 900; index += 1) recorder.record(snapshot(index, [player('me', 0, 0)]));
    expect(recorder.frameCount).toBeLessThanOrEqual(KILLCAM_MAX_FRAMES);
  });

  it('ignores snapshots without the local player', () => {
    const recorder = new KillcamRecorder();
    recorder.record(snapshot(1000, [player('someone-else', 0, 0)]));
    expect(recorder.frameCount).toBe(0);
  });

  it('keeps the walls of the last snapshot as a backdrop', () => {
    const recorder = new KillcamRecorder();
    recorder.record(snapshot(1000, [player('me', 0, 0)]));
    expect(recorder.takeWalls()).toHaveLength(1);
    recorder.clear();
    expect(recorder.takeWalls()).toHaveLength(0);
  });
});

describe('resolveKillerId', () => {
  const frames = [
    frame(0, [actor('me', 0, 0), actor('bot-1', 400, 0, 'Sentinel'), actor('bot-2', 90, 0, 'Sentinel')]),
    frame(100, [actor('me', 0, 0), actor('bot-1', 400, 0, 'Sentinel'), actor('bot-2', 80, 0, 'Sentinel')])
  ];

  it('picks the closest candidate when bots share a name', () => {
    expect(resolveKillerId(frames, 'me', 'Sentinel')).toBe('bot-2');
  });

  it('matches names case insensitively and ignores padding', () => {
    expect(resolveKillerId(frames, 'me', '  sentinel ')).toBe('bot-2');
  });

  it('reports no killer for environment deaths', () => {
    expect(resolveKillerId(frames, 'me', '')).toBeNull();
    expect(resolveKillerId(frames, 'me', 'Arena')).toBeNull();
  });

  it('reports no killer when the name is not in the buffer', () => {
    expect(resolveKillerId(frames, 'me', 'Ghost')).toBeNull();
  });

  it('never resolves the victim as their own killer', () => {
    const selfNamed = [frame(0, [actor('me', 0, 0, 'Sentinel')])];
    expect(resolveKillerId(selfNamed, 'me', 'Sentinel')).toBeNull();
  });
});

describe('buildReplay', () => {
  const frames = [
    frame(0, [actor('me', 0, 0)]),
    frame(1000, [actor('me', 10, 0)]),
    frame(6000, [actor('me', 20, 0)]),
    frame(7000, [actor('me', 30, 0)])
  ];

  it('keeps only the window before the death', () => {
    const replay = buildReplay(frames, 'me', 2000);
    expect(replay.map((entry) => entry.time)).toEqual([6000, 7000]);
  });

  it('discards recordings too short to be readable', () => {
    expect(buildReplay([frame(0, [actor('me', 0, 0)])], 'me', 4000)).toEqual([]);
    expect(buildReplay([], 'me', 4000)).toEqual([]);
  });

  it('discards frames that never contain the victim', () => {
    expect(buildReplay([frame(0, [actor('foe', 0, 0)]), frame(100, [actor('foe', 1, 0)])], 'me', 4000)).toEqual([]);
  });
});

describe('sampleFrame', () => {
  const frames = [
    frame(0, [actor('me', 0, 0)]),
    frame(100, [actor('me', 100, 50)])
  ];

  it('interpolates between two recorded frames', () => {
    const sampled = sampleFrame(frames, 50);
    expect(sampled?.actors[0]?.x).toBeCloseTo(50, 6);
    expect(sampled?.actors[0]?.y).toBeCloseTo(25, 6);
  });

  it('clamps to the recorded ends', () => {
    expect(sampleFrame(frames, -500)?.actors[0]?.x).toBeCloseTo(0, 6);
    expect(sampleFrame(frames, 5000)?.actors[0]?.x).toBeCloseTo(100, 6);
  });

  it('takes the shortest way around when the angle wraps', () => {
    const wrapping = [
      frame(0, [{ ...actor('me', 0, 0), angle: Math.PI * 0.95 }]),
      frame(100, [{ ...actor('me', 0, 0), angle: -Math.PI * 0.95 }])
    ];
    const sampled = sampleFrame(wrapping, 50);
    expect(Math.abs(sampled?.actors[0]?.angle ?? 0)).toBeGreaterThan(Math.PI * 0.97);
  });

  it('handles a single frame and an empty buffer', () => {
    expect(sampleFrame([frame(0, [actor('me', 0, 0)])], 10)?.time).toBe(0);
    expect(sampleFrame([], 10)).toBeNull();
  });
});

describe('lastKnownActor', () => {
  it('returns the most recent recorded state of a tank', () => {
    const frames = [
      frame(0, [actor('me', 0, 0), actor('foe', 100, 0)]),
      frame(100, [actor('me', 0, 0), actor('foe', 160, 0)]),
      frame(200, [actor('me', 0, 0)])
    ];
    expect(lastKnownActor(frames, 'foe')?.x).toBe(160);
  });

  it('returns null for a tank that never appears', () => {
    expect(lastKnownActor([frame(0, [actor('me', 0, 0)])], 'ghost')).toBeNull();
    expect(lastKnownActor([], 'foe')).toBeNull();
  });
});

describe('framing', () => {
  const victim = actor('me', 0, 0);

  it('keeps both tanks inside the frame', () => {
    const killer = actor('foe', 900, 0);
    const view = framing(victim, killer, 400, 170);
    const halfWorldWidth = 400 / view.scale / 2;
    expect(Math.abs(killer.x - view.centerX)).toBeLessThan(halfWorldWidth);
    expect(Math.abs(victim.x - view.centerX)).toBeLessThan(halfWorldWidth);
  });

  it('leans the camera towards the killer', () => {
    const view = framing(victim, actor('foe', 1000, 0), 400, 170);
    expect(view.centerX).toBeGreaterThan(500);
  });

  it('falls back to the victim for environment deaths', () => {
    const view = framing(victim, null, 400, 170);
    expect(view.centerX).toBe(victim.x);
    expect(view.centerY).toBe(victim.y);
  });

  it('never zooms past the configured bounds', () => {
    expect(framing(victim, actor('foe', 1, 0), 400, 170).scale).toBeLessThanOrEqual(0.42);
    expect(framing(victim, actor('foe', 90_000, 0), 400, 170).scale).toBeGreaterThanOrEqual(0.1);
  });
});
