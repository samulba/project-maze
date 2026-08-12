import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import {
  MAX_ASPECT,
  MIN_ASPECT,
  VIEW_AREA,
  computeViewport,
  readViewMode,
  viewportLimits,
  worldViewFor
} from './viewport';

/**
 * Sams Befund war „die Ränder links rechts sind nur noch fetter ingame, das ist
 * nicht responsive". Die Messung im Browser hat gezeigt: Die Geometrie tut
 * genau das, was sie soll – über 24 Übergänge (Fenstergröße, Vollbild rein und
 * raus, Ultrawide, hoch) stimmt das Sichtfeld immer mit der Rechnung überein.
 * Die Ränder sind also kein Fehler in der Härtung, sondern das feste 16:9 auf
 * einem 21:9-Schirm.
 *
 * Diese Tests nageln beides fest: die bisherige Rechnung, damit sie nicht
 * unbemerkt kippt, und die Alternative samt ihrer harten Grenze gegen die
 * Sichtweite des Servers.
 */

describe('Festes 16:9 – der bisherige Zustand', () => {
  const faelle: Array<[string, number, number, number, number, number, number]> = [
    // Fenster                 Breite  Höhe   x     y    (aus der Browser-Messung)
    ['1920x1080', 1920, 1080, 1920, 1080, 0, 0],
    ['2560x1080', 2560, 1080, 1920, 1080, 320, 0],
    ['3440x1440', 3440, 1440, 2560, 1440, 440, 0],
    ['1600x900', 1600, 900, 1600, 900, 0, 0],
    ['2560x1440', 2560, 1440, 2560, 1440, 0, 0],
    ['1280x1024', 1280, 1024, 1280, 720, 0, 152],
    ['1920x1200', 1920, 1200, 1920, 1080, 0, 60]
  ];

  for (const [label, sw, sh, breite, hoehe, x, y] of faelle) {
    it(`trifft ${label} auf den Pixel`, () => {
      const { rect } = computeViewport(sw, sh, 'fest');
      expect([rect.width, rect.height, rect.x, rect.y]).toEqual([breite, hoehe, x, y]);
    });
  }

  it('lässt auf 21:9 ein Viertel der Fläche liegen – das ist Sams Befund', () => {
    const { rect } = computeViewport(2560, 1080, 'fest');
    expect((rect.x * 2) / 2560).toBeCloseTo(0.25, 2);
  });

  it('zeigt immer denselben Weltausschnitt', () => {
    for (const [, sw, sh] of faelle) {
      const { world } = computeViewport(sw, sh, 'fest');
      expect(world).toEqual({ width: GAME.visibleWorldWidth, height: GAME.visibleWorldHeight });
    }
  });

  it('legt alle Kanten auf ganze Pixel', () => {
    // Krumme Werte aus der Zentrierung waren einer der beiden Gründe für die
    // sichtbaren Striche an den Bildschirmrändern.
    for (let breite = 800; breite <= 3441; breite += 37) {
      const { rect } = computeViewport(breite, 1013, 'fest');
      for (const wert of [rect.x, rect.y, rect.width, rect.height]) expect(Number.isInteger(wert)).toBe(true);
    }
  });
});

describe('Flächengleiche Sicht – die Alternative', () => {
  it('ändert bei 16:9 nichts, auf sechs Nachkommastellen', () => {
    // Der wichtigste Test des Moduls: Wer heute 16:9 spielt, merkt vom
    // Umschalten nichts. Alles andere wäre eine Balance-Änderung durch die
    // Hintertür.
    const fest = computeViewport(1920, 1080, 'fest');
    const gleich = computeViewport(1920, 1080, 'flaechengleich');
    expect(gleich.rect).toEqual(fest.rect);
    expect(gleich.world.width).toBeCloseTo(fest.world.width, 6);
    expect(gleich.world.height).toBeCloseTo(fest.world.height, 6);
    expect(gleich.scale).toBeCloseTo(fest.scale, 9);
  });

  /**
   * Hier stand bis zum 12.08. „fuellt den 21:9-Schirm ohne Raender" -- und
   * genau das war die Luege: Der Server schneidet Entitaeten bei 848 Einheiten
   * ab, der randlose 21:9-Ausschnitt zeigte 924. In den aeusseren 76 Einheiten
   * je Seite wurden Raster und Waende gezeichnet, aber nie ein Tank, eine
   * Kugel oder eine Form. Der Balken ist die ehrlichere Antwort.
   */
  it('nutzt vom 21:9-Schirm so viel, wie der Server deckt -- und nicht mehr', () => {
    const { rect, world } = computeViewport(2560, 1080, 'flaechengleich');
    const grenzen = viewportLimits();
    expect(world.width / 2).toBeLessThanOrEqual(grenzen.serverEntitaetBreite);
    expect(world.height / 2).toBeLessThanOrEqual(grenzen.serverEntitaetHoehe);
    // Deutlich mehr als „Fest 16:9", nur eben nicht randlos.
    expect(rect.width).toBeGreaterThan(computeViewport(2560, 1080, 'fest').rect.width);
    expect(rect.x).toBeGreaterThan(0);
  });

  it('hält die sichtbare Weltfläche über alle Seitenverhältnisse konstant', () => {
    for (const [sw, sh] of [[1920, 1080], [2560, 1080], [3440, 1440], [1280, 1024], [1920, 1200], [1024, 768]]) {
      const { world } = computeViewport(sw!, sh!, 'flaechengleich');
      expect(world.width * world.height).toBeCloseTo(VIEW_AREA, 3);
    }
  });

  it('tauscht Breite gegen Höhe, statt einfach mehr zu zeigen', () => {
    const breit = computeViewport(2560, 1080, 'flaechengleich').world;
    expect(breit.width).toBeGreaterThan(GAME.visibleWorldWidth);
    expect(breit.height).toBeLessThan(GAME.visibleWorldHeight);
    // +6 % zur Seite kosten −6 % nach oben und unten. (Vor dem 12.08. waren es
    // +15 %/−13 % -- so weit deckt der Server die Sicht aber nicht.)
    expect(breit.width / GAME.visibleWorldWidth).toBeCloseTo(1.06, 2);
    expect(breit.height / GAME.visibleWorldHeight).toBeCloseTo(0.945, 2);
  });

  it('lässt auf extremen Formaten wieder Ränder stehen', () => {
    // 32:9 liegt jenseits der Grenze – dort ist ein schmaler Balken richtig,
    // weil der Server nicht weiter liefert.
    const { rect } = computeViewport(3840, 1080, 'flaechengleich');
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.width).toBe(Math.floor(1080 * MAX_ASPECT));
  });
});

