import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS } from './index';
import { hullGeometry } from './appearance';
import { laeufeVon } from './barrels';

/**
 * **Der Blindtest aus dem MASTERPLAN – zum ersten Mal automatisch.**
 *
 * Er stand seit jeher als Grundsatz da („kann man zwei Klassen ohne Namen
 * auseinanderhalten?"), aber es gab keinen einzigen Test dafür. Genau deshalb
 * konnten 46 von 67 Klassen mit exakt einem Rohr durchs Raster fallen, während
 * der Rumpf mit 160 Panzerplatten überladen wurde.
 *
 * Seit dem 16.08. ist die Rollenverteilung wie im Vorbild: Der Rumpf ist für
 * alle derselbe Kreis, die Unterscheidbarkeit liegt in den Rohren. Diese Datei
 * hält beide Hälften dieser Entscheidung fest.
 */

/** Die Rohr-Silhouette als Zeichenkette – zwei gleiche heißen: nicht unterscheidbar. */
const silhouette = (id: (typeof PLAYER_CLASS_IDS)[number]): string =>
  laeufeVon(id)
    .map((l) => [l.art, l.winkel, l.versatz, l.start, l.muendung, l.breite, l.muendungsbreite]
      .map((wert) => (typeof wert === 'number' ? wert.toFixed(2) : wert)).join('|'))
    .join(';');

describe('Rumpf', () => {
  it('ist für jede Klasse derselbe Kreis – außer der Smasher-Linie', () => {
    const kreis = JSON.stringify(hullGeometry('core'));
    for (const id of PLAYER_CLASS_IDS) {
      if (id === 'smasher') continue;
      expect(JSON.stringify(hullGeometry(id)), id).toBe(kreis);
    }
  });

  it('zeichnet den Körper genau so groß, wie er getroffen wird', () => {
    // Vorher lag der gezeichnete Radius je Klasse zwischen 20 und 24 px,
    // während die Trefferabfrage immer mit GAME.playerRadius rechnete.
    const [op] = hullGeometry('core');
    expect(op).toMatchObject({ kind: 'circle', r: GAME.playerRadius });
  });

  it('gibt der Smasher-Linie einen eigenen Körper – sie hat kein Rohr', () => {
    expect(CLASS_DEFINITIONS.smasher.barrelCount).toBe(0);
    expect(laeufeVon('smasher')).toHaveLength(0);
    // Ohne Sonderform wäre sie ein merkmalsloser Kreis ohne jedes Rohr.
    expect(JSON.stringify(hullGeometry('smasher'))).not.toBe(JSON.stringify(hullGeometry('core')));
  });
});

describe('Blindtest: die Rohre tragen die Identität', () => {
  it('gibt keine zwei Klassen dieselbe Rohr-Silhouette', () => {
    const gesehen = new Map<string, string>();
    const doppelt: string[] = [];
    for (const id of PLAYER_CLASS_IDS) {
      // Smasher hat kein Rohr und unterscheidet sich über den Körper.
      if (id === 'smasher') continue;
      const form = silhouette(id);
      const vorher = gesehen.get(form);
      if (vorher) doppelt.push(`${vorher} = ${id}`);
      else gesehen.set(form, id);
    }
    expect(doppelt, `nicht unterscheidbar: ${doppelt.join(', ')}`).toEqual([]);
  });

  it('lässt keine Klasse ohne sichtbares Rohr stehen', () => {
    for (const id of PLAYER_CLASS_IDS) {
      if (id === 'smasher') continue;
      expect(laeufeVon(id).length, id).toBeGreaterThan(0);
    }
  });

  it('gibt jeder Drohnenklasse ihre Launcher – sie feuern nicht, sie zeigen', () => {
    // Alle zehn standen auf barrelCount 0 und zeichneten damit gar kein Rohr.
    for (const id of PLAYER_CLASS_IDS) {
      const tank = CLASS_DEFINITIONS[id];
      if (tank.droneCount <= 0) continue;
      const starter = laeufeVon(id).filter((l) => l.art === 'starter');
      expect(starter.length, id).toBeGreaterThan(0);
      expect(tank.barrelCount, `${id} darf als Drohnenklasse nicht feuern`).toBe(0);
    }
  });
});
