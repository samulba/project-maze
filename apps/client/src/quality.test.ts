import { describe, expect, it } from 'vitest';
import {
  DOWNGRADE_FPS,
  NOT_FPS,
  QUALITY_TIERS,
  QualityProbe,
  UPGRADE_FPS,
  autoTier,
  effectiveTier,
  isQualityChoice,
  readChoice
} from './quality';

describe('Stufen', () => {
  it('werden von niedrig nach hoch teurer, nie umgekehrt', () => {
    const reihe = [QUALITY_TIERS.low, QUALITY_TIERS.mid, QUALITY_TIERS.high];
    for (let index = 1; index < reihe.length; index += 1) {
      expect(reihe[index]!.particleScale).toBeGreaterThan(reihe[index - 1]!.particleScale);
      expect(reihe[index]!.maxParticles).toBeGreaterThan(reihe[index - 1]!.maxParticles);
      expect(reihe[index]!.resolutionCap).toBeGreaterThanOrEqual(reihe[index - 1]!.resolutionCap);
    }
  });

  it('schaltet Leuchten und Kantenglättung erst auf der untersten Stufe ab', () => {
    expect(QUALITY_TIERS.low.glow).toBe(false);
    expect(QUALITY_TIERS.low.antialias).toBe(false);
    expect(QUALITY_TIERS.mid.glow).toBe(true);
    expect(QUALITY_TIERS.high.glow).toBe(true);
  });
});

describe('Automatik', () => {
  it('stuft bei knappem Ruckeln je Fenster einen Schritt', () => {
    // Zwischen NOT_FPS und DOWNGRADE_FPS: ein Schritt, damit ein einzelnes
    // schlechtes Fenster nicht gleich alles abschaltet.
    expect(autoTier(25, 'high')).toBe('mid');
    expect(autoTier(25, 'mid')).toBe('low');
    expect(autoTier(120, 'low')).toBe('mid');
    expect(autoTier(120, 'mid')).toBe('high');
  });

  it('geht bei unspielbarer Bildrate sofort ganz nach unten', () => {
    /*
     * Der Grund für die Ausnahme: Ein Schritt je Fenster heisst zehn Sekunden
     * je Schritt. Ein Gerät mit 12 fps startet auf „mittel" und hätte die
     * erste halbe Minute im Ruckeln verbracht, bevor es unten ankommt.
     *
     * Gegen Pendeln schützt das weiterhin: Wer bei NOT_FPS liegt, kommt oben
     * unter keinen Umständen mit – dort gibt es nichts, wohin gependelt
     * werden könnte.
     */
    expect(autoTier(12, 'high')).toBe('low');
    expect(autoTier(19, 'mid')).toBe('low');
    expect(autoTier(NOT_FPS - 0.1, 'high')).toBe('low');
    // Genau auf der Schwelle gilt noch die sanfte Regel.
    expect(autoTier(NOT_FPS, 'high')).toBe('mid');
  });

  it('bleibt an den Enden stehen', () => {
    expect(autoTier(5, 'low')).toBe('low');
    expect(autoTier(200, 'high')).toBe('high');
  });

  it('lässt das Mittelfeld in Ruhe – sonst würde es pendeln', () => {
    for (const fps of [DOWNGRADE_FPS, 40, 50, UPGRADE_FPS]) {
      expect(autoTier(fps, 'mid'), `${fps} fps`).toBe('mid');
    }
  });

  it('kann zwischen den Schwellen nicht schwingen', () => {
    // Eine Bildrate, die gerade eben hochstuft, darf auf der neuen Stufe nicht
    // sofort wieder runterstufen.
    expect(autoTier(UPGRADE_FPS + 1, 'mid')).toBe('high');
    expect(autoTier(UPGRADE_FPS + 1, 'high')).toBe('high');
  });
});

describe('Wahl', () => {
  it('nimmt nur bekannte Werte an', () => {
    expect(isQualityChoice('auto')).toBe(true);
    expect(isQualityChoice('ultra')).toBe(false);
    expect(readChoice('low')).toBe('low');
    expect(readChoice(null)).toBe('auto');
    expect(readChoice('kaputt')).toBe('auto');
  });

  it('lässt die Automatik nur greifen, wenn sie gewählt ist', () => {
    expect(effectiveTier('auto', 'low')).toBe('low');
    expect(effectiveTier('high', 'low')).toBe('high');
  });
});

