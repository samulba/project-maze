import { PLAYER_CLASS_IDS } from '@project-maze/shared';
import { describe, expect, it } from 'vitest';
import { classPreviewSvg } from './class-preview';
import { hullForms, umrissDubletten, umrissFormen, umrissKennung, vieleckPunkte } from './class-hull';

/**
 * Zwei Dinge hält dieser Test fest.
 *
 * Das erste ist eine Reparatur: Vorschau und Spiel benutzen dieselbe Geometrie.
 * Vorher zeichnete die Wahlkarte jeden Rumpf als Kreis, egal was im Spiel
 * erschien – ein Fortress war auf der Karte eine Scheibe. Solche Abweichungen
 * fallen niemandem auf, weil beide Bilder für sich plausibel aussehen; nur
 * nebeneinander sieht man es. Deshalb steht es hier.
 *
 * Das zweite ist Sams eigentlicher Befund („noch immer die gleichen
 * langweiligen Tanks"). Der Blindtest – alle Umrisse ohne Farbe und ohne Namen –
 * ist als Zahl festgehalten: `umrissDubletten()` zählt die Paare, die man nicht
 * auseinanderhalten kann. **Der Test steht bewusst auf dem heutigen Stand und
 * nicht auf null**; auf null gehört er erst, wenn die neuen Silhouetten
 * freigegeben und gebaut sind. Ein Test, der heute schon Perfektion behauptet,
 * wäre eine Behauptung, kein Beleg.
 */

describe('Rumpfgeometrie', () => {
  it('kennt jede der 29 Klassen', () => {
    for (const id of PLAYER_CLASS_IDS) {
      expect(hullForms(id).length, id).toBeGreaterThan(0);
    }
  });

  it('gibt jeder Klasse mindestens eine Form im Umriss', () => {
    // Eine Klasse ohne Körper wäre im Spiel unsichtbar: Rohre ohne Tank. Genau
    // das passiert, wenn eine neue Klasse dazukommt und die Tabelle vergessen
    // wird – vorher fiel sie stumm durch den `switch`.
    for (const id of PLAYER_CLASS_IDS) {
      expect(umrissFormen(id).length, id).toBeGreaterThan(0);
    }
  });

  it('füllt jede Körperform und lässt keine unsichtbar', () => {
    for (const id of PLAYER_CLASS_IDS) {
      for (const form of umrissFormen(id)) {
        expect(form.fuellung, `${id}/${form.form}`).toBeDefined();
      }
    }
  });

  it('hält jeden Rumpf in Spielgröße – kein Riese, kein Punkt', () => {
    // Der Server rechnet mit einem festen Trefferradius; ein Rumpf, der viel
    // größer gezeichnet wird, verspricht Treffer, die nicht zählen.
    for (const id of PLAYER_CLASS_IDS) {
      for (const form of umrissFormen(id)) {
        const weiteste = weitesteEcke(form);
        expect(weiteste, `${id} zu klein`).toBeGreaterThan(10);
        expect(weiteste, `${id} zu groß`).toBeLessThanOrEqual(36);
      }
    }
  });
});

describe('Vorschau und Spiel aus derselben Quelle', () => {
  it('zeichnet für jede Klasse so viele Formen, wie die Geometrie hergibt', () => {
    for (const id of PLAYER_CLASS_IDS) {
      const svg = classPreviewSvg(id);
      // Kränze werden zu mehreren Kreisen; deshalb mindestens, nicht genau.
      const gezeichnet = (svg.match(/<(circle|polygon|rect|line)/g) ?? []).length;
      expect(gezeichnet, id).toBeGreaterThanOrEqual(hullForms(id).length);
    }
  });

  it('macht aus einem Rechteck kein Rund – der Fortress bleibt ein Kasten', () => {
    // Der konkrete Fehler, der den Umzug ausgelöst hat: Die Vorschau zeichnete
    // pauschal `<circle r="22">`, während im Spiel ein 52×46-Kasten stand.
    const svg = classPreviewSvg('fortress');
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="52"');
  });

  it('erbt die Klassenfarbe, statt sie festzuschreiben', () => {
    // `currentColor` ist der Grund, warum dieselbe Form im Spiel Eigen- oder
    // Gegnerfarbe tragen kann und auf der Karte die Farbe der Familie.
    const svg = classPreviewSvg('rapid');
    expect(svg).toContain('currentColor');
    expect(svg).not.toMatch(/fill="#[0-9a-f]{6}"/i);
  });

  it('setzt an jeder Rumpfform eine Füllung, auch wenn sie „none" heißt', () => {
    // Ohne `fill` füllt SVG schwarz. Eine Ringlinie würde damit zur Scheibe.
    // Geprüft wird nur die Rumpfgruppe – Rohre und Drohnen bekommen ihre Farbe
    // weiterhin aus dem Stylesheet und tragen deshalb absichtlich keine.
    for (const id of PLAYER_CLASS_IDS) {
      const rumpf = classPreviewSvg(id).match(/<g class="class-preview-hull">(.*?)<\/g>/)?.[1] ?? '';
      const elemente = rumpf.match(/<(circle|polygon|rect|line)[^>]*>/g) ?? [];
      expect(elemente.length, id).toBeGreaterThan(0);
      for (const element of elemente) expect(element, `${id}: ${element}`).toContain('fill=');
    }
  });
});