describe('Grenzen gegen die Sichtweite des Servers', () => {
  // Sieht der Client weiter als der Server liefert, tauchen Wände am Bildrand
  // aus dem Nichts auf. Diese Tests rechnen den Abstand aus – wenn 02 an den
  // Cull-Konstanten dreht, fällt es hier auf und nicht erst im Spiel.
  const grenzen = viewportLimits();

  it('bleibt seitlich innerhalb des Wand-Ausschnitts', () => {
    expect(grenzen.halbeBreite).toBeLessThan(grenzen.serverWandBreite);
    // Mit spürbarem Abstand, nicht auf Kante.
    expect(grenzen.serverWandBreite - grenzen.halbeBreite).toBeGreaterThan(40);
  });

  it('bleibt senkrecht innerhalb des Wand-Ausschnitts', () => {
    expect(grenzen.halbeHoehe).toBeLessThan(grenzen.serverWandHoehe);
    expect(grenzen.serverWandHoehe - grenzen.halbeHoehe).toBeGreaterThan(40);
  });

  it('bleibt in der Ecke innerhalb des Sichtradius', () => {
    expect(grenzen.halbeDiagonale).toBeLessThan(grenzen.serverRadius);
  });

  /**
   * Die Grenze, die wirklich gilt. Die drei Tests darueber pruefen gegen
   * `wallsInView` und `viewRadius` -- beides Regeln der BASIS, die
   * `hardenSimulation` ersetzt hat. Genau dadurch blieb der Fehler unsichtbar:
   * Der Client mass sich an einer Regel, die nicht mehr laeuft.
   */
  it('zeigt nie mehr Welt, als der Server an Entitaeten liefert', () => {
    // Ueber die ganze Spanne, nicht nur an den Ecken.
    for (let aspect = 0.4; aspect <= 4; aspect += 0.05) {
      const welt = worldViewFor(aspect);
      expect(welt.width / 2).toBeLessThanOrEqual(grenzen.serverEntitaetBreite);
      expect(welt.height / 2).toBeLessThanOrEqual(grenzen.serverEntitaetHoehe);
    }
  });

  it('klemmt Ultrawide bewusst, statt ein leeres Band zu zeigen', () => {
    // 21:9 (2,370) und 3440x1440 (2,389) liegen jenseits der Grenze und werden
    // geklemmt -- das ist der Preis dafuer, dass im Bild auch etwas passiert.
    expect(2560 / 1080).toBeGreaterThan(MAX_ASPECT);
    expect(worldViewFor(2560 / 1080)).toEqual(worldViewFor(MAX_ASPECT));
  });

  it('klemmt Ausreißer und fällt bei Unsinn auf 16:9 zurück', () => {
    // Zu schmal oder zu breit wird geklemmt …
    expect(worldViewFor(0.5)).toEqual(worldViewFor(MIN_ASPECT));
    expect(worldViewFor(99)).toEqual(worldViewFor(MAX_ASPECT));
    // … eine Null oder ein NaN ist dagegen kein Seitenverhältnis, sondern ein
    // Fehler weiter oben. Dann gilt der bekannte Ausschnitt, kein Ratewert.
    expect(worldViewFor(0).width).toBeCloseTo(GAME.visibleWorldWidth, 6);
    expect(worldViewFor(Number.NaN).width).toBeCloseTo(GAME.visibleWorldWidth, 6);
  });
});

describe('Gespeicherte Wahl', () => {
  it('bleibt ohne Wahl beim bisherigen Zustand', () => {
    expect(readViewMode(null)).toBe('fest');
    expect(readViewMode('irgendwas')).toBe('fest');
  });

  it('liest eine getroffene Wahl zurück', () => {
    expect(readViewMode('flaechengleich')).toBe('flaechengleich');
    expect(readViewMode('fest')).toBe('fest');
  });
});
