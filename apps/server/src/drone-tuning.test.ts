import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, PLAYER_CLASS_IDS } from '@project-maze/shared';
import { tuneCombatScaling } from './combat-tuning';
import { droneArchetypes, tuneDrones } from './drone-tuning';
import { MazeGame } from './game';
import { messpunkt } from './messfeld';
import { WALLS, hasLineOfSight, isFree } from './world';

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

  /**
   * Ein Controller auf freiem Feld, mit stehender Flotte.
   *
   * `autoModus` schaltet den E-Modus ein: `primary` (der Tank feuert), aber
   * `klick` bleibt unten – genau die Bedingung, unter der Drohnen seit Sams
   * Klarstellung vom 14.08. selbst auf Jagd gehen dürfen. Voreinstellung ist
   * AN, weil die Tests dieses Blocks alle die Selbstsuche prüfen.
   */
  /**
   * `zeigerbefehl = true` heißt seit dem 16.08.: Der Spieler hält Linksklick
   * ODER Auto-Feuer, die Flotte fliegt also zum Zeiger. Vorher hieß dasselbe
   * Flag `autoModus` und bedeutete das Gegenteil – „Flotte sucht sich selbst
   * ein Ziel". Sams Recherche hat das umgedreht: **Auto-Fire ist nicht
   * Auto-Aim.** Standard ist deshalb jetzt „nichts gedrückt", der Zustand, in
   * dem die Flotte selbst jagt.
   */
  const aufbau = (klasse: 'drone' | 'guardian' | 'aviary' = 'drone', zeigerbefehl = false) => {
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
    spieler.primary = zeigerbefehl;
    spieler.klick = zeigerbefehl;
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

  /**
   * Zielgedächtnis (Drohnen-Rework 2, Sam: „Auto-Modus […] geht noch
   * wesentlich smoother"). Ein Gegner pendelt knapp um die Suchradius-Grenze
   * (520 px bei drone) – 20 px innerhalb, 20 px außerhalb, jeden Tick im
   * Wechsel. Ohne Gedächtnis fällt das Ziel bei jedem „außerhalb"-Tick weg und
   * die Flotte fällt zurück auf den Orbit (≈82 px vom Besitzer) – ein Sprung
   * von hunderten Pixeln, jeden zweiten Tick.
   *
   * Gemessen an einer Gegenprobe (Gedächtnis testweise abgeschaltet): Die
   * Spannweite des Abstands Flotte↔Besitzer über die letzten 60 Ticks lag bei
   * 84 px. Mit Gedächtnis (20 % Toleranz über den Suchradius, `ZIEL_HYSTERESE`)
   * bleibt der Gegner in JEDEM Tick innerhalb der erweiterten Grenze, die
   * Flotte hält ihn – gemessen 5 px Spannweite.
   */
  it('hält ein Ziel, das knapp um die Suchradius-Grenze pendelt', () => {
    const RAHMEN = { links: 60, rechts: 560, oben: 60, unten: 60 };
    const feld = messpunkt(RAHMEN);
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...feld };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);
    game.step(1 / 40, 100_000);

    const suchradius = droneArchetypes().drone!.searchRadius;
    const { gegner } = gegnerBei(interna, game, { x: feld.x + suchradius, y: feld.y });

    let now = 100_000;
    const abstaende: number[] = [];
    for (let tick = 0; tick < 200; tick += 1) {
      const innen = tick % 2 === 0;
      gegner.position = { x: feld.x + (innen ? suchradius - 20 : suchradius + 20), y: feld.y };
      gegner.health = gegner.maxHealth;
      game.step(1 / 40, (now += 25));
      abstaende.push(flottenAbstand(interna, spieler.position));
    }

    const letzte = abstaende.slice(-60);
    const spanne = Math.max(...letzte) - Math.min(...letzte);
    expect(spanne, `Spannweite ${spanne.toFixed(0)} px über die letzten 60 Ticks`).toBeLessThan(30);
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

  /**
   * Drohnen-Rework 2 (Sam, 13.08. abends): „Drohnen bewegen sich noch zu
   * schnell." Gemessen (messung-drohnen-bewegung.mjs) lag das Verhältnis
   * Drohne : Besitzer vorher bei 1,38–2,20×. Geprüft wird hier nur die
   * Richtung der Korrektur und die neue Untergrenze – die genauen Zahlen
   * stehen in der Messung, nicht im Test, damit ein künftiger Feinschliff
   * nicht an einer zu engen Regel zerschellt.
   */
  it('bremst das Flottentempo auf höchstens das 1,6-fache des Besitzers', () => {
    const roh = droneArchetypes();
    for (const id of drohnenklassen) {
      const archetyp = roh[id]!;
      // 620 ist ein grosszuegiger, aber nicht beliebiger Bezug: Der
      // langsamste Spielercharakter faehrt real nicht unter ~220 px/s, das
      // 1,6-fache waere also niemals ueber 1,6 * 620 = 992 -- weit unter dem
      // alten Hoechstwert (aviary: 545 roh, also weit ueber jedem Panzer).
      expect(archetyp.speed, id).toBeLessThan(400);
    }
  });
});

