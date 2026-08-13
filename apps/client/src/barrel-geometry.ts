import type { ClassDefinition, PlayerClass } from '@project-maze/shared';

/**
 * Dicke der Schussröhre (C2, C3) – als reine Funktion, damit sie prüfbar ist.
 *
 * Sam, C2: „Bei den Tanks könnte man die Schussröhre etwas dicker machen,
 * von Tank zu Tank unterschiedlich – außer Sniper." Vorher gab es nur drei
 * Werte für über fünfzig Klassen (precision 12, impact 16, sonst 14) – kein
 * Design-Spielraum, nur drei Töpfe.
 *
 * Sam, C3: „Bei Sniper ist ein mini dünnes Rohr, aber lang, dafür eine
 * richtig fette Kugel – die passt da ja gar nicht durch." Das stimmt: Sniper
 * feuert einen Radius-8-Ball durch eine 12 px breite Röhre, und seit Stufe 2
 * ("Größe hoch und mit Level wachsend") wächst diese Kugel mit dem Level
 * noch weiter. Ohne diesen Zusammenhang zu kennen, wäre C3 ein zweites Mal
 * dasselbe Problem in drei Wochen – deshalb rechnet dieselbe Funktion beides.
 */

const ALTE_STUFE = (branch: ClassDefinition['branch']): number => (branch === 'precision' ? 12 : branch === 'impact' ? 16 : 14);

/**
 * `barrelLength` variiert längst pro Klasse (20–70 px) – daraus lässt sich
 * echte Tank-zu-Tank-Abwechslung ableiten, statt fünfzig neue Zahlen zu
 * erfinden. Auf die alte Stufe (nicht ersetzt, addiert): jede Klasse wird
 * *mindestens* 2 px dicker als vorher, plus bis zu 6 px zusätzlich für lange
 * Läufe – die eigentliche Vielfalt.
 */
const laengenBreite = (branch: ClassDefinition['branch'], barrelLength: number): number =>
  ALTE_STUFE(branch) + 2 + Math.min(6, Math.max(0, (barrelLength - 20) / 50) * 6);

/**
 * Mindestbreite, damit die eigene Kugel (roher `projectileRadius`, ohne die
 * levelabhängige Wachstumsrampe aus `projectile-speed.ts` – die lebt im
 * Server und würde die Röhre bei Stufe 60 auf Kugelgröße aufblasen, das
 * Sniper-Rohr soll erkennbar dünn bleiben) als Durchmesser plus Wandstärke
 * hineinpasst.
 */
const kugelBreite = (projectileRadius: number): number => projectileRadius * 1.7;

/** Realistische Obergrenze, damit ein Ausreißer nicht komisch aussieht. */
const MAX_BREITE = 28;

export function barrelHeightFor(definition: Pick<ClassDefinition, 'branch' | 'barrelLength' | 'projectileRadius'>, playerClass: PlayerClass): number {
  // Sniper bleibt das dünnste, längste Rohr im Spiel (Sam: „außer Sniper") –
  // aber breit genug für die eigene Kugel, nicht die allgemeine Regel.
  if (playerClass === 'sniper') return Math.max(14, kugelBreite(definition.projectileRadius));
  return Math.min(MAX_BREITE, Math.max(laengenBreite(definition.branch, definition.barrelLength), kugelBreite(definition.projectileRadius)));
}
