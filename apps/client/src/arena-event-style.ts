import type { ArenaEventKind } from '@project-maze/shared/gameplay';

/**
 * Farbsprache der drei Arena-Events. Jede Art soll schon am Rand des Bildschirms
 * erkennbar sein, ohne den Banner lesen zu müssen. Die Töne sind auf den hellen
 * Arena-Grund der Diep-Basis abgestimmt – pastellige Farben verschwinden dort.
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
  coreSurge: { ring: 0xc08c1e, core: 0xd8a53a, label: 'Core Surge', zoned: true },
  // Elektrisch: Geschosse löschen sich in der Zone nicht mehr aus.
  overcharge: { ring: 0x1a86c4, core: 0x35a8e0, label: 'Overcharge', zoned: true },
  // Rot-Gold: Jagd auf den neutralen Guardian.
  hunterSignal: { ring: 0xe04824, core: 0xc89235, label: 'Hunter Signal', zoned: true },
  // Violett wie aufgebrochener Fels – ortlos, das Feedback sind die fehlenden Wände.
  fracture: { ring: 0x7c48d8, core: 0x9a6ee8, label: 'Fracture', zoned: false }
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
