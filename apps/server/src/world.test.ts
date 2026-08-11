import { afterEach, describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import {
  FRACTURABLE_WALL_IDS,
  WALLS,
  createShape,
  hasLineOfSight,
  isFree,
  isWallDisabled,
  moveCircle,
  randomSpawn,
  resetDisabledWalls,
  setWallDisabled,
  setArenaMode,
  currentArenaMode,
  wallsInView
} from './world';

afterEach(resetDisabledWalls);

/** Ein senkrechtes Segment mit freiem Platz links und rechts – ideal für Durchgangstests. */
const passableVerticalWall = () => WALLS.find((candidate) => {
  if (!candidate.id.startsWith('v')) return false;
  const y = candidate.y + candidate.height / 2;
  return isFree({ x: candidate.x - 40, y }, 22) && isFree({ x: candidate.x + candidate.width + 40, y }, 22);
});

describe('world generation and collision', () => {
  it('creates a larger playable maze', () => {
    expect(GAME.worldWidth).toBeGreaterThanOrEqual(6000);
    expect(WALLS.length).toBeGreaterThan(20);
  });

  /**
   * Deckung ist das Wesen des Maze-Modus – und sie ist beim Vergroessern der
   * Karte einmal still weggerutscht: Die Bahn-*Anzahlen* standen fest (4 Reihen,
   * 6 Spalten), also wurden die Bahnen groesser statt zahlreicher, und die
   * Deckung fiel von 4,4 % auf 3,5 % der Flaeche. Niemand haette das gemerkt,
   * bis sich das Spiel offener anfuehlt und keiner sagen kann, warum.
   *
   * Der Korridor haelt beides fest: genug Waende, um Ecken und Hinterhalte zu
   * haben, und nicht so viele, dass die Arena zur Enge wird.
   */
  it('haelt die Wanddeckung unabhaengig von der Kartengroesse', () => {
    const wandflaeche = WALLS.reduce((summe, kandidat) => summe + kandidat.width * kandidat.height, 0);
    const anteil = wandflaeche / (GAME.worldWidth * GAME.worldHeight);
    expect(anteil).toBeGreaterThanOrEqual(0.038);
    expect(anteil).toBeLessThanOrEqual(0.052);
  });

  /**
   * Zweite Haelfte derselben Regel: Nicht nur die Flaeche muss stimmen, auch
   * die Stueckzahl. Wenige riesige Waende deckten denselben Anteil ab, waeren
   * als Labyrinth aber wertlos – Deckung entsteht aus Ecken, nicht aus Masse.
   */
  it('skaliert die Zahl der Waende mit der Flaeche', () => {
    const proMillionPixel = WALLS.length / ((GAME.worldWidth * GAME.worldHeight) / 1e6);
    expect(proMillionPixel).toBeGreaterThanOrEqual(1.3);
    expect(proMillionPixel).toBeLessThanOrEqual(2.3);
  });

  it('returns legal spawns and shapes', () => {
    for (let index = 0; index < 50; index += 1) {
      const spawn = randomSpawn();
      expect(isFree(spawn, 36)).toBe(true);
      const shape = createShape(`shape-${index}`);
      expect(isFree(shape.position, shape.radius)).toBe(true);
    }
  });

  it('keeps fast-moving circles in a legal position', () => {
    const start = randomSpawn(() => 0.02);
    const result = moveCircle(start, { x: 5000, y: 0 }, 0.25, 22);
    expect(isFree(result.position, 22)).toBe(true);
  });

  it('blocks line of sight through a wall', () => {
    const candidate = WALLS[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;
    expect(hasLineOfSight(
      { x: candidate.x - 20, y: candidate.y + candidate.height / 2 },
      { x: candidate.x + candidate.width + 20, y: candidate.y + candidate.height / 2 }
    )).toBe(false);
  });
});

describe('deaktivierbare Wandsegmente', () => {
  it('lässt nur generierte Segmente aufbrechen, niemals die festen l-Wände', () => {
    const fixed = WALLS.find((candidate) => candidate.id.startsWith('l'));
    expect(fixed).toBeDefined();
    expect(FRACTURABLE_WALL_IDS).not.toContain(fixed!.id);
    expect(setWallDisabled(fixed!.id, true)).toBe(false);
    expect(isWallDisabled(fixed!.id)).toBe(false);

    const generated = FRACTURABLE_WALL_IDS[0]!;
    expect(setWallDisabled(generated, true)).toBe(true);
    expect(isWallDisabled(generated)).toBe(true);
  });

  it('macht eine deaktivierte Wand passierbar, durchsichtig und unsichtbar', () => {
    const wall = passableVerticalWall();
    expect(wall).toBeDefined();
    if (!wall) return;
    const y = wall.y + wall.height / 2;
    const left = { x: wall.x - 40, y };
    const right = { x: wall.x + wall.width + 40, y };
    const inside = { x: wall.x + wall.width / 2, y };

    expect(isFree(inside, 22)).toBe(false);
    expect(hasLineOfSight(left, right)).toBe(false);
    expect(wallsInView(inside).some((candidate) => candidate.id === wall.id)).toBe(true);

    setWallDisabled(wall.id, true);
    expect(isFree(inside, 22)).toBe(true);
    expect(hasLineOfSight(left, right)).toBe(true);
    expect(wallsInView(inside).some((candidate) => candidate.id === wall.id)).toBe(false);
    const crossed = moveCircle(left, { x: 900, y: 0 }, 0.2, 22);
    expect(crossed.position.x).toBeGreaterThan(wall.x + wall.width);
  });

  it('stellt beim Zurücksetzen den ursprünglichen Zustand her', () => {
    const wall = passableVerticalWall();
    if (!wall) return;
    const inside = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
    setWallDisabled(wall.id, true);
    expect(isFree(inside, 22)).toBe(true);
    resetDisabledWalls();
    expect(isFree(inside, 22)).toBe(false);
    expect(isWallDisabled(wall.id)).toBe(false);
  });
});

/**
 * FFA ist der heutige Modus OHNE Waende. Das klingt nach einer Kleinigkeit und
 * ist ein anderes Spiel: keine Deckung, freie Sichtlinien, SPECTER verliert
 * seine Verstecke.
 *
 * Geprueft wird das Ergebnis, nicht der Schalter -- `WALLS` bleibt erzeugt, nur
 * wirkt es nicht mehr. Wer das verwechselt, prueft eine Variable statt der
 * Arena, in der gespielt wird.
 */
describe('Arena-Modus', () => {
  afterEach(() => setArenaMode('maze'));

  it('nimmt im Maze-Modus jede Wand ernst', () => {
    setArenaMode('maze');
    const wand = WALLS.find((k) => k.width >= 54 && k.height >= 54)!;
    const mitte = { x: wand.x + wand.width / 2, y: wand.y + wand.height / 2 };
    expect(isFree(mitte, 22)).toBe(false);
    expect(wallsInView(mitte).length).toBeGreaterThan(0);
  });

  it('laesst in FFA keine einzige Wand wirken', () => {
    setArenaMode('ffa');
    // Jede erzeugte Wand ist begehbar – die Karte ist offen.
    for (const wand of WALLS) {
      const mitte = { x: wand.x + wand.width / 2, y: wand.y + wand.height / 2 };
      expect(isFree(mitte, 22), wand.id).toBe(true);
    }
    // Und es wird auch keine mehr an Clients gesendet.
    expect(wallsInView({ x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 })).toHaveLength(0);
  });

  it('gibt in FFA ueberall freie Sichtlinien', () => {
    setArenaMode('maze');
    const paare: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
    for (let i = 0; i < 40; i += 1) {
      const a = { x: 300 + (i * 211) % (GAME.worldWidth - 600), y: 300 + (i * 397) % (GAME.worldHeight - 600) };
      const b = { x: 300 + (i * 613) % (GAME.worldWidth - 600), y: 300 + (i * 149) % (GAME.worldHeight - 600) };
      paare.push([a, b]);
    }
    const imMaze = paare.filter(([a, b]) => hasLineOfSight(a, b)).length;
    // Im Labyrinth ist mindestens eine Linie verstellt – sonst prueft der Test nichts.
    expect(imMaze).toBeLessThan(paare.length);

    setArenaMode('ffa');
    expect(paare.every(([a, b]) => hasLineOfSight(a, b))).toBe(true);
  });

  it('setzt den Standard auf maze, damit ein Fehlstart nichts umbaut', () => {
    setArenaMode('maze');
    expect(currentArenaMode()).toBe('maze');
    setArenaMode('ffa');
    expect(currentArenaMode()).toBe('ffa');
  });
});
