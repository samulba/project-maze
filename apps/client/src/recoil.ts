/**
 * Feder für den Kanonenrohr-Rückstoß.
 *
 * Ein Schuss setzt die Auslenkung auf 1 (ganz hinten), danach zieht eine
 * unterkritisch gedämpfte Feder sie zurück: Das Rohr geht kurz zurück, schwingt
 * einmal nach vorn über die Ruhelage hinaus und kommt zur Ruhe. Der Wert ist
 * einheitenlos – der Renderer multipliziert ihn mit den Pixeln für Rohr und
 * Körper.
 *
 * Eigener Baustein, weil er sich so ohne Grafik prüfen lässt: Der Renderer
 * bekommt seine Bilder in dieser Umgebung nicht schnell genug, um eine
 * Bewegung von einer Viertelsekunde sichtbar zu machen.
 */
export interface RecoilState {
  /** 1 = ganz zurück, 0 = Ruhelage, negativ = nach vorn übergeschwungen. */
  offset: number;
  velocity: number;
}

export const RECOIL_STIFFNESS = 220;
export const RECOIL_DAMPING = 16;
/** Grenze gegen Aufschaukeln bei sehr großen Zeitschritten. */
export const RECOIL_LIMIT = 1.5;

/** Ein Schuss: ganz zurück, ohne Restgeschwindigkeit aus dem letzten Stoß. */
export function startRecoil(state: RecoilState): void {
  state.offset = 1;
  state.velocity = 0;
}

/**
 * Ein Zeitschritt der Feder. `delta` in Sekunden; der Renderer deckelt ihn bei
 * 50 ms, damit ein Ruckler die Feder nicht aufschaukelt.
 *
 * Gibt `true` zurück, solange sich noch etwas bewegt – steht die Feder still,
 * spart der Renderer sich das Setzen der Position.
 */
export function stepRecoil(state: RecoilState, delta: number): boolean {
  if (state.offset === 0 && state.velocity === 0) return false;
  state.velocity += (-RECOIL_STIFFNESS * state.offset - RECOIL_DAMPING * state.velocity) * delta;
  state.offset = Math.max(-RECOIL_LIMIT, Math.min(RECOIL_LIMIT, state.offset + state.velocity * delta));
  // Nahe genug an der Ruhelage: hart auf null, sonst zittert der Wert ewig
  // im Tausendstelbereich weiter.
  if (Math.abs(state.offset) < 0.002 && Math.abs(state.velocity) < 0.02) {
    state.offset = 0;
    state.velocity = 0;
  }
  return true;
}
