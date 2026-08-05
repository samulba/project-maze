import type { ArenaEventKind } from '@project-maze/shared/gameplay';

/**
 * Farbsprache der drei Arena-Events. Jede Art soll schon am Rand des Bildschirms
 * erkennbar sein, ohne den Banner lesen zu müssen.
 */
export interface ArenaEventStyle {
  /** Ring und Umriss der Zone. */
  ring: number;
  /** Kern der Zone und Akzente. */
  core: number;
  /** Kurzname für Debug-/Testzwecke. */
  label: string;
  /**
   * Ob das Event überhaupt einen Ort hat. Fracture wirkt arenaweit – ein Zonenkreis
   * würde auf eine Stelle zeigen, an der nichts passiert.
   */
  zoned: boolean;
}

export const ARENA_EVENT_STYLES: Record<ArenaEventKind, ArenaEventStyle> = {
  // Gold wie bisher – Core Surge ist das eingeführte Standard-Event.
  coreSurge: { ring: 0xe9b653, core: 0xf2c86f, label: 'Core Surge', zoned: true },
  // Elektrisch: Geschosse löschen sich in der Zone nicht mehr aus.
  overcharge: { ring: 0x53c8ff, core: 0x9ce4ff, label: 'Overcharge', zoned: true },
  // Rot-Gold: Jagd auf den neutralen Guardian.
  hunterSignal: { ring: 0xff6b4a, core: 0xf7c766, label: 'Hunter Signal', zoned: true },
  // Violett wie aufgebrochener Fels – ortlos, das Feedback sind die fehlenden Wände.
  fracture: { ring: 0xa878ff, core: 0xd0b6ff, label: 'Fracture', zoned: false }
};

/** Gold für den Guardian selbst – bewusst identisch zum Hunter-Signal-Kern. */
export const GUARDIAN_COLOR = 0xf4c866;
export const GUARDIAN_NAME = '⚔ GUARDIAN';

/**
 * Der Server darf neuer sein als der ausgelieferte Client: Eine unbekannte
 * Event-Art fällt auf Core Surge zurück, statt farblos zu verschwinden.
 */
export function arenaEventStyle(kind: ArenaEventKind | undefined): ArenaEventStyle {
  return (kind && ARENA_EVENT_STYLES[kind]) || ARENA_EVENT_STYLES.coreSurge;
}

/** 24-Bit-Farbe als `rgba(...)` – für die Canvas-Minimap, die keine Pixi-Farben kennt. */
export function cssColor(value: number, alpha: number): string {
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return `rgba(${red},${green},${blue},${alpha})`;
}
