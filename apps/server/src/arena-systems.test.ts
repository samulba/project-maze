import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { ARENA_EVENT_ROTATION, tuneArenaSystems } from './arena-systems';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  damageShape(shape: any, damage: number, ownerId: string, now: number): void;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (): MazeGame => tuneArenaSystems(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))));

/** Läuft die Event-Rotation ab und sammelt die Art jedes neuen Events. */
function collectEventKinds(game: MazeGame, viewerId: string, count: number, start: number): string[] {
  const kinds: string[] = [];
  let lastId = 0;
  let now = start;
  for (let index = 0; index < 900 && kinds.length < count; index += 1) {
    now += 1_000;
    game.step(1 / 40, now);
    const event = (game.snapshot(viewerId, now) as any).arenaEvent;
    if (event && event.id !== lastId) {
      lastId = event.id;
      kinds.push(event.kind);
    }
  }
  return kinds;
}

/** Steppt bis zur aktiven Phase der gesuchten Event-Art. */
function advanceToEvent(game: MazeGame, viewerId: string, kind: string, start: number): number {
  let now = start;
  for (let index = 0; index < 900; index += 1) {
    now += 1_000;
    game.step(1 / 40, now);
    const event = (game.snapshot(viewerId, now) as any).arenaEvent;
    if (event?.kind === kind && event.phase === 'active') return now;
  }
  throw new Error(`Arena-Event "${kind}" wurde nicht aktiv`);
}

describe('arena systems', () => {
  it('promotes rare elite shapes and grants a bonus when they are destroyed', () => {
    const game = createGame();
    const playerId = game.addPlayer('Farmer');
    const internals = game as unknown as Internals;
    const now = Date.now();
    game.step(1 / 40, now + 19_000);

    const elite = [...internals.shapes.values()].find((shape) => ![16, 40, 100].includes(shape.maxHealth));
    expect(elite).toBeTruthy();
    const player = internals.players.get(playerId);
    player.position = { ...elite.position };
    const snapshot = game.snapshot(playerId, now + 19_000) as any;
    expect(snapshot.eliteShapeIds).toContain(elite.id);

    const before = player.score;
    internals.damageShape(elite, elite.health + 1, playerId, now + 19_100);
    expect(player.score - before).toBeGreaterThanOrEqual(260);
  });

  it('runs Core Surge through warning and active phases', () => {
    const game = createGame();
    const playerId = game.addPlayer('Observer');
    const now = Date.now();
    game.step(1 / 40, now + 66_000);
    const warning = game.snapshot(playerId, now + 66_000) as any;
    expect(warning.arenaEvent?.kind).toBe('coreSurge');
    expect(warning.arenaEvent?.phase).toBe('warning');

    game.step(1 / 40, warning.arenaEvent.startsAt + 1);
    const active = game.snapshot(playerId, warning.arenaEvent.startsAt + 1) as any;
    expect(active.arenaEvent?.phase).toBe('active');
  });

  it('rotiert fest durch alle Arena-Events und beginnt danach von vorn', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    expect(ARENA_EVENT_ROTATION).toEqual(['coreSurge', 'overcharge', 'hunterSignal', 'fracture']);
    const kinds = collectEventKinds(game, viewerId, ARENA_EVENT_ROTATION.length + 1, Date.now());
    expect(kinds).toEqual([...ARENA_EVENT_ROTATION, ARENA_EVENT_ROTATION[0]]);
  });

  it('flutet nur während Core Surge zusätzliche Formen in die Zone', () => {
    const game = createGame();
    const viewerId = game.addPlayer('Observer');
    let now = advanceToEvent(game, viewerId, 'coreSurge', Date.now());
    for (let index = 0; index < 20; index += 1) {
      now += 1_000;
      game.step(1 / 40, now);
    }
    expect(game.entityCounts.shapes).toBeGreaterThan(GAME.shapeTargetCount);

    advanceToEvent(game, viewerId, 'overcharge', now);
    expect(game.entityCounts.shapes).toBeLessThanOrEqual(GAME.shapeTargetCount);
  });

  it('marks a dominant player and awards the bounty only once per claim pair', () => {
    const game = createGame();
    const hunterId = game.addPlayer('Hunter');
    const targetId = game.addPlayer('Leader');
    const internals = game as unknown as Internals;
    const hunter = internals.players.get(hunterId);
    const target = internals.players.get(targetId);
    target.level = 20;
    target.kills = 5;
    target.score = 4_000;
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    const now = Date.now();

    game.step(1 / 40, now + 2_000);
    const snapshot = game.snapshot(hunterId, now + 2_000) as any;
    expect(snapshot.bountyTargetId).toBe(targetId);
    expect(snapshot.bountyValue).toBeGreaterThan(0);

    const before = hunter.score;
    internals.killPlayer(target, hunterId, now + 2_100, 'Arena');
    expect(hunter.score - before).toBeGreaterThanOrEqual(snapshot.bountyValue);
    const after = game.snapshot(hunterId, now + 2_100) as any;
    expect(after.bountyTargetId).toBeNull();
  });
});

