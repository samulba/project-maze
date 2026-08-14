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
import { arenaGuardianIdFor, tuneArenaEvents } from './arena-events';
import { arenaDirectorStatus, tuneArenaDirector } from './arena-director';
import { tuneArenaSystems } from './arena-systems';
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

/**
 * Zeitbudget fuer die Tests, die echte Minuten simulieren.
 *
 * Mehrere Faelle hier fahren die Zone mit der PRODUKTIVEN Konfiguration ab --
 * 40 s Schonfrist, danach Stufen: bis zu 5200 volle Spielschritte mit Physik.
 * Ruhig gemessen brauchen sie 0,6-1,9 s, unter Last laufen sie in Vitests
 * 5-Sekunden-Grenze.
 *
 * Nachgestellt mit sechs Rechenlast-Prozessen auf vier Kernen: zwei von zwei
 * Laeufen rot, beide Male mit "Test timed out in 5000ms" -- kein einziges Mal
 * mit einer falschen Erwartung. Das ist die Unterscheidung, auf die es
 * ankommt: Die Regeln stimmen, die Frist war zu knapp.
 *
 * Die schnelle Konfiguration (`SCHNELL`) waere die andere Loesung, aber sie
 * beweist etwas anderes: dass die Mechanik stimmt, nicht dass sie mit den
 * echten Zeiten stimmt. Deshalb mehr Zeit statt weniger Simulation.
 */
const LANGSAM = 30_000;

