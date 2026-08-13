import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { applyDebugBuild } from './debug-lab';
import { MazeGame } from './game';
import { messfeld } from './messfeld';

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  fire(player: any, stats: any): void;
  stepPlayer(player: any, dt: number, now: number): void;
}

const createGame = (): MazeGame => tuneClassMechanics(tuneCombatScaling(new MazeGame(0)));

function preparePlayer(game: MazeGame, id: string, playerClass: any, level: number): any {
  applyDebugBuild(game, id, { playerClass, level, preset: 'blank' });
  const player = (game as unknown as Internals).players.get(id);
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  return player;
}

describe('class mechanics', () => {
  it('reduces frontal damage for Bulwark but not rear damage', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Attacker');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'core', 10);
    const target = preparePlayer(game, targetId, 'bulwark', 24);
    target.position = { x: 3000, y: 2000 };
    target.angle = 0;
    attacker.position = { x: 3100, y: 2000 };
    const maximum = target.maxHealth;

    internals.damagePlayer(target, 100, attackerId, Date.now());
    expect(maximum - target.health).toBeCloseTo(74, 4);

    target.health = maximum;
    attacker.position = { x: 2900, y: 2000 };
    internals.damagePlayer(target, 100, attackerId, Date.now() + 1);
    expect(maximum - target.health).toBeCloseTo(100, 4);
  });

  it('gives precision classes readable hit knockback', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Lancer');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'lancer', 38);
    const target = preparePlayer(game, targetId, 'core', 10);
    attacker.position = { x: 2900, y: 2000 };
    target.position = { x: 3000, y: 2000 };
    target.velocity = { x: 0, y: 0 };

    internals.damagePlayer(target, 10, attackerId, Date.now());
    expect(target.velocity.x).toBeGreaterThan(45);
    expect(Math.abs(target.velocity.y)).toBeLessThan(0.001);
  });

  it('tightens Gatling spread while continuous fire is maintained', () => {
    const game = createGame();
    const playerId = game.addPlayer('Gatling');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'gatling', 38);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };
    const stats = tunedStatsFor(player);

    internals.fire(player, stats);
    const firstSpread = Math.max(...[...internals.projectiles.values()].map((projectile) => Math.abs(projectile.velocity.y)));
    internals.projectiles.clear();
    internals.fire(player, stats);
    const secondSpread = Math.max(...[...internals.projectiles.values()].map((projectile) => Math.abs(projectile.velocity.y)));

    expect(secondSpread).toBeLessThan(firstSpread);
    expect(secondSpread).toBeGreaterThan(0);
  });

  it('passt Storms Kugelwand-Integrität an, ohne den Direktschaden zu erhöhen', () => {
    const game = createGame();
    const playerId = game.addPlayer('Storm');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'storm', 38);
    const stats = tunedStatsFor(player);

    internals.fire(player, stats);
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(4);
    for (const projectile of projectiles) {
      expect(projectile.damage).toBeCloseTo(stats.damage, 5);
      // 0.95: Der Tempo-Dämpfer hält ~25 % mehr Storm-Kugeln gleichzeitig in
      // der Luft – der gesenkte Faktor gleicht den Neben-Buff der Wand aus.
      expect(projectile.integrity).toBeCloseTo(stats.penetration * 0.95, 5);
      expect(projectile.maxIntegrity).toBeCloseTo(stats.penetration * 0.95, 5);
    }
  });

  it('fires Flanker barrels forward and backward', () => {
    const game = createGame();
    const playerId = game.addPlayer('Flanker');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'flanker', 24);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };

    internals.fire(player, tunedStatsFor(player));
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(2);
    const directions = projectiles.map((projectile) => Math.sign(projectile.velocity.x)).sort();
    expect(directions).toEqual([-1, 1]);
  });

  it('covers every direction with Octo barrels', () => {
    const game = createGame();
    const playerId = game.addPlayer('Octo');
    const internals = game as unknown as Internals;
    const player = preparePlayer(game, playerId, 'octo', 38);
    player.position = { x: 3000, y: 2000 };
    player.aim = { x: 600, y: 0 };

    internals.fire(player, tunedStatsFor(player));
    const projectiles = [...internals.projectiles.values()];
    expect(projectiles).toHaveLength(8);
    const angles = projectiles.map((projectile) => Math.atan2(projectile.velocity.y, projectile.velocity.x));
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const from = -Math.PI + quadrant * Math.PI / 2;
      expect(angles.some((angle) => angle >= from - 0.01 && angle <= from + Math.PI / 2 + 0.01)).toBe(true);
    }
  });

  it('grants Deadeye bonus damage only against heavily wounded targets', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Deadeye');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    // Levelabstand bewusst klein: Ab 15 Stufen Differenz greift die
    // Fairness-Dämpfung gegen niedrigstufige Ziele (BAL2) – dieser Test prüft
    // ausschließlich den Deadeye-Bonus, nicht deren Zusammenspiel. Deadeye
    // schaltet erst ab Level 28 frei, daher steigt hier das Ziel mit, statt
    // den Angreifer darunter zu drücken.
    const attacker = preparePlayer(game, attackerId, 'deadeye', 30);
    const target = preparePlayer(game, targetId, 'core', 18);
    attacker.position = { x: 2900, y: 2000 };
    target.position = { x: 3000, y: 2000 };

    target.health = target.maxHealth;
    internals.damagePlayer(target, 10, attackerId, Date.now());
    expect(target.maxHealth - target.health).toBeCloseTo(10, 4);

    target.health = target.maxHealth * 0.2;
    const before = target.health;
    internals.damagePlayer(target, 10, attackerId, Date.now() + 1);
    expect(before - target.health).toBeCloseTo(12.5, 4);
  });

  describe('Fairness gegen niedrigstufige Ziele (BAL2)', () => {
    it('lässt kleine Levelabstände unangetastet', () => {
      const game = createGame();
      const attackerId = game.addPlayer('Attacker');
      const targetId = game.addPlayer('Target');
      const internals = game as unknown as Internals;
      const attacker = preparePlayer(game, attackerId, 'core', 20);
      const target = preparePlayer(game, targetId, 'core', 10);
      internals.damagePlayer(target, 10, attackerId, Date.now());
      // Differenz 10 liegt unter der freien Spanne (15) – exakt wie vorher.
      expect(target.maxHealth - target.health).toBeCloseTo(10, 6);
    });

    it('dämpft den Schaden eines deutlich höherstufigen Angreifers, gedeckelt', () => {
      const game = createGame();
      const internals = game as unknown as Internals;

      // Differenz 30 liegt zwischen frei (15) und voll (45): Faktor 0,5,
      // also −0,5 × 35 % = −17,5 % → 8,25 statt 10 Schaden.
      const naheId = game.addPlayer('Angreifer nah');
      preparePlayer(game, naheId, 'core', 40);
      const opferNaheId = game.addPlayer('Opfer nah');
      const opferNahe = preparePlayer(game, opferNaheId, 'core', 10);
      internals.damagePlayer(opferNahe, 10, naheId, Date.now());
      expect(opferNahe.maxHealth - opferNahe.health).toBeCloseTo(8.25, 4);

      // Differenz 59 liegt über dem Deckel (45): volle Wirkung, −35 % → 6,5.
      const fernId = game.addPlayer('Angreifer fern');
      preparePlayer(game, fernId, 'core', 60);
      const opferFernId = game.addPlayer('Opfer fern');
      const opferFern = preparePlayer(game, opferFernId, 'core', 1);
      internals.damagePlayer(opferFern, 10, fernId, Date.now());
      expect(opferFern.maxHealth - opferFern.health).toBeCloseTo(6.5, 4);
    });

    it('verstärkt einen niedrigstufigen Angreifer NICHT beim Treffer auf einen hochstufigen', () => {
      const game = createGame();
      const attackerId = game.addPlayer('Klein');
      const targetId = game.addPlayer('Groß');
      const internals = game as unknown as Internals;
      preparePlayer(game, attackerId, 'core', 1);
      const target = preparePlayer(game, targetId, 'core', 60);
      internals.damagePlayer(target, 10, attackerId, Date.now());
      // Umgekehrter Abstand: der Kleine trifft den Großen – keine Sonderregel.
      expect(target.maxHealth - target.health).toBeCloseTo(10, 6);
    });

    it('gibt dem getroffenen Unterlegenen kurz mehr Tempo zur Flucht', () => {
      // Vergleichend statt absolut gemessen: Das Original zieht velocity jeden
      // Tick Richtung `move` zurück (hier 0 – also Abbremsen), der Flucht-Bonus
      // multipliziert das Ergebnis erst danach. Ein zweiter, ungetroffener
      // Spieler unter identischen Bedingungen liefert den Nenner für den
      // reinen Bonusfaktor, unabhängig von der Bremsphysik.
      const game = createGame();
      const internals = game as unknown as Internals;
      const attackerId = game.addPlayer('Groß');
      preparePlayer(game, attackerId, 'core', 60);

      const getroffenId = game.addPlayer('Klein getroffen');
      const getroffen = preparePlayer(game, getroffenId, 'core', 1);
      getroffen.velocity = { x: 100, y: 0 };
      const ungetroffenId = game.addPlayer('Klein ungetroffen');
      const ungetroffen = preparePlayer(game, ungetroffenId, 'core', 1);
      ungetroffen.velocity = { x: 100, y: 0 };

      const now = Date.now();
      internals.damagePlayer(getroffen, 10, attackerId, now);
      internals.stepPlayer(getroffen, 1 / 40, now + 10);
      internals.stepPlayer(ungetroffen, 1 / 40, now + 10);
      // Voller Abstand (59) → voller Flucht-Bonus (+30 %).
      expect(getroffen.velocity.x / ungetroffen.velocity.x).toBeCloseTo(1.3, 4);

      // Nach Ablauf der Dauer ist der Bonus wieder weg.
      getroffen.velocity = { x: 100, y: 0 };
      ungetroffen.velocity = { x: 100, y: 0 };
      internals.stepPlayer(getroffen, 1 / 40, now + 3000);
      internals.stepPlayer(ungetroffen, 1 / 40, now + 3000);
      expect(getroffen.velocity.x / ungetroffen.velocity.x).toBeCloseTo(1, 6);
    });

    /**
     * Regressionstest für einen echten Fehler, den erst `messung-bal2-
     * fairness.mjs` über viele Ticks aufgedeckt hat: `velocity *= factor`
     * JEDEN Tick (wie perks.ts es mit seinen eigenen Tempo-Faktoren macht)
     * lief hier davon – gemessen 10 550 statt der beabsichtigten 351 px/s,
     * weil die Multiplikation proportional zur aktuellen Geschwindigkeit
     * wächst, während `moveVectorToward` nur eine feste Schrittweite
     * zurückzieht. Ein einzelner Tick (der Test oben) hat das nie gezeigt.
     */
    it('läuft über viele Ticks nicht davon – Deckel statt Multiplikation', () => {
      const game = createGame();
      const internals = game as unknown as Internals;
      const attackerId = game.addPlayer('Groß');
      preparePlayer(game, attackerId, 'core', 60);
      const targetId = game.addPlayer('Klein');
      const target = preparePlayer(game, targetId, 'core', 1);
      // Nachweislich freies Feld: Bei bis zu 351 px/s und 30 Ticks legt das
      // Ziel höchstens rund 260 px zurück – 300 px Rand lassen keine Wand im
      // Weg stehen (anders als eine zufällige Spawn-Position im Labyrinth,
      // an der die erste Fassung dieses Tests scheinbar auf 0 gefallen war).
      target.position = { ...messfeld(300) };
      target.velocity = { x: 0, y: 0 };
      target.move = { x: -1, y: 0 };
      const stats = tunedStatsFor(target);

      let now = Date.now();
      internals.damagePlayer(target, 10, attackerId, now);
      for (let tick = 0; tick < 30; tick += 1) {
        now += 25;
        internals.stepPlayer(target, 1 / 40, now);
        const tempo = Math.hypot(target.velocity.x, target.velocity.y);
        // Nie mehr als die Decke (Klassentempo × 1,3), mit kleiner Toleranz
        // für Rundung – zu keinem Zeitpunkt, nicht erst im Mittel.
        expect(tempo, `Tick ${tick}: ${tempo.toFixed(1)} px/s`).toBeLessThanOrEqual(stats.moveSpeed * 1.3 * 1.01);
      }
      // Und tatsächlich am Deckel angekommen, nicht irgendwo weit darunter.
      const endTempo = Math.hypot(target.velocity.x, target.velocity.y);
      expect(endTempo).toBeCloseTo(stats.moveSpeed * 1.3, 0);
    });

    it('lässt den Angreifer selbst unberührt – nur das Opfer bekommt den Bonus', () => {
      // Wieder vergleichend: ein zweiter, an keinem Treffer beteiligter
      // Angreifer unter identischen Bedingungen liefert den Nenner, damit die
      // normale Abbrems-Physik (velocity Richtung `move` = 0) nicht als
      // vermeintlicher Bonus durchgeht.
      const game = createGame();
      const internals = game as unknown as Internals;
      const attackerId = game.addPlayer('Groß trifft');
      const attacker = preparePlayer(game, attackerId, 'core', 60);
      attacker.velocity = { x: 100, y: 0 };
      const unbeteiligtId = game.addPlayer('Groß unbeteiligt');
      const unbeteiligt = preparePlayer(game, unbeteiligtId, 'core', 60);
      unbeteiligt.velocity = { x: 100, y: 0 };
      const targetId = game.addPlayer('Klein');
      const target = preparePlayer(game, targetId, 'core', 1);

      const now = Date.now();
      internals.damagePlayer(target, 10, attackerId, now);
      internals.stepPlayer(attacker, 1 / 40, now + 10);
      internals.stepPlayer(unbeteiligt, 1 / 40, now + 10);
      expect(attacker.velocity.x / unbeteiligt.velocity.x).toBeCloseTo(1, 6);
    });
  });

  it('keeps all class mechanic numbers finite', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Attacker');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const attacker = preparePlayer(game, attackerId, 'phantom', GAME.maxLevel);
    const target = preparePlayer(game, targetId, 'fortress', GAME.maxLevel);
    attacker.position = { x: 3000, y: 2000 };
    target.position = { x: 3100, y: 2000 };
    target.angle = Math.PI;
    internals.damagePlayer(target, 30, attackerId, Date.now());
    expect(Number.isFinite(target.health)).toBe(true);
    expect(Number.isFinite(target.velocity.x)).toBe(true);
    expect(Number.isFinite(target.velocity.y)).toBe(true);
  });
});