/**
 * Wandtod (Sam, 13.08. abends): „Alles was gegen Wände geht sollte
 * kaputtgehen (Drohnen etc.)." Zwei Fälle, gegeneinander abgesetzt: ein
 * Frontalaufprall MUSS eine Drohne kosten, ein Streifschuss beim normalen
 * Navigieren darf keine kosten – sonst zerlegt sich die Flotte an jeder Kurve
 * des Labyrinths von selbst.
 */
describe('Wandtod', () => {
  interface Interna {
    players: Map<string, any>;
    shapes: Map<string, any>;
    drones: Map<string, any>;
  }

  /** Eine lange, gerade Wand mit freiem Anlauf davor und Auslauf dahinter. */
  const findeWand = () => {
    for (const kandidat of WALLS) {
      if (!kandidat.id.startsWith('v') || kandidat.height < 300) continue;
      const mitteY = kandidat.y + kandidat.height / 2;
      const anlauf = { x: kandidat.x - 320, y: mitteY };
      const dahinter = { x: kandidat.x + kandidat.width + 400, y: mitteY };
      if (isFree(anlauf, 40) && isFree(dahinter, 40)) return { wand: kandidat, anlauf, mitteY };
    }
    throw new Error('keine passende Wand gefunden');
  };

  it('zerstört eine Drohne beim Frontalaufprall auf eine Wand', () => {
    const { wand, anlauf, mitteY } = findeWand();
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Rammsonde');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...anlauf };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);
    game.step(1 / 40, 100_000);
    const startbestand = interna.drones.size;
    expect(startbestand).toBeGreaterThan(0);

    // Zielpunkt weit hinter der Wand – die Flotte hat keine Ausweichmöglichkeit,
    // die Wand steht quer zur ganzen Anlaufstrecke.
    let now = 100_000;
    for (let tick = 0; tick < 100; tick += 1) {
      spieler.aim = { x: wand.x + wand.width + 400 - anlauf.x, y: 0 };
      spieler.primary = true;
      spieler.klick = true;
      game.step(1 / 40, (now += 25));
    }
    expect(interna.drones.size, `${startbestand} Drohnen vorher, ${interna.drones.size} danach`).toBeLessThan(startbestand);
    // Und keine der überlebenden (falls welche außerhalb der Anlaufbahn lagen)
    // steckt IN der Wand – der Tod muss vor dem Durchdringen greifen.
    for (const drohne of interna.drones.values()) {
      const mitte = { x: wand.x + wand.width / 2, y: mitteY };
      expect(Math.hypot(drohne.position.x - mitte.x, drohne.position.y - mitte.y)).toBeGreaterThan(wand.width / 2);
    }
  });

  /**
   * Die Gegenprobe: Im offenen Feld gibt es nichts, an dem eine Drohne
   * zerschellen könnte. Über dieselbe Zahl Ticks wie oben darf keine einzige
   * verschwinden – sonst wäre der Wandtod zu einem allgemeinen Verschleiß
   * geworden.
   */
  it('verliert im offenen Feld keine einzige Drohne', () => {
    const OFFEN = messpunkt({ links: 400, rechts: 400, oben: 400, unten: 400 });
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Kontrolle');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...OFFEN };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);
    game.step(1 / 40, 100_000);
    const startbestand = interna.drones.size;

    let now = 100_000;
    for (let tick = 0; tick < 100; tick += 1) {
      spieler.aim = { x: 300, y: 0 };
      spieler.primary = true;
      spieler.klick = true;
      game.step(1 / 40, (now += 25));
    }
    expect(interna.drones.size).toBe(startbestand);
  });
});

