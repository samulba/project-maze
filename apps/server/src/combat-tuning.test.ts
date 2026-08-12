import { describe, expect, it } from 'vitest';
import { EMPTY_UPGRADES, GAME, type PlayerClass, type UpgradeLevels } from '@project-maze/shared';
import { MazeGame } from './game';
import { hardenSimulation } from './simulation-hardening';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';

type TunedPlayer = Parameters<typeof tunedStatsFor>[0];

function player(playerClass: PlayerClass, upgrades: UpgradeLevels = EMPTY_UPGRADES()): TunedPlayer {
  return { playerClass, upgrades } as TunedPlayer;
}

const sustainedDps = (stats: ReturnType<typeof tunedStatsFor>): number =>
  stats.barrelCount * stats.damage / Math.max(0.001, stats.reload);

describe('normalized combat upgrade scaling', () => {
  it('keeps full damage and reload investment below a 2.5x DPS multiplier', () => {
    for (const playerClass of ['core', 'rapid', 'storm', 'gatling', 'phantom'] as const) {
      const base = tunedStatsFor(player(playerClass));
      const upgrades = EMPTY_UPGRADES();
      upgrades.damage = 8;
      upgrades.reload = 8;
      const maximum = tunedStatsFor(player(playerClass, upgrades));
      expect(sustainedDps(maximum) / sustainedDps(base)).toBeLessThan(2.5);
    }
  });

  it('keeps movement investment meaningful without creating unreachable tanks', () => {
    const base = tunedStatsFor(player('rapid'));
    const upgrades = EMPTY_UPGRADES();
    upgrades.moveSpeed = 8;
    const maximum = tunedStatsFor(player('rapid', upgrades));
    expect(maximum.moveSpeed / base.moveSpeed).toBeGreaterThan(1.2);
    expect(maximum.moveSpeed / base.moveSpeed).toBeLessThan(1.3);
  });

  it('keeps maximum health growth below double base health', () => {
    const base = tunedStatsFor(player('fortress'));
    const upgrades = EMPTY_UPGRADES();
    upgrades.maxHealth = 8;
    const maximum = tunedStatsFor(player('fortress', upgrades));
    expect(maximum.maxHealth / base.maxHealth).toBeGreaterThan(1.65);
    expect(maximum.maxHealth / base.maxHealth).toBeLessThan(1.8);
  });
});

/**
 * Zwei Fassungen derselben Regel liefen gleichzeitig: `tuneCombatScaling` legt
 * mit `tunedStatsFor` die Werte-Quelle fest (+10 % je Punkt), aber
 * `resolvePlayerCollisions` in der Basis wird von KEINER Schicht ersetzt --
 * nur umschlossen. Innen stand deshalb weiter die alte Kurve (+13 %), und
 * genau die entschied ueber jeden Rammtreffer.
 *
 * Der Test misst deshalb den zugefuegten Schaden DURCH DIE KETTE, nicht die
 * Formel. Eine Prufung an `tunedStatsFor` allein waere gruen geblieben.
 */
describe('Rammschaden durch die Kette', () => {
  it('rechnet mit derselben Kurve wie der Rest des Servers', () => {
    const game = tuneCombatScaling(hardenSimulation(new MazeGame(0)));
    const internals = game as unknown as { players: Map<string, any>; shapes: Map<string, unknown> };
    internals.shapes.clear();
    const a = game.addPlayer('Rammer');
    const b = game.addPlayer('Opfer');
    const angreifer = internals.players.get(a);
    const opfer = internals.players.get(b);

    for (const spieler of [angreifer, opfer]) {
      spieler.playerClass = 'juggernaut';
      spieler.level = 60;
      spieler.upgrades = EMPTY_UPGRADES();
      spieler.invulnerable = false;
      spieler.invulnerableUntil = 0;
    }
    angreifer.upgrades.bodyDamage = 10;
    /*
     * Erst einen Tick auf Abstand: Der Klassenwechsel hebt `maxHealth`, und
     * `stepPlayer` zieht das Leben im selben Verhaeltnis mit. Im ersten Tick
     * STEIGT das Leben deshalb -- eine Messung dort haette den Rammschaden
     * nicht gefunden, sondern verdeckt (gemessen: -95,4 statt +9,6).
     */
    const now = Date.now();
    angreifer.position = { x: 3000, y: 3000 };
    opfer.position = { x: 5000, y: 5000 };
    game.step(1 / GAME.tickRate, now);

    // Jetzt in Kontakt bringen und den zweiten Tick messen.
    angreifer.position = { x: 3000, y: 3000 };
    opfer.position = { x: 3000 + GAME.playerRadius, y: 3000 };
    const vorher = opfer.health;
    game.step(1 / GAME.tickRate, now + (1 / GAME.tickRate) * 1000);

    const zugefuegt = vorher - opfer.health;
    const erwartet = tunedStatsFor(angreifer).bodyDamage * 0.08;
    expect(zugefuegt).toBeGreaterThan(0);
    expect(zugefuegt).toBeCloseTo(erwartet, 5);
  });
});
