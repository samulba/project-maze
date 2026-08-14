import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS } from '@project-maze/shared';
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
  it('setzt Testannahmen: Storm trägt vier Läufe mit derselben Winkelaufteilung wie zuvor, Gesamt-damageScale = barrelCount', () => {
    const storm = CLASS_DEFINITIONS.storm;
    expect(storm.barrels).toBeDefined();
    expect(storm.barrels).toHaveLength(4);
    // Dieselben Winkel, die auch die alte Fächer-Formel (barrel/(N-1)-0.5)*spread
    // für barrelCount 4 / barrelSpread 0.3 liefert – Client-Rohrgrafik rechnet
    // weiter über barrelSpread und darf sich NICHT verschieben.
    const erwarteteWinkel = [0, 1, 2, 3].map((barrel) => (barrel / 3 - 0.5) * storm.barrelSpread);
    storm.barrels!.forEach((b, i) => expect(b.angle).toBeCloseTo(erwarteteWinkel[i], 9));
    const summe = storm.barrels!.reduce((sum, b) => sum + (b.damageScale ?? 1), 0);
    expect(summe).toBeCloseTo(storm.barrelCount, 6);

    // Klassen ohne das Feld feuern unverändert mit stats.damage/-speed für jeden Lauf.
    for (const id of ['twin', 'gatling', 'arbalest'] as const) {
      expect(CLASS_DEFINITIONS[id].barrels).toBeUndefined();
    }
  });

  it('lässt die beiden mittleren Läufe härter und langsamer, die äußeren schwächer und schneller fliegen', () => {
    const { game, interna } = bauen();
    const { id, spieler } = schuetze(game, interna, 'storm');
    const stats = tunedStatsFor(spieler);
    expect(stats.barrelCount).toBe(4);

    salve(game, spieler, 100_000);
    expect(interna.projectiles.size).toBe(4);

    const schuesse = [...interna.projectiles.values()];
    for (const schuss of schuesse) expect(schuss.ownerId).toBe(id);

    const geschwindigkeiten = schuesse.map((s) => Math.hypot(s.velocity.x, s.velocity.y)).sort((a, b) => a - b);
    const schaeden = schuesse.map((s) => s.damage).sort((a, b) => a - b);

    // Zwei schwache/schnelle außen, zwei starke/langsame in der Mitte.
    expect(schaeden[0]).toBeCloseTo(stats.damage * 0.65, 5);
    expect(schaeden[1]).toBeCloseTo(stats.damage * 0.65, 5);
    expect(schaeden[2]).toBeCloseTo(stats.damage * 1.35, 5);
    expect(schaeden[3]).toBeCloseTo(stats.damage * 1.35, 5);

    expect(geschwindigkeiten[0]).toBeCloseTo(stats.projectileSpeed * 0.92, 5);
    expect(geschwindigkeiten[1]).toBeCloseTo(stats.projectileSpeed * 0.92, 5);
    expect(geschwindigkeiten[2]).toBeCloseTo(stats.projectileSpeed * 1.15, 5);
    expect(geschwindigkeiten[3]).toBeCloseTo(stats.projectileSpeed * 1.15, 5);

    // Der schwächere Lauf ist der schnellere und umgekehrt – exakt gegenläufig gepaart.
    const stark = schuesse.filter((s) => s.damage > stats.damage);
    const schwach = schuesse.filter((s) => s.damage < stats.damage);
    expect(stark).toHaveLength(2);
    expect(schwach).toHaveLength(2);
    for (const s of stark) expect(Math.hypot(s.velocity.x, s.velocity.y)).toBeCloseTo(stats.projectileSpeed * 0.92, 5);
    for (const s of schwach) expect(Math.hypot(s.velocity.x, s.velocity.y)).toBeCloseTo(stats.projectileSpeed * 1.15, 5);
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
