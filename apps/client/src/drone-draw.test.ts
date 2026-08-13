import { describe, expect, it } from 'vitest';
import {
  BOGEN_START,
  LEBENSBOGEN_AB,
  drohnenWinkel,
  zeichneDrohnen,
  type DrohnenBild,
  type Zeichenflaeche
} from './drone-draw';

/**
 * Eine Zeichenfläche, die mitschreibt statt zu zeichnen.
 *
 * `moveTo`/`lineTo`/`arc` merken sich, wo ein Pfad ANFÄNGT – genau die Frage,
 * an der der Strich-Bug hing.
 */
interface Schritt {
  art: 'moveTo' | 'lineTo' | 'arc' | 'poly' | 'fill' | 'stroke';
  /** Erster berührter Punkt des Schritts, soweit einer entsteht. */
  punkt?: { x: number; y: number };
}

class Mitschrift implements Zeichenflaeche {
  readonly schritte: Schritt[] = [];
  moveTo(x: number, y: number): this { this.schritte.push({ art: 'moveTo', punkt: { x, y } }); return this; }
  lineTo(x: number, y: number): this { this.schritte.push({ art: 'lineTo', punkt: { x, y } }); return this; }
  arc(x: number, y: number, radius: number, von: number): this {
    // Der Bogen beginnt dort, wo Pixi ihn ansetzt: auf dem Kreis beim Startwinkel.
    this.schritte.push({ art: 'arc', punkt: { x: x + Math.cos(von) * radius, y: y + Math.sin(von) * radius } });
    return this;
  }
  poly(punkte: number[]): this {
    this.schritte.push({ art: 'poly', punkt: { x: punkte[0] ?? 0, y: punkte[1] ?? 0 } });
    return this;
  }
  fill(): this { this.schritte.push({ art: 'fill' }); return this; }
  stroke(): this { this.schritte.push({ art: 'stroke' }); return this; }
}

const drohne = (overrides: Partial<DrohnenBild> = {}): DrohnenBild => ({
  position: { x: 4500, y: 3000 },
  velocity: { x: 0, y: 0 },
  angle: 0,
  radius: 13,
  health: 40,
  maxHealth: 40,
  color: 0x5c8b84,
  ...overrides
});

describe('Drohnen zeichnen – kein Pfad beginnt außerhalb seiner Drohne (Sams Strich-Bug)', () => {
  /**
   * DIE Regel dieses Moduls. Sie ist bewusst allgemein formuliert statt auf
   * den Lebensbogen gemünzt: Jeder künftige nackte `arc()` fällt genauso auf,
   * ohne dass jemand den Pixi-Mechanismus noch einmal herleiten muss.
   */
  const pruefeAlleAnfaenge = (mitschrift: Mitschrift, bilder: DrohnenBild[], spielraum = 40): void => {
    for (const schritt of mitschrift.schritte) {
      if (!schritt.punkt) continue;
      const naechste = Math.min(
        ...bilder.map((bild) => Math.hypot(schritt.punkt!.x - bild.position.x, schritt.punkt!.y - bild.position.y))
      );
      expect(
        naechste,
        `${schritt.art} beginnt bei (${schritt.punkt.x}, ${schritt.punkt.y}) – ${Math.round(naechste)} px von jeder Drohne entfernt`
      ).toBeLessThanOrEqual(spielraum);
    }
  };

  it('hält jeden Pfadanfang an der eigenen Drohne – auch beim Lebensbogen', () => {
    // Genau Sams Fall: angeschlagene Drohne, weit weg vom Weltursprung.
    const bilder = [drohne({ health: 8, maxHealth: 40 })];
    const mitschrift = new Mitschrift();
    zeichneDrohnen(mitschrift, bilder);
    expect(mitschrift.schritte.some((s) => s.art === 'arc')).toBe(true);
    pruefeAlleAnfaenge(mitschrift, bilder);
  });

  it('eröffnet den Bogen mit einem moveTo auf denselben Punkt, an dem er ansetzt', () => {
    // Der Kern des Fixes: Startpunkt und Anfangswinkel MÜSSEN übereinstimmen.
    // Zwei getrennte Zahlen wären der Weg, auf dem der Strich als Stummel
    // zurückkommt – deshalb prüft der Test die Deckung, nicht bloß die Existenz.
    const bild = drohne({ health: 4, maxHealth: 40, radius: 15 });
    const mitschrift = new Mitschrift();
    zeichneDrohnen(mitschrift, [bild]);
    const bogenIndex = mitschrift.schritte.findIndex((s) => s.art === 'arc');
    const davor = mitschrift.schritte[bogenIndex - 1];
    expect(davor?.art).toBe('moveTo');
    expect(davor?.punkt?.x).toBeCloseTo(mitschrift.schritte[bogenIndex]!.punkt!.x, 6);
    expect(davor?.punkt?.y).toBeCloseTo(mitschrift.schritte[bogenIndex]!.punkt!.y, 6);
    // Und er sitzt oben auf dem Bogenring.
    expect(davor?.punkt?.x).toBeCloseTo(bild.position.x + Math.cos(BOGEN_START) * (bild.radius + 4), 6);
  });

  it('bleibt auch mit Spur, mehreren Drohnen und Weltrand-Nähe sauber', () => {
    const bilder = [
      drohne({ position: { x: 60, y: 40 }, velocity: { x: 300, y: 0 }, health: 5, maxHealth: 40 }),
      drohne({ position: { x: 8900, y: 5900 }, velocity: { x: -120, y: -200 }, health: 39, maxHealth: 40 }),
      drohne({ position: { x: 4500, y: 3000 }, velocity: { x: 0, y: 0 }, health: 1, maxHealth: 40, radius: 7.5 })
    ];
    const mitschrift = new Mitschrift();
    zeichneDrohnen(mitschrift, bilder);
    pruefeAlleAnfaenge(mitschrift, bilder);
  });

  it('zeigt den Bogen erst ab 60 % Schaden und nie darüber', () => {
    const ohne = new Mitschrift();
    zeichneDrohnen(ohne, [drohne({ health: 40, maxHealth: 40 })]);
    expect(ohne.schritte.some((s) => s.art === 'arc')).toBe(false);

    const knappDarunter = new Mitschrift();
    zeichneDrohnen(knappDarunter, [drohne({ health: LEBENSBOGEN_AB * 40 - 0.01, maxHealth: 40 })]);
    expect(knappDarunter.schritte.some((s) => s.art === 'arc')).toBe(true);
  });
});

describe('drohnenWinkel', () => {
  it('nimmt die Flugrichtung, wenn die Drohne fliegt', () => {
    expect(drohnenWinkel({ velocity: { x: 0, y: 100 }, angle: 3 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('behandelt „exakt nach rechts" als Richtung, nicht als Fehlwert', () => {
    // Der alte Code nahm `||` – und Math.atan2(0, 200) ist 0, also falsy.
    // Eine nach rechts fliegende Drohne zeigte damit in die Snapshot-Richtung.
    expect(drohnenWinkel({ velocity: { x: 200, y: 0 }, angle: 2.5 })).toBe(0);
  });

  it('fällt im Stillstand auf den Snapshot-Winkel zurück', () => {
    expect(drohnenWinkel({ velocity: { x: 0, y: 0 }, angle: 2.5 })).toBe(2.5);
  });
});
