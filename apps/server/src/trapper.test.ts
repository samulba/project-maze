import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { messfeld } from './messfeld';
import { hardenSimulation } from './simulation-hardening';

/**
 * Klassen 4.2, Stufe 4, Schritt 3 – Trapper, das stehende Projektil: Der
 * Schuss fliegt kurz (`trapAfter`), bleibt dann liegen und wirkt für den Rest
 * seiner Lebenszeit als Falle. `stepProjectiles` läuft in Produktion über
 * simulation-hardening.ts (nicht game.ts direkt) – dieselbe Komposition wie
 * stack.mjs: hardenSimulation zuerst, dann tuneCombatScaling.
 */

const DT = 1 / 40;
const OFFEN = messfeld(240);

interface Interna {
  players: Map<string, any>;
  projectiles: Map<string, { id: string; ownerId: string; position: { x: number; y: number }; velocity: { x: number; y: number }; damage: number; life: number }>;
  shapes: Map<string, unknown>;
}

const bauen = () => {
  const game = tuneCombatScaling(hardenSimulation(new MazeGame(0)));
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

const schuetze = (game: MazeGame, interna: Interna, klasse: string, level = 30) => {
  const id = game.addPlayer('Trapper-Test');
  const spieler = interna.players.get(id);
  spieler.playerClass = klasse;
  spieler.level = level;
  spieler.position = { ...OFFEN };
  spieler.velocity = { x: 0, y: 0 };
  spieler.move = { x: 0, y: 0 };
  spieler.aim = { x: 400, y: 0 };
  spieler.primary = false;
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  return { id, spieler };
};

const feuern = (game: MazeGame, spieler: any, now: number): number => {
  spieler.cooldown = 0;
  spieler.primary = true;
  now += 25;
  game.step(DT, now);
  spieler.primary = false;
  return now;
};

describe('Stehendes Projektil (Trapper, Klassen 4.2 Schritt 3)', () => {
  it('setzt Testannahmen: trapAfter kleiner als die volle Lebenszeit', () => {
    const trapper = CLASS_DEFINITIONS.trapper;
    expect(trapper.trapAfter).toBeGreaterThan(0);
    expect(trapper.barrelCount).toBe(1);
    expect(trapper.trapAfter!).toBeLessThan(trapper.projectileLife);
    // Andere Klassen bleiben unberührt.
    for (const id of ['siege', 'bombard', 'mortar'] as const) {
      expect(CLASS_DEFINITIONS[id].trapAfter).toBeUndefined();
    }
  });

  it('fliegt zunächst normal und bleibt dann exakt an Ort und Stelle stehen', () => {
    const { game, interna } = bauen();
    const { id, spieler } = schuetze(game, interna, 'trapper');
    const stats = tunedStatsFor(spieler);
    expect(stats.trapAfter).toBeGreaterThan(0);

    let now = 100_000;
    now = feuern(game, spieler, now);
    const schuss = [...interna.projectiles.values()][0]!;
    expect(schuss.ownerId).toBe(id);
    // Direkt nach dem Schuss fliegt er noch – Tempo entspricht stats.projectileSpeed.
    expect(Math.hypot(schuss.velocity.x, schuss.velocity.y)).toBeCloseTo(stats.projectileSpeed, 0);

    // Bis kurz vor trapAfter: immer noch in Bewegung, spürbar vom Abschuss weg.
    const bisKurzVorher = Math.max(1, Math.floor((stats.trapAfter! - 0.02) / DT));
    for (let tick = 0; tick < bisKurzVorher; tick += 1) game.step(DT, (now += 25));
    expect(Math.hypot(schuss.velocity.x, schuss.velocity.y)).toBeGreaterThan(1);
    expect(
      Math.hypot(schuss.position.x - OFFEN.x, schuss.position.y - OFFEN.y)
    ).toBeGreaterThan(50);

    // Über trapAfter hinaus: steht, Tempo 0.
    for (let tick = 0; tick < 10; tick += 1) game.step(DT, (now += 25));
    expect(schuss.velocity.x).toBe(0);
    expect(schuss.velocity.y).toBe(0);
    const positionNachLandung = { ...schuss.position };

    // Und bleibt danach exakt dort stehen, statt weiter zu driften.
    for (let tick = 0; tick < 15; tick += 1) game.step(DT, (now += 25));
    expect(schuss.position.x).toBeCloseTo(positionNachLandung.x, 6);
    expect(schuss.position.y).toBeCloseTo(positionNachLandung.y, 6);
  });

  it('trifft ein Ziel, das die liegende Falle berührt', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'trapper');
    const stats = tunedStatsFor(spieler);

    let now = 100_000;
    now = feuern(game, spieler, now);
    // Lange genug warten, dass die Falle sicher steht.
    for (let tick = 0; tick < 30; tick += 1) game.step(DT, (now += 25));
    const schuss = [...interna.projectiles.values()][0]!;
    expect(schuss.velocity.x).toBe(0);

    const zielId = game.addPlayer('Opfer');
    const ziel = interna.players.get(zielId);
    ziel.playerClass = 'core';
    ziel.level = 1;
    ziel.invulnerable = false;
    ziel.invulnerableUntil = 0;
    ziel.position = { ...schuss.position };

    const vorher = ziel.health;
    game.step(DT, (now += 25));
    expect(ziel.health).toBeLessThan(vorher);
    expect(vorher - ziel.health).toBeCloseTo(stats.damage, 5);
  });

  it('verschwindet am Ende seiner Lebenszeit, nicht schon beim Landen', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'trapper');
    const stats = tunedStatsFor(spieler);

    let now = 100_000;
    now = feuern(game, spieler, now);
    const gelandetNachTicks = Math.ceil((stats.trapAfter! + 0.05) / DT);
    for (let tick = 0; tick < gelandetNachTicks; tick += 1) game.step(DT, (now += 25));
    expect(interna.projectiles.size).toBe(1);
    expect([...interna.projectiles.values()][0]!.velocity.x).toBe(0);

    // Restliche Lebenszeit ablaufen lassen.
    const restTicks = Math.ceil((stats.projectileLife - stats.trapAfter! + 0.1) / DT);
    for (let tick = 0; tick < restTicks; tick += 1) game.step(DT, (now += 25));
    expect(interna.projectiles.size).toBe(0);
  });

  it('lässt Klassen ohne trapAfter unverändert fliegen', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'mortar');
    const stats = tunedStatsFor(spieler);
    expect(stats.trapAfter).toBeUndefined();

    let now = 100_000;
    now = feuern(game, spieler, now);
    const schuss = [...interna.projectiles.values()][0]!;
    for (let tick = 0; tick < 20; tick += 1) game.step(DT, (now += 25));
    expect(Math.hypot(schuss.velocity.x, schuss.velocity.y)).toBeCloseTo(stats.projectileSpeed, 0);
  });
});
