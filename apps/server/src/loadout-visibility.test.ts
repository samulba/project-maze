import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { ACTIVE_MODULE_DEFINITIONS, REPULSE_RADIUS, type ActiveModuleId } from '@project-maze/shared/gameplay';
import { DEFAULT_BOT_PACING, tuneBotBrain } from './bot-brain';
import { tuneClassMechanics } from './class-mechanics';
import { tuneCombatScaling } from './combat-tuning';
import { tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { REPAIR_MOVE_LIMIT, activateModule, equipLoadout, tuneLoadoutSystem } from './loadout-system';

/**
 * Zwei Fähigkeiten, die serverseitig etwas tun, das man nicht sehen kann.
 *
 * Der Maßstab ist der Snapshot-Abstand: 30 Snapshots je Sekunde sind 33 ms,
 * ein Tick sind 25 ms. Was innerhalb eines Ticks entsteht und wieder vergeht,
 * hat für den Client **nie stattgefunden**.
 */

const DT = 0.025;
const OPEN_GROUND = { x: 2800, y: 2200 };

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
}

const ready = (player: any, playerClass = 'storm'): void => {
  player.playerClass = playerClass;
  player.level = GAME.maxLevel;
  player.move = { x: 0, y: 0 };
  player.velocity = { x: 0, y: 0 };
  player.aim = { x: 200, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
};

/** `equipLoadout` verlangt einen toten oder unverwundbaren Tank. */
const arm = (game: MazeGame, id: string, module: ActiveModuleId, player: any): void => {
  player.invulnerable = true;
  expect(equipLoadout(game, id, module, 'standard', 100_000)).toBe(true);
  player.invulnerable = false;
  player.invulnerableUntil = 0;
};

const run = (game: MazeGame, internals: Internals, seconds: number, start: number): void => {
  let now = start;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    now += DT * 1000;
    game.step(DT, now);
    // Formen wachsen während eines Laufs nach und zerstören sonst das Ergebnis.
    internals.shapes.clear();
  }
};

describe('repair – kein Zyklus, der nie stattgefunden hat', () => {
  const setup = () => {
    const game = tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)));
    const internals = game as unknown as Internals;
    internals.shapes.clear();
    const id = game.addPlayer('Medic');
    const player = internals.players.get(id);
    ready(player);
    player.position = { ...OPEN_GROUND };
    player.health = 20;
    arm(game, id, 'repair', player);
    return { game, internals, id, player };
  };

  it('weist die Aktivierung in Fahrt zurück, statt die Abklingzeit zu verbrennen', () => {
    const { game, internals, id, player } = setup();
    player.move = { x: 1, y: 0 };
    player.velocity = { x: 290, y: 0 };

    // Vorher: true, und der Schritt brach den Zyklus im selben Tick wieder ab –
    // gemessen `repairing = true` in **0 von 20 Ticks**, bei 16,5 s laufender
    // Abklingzeit. Der Client sah ausschließlich die Abklingzeit.
    expect(activateModule(game, id, 101_000)).toBe(false);

    const snapshot = game.snapshot(id, 101_000) as any;
    expect(snapshot.gameplay[id].repairing).toBe(false);
    // Das Modul ist weiter bereit – das ist der ganze Unterschied.
    expect(snapshot.gameplay[id].moduleReadyAt).toBeLessThanOrEqual(101_000);
    run(game, internals, 0.5, 101_000);
  });

  it('läuft im Stand und ist über die volle Wirkdauer sichtbar', () => {
    const { game, internals, id, player } = setup();
    expect(Math.hypot(player.velocity.x, player.velocity.y)).toBeLessThanOrEqual(REPAIR_MOVE_LIMIT);
    expect(activateModule(game, id, 101_000)).toBe(true);

    let now = 101_000;
    let visible = 0;
    const ticks = Math.round(ACTIVE_MODULE_DEFINITIONS.repair.activeMs / 1000 / DT);
    for (let i = 0; i < ticks; i += 1) {
      now += DT * 1000;
      game.step(DT, now);
      internals.shapes.clear();
      if ((game.snapshot(id, now) as any).gameplay[id].repairing) visible += 1;
    }
    // 3 s Wirkdauer sind 90 Snapshots. Sichtbar heißt hier: fast alle davon.
    expect(visible).toBeGreaterThan(ticks * 0.9);
    expect(player.health).toBeGreaterThan(20);
  });

  it('lässt einen Bot erst anhalten und dann reparieren', () => {
    const game = tuneLoadoutSystem(
      tuneBotBrain(tuneClassMechanics(tuneDrones(tuneCombatScaling(new MazeGame(1)))), DEFAULT_BOT_PACING)
    );
    const internals = game as unknown as Internals;
    internals.shapes.clear();
    const [id, bot] = [...internals.players.entries()][0]!;
    ready(bot);
    bot.position = { ...OPEN_GROUND };
    bot.health = 10;
    bot.maxHealth = 100;
    arm(game, id, 'repair', bot);
    bot.velocity = { x: 290, y: 0 };

    // Ohne das Anhalten liefe der Bot in dieselbe Falle wie der Mensch: Er
    // aktiviert in Fahrt, der Zyklus stirbt sofort, 17 s Abklingzeit sind weg.
    run(game, internals, 2.5, 101_000);
    const snapshot = game.snapshot(id, 103_500) as any;
    const gameplay = snapshot.gameplay[id];
    // Entweder er repariert gerade oder er ist schon fertig – in beiden Fällen
    // ist die Abklingzeit nicht für nichts draufgegangen.
    expect(gameplay.repairing || bot.health > 10).toBe(true);
  });
});

