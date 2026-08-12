import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { signatureColor, signatureLabel, signatureRatio } from './signature';

describe('Signature-Beschriftung', () => {
  it('gibt je Familie dasselbe Wort, egal welche Klasse', () => {
    const woerter = new Map<string, Set<string | null>>();
    for (const id of Object.keys(CLASS_DEFINITIONS) as PlayerClass[]) {
      const familie = CLASS_DEFINITIONS[id].branch;
      const gesammelt = woerter.get(familie) ?? new Set<string | null>();
      gesammelt.add(signatureLabel(id));
      woerter.set(familie, gesammelt);
    }
    for (const [familie, gesammelt] of woerter) {
      expect(gesammelt.size, `Familie ${familie} hat mehrere Wörter`).toBe(1);
    }
    expect([...(woerter.get('rapid') ?? [])][0]).toBe('MOMENTUM');
    expect([...(woerter.get('impact') ?? [])][0]).toBe('WUCHT');
    expect([...(woerter.get('precision') ?? [])][0]).toBe('LADUNG');
    expect([...(woerter.get('control') ?? [])][0]).toBe('EINHEITEN');
  });

  it('lässt die Startklasse ohne Wort', () => {
    const startklassen = (Object.keys(CLASS_DEFINITIONS) as PlayerClass[])
      .filter((id) => CLASS_DEFINITIONS[id].branch === 'core');
    expect(startklassen.length).toBeGreaterThan(0);
    for (const id of startklassen) expect(signatureLabel(id)).toBeNull();
  });

  it('deckt jede Familie ab, die es im Katalog gibt', () => {
    const familien = new Set(
      (Object.keys(CLASS_DEFINITIONS) as PlayerClass[]).map((id) => CLASS_DEFINITIONS[id].branch)
    );
    // Wenn 02 eine fünfte Familie einführt, schlägt dieser Test fehl – genau
    // dann muss auch die Beschriftung dazukommen.
    expect([...familien].sort()).toEqual(['aegis', 'control', 'core', 'impact', 'precision', 'rapid', 'siege', 'specter', 'tempest']);
  });
});

describe('Signature-Familienfarbe (Befund 6)', () => {
  it('hat genau dort eine Farbe, wo es auch ein Familienwort gibt', () => {
    // Balken ohne Wort wäre ein Rätsel, Wort ohne Farbe ein grauer Balken –
    // beide Tabellen müssen dieselben Familien abdecken.
    for (const id of Object.keys(CLASS_DEFINITIONS) as PlayerClass[]) {
      expect(signatureColor(id) !== null, `${id}: Farbe und Wort laufen auseinander`)
        .toBe(signatureLabel(id) !== null);
    }
  });

  it('gibt je Familie dieselbe Farbe, egal welche Klasse', () => {
    const farben = new Map<string, Set<number | null>>();
    for (const id of Object.keys(CLASS_DEFINITIONS) as PlayerClass[]) {
      const familie = CLASS_DEFINITIONS[id].branch;
      const gesammelt = farben.get(familie) ?? new Set<number | null>();
      gesammelt.add(signatureColor(id));
      farben.set(familie, gesammelt);
    }
    for (const [familie, gesammelt] of farben) {
      expect(gesammelt.size, `Familie ${familie} hat mehrere Farben`).toBe(1);
    }
    // Stichprobe gegen die Palette aus class-tree.css.
    expect([...(farben.get('rapid') ?? [])][0]).toBe(0x5b8cff);
    expect([...(farben.get('aegis') ?? [])][0]).toBe(0x4ea9a4);
  });
});

describe('Signature-Füllstand', () => {
  it('unterscheidet „leer" von „nicht vorhanden"', () => {
    expect(signatureRatio(undefined)).toBeNull();
    expect(signatureRatio(0)).toBe(0);
  });

  it('rechnet Prozent in 0–1 um und begrenzt Ausreißer', () => {
    expect(signatureRatio(50)).toBeCloseTo(0.5);
    expect(signatureRatio(100)).toBe(1);
    expect(signatureRatio(140)).toBe(1);
    expect(signatureRatio(-20)).toBe(0);
  });

  it('verwirft Unsinn statt ihn anzuzeigen', () => {
    expect(signatureRatio(Number.NaN)).toBeNull();
    expect(signatureRatio(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
