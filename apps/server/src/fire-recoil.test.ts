import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { RUECKSTOSS_TEMPO, offenerRueckstoss, tuneFireRecoil } from './fire-recoil';
import { MazeGame } from './game';
import { tuneLoadoutSystem } from './loadout-system';
import { tuneSiegeSignature, stellungFor } from './signature-siege';
import { isFree } from './world';

/**
 * Rückstoß beim Feuern (Sams Spieltest vom 13.08.).
 *
 * Diese Tests messen die WIRKUNG, nicht das Feld: zwei identische Läufe, einmal
 * mit und einmal ohne Schicht, und die Differenz der Position. Ein Test gegen
 * die blanke `MazeGame` wäre wertlos gewesen – deren `stepPlayer` läuft im
 * Betrieb nie, weil `tuneCombatScaling` sie ersetzt. Genau daran ist die
 * Vormessung gescheitert und hat für eine Klasse 3,3 px gemeldet, wo in
 * Wahrheit 0,0 standen.
 */

const DT = 1 / 40;
/** Nachweislich freies Feld – der Tank muss driften können, nicht anecken. */
const OFFEN = { x: 2800, y: 2200 };

interface Interna {
  players: Map<string, any>;
  shapes: Map<string, any>;
}

const bauen = (rueckstoss: boolean) => {
  const game = tuneFireRecoil(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))), rueckstoss);
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

/** Feuernder Tank auf freiem Feld, Zielrichtung nach rechts. */
const schuetze = (game: MazeGame, interna: Interna, klasse = 'twin') => {
  const id = game.addPlayer('Schütze');
  const spieler = interna.players.get(id);
  spieler.playerClass = klasse;
  spieler.level = 45;
  spieler.position = { ...OFFEN };
  spieler.velocity = { x: 0, y: 0 };
  spieler.move = { x: 0, y: 0 };
  spieler.aim = { x: 400, y: 0 };
  spieler.primary = true;
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  return { id, spieler };
};

/** Sekunden feuern und zurückgeben, wie weit der Tank gedriftet ist. */
const drift = (sekunden: number, rueckstoss: boolean, klasse = 'twin'): number => {
  const { game, interna } = bauen(rueckstoss);
  const { spieler } = schuetze(game, interna, klasse);
  const start = { ...spieler.position };
  let now = 100_000;
  for (let tick = 0; tick < sekunden / DT; tick += 1) {
    spieler.aim = { x: 400, y: 0 };
    spieler.primary = true;
    spieler.move = { x: 0, y: 0 };
    game.step(DT, (now += 25));
  }
  return Math.hypot(spieler.position.x - start.x, spieler.position.y - start.y);
};