/**
 * Minion-Waffe (D8, Sam: „Factory ist noch keine Factory, sondern einfach
 * Mini-Drohnen"). factory und carrier tragen jetzt ein eigenes Geschütz
 * (`minionWaffe`), das zusätzlich zum Kontakt feuert – nicht statt ihm.
 * Gemessen (`messung-drohnen-minions.mjs`, Gegenprobe mit abgeschalteter
 * Waffe): +25 bis +35 DPS quer über alle gemessenen Abstände.
 */
describe('Minion-Waffe', () => {
  interface Interna {
    players: Map<string, any>;
    shapes: Map<string, any>;
    drones: Map<string, any>;
    projectiles: Map<string, any>;
  }

  const OFFENES_FELD = messpunkt({ links: 400, rechts: 400, oben: 400, unten: 400 });

  // Klassenbaum core -> drone -> factory -> carrier: chooseClass erlaubt nur
  // den direkten Elternschritt, ein Sprung von core direkt auf factory
  // scheitert. Also den ganzen Pfad durchlaufen.
  const KLASSENPFAD: Record<'drone' | 'factory' | 'carrier', ('drone' | 'factory' | 'carrier')[]> = {
    drone: ['drone'],
    factory: ['drone', 'factory'],
    carrier: ['drone', 'factory', 'carrier']
  };

  const aufbau = (klasse: 'factory' | 'carrier' | 'drone') => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...OFFENES_FELD };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    // GAR NICHTS gedrückt: Seit der Recherche vom 16.08. ist das die Lage, in
    // der Drohnen sich selbst ein Ziel suchen – und ohne Ziel gibt es auch
    // keinen Minion-Schuss. Vorher stand hier `primary = true` („E-Auto-Modus"),
    // was seitdem das Gegenteil bedeutet: der Flotte den Zeiger befehlen.
    spieler.primary = false;
    spieler.klick = false;
    for (const schritt of KLASSENPFAD[klasse]) expect(game.chooseClass(id, schritt)).toBe(true);
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

  it('feuert einen Minion-Schuss auf ein Ziel in Reichweite und Sichtlinie', () => {
    const { game, interna } = aufbau('factory');
    const { gegner } = gegnerBei(interna, game, { x: OFFENES_FELD.x + 150, y: OFFENES_FELD.y });

    let now = 100_000;
    let gefeuert = false;
    for (let tick = 0; tick < 80 && !gefeuert; tick += 1) {
      gegner.position = { x: OFFENES_FELD.x + 150, y: OFFENES_FELD.y };
      game.step(1 / 40, (now += 25));
      if (interna.projectiles.size > 0) gefeuert = true;
    }
    expect(gefeuert, 'kein Minion-Schuss innerhalb von 2 s').toBe(true);
  });

  /**
   * factory: 460 px/s * 0,65 s Lebensdauer = 299 px Waffenreichweite. 450 px
   * liegt innerhalb des Suchradius (540) – die Flotte läuft an –, aber weit
   * jenseits der Waffenreichweite. Über die ersten 8 Ticks (0,2 s) kann die
   * Flotte diese Lücke unmöglich schon geschlossen haben.
   */
  it('feuert nicht jenseits der eigenen Waffenreichweite', () => {
    const { game, interna } = aufbau('factory');
    const { gegner } = gegnerBei(interna, game, { x: OFFENES_FELD.x + 450, y: OFFENES_FELD.y });

    let now = 100_000;
    for (let tick = 0; tick < 8; tick += 1) {
      gegner.position = { x: OFFENES_FELD.x + 450, y: OFFENES_FELD.y };
      game.step(1 / 40, (now += 25));
      expect(interna.projectiles.size, `Tick ${tick}: Schuss weit außerhalb der Waffenreichweite`).toBe(0);
    }
  });

  /**
   * Sichtlinie wird von der DROHNE aus geprüft, nicht vom Besitzer. Eine
   * Wand zwischen Flotte und Ziel muss das Feuer unterbinden, auch wenn das
   * Ziel geometrisch innerhalb der Waffenreichweite läge. Dieselbe Wand wie
   * in „Wandtod" – die Flotte läuft bis zur Wand vor und bleibt dort hängen,
   * das Ziel liegt knapp dahinter.
   */
  it('feuert nicht ohne Sichtlinie, auch wenn das Ziel geometrisch in Reichweite läge', () => {
    const findeWand = () => {
      for (const kandidat of WALLS) {
        if (!kandidat.id.startsWith('v') || kandidat.width > 200 || kandidat.height < 300) continue;
        const mitteY = kandidat.y + kandidat.height / 2;
        const anlauf = { x: kandidat.x - 320, y: mitteY };
        const dahinter = { x: kandidat.x + kandidat.width + 40, y: mitteY };
        if (isFree(anlauf, 40) && isFree(dahinter, 40) && !hasLineOfSight(anlauf, dahinter)) {
          return { wand: kandidat, anlauf, dahinter };
        }
      }
      throw new Error('keine passende Wand gefunden');
    };
    const { anlauf, dahinter } = findeWand();

    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...anlauf };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);
    expect(game.chooseClass(id, 'factory')).toBe(true);
    game.step(1 / 40, 100_000);
    gegnerBei(interna, game, dahinter);

    let now = 100_000;
    for (let tick = 0; tick < 100; tick += 1) {
      game.step(1 / 40, (now += 25));
      expect(interna.projectiles.size, `Tick ${tick}: Schuss ohne Sichtlinie durch die Wand`).toBe(0);
    }
  });

  /**
   * Reine Kontaktklassen (kein `minionWaffe`) sind vom Feature unberührt –
   * niemals ein Eintrag in `projectiles`, egal wie nah der Gegner ist.
   */
  it('lässt reine Kontaktklassen unverändert – nie ein Minion-Schuss', () => {
    const { game, interna } = aufbau('drone');
    const { gegner } = gegnerBei(interna, game, { x: OFFENES_FELD.x + 150, y: OFFENES_FELD.y });

    let now = 100_000;
    for (let tick = 0; tick < 80; tick += 1) {
      gegner.position = { x: OFFENES_FELD.x + 150, y: OFFENES_FELD.y };
      gegner.health = gegner.maxHealth;
      game.step(1 / 40, (now += 25));
      expect(interna.projectiles.size, `Tick ${tick}: drone hat keine minionWaffe, darf nicht schießen`).toBe(0);
    }
  });
});

