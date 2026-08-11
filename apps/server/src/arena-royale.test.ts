import { afterEach, describe, expect, it } from 'vitest';
import { GAME } from '@project-maze/shared';
import {
  DEFAULT_ROYALE,
  nextZoneCenter,
  resetRoyale,
  royaleDamagePerSecond,
  royaleZoneFor,
  tuneRoyale
} from './arena-royale';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame } from './game';
import { hardenSimulation } from './simulation-hardening';
import { setArenaMode } from './world';

interface Internals { players: Map<string, any>; shapes: Map<string, any>; }

const createGame = (config = DEFAULT_ROYALE): MazeGame =>
  tuneRoyale(tuneCombatScaling(hardenSimulation(new MazeGame(0))), config);

/**
 * Raeumt die Formen weg. Ohne das misst ein Test, der Zonenschaden erwarten
 * soll, auch Rammschaden an einer vorbeitreibenden Form -- so ist der erste
 * Anlauf gescheitert (110 -> 109,68 Leben, und keine Zone war schuld).
 */
const ohneFormen = (game: MazeGame): MazeGame => {
  (game as unknown as Internals).shapes.clear();
  return game;
};

/** Kurze Phasen: acht Stufen in Sekunden statt in Minuten. */
const SCHNELL: typeof DEFAULT_ROYALE = {
  ...DEFAULT_ROYALE,
  graceMs: 1_000,
  shrinkMs: 400,
  holdMs: 400
};

/** Schiebt die Uhr in Tick-Schritten vorwärts, wie der echte Server. */
function laufe(game: MazeGame, start: number, sekunden: number): number {
  const dt = 1 / GAME.tickRate;
  let now = start;
  for (let i = 0; i < sekunden * GAME.tickRate; i += 1) {
    now += (dt * 1000);
    game.step(dt, now);
  }
  return now;
}

afterEach(() => setArenaMode('maze'));

