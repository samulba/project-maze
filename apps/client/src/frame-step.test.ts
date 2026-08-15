import { describe, expect, it } from 'vitest';
import { ECHTZEIT_DECKEL, SPRUNG_SEKUNDEN, bildschritt, welttempo } from './frame-step';

/**
 * Sams „super langsam, fast in abgehackter Zeitlupe" vom 14.08. – als Zahl.
 *
 * Der Kern dieser Prüfung ist `welttempo`: Läuft die Welt bei einem gegebenen
 * Bildmaß in Echtzeit? Mit dem alten Deckel von 50 ms lautete die Antwort ab
 * 20 fps abwärts „nein", und niemand hätte es gemerkt – es gab keinen Test, der
 * die Frage überhaupt gestellt hat.
 */
describe('Bildschritt', () => {
  it('rechnet in Echtzeit, solange das Bildmaß über 5 fps liegt', () => {
    for (const bildmass of [144, 120, 60, 30, 20, 12, 6, 5]) {
      expect(welttempo(bildmass), `${bildmass} fps`).toBeCloseTo(1, 6);
    }
  });

  it('hätte mit dem alten Deckel von 50 ms bei 10 fps auf halbem Tempo gelaufen', () => {
    // Die Gegenprobe zum Befund – sie hält fest, WARUM der Wert steht, wo er
    // steht. Fällt der Deckel je wieder auf 0,05, fällt dieser Test zuerst.
    const altesTempo = (bildmass: number): number => Math.min(0.05, 1 / bildmass) * bildmass;
    expect(altesTempo(10)).toBeCloseTo(0.5, 6);
    expect(altesTempo(5)).toBeCloseTo(0.25, 6);
    expect(welttempo(10)).toBeCloseTo(1, 6);
    expect(welttempo(5)).toBeCloseTo(1, 6);
  });

  it('deckelt erst unterhalb von 5 fps – und springt nicht dafür', () => {
    const langsam = bildschritt(0.4);
    expect(langsam).toEqual({ schritt: ECHTZEIT_DECKEL, sprung: false });
  });

  it('springt nach einer Pause, statt sich heranzukriechen', () => {
    for (const pause of [0.51, 2, 10, 600]) {
      const schritt = bildschritt(pause);
      expect(schritt?.sprung, `${pause}s`).toBe(true);
      // Gerechnet wird die Pause mit einem NORMALEN Schritt: Sonst schleudert
      // ein Tab-Wechsel jede Feder und jedes Teilchen quer – genau der Grund,
      // aus dem es den Deckel überhaupt gibt.
      expect(schritt?.schritt).toBeCloseTo(1 / 60, 6);
    }
  });

  it('überspringt Bilder ohne brauchbare Zeit', () => {
    // Der erste Tick nach dem Start liefert gelegentlich 0 oder NaN. Ein
    // solcher Wert darf nicht in `1-exp(-k·delta)` oder `life -= delta` laufen.
    for (const unsinn of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(bildschritt(unsinn), String(unsinn)).toBeNull();
    }
  });

  it('hält die Grenze zwischen langsamem Bild und Pause an einer Stelle', () => {
    expect(bildschritt(SPRUNG_SEKUNDEN)?.sprung).toBe(false);
    expect(bildschritt(SPRUNG_SEKUNDEN + 0.001)?.sprung).toBe(true);
  });
});