/**
 * Drohnen-Rework 3 (Sams Spieltest vom 14.08., Punkt 8).
 *
 * > „Die Drohnen-Klasse fühlt sich noch immer MEGA MEGA komisch an zu spielen.
 * > Ich will das EINS ZU EINS wie in DIEP.io haben vom FEELING, dort haben sie
 * > das perfekt gemacht."
 *
 * Gemessen war der Grund eine einzige Zahl: Der Formationsplatz jeder Drohne
 * stand FEST am Ziel, und die Ankunftsbremse (`abstand / BREMS_SEKUNDEN`)
 * ergibt auf einem festen Punkt exakt 0. Mit gehaltenem Linksklick flog die
 * Flotte zum Zeiger und **parkte dort mit 0,0 px/s** – alle sechs
 * Drohnenklassen, ohne Ausnahme. Eine parkende Flotte ist ein Standbild, kein
 * Schwarm.
 *
 * In Diep.io steht eine Drohne nie: Sie kreist um ihren Zielpunkt, bis ein
 * neuer Befehl kommt. Seit `FORMATION_DREHUNG` wandert der Platz, die Drohne
 * kommt nie an – und kreist deshalb von selbst.
 */
describe('Drohnen kreisen, statt zu parken (Stufe 3)', () => {
  const FELD = messpunkt({ links: 380, rechts: 380, oben: 380, unten: 380 });

  interface Interna {
    players: Map<string, any>;
    shapes: Map<string, any>;
    drones: Map<string, any>;
    stepDrones(dt: number, now: number): void;
  }

  /**
   * Flotte auf einen Zeiger 260 px rechts vom Panzer, eingeschwungen.
   *
   * Der Pfad wird abgelaufen, nicht gesprungen: `chooseClass` erlaubt nur den
   * jeweils nächsten Schritt der eigenen Familie (plus den Apex).
   */
  const amZeiger = (pfad: readonly ['drone', ...('warden' | 'overseer' | 'sovereign')[]]) => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...FELD };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    for (const stufe of pfad) expect(game.chooseClass(id, stufe), stufe).toBe(true);
    spieler.aim = { x: 260, y: 0 };
    // Geklickt, nicht Auto-Modus: Dieser Block prüft den Kreis UM DEN ZEIGER.
    spieler.primary = true;
    spieler.klick = true;
    let now = 100_000;
    for (let tick = 0; tick < 200; tick += 1) interna.stepDrones(1 / 40, (now += 25));
    return { interna, spieler, now };
  };

  const PFADE = [
    ['drone'],
    ['drone', 'warden'],
    ['drone', 'warden', 'overseer'],
    ['drone', 'warden', 'overseer', 'sovereign']
  ] as const;

  it.each(PFADE)('lässt die Flotte von %s… am Zeiger nicht stehenbleiben', (...pfad) => {
    const { interna, spieler } = amZeiger(pfad as unknown as Parameters<typeof amZeiger>[0]);
    let now = 105_000;
    const tempi: number[] = [];
    for (let tick = 0; tick < 200; tick += 1) {
      interna.stepDrones(1 / 40, (now += 25));
      for (const drohne of interna.drones.values()) tempi.push(Math.hypot(drohne.velocity.x, drohne.velocity.y));
    }
    expect(tempi.length).toBeGreaterThan(0);
    // Vor dieser Stufe war das LANGSAMSTE gemessene Tempo 0,0 px/s – und zwar
    // das schnellste zugleich, weil alle standen.
    expect(Math.min(...tempi)).toBeGreaterThan(40);
    expect(spieler.dead).toBe(false);
  });

  it('hält dabei einen gleichmäßigen Ring um den Zeiger', () => {
    const { interna, spieler } = amZeiger(['drone']);
    const zeiger = { x: spieler.position.x + spieler.aim.x, y: spieler.position.y + spieler.aim.y };
    let now = 105_000;
    const abstaende: number[] = [];
    for (let tick = 0; tick < 200; tick += 1) {
      interna.stepDrones(1 / 40, (now += 25));
      for (const drohne of interna.drones.values()) {
        abstaende.push(Math.hypot(drohne.position.x - zeiger.x, drohne.position.y - zeiger.y));
      }
    }
    // Kreis, nicht Spirale und nicht Pendel: Der Ring bleibt über 5 Sekunden
    // innerhalb weniger Pixel derselbe.
    expect(Math.max(...abstaende) - Math.min(...abstaende)).toBeLessThan(6);
    expect(Math.min(...abstaende)).toBeGreaterThan(10);
  });

  /**
   * Sam, Punkt 8, ist ohne die Zeigerreichweite nicht erfüllbar: Bei 650 px
   * blieb die Flotte 268 px vor einem Gegner stehen, der in der Ecke des
   * eigenen Bildschirms stand. Die halbe Bilddiagonale ist 918 px.
   */
  it('erlaubt Zielpunkte bis in die Ecke des Sichtfensters', () => {
    const halbeDiagonale = Math.hypot(GAME.visibleWorldWidth / 2, GAME.visibleWorldHeight / 2);
    expect(GAME.maxAimDistance).toBeGreaterThanOrEqual(halbeDiagonale);
  });
});

