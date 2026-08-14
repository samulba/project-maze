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

/**
 * Grobraster für die Frage „welcher Körper berührt diesen Punkt?" – **ohne
 * Zwischenliste**.
 *
 * ## Warum eigen und nicht `SpatialHash`
 *
 * `SpatialHash.query` baut für jede Abfrage ein Array. Für die Projektilpaare
 * (ein paar Dutzend, einmal je Teilschritt) ist das egal. Für die heißen
 * Schleifen ist genau diese Liste die Rechnung:
 *
 * | Schleife | vorher je Tick |
 * | --- | --- |
 * | jede Drohne gegen jede Form | 160 × `[...shapes.values()]` à 562 Einträge |
 * | jedes Projektil gegen jede Form | je Teilschritt dasselbe |
 *
 * Gemessen am 14.08. in einer Arena mit 160 Drohnen: `stepDrones` allein war
 * **30 % des Ticks**, fast vollständig in dieser einen `.find()`-Zeile. Der
 * lineare Durchlauf war seit jeher da; sichtbar wurde er, als Drohnen zu festen
 * Körpern wurden (Sams Punkt 7) und die Berührung deshalb in JEDEM Tick
 * aufgelöst werden muss statt nur, wenn der Rempler nachgeladen hat.
 *
 * ## Warum das Raster den größten Radius mitführt
 *
 * Es rastet auf die **Mitte** eines Körpers ein. Eine große Form kann in der
 * Nachbarzelle sitzen und trotzdem hereinragen. Wer nach Berührung fragt, muss
 * den Suchbereich deshalb um den größten vorkommenden Radius aufweiten – sonst
 * fliegt eine Kugel durch ein Pentagon, weil dessen Mittelpunkt eine Zelle
 * weiter liegt. Der Wert wird beim Aufbau gemessen und nicht angenommen: Elite-
 * Formen (`arena-systems.ts`) tragen eigene Radien.
 */
export class Koerperraster<T extends { position: Vector2 }> {
  private readonly zellen = new Map<number, T[]>();
  private groessterRadius = 0;
  private gebautFuer = Number.NaN;

  /**
   * Alles drei als Funktion – und das ist der Punkt.
   *
   * `quelle`: Woher die Körper kommen. `radiusVon`: Formen tragen ihren Radius
   * als `radius`, Drohnen als `gameplayRadius ?? 12`. `stand`: die Tick-Nummer.
   *
   * **Das Raster baut sich selbst neu, sobald der Stand sich geändert hat.**
   * Der erste Anlauf am 14.08. ließ `step()` es aufbauen – und fiel damit über
   * genau die Falle, vor der der Kopf von `simulation-hardening.ts` warnt: Wer
   * `stepDrones` oder `stepProjectiles` direkt ruft (die Tests tun das, und
   * jede ersetzende Schicht könnte es), bekam ein leeres Raster und damit
   * lautlos keine Treffer mehr. Ein Zwischenspeicher, den der Aufrufer pflegen
   * muss, ist kein Zwischenspeicher, sondern eine Verabredung.
   *
   * Gültig ist der Stand für alles, was NACH der Bewegung der Körper fragt –
   * Formen bewegen sich am Anfang des Ticks, Drohnen in `stepDrones`, und
   * beide werden erst danach nach Treffern gefragt.
   */
  constructor(
    private readonly quelle: () => Iterable<T>,
    private readonly radiusVon: (koerper: T) => number,
    private readonly stand: () => number,
    private readonly zellgroesse = 64
  ) {}

  private auffrischen(): void {
    const jetzt = this.stand();
    if (jetzt === this.gebautFuer) return;
    this.gebautFuer = jetzt;
    this.zellen.clear();
    this.groessterRadius = 0;
    for (const einer of this.quelle()) {
      const radius = this.radiusVon(einer);
      if (radius > this.groessterRadius) this.groessterRadius = radius;
      const schluessel = this.schluesselFuer(einer.position.x, einer.position.y);
      const fach = this.zellen.get(schluessel);
      if (fach) fach.push(einer);
      else this.zellen.set(schluessel, [einer]);
    }
  }

  /**
   * Erzwingt den Neuaufbau vor der nächsten Frage.
   *
   * Gebraucht dort, wo sich Körper INNERHALB eines Ticks bewegen, nachdem das
   * Raster schon einmal gefragt wurde – der Regelfall braucht das nicht.
   */
  entwerten(): void { this.gebautFuer = Number.NaN; }

  /**
   * Der erste Körper, der einen Kreis (`position`, `radius`) berührt.
   *
   * Die Überlappungsrechnung steckt bewusst HIER und nicht beim Aufrufer: Sie
   * stand am 14.08. an vier Stellen wörtlich gleich im Code – in `game.ts`
   * zweimal, in `simulation-hardening.ts` und in `drone-tuning.ts` –, und jede
   * Kopie war eine Gelegenheit, sie auseinanderlaufen zu lassen.
   */
  finde(position: Vector2, radius: number, passt?: (kandidat: T) => boolean): T | undefined {
    this.auffrischen();
    const reichweite = radius + this.groessterRadius;
    const vonX = Math.floor((position.x - reichweite) / this.zellgroesse);
    const bisX = Math.floor((position.x + reichweite) / this.zellgroesse);
    const vonY = Math.floor((position.y - reichweite) / this.zellgroesse);
    const bisY = Math.floor((position.y + reichweite) / this.zellgroesse);
    for (let x = vonX; x <= bisX; x += 1) {
      for (let y = vonY; y <= bisY; y += 1) {
        const fach = this.zellen.get(x * 65_536 + y);
        if (!fach) continue;
        for (const kandidat of fach) {
          const dx = kandidat.position.x - position.x;
          const dy = kandidat.position.y - position.y;
          const beruehrung = this.radiusVon(kandidat) + radius;
          if (dx * dx + dy * dy > beruehrung * beruehrung) continue;
          if (passt && !passt(kandidat)) continue;
          return kandidat;
        }
      }
    }
    return undefined;
  }

  private schluesselFuer(x: number, y: number): number {
    return Math.floor(x / this.zellgroesse) * 65_536 + Math.floor(y / this.zellgroesse);
  }
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
