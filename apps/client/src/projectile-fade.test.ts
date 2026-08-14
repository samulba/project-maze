import { describe, expect, it } from 'vitest';
import type { Wall } from '@project-maze/shared';
import {
  KUGEL_EINSCHLAG_SEKUNDEN,
  KUGEL_VERGLUEHEN_SEKUNDEN,
  MAX_VERGLIMMENDE,
  type VerglimmendeKugel,
  type Zeichenflaeche,
  stepVerglimmende,
  trifftWand,
  verglimmenLassen,
  zeichneVerglimmende
} from './projectile-fade';

/**
 * Sams Punkt 2 vom 14.08.: „KUGELN verschwinden zu ABRUPT, sollten cleaner
 * verschwinden, verblassen wenn die zu weit wegfliegen oder irgendwas hitten
 * wie die Wand z.B."
 *
 * Geprüft wird die Regel, nicht das Aussehen: Eine verschwundene Kugel ist noch
 * eine Weile da, sie wird dabei blasser, und die beiden Fälle, die Sam nennt,
 * verhalten sich unterschiedlich.
 */

const WAND: Wall = { id: 'w', x: 100, y: -50, width: 40, height: 100 };

const stand = (velocity = { x: 400, y: 0 }) => ({
  position: { x: 0, y: 0 },
  velocity,
  radius: 8,
  color: 0xffffff
});

/** Mitschreibende Senke – dieselbe Bauart wie in `drone-draw.test.ts`. */
function senke(): Zeichenflaeche & { fuellungen: Array<{ alpha: number; radius: number }> } {
  const fuellungen: Array<{ alpha: number; radius: number }> = [];
  let letzterRadius = 0;
  const flaeche: any = {
    circle(_x: number, _y: number, radius: number) { letzterRadius = radius; return flaeche; },
    fill(stil: any) { fuellungen.push({ alpha: stil.alpha, radius: letzterRadius }); return flaeche; },
    fuellungen
  };
  return flaeche;
}

describe('Wanderkennung', () => {
  it('erkennt eine Wand in Flugrichtung', () => {
    expect(trifftWand({ x: 80, y: 0 }, { x: 400, y: 0 }, 8, [WAND])).toBe(true);
  });

  it('erkennt keine Wand, die hinter der Kugel liegt', () => {
    expect(trifftWand({ x: 80, y: 0 }, { x: -400, y: 0 }, 8, [WAND])).toBe(false);
  });

  it('hält eine stehende Kugel für kein Einschlagopfer', () => {
    // Trapper-Fallen stehen still – ohne Flugrichtung gibt es keinen Vorlauf,
    // in dem eine Wand liegen könnte, und geraten wird nicht.
    expect(trifftWand({ x: 110, y: 0 }, { x: 0, y: 0 }, 8, [WAND])).toBe(false);
  });

  it('sieht ohne Wände nie einen Einschlag', () => {
    expect(trifftWand({ x: 80, y: 0 }, { x: 400, y: 0 }, 8, [])).toBe(false);
  });
});

describe('Ausblenden', () => {
  it('lässt eine verschwundene Kugel überhaupt weiterleben', () => {
    const liste: VerglimmendeKugel[] = [];
    verglimmenLassen(liste, stand(), false);
    expect(liste).toHaveLength(1);
    expect(liste[0]!.life).toBe(KUGEL_VERGLUEHEN_SEKUNDEN);
  });

  it('blendet einen Einschlag schneller aus als ein Reichweitenende', () => {
    const liste: VerglimmendeKugel[] = [];
    verglimmenLassen(liste, stand(), true);
    expect(liste[0]!.maxLife).toBe(KUGEL_EINSCHLAG_SEKUNDEN);
    expect(KUGEL_EINSCHLAG_SEKUNDEN).toBeLessThan(KUGEL_VERGLUEHEN_SEKUNDEN);
  });

  it('nimmt dem Einschlag die Bewegung, dem Reichweitenende nicht', () => {
    const einschlag: VerglimmendeKugel[] = [];
    const auslauf: VerglimmendeKugel[] = [];
    verglimmenLassen(einschlag, stand(), true);
    verglimmenLassen(auslauf, stand(), false);
    stepVerglimmende(einschlag, 0.05);
    stepVerglimmende(auslauf, 0.05);
    expect(einschlag[0]!.position.x).toBe(0);
    expect(auslauf[0]!.position.x).toBeGreaterThan(10);
  });

  it('lässt die ausfliegende Kugel dabei ausrollen', () => {
    const liste: VerglimmendeKugel[] = [];
    verglimmenLassen(liste, stand(), false);
    stepVerglimmende(liste, 0.05);
    expect(liste[0]!.velocity.x).toBeLessThan(400);
    expect(liste[0]!.velocity.x).toBeGreaterThan(0);
  });

  it('räumt abgelaufene Kugeln weg', () => {
    const liste: VerglimmendeKugel[] = [];
    verglimmenLassen(liste, stand(), false);
    stepVerglimmende(liste, KUGEL_VERGLUEHEN_SEKUNDEN + 0.01);
    expect(liste).toHaveLength(0);
  });

  it('deckelt die Liste, statt sie wachsen zu lassen', () => {
    const liste: VerglimmendeKugel[] = [];
    for (let index = 0; index < MAX_VERGLIMMENDE + 40; index += 1) verglimmenLassen(liste, stand(), false);
    expect(liste.length).toBe(MAX_VERGLIMMENDE);
  });

  /** Der eigentliche Punkt: Es ist ein Übergang, kein Verschwinden. */
  it('wird über die Zeit blasser', () => {
    const liste: VerglimmendeKugel[] = [];
    verglimmenLassen(liste, stand(), false);
    const frueh = senke();
    zeichneVerglimmende(frueh, liste);
    stepVerglimmende(liste, KUGEL_VERGLUEHEN_SEKUNDEN * 0.7);
    const spaet = senke();
    zeichneVerglimmende(spaet, liste);
    expect(frueh.fuellungen.length).toBeGreaterThan(0);
    expect(spaet.fuellungen.length).toBe(frueh.fuellungen.length);
    for (let index = 0; index < frueh.fuellungen.length; index += 1) {
      expect(spaet.fuellungen[index]!.alpha).toBeLessThan(frueh.fuellungen[index]!.alpha);
    }
  });

  it('zeichnet nichts für eine leere Liste', () => {
    const flaeche = senke();
    zeichneVerglimmende(flaeche, []);
    expect(flaeche.fuellungen).toHaveLength(0);
  });
});
