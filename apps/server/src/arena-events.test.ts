import { afterEach, describe, expect, it } from 'vitest';
import { GAME, type Vector2, type Wall } from '@project-maze/shared';
import {
  FRACTURE_MAX_WALLS,
  FRACTURE_MIN_WALLS,
  GUARDIAN_DAMAGE_TAKEN,
  GUARDIAN_NAME,
  GUARDIAN_REWARD,
  OVERCHARGE_SPEED_RETENTION,
  arenaGuardianIdFor,
  fracturedWallIdsFor,
  tuneArenaEvents
} from './arena-events';
import { tuneArenaSystems } from './arena-systems';
import { tuneBotBrain } from './bot-brain';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { tuneProgression } from './progression-tuning';
import { hardenSimulation } from './simulation-hardening';
import {
  WALLS,
  circleHitsWall,
  hasLineOfSight,
  isFree,
  isWallDisabled,
  nearbyWalls,
  resetDisabledWalls,
  setWallDisabled
} from './world';

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  shapes: Map<string, any>;
  resolveProjectileCollisions(): void;
  stepProjectiles(dt: number, now: number): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  awardXp(player: any, amount: number): void;
  updateBot(player: any, now: number): void;
  drones: Map<string, any>;
}

afterEach(resetDisabledWalls);

const createGame = (botCount = 0): MazeGame =>
  tuneArenaEvents(
    tuneArenaSystems(
      tuneLoadoutSystem(
        tuneProgression(
          tuneBotBrain(
            tuneClassMechanics(
              tuneDrones(
                tuneCombatScaling(
                  hardenSimulation(new MazeGame(botCount))
                )
              )
            )
          )
        )
      )
    )
  );

/** Läuft die Event-Rotation ab, bis die gesuchte Art aktiv ist. */
/**
 * Haelt den Beobachter an einem festen, wandfreien Platz fest, waehrend auf das
 * Event gewartet wird.
 *
 * Vorher stand er dort, wo `addPlayer` ihn zufaellig hingesetzt hat. Das war
 * egal, solange Events immer in der Kartenmitte stattfanden – seit sie den
 * Spielern folgen (`arena-systems.ts`), wandert damit der komplette Aufbau
 * jedes Tests in diesem File mit. Ein Lauf ist so rot geworden und sechzehn
 * gruen, ohne dass sich an der Software etwas geaendert haette.
 */
function advanceToEvent(game: MazeGame, viewerId: string, kind: string, start: number): { event: any; now: number } {
  const internals = game as unknown as Internals;
  const anker = freeSpotNear({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 });
  let now = start;
  for (let index = 0; index < 700; index += 1) {
    const viewer = internals.players.get(viewerId);
    if (viewer) {
      viewer.position = { ...anker };
      viewer.dead = false;
    }
    now += 1_000;
    game.step(1 / 40, now);
    const event = (game.snapshot(viewerId, now) as any).arenaEvent;
    if (event?.kind === kind && event.phase === 'active') return { event, now };
  }
  throw new Error(`Arena-Event "${kind}" wurde nicht aktiv`);
}

/**
 * Ein freier Platz nahe `center` – und einer, von dem aus man `center` auch
 * *sieht*.
 *
 * Die Sichtlinie kam dazu, als die Arena-Events aufhoerten, immer in der
 * Kartenmitte stattzufinden (`arena-systems.ts`). Vorher lagen Guardian und
 * Herausforderer verlaesslich auf derselben freien Flaeche; seither landen sie
 * mal hier, mal dort – und steht eine Wand dazwischen, trifft der Guardian
 * nicht, obwohl an seinem Verhalten nichts falsch ist. Genau so ist der Test
 * einmal rot geworden und dreimal gruen. Ein Test, der wuerfelt, ist schlimmer
 * als keiner.
 */
function freeSpotNear(center: Vector2, clearance = 60): Vector2 {
  return freeSpotSeenFrom(center, center, clearance);
}

