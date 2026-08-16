import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { messfeld } from './messfeld';

/**
 * Pro-Lauf-Profile (Klassen 4.2, Stufe 4, Schritt 2 – Plan „26-plan-rework":
 * „Das ist der Schritt, der Spreadshot von Penta trennt.").
 *
 * `barrels` gibt einzelnen Läufen einen eigenen Schaden-/Tempo-Faktor statt
 * derselben Werte für alle. Storm ist der erste Fall: die beiden mittleren
 * Läufe treffen härter und fliegen langsamer, die äußeren sind schwächer und
 * schneller – derselbe Gesamtschaden pro Salve, ein anderes Gefühl.
 */

const DT = 1 / 40;
const OFFEN = messfeld(240);

interface Interna {
  players: Map<string, any>;
  projectiles: Map<string, { id: string; ownerId: string; damage: number; velocity: { x: number; y: number } }>;
  shapes: Map<string, any>;
}

const bauen = () => {
  const game = tuneCombatScaling(new MazeGame(0));
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

const schuetze = (game: MazeGame, interna: Interna, klasse: string) => {
  const id = game.addPlayer('Schütze');
  const spieler = interna.players.get(id);
  spieler.playerClass = klasse;
  spieler.level = 45;
  spieler.position = { ...OFFEN };
  spieler.velocity = { x: 0, y: 0 };
  spieler.move = { x: 0, y: 0 };
  spieler.aim = { x: 400, y: 0 };
  spieler.primary = false;
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  return { id, spieler };
};

const salve = (game: MazeGame, spieler: any, now: number): number => {
  spieler.cooldown = 0;
  spieler.primary = true;
  now += 25;
  game.step(DT, now);
  spieler.primary = false;
  return now;
};

describe('Pro-Lauf-Profile (Klassen 4.2, Schritt 2)', () => {
  it('setzt Testannahmen: Storm ist ein gestaffelter Vierer-Fächer, Gesamt-damageScale = barrelCount', () => {
    const storm = CLASS_DEFINITIONS.storm;
    expect(storm.barrels).toHaveLength(4);
    /*
     * Dritte Fassung dieser Annahme, und die Begründung steht jedes Mal im
     * Auftrag, der sie gesetzt hat:
     *
     * 1. Ursprünglich der ausgeschriebene Fächer aus `barrelCount`/`barrelSpread`.
     * 2. Am 16.08. ein Doppel-Twin (zwei parallele Paare), nach Sams Diep.io-Bild.
     * 3. Seit dem finalen Klassenauftrag ein GESTAFFELTER Fächer: vier Winkel
     *    (−18/−6/+6/+18°), die inneren Läufe länger und stärker, die äußeren
     *    kürzer und schwächer.
     *
     * Der Auftrag löst dabei ausdrücklich einen Widerspruch auf (Vorwort,
     * Punkt 3): Der alte Text versprach unterschiedliche Kugeltempos je Lauf,
     * obwohl es nur EINEN Klassenwert für Kugeltempo gibt. Deshalb trägt Storm
     * jetzt kein `speedScale` mehr – verteilt wird allein der Schaden.
     */
    const winkel = storm.barrels!.map((profil) => Math.round((profil.angle ?? 0) * 180 / Math.PI));
    expect(winkel).toEqual([-18, -6, 6, 18]);
    expect(storm.barrels!.some((profil) => profil.speedScale !== undefined)).toBe(false);

    // Innen länger und stärker als außen – das ist die Aussage der Form.
    const [aussenLinks, innenLinks] = storm.barrels!;
    expect(innenLinks!.laenge!).toBeGreaterThan(aussenLinks!.laenge!);
    expect(innenLinks!.damageScale!).toBeGreaterThan(aussenLinks!.damageScale!);

    const summe = storm.barrels!.reduce((sum, profil) => sum + (profil.damageScale ?? 1), 0);
    expect(summe).toBeCloseTo(storm.barrelCount, 6);
  });

  it('lässt kein Lauf-Profil den Gesamtschaden einer Klasse verschieben', () => {
    // Die Regel gilt für JEDE Klasse mit Profilen, nicht nur für Storm: Ein
    // Profil verteilt Schaden über die Läufe, es erfindet keinen.
    for (const id of PLAYER_CLASS_IDS) {
      const tank = CLASS_DEFINITIONS[id];
      if (!tank.barrels) continue;
      const summe = tank.barrels.reduce((sum, b) => sum + (b.damageScale ?? 1), 0);
      expect(summe, id).toBeCloseTo(tank.barrelCount, 6);
    }
  });

  it('gibt einem Twin zwei PARALLELE Rohre – nicht zwei Strahlen aus einem Punkt', () => {
    /*
     * Sam, 16.08., mit dem Diep.io-Klassenbaum: „vor allem wenn's mehrere Rohre
     * sind, dann haben die das viel cleaner hinbekommen." Die Ursache war eine
     * fehlende Zahl – `versatz`. Ohne sie ist ein Twin nicht darstellbar.
     */
    const twin = CLASS_DEFINITIONS.twin;
    expect(twin.barrels).toHaveLength(2);
    const [links, rechts] = twin.barrels!;
    expect(links!.angle ?? 0).toBeCloseTo(rechts!.angle ?? 0, 9);
    expect(links!.versatz).toBeLessThan(0);
    expect(rechts!.versatz).toBeGreaterThan(0);
  });

  it('lässt die beiden mittleren Läufe härter treffen – bei gleichem Kugeltempo', () => {
    const { game, interna } = bauen();
    const { id, spieler } = schuetze(game, interna, 'storm');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(4);

    salve(game, spieler, 100_000);
    expect(interna.projectiles.size).toBe(4);

    const schuesse = [...interna.projectiles.values()];
    for (const schuss of schuesse) expect(schuss.ownerId).toBe(id);

    const schaeden = schuesse.map((s) => s.damage).sort((a, b) => a - b);
    // Außen 0,75×, innen 1,25× – Summe 4 = barrelCount, also derselbe
    // Gesamtschaden je Salve wie ohne Profil.
    expect(schaeden[0]).toBeCloseTo(stats.damage * 0.75, 5);
    expect(schaeden[1]).toBeCloseTo(stats.damage * 0.75, 5);
    expect(schaeden[2]).toBeCloseTo(stats.damage * 1.25, 5);
    expect(schaeden[3]).toBeCloseTo(stats.damage * 1.25, 5);
    expect(schaeden.reduce((summe, wert) => summe + wert, 0)).toBeCloseTo(stats.damage * 4, 5);

    /*
     * **Alle vier Kugeln fliegen gleich schnell.** Vorher trugen die Läufe
     * `speedScale` 1,15/0,92 – der Klassentext versprach das auch. Der finale
     * Klassenauftrag löst den Widerspruch auf (Vorwort, Punkt 3): Es gibt nur
     * EINEN Klassenwert für Kugeltempo, ein Tempo je Lauf war nie eine echte
     * Eigenschaft. Verteilt wird allein der Schaden.
     */
    const tempi = schuesse.map((s) => Math.hypot(s.velocity.x, s.velocity.y));
    for (const tempo of tempi) expect(tempo).toBeCloseTo(stats.projectileSpeed, 5);
  });

  it('schüttet pro Salve exakt denselben Gesamtschaden aus wie ohne Pro-Lauf-Profil', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'storm');
    const stats = tunedStatsFor(spieler);

    salve(game, spieler, 100_000);
    const gesamtschaden = [...interna.projectiles.values()].reduce((sum, p) => sum + p.damage, 0);
    expect(gesamtschaden).toBeCloseTo(stats.damage * stats.barrelCount, 6);
  });

  it('lässt Klassen ohne barrels unverändert: jeder Lauf trägt exakt stats.damage/-speed', () => {
    const { game, interna } = bauen();
    const { spieler } = schuetze(game, interna, 'gatling');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(6);

    salve(game, spieler, 100_000);
    expect(interna.projectiles.size).toBe(6);
    for (const schuss of interna.projectiles.values()) {
      expect(schuss.damage).toBeCloseTo(stats.damage, 6);
      expect(Math.hypot(schuss.velocity.x, schuss.velocity.y)).toBeCloseTo(stats.projectileSpeed, 3);
    }
  });
});
