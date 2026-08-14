import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS, availableClassChoices } from '@project-maze/shared';
import { FAMILIES, buildWheel, familyInfo, leadsTo, pathTo, reachableFrom, ringOf } from './class-tree';

/**
 * Das Rad wird gerechnet, nicht gezeichnet – deshalb lässt sich prüfen, ob
 * jede Klasse an der richtigen Stelle steht, ohne ein Bild anzusehen. Genau
 * das ist der Punkt: 29 Knoten von Hand nachzuzählen macht niemand zweimal.
 */

const rad = buildWheel();
const nach = new Map(rad.map((knoten) => [knoten.id, knoten]));

describe('Aufbau des Rades', () => {
  it('nimmt jede Klasse genau einmal auf', () => {
    expect(rad).toHaveLength(PLAYER_CLASS_IDS.length);
    expect(new Set(rad.map((k) => k.id)).size).toBe(PLAYER_CLASS_IDS.length);
  });

  it('setzt Core in die Mitte', () => {
    expect(nach.get('core')?.ring).toBe(0);
    expect(rad.filter((k) => k.ring === 0)).toHaveLength(1);
  });

  it('verteilt die Klassen auf fuenf Ringe nach Freischalt-Level', () => {
    // Klassen 4.1: 8 Familien (L5), 24 Wege (L15), 24 Endklassen (L28),
    // 8 Apex (L42) - je Familie einer. Klassen 4.2 Schritt 3 legt je einen
    // weiteren Weg (Trapper, L15) und eine weitere Endklasse (Smasher, L28)
    // dazu.
    const proRing = [0, 1, 2, 3, 4].map((ring) => rad.filter((k) => k.ring === ring).length);
    expect(proRing).toEqual([1, 8, 25, 25, 8]);
    for (const knoten of rad) expect(knoten.ring).toBe(ringOf(knoten.unlockLevel));
  });

  it('stellt die acht Familien gleichmäßig auf den Kreis', () => {
    const winkel = rad.filter((k) => k.ring === 1).map((k) => k.angle).sort((a, b) => a - b);
    expect(winkel).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  });

  it('hält jeden Zweig im Sektor seiner Familie', () => {
    // Ohne das läge ein Ring-3-Knoten irgendwann bei einer fremden Familie –
    // im Bild der Fehler, den man am spätesten bemerkt.
    for (const knoten of rad) {
      if (knoten.ring === 0) continue;
      const familie = rad.find((k) => k.ring === 1 && k.branch === knoten.branch);
      expect(familie).toBeDefined();
      // Ringabstand: über 0/360 hinweg richtig, nicht als reine Differenz.
      const abstand = Math.abs(((knoten.angle - familie!.angle + 540) % 360) - 180);
      expect(abstand).toBeLessThanOrEqual(45);
    }
  });

  it('führt jeden Ring-3-Knoten dicht an seinem Elternteil', () => {
    for (const knoten of rad.filter((k) => k.ring === 3)) {
      const eltern = nach.get(knoten.parent!);
      expect(eltern).toBeDefined();
      expect(Math.abs(knoten.angle - eltern!.angle)).toBeLessThan(12);
    }
  });

  it('trägt zu jeder Klasse ihre Kinder', () => {
    for (const knoten of rad) {
      const erwartet = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].parent === knoten.id);
      expect(knoten.children.sort()).toEqual([...erwartet].sort());
    }
  });
});

describe('Familien und ihre Signature', () => {
  it('erklärt jede Familie, die es im Baum gibt', () => {
    const zweige = new Set(rad.filter((k) => k.ring === 1).map((k) => k.branch));
    for (const zweig of zweige) expect(familyInfo(zweig)).not.toBeNull();
  });

  it('nennt zu jeder Familie Aufbau und Wirkung der Signature', () => {
    // Der Auftrag ist ausdrücklich: die Signature erklären, nicht den Baum
    // zeichnen. Ein leeres Feld hier wäre genau das Versäumnis.
    for (const familie of FAMILIES) {
      expect(familie.signature.length).toBeGreaterThan(3);
      expect(familie.builds.length).toBeGreaterThan(30);
      expect(familie.pays.length).toBeGreaterThan(30);
      expect(familie.style.length).toBeGreaterThan(30);
    }
  });

  it('kennt keine Familie, die es im Baum nicht gibt', () => {
    const zweige = new Set(PLAYER_CLASS_IDS.map((id) => CLASS_DEFINITIONS[id].branch));
    for (const familie of FAMILIES) expect(zweige).toContain(familie.branch);
  });
});

describe('Pfade', () => {
  it('führt vom Core bis zur Endklasse', () => {
    expect(pathTo('storm')).toEqual(['core', 'rapid', 'twin', 'storm']);
    expect(pathTo('comet')).toEqual(['core', 'rammer', 'blitz', 'comet']);
    expect(pathTo('core')).toEqual(['core']);
  });

  it('nennt, wohin eine Klasse führt', () => {
    expect(leadsTo('core')).toHaveLength(8);
    expect(leadsTo('twin')).toEqual(['Storm']);
    // Storm fuehrt seit Klassen 4.0 weiter: zum Familien-Apex Vortex.
    expect(leadsTo('storm')).toEqual(['Vortex']);
  });

  it('erkennt, was von der aktuellen Klasse aus noch erreichbar ist', () => {
    expect(reachableFrom('core', 'storm')).toBe(true);
    expect(reachableFrom('rapid', 'storm')).toBe(true);
    expect(reachableFrom('twin', 'storm')).toBe(true);
    // Ein Wechsel über die Familiengrenze gibt es nicht.
    expect(reachableFrom('twin', 'gatling')).toBe(false);
    expect(reachableFrom('sniper', 'storm')).toBe(false);
    expect(reachableFrom('storm', 'core')).toBe(false);
    // Der Familien-Apex ist aus jeder Klasse der Familie erreichbar, auch
    // seitlich vom eigenen Pfad -- Gatling liegt nicht auf dem Weg zu Vortex.
    expect(pathTo('vortex')).not.toContain('gatling');
    expect(reachableFrom('gatling', 'vortex')).toBe(true);
    // Der Apex einer FREMDEN Familie bleibt gesperrt.
    expect(reachableFrom('gatling', 'eclipse')).toBe(false);
  });

  /**
   * Die Wahrheit über Erreichbarkeit steht im Server (`availableClassChoices`).
   * Das Rad hatte seine eigene Fassung, und die war an 48 von 65 Klassen
   * strenger. Deshalb hier keine Handvoll Fälle mehr, sondern die vollständige
   * Gegenüberstellung: Was der Server auf Maximallevel zur Wahl stellt, muss
   * das Rad als erreichbar zeigen.
   */
  it('zeigt nichts als unerreichbar, was der Server zur Wahl stellt', () => {
    const abweichungen: string[] = [];
    for (const current of PLAYER_CLASS_IDS) {
      for (const ziel of availableClassChoices(current, GAME.maxLevel)) {
        if (!reachableFrom(current, ziel)) abweichungen.push(`${current} -> ${ziel}`);
      }
    }
    expect(abweichungen).toEqual([]);
  });
});
