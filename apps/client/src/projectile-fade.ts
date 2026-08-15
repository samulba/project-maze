import type { Vector2, Wall } from '@project-maze/shared';

/**
 * Das Ausblenden verschwundener Kugeln – als reine Logik, damit es prüfbar ist.
 *
 * Sam, Spieltest vom 14.08., Punkt 2:
 *
 * > „KUGELN verschwinden zu ABRUPT, sollten cleaner verschwinden, verblassen
 * > wenn die zu weit wegfliegen oder irgendwas hitten wie die Wand z.B."
 *
 * Er hat wörtlich recht: `syncProjectiles` löschte die Ansicht in genau dem
 * Tick, in dem das Projektil aus dem Snapshot fiel. Eine Kugel war da – und im
 * nächsten Bild nicht mehr, ohne Übergang, egal ob sie in eine Wand
 * eingeschlagen war oder ihre Reichweite erreicht hatte.
 *
 * **Der Server schickt keinen Grund mit.** Er löscht das Projektil, mehr steht
 * nicht auf der Leitung. Den Unterschied, den Sam selbst benennt, rekonstruiert
 * deshalb der Client aus dem, was er ohnehin hat: Liegt ein Stück VOR der
 * letzten bekannten Position eine Wand, war es ein Einschlag. Eine eigene
 * Netzmeldung dafür wäre Bandbreite für eine Information, die schon dasteht.
 *
 * Eigene Datei nach dem Vorbild von `drone-draw.ts`: Der Renderer bekommt seine
 * Bilder in dieser Umgebung nicht schnell genug, um eine Bewegung von einer
 * Viertelsekunde sichtbar zu machen – als reine Funktion ist sie in einem
 * Millisekundentest belegbar.
 */

/**
 * Ausblendzeiten. Der Einschlag ist kurz und hart – eine Wand nimmt der Kugel
 * die Bewegung, da gibt es nichts zu verglühen. Das Reichweitenende ist das
 * Gegenteil: Die Kugel fliegt aus und wird dabei blass und kleiner, so wie sie
 * in Diep.io ausläuft.
 */
export const KUGEL_EINSCHLAG_SEKUNDEN = 0.11;
export const KUGEL_VERGLUEHEN_SEKUNDEN = 0.26;
/** Mehr gleichzeitig verglimmende Kugeln zeigt kein Bild sinnvoll. */
export const MAX_VERGLIMMENDE = 90;
/**
 * Wie stark eine ausfliegende Kugel dabei ausrollt (e-Funktion je Sekunde).
 * Ohne das flöge sie mit vollem Tempo weiter und würde bloß durchsichtig –
 * das sähe aus wie ein Zeichenfehler, nicht wie ein Auslaufen.
 */
export const AUSROLLEN_PRO_SEKUNDE = 3.2;

/** Eine Kugel, die der Server nicht mehr schickt, die aber noch ausgeblendet wird. */
export interface VerglimmendeKugel {
  position: Vector2;
  velocity: Vector2;
  radius: number;
  color: number;
  life: number;
  maxLife: number;
  /** Wand getroffen (kurzer Aufprall) statt Reichweite erreicht (weiches Auslaufen). */
  einschlag: boolean;
}

/**
 * Steht ein Stück in Flugrichtung eine Wand?
 *
 * Der Vorlauf ist ein Kugelradius plus ein fester Rest: Die gezeichnete
 * Position hinkt der Serverposition um eine Interpolationsspanne hinterher, der
 * Einschlagpunkt liegt also immer ein Stück vor dem, was zuletzt zu sehen war.
 */
export function trifftWand(position: Vector2, velocity: Vector2, radius: number, walls: readonly Wall[]): boolean {
  const tempo = Math.hypot(velocity.x, velocity.y);
  if (tempo < 1) return false;
  const vorlauf = radius + 14;
  const punkt = { x: position.x + (velocity.x / tempo) * vorlauf, y: position.y + (velocity.y / tempo) * vorlauf };
  return walls.some((wall) =>
    punkt.x + radius > wall.x && punkt.x - radius < wall.x + wall.width &&
    punkt.y + radius > wall.y && punkt.y - radius < wall.y + wall.height);
}

/** Was der Renderer über eine gerade verschwundene Kugel weiß. */
export interface LetzterStand {
  position: Vector2;
  velocity: Vector2;
  radius: number;
  color: number;
}

/** Hängt eine verschwundene Kugel ans Ausblenden an und hält die Liste gedeckelt. */
export function verglimmenLassen(liste: VerglimmendeKugel[], stand: LetzterStand, einschlag: boolean): void {
  if (liste.length >= MAX_VERGLIMMENDE) liste.shift();
  const maxLife = einschlag ? KUGEL_EINSCHLAG_SEKUNDEN : KUGEL_VERGLUEHEN_SEKUNDEN;
  liste.push({
    position: { ...stand.position },
    // Der Einschlag bringt die Kugel zum Stehen, das Reichweitenende nicht.
    velocity: einschlag ? { x: 0, y: 0 } : { ...stand.velocity },
    radius: stand.radius,
    color: stand.color,
    life: maxLife,
    maxLife,
    einschlag
  });
}

/** Lässt die Liste altern; abgelaufene Kugeln fallen heraus. */
export function stepVerglimmende(liste: VerglimmendeKugel[], delta: number): void {
  for (let index = liste.length - 1; index >= 0; index -= 1) {
    const kugel = liste[index];
    if (!kugel) continue;
    kugel.life -= delta;
    if (kugel.life <= 0) { liste.splice(index, 1); continue; }
    kugel.position = { x: kugel.position.x + kugel.velocity.x * delta, y: kugel.position.y + kugel.velocity.y * delta };
    const bremse = Math.exp(-AUSROLLEN_PRO_SEKUNDE * delta);
    kugel.velocity = { x: kugel.velocity.x * bremse, y: kugel.velocity.y * bremse };
  }
}

/** Die Teilmenge von PixiJS' Graphics, die das Ausblenden braucht. */
export interface Zeichenflaeche {
  circle(x: number, y: number, radius: number): Zeichenflaeche;
  fill(stil: unknown): Zeichenflaeche;
}

/**
 * Zeichnet die verglimmenden Kugeln.
 *
 * Bewusst in derselben Ebene wie die lebenden Kugeln – sonst springt eine Kugel
 * im Moment des Verschwindens vor oder hinter alles andere, und genau dieser
 * Sprung ist das „abrupt", das Sam meint.
 */
export function zeichneVerglimmende(flaeche: Zeichenflaeche, liste: readonly VerglimmendeKugel[], schmuck = true): void {
  // Auf der untersten Qualitätsstufe entfällt der Hof: zwei gefüllte Flächen je
  // ausblendender Kugel, mal bis zu neunzig gleichzeitig, für einen Schimmer.
  // Das Ausblenden selbst bleibt – es ist Sams Punkt 2, nicht Verzierung.
  for (const kugel of liste) {
    const rest = Math.max(0, Math.min(1, kugel.life / kugel.maxLife));
    // Einschlag: dehnt sich kurz auf. Reichweitenende: schrumpft weg.
    const radius = kugel.einschlag ? kugel.radius * (1 + (1 - rest) * 0.8) : kugel.radius * (0.35 + rest * 0.65);
    if (radius <= 0.2) continue;
    if (schmuck) flaeche.circle(kugel.position.x, kugel.position.y, radius + 2).fill({ color: kugel.color, alpha: rest * 0.12 });
    flaeche.circle(kugel.position.x, kugel.position.y, radius).fill({ color: kugel.color, alpha: rest * (kugel.einschlag ? 0.55 : 0.8) });
  }
}