/**
 * Die Event-Zone lag frueher fest in der Kartenmitte. Auf 6000 x 4000 ging das
 * durch; auf 9000 x 6000 waeren die Ecken fuer immer belanglos gewesen und die
 * Anfahrt haette bis zu 18 Sekunden von 40 gefressen.
 */
describe('Ort des Arena-Events', () => {
  const mitte = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };

  /** Startet Events, bis `anzahl` beobachtet wurden, und gibt deren Mittelpunkte zurueck. */
  function sammleZentren(anzahl: number, standort: { x: number; y: number }): { x: number; y: number }[] {
    const zentren: { x: number; y: number }[] = [];
    for (let runde = 0; runde < anzahl; runde += 1) {
      const game = createGame();
      const internals = game as unknown as Internals;
      const id = game.addPlayer(`P${runde}`);
      let now = Date.now();
      let gefunden = null;
      for (let schritt = 0; schritt < 400 && !gefunden; schritt += 1) {
        // Vor JEDEM Schritt festnageln: Das Event entsteht mitten im Schritt,
        // und es soll den Standort sehen, gegen den hinterher geprueft wird.
        internals.players.get(id).position = { ...standort };
        internals.players.get(id).dead = false;
        now += 1_000;
        game.step(1 / 40, now);
        gefunden = (game.snapshot(id, now) as any).arenaEvent ?? null;
      }
      if (gefunden) zentren.push(gefunden.center);
    }
    return zentren;
  }

  /*
   * Geprueft wird die Regel, die wirklich gilt: Das Event entsteht im Umkreis
   * von ein bis zwei Zonenbreiten um einen lebenden Spieler.
   *
   * Erst stand hier "naeher am Spieler als an der Kartenmitte". Das klang
   * richtig, folgt aber nicht aus der Regel – zeigt der Zufallswinkel Richtung
   * Mitte, ist die Mitte naeher, ohne dass irgendetwas kaputt waere. Der Test
   * war in zwei von zwoelf Laeufen rot. Wer eine Regel prueft, die er sich
   * selbst ausgedacht hat, misst nur seine eigene Fantasie.
   */
  it('legt das Event in Reichweite eines Spielers statt fest in die Kartenmitte', () => {
    // Weit genug von jedem Rand, dass die Randbegrenzung nicht mitredet – sonst
    // misst der Test sie statt der Regel. Und bewusst NICHT die Kartenmitte,
    // sonst waere "folgt den Spielern" von "immer Mitte" nicht zu unterscheiden.
    const standort = { x: 2_600, y: 4_400 };
    const zentren = sammleZentren(6, standort);
    expect(zentren.length).toBeGreaterThan(0);

    const groesserRadius = 620;
    for (const zentrum of zentren) {
      const zumSpieler = Math.hypot(zentrum.x - standort.x, zentrum.y - standort.y);
      // Anfahrbar, aber nicht im Schoss: 1,2 bis 2,0 Zonenbreiten.
      expect(zumSpieler).toBeGreaterThan(400);
      expect(zumSpieler).toBeLessThan(groesserRadius * 2.2);
      // Und keinesfalls mehr die Kartenmitte.
      expect(Math.hypot(zentrum.x - mitte.x, zentrum.y - mitte.y)).toBeGreaterThan(1);
    }

    // Zwei Events duerfen nicht immer denselben Platz treffen – sonst waere die
    // Zone nur an einen anderen festen Punkt gewandert.
    const einmalig = new Set(zentren.map((z) => `${Math.round(z.x)}/${Math.round(z.y)}`));
    if (zentren.length > 2) expect(einmalig.size).toBeGreaterThan(1);
  });

  /**
   * Steht der Spieler in einer Ecke, zieht die Randbegrenzung das Event
   * naeher an ihn heran, als der Mindestabstand vorsieht. Das ist gewollt:
   * Lieber ein Event etwas zu nah als eines, das halb ausserhalb der Karte
   * liegt und dessen Formen keinen Platz finden.
   */
  it('haelt die Zone auch am Kartenrand vollstaendig innerhalb der Karte', () => {
    for (const ecke of [{ x: 300, y: 300 }, { x: GAME.worldWidth - 300, y: GAME.worldHeight - 300 }]) {
      for (const zentrum of sammleZentren(2, ecke)) {
        // 520 ist der kleinste Event-Radius; die Zone muss ganz hineinpassen.
        expect(zentrum.x).toBeGreaterThanOrEqual(520);
        expect(zentrum.y).toBeGreaterThanOrEqual(520);
        expect(zentrum.x).toBeLessThanOrEqual(GAME.worldWidth - 520);
        expect(zentrum.y).toBeLessThanOrEqual(GAME.worldHeight - 520);
      }
    }
  });
});
