import { describe, expect, it } from 'vitest';
import { Koerperraster, SpatialHash, projectileSubstepCount, resolveProjectilePair } from './physics';

describe('projectile collision and spatial queries', () => {
  it('destroys equally strong bullets', () => {
    const a = { damage: 20, integrity: 20 };
    const b = { damage: 20, integrity: 20 };
    resolveProjectilePair(a, b);
    expect(a.integrity).toBe(0);
    expect(b.integrity).toBe(0);
  });

  it('allows a stronger projectile to continue weakened', () => {
    const strong = { damage: 30, integrity: 46 };
    const weak = { damage: 14, integrity: 14 };
    resolveProjectilePair(strong, weak);
    expect(strong.integrity).toBe(32);
    expect(weak.integrity).toBe(-16);
  });

  it('substeps fast projectiles to reduce tunneling', () => {
    expect(projectileSubstepCount(1600, 1 / 40, 10)).toBe(4);
    expect(projectileSubstepCount(0, 1 / 40, 10)).toBe(1);
    expect(projectileSubstepCount(100000, 1, 1)).toBe(12);
  });

  it('returns entities from nearby spatial cells', () => {
    const hash = new SpatialHash<{ id: string; position: { x: number; y: number } }>(100);
    hash.rebuild([
      { id: 'near', position: { x: 50, y: 50 } },
      { id: 'far', position: { x: 1000, y: 1000 } }
    ]);
    expect(hash.query({ x: 60, y: 60 }, 30).map((value) => value.id)).toEqual(['near']);
  });
});

/**
 * Das Körperraster – Sams „ULTRA LAGGY" vom 14.08.
 *
 * Ein Grobraster ist eine Abkürzung, und eine Abkürzung ist nur so viel wert
 * wie der Beweis, dass sie dasselbe Ergebnis liefert. Deshalb prüft dieser
 * Block nicht, ob es SCHNELLER ist (das misst `perf`), sondern ob es
 * ANTWORTET WIE DER LINEARE DURCHLAUF – gegen eine Streuung aus Zufallszahlen,
 * bei der die Fallen wirklich vorkommen: große Körper in der Nachbarzelle,
 * Körper genau auf der Zellgrenze, negative Koordinaten.
 */
describe('Koerperraster', () => {
  interface Ball { position: { x: number; y: number }; radius: number; id: number }
  const streuung = (anzahl: number, saat: number): Ball[] => {
    let zustand = saat >>> 0;
    const zufall = (): number => { zustand = (zustand * 1664525 + 1013904223) >>> 0; return zustand / 0x100000000; };
    return Array.from({ length: anzahl }, (_wert, id) => ({
      id,
      position: { x: (zufall() - 0.2) * 2000, y: (zufall() - 0.2) * 1400 },
      radius: 4 + zufall() * 30
    }));
  };
  const linear = (koerper: Ball[], punkt: { x: number; y: number }, radius: number): Ball | undefined =>
    koerper.find((kandidat) => {
      const dx = kandidat.position.x - punkt.x;
      const dy = kandidat.position.y - punkt.y;
      return dx * dx + dy * dy <= Math.pow(kandidat.radius + radius, 2);
    });

  it('findet dieselben Berührungen wie ein linearer Durchlauf', () => {
    const koerper = streuung(400, 7);
    const raster = new Koerperraster<Ball>(() => koerper, (ball) => ball.radius, () => 1);
    let geprueft = 0;
    for (let x = -400; x <= 1700; x += 37) {
      for (let y = -300; y <= 1200; y += 41) {
        const erwartet = linear(koerper, { x, y }, 9);
        const gefunden = raster.finde({ x, y }, 9);
        // Bei Mehrfachtreffern darf die Reihenfolge abweichen – „getroffen
        // oder nicht" darf es nie.
        expect(Boolean(gefunden)).toBe(Boolean(erwartet));
        if (gefunden) expect(linear([gefunden], { x, y }, 9)).toBeDefined();
        geprueft += 1;
      }
    }
    expect(geprueft).toBeGreaterThan(2000);
  });

  it('übersieht keine große Form in der Nachbarzelle', () => {
    // Genau der Fehler, den ein Raster ohne mitgeführten Größtradius macht:
    // Der Mittelpunkt liegt eine Zelle weiter, der Körper ragt herein.
    const riese: Ball = { id: 0, position: { x: 200, y: 0 }, radius: 90 };
    const raster = new Koerperraster<Ball>(() => [riese], (ball) => ball.radius, () => 1, 64);
    expect(raster.finde({ x: 120, y: 0 }, 5)).toBe(riese);
    expect(raster.finde({ x: 60, y: 0 }, 5)).toBeUndefined();
  });

  it('achtet den Filter und liefert nur passende Körper', () => {
    const koerper = streuung(120, 3);
    const raster = new Koerperraster<Ball>(() => koerper, (ball) => ball.radius, () => 1);
    for (const ball of koerper) {
      const fremd = raster.finde(ball.position, 1, (kandidat) => kandidat.id !== ball.id);
      if (fremd) expect(fremd.id).not.toBe(ball.id);
    }
  });

  it('baut sich neu, sobald der Stand weiterzählt – und nicht öfter', () => {
    const koerper: Ball[] = [{ id: 0, position: { x: 0, y: 0 }, radius: 10 }];
    let stand = 1;
    let aufbauten = 0;
    const raster = new Koerperraster<Ball>(() => { aufbauten += 1; return koerper; }, (ball) => ball.radius, () => stand);
    raster.finde({ x: 0, y: 0 }, 1);
    raster.finde({ x: 0, y: 0 }, 1);
    expect(aufbauten).toBe(1);
    // Bewegung OHNE neuen Stand bleibt unsichtbar – genau deshalb hängt der
    // Aufbau am Tick und nicht an der Uhr.
    koerper[0]!.position = { x: 900, y: 900 };
    expect(raster.finde({ x: 900, y: 900 }, 1)).toBeUndefined();
    stand = 2;
    expect(raster.finde({ x: 900, y: 900 }, 1)).toBe(koerper[0]);
    expect(aufbauten).toBe(2);
  });

  it('sieht die Bewegung sofort, wenn das Raster entwertet wird', () => {
    const koerper: Ball[] = [{ id: 0, position: { x: 0, y: 0 }, radius: 10 }];
    const raster = new Koerperraster<Ball>(() => koerper, (ball) => ball.radius, () => 1);
    raster.finde({ x: 0, y: 0 }, 1);
    koerper[0]!.position = { x: 500, y: 500 };
    raster.entwerten();
    expect(raster.finde({ x: 500, y: 500 }, 1)).toBe(koerper[0]);
  });
});