/**
 * Sucht nahe `center` einen freien Platz, von dem aus `blickziel` **sichtbar**
 * ist – und das sind nicht zwangslaeufig derselbe Punkt.
 *
 * Genau daran ist der Guardian-Test gescheitert: Er setzte den Herausforderer
 * 170 Einheiten neben den Guardian und suchte die Sichtlinie zu diesem
 * Versatzpunkt statt zum Guardian selbst. `pickGuardianTarget` verlangt aber
 * `hasLineOfSight(guardian.position, candidate.position)` – lag dazwischen eine
 * Wand, sah der Guardian sein Ziel nie und feuerte nicht. Solange Events fest
 * in der Kartenmitte lagen, fiel das nie auf; seit sie wandern, war der Test in
 * einem Viertel der Laeufe rot.
 */
function freeSpotSeenFrom(center: Vector2, blickziel: Vector2, clearance = 60): Vector2 {
  for (let ring = 0; ring <= 8; ring += 1) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const candidate = {
        x: center.x + Math.cos(angle) * ring * 45,
        y: center.y + Math.sin(angle) * ring * 45
      };
      if (isFree(candidate, clearance) && hasLineOfSight(candidate, blickziel)) return candidate;
    }
  }
  return { ...center };
}

interface TestProjectile {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  integrity: number;
  maxIntegrity: number;
  damage: number;
  life: number;
}

function addProjectile(
  internals: Internals,
  id: string,
  ownerId: string,
  position: Vector2,
  velocity: Vector2,
  integrity: number,
  damage: number
): TestProjectile {
  const projectile: TestProjectile = {
    id,
    ownerId,
    position: { ...position },
    velocity: { ...velocity },
    radius: 7,
    integrity,
    maxIntegrity: integrity,
    damage,
    life: 2
  };
  internals.projectiles.set(id, projectile);
  return projectile;
}

/** Zwei frontal aufeinandertreffende Geschosse, die sich normalerweise gegenseitig auslöschen. */
function stageClash(internals: Internals, position: Vector2): { left: TestProjectile; right: TestProjectile } {
  const left = addProjectile(internals, 'clash-left', 'owner-a', position, { x: 600, y: 0 }, 20, 30);
  const right = addProjectile(internals, 'clash-right', 'owner-b', position, { x: -600, y: 0 }, 20, 30);
  return { left, right };
}

