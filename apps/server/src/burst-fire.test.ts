import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { messfeld } from './messfeld';
import { isFree } from './world';

/**
 * Salve statt Fächer (Klassen 4.2, Stufe 4 – Sam: „Der eine schießt drei nach
 * vorne, der andere zwei.").
 *
 * `fire()` bleibt exakt ein Aufruf je Salve (Rückstoß, Hitze, Perks & Co.
 * hängen alle an diesem einen Aufruf) – nur Läufe 1..N-1 verzögert gequeueter
 * Klassen erscheinen später als eigenes Projektil, über `stepBurstQueue`.
 */

const DT = 1 / 40;
/** Nachweislich freies Feld – kein Projektil soll an einer Wand hängen. */
const OFFEN = messfeld(240);

interface Interna {
  players: Map<string, any>;
  projectiles: Map<string, { id: string; ownerId: string; damage: number; velocity: { x: number; y: number } }>;
  shapes: Map<string, any>;
}

const bauen = () => {
  const game = tuneCombatScaling(new MazeGame(0));
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

/** Feuerbereiter Tank auf freiem Feld, Zielrichtung nach rechts. */
const schuetze = (game: MazeGame, interna: Interna, klasse: string) => {
  const id = game.addPlayer('Schütze');
  const spieler = interna.players.get(id);
  spieler.playerClass = klasse;
  spieler.level = 45;
  spieler.position = { ...OFFEN };
  spieler.velocity = { x: 0, y: 0 };
  spieler.move = { x: 0, y: 0 };
  spieler.aim = { x: 400, y: 0 };
  spieler.primary = false;
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  return { id, spieler };
};

/** Löst eine einzelne Salve aus: Cooldown erzwungen auf 0, ein Tick feuert. */
const salve = (game: MazeGame, spieler: any, now: number): number => {
  spieler.cooldown = 0;
  spieler.primary = true;
  now += 25;
  game.step(DT, now);
  spieler.primary = false;
  return now;
};

describe('Salve statt Fächer (Klassen 4.2)', () => {
  it('setzt Testannahmen: freies Feld, die vier Salven-Klassen tragen burstDelay', () => {
    expect(isFree(OFFEN, 40)).toBe(true);
    for (const id of ['repeater', 'retributor', 'scorch', 'inferno'] as const) {
      expect(CLASS_DEFINITIONS[id].burstDelay).toBeGreaterThan(0);
    }
    // Ihre Familien-Geschwister ohne den Slot feuern weiterhin als Fächer.
    for (const id of ['twin', 'bombard', 'tempest'] as const) {
      expect(CLASS_DEFINITIONS[id].burstDelay).toBeUndefined();
    }
  });

  it('lässt Lauf 0 sofort erscheinen und die weiteren Läufe erst nach ihrer burstDelay', () => {
    const { game, interna } = bauen();
    const { id, spieler } = schuetze(game, interna, 'scorch');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(2);

    let now = 100_000;
    now = salve(game, spieler, now);
    // Direkt nach der Salve steht erst ein Projektil in der Welt.
    expect(interna.projectiles.size).toBe(1);

    // Genug Zeit verstreichen lassen: der zweite Lauf erscheint.
    for (let tick = 0; tick < 5; tick += 1) game.step(DT, (now += 25));
    expect(interna.projectiles.size).toBe(2);
    for (const projectile of interna.projectiles.values()) {
      expect(projectile.ownerId).toBe(id);
      expect(projectile.damage).toBeCloseTo(stats.damage, 6);
    }
  });

  it('feuert Klassen ohne burstDelay weiterhin als Fächer im selben Tick', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'twin');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(2);
    expect(stats.burstDelay).toBeUndefined();

    salve(game, spieler, 100_000);
    // Kein Warten nötig – beide Läufe stehen sofort in der Welt.
    expect(interna.projectiles.size).toBe(2);
  });

  it('setzt den Cooldown genau einmal je Salve, unabhängig von der Läufezahl', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'inferno');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(3);

    salve(game, spieler, 100_000);
    expect(spieler.cooldown).toBeCloseTo(stats.reload, 6);
  });

  it('friert Zielrichtung und Schadenswert der wartenden Läufe beim Abdrücken ein', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'scorch');
    const stats = tunedStatsFor(spieler);

    let now = 100_000;
    spieler.aim = { x: 400, y: 0 };
    now = salve(game, spieler, now);
    const ersterId = [...interna.projectiles.keys()][0];

    // Zielrichtung dreht sich um 90°, bevor der zweite Lauf erscheint.
    spieler.aim = { x: 0, y: 400 };
    for (let tick = 0; tick < 5; tick += 1) game.step(DT, (now += 25));

    expect(interna.projectiles.size).toBe(2);
    const zweiter = [...interna.projectiles.entries()].find(([id]) => id !== ersterId)![1];
    // Der nachgereichte Lauf trägt weiterhin die ALTE Richtung (+x), nicht die
    // neue (+y) – seine Ballistik wurde beim Abdrücken eingefroren.
    expect(zweiter.velocity.x).toBeGreaterThan(0);
    expect(Math.abs(zweiter.velocity.y)).toBeLessThan(Math.abs(zweiter.velocity.x) * 0.5);
  });

  it('lässt einen verspäteten Lauf verschwinden, wenn der Schütze inzwischen entfernt wurde', () => {
    const { game, interna } = bauen();
    const { id, spieler } = schuetze(game, interna, 'scorch');

    let now = 100_000;
    now = salve(game, spieler, now);
    expect(interna.projectiles.size).toBe(1);

    game.removePlayer(id);
    for (let tick = 0; tick < 10; tick += 1) game.step(DT, (now += 25));
    // Der bereits abgefeuerte erste Lauf wurde mit dem Spieler entfernt, und
    // der wartende zweite Lauf darf nicht nachträglich auftauchen.
    expect(interna.projectiles.size).toBe(0);
  });

  it('schüttet über mehrere Salven denselben Gesamtschaden aus wie ein Fächer derselben Klasse', () => {
    // Gesamtschaden einer Salve ist unabhängig von der zeitlichen Verteilung
    // exakt `damage * barrelCount` – die burstDelay verschiebt nur, WANN die
    // Kugeln erscheinen, nie WIE VIELE oder mit welchem Schaden. Erfasst wird
    // jedes Projektil bei seinem ERSTEN Erscheinen, denn manche verlassen das
    // freie Feld noch innerhalb der Messung und werden entfernt.
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'repeater');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(3);

    const VOLLEN = 4;
    const gesehen = new Map<string, number>();
    const erfasse = (): void => {
      for (const [projectileId, projectile] of interna.projectiles) {
        if (!gesehen.has(projectileId)) gesehen.set(projectileId, projectile.damage);
      }
    };

    let now = 100_000;
    for (let volley = 0; volley < VOLLEN; volley += 1) {
      now = salve(game, spieler, now);
      erfasse();
      // Genug Zeit für alle Läufe dieser Salve, bevor die nächste startet.
      for (let tick = 0; tick < 10; tick += 1) {
        game.step(DT, (now += 25));
        erfasse();
      }
    }
    const gesamtschaden = [...gesehen.values()].reduce((sum, damage) => sum + damage, 0);
    expect(gesamtschaden).toBeCloseTo(stats.damage * stats.barrelCount * VOLLEN, 6);
  });
});
