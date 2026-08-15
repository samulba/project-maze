import type { Wall } from '@project-maze/shared';

/**
 * Eine Zahl, die sich ändert, sobald sich die sichtbaren Wände ändern.
 *
 * Der Renderer zeichnet die Wände nur neu, wenn sie sich geändert haben – die
 * Frage stellt er aber bei JEDEM Snapshot, also zwanzigmal je Sekunde. Vorher
 * baute er dafür eine Zeichenkette aus allen Wänden (`id:x:y:w:h`, verbunden
 * mit `|`): rund neun Kilobyte für 230 Wände, zwanzigmal je Sekunde, also
 * 180 kB Müll je Sekunde für eine Antwort, die fast immer „nein" lautet.
 *
 * Stattdessen eine Streuzahl (FNV-1a über dieselben Felder). Sie entsteht ohne
 * Zwischenspeicher, ist genauso empfindlich gegen Verschieben, Verschwinden
 * und Hinzukommen – und kostet keine Kilobyte.
 *
 * **Warum eine Streuzahl vertretbar ist:** Der Preis ist ein theoretischer
 * Zusammenstoß, bei dem eine geänderte Wand unbemerkt bliebe. Die Wände dieses
 * Spiels stehen auf einem 480er-Raster und werden nicht bewegt, sondern nur
 * ab- und wieder angeschaltet; die Zahl der wirklich vorkommenden Zustände ist
 * winzig gegen 2^32. Wäre das anders, gehörte hier ein Zähler vom Server her –
 * keine längere Zeichenkette.
 */
export function wandKennung(walls: readonly Wall[]): number {
  // FNV-1a, 32 Bit. `Math.imul` hält die Multiplikation in 32 Bit, sonst
  // rutscht sie in Fließkomma und die unteren Bits gehen verloren.
  let hash = 0x811c9dc5;
  const mische = (wert: number): void => {
    hash ^= wert | 0;
    hash = Math.imul(hash, 0x01000193);
  };
  mische(walls.length);
  for (const wall of walls) {
    // Die Kennung geht zeichenweise ein: Sie unterscheidet zwei Wände, die
    // zufällig auf derselben Stelle stünden (Fracture tauscht keine, aber der
    // Vergleich soll nicht davon abhängen).
    for (let index = 0; index < wall.id.length; index += 1) mische(wall.id.charCodeAt(index));
    mische(wall.x);
    mische(wall.y);
    mische(wall.width);
    mische(wall.height);
  }
  return hash | 0;
}