describe('overcharge event', () => {
  it('lässt kollidierende Geschosse den Zusammenstoß überstehen, statt sie auszulöschen', () => {
    const control = createGame();
    const controlViewer = control.addPlayer('Control');
    const controlInternals = control as unknown as Internals;
    stageClash(controlInternals, freeSpotNear({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 }));
    controlInternals.resolveProjectileCollisions();
    expect(controlInternals.projectiles.has('clash-left')).toBe(false);
    expect(controlInternals.projectiles.has('clash-right')).toBe(false);
    expect(control.snapshot(controlViewer).type).toBe('snapshot');

    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'overcharge', Date.now());

    stageClash(internals, freeSpotNear(event.center));
    internals.resolveProjectileCollisions();
    expect(internals.projectiles.has('clash-left')).toBe(true);
    expect(internals.projectiles.has('clash-right')).toBe(true);
  });

  it('verändert keinen Schaden – weder am Geschoss noch am getroffenen Spieler', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event, now } = advanceToEvent(game, viewerId, 'overcharge', Date.now());

    const spot = freeSpotNear(event.center);
    const { left, right } = stageClash(internals, spot);
    internals.resolveProjectileCollisions();
    expect(left.damage).toBe(30);
    expect(right.damage).toBe(30);

    // Freie Schussbahn: identische Ausgangslage in beiden Spielen.
    const damageTaken = (target: MazeGame, at: Vector2, when: number): number => {
      const targetInternals = target as unknown as Internals;
      targetInternals.projectiles.clear();
      for (const [id, shape] of targetInternals.shapes) {
        if (Math.hypot(shape.position.x - at.x, shape.position.y - at.y) < 140) targetInternals.shapes.delete(id);
      }
      const victimId = target.addPlayer('Victim');
      const victim = targetInternals.players.get(victimId);
      victim.position = { ...at };
      victim.level = 20;
      victim.invulnerable = false;
      victim.invulnerableUntil = 0;
      const before = victim.health;
      addProjectile(targetInternals, 'shot', 'shooter', { x: at.x - 40, y: at.y }, { x: 800, y: 0 }, 40, 25);
      targetInternals.stepProjectiles(1 / 40, when);
      return before - victim.health;
    };

    const inZone = damageTaken(game, spot, now);
    const control = createGame();
    const outside = damageTaken(control, spot, now);
    expect(inZone).toBeGreaterThan(0);
    expect(inZone).toBeCloseTo(outside, 6);
  });

  it('wirkt nur innerhalb der markierten Zone', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'overcharge', Date.now());

    const outside = freeSpotNear({ x: event.center.x + event.radius + 320, y: event.center.y });
    stageClash(internals, outside);
    internals.resolveProjectileCollisions();
    expect(internals.projectiles.has('clash-left')).toBe(false);
    expect(internals.projectiles.has('clash-right')).toBe(false);
  });

  it('lenkt gestreifte Geschosse ab und bremst sie', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'overcharge', Date.now());

    const { left } = stageClash(internals, freeSpotNear(event.center));
    internals.resolveProjectileCollisions();
    expect(Math.abs(left.velocity.y)).toBeGreaterThan(0);
    expect(Math.hypot(left.velocity.x, left.velocity.y)).toBeCloseTo(600 * OVERCHARGE_SPEED_RETENTION, 4);
  });

  it('verbraucht den Puffer, sodass Geschosse nicht unzerstörbar werden', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'overcharge', Date.now());

    const spot = freeSpotNear(event.center);
    addProjectile(internals, 'survivor', 'owner-a', spot, { x: 600, y: 0 }, 20, 1);
    let clashes = 0;
    while (internals.projectiles.has('survivor') && clashes < 12) {
      clashes += 1;
      addProjectile(internals, `attacker-${clashes}`, 'owner-b', spot, { x: -600, y: 0 }, 4_000, 8);
      internals.resolveProjectileCollisions();
      internals.projectiles.delete(`attacker-${clashes}`);
    }
    expect(internals.projectiles.has('survivor')).toBe(false);
    expect(clashes).toBeGreaterThan(2);
  });
});

