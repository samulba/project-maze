import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { droneArchetypes, tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { messpunkt } from './messfeld';
import { hasLineOfSight, isFree } from './world';

/**
 * Drei der zehn Drohnenklassen hatten keinen eigenen Eintrag und fielen still
 * auf den Starter zurueck -- ueber zwei Ausbaustufen hinweg, ohne Warnung und
 * ohne Test. Sichtbar war es nur an der Klassenbeschreibung, die dann nicht
 * mehr stimmte: „Drei schwere Waechter statt eines Schwarms" (sentinel) ergab
 * 3 x 36 = 108 Flotten-HP, weniger als jede andere Klasse derselben Stufe.
 *
 * Deshalb steht hier keine Werteliste, sondern die Regel: Wer Drohnen hat,
 * hat einen eigenen Koerper. Die naechste neue Drohnenklasse faellt hier auf,
 * bevor sie jemand spielt.
 */

const drohnenklassen = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].droneCount > 0);

describe('Drohnen-Koerper', () => {
  it('gibt jeder Drohnenklasse einen eigenen', () => {
    const tabelle = droneArchetypes();
    const ohne = drohnenklassen.filter((id) => tabelle[id] === undefined);
    expect(ohne).toEqual([]);
  });

  it('laesst keine zwei Klassen mit exakt demselben Koerper laufen', () => {
    const tabelle = droneArchetypes();
    const gesehen = new Map<string, string>();
    const doppelt: string[] = [];
    for (const id of drohnenklassen) {
      const koerper = JSON.stringify(tabelle[id]);
      const zuvor = gesehen.get(koerper);
      if (zuvor) doppelt.push(`${zuvor} == ${id}`);
      else gesehen.set(koerper, id);
    }
    expect(doppelt).toEqual([]);
  });

  /**
   * Die Flotte ist das, was ein Controller wirklich aufs Feld bringt. Ohne
   * eine Untergrenze kann eine Klasse mit wenigen, angeblich schweren Drohnen
   * unter der Startklasse landen -- genau das war bei sentinel der Fall.
   */
  it('laesst keine spaetere Klasse unter der Flotte der Startklasse bleiben', () => {
    const tabelle = droneArchetypes();
    const flotte = (id: (typeof drohnenklassen)[number]): number =>
      CLASS_DEFINITIONS[id].droneCount * (tabelle[id]?.health ?? 0);
    const start = flotte('drone');
    const schwaecher = drohnenklassen
      .filter((id) => id !== 'drone' && CLASS_DEFINITIONS[id].unlockLevel > CLASS_DEFINITIONS.drone.unlockLevel)
      .filter((id) => flotte(id) < start);
    expect(schwaecher).toEqual([]);
  });

  /**
   * Befund 41: Der Client zeichnete jede Drohne als 13er-Dreieck, obwohl der
   * Server mit 7,5 bis 15,5 rechnet -- eine Hive-Drohne erschien mit
   * dreifacher Flaeche, eine Carrier-Drohne traf durch sichtbare Luft. Der
   * Radius muss deshalb in jedem Drohnen-Snapshot liegen.
   */
  it('schickt den Kollisionsradius jeder Drohne im Snapshot mit', () => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const playerId = game.addPlayer('Overseer');
    const internals = game as unknown as { players: Map<string, { level: number }> };
    internals.players.get(playerId)!.level = 26;
    expect(game.chooseClass(playerId, 'drone')).toBe(true);
    game.step(1 / 40);

    const snapshot = game.snapshot(playerId);
    expect(snapshot.drones.length).toBeGreaterThan(0);
    for (const drone of snapshot.drones) {
      expect(drone.gameplayRadius).toBe(droneArchetypes().drone?.radius);
    }
  });
});

/**
 * Drohnen-Rework, Stufe 1 (Sams Spieltest vom 13.08.).
 *
 * Sam: „da müssen die Drohnen ja auch irgendwas angreifen. Das macht ja gar
 * keinen Sinn, dass sie einfach um dich schweben und dann nix passiert."
 * Gemessen stimmte das wörtlich – ein Gegner 200 px entfernt, kein Kommando,
 * acht Sekunden, null Schaden. Es gab im ganzen Server keine Zeile, in der
 * eine Drohne selbst ein Ziel suchte.
 */
