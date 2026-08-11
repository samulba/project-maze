import { describe, expect, it } from 'vitest';
import type { InputMessage } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { NO_INPUT_PROCESSED, lastProcessedInputFor, tuneInputAck } from './input-ack';
import { hardenSimulation } from './simulation-hardening';
import { tuneSpectator } from './spectator';
import { WALLS, isFree } from './world';

interface Internals {
  players: Map<string, any>;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (): MazeGame => tuneInputAck(tuneCombatScaling(hardenSimulation(new MazeGame(0))));

const move = (sequence: number, x = 1, y = 0): InputMessage => ({
  type: 'input',
  sequence,
  move: { x, y },
  aim: { x: 300, y: 0 },
  primary: false,
  secondary: false
});

/**
 * Freies Feld mit reichlich Abstand. Die naheliegende Weltmitte (3000, 2000)
 * liegt in einer Wand – dort nullt `moveCircle` die Geschwindigkeit, und genau
 * das ist die Falle, die der Client beim Nachbau ebenfalls treffen muss.
 */
function openGround(): { x: number; y: number } {
  for (let x = 400; x < 5_600; x += 40) {
    for (let y = 400; y < 3_600; y += 40) {
      if (isFree({ x, y }, 120)) return { x, y };
    }
  }
  throw new Error('kein freies Feld gefunden');
}

const ackOf = (game: MazeGame, playerId: string): number =>
  (game.snapshot(playerId) as unknown as { lastProcessedInput: number }).lastProcessedInput;

describe('Input-Quittung', () => {
  it('meldet vor der ersten Eingabe, dass noch nichts gerechnet wurde', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    expect(ackOf(game, playerId)).toBe(NO_INPUT_PROCESSED);
    game.step(1 / 40, 1_000);
    expect(ackOf(game, playerId)).toBe(NO_INPUT_PROCESSED);
  });

  it('quittiert eine Eingabe erst, wenn sie in einem Tick gerechnet wurde', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');

    game.applyInput(playerId, move(7));
    // Angenommen, aber noch nicht integriert – die Position kennt sie nicht.
    expect(ackOf(game, playerId)).toBe(NO_INPUT_PROCESSED);

    game.step(1 / 40, 1_000);
    expect(ackOf(game, playerId)).toBe(7);
  });

  it('hält die Quittung stehen, bis der nächste Tick läuft', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    game.applyInput(playerId, move(7));
    game.step(1 / 40, 1_000);

    // Zwischen zwei Ticks eintreffende Eingaben dürfen die Quittung nicht bewegen.
    game.applyInput(playerId, move(8));
    game.applyInput(playerId, move(9));
    expect(ackOf(game, playerId)).toBe(7);

    game.step(1 / 40, 1_025);
    expect(ackOf(game, playerId)).toBe(9);
  });

  it('bewegt sich nicht durch verworfene Eingaben', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    game.applyInput(playerId, move(12));
    game.step(1 / 40, 1_000);
    expect(ackOf(game, playerId)).toBe(12);

    // Veraltet und gleich – beides lehnt `applyInput` ab.
    game.applyInput(playerId, move(11));
    game.applyInput(playerId, move(12));
    game.step(1 / 40, 1_025);
    expect(ackOf(game, playerId)).toBe(12);
  });

  it('quittiert je Empfänger getrennt', () => {
    const game = createGame();
    const first = game.addPlayer('Erster');
    const second = game.addPlayer('Zweiter');
    game.applyInput(first, move(3));
    game.applyInput(second, move(88));
    game.step(1 / 40, 1_000);

    expect(ackOf(game, first)).toBe(3);
    expect(ackOf(game, second)).toBe(88);
    expect(lastProcessedInputFor(game, first)).toBe(3);
  });

  it('quittiert weiter, während der Spieler tot ist', () => {
    const game = createGame();
    const internals = game as unknown as Internals;
    const playerId = game.addPlayer('Gefallener');
    const killerId = game.addPlayer('Killer');
    const player = internals.players.get(playerId);
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    internals.killPlayer(player, killerId, 1_000, 'Arena');

    // Tote Spieler senden weiter Eingaben; die Quittung muss mitlaufen, sonst
    // rechnet der Client nach dem Respawn einen veralteten Stapel nach.
    game.applyInput(playerId, move(21));
    game.step(1 / 40, 1_100);
    expect(ackOf(game, playerId)).toBe(21);
  });

  it('quittiert im Zuschauermodus die eigene Eingabe, nicht die des Killers', () => {
    const game = tuneInputAck(
      tuneCombatScaling(tuneSpectator(hardenSimulation(new MazeGame(0)), true))
    );
    const internals = game as unknown as Internals;
    const victimId = game.addPlayer('Opfer');
    const killerId = game.addPlayer('Killer');
    const victim = internals.players.get(victimId);
    victim.position = { x: 900, y: 600 };
    internals.players.get(killerId).position = { x: 4_800, y: 3_200 };
    victim.invulnerable = false;
    victim.invulnerableUntil = 0;

    game.applyInput(victimId, move(5));
    game.applyInput(killerId, move(99));
    internals.killPlayer(victim, killerId, 1_000, 'Arena');
    game.step(1 / 40, 1_100);

    const snapshot = game.snapshot(victimId) as any;
    expect(snapshot.selfId).toBe(victimId);
    expect(snapshot.spectatorTargetId).toBe(killerId);
    expect(snapshot.lastProcessedInput).toBe(5);
  });

  it('vergisst die Quittung, wenn der Spieler die Arena verlässt', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    game.applyInput(playerId, move(4));
    game.step(1 / 40, 1_000);
    expect(lastProcessedInputFor(game, playerId)).toBe(4);

    game.removePlayer(playerId);
    expect(lastProcessedInputFor(game, playerId)).toBe(NO_INPUT_PROCESSED);
  });

  it('quittiert nichts bei einem Schritt der Länge null', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    game.applyInput(playerId, move(6));
    game.step(0, 1_000);
    expect(ackOf(game, playerId)).toBe(NO_INPUT_PROCESSED);
  });
});