describe('fracture event', () => {
  const wallOf = (id: string): Wall => {
    const wall = WALLS.find((candidate) => candidate.id === id);
    expect(wall).toBeDefined();
    return wall!;
  };
  const wallCenter = (wall: Wall): Vector2 => ({ x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 });
  const clearShapesIn = (internals: Internals, wall: Wall): void => {
    for (const [id, shape] of internals.shapes) {
      if (circleHitsWall(shape.position, shape.radius + 40, wall)) internals.shapes.delete(id);
    }
  };
  /** Steppt, bis alle Segmente zurück sind – oder bricht nach dem Zeitfenster ab. */
  const runUntilRestored = (game: MazeGame, from: number, steps = 800): number => {
    let now = from;
    for (let index = 0; index < steps && fracturedWallIdsFor(game).length > 0; index += 1) {
      now += 80;
      game.step(0.08, now);
    }
    return now;
  };

  it('bricht während der aktiven Phase 2–4 generierte Segmente auf', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    advanceToEvent(game, viewerId, 'fracture', Date.now());

    const opened = fracturedWallIdsFor(game);
    expect(opened.length).toBeGreaterThanOrEqual(FRACTURE_MIN_WALLS);
    expect(opened.length).toBeLessThanOrEqual(FRACTURE_MAX_WALLS);
    for (const id of opened) {
      expect(id.startsWith('l')).toBe(false);
      expect(isWallDisabled(id)).toBe(true);
      // Das Segment blockiert nicht mehr und wird nicht mehr an Clients gesendet.
      // Geprüft wird gezielt diese Wand: benachbarte Segmente dürfen denselben
      // Punkt weiterhin belegen, sonst hinge der Test am Zufall der Wandauswahl.
      const center = wallCenter(wallOf(id));
      expect(nearbyWalls(center, 60).some((wall) => wall.id === id)).toBe(false);
      expect(game.snapshot(viewerId).walls.some((wall) => wall.id === id)).toBe(false);
    }
  });

  it('stellt nach dem Event alle Segmente wieder her', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const { event } = advanceToEvent(game, viewerId, 'fracture', Date.now());
    const opened = fracturedWallIdsFor(game);
    expect(opened.length).toBeGreaterThan(0);

    game.step(1 / 40, event.endsAt + 1);
    runUntilRestored(game, event.endsAt + 1);

    expect(fracturedWallIdsFor(game)).toHaveLength(0);
    for (const id of opened) {
      expect(isWallDisabled(id)).toBe(false);
      expect(isFree(wallCenter(wallOf(id)), 22)).toBe(false);
    }
  });

  it('verzögert die Reaktivierung, solange ein Spieler in der Fläche steht', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'fracture', Date.now());
    const wall = wallOf(fracturedWallIdsFor(game)[0]!);

    // Nur der Spieler soll die Fläche belegen – sonst bewiese der Test nichts.
    clearShapesIn(internals, wall);
    const blockerId = game.addPlayer('Blocker');
    const blocker = internals.players.get(blockerId);
    blocker.position = wallCenter(wall);
    blocker.level = 20;

    game.step(1 / 40, event.endsAt + 1);
    expect(isWallDisabled(wall.id)).toBe(true);
    expect(fracturedWallIdsFor(game)).toContain(wall.id);

    // Auch nach mehreren Sekunden bleibt die Wand offen – niemand wird eingemauert.
    let now = event.endsAt + 1;
    for (let index = 0; index < 40; index += 1) {
      now += 80;
      blocker.position = wallCenter(wall);
      game.step(0.08, now);
    }
    expect(isWallDisabled(wall.id)).toBe(true);

    blocker.position = { x: 240, y: 240 };
    clearShapesIn(internals, wall);
    game.step(1 / 40, now + 25);
    expect(isWallDisabled(wall.id)).toBe(false);
  });

  it('verzögert die Reaktivierung auch für Drohnen und Formen', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'fracture', Date.now());
    const wall = wallOf(fracturedWallIdsFor(game)[0]!);
    const center = wallCenter(wall);

    clearShapesIn(internals, wall);
    const shape = [...internals.shapes.values()][0];
    shape.position = { ...center };
    shape.velocity = { x: 0, y: 0 };
    game.step(1 / 40, event.endsAt + 1);
    expect(isWallDisabled(wall.id)).toBe(true);

    shape.position = { x: 240, y: 240 };
    internals.drones.set('parked-drone', {
      id: 'parked-drone',
      ownerId: viewerId,
      position: { ...center },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: 100,
      maxHealth: 100,
      slot: 0,
      contactCooldown: 5,
      gameplayRadius: 12
    });
    game.step(1 / 40, event.endsAt + 50);
    expect(isWallDisabled(wall.id)).toBe(true);

    internals.drones.delete('parked-drone');
    game.step(1 / 40, event.endsAt + 100);
    expect(isWallDisabled(wall.id)).toBe(false);
  });

  it('öffnet Sichtlinien und Wege, sodass Bots die neue Route nutzen', () => {
    const game = createGame(6);
    const internals = game as unknown as Internals;
    const wall = WALLS.find((candidate) => {
      if (!candidate.id.startsWith('v')) return false;
      const y = candidate.y + candidate.height / 2;
      return isFree({ x: candidate.x - 60, y }, 22) && isFree({ x: candidate.x + candidate.width + 60, y }, 22);
    });
    expect(wall).toBeDefined();
    if (!wall) return;

    const y = wall.y + wall.height / 2;
    const left = { x: wall.x - 60, y };
    const right = { x: wall.x + wall.width + 60, y };

    const hunter = [...internals.players.values()].find((player) => player.bot?.style === 'hunter');
    expect(hunter).toBeDefined();
    const targetId = game.addPlayer('Beute');
    const target = internals.players.get(targetId);
    for (const player of internals.players.values()) {
      if (player !== hunter && player !== target) player.position = { x: 240, y: 240 };
    }
    hunter.position = { ...left };
    target.position = { ...right };
    target.level = 20;
    target.invulnerable = false;
    target.invulnerableUntil = 0;

    // Geschlossene Wand: keine Sichtlinie, kein Ziel, kein Durchkommen.
    expect(hasLineOfSight(left, right)).toBe(false);
    hunter.bot.decisionAt = 0;
    internals.updateBot(hunter, 10_000);
    expect(hunter.bot.targetId).toBeNull();

    setWallDisabled(wall.id, true);
    expect(hasLineOfSight(left, right)).toBe(true);
    hunter.bot.decisionAt = 0;
    internals.updateBot(hunter, 11_000);
    expect(hunter.bot.targetId).toBe(targetId);
  });
});

