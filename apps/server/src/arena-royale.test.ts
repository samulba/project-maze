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

/**
 * Teil 2: Ausscheiden und Runden.
 *
 * Der Unterschied zwischen "Karte mit toedlichem Rand" und "Battle Royale" ist
 * genau das hier -- wer stirbt, ist raus, und irgendwann steht ein Sieger fest.
 */
describe('Battle-Royale-Runden', () => {
  interface Innereien {
    players: Map<string, any>;
    shapes: Map<string, any>;
    killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
  }

  const SCHNELLE_RUNDE: typeof DEFAULT_ROYALE = {
    ...DEFAULT_ROYALE,
    graceMs: 1_000,
    shrinkMs: 400,
    holdMs: 400,
    roundBreakMs: 2_000
  };

  /*
   * DREI Spieler, nicht zwei. Bei zweien ist die Runde nach dem ersten Tod
   * sofort entschieden und startet nach der Pause neu -- der Tote lebt dann zu
   * Recht wieder, und der Test haette das faelschlich als Fehler gemeldet.
   * Genau so ist der erste Anlauf gescheitert.
   */
  it('laesst Tote in der laufenden Runde NICHT zurueckkommen', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('A');
    const b = game.addPlayer('B');
    game.addPlayer('C');
    const spielerA = internals.players.get(a);

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    internals.killPlayer(spielerA, b, now, 'Arena');
    expect(spielerA.dead).toBe(true);
    expect(royaleZoneFor(game)!.roundOver).toBe(false);

    /*
     * Die beiden anderen bewusst am Leben halten -- sonst holt die Zone auch
     * sie, die Runde endet, und der Test misst den Rundenneustart statt des
     * Ausscheidens. (Zweiter Anlauf, zweiter Lerneffekt.)
     */
    const dt = 1 / GAME.tickRate;
    for (let i = 0; i < 20 * GAME.tickRate; i += 1) {
      for (const spieler of internals.players.values()) {
        if (spieler.id === a) continue;
        const zone = royaleZoneFor(game)!;
        spieler.position = { ...zone.center };
        spieler.health = spieler.maxHealth;
      }
      now += dt * 1000;
      game.step(dt, now);
    }
    expect(royaleZoneFor(game)!.roundOver).toBe(false);
    expect(spielerA.dead).toBe(true);
    // Und auch der ausdrueckliche Wunsch bringt nichts, solange die Runde laeuft.
    expect(game.requestRespawn(a, now)).toBe(false);
    expect(spielerA.dead).toBe(true);
  });

  /**
   * Der Auto-Respawn ist der eigentlich gefaehrliche Pfad, und ein Test mit
   * MENSCHEN trifft ihn nicht: `killPlayer` gibt ihnen 600 Sekunden, Bots aber
   * nur `autoRespawnDelayMs` (7 s). Ein Test, der die Sperre nur an Menschen
   * prueft, bleibt gruen, auch wenn sie ganz fehlt -- genau das hat eine
   * Sabotage-Probe gezeigt: `autoRespawnAt` entfernt, und trotzdem alles gruen.
   */
  it('laesst auch tote BOTS in der Runde draussen', () => {
    setArenaMode('royale');
    /*
     * Zone, die NICHT schrumpft (`minRadius` = `startRadius`). Sonst faellt der
     * Test auf einen Zufall herein: Der Bot respawnt zwar, steht dann aber
     * ausserhalb der inzwischen winzigen Zone und stirbt binnen Sekunden wieder
     * -- am Ende ist er tot, und der Test meldet gruen, ohne die Sperre je
     * geprueft zu haben. Genau so ist eine Sabotage-Probe unbemerkt
     * durchgekommen. Ohne Schrumpfen gibt es nur einen Grund, warum er tot
     * bleiben kann: das Ausscheiden.
     */
    const OHNE_SCHRUMPFEN = { ...SCHNELLE_RUNDE, minRadius: DEFAULT_ROYALE.startRadius };
    const game = ohneFormen(tuneRoyale(tuneCombatScaling(hardenSimulation(new MazeGame(3))), OHNE_SCHRUMPFEN));
    const internals = game as unknown as Innereien;
    const mensch = game.addPlayer('Mensch');
    const bots = [...internals.players.values()].filter((p: any) => p.isBot);
    expect(bots.length).toBeGreaterThanOrEqual(2);

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    const opfer = bots[0]!;
    internals.killPlayer(opfer, mensch, now, 'Arena');
    expect(opfer.dead).toBe(true);

    // Deutlich laenger als `autoRespawnDelayMs` (7 s) laufen lassen.
    const dt = 1 / GAME.tickRate;
    for (let i = 0; i < 14 * GAME.tickRate; i += 1) {
      for (const spieler of internals.players.values()) {
        if (spieler.id === opfer.id) continue;
        const zone = royaleZoneFor(game)!;
        spieler.position = { ...zone.center };
        spieler.health = spieler.maxHealth;
      }
      now += dt * 1000;
      game.step(dt, now);
    }
    expect(royaleZoneFor(game)!.roundOver).toBe(false);
    expect(opfer.dead).toBe(true);
  });

  it('erklaert den letzten Lebenden zum Sieger und startet neu', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('Alpha');
    const b = game.addPlayer('Beta');
    const spielerA = internals.players.get(a);

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    internals.killPlayer(spielerA, b, now, 'Arena');
    now += 25;
    game.step(1 / GAME.tickRate, now);

    const entschieden = royaleZoneFor(game)!;
    expect(entschieden.roundOver).toBe(true);
    expect(entschieden.winnerName).toBe('Beta');
    expect(entschieden.alive).toBe(1);

    /*
     * Genau bis kurz nach der Pause laufen, nicht laenger: Mit graceMs 1000 und
     * 400er Phasen ist die neue Runde nach vier Sekunden schon bei Stufe 2 --
     * der erste Anlauf pruefte "Stufe 0" und fand 2.
     */
    while (royaleZoneFor(game)!.roundOver) { now += 25; game.step(1 / GAME.tickRate, now); }
    const frisch = royaleZoneFor(game)!;
    expect(frisch.roundOver).toBe(false);
    expect(frisch.winnerName).toBeNull();
    expect(frisch.stage).toBe(0);
    expect(frisch.radius).toBe(SCHNELLE_RUNDE.startRadius);
    expect(spielerA.dead).toBe(false);
    expect(frisch.alive).toBe(2);
  });

  it('haelt die Zone in der Rundenpause an, statt den Sieger zu toeten', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('Alpha');
    const b = game.addPlayer('Beta');
    const sieger = internals.players.get(b);

    let now = Date.now();
    // Erst die Zone in Gang bringen, dann entscheiden.
    now = laufe(game, now, 4);
    internals.killPlayer(internals.players.get(a), b, now, 'Arena');
    now += 25;
    game.step(1 / GAME.tickRate, now);
    expect(royaleZoneFor(game)!.roundOver).toBe(true);

    // Sieger in die Ecke, also weit ausserhalb – und trotzdem unversehrt.
    for (let i = 0; i < GAME.tickRate; i += 1) {
      sieger.position = { x: 140, y: 140 };
      sieger.health = sieger.maxHealth;
      sieger.invulnerable = false;
      sieger.invulnerableUntil = 0;
      now += (1 / GAME.tickRate) * 1000;
      game.step(1 / GAME.tickRate, now);
      expect(sieger.health).toBe(sieger.maxHealth);
    }
  });

  it('erklaert eine Arena mit einem einzigen Spieler nicht zur entschiedenen Runde', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    game.addPlayer('Allein');
    const now = laufe(game, Date.now(), 4);
    expect(royaleZoneFor(game)!.roundOver).toBe(false);
    expect(now).toBeGreaterThan(0);
  });

  it('laesst in anderen Modi jeden normal zurueckkommen', () => {
    setArenaMode('maze');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('A');
    game.addPlayer('B');
    const spielerA = internals.players.get(a);

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    internals.killPlayer(spielerA, null, now, 'Arena');
    expect(spielerA.dead).toBe(true);
    now = laufe(game, now, 12);
    // Der normale Wiedereinstieg bleibt unangetastet.
    expect(game.requestRespawn(a, now + 10_000)).toBe(true);
  });
});