describe('Blindtest: unterscheidbare Umrisse', () => {
  it('beschreibt jeden Umriss als vergleichbare Kennung', () => {
    for (const id of PLAYER_CLASS_IDS) expect(umrissKennung(id).length, id).toBeGreaterThan(0);
  });

  it('hält den heutigen Stand fest: 19 Klassen teilen sich sieben Umrisse', () => {
    // Der Ausgangspunkt in Zahlen, damit die Verbesserung später eine Messung
    // ist und keine Meinung. Wird die Liste länger, hat jemand eine Form
    // verwässert; wird sie kürzer, war es Absicht und gehört hierher.
    const gruppen = new Map<string, string[]>();
    for (const id of PLAYER_CLASS_IDS) {
      const kennung = umrissKennung(id);
      gruppen.set(kennung, [...(gruppen.get(kennung) ?? []), id]);
    }
    const dubletten = [...gruppen.values()].filter((ids) => ids.length > 1);
    expect(dubletten.map((ids) => ids.join('='))).toEqual([
      'core=drone=twin=warden=guardian',
      'rapid=sniper=hunter=flanker',
      'rammer=octo',
      'railgun=arbalest',
      'storm=overseer',
      'gatling=hive',
      'phantom=deadeye'
    ]);
    expect(dubletten.flat()).toHaveLength(19);
    expect(umrissDubletten()).toHaveLength(21);
  });

  it('belegt, dass die Einstiegsklassen sich nicht unterscheiden', () => {
    // Der Befund an der Stelle, an der er am meisten wehtut: Wer auf Level 10
    // zum ersten Mal wählt, sieht vier Karten – und drei davon zeigen dieselbe
    // Scheibe. Diese Zusicherung dreht sich um, sobald die neuen Silhouetten
    // stehen; dass sie heute so herum steht, ist der Punkt.
    const einstieg = ['rapid', 'sniper', 'drone', 'rammer'] as const;
    expect(new Set(einstieg.map(umrissKennung)).size).toBe(3);
    expect(umrissKennung('rapid')).toBe(umrissKennung('sniper'));
  });
});

describe('Vieleck-Geometrie', () => {
  it('legt die erste Ecke auf den Drehwinkel', () => {
    const punkte = vieleckPunkte(4, 10, 0);
    expect(punkte[0]).toBeCloseTo(10);
    expect(punkte[1]).toBeCloseTo(0);
  });

  it('liefert zwei Werte je Ecke', () => {
    expect(vieleckPunkte(8, 23, Math.PI / 8)).toHaveLength(16);
  });

  it('bleibt auf dem Radius', () => {
    for (let index = 0; index < 6; index += 1) {
      const punkte = vieleckPunkte(6, 21, Math.PI / 6);
      expect(Math.hypot(punkte[index * 2] ?? 0, punkte[index * 2 + 1] ?? 0)).toBeCloseTo(21);
    }
  });
});

/** Abstand der äußersten Ecke einer Form vom Mittelpunkt. */
function weitesteEcke(form: ReturnType<typeof hullForms>[number]): number {
  switch (form.form) {
    case 'kreis': return Math.hypot(form.x, form.y) + form.r;
    case 'vieleck': return form.r;
    case 'rechteck': return Math.max(
      Math.hypot(form.x, form.y),
      Math.hypot(form.x + form.breite, form.y + form.hoehe),
      Math.hypot(form.x, form.y + form.hoehe),
      Math.hypot(form.x + form.breite, form.y)
    );
    case 'zug': {
      let weit = 0;
      for (let index = 0; index + 1 < form.punkte.length; index += 2) {
        weit = Math.max(weit, Math.hypot(form.punkte[index] ?? 0, form.punkte[index + 1] ?? 0));
      }
      return weit;
    }
    case 'strecke': return Math.max(Math.hypot(form.x1, form.y1), Math.hypot(form.x2, form.y2));
    case 'kranz': return form.r + form.knoten;
  }
}
