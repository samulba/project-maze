import type { Vector2 } from '@project-maze/shared';

export const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
export const lengthSquared = (vector: Vector2): number => vector.x * vector.x + vector.y * vector.y;
export const distanceSquared = (a: Vector2, b: Vector2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};
export const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 0.00001) return { x: 0, y: 0 };
  return { x: vector.x / length, y: vector.y / length };
};
export const clampMagnitude = (vector: Vector2, maximum: number): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length < 0.00001 || maximum <= 0) return { x: 0, y: 0 };
  if (length <= maximum) return { ...vector };
  const scale = maximum / length;
  return { x: vector.x * scale, y: vector.y * scale };
};
export const moveToward = (current: number, target: number, maximumDelta: number): number => {
  const difference = target - current;
  if (Math.abs(difference) <= maximumDelta) return target;
  return current + Math.sign(difference) * maximumDelta;
};
export const moveVectorToward = (current: Vector2, target: Vector2, maximumDelta: number): Vector2 => {
  const difference = { x: target.x - current.x, y: target.y - current.y };
  const distance = Math.hypot(difference.x, difference.y);
  if (distance <= maximumDelta || distance < 0.00001) return { ...target };
  const scale = maximumDelta / distance;
  return { x: current.x + difference.x * scale, y: current.y + difference.y * scale };
};

export interface ProjectileDurability { damage: number; integrity: number; }
export function resolveProjectilePair(a: ProjectileDurability, b: ProjectileDurability): void {
  const damageToA = Math.max(0, b.damage);
  const damageToB = Math.max(0, a.damage);
  a.integrity -= damageToA;
  b.integrity -= damageToB;
}

/** Ein Körper, der aus einem anderen herausgeschoben werden kann. */
export interface Koerper { position: Vector2; velocity: Vector2; }

/**
 * Schiebt `koerper` aus einem Hindernis heraus und nimmt ihm den Anteil seiner
 * Geschwindigkeit, der noch hineinzeigt.
 *
 * Sam, 14.08.: „[Drohnen] fliegen auch einfach wie Schüsse durch Objekte durch,
 * obwohl sie die entweder killen oder dort sterben sollten." Genau so war es:
 * `stepDrones` hat bei Kontakt Schaden verteilt und die Drohne unverändert
 * weiterfliegen lassen. Eine Drohne, die ein Quadrat frisst, saß dabei
 * mittendrin.
 *
 * Zwei getrennte Wirkungen, beide nötig:
 *
 * * **Position** – der Körper landet exakt auf der Berührungslinie. Ohne das
 *   drückt ihn der nächste Tick wieder hinein, und er zittert.
 * * **Geschwindigkeit** – nur der *einwärts* zeigende Anteil fällt weg. Der
 *   seitliche bleibt, sonst klebt eine Drohne an der ersten Form, die sie
 *   streift, statt an ihr entlangzugleiten.
 *
 * `frei` prüft, ob der Zielpunkt begehbar ist (Wände). Ist er es nicht, bleibt
 * die Position, wie sie war – lieber eine Drohne, die kurz überlappt, als eine,
 * die aus einer Form heraus in eine Wand geschoben wird.
 */
export function schiebeAuseinander(
  koerper: Koerper,
  hindernis: Vector2,
  mindestabstand: number,
  frei: (position: Vector2) => boolean
): void {
  const delta = { x: koerper.position.x - hindernis.x, y: koerper.position.y - hindernis.y };
  const abstand = Math.hypot(delta.x, delta.y);
  // Exakt aufeinander: irgendeine Richtung ist besser als NaN.
  const normale = abstand < 0.001 ? { x: 1, y: 0 } : { x: delta.x / abstand, y: delta.y / abstand };
  if (abstand < mindestabstand) {
    const ziel = { x: hindernis.x + normale.x * mindestabstand, y: hindernis.y + normale.y * mindestabstand };
    if (frei(ziel)) koerper.position = ziel;
  }
  const einwaerts = koerper.velocity.x * normale.x + koerper.velocity.y * normale.y;
  if (einwaerts >= 0) return;
  koerper.velocity = {
    x: koerper.velocity.x - normale.x * einwaerts,
    y: koerper.velocity.y - normale.y * einwaerts
  };
}

export function projectileSubstepCount(maximumSpeed: number, dt: number, stepDistance: number, maximumSubsteps = 12): number {
  if (!Number.isFinite(maximumSpeed) || maximumSpeed <= 0 || dt <= 0) return 1;
  return Math.max(1, Math.min(maximumSubsteps, Math.ceil(maximumSpeed * dt / Math.max(1, stepDistance))));
}

interface Positioned { position: Vector2; }
export class SpatialHash<T extends Positioned> {
  private readonly buckets = new Map<string, T[]>();
  constructor(private readonly cellSize: number) {}
  clear(): void { this.buckets.clear(); }
  insert(value: T): void {
    const key = this.keyFor(value.position.x, value.position.y);
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(value);
    else this.buckets.set(key, [value]);
  }
  rebuild(values: Iterable<T>): void {
    this.clear();
    for (const value of values) this.insert(value);
  }
  query(position: Vector2, radius: number): T[] {
    const minimumX = Math.floor((position.x - radius) / this.cellSize);
    const maximumX = Math.floor((position.x + radius) / this.cellSize);
    const minimumY = Math.floor((position.y - radius) / this.cellSize);
    const maximumY = Math.floor((position.y + radius) / this.cellSize);
    const results: T[] = [];
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const bucket = this.buckets.get(`${x}:${y}`);
        if (bucket) results.push(...bucket);
      }
    }
    return results;
  }
  private keyFor(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(y / this.cellSize)}`;
  }
}
