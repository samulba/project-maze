import { describe, expect, it } from 'vitest';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { tuneHitDirection } from './hit-direction';

/**
 * Trefferrichtung (Befund 5). Getestet wird an der Schicht selbst, direkt
 * über dem Kampf-Tuning – exakt dort sitzt sie auch in index.ts.
 */

const DT_NOW = 100_000;
/** Freies Feld, gleiche Stelle wie im Aegis-Test – nachweislich ohne Wand. */
const ORT = { x: 2800, y: 2200 };

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

const setup = () => {
  const game = tuneHitDirection(tuneCombatScaling(new MazeGame(0)));
  const internals = game as unknown as Internals;
  internals.shapes.clear();
  const platziere = (name: string, position: { x: number; y: number }) => {
    const id = game.addPlayer(name);
    const player = internals.players.get(id);
    player.position = { ...position };
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    return { id, player };
  };
  return { game, internals, platziere };
};

const richtungen = (game: MazeGame, id: string, now: number): any[] | undefined =>
  (game.snapshot(id, now) as any).damageDirections;

describe('hit direction (Befund 5)', () => {
  it('bucht Richtung vom Getroffenen zum Angreifer, nur in den eigenen Snapshot', () => {
    const { game, internals, platziere } = setup();
    const { id: opferId, player: opfer } = platziere('Opfer', ORT);
    // Angreifer exakt rechts: Winkel 0.
    const { id: taeterId, player: taeter } = platziere('Täter', { x: ORT.x + 300, y: ORT.y });

    internals.damagePlayer(opfer, 12, taeterId, DT_NOW);

    const treffer = richtungen(game, opferId, DT_NOW + 50);
    expect(treffer).toHaveLength(1);
    expect(treffer![0].angle).toBeCloseTo(0, 6);
    expect(treffer![0].id).toBeGreaterThan(0);
    // Der Angreifer sieht davon nichts – das Feld ist Self-only.
    expect(richtungen(game, taeterId, DT_NOW + 50)).toBeUndefined();

    // Gegenprobe der Geometrie: Schaden aus der Gegenrichtung.
    internals.damagePlayer(taeter, 12, opferId, DT_NOW);
    expect(richtungen(game, taeterId, DT_NOW + 50)![0].angle).toBeCloseTo(Math.PI, 6);
  });

  it('bucht nichts ohne Angreifer, bei Selbstschaden und für Bots', () => {
    const { game, internals, platziere } = setup();
    const { id: opferId, player: opfer } = platziere('Opfer', ORT);
    platziere('Nachbar', { x: ORT.x + 300, y: ORT.y });

    // Umgebungsschaden (Royale-Zone): attackerId null.
    internals.damagePlayer(opfer, 8, null, DT_NOW);
    // Selbstschaden zählt nicht als Richtung.
    internals.damagePlayer(opfer, 8, opferId, DT_NOW);
    expect(richtungen(game, opferId, DT_NOW + 50)).toBeUndefined();

    // Bots bekommen gar keine Buchung.
    const botGame = tuneHitDirection(tuneCombatScaling(new MazeGame(1)));
    const botInternals = botGame as unknown as Internals;
    const bot = [...botInternals.players.values()].find((player) => player.isBot);
    const schuetze = botInternals.players.get(botGame.addPlayer('Schütze'));
    schuetze.position = { x: bot.position.x + 100, y: bot.position.y };
    botInternals.damagePlayer(bot, 12, schuetze.id, DT_NOW);
    expect((botGame.snapshot(bot.id, DT_NOW + 50) as any).damageDirections).toBeUndefined();
  });

  it('bucht nur, wenn wirklich Leben fehlt', () => {
    const { game, internals, platziere } = setup();
    const { id: opferId, player: opfer } = platziere('Opfer', ORT);
    const { id: taeterId } = platziere('Täter', { x: ORT.x + 300, y: ORT.y });

    // Unverwundbar: Der Aufruf prallt ab, kein Keil.
    opfer.invulnerable = true;
    internals.damagePlayer(opfer, 12, taeterId, DT_NOW);
    expect(richtungen(game, opferId, DT_NOW + 50)).toBeUndefined();

    opfer.invulnerable = false;
    internals.damagePlayer(opfer, 12, taeterId, DT_NOW);
    expect(richtungen(game, opferId, DT_NOW + 50)).toHaveLength(1);
  });

  it('verfällt nach der Vorhaltezeit und beim Tod', () => {
    const { game, internals, platziere } = setup();
    const { id: opferId, player: opfer } = platziere('Opfer', ORT);
    const { id: taeterId } = platziere('Täter', { x: ORT.x + 300, y: ORT.y });

    internals.damagePlayer(opfer, 12, taeterId, DT_NOW);
    expect(richtungen(game, opferId, DT_NOW + 800)).toHaveLength(1);
    expect(richtungen(game, opferId, DT_NOW + 1000)).toBeUndefined();

    // Der Todesstoß räumt die Liste: Der Respawn beginnt ohne alte Keile.
    internals.damagePlayer(opfer, 12, taeterId, DT_NOW + 1100);
    opfer.health = 1;
    internals.damagePlayer(opfer, 50, taeterId, DT_NOW + 1200);
    expect(opfer.dead).toBe(true);
    expect(richtungen(game, opferId, DT_NOW + 1250)).toBeUndefined();
  });

  it('deckelt je Spieler und vergibt monoton wachsende Ids', () => {
    const { game, internals, platziere } = setup();
    const { id: opferId, player: opfer } = platziere('Opfer', ORT);
    const { id: taeterId } = platziere('Täter', { x: ORT.x + 300, y: ORT.y });

    for (let index = 0; index < 12; index += 1) internals.damagePlayer(opfer, 1, taeterId, DT_NOW);
    const treffer = richtungen(game, opferId, DT_NOW + 50)!;
    expect(treffer).toHaveLength(8);
    for (let index = 1; index < treffer.length; index += 1) {
      expect(treffer[index].id).toBeGreaterThan(treffer[index - 1].id);
    }
  });
});
