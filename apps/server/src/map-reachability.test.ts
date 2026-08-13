import { describe, expect, it } from 'vitest';
import { GAME, type Wall } from '@project-maze/shared';
import {
  RASTER,
  berichte,
  gebietAn,
  probenRadius,
  pruefeErreichbarkeit,
  zellenVon
} from './map-reachability';
import { SHAPE_CONFIG, WALLS, circleHitsWall, isFree, randomSpawn, createShape } from './world';

/**
 * Die Probe misst die Karte – also muss zuerst die Probe selbst geprüft werden,
 * und zwar an Fällen, deren Antwort man von Hand kennt. Eine Erreichbarkeits-
 * probe, die nie „getrennt" sagt, würde jeden Generator-Umbau durchwinken.
 */

/** Kunstwelt aus Rechtecken – klein genug, um die Antwort abzuzählen. */
const kunstwelt = (breite: number, hoehe: number, waende: Wall[], radius = 5, raster = 10) =>
  pruefeErreichbarkeit({
    breite,
    hoehe,
    raster,
    frei: (punkt) => punkt.x >= radius && punkt.y >= radius
      && punkt.x <= breite - radius && punkt.y <= hoehe - radius
      && !waende.some((wand) => circleHitsWall(punkt, radius, wand))
  });

const wand = (id: string, x: number, y: number, width: number, height: number): Wall => ({ id, x, y, width, height });

describe('Erreichbarkeitsprobe – prüft sich zuerst selbst', () => {
  it('meldet für ein leeres Feld genau ein Gebiet', () => {
    const ergebnis = kunstwelt(400, 300, []);
    expect(ergebnis.gebiete).toHaveLength(1);
    expect(ergebnis.anteilGroesstes).toBe(1);
    expect(ergebnis.begehbar).toBeGreaterThan(0);
  });

  it('erkennt eine durchgehende Trennwand – der Fall, für den es sie gibt', () => {
    // Wand über die volle Höhe: links und rechts sind zwei Welten.
    const ergebnis = kunstwelt(400, 300, [wand('t', 190, 0, 20, 300)]);
    expect(ergebnis.gebiete).toHaveLength(2);
    expect(ergebnis.anteilGroesstes).toBeLessThan(0.6);
    // Und sie sagt auch, wo – sonst sucht der nächste Mensch von Hand.
    expect(berichte(ergebnis)).toMatch(/abgeschnitten: \d+ Zellen bei \(\d+, \d+\)/);
  });

  it('zählt eine Lücke in derselben Wand als Verbindung', () => {
    const ergebnis = kunstwelt(400, 300, [wand('o', 190, 0, 20, 120), wand('u', 190, 180, 20, 120)]);
    expect(ergebnis.gebiete).toHaveLength(1);
  });

  it('trennt nicht über Eck: zwei diagonal berührende Kammern bleiben zwei', () => {
    // Zwei Wände, die sich in einem Punkt treffen – dazwischen ist optisch eine
    // Diagonale frei, durchfahren kann sie niemand. Mit 8er-Nachbarschaft wäre
    // das fälschlich ein Gebiet.
    const ergebnis = kunstwelt(400, 400, [wand('a', 190, 0, 20, 200), wand('b', 190, 200, 20, 200)]);
    expect(ergebnis.gebiete).toHaveLength(2);
  });

  it('nennt die Fundstelle einer abgeschnittenen Kammer', () => {
    const ergebnis = kunstwelt(400, 300, [
      wand('l', 100, 100, 120, 10), wand('r', 100, 100, 10, 120),
      wand('o', 100, 210, 120, 10), wand('u', 210, 100, 10, 130)
    ]);
    const kammer = ergebnis.gebiete.at(-1)!;
    expect(ergebnis.gebiete.length).toBeGreaterThan(1);
    // Die Probe liegt in der eingemauerten Kammer, nicht irgendwo.
    expect(kammer.probe.x).toBeGreaterThan(100);
    expect(kammer.probe.x).toBeLessThan(220);
    expect(kammer.probe.y).toBeGreaterThan(100);
    expect(kammer.probe.y).toBeLessThan(220);
  });

  /**
   * Der Aufschlag, an einem Fall zum Nachrechnen: Der Spalt ist 22 px breit,
   * der Panzer (Radius 10) also 20 px dick – ein Pixel Luft auf jeder Seite.
   * Geometrisch ein Weg, praktisch keiner: Man bleibt an beiden Kanten hängen.
   * Ohne Aufschlag zählt die Probe das als Verbindung, mit Aufschlag nicht.
   */
  it('zählt einen Spalt von knapp Panzerbreite nicht als Weg', () => {
    const eng = [wand('o', 190, 0, 20, 134), wand('u', 190, 156, 20, 144)];
    expect(kunstwelt(400, 300, eng, 10, 10).gebiete).toHaveLength(1);
    expect(kunstwelt(400, 300, eng, probenRadius(10, 10), 10).gebiete).toHaveLength(2);
    // Doppelt so breit ist unstrittig ein Weg – auch mit Aufschlag.
    const breit = [wand('o', 190, 0, 20, 125), wand('u', 190, 165, 20, 135)];
    expect(kunstwelt(400, 300, breit, probenRadius(10, 10), 10).gebiete).toHaveLength(1);
  });

  it('ordnet Weltpunkte ihrem Gebiet zu und Wandflächen keinem', () => {
    const trennwand = wand('t', 190, 0, 20, 300);
    const ergebnis = kunstwelt(400, 300, [trennwand]);
    const links = gebietAn(ergebnis, { x: 60, y: 150 });
    const rechts = gebietAn(ergebnis, { x: 340, y: 150 });
    expect(links).toBeGreaterThanOrEqual(0);
    expect(rechts).toBeGreaterThanOrEqual(0);
    expect(links).not.toBe(rechts);
    expect(gebietAn(ergebnis, { x: 200, y: 150 })).toBe(-1);
    expect(gebietAn(ergebnis, { x: -50, y: 150 })).toBe(-1);
  });
});

