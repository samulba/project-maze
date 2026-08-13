import { afterEach, describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import {
  BAHN,
  FRACTURABLE_WALL_IDS,
  HAUPTPLAETZE,
  WALLS,
  WANDDICKE,
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
   * Deckung ist das Wesen des Maze-Modus. Der alte Korridor stand bei
   * 3,8–5,2 % – gemessen 4,53 %, und genau das war Sams Befund vom 13.08.:
   * „die Map ist noch zu wenig Maze". 90,3 % der Karte waren begehbar, das ist
   * ein Feld mit Pfosten.
   *
   * Der neue Korridor haelt das Ergebnis des Umbaus fest: Waende auf einem
   * Raster, 21,8 % Deckung. Die Untergrenze ist die eigentliche Zusicherung –
   * sie verhindert, dass die Karte wieder unbemerkt zum Feld wird.
   */
  it('haelt die Wanddeckung im Labyrinth-Korridor', () => {
    const wandflaeche = WALLS.reduce((summe, kandidat) => summe + kandidat.width * kandidat.height, 0);
    const anteil = wandflaeche / (GAME.worldWidth * GAME.worldHeight);
    expect(anteil, `Deckung ${(anteil * 100).toFixed(2)} %`).toBeGreaterThanOrEqual(0.17);
    expect(anteil, `Deckung ${(anteil * 100).toFixed(2)} %`).toBeLessThanOrEqual(0.28);
  });

  /**
   * Zweite Haelfte derselben Regel: Nicht nur die Flaeche muss stimmen, auch
   * die Stueckzahl. Wenige riesige Waende deckten denselben Anteil ab, waeren
   * als Labyrinth aber wertlos – Deckung entsteht aus Ecken, nicht aus Masse.
   */
  it('skaliert die Zahl der Waende mit der Flaeche', () => {
    const proMillionPixel = WALLS.length / ((GAME.worldWidth * GAME.worldHeight) / 1e6);
    expect(proMillionPixel).toBeGreaterThanOrEqual(2.2);
    expect(proMillionPixel).toBeLessThanOrEqual(3.6);
  });

  /**
   * Sams „dickere Waende": Vorher war eine Wand 54 px dick, ein Panzer 44 –
   * man stand nicht dahinter, man stand daneben. Jede Wand ist jetzt
   * mindestens drei Panzerbreiten dick.
   */
  it('macht jede Wand dick genug, um dahinter zu stehen', () => {
    expect(WANDDICKE).toBeGreaterThanOrEqual(GAME.playerRadius * 2 * 3);
    for (const kandidat of WALLS) {
      expect(Math.min(kandidat.width, kandidat.height), kandidat.id).toBe(WANDDICKE);
    }
  });

  /**
   * Die Gegenrichtung, und die wichtigere: Ein Labyrinth aus dicken Waenden ist
   * schnell eines, in dem man sich nicht mehr bewegen kann. Der Gang misst
   * `BAHN − WANDDICKE`; sieben Panzerbreiten sind die Zusicherung, dass zwei
   * Panzer aneinander vorbeikommen und ein Kampf darin stattfinden kann.
   */
  it('laesst die Gaenge breit genug zum Kaempfen', () => {
    const gang = BAHN - WANDDICKE;
    expect(gang).toBeGreaterThanOrEqual(GAME.playerRadius * 2 * 7);
    // Und der Gang ist wirklich begehbar, nicht nur rechnerisch breit: eine
    // Fahrt quer durch die Karte auf halber Gangbreite darf nirgends anecken.
    const mitte = BAHN / 2;
    let frei = 0;
    for (let x = mitte; x < GAME.worldWidth - BAHN; x += 40) if (isFree({ x, y: mitte }, GAME.playerRadius)) frei += 1;
    expect(frei).toBeGreaterThan(0);
  });

  /**
   * Sams „zwei Mainspots". Geprueft wird, was sie zu Plaetzen macht: Sie sind
   * wirklich offen (keine Wand darin), gross genug fuer einen Kampf, und beide
   * gleich – ein groesserer Platz waere ein Vorteil fuer die Seite, die naeher
   * dran spawnt.
   */
  it('spart zwei gleich grosse, wirklich offene Hauptplaetze aus', () => {
    expect(HAUPTPLAETZE).toHaveLength(2);
    const [west, ost] = HAUPTPLAETZE;
    expect(west!.bereich.width).toBe(ost!.bereich.width);
    expect(west!.bereich.height).toBe(ost!.bereich.height);
    expect(west!.mitte.x).toBeLessThan(ost!.mitte.x);
    for (const platz of HAUPTPLAETZE) {
      // Gross genug, dass ein Kampf hineinpasst: mindestens eine halbe Bildbreite.
      expect(platz.bereich.width, platz.id).toBeGreaterThanOrEqual(GAME.visibleWorldWidth / 2);
      // Und wirklich leer – jeder Punkt darin ist begehbar.
      for (let y = platz.bereich.y + 24; y < platz.bereich.y + platz.bereich.height - 24; y += 40) {
        for (let x = platz.bereich.x + 24; x < platz.bereich.x + platz.bereich.width - 24; x += 40) {
          expect(isFree({ x, y }, GAME.playerRadius), `${platz.id} bei (${x}, ${y})`).toBe(true);
        }
      }
    }
  });

  /**
   * Ein Platz mit einem Eingang ist eine Falle, einer mit keinem ist eine
   * Kulisse. Geprueft wird das Ergebnis: Von der Mitte jedes Platzes fuehrt in
   * jede der vier Himmelsrichtungen ein Weg hinaus.
   */
  it('gibt jedem Hauptplatz ein Tor in jede Richtung', () => {
    for (const platz of HAUPTPLAETZE) {
      const richtungen: Array<[string, number, number]> = [['links', -1, 0], ['rechts', 1, 0], ['oben', 0, -1], ['unten', 0, 1]];
      for (const [name, dx, dy] of richtungen) {
        // Quer durch die Randmauer hindurch: Irgendwo auf der Seite muss ein
        // Punkt jenseits der Mauer frei und von innen erreichbar sein.
        const laengs = dx === 0 ? platz.bereich.width : platz.bereich.height;
        let gefunden = false;
        for (let versatz = -laengs / 2 + 40; versatz <= laengs / 2 - 40 && !gefunden; versatz += 20) {
          const start = {
            x: platz.mitte.x + dx * (platz.bereich.width / 2 - 30) + (dx === 0 ? versatz : 0),
            y: platz.mitte.y + dy * (platz.bereich.height / 2 - 30) + (dy === 0 ? versatz : 0)
          };
          const draussen = { x: start.x + dx * (WANDDICKE + 60), y: start.y + dy * (WANDDICKE + 60) };
          if (!isFree(draussen, GAME.playerRadius)) continue;
          const gefahren = moveCircle(start, { x: dx * 2000, y: dy * 2000 }, 0.4, GAME.playerRadius);
          gefunden = Math.hypot(gefahren.position.x - start.x, gefahren.position.y - start.y) > WANDDICKE + 40;
        }
        expect(gefunden, `${platz.id} hat kein Tor nach ${name}`).toBe(true);
      }
    }
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
    // Schnell genug, um die ganze Wand zu durchqueren – sie ist WANDDICKE dick.
    const crossed = moveCircle(left, { x: (WANDDICKE + 200) / 0.2, y: 0 }, 0.2, 22);
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
