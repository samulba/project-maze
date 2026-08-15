/**
 * Wie viel Zeit ein Bild anrechnen darf – als reine Funktion, damit es Tests
 * dafür gibt.
 *
 * Sam, 14.08. abends: „locker 1–2 SEKUNDEN LAGGY / Verzögerung und super
 * langsam, fast in abgehackter Zeitlupe."
 *
 * ## Was der Fehler war
 *
 * Im Renderer stand `Math.min(.05, ticker.deltaMS/1000)`. An diesem einen Wert
 * hängt ALLES, was der Client über Zeit weiß: die Interpolation auf die
 * Serverposition, die Rückstoßfeder, Partikel, Ringe, Schadenszahlen, das
 * Ausblenden der Kugeln.
 *
 * Ein Deckel von 50 ms heißt: **Unterhalb von 20 Bildern je Sekunde rechnet der
 * Client die Welt langsamer als die Uhr.**
 *
 * | Bildmaß | wirklich vergangen | angerechnet | Welttempo |
 * | ---: | ---: | ---: | ---: |
 * | 60 fps | 17 ms | 17 ms | 100 % |
 * | 20 fps | 50 ms | 50 ms | 100 % |
 * | 10 fps | 100 ms | 50 ms | **50 %** |
 * |  5 fps | 200 ms | 50 ms | **25 %** |
 *
 * Das ist die Zeitlupe. Die Verzögerung kommt aus derselben Zeile: Die
 * Annäherung an die Serverposition rechnet mit demselben zu kleinen Schritt und
 * kommt deshalb nie an.
 *
 * ## Warum der Deckel trotzdem bleibt
 *
 * Ohne ihn schleudert ein Tab-Wechsel nach zehn Sekunden alles quer – ein Bild
 * mit `delta = 10` bewegt jedes Teilchen um das Vierhundertfache. Falsch war
 * nicht der Deckel, sondern seine Höhe und was jenseits davon passiert.
 */

/**
 * Bis hierher zählt die echte Zeit (200 ms = 5 fps). Ein niedriges Bildmaß
 * bleibt damit **ruckelig statt zeitlupig** – ehrlich, und es fühlt sich richtig
 * an: Man sieht wenige Bilder, aber die Welt läuft in Echtzeit.
 */
export const ECHTZEIT_DECKEL = 0.2;

/**
 * Ab hier war es kein langsames Bild, sondern eine Pause (Tab-Wechsel,
 * Nachladen, schlafender Laptop). Dann wird gesprungen statt gerechnet: Sich
 * über eine Sekunde Rückstand heranzuinterpolieren wäre genau das Kriechen, das
 * Sam als Verzögerung beschreibt.
 */
export const SPRUNG_SEKUNDEN = 0.5;

export interface Bildschritt {
  /** Die Zeit, mit der dieses Bild gerechnet wird, in Sekunden. */
  schritt: number;
  /** Vorher alle Ansichten auf ihren Zielpunkt setzen? */
  sprung: boolean;
}

/**
 * Der Schritt für ein Bild. `null` heißt „dieses Bild überspringen" – ein
 * Schritt von 0 oder ein unsinniger Wert (der erste Tick nach dem Start liefert
 * gelegentlich `NaN`) darf nicht in die Abklingrechnungen laufen.
 */
export function bildschritt(roh: number): Bildschritt | null {
  if (!Number.isFinite(roh) || roh <= 0) return null;
  // Nach einer Pause beginnt das nächste Bild synchron; gerechnet wird es mit
  // einem normalen Schritt, damit Federn und Partikel nicht springen.
  if (roh > SPRUNG_SEKUNDEN) return { schritt: 1 / 60, sprung: true };
  return { schritt: Math.min(ECHTZEIT_DECKEL, roh), sprung: false };
}

/**
 * Welttempo bei einem gegebenen Bildmaß – 1 heißt Echtzeit.
 *
 * Nur für Tests und die Beweisführung: Sie macht die Tabelle oben nachprüfbar,
 * statt sie zu behaupten.
 */
export function welttempo(bildmass: number): number {
  const roh = 1 / bildmass;
  const schritt = bildschritt(roh);
  if (!schritt) return 0;
  return (schritt.schritt * bildmass);
}