/**
 * Teil 3: die Vorwarnung.
 *
 * Ohne sie erfaehrt ein Spieler vom Schrumpfen erst, wenn es laeuft -- dann ist
 * die Entscheidung "noch eine Form oder schon losfahren" bereits gefallen.
 * Genau diese Entscheidung ist der Takt des Modus.
 */
describe('Battle-Royale-Vorwarnung', () => {
  interface Innereien { players: Map<string, any>; killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void; }

  it('zaehlt in der Schonfrist auf die erste Verengung herunter', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame());
    game.addPlayer('Spieler');
    const start = Date.now();

    game.step(1 / GAME.tickRate, start);
    const frueh = royaleZoneFor(game, start)!;
    expect(frueh.phase).toBe('wartet');
    expect(frueh.nextShrinkInMs).toBeGreaterThan(DEFAULT_ROYALE.graceMs - 1_000);

    const spaeter = laufe(game, start, 10);
    const zone = royaleZoneFor(game, spaeter)!;
    expect(zone.nextShrinkInMs).toBeLessThan(frueh.nextShrinkInMs - 9_000);
    expect(zone.nextShrinkInMs).toBeGreaterThan(0);
  });

  it('verspricht waehrend einer laufenden Verengung keine zweite', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELL));
    game.addPlayer('Spieler');
    let now = Date.now();
    // Bis in die erste Verengung hinein laufen (Schonfrist 1 s, Schrumpfen 400 ms).
    // Der Zonenzustand entsteht erst im ersten Schritt, deshalb erst laufen, dann fragen.
    do { now += 25; game.step(1 / GAME.tickRate, now); } while (royaleZoneFor(game, now)!.phase !== 'schrumpft');
    expect(royaleZoneFor(game, now)!.nextShrinkInMs).toBe(0);
  });

  /**
   * Am Mindestradius haelt die Zone in Zyklen weiter. Wer dort die Restzeit der
   * Phase melden wuerde, kuendigte ein Schrumpfen an, das nie kommt -- eine
   * Anzeige, die einmal luegt, glaubt danach niemand mehr.
   */
  it('kuendigt am Mindestradius nichts mehr an', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELL));
    game.addPlayer('Spieler');
    let now = laufe(game, Date.now(), 20);
    const zone = royaleZoneFor(game, now)!;
    expect(zone.radius).toBeLessThanOrEqual(SCHNELL.minRadius + 0.001);
    expect(zone.nextShrinkInMs).toBe(0);
    // Auch ueber einen ganzen weiteren Haltezyklus hinweg bleibt es dabei.
    now = laufe(game, now, 3);
    expect(royaleZoneFor(game, now)!.nextShrinkInMs).toBe(0);
  });

  it('kuendigt in der Rundenpause nichts an', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame({ ...DEFAULT_ROYALE, graceMs: 1_000, shrinkMs: 400, holdMs: 400, roundBreakMs: 5_000 }));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('Alpha');
    const b = game.addPlayer('Beta');

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    internals.killPlayer(internals.players.get(a), b, now, 'Arena');
    now += 25;
    game.step(1 / GAME.tickRate, now);

    const zone = royaleZoneFor(game, now)!;
    expect(zone.roundOver).toBe(true);
    expect(zone.nextShrinkInMs).toBe(0);
    expect(zone.nextRoundInMs).toBeGreaterThan(4_000);
  });

  it('rechnet die Restzeiten gegen die Uhr des Snapshots, nicht gegen die eigene', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame());
    const id = game.addPlayer('Spieler');
    const start = Date.now();
    game.step(1 / GAME.tickRate, start);

    // Ein Snapshot, der zehn Sekunden spaeter gebaut wird, meldet zehn Sekunden
    // weniger Vorwarnung -- sonst haengt die Anzeige an der Uhr des Prozesses.
    const jetzt = (game.snapshot(id, start) as any).royaleZone.nextShrinkInMs;
    const spaeter = (game.snapshot(id, start + 10_000) as any).royaleZone.nextShrinkInMs;
    expect(jetzt - spaeter).toBeGreaterThan(9_900);
  });
});
