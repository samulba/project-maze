import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { PASSIVE_MODIFIER_DEFINITIONS } from '@project-maze/shared/gameplay';
import { messfeld } from './messfeld';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system';

// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts).
const ORT = messfeld(340);

interface Internals {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  resolvePlayerCollisions(now: number): void;
}

const createGame = (): MazeGame => tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)));

describe('core modules and passive frames', () => {
  it('moves with Dash, blocks immediate reuse and does not grant invulnerability', () => {
    const game = createGame();
    const playerId = game.addPlayer('Dasher');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.position = { ...ORT };
    expect(equipLoadout(game, playerId, 'dash', 'standard', 1000)).toBe(true);
    game.applyInput(playerId, { type: 'input', sequence: 1, move: { x: 1, y: 0 }, aim: { x: 500, y: 0 }, primary: false, secondary: false });

    const before = player.position.x;
    expect(activateModule(game, playerId, 2000)).toBe(true);
    expect(player.position.x).toBeGreaterThan(before + 80);
    expect(player.invulnerable).toBe(false);
    const after = player.position.x;
    expect(activateModule(game, playerId, 2001)).toBe(false);
    expect(player.position.x).toBe(after);
  });

  // Befund 62: Der Masterplan begrenzt den Dash-Abschlag ausdruecklich auf
  // **Body**-Damage. Der alte Test rief `damagePlayer` direkt auf und konnte
  // Kontakt- von Projektilschaden nicht unterscheiden -- er blieb gruen, egal
  // welche der beiden Regeln implementiert war. Deshalb laeuft der Kontaktfall
  // jetzt durch die echte Kollisionsaufloesung.
  it('reduces body damage caused during Dash instead of creating a Rammer one-shot', () => {
    const messeKontaktschaden = (mitDash: boolean): number => {
      const game = createGame();
      const attackerId = game.addPlayer('Rammer');
      const targetId = game.addPlayer('Target');
      const internals = game as unknown as Internals;
      const attacker = internals.players.get(attackerId);
      const target = internals.players.get(targetId);
      if (mitDash) {
        equipLoadout(game, attackerId, 'dash', 'standard', 1000);
        game.applyInput(attackerId, { type: 'input', sequence: 1, move: { x: 1, y: 0 }, aim: { x: 500, y: 0 }, primary: false, secondary: false });
        activateModule(game, attackerId, 2000);
      }
      // Positionen NACH der Aktivierung setzen -- ohne Travel-Schalter legt
      // der Dash die ganze Strecke sofort zurueck.
      attacker.position = { x: 3000, y: 2000 };
      target.position = { x: 3030, y: 2000 };
      attacker.invulnerable = false;
      attacker.invulnerableUntil = 0;
      target.invulnerable = false;
      target.invulnerableUntil = 0;
      const before = target.health;
      internals.resolvePlayerCollisions(2050);
      return before - target.health;
    };

    const ohneDash = messeKontaktschaden(false);
    const mitDash = messeKontaktschaden(true);
    expect(ohneDash).toBeGreaterThan(0);
    expect(mitDash).toBeCloseTo(ohneDash * 0.25, 4);
  });

  it('keeps projectile-path damage during Dash at full strength', () => {
    const game = createGame();
    const attackerId = game.addPlayer('Storm');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const target = internals.players.get(targetId);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    equipLoadout(game, attackerId, 'dash', 'standard', 1000);
    game.applyInput(attackerId, { type: 'input', sequence: 1, move: { x: 1, y: 0 }, aim: { x: 500, y: 0 }, primary: false, secondary: false });
    activateModule(game, attackerId, 2000);

    // Projektile treffen ueber den direkten `damagePlayer`-Pfad -- eine Salve,
    // die beim Abdruecken schon flog, verliert durch den Dash nichts.
    const before = target.health;
    internals.damagePlayer(target, 40, attackerId, 2050);
    expect(before - target.health).toBeCloseTo(40, 4);
  });

  it('absorbs frontal Barrier damage but not attacks from behind', () => {
    const game = createGame();
    const targetId = game.addPlayer('Barrier');
    const attackerId = game.addPlayer('Attacker');
    const internals = game as unknown as Internals;
    const target = internals.players.get(targetId);
    const attacker = internals.players.get(attackerId);
    target.position = { x: 3000, y: 2000 };
    target.angle = 0;
    attacker.position = { x: 3100, y: 2000 };
    equipLoadout(game, targetId, 'barrier', 'standard', 1000);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    activateModule(game, targetId, 2000);
    const initial = target.health;

    internals.damagePlayer(target, 40, attackerId, 2050);
    expect(target.health).toBe(initial);
    const snapshot = game.snapshot(targetId, 2050) as any;
    expect(snapshot.gameplay[targetId].barrierHealth).toBe(30);

    attacker.position = { x: 2900, y: 2000 };
    internals.damagePlayer(target, 40, attackerId, 2100);
    expect(target.health).toBe(initial - 40);
  });

  it('keeps Barrier at fixed shield points for heavy reinforced tanks', () => {
    const game = createGame();
    const targetId = game.addPlayer('Fortress');
    const internals = game as unknown as Internals;
    const target = internals.players.get(targetId);
    target.level = 45;
    target.playerClass = 'fortress';
    equipLoadout(game, targetId, 'barrier', 'reinforced', 1000);
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    activateModule(game, targetId, 2000);

    const snapshot = game.snapshot(targetId, 2000) as any;
    expect(target.maxHealth).toBeGreaterThan(250);
    expect(snapshot.gameplay[targetId].barrierMaxHealth).toBe(70);
  });

  it('repels projectiles without dealing direct player damage', () => {
    const game = createGame();
    const playerId = game.addPlayer('Pulse');
    const targetId = game.addPlayer('Target');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    const target = internals.players.get(targetId);
    player.position = { x: 3000, y: 2000 };
    target.position = { x: 3100, y: 2000 };
    target.invulnerable = false;
    target.invulnerableUntil = 0;
    internals.projectiles.set('enemy-shot', {
      id: 'enemy-shot',
      ownerId: targetId,
      position: { x: 3050, y: 2000 },
      velocity: { x: -700, y: 0 },
      integrity: 25
    });
    equipLoadout(game, playerId, 'repulse', 'standard', 1000);
    const initialHealth = target.health;

    expect(activateModule(game, playerId, 2000)).toBe(true);
    expect(target.health).toBe(initialHealth);
    expect(target.velocity.x).toBeGreaterThan(0);
    expect(internals.projectiles.get('enemy-shot').velocity.x).toBeGreaterThan(0);
    expect(internals.projectiles.get('enemy-shot').integrity).toBe(16);
  });

  it('heals through Repair Cycle and cancels it when damage arrives', () => {
    const game = createGame();
    const playerId = game.addPlayer('Repair');
    const attackerId = game.addPlayer('Attacker');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    equipLoadout(game, playerId, 'repair', 'standard', 1000);
    player.health = player.maxHealth * 0.45;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    player.lastDamageAt = 2000;
    expect(activateModule(game, playerId, 3000)).toBe(true);

    const before = player.health;
    game.step(1 / GAME.tickRate, 4400);
    expect(player.health).toBeGreaterThan(before);
    internals.damagePlayer(player, 5, attackerId, 4450);
    const afterDamage = player.health;
    game.step(1 / GAME.tickRate, 5200);
    expect(player.health).toBeCloseTo(afterDamage, 4);
    const snapshot = game.snapshot(playerId, 5200) as any;
    expect(snapshot.gameplay[playerId].repairing).toBe(false);
  });

  it('cancels Repair when the tank actually moves, independent of the input path', () => {
    const game = createGame();
    const playerId = game.addPlayer('Runner');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    equipLoadout(game, playerId, 'repair', 'standard', 1000);
    player.health = player.maxHealth * 0.4;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    player.lastDamageAt = 2000;
    expect(activateModule(game, playerId, 3000)).toBe(true);

    player.velocity = { x: 180, y: 0 };
    player.position = { ...ORT };
    game.step(1 / GAME.tickRate, 4000);
    const snapshot = game.snapshot(playerId, 4000) as any;
    expect(snapshot.gameplay[playerId].repairing).toBe(false);
  });

  // Befund 66: Der Balken teilte durch die BASIS-Abklingzeit, `readyAt` wurde
  // aber mit dem Upgrade gesetzt -- bei 10 Punkten sprang die Anzeige beim
  // Druecken auf 40 % statt auf 0.
  it('starts the charge bar at zero even with cooldown upgrades invested', () => {
    const game = createGame();
    const playerId = game.addPlayer('Investor');
    const internals = game as unknown as Internals;
    const player = internals.players.get(playerId);
    player.upgrades.moduleCooldown = 10;
    equipLoadout(game, playerId, 'dash', 'standard', 1000);
    game.applyInput(playerId, { type: 'input', sequence: 1, move: { x: 1, y: 0 }, aim: { x: 500, y: 0 }, primary: false, secondary: false });
    expect(activateModule(game, playerId, 2000)).toBe(true);

    const cooldownMs = 10_000 * Math.pow(0.95, 10);
    const direktDanach = game.snapshot(playerId, 2001) as any;
    expect(direktDanach.gameplay[playerId].moduleCharge).toBeLessThan(0.01);
    const halbzeit = game.snapshot(playerId, 2000 + cooldownMs / 2) as any;
    expect(halbzeit.gameplay[playerId].moduleCharge).toBeCloseTo(0.5, 2);
    const fertig = game.snapshot(playerId, 2000 + cooldownMs + 1) as any;
    expect(fertig.gameplay[playerId].moduleCharge).toBe(1);
  });

  it('applies passive trade-offs through the central stat calculation', () => {
    const game = createGame();
    const playerId = game.addPlayer('Frames');
    const player = (game as unknown as Internals).players.get(playerId);
    const standard = tunedStatsFor(player);

    equipLoadout(game, playerId, 'dash', 'lightweight', 1000);
    const lightweight = tunedStatsFor(player);
    expect(lightweight.moveSpeed).toBeCloseTo(standard.moveSpeed * PASSIVE_MODIFIER_DEFINITIONS.lightweight.moveMultiplier, 4);
    expect(lightweight.maxHealth).toBeLessThan(standard.maxHealth);

    equipLoadout(game, playerId, 'dash', 'stabilizer', 2000);
    const stabilizer = tunedStatsFor(player);
    expect(stabilizer.projectileSpeed).toBeCloseTo(standard.projectileSpeed * 1.1, 4);
    expect(stabilizer.reload).toBeGreaterThan(standard.reload);
  });
});
