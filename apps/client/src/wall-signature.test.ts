import { describe, expect, it } from 'vitest';
import type { Wall } from '@project-maze/shared';
import { wandKennung } from './wall-signature';

const wand = (id: string, x: number, y: number, width = 160, height = 480): Wall => ({ id, x, y, width, height });
const karte: Wall[] = Array.from({ length: 230 }, (_wert, index) =>
  wand(`w${index}`, (index % 19) * 480, Math.floor(index / 19) * 480));

/**
 * Die Kennung ersetzt eine neun Kilobyte lange Zeichenkette, die zwanzigmal je
 * Sekunde gebaut wurde. Ersetzt werden darf sie nur, wenn sie **jede** Änderung
 * bemerkt, die der Renderer sehen muss – und keine erfindet.
 */
describe('Wandkennung', () => {
  it('bleibt gleich, solange die Wände gleich bleiben', () => {
    expect(wandKennung(karte)).toBe(wandKennung(karte.map((w) => ({ ...w }))));
  });

  it('ändert sich, wenn eine Wand verschwindet – der Fracture-Fall', () => {
    const ohne = karte.filter((_wert, index) => index !== 100);
    expect(wandKennung(ohne)).not.toBe(wandKennung(karte));
  });

  it('ändert sich, wenn eine Wand hinzukommt', () => {
    expect(wandKennung([...karte, wand('neu', 40, 40)])).not.toBe(wandKennung(karte));
  });

  it('ändert sich bei jeder verschobenen oder veränderten Kante', () => {
    for (const feld of ['x', 'y', 'width', 'height'] as const) {
      const verschoben = karte.map((w, index) => (index === 7 ? { ...w, [feld]: w[feld] + 1 } : w));
      expect(wandKennung(verschoben), feld).not.toBe(wandKennung(karte));
    }
  });

  it('unterscheidet zwei Wände, die nur andere Namen tragen', () => {
    const umbenannt = karte.map((w, index) => (index === 3 ? { ...w, id: 'anders' } : w));
    expect(wandKennung(umbenannt)).not.toBe(wandKennung(karte));
  });

  it('unterscheidet auch die Reihenfolge – der Ausschnitt wandert mit dem Spieler', () => {
    const getauscht = [...karte];
    [getauscht[0], getauscht[1]] = [getauscht[1]!, getauscht[0]!];
    expect(wandKennung(getauscht)).not.toBe(wandKennung(karte));
  });

  it('kommt mit einer leeren Karte zurecht – FFA hat keine Wände', () => {
    expect(wandKennung([])).toBe(wandKennung([]));
    expect(wandKennung([])).not.toBe(wandKennung([wand('a', 0, 0)]));
  });

  it('bleibt eine 32-Bit-Ganzzahl', () => {
    const kennung = wandKennung(karte);
    expect(Number.isInteger(kennung)).toBe(true);
    expect(kennung).toBe(kennung | 0);
  });
});