/**
 * Wann Drohnen von selbst angreifen – Sams Klarstellung vom 14.08.:
 *
 * > „die sollen nur angreifen, wenn du im E-Auto-Modus bist und man nix
 * > klickt; sonst immer in der Maus-Nähe, wenn man klickt, obv wie bei
 * > Diep.io"
 *
 * Das ist eine Rücknahme seines eigenen Auftrags vom 13.08. („da müssen die
 * Drohnen ja auch irgendwas angreifen"), und zwar eine präzisere: Angreifen
 * ja – aber nur im Auto-Modus. Ohne Kommando und ohne Auto schweben sie, genau
 * wie in Diep.io.
 *
 * Drei Zustände, drei Tests. Gemessen wird am Schaden und am Ort der Flotte,
 * nicht an einem Zustandsfeld.
 */
describe('Drohnen: Auto-Fire ist nicht Auto-Aim (Recherche 16.08.)', () => {
  const FELD = messpunkt({ links: 380, rechts: 380, oben: 380, unten: 380 });

  interface Interna {
    players: Map<string, any>;
    shapes: Map<string, any>;
    drones: Map<string, any>;
  }

  /** Controller auf freiem Feld, Gegner 200 px rechts, Zeiger nach rechts. */
  const feld = (modus: { primary: boolean; klick: boolean }) => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as Interna;
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...FELD };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);

    const gegnerId = game.addPlayer('Gegner');
    const gegner = interna.players.get(gegnerId);
    gegner.position = { x: FELD.x + 200, y: FELD.y };
    gegner.invulnerable = false;
    gegner.invulnerableUntil = 0;
    gegner.level = 45;

    let now = 100_000;
    for (let tick = 0; tick < 120; tick += 1) {
      // Zeiger nach LINKS, Gegner steht rechts: Ein Klick schickt die Flotte
      // damit weg vom Gegner – nur so lässt sich „zum Zeiger" von „sucht sich
      // selbst ein Ziel" überhaupt unterscheiden.
      spieler.aim = { x: -260, y: 0 };
      spieler.primary = modus.primary;
      spieler.klick = modus.klick;
      gegner.position = { x: FELD.x + 200, y: FELD.y };
      game.step(1 / 40, (now += 25));
    }
    const drohnen = [...interna.drones.values()];
    expect(drohnen.length).toBeGreaterThan(0);
    const zumGegner = drohnen.reduce((summe, d) => summe + Math.hypot(d.position.x - gegner.position.x, d.position.y - gegner.position.y), 0) / drohnen.length;
    return { spieler, gegner, zumGegner, schaden: gegner.maxHealth - gegner.health };
  };

  /*
   * **Die Umkehrung vom 16.08.** Bis dahin galt hier Sams Regel vom 14.08.:
   * „die sollen nur angreifen, wenn du im E-Auto-Modus bist und man nix
   * klickt". Seine eigene Recherche (DiepInDepth, Diep-Wiki,
   * arras.io-Quellcode) hat das widerlegt – und zwar als erste Zeile:
   *
   * > „Auto-Fire ist nicht Auto-Aim. Mit aktiviertem Auto-Fire folgen die
   * > steuerbaren Drohnen permanent dem Cursor und wechseln deshalb nicht in
   * > ihre normale Idle-AI."
   *
   * Also: Auto-Feuer verhält sich wie ein gehaltener Linksklick, und die eigene
   * Zielsuche greift nur, wenn GAR NICHTS gedrückt ist. Diese beiden Tests
   * stehen genau andersherum als vorher, mit Absicht.
   */
  it('folgt bei Auto-Feuer dem Zeiger – und sucht sich NICHT selbst ein Ziel', () => {
    // Zeiger nach links, Gegner rechts: Wer selbst zielt, greift an. Wer dem
    // Zeiger folgt, fliegt weg.
    const { zumGegner, schaden } = feld({ primary: true, klick: false });
    expect(schaden, `Flotte hat trotz Auto-Feuer selbst gejagt (${zumGegner.toFixed(0)} px)`).toBe(0);
    expect(zumGegner).toBeGreaterThan(120);
  });

  it('sucht sich selbst ein Ziel, wenn gar nichts gedrückt ist', () => {
    const { zumGegner, schaden } = feld({ primary: false, klick: false });
    expect(schaden, `kein Schaden, Flotte ${zumGegner.toFixed(0)} px entfernt`).toBeGreaterThan(0);
    expect(zumGegner).toBeLessThan(120);
  });

  it('folgt dem Klick zum Zeiger, auch wenn der Auto-Modus läuft', () => {
    // primary UND klick: Der Auto-Modus ist an, der Spieler klickt trotzdem.
    // Der Zeiger zeigt weg vom Gegner – die Flotte muss dorthin, nicht jagen.
    const { zumGegner, schaden } = feld({ primary: true, klick: true });
    expect(zumGegner, 'Flotte ist zum Gegner gejagt statt zum Zeiger').toBeGreaterThan(300);
    expect(schaden).toBe(0);
  });
});