describe('hunter signal event', () => {
  it('stellt einen neutralen Guardian in die Zone und meldet ihn im Snapshot', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event, now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());

    const guardianId = arenaGuardianIdFor(game);
    expect(guardianId).toBeTruthy();
    const guardian = internals.players.get(guardianId!);
    expect(guardian.name).toBe(GUARDIAN_NAME);
    expect(guardian.isBot).toBe(true);
    expect(guardian.bot).toBeNull();
    expect(guardian.playerClass).toBe('guardian');
    expect(guardian.level).toBe(GAME.maxLevel);
    expect(Math.hypot(guardian.position.x - event.center.x, guardian.position.y - event.center.y))
      .toBeLessThanOrEqual(event.radius);

    const snapshot = game.snapshot(viewerId, now) as any;
    expect(snapshot.arenaGuardianId).toBe(guardianId);
    expect(snapshot.leaderboard.some((entry: any) => entry.id === guardianId)).toBe(false);
  });

  it('erhält nur einen Bruchteil des Schadens und sammelt selbst keinen Score', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const guardian = internals.players.get(arenaGuardianIdFor(game)!);

    const before = guardian.health;
    internals.damagePlayer(guardian, 100, viewerId, now);
    expect(before - guardian.health).toBeCloseTo(100 * GUARDIAN_DAMAGE_TAKEN, 5);

    internals.awardXp(guardian, 5_000);
    expect(guardian.score).toBe(0);
    expect(guardian.kills).toBe(0);
  });

  it('verschont frische Spieler, bis sie den Guardian selbst angreifen', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const guardianId = arenaGuardianIdFor(game)!;

    const freshId = game.addPlayer('Fresh');
    const fresh = internals.players.get(freshId);
    fresh.level = 1;
    fresh.invulnerable = false;
    fresh.invulnerableUntil = 0;

    const protectedHealth = fresh.health;
    internals.damagePlayer(fresh, 25, guardianId, now);
    expect(fresh.health).toBe(protectedHealth);

    internals.damagePlayer(internals.players.get(guardianId), 5, freshId, now);
    internals.damagePlayer(fresh, 25, guardianId, now + 10);
    expect(fresh.health).toBeLessThan(protectedHealth);
  });

  it('belohnt den Abschuss und lässt den Guardian nicht respawnen', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Hunter');
    const internals = game as unknown as Internals;
    const { now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const guardianId = arenaGuardianIdFor(game)!;
    const guardian = internals.players.get(guardianId);
    const hunter = internals.players.get(viewerId);
    hunter.level = 20;

    const scoreBefore = hunter.score;
    internals.damagePlayer(guardian, guardian.maxHealth * 20, viewerId, now);
    expect(guardian.dead).toBe(true);
    expect(hunter.score - scoreBefore).toBeGreaterThanOrEqual(GUARDIAN_REWARD);

    game.step(1 / 40, now + 25);
    expect(internals.players.has(guardianId)).toBe(false);
    expect(arenaGuardianIdFor(game)).toBeNull();

    game.step(1 / 40, now + 5_000);
    expect(arenaGuardianIdFor(game)).toBeNull();
  });

  it('greift Spieler an, die ihm in der Zone zu nahe kommen', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    let { now } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const guardian = internals.players.get(arenaGuardianIdFor(game)!);

    const challengerId = game.addPlayer('Challenger');
    const challenger = internals.players.get(challengerId);
    challenger.position = freeSpotSeenFrom({ x: guardian.position.x + 170, y: guardian.position.y }, guardian.position, 40);
    challenger.level = 20;
    challenger.invulnerable = false;
    challenger.invulnerableUntil = 0;
    challenger.health = challenger.maxHealth;

    /*
     * `primary` wird waehrend der Schleife mitgeschrieben, nicht danach
     * abgelesen.
     *
     * Vorher stand am Ende `expect(guardian.primary).toBe(true)` – eine
     * Momentaufnahme, die verlangt, dass der Guardian ausgerechnet in der
     * letzten Millisekunde feuert. Er bewegt sich aber: `primary` gilt nur
     * innerhalb `maxAimDistance + 60`, und wer kurz aus dieser Spanne laeuft,
     * steht am Ende mit `false` da, obwohl er drei Sekunden lang geschossen
     * hat. Solange Events fest in der Kartenmitte lagen, ging das immer gut;
     * seit sie wandern, war der Test in vier von fuenfzehn Laeufen rot.
     *
     * Der Schaden bleibt die zweite, unabhaengige Bedingung – gefeuert zu haben
     * genuegt nicht, es muss auch angekommen sein.
     */
    /*
     * Das Trainingsziel BLEIBT in Reichweite -- es steht nicht still.
     *
     * Der Guardian bewegt sich; ein Herausforderer auf einem festen Punkt kann
     * die ganzen drei Sekunden ausserhalb von `maxAimDistance` liegen, und dann
     * misst der Test nicht seine Angriffslust, sondern seinen Spazierweg.
     * Genau daran ist er am 12.08. in einem von zehn vollen Suite-Laeufen
     * gescheitert (`damageTaken` blieb 0) -- dieselbe Ursache, die der
     * Kommentar oben fuer `primary` schon einmal behoben hat, nur eine Zeile
     * tiefer. Also folgt das Ziel dem Guardian in konstantem Abstand.
     */
    let damageTaken = 0;
    let hatGefeuert = false;
    for (let index = 0; index < 120; index += 1) {
      challenger.position = freeSpotSeenFrom(
        { x: guardian.position.x + 170, y: guardian.position.y },
        guardian.position,
        40
      );
      now += 25;
      game.step(1 / 40, now);
      if (guardian.primary) hatGefeuert = true;
      damageTaken += Math.max(0, challenger.maxHealth - challenger.health);
      challenger.health = challenger.maxHealth;
      challenger.invulnerable = false;
      challenger.invulnerableUntil = 0;
    }
    expect(hatGefeuert).toBe(true);
    expect(damageTaken).toBeGreaterThan(0);
  });

  it('entfernt den Guardian, sobald das Event endet', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    const internals = game as unknown as Internals;
    const { event } = advanceToEvent(game, viewerId, 'hunterSignal', Date.now());
    const guardianId = arenaGuardianIdFor(game)!;
    expect(internals.players.has(guardianId)).toBe(true);

    game.step(1 / 40, event.endsAt + 1);
    expect(arenaGuardianIdFor(game)).toBeNull();
    expect(internals.players.has(guardianId)).toBe(false);
  });
});
