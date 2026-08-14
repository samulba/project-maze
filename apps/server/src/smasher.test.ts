import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { messfeld } from './messfeld';

/**
 * Klassen 4.2, Stufe 4, Schritt 3 – der rohrlose Smasher: kein Rohr, keine
 * Reichweite, nur Aufprall. `barrelCount: 0` bei einer Nicht-Drohnen-Klasse
 * ist neu – vorher hatte jede Nahkampfklasse trotzdem ein kleines Rohr.
 */

const DT = 1 / 40;
const OFFEN = messfeld(240);

interface Interna {
  players: Map<string, any>;
  projectiles: Map<string, unknown>;
  shapes: Map<string, unknown>;
  stepPlayer(player: any, dt: number, now: number): void;
}

const bauen = () => {
  const game = tuneCombatScaling(new MazeGame(0));
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

const schuetze = (game: MazeGame, interna: Interna, klasse: string, level = 45) => {
  const id = game.addPlayer('Smasher-Test');
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

describe('Rohrloser Smasher (Klassen 4.2, Schritt 3)', () => {
  it('setzt Testannahmen: kein Rohr, aber auch keine Drohnen', () => {
    const smasher = CLASS_DEFINITIONS.smasher;
    expect(smasher.barrelCount).toBe(0);
    expect(smasher.droneCount).toBe(0);
    expect(smasher.parent).toBe('blitz');
  });

  it('feuert nie ein Projektil, auch nicht mit gehaltenem Abzug', () => {
    // Direkt stepPlayer() aufrufen statt game.step(): Ein Geister-Projektil
    // mit Lebenszeit 0 (ohne die Wache würde fireBarrel eines anlegen) stirbt
    // noch INNERHALB desselben step()-Takts in stepProjectiles, bevor der
    // Test je hinschaut – der volle Tick wäre hier blind für genau den Fall,
    // den diese Wache verhindert.
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'smasher');
    spieler.primary = true;
    spieler.cooldown = 0;

    interna.stepPlayer(spieler, DT, 100_000);

    expect(interna.projectiles.size).toBe(0);
  });

  // Die Rammkurve selbst (0,6x im Stand bis 1,35x bei Vollgas) ist bereits
  // in simulation-hardening.test.ts geprüft ("scales Smasher body damage
  // with momentum") – genau dort, wo `resolvePlayerCollisions` den
  // Multiplikator wirklich anwendet.

  it('lässt den damage-Punkt statt eines toten Platzes den Körperschaden verstärken', () => {
    const { game: g1, interna: i1 } = bauen();
    const { spieler: ohnePunkte } = schuetze(g1, i1, 'smasher');
    const { game: g2, interna: i2 } = bauen();
    const { spieler: mitPunkten } = schuetze(g2, i2, 'smasher');
    mitPunkten.upgrades.damage = 8;

    const basis = tunedStatsFor(ohnePunkte).bodyDamage;
    const verstaerkt = tunedStatsFor(mitPunkten).bodyDamage;
    expect(verstaerkt).toBeGreaterThan(basis);
    expect(verstaerkt / basis).toBeCloseTo(1 + 8 * 0.07, 6);
  });

  it('lässt den damage-Punkt bei jeder anderen Klasse unverändert', () => {
    const { game, interna } = bauen();
    const { spieler: ohnePunkte } = schuetze(game, interna, 'juggernaut');
    const { game: g2, interna: i2 } = bauen();
    const { spieler: mitPunkten } = schuetze(g2, i2, 'juggernaut');
    mitPunkten.upgrades.damage = 8;

    const basisBody = tunedStatsFor(ohnePunkte).bodyDamage;
    const verstaerktBody = tunedStatsFor(mitPunkten).bodyDamage;
    expect(verstaerktBody).toBeCloseTo(basisBody, 6);
  });
});
