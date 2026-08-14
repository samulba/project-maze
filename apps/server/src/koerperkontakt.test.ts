import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { messfeld } from './messfeld';
import { hardenSimulation } from './simulation-hardening';

/**
 * Körper durchdringen sich nicht – Sams Spieltest vom 14.08., Punkte 5 und 7.
 *
 * > „Wenn Kugeln irgendwas hitten wie z.B. einen Square, den aber nicht direkt
 * > töten, sollen die nicht einfach DURCH fliegen! Das macht kein SINN!"
 *
 * > „Man kann keine Drohnen kaputt schießen!!! Das ist viel zu OP? […] und
 * > fliegen auch einfach wie Schüsse durch Objekte durch."
 *
 * Geprüft wird durch die Kette, nicht gegen die Basis: `stepProjectiles` und
 * `stepDrones` werden von `hardenSimulation` bzw. `tuneDrones` ERSETZT. Ein
 * Test gegen `new MazeGame()` allein würde Regeln prüfen, die im Betrieb nie
 * laufen – genau die Falle, die der Kopf von `simulation-hardening.ts`
 * beschreibt.
 */

const ORT = messfeld(300);
const DT = 1 / GAME.tickRate;

interface Testspiel {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  drones: Map<string, any>;
  shapes: Map<string, any>;
  nextDroneSpawn: Map<string, number>;
  stepProjectiles(dt: number, now: number): void;
  stepDrones(dt: number, now: number): void;
}

/** Die Produktionskette in klein: Kampfwerte, Drohnen, Physik-Härtung. */
function spiel(): { game: MazeGame; internals: Testspiel } {
  const game = hardenSimulation(tuneDrones(tuneCombatScaling(new MazeGame(0))));
  const internals = game as unknown as Testspiel;
  // Die Streuformen liegen zufällig; ein Test, der über sie stolpert, misst
  // den Zufall statt der Regel.
  internals.shapes.clear();
  return { game, internals };
}

function kugel(internals: Testspiel, id: string, ownerId: string, position: { x: number; y: number }, integritaet: number, schaden: number): any {
  const projektil = {
    id, ownerId, position: { ...position }, velocity: { x: 0, y: 0 },
    radius: 8, integrity: integritaet, maxIntegrity: integritaet, damage: schaden, life: 5
  };
  internals.projectiles.set(id, projektil);
  return projektil;
}

function form(internals: Testspiel, id: string, position: { x: number; y: number }, leben: number): any {
  const gebilde = {
    id, kind: 'square' as const, position: { ...position }, velocity: { x: 0, y: 0 },
    radius: 20, rotation: 0, health: leben, maxHealth: leben
  };
  internals.shapes.set(id, gebilde);
  return gebilde;
}

describe('Kugeln fliegen nicht durch das, was sie überleben', () => {
  it('verbraucht die Kugel an einer Form, die den Treffer übersteht', () => {
    const { game, internals } = spiel();
    const ownerId = game.addPlayer('Schütze');
    internals.players.get(ownerId).position = { x: ORT.x - 200, y: ORT.y };
    // Durchschlag absichtlich riesig: Vorher entschied allein er, und die Kugel
    // wäre mit 9992 Restintegrität weitergeflogen.
    kugel(internals, 'k', ownerId, ORT, 10_000, 5);
    const quadrat = form(internals, 'f', ORT, 100);

    internals.stepProjectiles(DT, Date.now());

    expect(quadrat.health).toBe(95);
    expect(internals.projectiles.has('k')).toBe(false);
  });

  it('lässt die Kugel weiterfliegen, wenn der Treffer die Form zerlegt', () => {
    const { game, internals } = spiel();
    const ownerId = game.addPlayer('Schütze');
    internals.players.get(ownerId).position = { x: ORT.x - 200, y: ORT.y };
    kugel(internals, 'k', ownerId, ORT, 10_000, 500);
    form(internals, 'f', ORT, 100);

    internals.stepProjectiles(DT, Date.now());

    expect(internals.shapes.has('f')).toBe(false);
    expect(internals.projectiles.has('k')).toBe(true);
  });

  it('verbraucht die Kugel an einem Panzer, der den Treffer übersteht', () => {
    const { game, internals } = spiel();
    const ownerId = game.addPlayer('Schütze');
    const zielId = game.addPlayer('Ziel');
    const schuetze = internals.players.get(ownerId);
    const ziel = internals.players.get(zielId);
    schuetze.position = { x: ORT.x - 200, y: ORT.y };
    ziel.position = { ...ORT };
    ziel.invulnerable = false;
    ziel.invulnerableUntil = 0;
    const vorher = ziel.health;
    kugel(internals, 'k', ownerId, ORT, 10_000, 10);

    internals.stepProjectiles(DT, Date.now());

    expect(ziel.health).toBe(vorher - 10);
    expect(internals.projectiles.has('k')).toBe(false);
  });
});