describe('Battle-Royale-Zone', () => {
  it('bleibt in anderen Modi vollstaendig aus dem Weg', () => {
    setArenaMode('maze');
    const game = createGame();
    const id = game.addPlayer('Spieler');
    const player = (game as unknown as Internals).players.get(id);
    player.position = { x: 60, y: 60 };
    const leben = player.health;

    laufe(game, Date.now(), 90);

    expect(royaleZoneFor(game)).toBeNull();
    expect(player.health).toBe(leben);
    expect((game.snapshot(id) as any).royaleZone ?? null).toBeNull();
  });

  it('haelt die Zone waehrend der Schonfrist still und tut niemandem weh', () => {
    setArenaMode('royale');
    const game = createGame();
    const id = game.addPlayer('Spieler');
    const player = (game as unknown as Internals).players.get(id);
    // Weit ausserhalb jeder spaeteren Zone, aber innerhalb der Karte.
    player.position = { x: 200, y: 200 };
    const leben = player.health;

    const start = Date.now();
    laufe(game, start, Math.floor(DEFAULT_ROYALE.graceMs / 1000) - 5);

    const zone = royaleZoneFor(game)!;
    expect(zone.phase).toBe('wartet');
    expect(zone.stage).toBe(0);
    expect(zone.radius).toBe(DEFAULT_ROYALE.startRadius);
    // Vor der ersten Stufe kostet Draussenstehen nichts – man soll ankommen duerfen.
    expect(player.health).toBe(leben);
  });

  it('schrumpft nach der Schonfrist und zieht danach Leben ab', () => {
    setArenaMode('royale');
    const game = createGame();
    const id = game.addPlayer('Randlaeufer');
    const player = (game as unknown as Internals).players.get(id);
    const start = Date.now();

    // In die Ecke stellen und dort halten: garantiert ausserhalb, sobald es losgeht.
    const halten = (): void => { player.position = { x: 130, y: 130 }; player.invulnerable = false; player.invulnerableUntil = 0; };
    halten();

    const dt = 1 / GAME.tickRate;
    let now = start;
    let vorher = player.health;
    let schadenGesehen = false;
    for (let i = 0; i < 130 * GAME.tickRate; i += 1) {
      halten();
      now += dt * 1000;
      game.step(dt, now);
      if (player.health < vorher) schadenGesehen = true;
      player.health = player.maxHealth;
      vorher = player.health;
    }

    const zone = royaleZoneFor(game)!;
    expect(zone.stage).toBeGreaterThanOrEqual(1);
    expect(zone.radius).toBeLessThan(DEFAULT_ROYALE.startRadius);
    expect(schadenGesehen).toBe(true);
  });

  it('laesst niemanden bluten, der in der Zone steht', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame());
    const id = game.addPlayer('Mittig');
    const player = (game as unknown as Internals).players.get(id);
    const mitte = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
    const start = Date.now();

    const dt = 1 / GAME.tickRate;
    let now = start;
    for (let i = 0; i < 130 * GAME.tickRate; i += 1) {
      // Immer im Zentrum der aktuellen Zone – dort ist man per Definition drin.
      const zone = royaleZoneFor(game);
      player.position = zone ? { ...zone.center } : { ...mitte };
      player.invulnerable = false;
      player.invulnerableUntil = 0;
      player.health = player.maxHealth;
      now += dt * 1000;
      game.step(dt, now);
      expect(player.health).toBe(player.maxHealth);
    }
  });

  /**
   * Der Schaden je Tick liegt bei 40 Hz und 4 Schaden/s bei 0,1. Wer das auf
   * ganze Zahlen rundet, teilt entweder gar nichts aus (abrunden) oder das
   * Vierzigfache (aufrunden). Die Restschuld loest das – hier wird geprueft,
   * dass ueber eine Sekunde ungefaehr der Sekundenwert ankommt.
   */
  it('teilt ueber eine Sekunde ungefaehr den Sekundenschaden aus', () => {
    setArenaMode('royale');
    const game = createGame();
    const id = game.addPlayer('Randlaeufer');
    const player = (game as unknown as Internals).players.get(id);
    const start = Date.now();

    const dt = 1 / GAME.tickRate;
    let now = start;
    /*
     * Am Leben halten, nicht nur am Platz. Wer das `dead`-Flag vergisst, misst
     * ab dem ersten Tod null Schaden -- die Zone ueberspringt Tote. Genau so
     * ist der erste Anlauf auf 0 statt 4 Schaden je Sekunde gekommen.
     */
    const halten = (): void => {
      player.position = { x: 130, y: 130 };
      player.invulnerable = false;
      player.invulnerableUntil = 0;
      player.dead = false;
      player.health = player.maxHealth;
    };

    /*
     * Warten, bis der Spieler wirklich DRAUSSEN steht -- nicht nur, bis Stufe 1
     * begonnen hat. Beim Stufenwechsel ist der Radius noch der alte und faellt
     * erst ueber `shrinkMs` ab; wer da schon misst, misst einen Spieler, der
     * die meiste Zeit drin war. Genau das ergab beim ersten Anlauf 0 Schaden.
     */
    const draussen = (): boolean => {
      const zone = royaleZoneFor(game);
      if (!zone) return false;
      return Math.hypot(130 - zone.center.x, 130 - zone.center.y) > zone.radius + 50;
    };
    let schutz = 0;
    while (!draussen() && schutz < 400 * GAME.tickRate) { halten(); now += dt * 1000; game.step(dt, now); schutz += 1; }
    expect(draussen()).toBe(true);

    /*
     * Verluste aufsummieren statt `maxHealth` aufzublasen: `stepPlayer` rechnet
     * das Maximum in jedem Tick neu aus den Klassenwerten und skaliert das
     * Leben mit. Ein von Hand gesetztes Maximum wird dabei zurueckgesetzt --
     * der erste Anlauf mass deshalb 24973 statt 4 Schaden je Sekunde.
     */
    const erwartet = royaleDamagePerSecond(royaleZoneFor(game)!.stage);
    let verloren = 0;
    for (let i = 0; i < GAME.tickRate * 4; i += 1) {
      halten();
      const vorTick = player.health;
      now += dt * 1000;
      game.step(dt, now);
      if (player.health < vorTick) verloren += vorTick - player.health;
      player.health = player.maxHealth;
    }
    const proSekunde = verloren / 4;

    expect(proSekunde).toBeGreaterThan(erwartet * 0.7);
    expect(proSekunde).toBeLessThan(erwartet * 1.3);
  });

  it('macht das Draussenstehen mit jeder Stufe teurer', () => {
    expect(royaleDamagePerSecond(1)).toBe(DEFAULT_ROYALE.baseDamagePerSecond);
    for (let stufe = 2; stufe <= 8; stufe += 1) {
      expect(royaleDamagePerSecond(stufe)).toBeGreaterThan(royaleDamagePerSecond(stufe - 1));
    }
  });

  /**
   * Der neue Kreis muss vollstaendig im alten liegen. Sonst stuende ein Spieler
   * mitten in der Zone und waere ohne eigene Bewegung ploetzlich draussen – das
   * fuehlt sich nach Willkuer an, nicht nach Regel.
   */
  it('legt den neuen Kreis immer vollstaendig in den alten', () => {
    const mitte = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
    let zaehler = 0;
    const zufall = (): number => { zaehler += 1; return (zaehler * 0.37) % 1; };
    for (let radius = 3000; radius > 500; radius *= DEFAULT_ROYALE.shrinkFactor) {
      const ziel = Math.max(DEFAULT_ROYALE.minRadius, radius * DEFAULT_ROYALE.shrinkFactor);
      for (let i = 0; i < 50; i += 1) {
        const neu = nextZoneCenter(mitte, radius, ziel, zufall);
        const versatz = Math.hypot(neu.x - mitte.x, neu.y - mitte.y);
        expect(versatz + ziel).toBeLessThanOrEqual(radius + 0.001);
      }
    }
  });

  it('schrumpft nie unter den Mindestradius', () => {
    setArenaMode('royale');
    // Schnelle Konfiguration: Acht Stufen brauchen sonst 640 Sekunden, also
    // 25.600 volle Spielschritte -- der Test lief in den Timeout.
    const game = ohneFormen(createGame(SCHNELL));
    game.addPlayer('Zuschauer');
    laufe(game, Date.now(), 20);
    const zone = royaleZoneFor(game)!;
    expect(zone.radius).toBeGreaterThanOrEqual(DEFAULT_ROYALE.minRadius - 0.001);
  });

  it('meldet die Zone im Snapshot, damit der Client sie zeichnen kann', () => {
    setArenaMode('royale');
    const game = createGame();
    const id = game.addPlayer('Spieler');
    laufe(game, Date.now(), 5);
    const zone = (game.snapshot(id) as any).royaleZone;
    expect(zone).not.toBeNull();
    expect(zone.radius).toBeGreaterThan(0);
    expect(['wartet', 'schrumpft', 'haelt']).toContain(zone.phase);
    resetRoyale(game);
  });
});