describe('Messfenster', () => {
  /** Schiebt Frames nach, bis ein Fenster voll ist. Gibt Bildrate und Anzahl. */
  const bisFenster = (probe: QualityProbe, dauer: number, grenze = 1000): { fps: number | null; frames: number } => {
    for (let frames = 1; frames <= grenze; frames += 1) {
      const fps = probe.push(dauer);
      if (fps !== null) return { fps, frames };
    }
    return { fps: null, frames: grenze };
  };

  it('meldet erst, wenn die Zeit voll ist', () => {
    const probe = new QualityProbe(2);
    const ergebnis = bisFenster(probe, 1 / 60);
    // 2 Sekunden bei 60 fps sind 120 Frames – Fließkomma darf einen mehr
    // brauchen, aber nicht deutlich mehr.
    expect(ergebnis.frames).toBeGreaterThanOrEqual(120);
    expect(ergebnis.frames).toBeLessThanOrEqual(121);
    expect(ergebnis.fps).toBeCloseTo(60, 0);
  });

  it('nimmt den Median – ein einzelner Ruckler kippt nichts', () => {
    const probe = new QualityProbe(1);
    // 0,9 s Ruckler plus lauter 60-fps-Frames: Der Mittelwert läge bei rund
    // 2 fps, der Median bleibt bei 60.
    let ergebnis: number | null = probe.push(0.9);
    expect(ergebnis).toBeNull();
    for (let index = 0; index < 200 && ergebnis === null; index += 1) ergebnis = probe.push(1 / 60);
    expect(ergebnis).toBeCloseTo(60, 0);
  });

  it('verwirft Pausen und Unsinn', () => {
    const probe = new QualityProbe(1);
    expect(probe.push(0)).toBeNull();
    expect(probe.push(-1)).toBeNull();
    expect(probe.push(5)).toBeNull();
  });

  it('fängt nach jedem Fenster von vorn an', () => {
    const probe = new QualityProbe(1);
    expect(bisFenster(probe, 1 / 60).fps).toBeCloseTo(60, 0);
    // Zweites Fenster mit halber Bildrate: braucht halb so viele Frames und
    // meldet 30 – Reste aus dem ersten Fenster wirken nicht nach.
    const zweites = bisFenster(probe, 1 / 30);
    expect(zweites.frames).toBeGreaterThanOrEqual(30);
    expect(zweites.frames).toBeLessThanOrEqual(31);
    expect(zweites.fps).toBeCloseTo(30, 0);
  });
});

/**
 * Die unterste Stufe muss auch dann noch etwas hergeben, wenn alles andere
 * schon aus ist – Sams Auftrag „soll überall extrem smooth laufen, auf allen
 * Geräten".
 */
describe('Unterste Stufe', () => {
  it('rechnet das Bild kleiner als den Schirm', () => {
    // Der stärkste Hebel überhaupt: 0,75 spart 44 % der Fläche. Vorher stand
    // hier 1 – ein Gerät, dem „niedrig" nicht reichte, hatte nichts mehr.
    expect(QUALITY_TIERS.low.resolutionCap).toBeLessThan(1);
    expect(QUALITY_TIERS.low.resolutionCap).toBeGreaterThanOrEqual(0.5);
  });

  it('lässt den Schmuck an den Kugeln weg, aber nicht die Kugel', () => {
    expect(QUALITY_TIERS.low.detail).toBe(false);
    expect(QUALITY_TIERS.mid.detail).toBe(true);
    expect(QUALITY_TIERS.high.detail).toBe(true);
  });
});

describe('Erstes Messfenster', () => {
  it('urteilt beim ersten Mal früher und danach ruhiger', () => {
    const probe = new QualityProbe(10, 3);
    expect(probe.fensterSekunden).toBe(3);
    let frames = 0;
    let fps: number | null = null;
    // Ein schwaches Gerät: 12 fps. Nach drei Sekunden muss ein Urteil stehen,
    // nicht nach zehn – das sind sieben Sekunden Ruckeln weniger.
    while (fps === null && frames < 2000) { fps = probe.push(1 / 12); frames += 1; }
    expect(fps).toBeCloseTo(12, 0);
    expect(frames / 12).toBeLessThan(4);
    expect(probe.fensterSekunden).toBe(10);
  });

  it('lässt das lange Fenster gelten, sobald das erste durch ist', () => {
    const probe = new QualityProbe(10, 3);
    let fps: number | null = null;
    for (let index = 0; index < 2000 && fps === null; index += 1) fps = probe.push(1 / 60);
    let frames = 0;
    fps = null;
    while (fps === null && frames < 5000) { fps = probe.push(1 / 60); frames += 1; }
    expect(frames / 60).toBeGreaterThan(9);
  });

  it('fängt nach einer Pause nicht wieder von vorn an zu urteilen', () => {
    // `reset` läuft bei jedem Tabwechsel und im Startscreen. Würde es das erste
    // Fenster zurücksetzen, urteilte die Automatik dauernd nach drei Sekunden.
    const probe = new QualityProbe(10, 3);
    let fps: number | null = null;
    for (let index = 0; index < 2000 && fps === null; index += 1) fps = probe.push(1 / 60);
    probe.reset();
    expect(probe.fensterSekunden).toBe(10);
  });
});