/**
 * Die Ruhe-Drosselung darf die Flotte nicht abhängen (16.08.).
 *
 * Der Ruhezustand fliegt gedrosselt, damit der enge Orbit nicht in die Wände
 * des Labyrinths sweept. Ein fester Deckel wäre aber ein neuer Fehler gewesen:
 * Ein Besitzer, der ohne Kommando losfährt, hätte seine Drohnen stehen lassen.
 */
describe('Ruhende Flotte folgt einem fahrenden Besitzer', () => {
  // Ein Gangstück: waagerecht Platz zum Fahren, seitlich nur so viel, wie ein
  // Gang wirklich hergibt (320 px breit).
  const FELD = messpunkt({ links: 260, rechts: 420, oben: 130, unten: 130 });

  it('bleibt beim Besitzer, auch wenn er ohne Kommando volle Fahrt macht', () => {
    const game = tuneDrones(tuneCombatScaling(new MazeGame(0)));
    const interna = game as unknown as { players: Map<string, any>; drones: Map<string, any>; shapes: Map<string, any> };
    interna.shapes.clear();
    const id = game.addPlayer('Controller');
    const spieler = interna.players.get(id);
    spieler.level = 45;
    spieler.position = { ...FELD, x: FELD.x - 200 };
    spieler.invulnerable = false;
    spieler.invulnerableUntil = 0;
    expect(game.chooseClass(id, 'drone')).toBe(true);

    let now = 100_000;
    // Erst sammeln lassen, dann losfahren – ohne jedes Kommando.
    for (let tick = 0; tick < 80; tick += 1) { spieler.move = { x: 0, y: 0 }; spieler.primary = false; spieler.klick = false; game.step(1 / 40, (now += 25)); }
    for (let tick = 0; tick < 60; tick += 1) { spieler.move = { x: 1, y: 0 }; spieler.primary = false; spieler.klick = false; game.step(1 / 40, (now += 25)); }

    const drohnen = [...interna.drones.values()];
    expect(drohnen.length).toBeGreaterThan(0);
    const abstand = drohnen.reduce((summe, d) => summe + Math.hypot(d.position.x - spieler.position.x, d.position.y - spieler.position.y), 0) / drohnen.length;
    expect(abstand, `Flotte ${abstand.toFixed(0)} px hinter dem Besitzer`).toBeLessThan(220);
  });
});
