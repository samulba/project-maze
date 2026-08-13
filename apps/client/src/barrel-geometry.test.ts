import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { barrelHeightFor } from './barrel-geometry';

const ALTE_STUFE: Record<string, number> = { precision: 12, impact: 16 };
const alteStufe = (branch: string): number => ALTE_STUFE[branch] ?? 14;

const barrelKlassen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].barrelCount > 0);

describe('barrelHeightFor', () => {
  it('macht jede Klasse dicker als die alte Drei-Töpfe-Regel, außer Sniper', () => {
    for (const id of barrelKlassen) {
      const definition = CLASS_DEFINITIONS[id];
      const height = barrelHeightFor(definition, id);
      if (id === 'sniper') continue;
      expect(height, id).toBeGreaterThan(alteStufe(definition.branch));
    }
  });

  it('hält Sniper als dünnste Röhre im Spiel – dünner als jede andere Klasse', () => {
    const sniperHeight = barrelHeightFor(CLASS_DEFINITIONS.sniper, 'sniper');
    for (const id of barrelKlassen) {
      if (id === 'sniper') continue;
      expect(barrelHeightFor(CLASS_DEFINITIONS[id], id), id).toBeGreaterThanOrEqual(sniperHeight);
    }
  });

  it('lässt die eigene Kugel immer durch die Röhre passen (C3)', () => {
    for (const id of barrelKlassen) {
      const definition = CLASS_DEFINITIONS[id];
      const height = barrelHeightFor(definition, id);
      // Durchmesser der Röhre muss mindestens den Kugeldurchmesser decken.
      expect(height, id).toBeGreaterThanOrEqual(definition.projectileRadius * 1.5);
    }
  });

  it('gibt unterschiedlichen Klassen unterschiedliche Breiten (C2: Tank zu Tank)', () => {
    const breiten = new Set(barrelKlassen.map((id) => barrelHeightFor(CLASS_DEFINITIONS[id], id)));
    // Vorher genau drei mögliche Werte für alle Klassen mit Rohr.
    expect(breiten.size).toBeGreaterThan(3);
  });

  it('bleibt innerhalb einer plausiblen Obergrenze', () => {
    for (const id of barrelKlassen) {
      expect(barrelHeightFor(CLASS_DEFINITIONS[id], id), id).toBeLessThanOrEqual(28);
    }
  });

  it('rechnet konkret für Sniper: 12 zu eng, jetzt breiter, aber am dünnsten', () => {
    const height = barrelHeightFor(CLASS_DEFINITIONS.sniper, 'sniper');
    expect(height).toBeGreaterThan(12);
    expect(height).toBeLessThan(16);
  });
});