/**
 * Und jetzt die echte Karte. Diese Zahlen sind die Grundlinie für den
 * Generator-Umbau in Stufe 3: Wer die Wände verdickt oder vermehrt, muss diese
 * Tests grün halten – oder bewusst entscheiden, dass die Karte zerfällt.
 */
describe('Erreichbarkeit der echten Karte', () => {
  const ergebnis = pruefeErreichbarkeit({
    breite: GAME.worldWidth,
    hoehe: GAME.worldHeight,
    raster: RASTER,
    frei: (punkt) => isFree(punkt, probenRadius(GAME.playerRadius))
  });

  it('zerfällt in kein einziges abgeschnittenes Gebiet', () => {
    expect(ergebnis.gebiete.length, berichte(ergebnis)).toBe(1);
    expect(ergebnis.anteilGroesstes).toBe(1);
  });

  /**
   * Zusammenhang allein reicht nicht: Eine Karte, die nur noch aus einem
   * schmalen Gang besteht, wäre ebenfalls „ein Gebiet". Der Korridor hält
   * fest, dass der begehbare Anteil ein Labyrinth bleibt und keine Röhre wird.
   */
  it('hält den begehbaren Anteil im Korridor', () => {
    const anteil = ergebnis.begehbar / (ergebnis.spalten * ergebnis.zeilen);
    expect(anteil, `begehbar ${(anteil * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(0.6);
    expect(anteil, `begehbar ${(anteil * 100).toFixed(1)} %`).toBeLessThanOrEqual(0.95);
  });

  it('legt jeden Spawn ins begehbare Gebiet', () => {
    for (let versuch = 0; versuch < 200; versuch += 1) {
      const spawn = randomSpawn();
      expect(gebietAn(ergebnis, spawn), `Spawn (${Math.round(spawn.x)}, ${Math.round(spawn.y)}) liegt abgeschnitten`).toBe(0);
    }
  });

  /**
   * Formen sind die einzige Einkommensquelle der ersten Minuten. Eine Form in
   * einer zugemauerten Nische ist verlorenes Spielgeld – und sie fiele
   * niemandem auf.
   *
   * Geprüft wird über ein zweites, feineres Gitter: Eine Form braucht viel
   * weniger Platz als ein Panzer (Radius 13 statt 22), sie darf also in Ecken
   * liegen, in denen niemand steht. Verlangt wird nur, dass der Bereich, in dem
   * sie liegt, **irgendwo** Panzerboden berührt. Das Formengitter benutzt
   * bewusst den kleinsten Formradius: Der Bereich wird damit so groß wie
   * möglich, und wenn selbst der keinen Panzerboden trifft, ist die Kammer
   * wirklich zu.
   */
  it('legt keine Form in eine Kammer, an die kein Panzer herankommt', () => {
    const FEIN = 10;
    const formenboden = pruefeErreichbarkeit({
      breite: GAME.worldWidth,
      hoehe: GAME.worldHeight,
      raster: FEIN,
      frei: (punkt) => isFree(punkt, SHAPE_CONFIG.square.radius)
    });
    const mitPanzerzugang = new Set<number>();
    for (let gebiet = 0; gebiet < formenboden.gebiete.length; gebiet += 1) {
      for (const zelle of zellenVon(formenboden, gebiet)) {
        if (gebietAn(ergebnis, zelle) !== 0) continue;
        mitPanzerzugang.add(gebiet);
        break;
      }
    }

    for (let index = 0; index < 300; index += 1) {
      const form = createShape(`probe-${index}`);
      const ort = `Form ${index} bei (${Math.round(form.position.x)}, ${Math.round(form.position.y)})`;
      const gebiet = gebietAn(formenboden, form.position);
      expect(gebiet, `${ort} liegt nicht einmal auf Formenboden`).toBeGreaterThanOrEqual(0);
      expect(mitPanzerzugang.has(gebiet), `${ort} liegt in einer Kammer ohne Panzerzugang`).toBe(true);
    }
  });

  it('misst überhaupt eine Karte mit Wänden – sonst prüfte der Test nichts', () => {
    expect(WALLS.length).toBeGreaterThan(20);
    expect(ergebnis.begehbar).toBeLessThan(ergebnis.spalten * ergebnis.zeilen);
  });
});
