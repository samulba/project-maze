import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';

/**
 * Beschriftung der Familien-Signature (Klassen 3.0).
 *
 * Der Server liefert EIN Feld `signature` (0–100) für alle Familien; was es
 * bedeutet, hängt am Spielstil. Diese Tabelle ist die einzige Stelle, an der
 * die Zuordnung steht – kommt die nächste Familie dazu, ändert sich nur hier
 * etwas.
 *
 * `core` fehlt bewusst: Die Startklasse hat keine Signature. Sollte der Server
 * dort trotzdem einen Wert schicken, zeigt der Client einen namenlosen Balken
 * statt einer erfundenen Beschriftung.
 */
const BRANCH_LABELS: Partial<Record<string, string>> = {
  rapid: 'MOMENTUM',
  precision: 'LADUNG',
  control: 'EINHEITEN',
  impact: 'WUCHT',
  specter: 'TARNUNG',
  tempest: 'HITZE',
  siege: 'STELLUNG',
  aegis: 'SCHILD'
};

/**
 * Familienfarben – dieselbe Palette wie in `class-tree.css`, damit der Balken
 * am Gegner dieselbe Sprache spricht wie Klassenrad und Wahlkarten. Wer die
 * Farben dort ändert, muss hier mitziehen (der Renderer braucht Zahlen, kein
 * CSS).
 */
const BRANCH_COLORS: Partial<Record<string, number>> = {
  rapid: 0x5b8cff,
  precision: 0xe0a44a,
  control: 0x46b98d,
  impact: 0xd2606f,
  specter: 0x8f7ff0,
  tempest: 0xe0954e,
  siege: 0xb0a24e,
  aegis: 0x4ea9a4
};

/** Familienwort für die Klasse, oder `null`, wenn die Familie keines hat. */
export function signatureLabel(playerClass: PlayerClass): string | null {
  const definition = CLASS_DEFINITIONS[playerClass];
  if (!definition) return null;
  return BRANCH_LABELS[definition.branch] ?? null;
}

/** Familienfarbe für den Signature-Balken, oder `null` (Startklasse, Unbekanntes). */
export function signatureColor(playerClass: PlayerClass): number | null {
  const definition = CLASS_DEFINITIONS[playerClass];
  if (!definition) return null;
  return branchColor(definition.branch);
}

/** Familienfarbe direkt über den Familiennamen – für Effekte ohne Klassen-Snapshot (AEGIS-Entladung). */
export function branchColor(branch: string): number | null {
  return BRANCH_COLORS[branch] ?? null;
}

/**
 * Füllstand als 0–1. `null` heißt „die Mechanik ist für diesen Spieler nicht
 * aktiv" – dann bleibt jede Anzeige aus. Wichtig: `0` ist ein gültiger Wert
 * (Momentum ganz unten) und darf nicht wie „kein Wert" behandelt werden.
 */
export function signatureRatio(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value / 100));
}