describe('Battle-Royale-Zone', () => {
  it('bleibt in anderen Modi vollstaendig aus dem Weg', () => {
    setArenaMode('maze');
    /*
     * `ohneFormen`, und zwar aus genau dem Grund, der oben schon einmal steht.
     *
     * Der Test behauptet „kein Leben verloren" ueber neunzig Sekunden. Formen
     * treiben aber zufaellig durch die Karte, und eine, die den Spieler in der
     * Ecke streift, kostet Leben -- gemessen 110 -> 26 in einem von zehn
     * vollen Suite-Laeufen. Das ist kein Zonenschaden und war nie einer; der
     * Test misst dann eine Form. Alle anderen Tests dieser Datei raeumen die
     * Formen deshalb weg, dieser eine nicht -- die Luecke war der Flake.
     */
    const game = ohneFormen(createGame());
    const id = game.addPlayer('Spieler');
    const player = (game as unknown as Internals).players.get(id);
    player.position = { x: 60, y: 60 };
    const leben = player.health;

    laufe(game, Date.now(), 90);

    expect(royaleZoneFor(game)).toBeNull();
    expect(player.health).toBe(leben);
    expect((game.snapshot(id) as any).royaleZone ?? null).toBeNull();
  }, LANGSAM);

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
  }, LANGSAM);

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
  }, LANGSAM);

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
  }, LANGSAM);

  /**
   * Der Schaden je Tick liegt bei 40 Hz und 4 Schaden/s bei 0,1. Wer das auf
   * ganze Zahlen rundet, teilt entweder gar nichts aus (abrunden) oder das
   * Vierzigfache (aufrunden). Die Restschuld loest das – hier wird geprueft,
   * dass ueber eine Sekunde ungefaehr der Sekundenwert ankommt.
   */
  it('teilt ueber eine Sekunde ungefaehr den Sekundenschaden aus', () => {
    setArenaMode('royale');
    // ohneFormen: siehe Kommentar oben an der Definition. Fehlte hier – eine
    // vorbeidriftende Form traf den festgehaltenen Spieler gelegentlich
    // zusaetzlich zur Zone (gemessen: 11,6 statt hoechstens 5,2 Schaden/s in
    // 1 von 40 isolierten Laeufen), und genau das machte den Test im vollen
    // Sammellauf ab und zu rot.
    const game = ohneFormen(createGame());
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
  }, LANGSAM);

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

  /**
   * Der Sieger nahm alles mit in die naechste Runde: Level, Klasse, Upgrades,
   * Score. Runde 2 war damit ein voll ausgebauter Tank gegen ein Feld auf
   * halber Stufe -- und das verstaerkte sich mit jedem Sieg. GOAL.md sagt
   * "Pause, dann alles auf Anfang".
   */
  it('setzt in der neuen Runde auch den Sieger zurueck, nicht nur die Toten', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELLE_RUNDE));
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('Alpha');
    const b = game.addPlayer('Beta');
    const verlierer = internals.players.get(a);
    const sieger = internals.players.get(b);

    let now = Date.now();
    game.step(1 / GAME.tickRate, now);
    // Beide auf denselben Stand bringen: Level 40, ausgebaut, mit Punktestand.
    for (const spieler of [verlierer, sieger]) {
      spieler.level = 40;
      spieler.playerClass = 'gatling';
      spieler.upgrades.damage = 7;
      spieler.score = 12_000;
      spieler.availablePoints = 3;
    }

    internals.killPlayer(verlierer, b, now, 'Arena');
    now += 25;
    game.step(1 / GAME.tickRate, now);
    expect(royaleZoneFor(game, now)!.winnerName).toBe('Beta');

    while (royaleZoneFor(game, now)!.roundOver) { now += 25; game.step(1 / GAME.tickRate, now); }

    // Dieselbe Regel fuer beide: halbes Level, Klasse zurueck, Upgrades leer.
    expect(sieger.level).toBe(verlierer.level);
    expect(sieger.upgrades.damage).toBe(0);
    expect(verlierer.upgrades.damage).toBe(0);
    expect(sieger.playerClass).toBe(verlierer.playerClass);
    expect(sieger.playerClass).not.toBe('gatling');
    expect(sieger.score).toBeLessThan(12_000);
    // Und die Runde laeuft wirklich, sonst misst der Test die Pause.
    expect(royaleZoneFor(game, now)!.roundOver).toBe(false);
  });

  /**
   * Wer mitten in einer laufenden Runde dazukommt, stand vorher weit ausserhalb
   * der Zone: `randomSpawn` nimmt zehn feste Punkte an Rand und Ecken, die Zone
   * steht ab Stufe 5 in der Mitte. Das war ein Todesurteil ohne Gegenwehr.
   */
  it('setzt einen Neuzugang mitten in der Runde IN die Zone', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame(SCHNELL));
    const internals = game as unknown as Innereien;
    /*
     * EIN Spieler waehrend der Anlaufzeit, nicht zwei: Bei zweien holt die
     * Zone binnen Sekunden einen von beiden, die Runde ist entschieden, und
     * nach der Pause faengt sie von vorn an -- der Test stuende dann bei
     * Stufe 0 und pruefte nichts. Genau so ist der erste Anlauf gescheitert.
     */
    const allein = game.addPlayer('Alpha');

    // Weit in die Runde laufen, bis die Zone klein und der Rand toedlich ist.
    let now = laufe(game, Date.now(), 20);
    const zone = royaleZoneFor(game, now)!;
    expect(zone.roundOver).toBe(false);
    expect(zone.stage).toBeGreaterThanOrEqual(5);

    const neu = game.addPlayer('Spaetzuender');
    const spieler = internals.players.get(neu);
    const abstand = Math.hypot(spieler.position.x - zone.center.x, spieler.position.y - zone.center.y);
    expect(abstand).toBeLessThanOrEqual(zone.radius);
    // Und er lebt das auch: eine Sekunde ohne einen einzigen Zonentreffer.
    // Alpha bleibt dabei in der Mitte, sonst entscheidet sich die Runde.
    const vorher = spieler.health;
    const dt = 1 / GAME.tickRate;
    for (let i = 0; i < GAME.tickRate; i += 1) {
      internals.players.get(allein).position = { ...zone.center };
      now += dt * 1000;
      game.step(dt, now);
    }
    expect(spieler.health).toBe(vorher);
    expect(spieler.dead).toBe(false);
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

  /**
   * Der Guardian des Hunter-Signal-Events ist ein echter Eintrag in `players`
   * (`game.addPlayer(GUARDIAN_NAME)`), damit man ihn treffen kann wie jeden
   * Tank. Fuer die RUNDE ist er aber kein Teilnehmer, sondern Inventar der
   * Arena. Zaehlte man ihn mit, gaebe es drei sichtbare Folgen: eine zu hohe
   * Zahl in der Leiste, ein Rundenende, das nie kommt -- und im schlimmsten
   * Fall "SIEGER: GUARDIAN".
   *
   * Der Guardian wird hier nicht nachgebaut, sondern von der ECHTEN
   * Event-Schicht erzeugt: Genau der Weg, auf dem er im Betrieb entsteht.
   */
  it('zaehlt den neutralen Guardian nicht als Ueberlebenden', () => {
    setArenaMode('royale');
    const game = ohneFormen(
      // Dieselbe Reihenfolge wie im Betrieb: Royale aussen, Events darunter,
      // und die Arena-Systeme erzeugen die Ereignisse ueberhaupt erst.
      tuneRoyale(
        tuneArenaEvents(tuneArenaSystems(tuneCombatScaling(hardenSimulation(new MazeGame(0))))),
        SCHNELLE_RUNDE
      )
    );
    const internals = game as unknown as Innereien;
    const a = game.addPlayer('Alpha');
    const b = game.addPlayer('Beta');

    /*
     * Bis zum Hunter-Signal laufen. Die Uhr springt je Schritt eine Sekunde
     * vor (dieselbe Abkuerzung wie in arena-systems.test.ts) -- sonst braeuchte
     * das Event 180 Sekunden echter Ticks.
     */
    let now = Date.now();
    let schutz = 0;
    while (arenaGuardianIdFor(game) === null && schutz < 900) {
      now += 1_000;
      // Die beiden am Leben halten: Sonst entscheidet die Zone die Runde,
      // bevor der Guardian ueberhaupt da ist.
      for (const spieler of internals.players.values()) {
        const zone = royaleZoneFor(game, now);
        if (zone) spieler.position = { ...zone.center };
        spieler.health = spieler.maxHealth;
        spieler.dead = false;
      }
      game.step(1 / GAME.tickRate, now);
      schutz += 1;
    }
    const wachId = arenaGuardianIdFor(game);
    expect(wachId).not.toBeNull();
    expect(internals.players.has(wachId!)).toBe(true);

    // Drei Eintraege in `players`, aber nur zwei Teilnehmer.
    expect(royaleZoneFor(game, now)!.alive).toBe(2);

    // Und der letzte Mensch gewinnt, obwohl das Monster noch lebt.
    internals.killPlayer(internals.players.get(a), b, now, 'Arena');
    now += 25;
    game.step(1 / GAME.tickRate, now);
    const entschieden = royaleZoneFor(game, now)!;
    expect(entschieden.roundOver).toBe(true);
    expect(entschieden.winnerName).toBe('Beta');
  }, LANGSAM);

  /**
   * Der Arena-Direktor haelt die Bot-Population auf Sollstaerke und steigt
   * dafuer ueber `internals.respawn` ein -- denselben Weg, den die
   * Royale-Schicht mit `autoRespawnAt = Infinity` gerade versperrt. Ein
   * direkter Aufruf laeuft an der Sperre vorbei.
   */
  it('laesst den Direktor mitten in der Runde keine Bots nachschieben', () => {
    setArenaMode('royale');
    /*
     * Wieder die nicht schrumpfende Zone -- aus demselben Grund wie oben. Mit
     * Schrumpfen entscheidet sich die Runde waehrend der zwanzig Sekunden von
     * selbst, und ab `roundOver` DARF der Direktor nachschieben. Der erste
     * Anlauf ist genau daran gescheitert: Er hat nicht die Sperre gemessen,
     * sondern das Rundenende.
     */
    const OHNE_SCHRUMPFEN = { ...SCHNELLE_RUNDE, minRadius: DEFAULT_ROYALE.startRadius };
    const game = ohneFormen(
      tuneRoyale(tuneArenaDirector(tuneCombatScaling(hardenSimulation(new MazeGame(4)))), OHNE_SCHRUMPFEN)
    );
    const internals = game as unknown as Innereien;
    const mensch = game.addPlayer('Mensch');
    let now = Date.now();
    game.step(1 / GAME.tickRate, now);

    const bots = [...internals.players.values()].filter((p: any) => p.isBot);
    expect(bots.length).toBeGreaterThanOrEqual(3);
    // Vier Bots gegen eine Sollstaerke von 18: Der Direktor WILL hier spawnen.
    expect(arenaDirectorStatus(game).target).toBeGreaterThan(bots.length);
    const besetzungVorher = internals.players.size;

    // Zwei Bots ausscheiden lassen.
    internals.killPlayer(bots[0], mensch, now, 'Arena');
    internals.killPlayer(bots[1], mensch, now, 'Arena');
    const lebendVorher = [...internals.players.values()].filter((p: any) => !p.dead).length;

    /*
     * Deutlich laenger laufen als das Aenderungsfenster des Direktors (5 s) --
     * ohne Sperre waeren das vier Gelegenheiten zum Nachschub. Alle noch
     * Lebenden bleiben dabei in der Zonenmitte bei voller Gesundheit, damit
     * die Runde nicht vorzeitig entschieden ist.
     */
    const ueberlebende = new Set(
      [...internals.players.values()].filter((p: any) => !p.dead).map((p: any) => p.id)
    );
    for (let i = 0; i < 20 * GAME.tickRate; i += 1) {
      const zone = royaleZoneFor(game, now);
      for (const spieler of internals.players.values()) {
        if (!ueberlebende.has(spieler.id)) continue;
        if (zone) spieler.position = { ...zone.center };
        spieler.health = spieler.maxHealth;
      }
      now += (1 / GAME.tickRate) * 1000;
      game.step(1 / GAME.tickRate, now);
    }

    // Die Runde laeuft noch -- nur dann sagt der Rest ueberhaupt etwas aus.
    expect(royaleZoneFor(game, now)!.roundOver).toBe(false);
    // Kein einziger Nachschub: dieselbe Besetzung wie vor dem Ausscheiden.
    expect(internals.players.size).toBe(besetzungVorher);
    expect(bots[0].dead).toBe(true);
    expect(bots[1].dead).toBe(true);
    const lebendNachher = [...internals.players.values()].filter((p: any) => !p.dead).length;
    expect(lebendNachher).toBe(lebendVorher);
    expect(royaleZoneFor(game, now)!.alive).toBe(lebendVorher);
  }, LANGSAM);

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

  /**
   * Zwischen "Phase abgelaufen" und "Phase gewechselt" liegt bis zu ein Tick --
   * die Phase wechselt in `step`, der Snapshot entsteht unabhaengig davon. Eine
   * glatte 0 hiesse fuer den Client "keine Verengung mehr", er schriebe also
   * ENDPHASE auf den Schirm, waehrend die Zone auf vollem Radius steht.
   */
  it('meldet nie 0, solange ueberhaupt noch eine Verengung kommt', () => {
    setArenaMode('royale');
    const game = ohneFormen(createGame());
    game.addPlayer('Spieler');
    const start = Date.now();
    game.step(1 / GAME.tickRate, start);

    // Ohne weiteren Schritt fragen, als waere die Schonfrist laengst vorbei.
    const ueberfaellig = royaleZoneFor(game, start + DEFAULT_ROYALE.graceMs + 5_000)!;
    expect(ueberfaellig.phase).toBe('wartet');
    expect(ueberfaellig.radius).toBe(DEFAULT_ROYALE.startRadius);
    expect(ueberfaellig.nextShrinkInMs).toBeGreaterThan(0);
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
