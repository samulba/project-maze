import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { droneArchetypes } from './drone-tuning';

/**
 * Drei der zehn Drohnenklassen hatten keinen eigenen Eintrag und fielen still
 * auf den Starter zurueck -- ueber zwei Ausbaustufen hinweg, ohne Warnung und
 * ohne Test. Sichtbar war es nur an der Klassenbeschreibung, die dann nicht
 * mehr stimmte: „Drei schwere Waechter statt eines Schwarms" (sentinel) ergab
 * 3 x 36 = 108 Flotten-HP, weniger als jede andere Klasse derselben Stufe.
 *
 * Deshalb steht hier keine Werteliste, sondern die Regel: Wer Drohnen hat,
 * hat einen eigenen Koerper. Die naechste neue Drohnenklasse faellt hier auf,
 * bevor sie jemand spielt.
 */

const drohnenklassen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].droneCount > 0);

describe('Drohnen-Koerper', () => {
  it('gibt jeder Drohnenklasse einen eigenen', () => {
    const tabelle = droneArchetypes();
    const ohne = drohnenklassen.filter((id) => tabelle[id] === undefined);
    expect(ohne).toEqual([]);
  });

  it('laesst keine zwei Klassen mit exakt demselben Koerper laufen', () => {
    const tabelle = droneArchetypes();
    const gesehen = new Map<string, string>();
    const doppelt: string[] = [];
    for (const id of drohnenklassen) {
      const koerper = JSON.stringify(tabelle[id]);
      const zuvor = gesehen.get(koerper);
      if (zuvor) doppelt.push(`${zuvor} == ${id}`);
      else gesehen.set(koerper, id);
    }
    expect(doppelt).toEqual([]);
  });

  /**
   * Die Flotte ist das, was ein Controller wirklich aufs Feld bringt. Ohne
   * eine Untergrenze kann eine Klasse mit wenigen, angeblich schweren Drohnen
   * unter der Startklasse landen -- genau das war bei sentinel der Fall.
   */
  it('laesst keine spaetere Klasse unter der Flotte der Startklasse bleiben', () => {
    const tabelle = droneArchetypes();
    const flotte = (id: (typeof drohnenklassen)[number]): number =>
      CLASS_DEFINITIONS[id].droneCount * (tabelle[id]?.health ?? 0);
    const start = flotte('drone');
    const schwaecher = drohnenklassen
      .filter((id) => id !== 'drone' && CLASS_DEFINITIONS[id].unlockLevel > CLASS_DEFINITIONS.drone.unlockLevel)
      .filter((id) => flotte(id) < start);
    expect(schwaecher).toEqual([]);
  });
});
