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

describe('Rumpf: eine Base je Familie', () => {
  /*
   * Dritte Fassung dieser Regel, jede mit ihrem Anlass:
   *
   * 1. 67 eigene Silhouetten – von Sam dreimal abgelehnt.
   * 2. Für alle derselbe Kreis (Sam: „alle als Kreis wie bei Diep") – näher am
   *    Vorbild, aber die neun Familien wurden ununterscheidbar.
   * 3. Der finale Klassenauftrag, Abschnitt 3: **eine Base je Familie, von
   *    allen Unterklassen geerbt.** Das ist dort ein Abnahmekriterium.
   */
  it('gibt jeder Unterklasse exakt die Base ihrer Familie', () => {
    const jeFamilie = new Map<string, string>();
    for (const id of PLAYER_CLASS_IDS) {
      if (id === 'smasher') continue;
      const familie = CLASS_DEFINITIONS[id].branch;
      const form = JSON.stringify(hullGeometry(id));
      const bekannt = jeFamilie.get(familie);
      if (bekannt) expect(form, `${id} weicht von seiner Familie ${familie} ab`).toBe(bekannt);
      else jeFamilie.set(familie, form);
    }
    expect(jeFamilie.size).toBe(9);
  });

  it('gibt keinen zwei Familien dieselbe Base', () => {
    const formen = new Map<string, string>();
    const doppelt: string[] = [];
    for (const [familie, form] of Object.entries(
      Object.fromEntries(PLAYER_CLASS_IDS.filter((id) => id !== 'smasher')
        .map((id) => [CLASS_DEFINITIONS[id].branch, JSON.stringify(hullGeometry(id))]))
    )) {
      const vorher = formen.get(form);
      if (vorher) doppelt.push(`${vorher} = ${familie}`);
      else formen.set(form, familie);
    }
    // core, control und tempest teilen sich bewusst den reinen Kreis als
    // Grundform; tempest trägt zusätzlich seine vier Reaktorbögen. Der Auftrag
    // sagt dazu ausdrücklich: CONTROL unterscheidet sich nicht durch den Rumpf,
    // sondern durch seine Spawner.
    expect(doppelt).toEqual(['core = control']);
  });

  it('zeichnet den Körper in der Größenordnung des Trefferradius', () => {
    for (const id of PLAYER_CLASS_IDS) {
      for (const op of hullGeometry(id)) {
        if (op.kind !== 'poly') continue;
        for (let i = 0; i < op.points.length; i += 2) {
          const abstand = Math.hypot(op.points[i]!, op.points[i + 1]!);
          expect(abstand, `${id} Rumpfpunkt ${abstand.toFixed(1)} px`).toBeLessThan(GAME.playerRadius * 1.5);
        }
      }
    }
  });

  it('gibt der Smasher-Linie einen eigenen Körper – sie hat kein Rohr', () => {
    expect(CLASS_DEFINITIONS.smasher.barrelCount).toBe(0);
    expect(laeufeVon('smasher')).toHaveLength(0);
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
