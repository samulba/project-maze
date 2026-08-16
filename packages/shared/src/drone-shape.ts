/**
 * Wie eine Drohne aussieht – Teil D des finalen Klassenauftrags.
 *
 * Bis hierher war jede Drohne im Spiel ein Dreieck, in allen zehn Klassen. Der
 * Auftrag gibt jeder Klasse eine eigene Form, einen eigenen Radius und einen
 * eigenen Haltbarkeitsfaktor – und das ist der letzte Ort, an dem sich die zehn
 * Drohnenklassen bisher NICHT unterschieden haben.
 *
 * Die Formen stehen hier und nicht im Client, weil der Radius zugleich der
 * Trefferradius ist: Eine Form, die der Client allein kennt, würde früher oder
 * später anders aussehen, als sie getroffen wird.
 *
 * Alle Formen zeigen nach +X (Flugrichtung) und sind um ihren Mittelpunkt
 * gebaut.
 */

export type Drohnenform =
  | 'triangle'
  | 'small-triangle'
  | 'diamond'
  | 'micro-diamond'
  | 'square'
  | 'rectangle'
  | 'hexagon'
  | 'shield-kite'
  | 'royal-kite'
  | 'chevron';

/** Regelmäßiges Vieleck mit `ecken` Ecken, Umkreisradius `r`, Spitze auf +X. */
const vieleck = (ecken: number, r: number): number[] => {
  const punkte: number[] = [];
  for (let i = 0; i < ecken; i += 1) {
    const winkel = (i / ecken) * Math.PI * 2;
    punkte.push(Math.cos(winkel) * r, Math.sin(winkel) * r);
  }
  return punkte;
};

/**
 * Die Eckpunkte einer Drohnenform, als `[x0, y0, x1, y1, …]`.
 *
 * `r` ist das Maß aus dem Auftrag: Umkreisradius bei den Vielecken, halbe
 * Kantenlänge beim Quadrat, halbe Länge beim Rechteck und beim Chevron.
 */
export function drohnenEcken(form: Drohnenform, r: number): number[] {
  switch (form) {
    case 'triangle':
    case 'small-triangle':
      return vieleck(3, r);
    case 'diamond':
    case 'micro-diamond':
      return vieleck(4, r);
    case 'square': {
      /*
       * Achsenparallel, im Gegensatz zur Raute nicht gedreht.
       *
       * `r` ist der UMKREIS, nicht die halbe Kante – das ist eine bewusste
       * Abweichung vom Auftrag („Halbkante 10 px"). Mit halber Kante 10 lägen
       * die Ecken bei 14,1 px, während der Server mit Trefferradius 10 rechnet:
       * Eine Factory-Drohne wäre 41 % größer gezeichnet, als sie getroffen wird.
       * Genau diese Fehlerklasse steckte auch im Rumpf (dort 24 gezeichnet, 22
       * getroffen) und ist heute behoben worden; sie hier neu einzubauen wäre
       * absurd. Gezeichnet ist, was getroffen wird.
       */
      const halbeKante = r / Math.SQRT2;
      return [halbeKante, -halbeKante, halbeKante, halbeKante, -halbeKante, halbeKante, -halbeKante, -halbeKante];
    }
    case 'rectangle': {
      // Auftrag: 20 × 14 px – das Verhältnis bleibt, die Größe folgt wie beim
      // Quadrat dem Umkreis, damit gezeichnet und getroffen dasselbe ist.
      const verhaeltnis = 14 / 20;
      const halbeLaenge = r / Math.hypot(1, verhaeltnis);
      const halbeBreite = halbeLaenge * verhaeltnis;
      return [halbeLaenge, -halbeBreite, halbeLaenge, halbeBreite, -halbeLaenge, halbeBreite, -halbeLaenge, -halbeBreite];
    }
    case 'hexagon':
      return vieleck(6, r);
    case 'shield-kite':
      // Drachen: lange Spitze nach vorn, breiteste Stelle hinter der Mitte.
      return [r, 0, -r * 0.15, r * 0.78, -r * 0.9, 0, -r * 0.15, -r * 0.78];
    case 'royal-kite': {
      /*
       * Wie der Schilddrachen, aber mit kurzer hinterer Spitze (Auftrag).
       *
       * Die hintere Spitze ist im Auftrag länger als die vordere (1,05 zu 1,0).
       * Damit die weiteste Ecke trotzdem genau auf dem Trefferradius liegt, wird
       * die ganze Form durch 1,05 geteilt: Das Verhältnis vorn/hinten bleibt, die
       * Silhouette passt zum Treffer.
       */
      const s = r / 1.05;
      return [s, 0, -s * 0.1, s * 0.72, -s * 1.05, 0, -s * 0.1, -s * 0.72];
    }
    case 'chevron': {
      /*
       * Vier Eckpunkte: Spitze vorn, zwei Flügel, eine Kerbe hinten.
       *
       * Auftrag: 28 px lang, 18 px breit, also halbe Länge zu halber Breite wie
       * 14 zu 9. Die weitesten Punkte sind die beiden hinteren Flügelspitzen –
       * die liegen bei halber Länge × hypot(1, 9/14) = 1,19 × halbe Länge. Wie
       * beim Quadrat wird deshalb auf den UMKREIS normiert statt auf die halbe
       * Länge, sonst ragen die Flügel 19 % über den Trefferradius hinaus.
       */
      const verhaeltnis = 9 / 14;
      const halbeLaenge = r / Math.hypot(1, verhaeltnis);
      const halbeBreite = halbeLaenge * verhaeltnis;
      return [halbeLaenge, 0, -halbeLaenge, halbeBreite, -halbeLaenge * 0.45, 0, -halbeLaenge, -halbeBreite];
    }
    default:
      return vieleck(3, r);
  }
}