describe('Drohnen sind Ziele', () => {
  it('nimmt einer fremden Drohne Leben und verbraucht die Kugel dabei', () => {
    const { game, internals } = spiel();
    const schuetzeId = game.addPlayer('Schütze');
    const besitzerId = game.addPlayer('Besitzer');
    internals.players.get(schuetzeId).position = { x: ORT.x - 200, y: ORT.y };
    const besitzer = internals.players.get(besitzerId);
    besitzer.position = { x: ORT.x + 200, y: ORT.y };
    besitzer.playerClass = 'drone';
    internals.drones.set('d', {
      id: 'd', ownerId: besitzerId, position: { ...ORT }, velocity: { x: 0, y: 0 },
      angle: 0, health: 40, maxHealth: 40, slot: 0, contactCooldown: 0, gameplayRadius: 12
    });
    kugel(internals, 'k', schuetzeId, ORT, 10_000, 12);

    internals.stepProjectiles(DT, Date.now());

    expect(internals.drones.get('d').health).toBe(28);
    expect(internals.projectiles.has('k')).toBe(false);
  });

  it('zerschießt eine Drohne und meldet ihren Nachschub an', () => {
    const { game, internals } = spiel();
    const schuetzeId = game.addPlayer('Schütze');
    const besitzerId = game.addPlayer('Besitzer');
    internals.players.get(schuetzeId).position = { x: ORT.x - 200, y: ORT.y };
    const besitzer = internals.players.get(besitzerId);
    besitzer.position = { x: ORT.x + 200, y: ORT.y };
    besitzer.playerClass = 'drone';
    internals.drones.set('d', {
      id: 'd', ownerId: besitzerId, position: { ...ORT }, velocity: { x: 0, y: 0 },
      angle: 0, health: 40, maxHealth: 40, slot: 0, contactCooldown: 0, gameplayRadius: 12
    });
    internals.nextDroneSpawn.delete(besitzerId);
    kugel(internals, 'k', schuetzeId, ORT, 10_000, 400);
    const jetzt = Date.now();

    internals.stepProjectiles(DT, jetzt);

    expect(internals.drones.has('d')).toBe(false);
    expect(internals.nextDroneSpawn.get(besitzerId)).toBeGreaterThan(jetzt);
  });

  it('lässt die eigene Flotte in Ruhe', () => {
    const { game, internals } = spiel();
    const besitzerId = game.addPlayer('Besitzer');
    const besitzer = internals.players.get(besitzerId);
    besitzer.position = { x: ORT.x + 200, y: ORT.y };
    besitzer.playerClass = 'drone';
    internals.drones.set('d', {
      id: 'd', ownerId: besitzerId, position: { ...ORT }, velocity: { x: 0, y: 0 },
      angle: 0, health: 40, maxHealth: 40, slot: 0, contactCooldown: 0, gameplayRadius: 12
    });
    kugel(internals, 'k', besitzerId, ORT, 10_000, 400);

    internals.stepProjectiles(DT, Date.now());

    expect(internals.drones.get('d').health).toBe(40);
  });
});

describe('Drohnen fliegen nicht durch Objekte', () => {
  it('schiebt eine Drohne aus einer Form heraus, auch während der Rempler nachlädt', () => {
    const { game, internals } = spiel();
    const besitzerId = game.addPlayer('Besitzer');
    const besitzer = internals.players.get(besitzerId);
    besitzer.position = { x: ORT.x - 120, y: ORT.y };
    besitzer.playerClass = 'drone';
    // Zielt auf die Form, damit die Drohne wirklich hineinfliegen WILL.
    besitzer.aim = { x: 120, y: 0 };
    besitzer.primary = true;
    const quadrat = form(internals, 'f', ORT, 10_000);
    internals.drones.set('d', {
      id: 'd', ownerId: besitzerId, position: { ...ORT }, velocity: { x: 400, y: 0 },
      angle: 0, health: 400, maxHealth: 400, slot: 0,
      // Nachladender Rempler: genau der Fall, in dem die alte Fassung die
      // Drohne kommentarlos durch die Form hindurchfliegen ließ.
      contactCooldown: 5, gameplayRadius: 12
    });

    internals.stepDrones(DT, Date.now());

    const drohne = internals.drones.get('d');
    const abstand = Math.hypot(drohne.position.x - quadrat.position.x, drohne.position.y - quadrat.position.y);
    expect(abstand).toBeGreaterThanOrEqual(quadrat.radius + 12 - 0.001);
  });
});
