import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, type PlayerClass } from '@project-maze/shared';
import {
  BOT_CLASS_PATHS,
  DEFAULT_BOT_PACING,
  MAX_ATTACKERS_PER_TARGET,
  ROOKIE_PROTECTION_LEVEL,
  TIER_SEQUENCE,
  type BotPacingConfig,
  tuneBotBrain
} from './bot-brain';
import { messfeld } from './messfeld';
import { tuneCombatScaling } from './combat-tuning';
import { MazeGame, botState } from './game';
import { hasLineOfSight, isFree } from './world';

// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts).
const ORT = messfeld(340);

/** Die drei Angreifer-Plätze rund um den Menschen, je 100 Einheiten entfernt. */
const RING_VERSATZ = [{ x: 0, y: -100 }, { x: 0, y: 100 }, { x: -100, y: 0 }];

/**
 * Ein Fleck Arena, auf dem der Mensch und alle drei Angreifer frei stehen und
 * sich gegenseitig sehen.
 *
 * Vorher stand hier der Festpunkt (2800, 2200). Der war auf der 6000 × 4000er
 * Karte offen; nach dem Wachstum auf 9000 × 6000 lag einer der drei Ringplätze
 * in einer Wand, der Bot hatte keine Sichtlinie und wählte gar kein Ziel – der
 * Test fiel über die Karte, nicht über das Verhalten, das er prüfen soll.
 */
function freieMitte(): { x: number; y: number } {
  for (let y = 400; y < GAME.worldHeight - 400; y += 50) {
    for (let x = 400; x < GAME.worldWidth - 400; x += 50) {
      const mitte = { x, y };
      if (!isFree(mitte, 22)) continue;
      const ring = RING_VERSATZ.map((v) => ({ x: x + v.x, y: y + v.y }));
      if (ring.every((punkt) => isFree(punkt, 22) && hasLineOfSight(punkt, mitte))) return mitte;
    }
  }
  throw new Error('Keine freie Kampfflaeche in der Arena gefunden');
}

interface Internals {
  players: Map<string, any>;
  updateBot(player: any, now: number): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
  killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
}

const createGame = (botCount: number, pacing: BotPacingConfig | null = DEFAULT_BOT_PACING): MazeGame =>
  tuneBotBrain(tuneCombatScaling(new MazeGame(botCount)), pacing);

const botsByStyle = (internals: Internals, style: string): any[] =>
  [...internals.players.values()].filter((player) => player.bot?.style === style);

/**
 * Ein Jäger, ein Mensch, freies Feld – alle anderen weit außer Reichweite.
 * Die Koordinaten liegen nachweislich frei und in Sichtlinie zueinander; der
 * Jäger ist der einzige Stil mit Angriffslust 1.0 und damit der einzige, der
 * ohne Zufall entscheidet (Teamplan-Regel 8).
 */
const duel = (pacing: BotPacingConfig | null = DEFAULT_BOT_PACING) => {
  const game = createGame(2, pacing);
  const internals = game as unknown as Internals;
  const humanId = game.addPlayer('Ziel');
  const human = internals.players.get(humanId);
  const hunter = botsByStyle(internals, 'hunter')[0];
  const victim = botsByStyle(internals, 'farmer')[0];

  hunter.position = ORT;
  human.position = { x: ORT.x + 100, y: ORT.y };
  human.level = 20;
  human.invulnerable = false;
  human.invulnerableUntil = 0;
  for (const player of internals.players.values()) {
    if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
  }
  return { game, internals, humanId, human, hunter, victim };
};

/** Erzwingt eine frische Zielentscheidung, statt auf das Reaktionsfenster zu warten. */
const decide = (internals: Internals, bot: any, now: number): void => {
  bot.bot.decisionAt = 0;
  internals.updateBot(bot, now);
};

