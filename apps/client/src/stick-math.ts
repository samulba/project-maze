import type { Vector2 } from '@project-maze/shared';

/**
 * Reine Mathematik der virtuellen Sticks – bewusst DOM-frei, damit das Feintuning
 * ohne Browser testbar bleibt.
 */
export interface StickTuning {
  /** Auslenkung (0..1), unterhalb derer der Stick als Ruhelage gilt. */
  deadzone: number;
  /** Exponent der Antwortkurve: > 1 bedeutet feinere Kontrolle nahe der Mitte. */
  curve: number;
  /** Ab dieser Auslenkung gilt volle Auslenkung – der Daumen muss den Rand nicht treffen. */
  fullThrottleAt: number;
  /** Hysterese: ab hier gilt der Stick als ausgelöst … */
  engage: number;
  /** … und erst unterhalb dieses Werts wieder als losgelassen. */
  release: number;
  /** Maximale Richtungsglättung bei kleiner Auslenkung (0 = aus). */
  smoothing: number;
}

/** Bewegung darf früh volle Geschwindigkeit geben – Ausweichen soll sich direkt anfühlen. */
export const MOVE_TUNING: StickTuning = {
  deadzone: 0.11,
  curve: 1,
  fullThrottleAt: 0.82,
  engage: 0.11,
  release: 0.07,
  smoothing: 0.3
};

/**
 * Zielen braucht Feinheit in der Mitte und eine deutlich höhere Feuerschwelle,
 * damit ein ruhender Daumen nicht dauerfeuert.
 */
export const AIM_TUNING: StickTuning = {
  deadzone: 0.08,
  curve: 1.3,
  fullThrottleAt: 0.92,
  engage: 0.28,
  release: 0.15,
  smoothing: 0.55
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Deadzone, Antwortkurve und Vollgas-Plateau in einem Schritt. */
export function stickMagnitude(ratio: number, tuning: StickTuning): number {
  const clamped = clamp01(ratio);
  if (clamped <= tuning.deadzone) return 0;
  if (clamped >= tuning.fullThrottleAt) return 1;
  const span = Math.max(0.001, tuning.fullThrottleAt - tuning.deadzone);
  return clamp01(Math.pow((clamped - tuning.deadzone) / span, tuning.curve));
}

/**
 * Schmitt-Trigger für „Stick ausgelöst“. Ohne Hysterese flackert das Feuer,
 * sobald der Daumen genau auf der Schwelle liegt.
 */
export function stickEngaged(ratio: number, engaged: boolean, tuning: StickTuning): boolean {
  return engaged ? ratio > tuning.release : ratio >= tuning.engage;
}

/**
 * Glättet die Zielrichtung nur bei kleiner Auslenkung: nahe der Mitte ist die
 * Richtung aus wenigen Pixeln berechnet und entsprechend zappelig, bei voller
 * Auslenkung soll der Stick dagegen sofort reagieren.
 */
export function smoothDirection(
  previous: Vector2 | null,
  next: Vector2,
  ratio: number,
  tuning: StickTuning
): Vector2 {
  if (!previous || tuning.smoothing <= 0) return next;
  // Nach oben begrenzt, damit die Richtung auch bei extremer Einstellung noch nachzieht.
  const inertia = Math.min(0.9, tuning.smoothing) * (1 - clamp01(ratio / Math.max(0.001, tuning.fullThrottleAt)));
  if (inertia <= 0) return next;
  const x = next.x + (previous.x - next.x) * inertia;
  const y = next.y + (previous.y - next.y) * inertia;
  const length = Math.hypot(x, y);
  return length < 0.001 ? next : { x: x / length, y: y / length };
}

export interface StickBounds { left: number; top: number; width: number; height: number; }

/**
 * Ursprung eines schwebenden Sticks: Der Stick entsteht dort, wo der Daumen landet,
 * bleibt aber so weit im Feld, dass die volle Auslenkung in jede Richtung erreichbar ist.
 */
export function floatingOrigin(touch: Vector2, bounds: StickBounds, travel: number): Vector2 {
  const axis = (value: number, start: number, size: number): number => {
    const center = start + size / 2;
    if (size <= travel * 2) return center;
    return Math.max(start + travel, Math.min(start + size - travel, value));
  };
  return {
    x: axis(touch.x, bounds.left, bounds.width),
    y: axis(touch.y, bounds.top, bounds.height)
  };
}
