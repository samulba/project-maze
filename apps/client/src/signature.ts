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
  tempest: 'HITZE'
};

/** Familienwort für die Klasse, oder `null`, wenn die Familie keines hat. */
export function signatureLabel(playerClass: PlayerClass): string | null {
  const definition = CLASS_DEFINITIONS[playerClass];
  if (!definition) return null;
  return BRANCH_LABELS[definition.branch] ?? null;
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
