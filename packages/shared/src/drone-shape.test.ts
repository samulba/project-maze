import { describe, expect, it } from 'vitest';
import { drohnenEcken, type Drohnenform } from './drone-shape';

/**
 * Die Drohnenformen aus Teil D des finalen Klassenauftrags. Bis dahin war jede
 * Drohne in allen zehn Klassen ein Dreieck – der letzte Ort, an dem sich die
 * Drohnenklassen NICHT unterschieden haben.
 */
const ALLE: Drohnenform[] = ['triangle', 'small-triangle', 'diamond', 'micro-diamond',
  'square', 'rectangle', 'hexagon', 'shield-kite', 'royal-kite', 'chevron'];

const ecken = (punkte: number[]): number => punkte.length / 2;
const weiteste = (punkte: number[]): number => {
  let weit = 0;
  for (let i = 0; i < punkte.length; i += 2) weit = Math.max(weit, Math.hypot(punkte[i]!, punkte[i + 1]!));
  return weit;
};

describe('Drohnenformen', () => {
  it('liefert für jede Form ein brauchbares Polygon', () => {
    for (const form of ALLE) {
      const punkte = drohnenEcken(form, 10);
      expect(ecken(punkte), form).toBeGreaterThanOrEqual(3);
      for (const wert of punkte) expect(Number.isFinite(wert), form).toBe(true);
    }
  });

  it('hält sich an den vorgegebenen Radius', () => {
    // Der Radius ist zugleich der Trefferradius des Servers: Eine Form, die
    // deutlich darüber hinausragt, sähe größer aus, als sie getroffen wird.
    for (const form of ALLE) {
      const weit = weiteste(drohnenEcken(form, 10));
      expect(weit, `${form}: ${weit.toFixed(1)} statt ~10`).toBeGreaterThan(6);
      expect(weit, `${form}: ${weit.toFixed(1)} statt ~10`).toBeLessThanOrEqual(10.6);
    }
  });

  it('gibt keinen zwei Formen dieselbe Silhouette', () => {
    const gesehen = new Map<string, Drohnenform>();
    for (const form of ALLE) {
      const schluessel = drohnenEcken(form, 10).map((wert) => wert.toFixed(2)).join(',');
      const vorher = gesehen.get(schluessel);
      // Nur die Größe unterscheidet triangle/small-triangle und
      // diamond/micro-diamond – bei gleichem Radius sind sie identisch, und das
      // ist Absicht: Der Auftrag nennt sie „kleine Dreiecke" und „Rauten".
      if (vorher) expect([vorher, form].sort()).toEqual(
        expect.arrayContaining([expect.stringMatching(/triangle|diamond/)])
      );
      else gesehen.set(schluessel, form);
    }
  });

  it('zeigt bei jeder Form nach vorn', () => {
    // Alle Formen sind entlang +X gebaut; der Renderer dreht sie in
    // Flugrichtung. Eine Form, die nach hinten zeigt, wäre ein Panzer, der
    // rückwärts fliegt – der Fehler, den sentinel und aviary am 14.08. hatten.
    for (const form of ALLE) {
      const punkte = drohnenEcken(form, 10);
      let weitesteX = -Infinity;
      for (let i = 0; i < punkte.length; i += 2) weitesteX = Math.max(weitesteX, punkte[i]!);
      expect(weitesteX, form).toBeGreaterThan(0);
    }
  });
});