describe('Drohnen-Verhalten (Stufe 1)', () => {
  // Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts). Der Rahmen
  // deckt, was die Flotte wirklich braucht: 200 px zum Gegner, 260 px Abstoss
  // vom Zeiger, dazu Streuung – in jede Richtung.
  const OFFENES_FELD = messpunkt({ links: 380, rechts: 380, oben: 380, unten: 380 });

  /**
   * Ein Gegner weit ausserhalb jedes Suchradius (groesster: aviary mit 720),
   * aber IN SICHTLINIE. Das ist der Unterschied zwischen „die Flotte bleibt zu
   * Hause, weil er zu weit weg ist" und „…weil eine Wand dazwischensteht" –
   * nur das Erste prueft der Test. Im Labyrinth gibt es keine freie Flaeche
   * dieser Groesse mehr, also wird die Richtung gesucht, in der die Sicht reicht.
   */
  const AUSSER_REICHWEITE = (() => {
    for (const abstand of [1400, 1200, 1000, 900]) {
      for (let schritt = 0; schritt < 48; schritt += 1) {
        const winkel = (schritt / 48) * Math.PI * 2;
        const kandidat = { x: OFFENES_FELD.x + Math.cos(winkel) * abstand, y: OFFENES_FELD.y + Math.sin(winkel) * abstand };
        if (isFree(kandidat, 40) && hasLineOfSight(OFFENES_FELD, kandidat)) return kandidat;
      }
    }
    throw new Error('kein ferner Punkt in Sichtlinie');
  })();

  interface Interna {
    players: Map<string, any>;
    shapes: Map<string, any>;
    drones: Map<string, any>;
  }

  /** Ein Controller auf freiem Feld, mit stehender Flotte. */
  const aufbau = (klasse: 'drone' | 'guardian' | 'aviary' = 'drone') => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    // Formen weg: Sie sind gültige Ziele und würden jede Messung stören.
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...OFFENES_FELD };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, klasse === 'drone' ? 'drone' : klasse)).toBe(true);
    game.step(1 / 40, 100_000);
    return { game, interna, id, spieler };
  };

  const gegnerBei = (interna: Interna, game: MazeGame, position: { x: number; y: number }) => {
    const id = game.addPlayer('Gegner');
    const gegner = interna.players.get(id);
    gegner.position = { ...position };
    gegner.invulnerable = false;
    gegner.invulnerableUntil = 0;
    gegner.level = 45;
    return { id, gegner };
  };

  /** Mittlerer Abstand der Flotte zu einem Punkt. */
  const flottenAbstand = (interna: Interna, ziel: { x: number; y: number }): number => {
    const drohnen = [...interna.drones.values()];
    expect(drohnen.length).toBeGreaterThan(0);
    return drohnen.reduce((summe, d) => summe + Math.hypot(d.position.x - ziel.x, d.position.y - ziel.y), 0) / drohnen.length;
  };

  it('greift ohne Kommando einen Gegner in Reichweite an – vorher passierte nichts', () => {
    const { game, interna } = aufbau();
    const { gegner } = gegnerBei(interna, game, { x: OFFENES_FELD.x + 200, y: OFFENES_FELD.y });
    const vorher = flottenAbstand(interna, gegner.position);

    let now = 100_000;
    for (let tick = 0; tick < 40; tick += 1) {
      gegner.position = { x: OFFENES_FELD.x + 200, y: OFFENES_FELD.y };
      gegner.health = gegner.maxHealth;
      game.step(1 / 40, (now += 25));
    }

    // Die Flotte muss beim Gegner ankommen, nicht beim Besitzer kreisen.
    expect(flottenAbstand(interna, gegner.position)).toBeLessThan(vorher);
    expect(flottenAbstand(interna, gegner.position)).toBeLessThan(80);
  });

  it('fügt dem Gegner dabei wirklich Schaden zu (der eigentliche Befund)', () => {
    const { game, interna } = aufbau();
    const { gegner } = gegnerBei(interna, game, { x: OFFENES_FELD.x + 200, y: OFFENES_FELD.y });
    const leben = gegner.health;

    let now = 100_000;
    for (let tick = 0; tick < 120; tick += 1) {
      gegner.position = { x: OFFENES_FELD.x + 200, y: OFFENES_FELD.y };
      game.step(1 / 40, (now += 25));
    }
    expect(gegner.health).toBeLessThan(leben);
  });

  it('bleibt beim Besitzer, wenn niemand in Reichweite ist', () => {
    const { game, interna, spieler } = aufbau();
    // Weit außerhalb jedes Suchradius (drone: 520), aber in Sichtlinie.
    gegnerBei(interna, game, AUSSER_REICHWEITE);

    let now = 100_000;
    for (let tick = 0; tick < 60; tick += 1) game.step(1 / 40, (now += 25));

    const archetyp = droneArchetypes().drone!;
    expect(flottenAbstand(interna, spieler.position)).toBeLessThan(archetyp.orbitRadius + 60);
  });

  it('stößt beim Rechtsklick vom Zeiger weg, nicht hinter den Tank', () => {
    const { game, interna, spieler } = aufbau();
    // Zeiger 300 px nach rechts; die Flotte muss sich VOM Zeiger entfernen.
    const zeiger = { x: OFFENES_FELD.x + 300, y: OFFENES_FELD.y };
    spieler.aim = { x: 300, y: 0 };
    spieler.secondary = true;

    let now = 100_000;
    const vorher = flottenAbstand(interna, zeiger);
    for (let tick = 0; tick < 40; tick += 1) {
      spieler.aim = { x: 300, y: 0 };
      spieler.secondary = true;
      game.step(1 / 40, (now += 25));
    }
    const nachher = flottenAbstand(interna, zeiger);
    expect(nachher).toBeGreaterThan(vorher);
    // Die alte Punktspiegelung hätte die Flotte auf EINEN Punkt hinter dem
    // Tank gezogen – dort darf sie jetzt gerade nicht landen.
    const spiegel = { x: OFFENES_FELD.x - 300, y: OFFENES_FELD.y };
    const streuung = [...interna.drones.values()]
      .map((d) => Math.hypot(d.position.x - spiegel.x, d.position.y - spiegel.y));
    expect(Math.min(...streuung)).toBeGreaterThan(30);
  });

  it('hält die Flotte an der Leine – auch bei dauerhaft gehaltenem Rechtsklick', () => {
    const { game, interna, spieler } = aufbau();
    let now = 100_000;
    for (let tick = 0; tick < 400; tick += 1) {
      spieler.aim = { x: 300, y: 0 };
      spieler.secondary = true;
      game.step(1 / 40, (now += 25));
    }
    for (const drohne of interna.drones.values()) {
      const weg = Math.hypot(drohne.position.x - spieler.position.x, drohne.position.y - spieler.position.y);
      expect(weg, 'Drohne ist von der Leine gerissen').toBeLessThan(GAME.maxAimDistance + 120);
    }
  });

  it('gibt jeder Klasse einen eigenen Suchradius – Wächter eng, Schwärme weit', () => {
    const tabelle = droneArchetypes();
    for (const id of drohnenklassen) {
      expect(tabelle[id]?.searchRadius, `${id} ohne Suchradius`).toBeGreaterThan(0);
    }
    // Der Regler läuft mit dem Orbit mit: guardian verteidigt zu Hause,
    // aviary schwärmt aus. Ohne diesen Unterschied fühlen sich zehn Klassen
    // wieder gleich an – Sams Punkt 2.
    expect(tabelle.guardian!.searchRadius).toBeLessThan(tabelle.drone!.searchRadius);
    expect(tabelle.aviary!.searchRadius).toBeGreaterThan(tabelle.drone!.searchRadius);
  });
});
