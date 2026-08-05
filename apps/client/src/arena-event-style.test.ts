import type { ArenaEventKind } from '@project-maze/shared/gameplay';
import { describe, expect, it } from 'vitest';
import { ARENA_EVENT_STYLES, GUARDIAN_COLOR, GUARDIAN_NAME, arenaEventStyle, cssColor } from './arena-event-style';

const KINDS: ArenaEventKind[] = ['coreSurge', 'overcharge', 'hunterSignal'];

/** Helligkeit einer 24-Bit-Farbe (sRGB-Näherung, 0…1). */
const relativeLuminance = (color: number): number => {
  const channel = (shift: number): number => ((color >> shift) & 0xff) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
};
/** Grundton der Arena seit der Diep-Basis (0xcdcdcd) – Events müssen dunkler sein. */
const LIGHT_FLOOR_LUMINANCE = relativeLuminance(0xcdcdcd);

describe('arenaEventStyle', () => {
  it('gives every event kind its own colour', () => {
    const rings = KINDS.map((kind) => arenaEventStyle(kind).ring);
    expect(new Set(rings).size).toBe(KINDS.length);
  });

  it('keeps Core Surge on gold – dark enough for the light arena floor', () => {
    const style = arenaEventStyle('coreSurge');
    // Gold heißt: viel Rot, weniger Blau. Der Ton selbst darf sich mit dem
    // Grundlook ändern, die Farbfamilie nicht.
    expect((style.ring >> 16) & 0xff).toBeGreaterThan(style.ring & 0xff);
    expect(relativeLuminance(style.ring)).toBeLessThan(LIGHT_FLOOR_LUMINANCE);
  });

  it('gives Overcharge an electric blue', () => {
    const style = arenaEventStyle('overcharge');
    const blue = style.ring & 0xff;
    const red = (style.ring >> 16) & 0xff;
    expect(blue).toBeGreaterThan(red);
  });

  it('gives Hunter Signal a red ring with a gold core', () => {
    const style = arenaEventStyle('hunterSignal');
    expect((style.ring >> 16) & 0xff).toBeGreaterThan(style.ring & 0xff);
    expect((style.core >> 16) & 0xff).toBeGreaterThan(style.core & 0xff);
    expect(style.core).not.toBe(style.ring);
  });

  it('falls back to Core Surge for a kind this client does not know yet', () => {
    // Der Server kann neuer sein als der ausgelieferte Client.
    expect(arenaEventStyle('supernova' as ArenaEventKind)).toBe(ARENA_EVENT_STYLES.coreSurge);
    expect(arenaEventStyle(undefined)).toBe(ARENA_EVENT_STYLES.coreSurge);
  });

  it('returns a usable colour pair for every kind', () => {
    for (const kind of KINDS) {
      const style = arenaEventStyle(kind);
      expect(style.ring).toBeGreaterThan(0);
      expect(style.core).toBeGreaterThan(0);
      expect(style.label.length).toBeGreaterThan(0);
    }
  });

  it('stays readable on the light arena floor', () => {
    // Auf 0xcdcdcd verschwinden pastellige Töne. Jede Event-Farbe – Ring wie
    // Kern – muss deutlich dunkler sein als der Boden.
    for (const kind of [...KINDS, 'fracture' as ArenaEventKind]) {
      const style = arenaEventStyle(kind);
      expect(relativeLuminance(style.ring)).toBeLessThan(LIGHT_FLOOR_LUMINANCE);
      expect(relativeLuminance(style.core)).toBeLessThan(LIGHT_FLOOR_LUMINANCE);
    }
  });
});

describe('cssColor', () => {
  it('converts a 24 bit colour for the canvas minimap', () => {
    expect(cssColor(0x53c8ff, 0.85)).toBe('rgba(83,200,255,0.85)');
    expect(cssColor(0x000000, 1)).toBe('rgba(0,0,0,1)');
    expect(cssColor(0xffffff, 0)).toBe('rgba(255,255,255,0)');
  });

  it('keeps the minimap in step with the zone colour', () => {
    for (const kind of KINDS) {
      expect(cssColor(arenaEventStyle(kind).ring, 0.85)).toContain('rgba(');
    }
  });
});

describe('guardian identity', () => {
  it('uses the crossed-swords plate instead of a player name', () => {
    expect(GUARDIAN_NAME).toContain('GUARDIAN');
    expect(GUARDIAN_NAME.startsWith('⚔')).toBe(true);
  });

  it('shares the gold of the Hunter Signal core', () => {
    expect(GUARDIAN_COLOR).toBeGreaterThan(0);
    expect((GUARDIAN_COLOR >> 16) & 0xff).toBeGreaterThan(GUARDIAN_COLOR & 0xff);
  });
});
