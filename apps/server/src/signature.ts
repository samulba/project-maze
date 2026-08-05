import { CLASS_DEFINITIONS, type PlayerClass, type PlayerSnapshot, type Vector2 } from '@project-maze/shared';
import type { PassiveModifierId } from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';

/**
 * Gemeinsamer Unterbau der Familien-Signatures (Klassen 3.0).
 *
 * Rapid (Momentum) und Impact (Wucht) sind derselbe Vorgang mit anderem
 * Auslöser und anderer Wirkung: eine Zahl zwischen 0 und 100, die in Fahrt
 * steigt und im Stand fällt. Alles, was beide gleich machen – Buchführung je
 * Spiel, Deckelung, Rundung in den Snapshot, Aufräumen bei Tod und
 * Familienwechsel – liegt hier. Was sie unterscheidet, bleibt in
 * `signature-rapid.ts` und `signature-impact.ts`.
 *
 * Wichtig für den Betrieb mit mehreren aktiven Familien: Jede Schicht führt
 * ihren **eigenen** Zähler und räumt nur auf, was sie selbst eingetragen hat.
 * Sonst würde die Impact-Schicht das Feld eines Rapid-Spielers löschen.
 */

/** Obergrenze des Signature-Feldes im Snapshot. Gilt für alle vier Familien. */
export const SIGNATURE_MAX = 100;

export interface SignatureRuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  passiveModifier?: PassiveModifierId;
  bot: unknown | null;
}

/** Ungerundete Füllstände je Spieler – im Snapshot steht die gerundete Zahl. */
export type SignatureState = Map<string, number>;

const stores = new WeakMap<MazeGame, Map<string, SignatureState>>();

/**
 * Zähler einer Familie für ein Spiel. `family` trennt die Schichten
 * voneinander, damit zwei aktive Signatures sich nicht gegenseitig aufräumen.
 */
export function signatureStateFor(game: MazeGame, family: string): SignatureState {
  let byFamily = stores.get(game);
  if (!byFamily) {
    byFamily = new Map();
    stores.set(game, byFamily);
  }
  let state = byFamily.get(family);
  if (!state) {
    state = new Map();
    byFamily.set(family, state);
  }
  return state;
}

export const classBranch = (playerClass: PlayerClass): string => CLASS_DEFINITIONS[playerClass].branch;

/**
 * „In Bewegung" heißt: mindestens dieser Anteil der eigenen
 * Höchstgeschwindigkeit. Gemessen wird die **tatsächliche** Geschwindigkeit,
 * nicht die Eingabe – wer gegen eine Wand drückt, kommt nicht voran, und die
 * blockierte Achse wird von `moveCircle` genullt.
 */
export const isMovingFast = (player: SignatureRuntimePlayer, moveSpeed: number, threshold: number): boolean =>
  Math.hypot(player.velocity.x, player.velocity.y) >= threshold * moveSpeed;

/**
 * Schreibt den Füllstand eines Spielers fort und spiegelt ihn gerundet in den
 * Snapshot. Gibt den neuen, **ungerundeten** Wert zurück.
 *
 * - gehört der Spieler nicht (mehr) zur Familie, verschwindet das Feld wieder
 * - ist er tot, steht es auf 0 und der Zähler wird geleert
 */
export function advanceSignature(
  state: SignatureState,
  player: SignatureRuntimePlayer,
  dt: number,
  inFamily: boolean,
  ratePerSecond: number
): number {
  if (!inFamily) {
    // Nur aufräumen, was diese Schicht selbst gesetzt hat.
    if (state.delete(player.id)) delete player.signature;
    return 0;
  }
  if (player.dead) {
    state.delete(player.id);
    player.signature = 0;
    return 0;
  }
  const next = Math.max(0, Math.min(SIGNATURE_MAX, (state.get(player.id) ?? 0) + ratePerSecond * dt));
  state.set(player.id, next);
  player.signature = Math.round(next);
  return next;
}
