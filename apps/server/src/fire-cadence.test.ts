import { describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { HALTESCHWELLE_MS, tuneFireCadence } from './fire-cadence';
import { MazeGame } from './game';
import { messfeld } from './messfeld';

/**
 * Ein Klick, eine Salve (Sams Spieltest vom 14.08., Punkt 6).
 *
 * > „Bei Klassen, die sehr viele KUGELN spammen können, muss es immer diese
 * > LOGIK geben, dass sie einmal schießen, wenn man einmal drückt! […] aber
 * > halt: nur wenn ich gedrückt halte, ist auf AUTO-Modus."
 *
 * Gemessen wird die Zahl der entstandenen Projektile, nicht ein Zustandsfeld:
 * Nur sie ist das, was Sam sieht.
 */

const DT = 1 / GAME.tickRate;
const ORT = messfeld(240);

interface Interna {
  players: Map<string, any>;
  projectiles: Map<string, any>;
  shapes: Map<string, any>;
}

const bauen = (kadenz: boolean) => {
  const game = tuneFireCadence(tuneCombatScaling(new MazeGame(0)), kadenz);
  const interna = game as unknown as Interna;
  interna.shapes.clear();
  return { game, interna };
};

const schuetze = (game: MazeGame, interna: Interna, klasse: string) => {
  const id = game.addPlayer('Schütze');
  const spieler = interna.players.get(id);
  spieler.playerClass = klasse;
  spieler.level = 45;
  spieler.position = { ...ORT };
  spieler.aim = { x: 400, y: 0 };
  spieler.move = { x: 0, y: 0 };
  spieler.invulnerable = false;
  spieler.invulnerableUntil = 0;
  // Voll ausgebautes Nachladen – Sams Zielgruppe sind die Klassen, die „sehr
  // viele Kugeln spammen können". Erst dort ist die Nachladezeit (Rapid: 133 ms)
  // kürzer als ein Klick, und erst dort gab es überhaupt zwei Schuss auf einen
  // Druck.
  spieler.upgrades.reload = GAME.maxUpgradeLevel;
  return spieler;
};

/**
 * Hält die Taste `haltenMs` lang gedrückt und zählt die Kugeln, die dabei
 * entstehen. Die Warteschlange der Salvenklassen (`burstDelay`) läuft danach
 * noch eine halbe Sekunde weiter aus – sonst zählte man bei Repeater nur den
 * ersten der drei Läufe.
 */
function kugeln(klasse: string, haltenMs: number, kadenz = true): number {
  const { game, interna } = bauen(kadenz);
  const spieler = schuetze(game, interna, klasse);
  let now = 100_000;
  const gesehen = new Set<string>();
  const zaehlen = (): void => {
    for (const id of interna.projectiles.keys()) gesehen.add(id);
  };
  for (let verstrichen = 0; verstrichen < haltenMs; verstrichen += 25) {
    spieler.primary = true;
    spieler.aim = { x: 400, y: 0 };
    game.step(DT, (now += 25));
    zaehlen();
  }
  spieler.primary = false;
  for (let verstrichen = 0; verstrichen < 500; verstrichen += 25) {
    spieler.primary = false;
    game.step(DT, (now += 25));
    zaehlen();
  }
  return gesehen.size;
}

describe('Ein Klick, eine Salve', () => {
  /**
   * Die Klassen, an denen Sam es festmacht: schnell genug, dass ein normaler
   * Klick (80–150 ms) vorher zwei Schuss ergab.
   */
  it.each(['rapid', 'gatling', 'storm', 'twin'])('gibt %s bei einem kurzen Klick genau eine Salve', (klasse) => {
    const eineSalve = kugeln(klasse, 25);
    expect(kugeln(klasse, HALTESCHWELLE_MS - 25), `${klasse} bei ${HALTESCHWELLE_MS - 25} ms Klick`).toBe(eineSalve);
  });

  /**
   * Repeater ist Sams ausdrückliches Beispiel („immer die drei Kugeln"). Die
   * Salve läuft über `burstDelay` zeitversetzt aus – ein Klick muss trotzdem
   * genau drei Kugeln ergeben, nicht eine und nicht sechs.
   */
  it('gibt Repeater bei einem Klick genau seine drei Kugeln', () => {
    expect(kugeln('repeater', HALTESCHWELLE_MS - 25)).toBe(3);
  });

  it('schaltet beim Halten in den Auto-Modus', () => {
    const klick = kugeln('rapid', HALTESCHWELLE_MS - 25);
    const gehalten = kugeln('rapid', HALTESCHWELLE_MS + 600);
    expect(gehalten).toBeGreaterThan(klick * 3);
  });

  /**
   * Der Gegenbeweis: Ohne die Schicht ergibt derselbe kurze Klick mehr als eine
   * Salve. Ohne diesen Test wüsste man nicht, ob der Test oben etwas misst.
   */
  it('ergab ohne die Schicht bei demselben Klick mehr als eine Salve', () => {
    // Rapid mit vollem Nachladen: Schuss bei 0 ms und bei 133 ms – zwei Kugeln
    // auf einen Klick, und genau das war Sams „kontrollierter spielen".
    expect(kugeln('rapid', HALTESCHWELLE_MS - 25, false)).toBeGreaterThan(kugeln('rapid', 25, false));
  });

  /** Loslassen und neu drücken ist eine neue Flanke – zwei Klicks, zwei Salven. */
  it('zählt jeden neuen Druck als eigene Salve', () => {
    const { game, interna } = bauen(true);
    const spieler = schuetze(game, interna, 'rapid');
    let now = 100_000;
    const gesehen = new Set<string>();
    const takt = (primary: boolean): void => {
      spieler.primary = primary;
      spieler.aim = { x: 400, y: 0 };
      game.step(DT, (now += 25));
      for (const id of interna.projectiles.keys()) gesehen.add(id);
    };
    // Klicken, loslassen, warten bis nachgeladen, wieder klicken.
    takt(true);
    const nachErstem = gesehen.size;
    for (let tick = 0; tick < 12; tick += 1) takt(false);
    takt(true);
    expect(gesehen.size).toBe(nachErstem * 2);
  });

  /**
   * Die unterdrückte Salve darf keine Nachladezeit kosten – sonst würde ein
   * Klick den nächsten verzögern, und die Schicht wäre eine versteckte
   * Feuerraten-Senkung.
   */
  it('nimmt für einen unterdrückten Schuss keine Nachladezeit', () => {
    const { game, interna } = bauen(true);
    const spieler = schuetze(game, interna, 'rapid');
    let now = 100_000;
    // Erster Schuss, danach so lange weiter, bis das Nachladen durch ist und
    // die Sperre greift (Rapid voll ausgebaut: 133 ms, also ab Tick 6).
    for (let tick = 0; tick < 8; tick += 1) {
      spieler.primary = true;
      spieler.aim = { x: 400, y: 0 };
      game.step(DT, (now += 25));
    }
    // Bliebe die Nachladezeit stehen, stünde hier ihr voller Wert – die Schicht
    // wäre dann eine versteckte Feuerraten-Senkung.
    expect(spieler.cooldown).toBeLessThan(0.01);
  });
});