describe('Bewegungsintegration – Vertrag mit dem Client', () => {
  /**
   * Diese Tests halten die *Form* der Integration fest, nicht einzelne
   * Balance-Zahlen: Sie leiten den Erwartungswert aus `tunedStatsFor` ab.
   * Genau diese Funktion muss der Client nachbauen – inklusive der
   * serverseitigen Skalierungen, die in `CLASS_DEFINITIONS` nicht stehen.
   */
  const seated = (): { game: MazeGame; playerId: string; player: any; stats: ReturnType<typeof tunedStatsFor> } => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    const player = (game as unknown as Internals).players.get(playerId);
    player.position = openGround();
    player.velocity = { x: 0, y: 0 };
    return { game, playerId, player, stats: tunedStatsFor(player) };
  };

  it('nähert die Geschwindigkeit je Tick um genau acceleration × dt an', () => {
    const { game, playerId, player, stats } = seated();
    const perTick = stats.acceleration / 40;

    game.applyInput(playerId, move(1, 1, 0));
    game.step(1 / 40, 1_000);
    expect(player.velocity.x).toBeCloseTo(perTick, 6);
    expect(player.velocity.y).toBeCloseTo(0, 6);

    game.step(1 / 40, 1_025);
    expect(player.velocity.x).toBeCloseTo(perTick * 2, 6);
  });

  it('bremst mit derselben Rate, mit der es beschleunigt – es gibt keinen eigenen Reibungsterm', () => {
    const { game, playerId, player, stats } = seated();
    const perTick = stats.acceleration / 40;
    player.velocity = { x: 200, y: 0 };

    game.applyInput(playerId, { ...move(1), move: { x: 0, y: 0 } });
    game.step(1 / 40, 1_000);
    expect(player.velocity.x).toBeCloseTo(200 - perTick, 6);
  });

  it('deckelt die Zielgeschwindigkeit über die Eingabelänge, ohne sie zu normieren', () => {
    const { game, playerId, player, stats } = seated();
    const target = stats.moveSpeed * 0.5;
    // Kurz vor dem Ziel: Der letzte Schritt rastet exakt auf den Zielwert ein.
    player.velocity = { x: target - 1, y: 0 };

    game.applyInput(playerId, move(1, 0.5, 0));
    game.step(1 / 40, 1_000);
    expect(player.velocity.x).toBeCloseTo(target, 6);
  });

  it('nullt die blockierte Achse bei Wandkontakt, statt abzugleiten', () => {
    const game = createGame();
    const playerId = game.addPlayer('Fahrer');
    const player = (game as unknown as Internals).players.get(playerId);
    /*
     * Genau in einer Wand: Beide Achsen sind blockiert.
     *
     * Die Wand wird gesucht, nicht geraten. Vorher stand hier der Festpunkt
     * (3000, 2000) – der lag auf der 6000 × 4000er Karte in einer Wand und ist
     * seit dem Wachstum auf 9000 × 6000 freies Feld. Der Test war damit still
     * wirkungslos geworden, statt rot: Er haette eine Kollision geprueft, die
     * gar nicht mehr stattfindet.
     */
    const wand = WALLS.find((kandidat) => kandidat.width >= 54 && kandidat.height >= 54);
    expect(wand).toBeDefined();
    player.position = { x: wand!.x + wand!.width / 2, y: wand!.y + wand!.height / 2 };
    expect(isFree(player.position, 22)).toBe(false);
    player.velocity = { x: 300, y: 300 };

    game.applyInput(playerId, move(1, 1, 1));
    game.step(1 / 40, 1_000);
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.y).toBe(0);
  });
});
