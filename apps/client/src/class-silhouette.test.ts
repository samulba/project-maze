import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { hullForms, hullStil, registriereSilhouetten, setHullStil, umrissKennung } from './class-hull';
import { BEISPIELE, MERKMALE, silhouette, stufeVon } from './class-silhouette';

/**
 * Die Formsprache hat drei Regeln, und jede davon ist hier eine Zusicherung.
 * Das ist der Unterschied zwischen einem System und 29 Einfällen: Beim System
 * kann man aufschreiben, was gelten soll, und es fällt auf, wenn es nicht mehr
 * gilt.
 */

registriereSilhouetten(silhouette);
beforeEach(() => setHullStil('klassisch'));

/** Der äußerste Punkt einer Klasse – ihr Platzbedarf im Bild. */
function weite(id: (typeof PLAYER_CLASS_IDS)[number]): number {
  let weit = 0;
  for (const form of silhouette(id)) {
    if (form.form !== 'zug') continue;
    for (let index = 0; index + 1 < form.punkte.length; index += 2) {
      weit = Math.max(weit, Math.hypot(form.punkte[index] ?? 0, form.punkte[index + 1] ?? 0));
    }
  }
  return weit;
}

describe('Der Schalter steht auf aus', () => {
  it('zeichnet ohne Zutun den heutigen Stand', () => {
    // Sams Freigabe steht aus. Bis dahin darf niemand die neue Formsprache zu
    // sehen bekommen, ohne sie ausdrücklich einzuschalten.
    expect(hullStil()).toBe('klassisch');
    expect(hullForms('rammer')[0]?.form).toBe('vieleck');
  });

  it('schaltet um, wenn man es verlangt – und wieder zurück', () => {
    setHullStil('silhouette');
    expect(hullForms('rammer')[0]?.form).toBe('zug');
    setHullStil('klassisch');
    expect(hullForms('rammer')[0]?.form).toBe('vieleck');
  });
});

describe('Regel 1: die Familie steckt im Grundkörper', () => {
  it('gibt jeder Klasse einen Körper', () => {
    for (const id of PLAYER_CLASS_IDS) expect(silhouette(id).length, id).toBeGreaterThan(0);
  });

  it('zeichnet alles als Körper, nichts als Verzierung', () => {
    // Eine Silhouette, die erst durch Innenzeichnung eindeutig wird, ist als
    // Fleck im Gefecht immer noch mehrdeutig.
    for (const id of PLAYER_CLASS_IDS) {
      for (const form of silhouette(id)) expect(form.ebene, id).toBe('koerper');
    }
  });

  it('unterscheidet die vier Familien schon am nackten Einstieg', () => {
    setHullStil('silhouette');
    const einstieg = ['rapid', 'sniper', 'drone', 'rammer'] as const;
    const kennungen = einstieg.map(umrissKennung);
    // Genau der Befund, der im klassischen Stand schiefging: dort teilen sich
    // rapid und sniper denselben Kreis.
    expect(new Set(kennungen).size).toBe(4);
  });

  it('leitet die Buchten des Trägers aus der Drohnenzahl ab', () => {
    // Der Controller führt vier Drohnen, der Overseer acht – man soll das am
    // Rumpf sehen, auch wenn gerade keine Drohne fliegt.
    setHullStil('silhouette');
    expect(umrissKennung('drone')).not.toBe(umrissKennung('overseer'));
    expect(CLASS_DEFINITIONS.drone.droneCount).toBeLessThan(CLASS_DEFINITIONS.overseer.droneCount);
  });
});

describe('Regel 2: die Stufe steckt in dem, was dazukommt', () => {
  it('ordnet jede Klasse ihrem Ring zu', () => {
    expect(stufeVon('core')).toBe(0);
    expect(stufeVon('rapid')).toBe(1);
    expect(stufeVon('twin')).toBe(2);
    expect(stufeVon('storm')).toBe(3);
  });

  it('legt auf jeder Stufe etwas dazu, statt nur zu wachsen', () => {
    // Reine Skalierung wäre kein Fortschritt, sondern ein Zoom.
    for (const familie of ['rapid', 'precision', 'control', 'impact'] as const) {
      const klassen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].branch === familie);
      const ring1 = klassen.find((id) => stufeVon(id) === 1);
      const ring2 = klassen.find((id) => stufeVon(id) === 2 && !MERKMALE[id]);
      const ring3 = klassen.find((id) => stufeVon(id) === 3 && !MERKMALE[id]);
      if (!ring1 || !ring2 || !ring3) continue;
      expect(silhouette(ring2).length, `${familie} Ring 2`).toBeGreaterThan(silhouette(ring1).length);
      expect(silhouette(ring3).length, `${familie} Ring 3`).toBeGreaterThan(silhouette(ring2).length);
    }
  });

  it('lässt einen späten Tank auch größer aussehen', () => {
    expect(weite('storm')).toBeGreaterThan(weite('rapid'));
    expect(weite('lancer')).toBeGreaterThan(weite('sniper'));
  });

  it('bleibt dabei in Spielgröße', () => {
    // Der Server rechnet mit einem festen Trefferradius; ein Rumpf, der weit
    // darüber hinauswächst, verspricht Treffer, die nicht zählen.
    for (const id of PLAYER_CLASS_IDS) expect(weite(id), id).toBeLessThanOrEqual(36);
  });
});

describe('Regel 3: ein Merkmal, das nur diese Klasse hat', () => {
  it('trägt je Familie eine frühe und eine späte Klasse – die Vorlage für Sam', () => {
    expect(BEISPIELE).toHaveLength(8);
    for (const familie of ['rapid', 'precision', 'control', 'impact'] as const) {
      const dabei = BEISPIELE.filter((id) => CLASS_DEFINITIONS[id].branch === familie);
      expect(dabei.map(stufeVon).sort(), familie).toEqual([1, 3]);
    }
  });

  it('beschreibt jedes Merkmal in einem Satz ohne Zahlen', () => {
    // Die Abnahmeregel aus dem Auftrag: „mindestens ein Merkmal, das nur sie
    // hat, und das man beschreiben kann, ohne Zahlen zu nennen". Wer hier
    // Werte nennt, hat kein Merkmal gebaut, sondern eine Statistik.
    for (const [id, merkmal] of Object.entries(MERKMALE)) {
      expect(merkmal?.text.length, id).toBeGreaterThan(30);
      expect(merkmal?.text, id).not.toMatch(/\d/);
    }
  });

  it('macht die acht Beispiele paarweise unterscheidbar', () => {
    setHullStil('silhouette');
    const kennungen = BEISPIELE.map(umrissKennung);
    expect(new Set(kennungen).size).toBe(BEISPIELE.length);
  });

  it('hält fest, dass die übrigen 21 noch keins haben', () => {
    // Bewusst so: Ohne Sams Ja wird nicht weitergebaut. Diese Zusicherung
    // dreht sich um, sobald die Freigabe da ist – und sie erinnert daran,
    // dass der Blindtest bis dahin nicht bestanden ist.
    setHullStil('silhouette');
    const verschieden = new Set(PLAYER_CLASS_IDS.map(umrissKennung));
    expect(verschieden.size).toBeLessThan(PLAYER_CLASS_IDS.length);
    expect(BEISPIELE.length + verschieden.size).toBeGreaterThan(20);
  });
});