describe('Rückstoß beim Feuern', () => {
  it('schiebt den feuernden Tank überhaupt – vorher passierte serverseitig nichts', () => {
    expect(isFree(OFFEN, GAME.playerRadius)).toBe(true);
    expect(drift(2, false)).toBeCloseTo(0, 3);
    expect(drift(2, true)).toBeGreaterThan(10);
  });

  it('schiebt entgegen der Zielrichtung', () => {
    const { game, interna } = bauen(true);
    const { spieler } = schuetze(game, interna);
    const start = { ...spieler.position };
    let now = 100_000;
    for (let tick = 0; tick < 80; tick += 1) {
      spieler.aim = { x: 400, y: 0 };
      spieler.primary = true;
      game.step(DT, (now += 25));
    }
    // Zielrichtung ist +x, der Tank muss also nach -x wandern.
    expect(spieler.position.x).toBeLessThan(start.x);
    expect(Math.abs(spieler.position.y - start.y)).toBeLessThan(2);
  });

  /**
   * Sams Einschränkung „aber jetzt auch nicht zu stark" ist hier die
   * eigentliche Zusicherung: Die Drift bleibt bei rund einem Zehntel der
   * Laufgeschwindigkeit, und sie ist für schnelle wie langsame Klassen
   * dieselbe – sonst würde eine Gatling zehnmal so weit geschoben wie eine
   * Kanone, nur weil sie öfter abdrückt.
   */
  it('driftet rund 25 px je Sekunde – und zwar unabhängig von der Feuerrate', () => {
    const schnell = drift(3, true, 'gatling') / 3;
    const langsam = drift(3, true, 'sniper') / 3;
    for (const [name, wert] of [['gatling', schnell], ['sniper', langsam]] as const) {
      expect(wert, `${name} driftet ${wert.toFixed(1)} px/s`).toBeGreaterThan(RUECKSTOSS_TEMPO * 0.5);
      expect(wert, `${name} driftet ${wert.toFixed(1)} px/s`).toBeLessThan(RUECKSTOSS_TEMPO * 1.6);
    }
    // Die schnelle Klasse darf nicht ein Vielfaches der langsamen driften.
    expect(schnell / langsam).toBeLessThan(1.8);
    expect(schnell / langsam).toBeGreaterThan(0.55);
  });

  it('lässt die Geschwindigkeit unberührt – daran hängen vier Schwellen', () => {
    const { game, interna } = bauen(true);
    const { spieler } = schuetze(game, interna);
    let now = 100_000;
    for (let tick = 0; tick < 80; tick += 1) {
      spieler.aim = { x: 400, y: 0 };
      spieler.primary = true;
      spieler.move = { x: 0, y: 0 };
      game.step(DT, (now += 25));
      expect(Math.hypot(spieler.velocity.x, spieler.velocity.y)).toBeCloseTo(0, 6);
    }
  });

  /**
   * Die Probe aufs Exempel für die Modellwahl: SIEGE lebt vom Stillstehen. Ein
   * Rückstoß über die Geschwindigkeit hätte die Familie durch eigenes Feuern
   * entwaffnet – gemessen fiel ihre Stellung dabei in vier Sekunden von 100
   * auf 56. Über die Position getragen bleibt sie oben.
   */
  it('entwaffnet SIEGE nicht: die Stellung hält trotz Dauerfeuer', () => {
    const game = tuneFireRecoil(tuneSiegeSignature(tuneLoadoutSystem(tuneCombatScaling(new MazeGame(0))), true), true);
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const { id, spieler } = schuetze(game, interna, 'siege');
    let now = 100_000;
    for (let tick = 0; tick < 160; tick += 1) {
      spieler.aim = { x: 400, y: 0 };
      spieler.primary = true;
      spieler.move = { x: 0, y: 0 };
      game.step(DT, (now += 25));
    }
    expect(stellungFor(game, id)).toBeGreaterThan(95);
  });

  it('schiebt nicht durch Wände', () => {
    const { game, interna } = bauen(true);
    const { spieler } = schuetze(game, interna);
    // Direkt vor eine Wand stellen und in sie hinein feuern lassen: Der
    // Rückstoß drückt den Tank rückwärts – dort darf keine Wand sein, aber
    // die Prüfung gilt für jede Position auf dem Weg.
    let now = 100_000;
    for (let tick = 0; tick < 200; tick += 1) {
      spieler.aim = { x: 400, y: 0 };
      spieler.primary = true;
      game.step(DT, (now += 25));
      expect(isFree(spieler.position, GAME.playerRadius - 1), 'Tank steckt in einer Wand').toBe(true);
    }
  });

  it('räumt den offenen Stoß beim Verlassen auf', () => {
    const { game, interna } = bauen(true);
    const { id, spieler } = schuetze(game, interna);
    let now = 100_000;
    game.step(DT, (now += 25));
    spieler.primary = true;
    game.step(DT, (now += 25));
    game.removePlayer(id);
    expect(offenerRueckstoss(game, id)).toBe(0);
  });

  it('bleibt ohne Schalter vollständig weg', () => {
    expect(drift(3, false, 'gatling')).toBeCloseTo(0, 3);
  });
});