describe('bot brain', () => {
  it('protects fresh low-level players until they attack first', () => {
    const game = createGame(2);
    const humanId = game.addPlayer('Fresh');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    const hunter = botsByStyle(internals, 'hunter')[0];
    expect(hunter).toBeDefined();

    hunter.position = ORT;
    human.position = { x: ORT.x + 100, y: ORT.y };
    human.level = 1;
    human.invulnerable = false;
    human.invulnerableUntil = 0;
    for (const player of internals.players.values()) {
      if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
    }

    internals.updateBot(hunter, 10_000);
    expect(hunter.bot.targetId).toBeNull();
    expect(human.level).toBeLessThan(ROOKIE_PROTECTION_LEVEL);

    internals.damagePlayer(hunter, 5, humanId, 10_500);
    hunter.bot.decisionAt = 0;
    internals.updateBot(hunter, 11_000);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('leads moving targets instead of aiming at their current position', () => {
    const game = createGame(2);
    const humanId = game.addPlayer('Runner');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    const hunter = botsByStyle(internals, 'hunter')[0];

    hunter.position = ORT;
    human.position = { x: ORT.x + 100, y: ORT.y };
    human.velocity = { x: 0, y: 220 };
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;
    for (const player of internals.players.values()) {
      if (player !== hunter && player !== human) player.position = { x: 240, y: 240 };
    }

    internals.updateBot(hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);
    expect(hunter.aim.y).toBeGreaterThan(0);
  });

  it('limits how many bots hunt the same target', () => {
    const game = createGame(8);
    const humanId = game.addPlayer('Star');
    const internals = game as unknown as Internals;
    const human = internals.players.get(humanId);
    human.position = ORT;
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;

    const aggressive = [...botsByStyle(internals, 'hunter'), ...botsByStyle(internals, 'brawler')].slice(0, 3);
    expect(aggressive).toHaveLength(3);
    for (const player of internals.players.values()) {
      if (player !== human && !aggressive.includes(player)) player.position = { x: 240, y: 240 };
    }
    // Relativ zum gesuchten Ort, nicht absolut: Die drei standen als feste
    // Koordinaten da und lagen nach dem Labyrinth-Umbau in einer Wand.
    aggressive[0].position = { x: ORT.x - 100, y: ORT.y };
    aggressive[1].position = { x: ORT.x + 100, y: ORT.y + 100 };
    aggressive[2].position = { x: ORT.x + 50, y: ORT.y - 100 };

    let now = 10_000;
    for (const bot of aggressive) {
      bot.bot.decisionAt = 0;
      internals.updateBot(bot, now);
      now += 50;
    }
    const hunting = aggressive.filter((bot) => bot.bot.targetId === humanId);
    expect(hunting.length).toBeLessThanOrEqual(MAX_ATTACKERS_PER_TARGET);
    expect(hunting.length).toBeGreaterThan(0);
  });

  it('gönnt Menschen nach einem Abschuss eine Verschnaufpause', () => {
    const { internals, humanId, hunter, victim } = duel();
    decide(internals, hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // Der Jäger holt sich einen anderen Abschuss – danach lässt er von Menschen ab.
    internals.killPlayer(victim, hunter.id, 11_000, 'Arena');
    expect(hunter.bot.targetId).toBeNull();

    decide(internals, hunter, 12_000);
    expect(hunter.bot.targetId).toBeNull();
    decide(internals, hunter, 11_000 + DEFAULT_BOT_PACING.killDisengageMs - 1);
    expect(hunter.bot.targetId).toBeNull();

    decide(internals, hunter, 11_000 + DEFAULT_BOT_PACING.killDisengageMs + 1);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('bricht eine erfolglose Jagd nach dem Timeout ab und lässt das Ziel ziehen', () => {
    const { internals, humanId, hunter } = duel();
    const start = 10_000;
    const { huntTimeoutMs, huntGiveUpMs } = DEFAULT_BOT_PACING;
    decide(internals, hunter, start);
    expect(hunter.bot.targetId).toBe(humanId);

    // Punktgenau am Limit läuft die Jagd noch.
    decide(internals, hunter, start + huntTimeoutMs);
    expect(hunter.bot.targetId).toBe(humanId);

    decide(internals, hunter, start + huntTimeoutMs + 1);
    expect(hunter.bot.targetId).toBeNull();

    // Wer entkommen ist, bleibt für diesen Bot eine Weile unsichtbar …
    decide(internals, hunter, start + huntTimeoutMs + huntGiveUpMs);
    expect(hunter.bot.targetId).toBeNull();
    // … danach darf er wieder gejagt werden.
    decide(internals, hunter, start + huntTimeoutMs + huntGiveUpMs + 2);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('stellt den Jagd-Timeout mit jedem eigenen Treffer neu', () => {
    const { internals, humanId, human, hunter } = duel();
    const start = 10_000;
    const hit = 15_000;
    const { huntTimeoutMs } = DEFAULT_BOT_PACING;
    decide(internals, hunter, start);
    expect(hunter.bot.targetId).toBe(humanId);

    internals.damagePlayer(human, 5, hunter.id, hit);
    // 8,5 s nach der Zielaufnahme, aber nur 3,5 s nach dem Treffer: bleibt dran.
    decide(internals, hunter, start + huntTimeoutMs + 500);
    expect(hunter.bot.targetId).toBe(humanId);

    decide(internals, hunter, hit + huntTimeoutMs + 1);
    expect(hunter.bot.targetId).toBeNull();
  });

  it('lässt auch Vergeltung keinen dritten Angreifer auf denselben Menschen zu', () => {
    const game = createGame(8);
    const internals = game as unknown as Internals;
    const humanId = game.addPlayer('Star');
    const human = internals.players.get(humanId);
    human.position = freieMitte();
    human.level = 20;
    human.invulnerable = false;
    human.invulnerableUntil = 0;

    const attackers = [...botsByStyle(internals, 'hunter'), ...botsByStyle(internals, 'brawler')].slice(0, 3);
    expect(attackers).toHaveLength(3);
    for (const player of internals.players.values()) {
      if (player !== human && !attackers.includes(player)) player.position = { x: 240, y: 240 };
    }
    // Gleiche Level und je 100 Einheiten Abstand: Der Mensch ist für alle drei
    // das nächste und bestbewertete Ziel, ganz ohne Zufall.
    const ring = RING_VERSATZ.map((v) => ({ x: human.position.x + v.x, y: human.position.y + v.y }));
    attackers.forEach((bot, index) => {
      bot.position = ring[index]!;
      bot.level = human.level;
    });

    decide(internals, attackers[0], 10_000);
    decide(internals, attackers[1], 10_050);
    expect(attackers[0].bot.targetId).toBe(humanId);
    expect(attackers[1].bot.targetId).toBe(humanId);

    // Der Dritte prallt am Deckel ab – auch nachdem der Mensch ihn getroffen hat.
    decide(internals, attackers[2], 10_100);
    expect(attackers[2].bot.targetId).not.toBe(humanId);
    internals.damagePlayer(attackers[2], 5, humanId, 10_150);
    decide(internals, attackers[2], 10_200);
    expect(attackers[2].bot.targetId).not.toBe(humanId);

    // Der Deckel darf keinen der beiden Plätze kosten: Wer drauf ist, bleibt drauf.
    decide(internals, attackers[0], 10_250);
    expect(attackers[0].bot.targetId).toBe(humanId);
  });

  it('schickt mehr Bots zum Farmen als zum Jagen', () => {
    const stylesOf = (count: number): string[] =>
      Array.from({ length: count }, (_, index) => botState(index).style);

    // Die übliche Arena (acht Bots) enthält weiterhin jeden Stil …
    const arena = stylesOf(8);
    for (const style of ['farmer', 'hunter', 'kiter', 'brawler', 'controller']) {
      expect(arena).toContain(style);
    }
    // … aber Farmer sind die größte Gruppe, und die Sniper-Stile schrumpfen.
    expect(arena.filter((style) => style === 'farmer').length).toBe(3);
    expect(arena.filter((style) => style === 'hunter' || style === 'kiter').length).toBeLessThanOrEqual(3);

    // Über eine volle Runde der Stilfolge: 40 % Farmer statt vorher 20 %.
    const cycle = stylesOf(30);
    expect(cycle.filter((style) => style === 'farmer').length / cycle.length).toBeCloseTo(0.4, 5);

    // Und die Angriffslust passt zum Stil – Farmer gehen selten ran.
    expect(DEFAULT_BOT_PACING.styleAggression.farmer).toBeLessThan(0.4);
    expect(DEFAULT_BOT_PACING.styleAggression.hunter).toBe(1);
  });

  it('verhält sich ohne Pacing-Konfiguration exakt wie vorher', () => {
    const { internals, humanId, hunter, victim } = duel(null);
    decide(internals, hunter, 10_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // Keine Verschnaufpause nach dem Abschuss …
    internals.killPlayer(victim, hunter.id, 11_000, 'Arena');
    decide(internals, hunter, 12_000);
    expect(hunter.bot.targetId).toBe(humanId);

    // … und kein Jagd-Timeout, egal wie lange die Jagd erfolglos bleibt.
    decide(internals, hunter, 10_000 + DEFAULT_BOT_PACING.huntTimeoutMs * 4);
    expect(hunter.bot.targetId).toBe(humanId);
  });

  it('keeps a fair skill mix and only valid class paths', () => {
    const rookies = TIER_SEQUENCE.filter((tier) => tier === 'rookie').length;
    const veterans = TIER_SEQUENCE.filter((tier) => tier === 'veteran').length;
    const elites = TIER_SEQUENCE.filter((tier) => tier === 'elite').length;
    expect(rookies).toBe(2);
    expect(veterans).toBe(2);
    expect(elites).toBe(1);

    for (const paths of Object.values(BOT_CLASS_PATHS)) {
      // Klassen 4.0: mindestens die drei klassischen Pfade, dazu neue Wege
      // durch SPECTER/TEMPEST und den Familien-Apex am Ende.
      expect(paths.length).toBeGreaterThanOrEqual(3);
      for (const pfad of paths) {
        // Jeder Schritt muss vom vorherigen aus tatsaechlich waehlbar sein -
        // dieselbe Regel, mit der der Server die Wahl auch prueft.
        let aktuell: PlayerClass = 'core';
        for (const ziel of pfad) {
          const definition = CLASS_DEFINITIONS[ziel];
          const erreichbar = definition.parent === aktuell
            || (definition.apexOf !== undefined && definition.apexOf === CLASS_DEFINITIONS[aktuell].branch);
          expect(erreichbar, `${aktuell} -> ${ziel}`).toBe(true);
          aktuell = ziel;
        }
      }
    }
  });
});

/**
 * Rechtsklick bei Drohnenklassen (Drohnen-Rework 2, Sam: „Die Bots benutzen
 * bei Drohnen kein Rechtsklick"). Vorher löste `secondary` bei JEDEM nahen
 * Gegner aus, egal ob der Bot angriff oder floh – das drückte die eigene
 * Flotte genau dann vom Gegner weg, wenn Kontaktschaden am meisten brachte.
 */
describe('Rechtsklick bei Drohnenbots', () => {
  const aufbau = () => {
    const game = createGame(1);
    const internals = game as unknown as Internals;
    const bot = [...internals.players.values()].find((player) => player.bot);
    if (!bot) throw new Error('kein Bot erzeugt');
    bot.playerClass = 'drone';
    bot.position = ORT;
    bot.invulnerable = false;
    bot.invulnerableUntil = 0;
    bot.maxHealth = 200;
    // Jäger hat als einziger Stil Angriffslust 1,0 (kein Würfelwurf) – ohne
    // das entscheidet die Zielaufnahme selbst per Zufall, ob der Gegner
    // überhaupt anvisiert wird, und der Test würde flackern statt das
    // Rechtsklick-Verhalten zu prüfen.
    bot.bot.style = 'hunter';

    const feindId = game.addPlayer('Feind');
    const feind = internals.players.get(feindId);
    feind.position = { x: ORT.x + 150, y: ORT.y };
    feind.invulnerable = false;
    feind.invulnerableUntil = 0;
    feind.level = 20;
    return { game, internals, bot, feind };
  };

  it('schiebt die Flotte als Schutzschild weg, während der Bot flieht', () => {
    const { internals, bot } = aufbau();
    bot.health = bot.maxHealth * 0.1; // klar unter jedem fleeHealth-Wert (0,1-0,48)
    decide(internals, bot, 10_000);
    expect(bot.secondary, 'kein Rechtsklick trotz Flucht mit nahem Gegner').toBe(true);
    expect(bot.primary).toBe(false);
  });

  it('lässt den Rechtsklick beim Angriff aus – dafür ist die automatische Zielsuche da', () => {
    const { internals, bot } = aufbau();
    bot.health = bot.maxHealth; // voll gesund, kein Fluchtgrund
    decide(internals, bot, 10_000);
    expect(bot.secondary, 'Rechtsklick trotz gesunder Flotte im Angriff').toBe(false);
  });
});

describe('Bot-Bestand (Befund 75)', () => {
  /** Standardarena bauen, einen Tick laufen lassen (Gehirne entstehen), Bestand lesen. */
  const bestand = () => {
    const game = tuneBotBrain(tuneCombatScaling(new MazeGame(18)), DEFAULT_BOT_PACING);
    const internals = game as unknown as Internals;
    game.step(0.025, 1_000_000);
    return [...internals.players.values()]
      .filter((player) => player.bot)
      .map((player) => ({
        style: (player.bot as { style: string }).style,
        aimError: (player.bot as { aimError: number }).aimError,
        reactionMs: (player.bot as { reactionMs: number }).reactionMs,
        path: (player.bot as { classPath: PlayerClass[] }).classPath.join('>'),
        family: CLASS_DEFINITIONS[(player.bot as { classPath: PlayerClass[] }).classPath.at(-1)!].branch
      }));
  };

  it('enthält alle acht Familien – auch SIEGE und AEGIS', () => {
    // Vorher fehlten genau die beiden Familien, die der Kommentar an der
    // Controller-Rotation ausdrücklich haben will: Die Modulo-Kopplung von
    // Stil (Periode 10) und Pfad/Tier (gemeinsamer Zähler) zog sie nie.
    const familien = new Set(bestand().map((bot) => bot.family));
    expect([...familien].sort()).toEqual(
      ['aegis', 'control', 'impact', 'precision', 'rapid', 'siege', 'specter', 'tempest']
    );
  });

  it('vergibt 18 verschiedene Archetypen und mehrere Tiers je Stil', () => {
    const bots = bestand();
    // Archetyp = Stil + Profil + Pfad; vorher waren es 12 auf 18 Plätzen.
    const archetypen = new Set(bots.map((bot) => `${bot.style}|${bot.aimError}|${bot.reactionMs}|${bot.path}`));
    expect(archetypen.size).toBe(18);
    // Kein Stil ist mehr auf ein einziges Profil festgenagelt („jeder Kiter
    // Veteran, kein Hunter je Elite").
    const profileJeStil = new Map<string, Set<number>>();
    for (const bot of bots) {
      const set = profileJeStil.get(bot.style) ?? new Set<number>();
      set.add(bot.aimError);
      profileJeStil.set(bot.style, set);
    }
    for (const [stil, profile] of profileJeStil) {
      expect(profile.size, `Stil ${stil} hat nur ein Profil`).toBeGreaterThan(1);
    }
  });

  it('bleibt je Arena deterministisch – Tests und Wiederholungsläufe brauchen das', () => {
    const key = (bots: ReturnType<typeof bestand>) => bots.map((bot) => `${bot.style}|${bot.aimError}|${bot.path}`).join(';');
    expect(key(bestand())).toBe(key(bestand()));
  });
});
