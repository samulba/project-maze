import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS } from './index.js';
import { laeufe, laufwinkel, muendungsabstand, projektilStart } from './barrels.js';

/**
 * Lauf-Geometrie – Sams Spieltest vom 14.08., Punkt 6.
 *
 * Hier steht keine Werteliste, sondern die Regel: **Was gezeichnet wird, ist
 * das, woraus geschossen wird.** Vor dieser Datei rechneten Server, Renderer
 * und Wahlkarten-Vorschau die Lauf-Geometrie dreimal getrennt – der Renderer
 * sogar mit einem völlig anderen Layout (parallele Balken statt Winkelfächer).
 */

const mitRohr = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].barrelCount > 0);

describe('Lauf-Geometrie', () => {
  it('gibt jeder Klasse mit Rohr genau so viele Läufe, wie sie Schüsse abgibt', () => {
    for (const id of mitRohr) {
      expect(laeufe(CLASS_DEFINITIONS[id]).length, id).toBe(CLASS_DEFINITIONS[id].barrelCount);
    }
  });

  it('gibt rohrlosen Klassen keinen Lauf', () => {
    for (const id of PLAYER_CLASS_IDS.filter((klasse) => CLASS_DEFINITIONS[klasse].barrelCount === 0)) {
      expect(laeufe(CLASS_DEFINITIONS[id]), id).toEqual([]);
    }
  });

  /**
   * Die Rangfolge `barrels` → `barrelAngles` → Fächer ist die des Servers.
   * Weicht `laeufe` davon ab, zeigt der Renderer wieder etwas anderes, als
   * geschossen wird – genau Sams Befund.
   */
  it('zeichnet jeden Lauf unter dem Winkel, unter dem er feuert', () => {
    for (const id of mitRohr) {
      const definition = CLASS_DEFINITIONS[id];
      const gezeichnet = laeufe(definition).map((lauf) => lauf.winkel);
      const gefeuert = Array.from({ length: definition.barrelCount }, (_, index) => laufwinkel(definition, index));
      expect(gezeichnet, id).toEqual(gefeuert);
    }
  });

  /** Pro-Lauf-Profile (Storm & Co.) dürfen in der Zeichnung nicht verlorengehen. */
  it('übernimmt die Winkel der Pro-Lauf-Profile', () => {
    const storm = CLASS_DEFINITIONS.storm;
    expect(storm.barrels).toBeDefined();
    expect(laeufe(storm).map((lauf) => lauf.winkel)).toEqual(storm.barrels!.map((lauf) => lauf.angle));
  });

  /**
   * Der Kern des zweiten Teils von Sams Punkt: Die Kugel muss aus dem Rohr
   * kommen, nicht davor stehen. Ihr Mittelpunkt liegt also INNERHALB der
   * gezeichneten Röhre.
   */
  it('lässt jede Kugel im Rohr entstehen, nicht davor', () => {
    for (const id of mitRohr) {
      const definition = CLASS_DEFINITIONS[id];
      const start = projektilStart(definition, definition.projectileRadius);
      expect(start, `${id} entsteht vor der Mündung`).toBeLessThanOrEqual(muendungsabstand(definition));
      expect(start, `${id} entsteht im eigenen Rumpf`).toBeGreaterThan(GAME.playerRadius * 0.7);
    }
  });

  /**
   * Auch mit der größten Kugel, die das Spiel kennt (der Radius wächst mit dem
   * Level und ist bei `GAME.playerRadius` gedeckelt), darf keine Kugel im
   * eigenen Rumpf erscheinen.
   */
  it('hält den Spawn auch bei der dicksten Kugel außerhalb des Rumpfkerns', () => {
    for (const id of mitRohr) {
      const start = projektilStart(CLASS_DEFINITIONS[id], GAME.playerRadius);
      expect(start, id).toBeGreaterThanOrEqual(GAME.playerRadius * 0.75);
    }
  });

  it('lässt das Rohr dort enden, wo die Kugel herauskommt', () => {
    expect(muendungsabstand(CLASS_DEFINITIONS.core)).toBe(GAME.playerRadius + CLASS_DEFINITIONS.core.barrelLength);
  });
});