describe('repulse – ein Stoß, der im Getroffenen ankommt', () => {
  const setup = (repulseTravel: boolean) => {
    const game = tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0)), false, repulseTravel);
    const internals = game as unknown as Internals;
    internals.shapes.clear();
    const pusherId = game.addPlayer('Pusher');
    const targetId = game.addPlayer('Ziel');
    const pusher = internals.players.get(pusherId);
    const target = internals.players.get(targetId);
    ready(pusher);
    ready(target);
    pusher.position = { ...OPEN_GROUND };
    target.position = { x: OPEN_GROUND.x + 100, y: OPEN_GROUND.y };
    arm(game, pusherId, 'repulse', pusher);
    return { game, internals, pusherId, target };
  };

  /** Weg des Getroffenen, Tick für Tick – das sieht der Client als Snapshots. */
  const shovePath = (repulseTravel: boolean): number[] => {
    const { game, internals, pusherId, target } = setup(repulseTravel);
    const start = target.position.x;
    expect(activateModule(game, pusherId, 101_000)).toBe(true);
    const path: number[] = [];
    let now = 101_000;
    for (let i = 0; i < 40; i += 1) {
      now += DT * 1000;
      game.step(DT, now);
      internals.shapes.clear();
      path.push(target.position.x - start);
    }
    return path;
  };

  it('schiebt ohne Schalter nur einen Tankdurchmesser weit', () => {
    // Der Befund: Der Stoß wird als Geschwindigkeit gesetzt, und die
    // Bewegungsintegration zieht sie binnen 200 ms wieder auf die Eingabe
    // zurück. 44 px bei 195 px Wirkradius und 12 s Abklingzeit.
    const path = shovePath(false);
    const travelled = path[path.length - 1]!;
    expect(travelled).toBeLessThan(GAME.playerRadius * 2 + 6);
    expect(travelled).toBeGreaterThan(GAME.playerRadius * 2 - 6);
    // Und nach 200 ms steht der Getroffene praktisch wieder: Die
    // Bewegungsintegration hat den Stoß da schon aufgefressen.
    expect(path[7]! / travelled).toBeGreaterThan(0.98);
  });

  it('trägt den Stoß mit Schalter über die Wirkdauer', () => {
    const path = shovePath(true);
    const travelled = path[path.length - 1]!;
    // Dieselbe Stoßstärke, nur nicht mehr sofort wegintegriert: Strecke ist
    // Stärke mal Wirkdauer statt Stärke durch Beschleunigung.
    expect(travelled).toBeGreaterThan(90);
    // Die Bewegung verteilt sich über die Wirkdauer – bei 260 ms sind das rund
    // acht Snapshots, in denen der Getroffene sichtbar unterwegs ist.
    const activeTicks = Math.round(ACTIVE_MODULE_DEFINITIONS.repulse.activeMs / 1000 / DT);
    expect(path[1]! - path[0]!).toBeGreaterThan(0);
    expect(path[activeTicks - 2]! - path[activeTicks - 3]!).toBeGreaterThan(0);
    // Danach ist Schluss: kein Dauerschub.
    expect(path[path.length - 1]! - path[activeTicks + 2]!).toBeLessThan(1);
  });

  it('endet an der Wand, statt hindurchzuschieben', () => {
    const { game, internals, pusherId, target } = setup(true);
    target.position = { x: GAME.worldWidth - GAME.playerRadius - 30, y: OPEN_GROUND.y };
    const pusher = internals.players.get(pusherId);
    pusher.position = { x: target.position.x - 100, y: OPEN_GROUND.y };
    expect(activateModule(game, pusherId, 101_000)).toBe(true);
    run(game, internals, 0.5, 101_000);
    expect(target.position.x).toBeLessThanOrEqual(GAME.worldWidth - GAME.playerRadius + 1e-6);
  });

  it('lässt den Getroffenen die Kontrolle behalten', () => {
    // Anders als die Dash-Fahrt überschreibt der Stoß die eigene Bewegung
    // nicht – wer gestoßen wird, wird getragen, nicht betäubt.
    const { game, internals, pusherId, target } = setup(true);
    target.move = { x: 0, y: -1 };
    expect(activateModule(game, pusherId, 101_000)).toBe(true);
    const startY = target.position.y;
    run(game, internals, ACTIVE_MODULE_DEFINITIONS.repulse.activeMs / 1000, 101_000);
    expect(target.position.y).toBeLessThan(startY - 20);
  });

  it('hält den Wirkradius als geteilte Zahl', () => {
    // Der Client zeichnet den Ring aus derselben Konstante, statt sie
    // abzuschreiben – die Lehre aus ACCELERATION_SCALE.
    const { game, internals, pusherId, target } = setup(true);
    target.position = { x: OPEN_GROUND.x + REPULSE_RADIUS + 5, y: OPEN_GROUND.y };
    const start = target.position.x;
    expect(activateModule(game, pusherId, 101_000)).toBe(true);
    run(game, internals, 0.5, 101_000);
    expect(target.position.x - start).toBeLessThan(1);
  });
});
