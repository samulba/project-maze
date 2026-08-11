import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  UPGRADE_IDS,
  upgradePointsAtLevel,
  type PlayerClass,
  type UpgradeId
} from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import {
  FAMILY_SCALING,
  FAMILY_UPGRADE_IDS,
  familyBuildRate,
  impactBodyDamageBonus,
  momentumConfigFor,
  rapidReloadBonus,
  tuneFamilyUpgrades,
  wuchtConfigFor,
  type SignatureFamily
} from './family-upgrades';
import { MazeGame } from './game';
import { SIGNATURE_MAX } from './signature';
import { DEFAULT_WUCHT, tuneImpactSignature, wuchtContactDamage, wuchtFor } from './signature-impact';
import { DEFAULT_MOMENTUM, momentumFor, momentumReloadScale, tuneRapidSignature } from './signature-rapid';

const DT = 0.025;
const OPEN_GROUND = { x: 2800, y: 2200 };

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  spendBotPoints(player: any): void;
}

const ALL_FAMILIES: SignatureFamily[] = [
  'rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis'
];

const createGame = (families: SignatureFamily[] = ['rapid', 'impact'], familyUpgrades = true) => {
  const game = tuneImpactSignature(
    tuneRapidSignature(
      tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), families),
      true,
      DEFAULT_MOMENTUM,
      familyUpgrades
    ),
    true,
    DEFAULT_WUCHT,
    familyUpgrades
  );
  const internals = game as unknown as Internals;
  // Formen wachsen während langer Läufe nach und machen Körperschaden – für
  // jede Messung hier ist das nur Rauschen (Teamplan-Regel 8).
  internals.shapes.clear();
  return { game, internals };
};

const spawn = (game: MazeGame, internals: Internals, playerClass: PlayerClass, level = 45) => {
  const id = game.addPlayer('Fahrer');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.level = level;
  player.availablePoints = upgradePointsAtLevel(level);
  player.position = { ...OPEN_GROUND };
  player.velocity = { x: 0, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  return { id, player };
};

/**
 * Laufband: fahren (und feuern), Position nach jedem Tick zurücksetzen. Gibt
 * den höchsten Cooldown zurück, der dabei zu sehen war – der wird nur beim
 * Schuss gesetzt und läuft danach herunter, ist also exakt
 * `reload × Nachladefaktor`. Den Cooldown am Ende abzulesen hinge dagegen
 * davon ab, wo im Feuerzyklus der letzte Tick zufällig landet.
 */
const drive = (
  game: MazeGame,
  player: any,
  ticks: number,
  options: { firing?: boolean; start?: number } = {}
): { now: number; peakCooldown: number } => {
  let now = options.start ?? 100_000;
  let peakCooldown = 0;
  for (let i = 0; i < ticks; i += 1) {
    now += DT * 1000;
    player.move = { x: 1, y: 0 };
    player.aim = { x: 200, y: 0 };
    player.primary = options.firing ?? true;
    game.step(DT, now);
    player.position = { ...OPEN_GROUND };
    peakCooldown = Math.max(peakCooldown, player.cooldown);
  }
  return { now, peakCooldown };
};

/**
 * Nachladefaktor bei vollem Momentum: erst aufladen, dann einen vollen
 * Feuerzyklus lang messen.
 */
const loadedReloadFactor = (game: MazeGame, id: string, player: any): number => {
  const filled = drive(game, player, 400);
  expect(momentumFor(game, id)).toBe(SIGNATURE_MAX);
  const measured = drive(game, player, 40, { start: filled.now });
  return measured.peakCooldown / tunedStatsFor(player).reload;
};

/**
 * Deckelt die Zahl der `applyUpgrade`-Aufrufe und wirft danach.
 *
 * Eine Endlosschleife in `spendBotPoints` blockiert den Node-Event-Loop
 * vollständig – der Testlauf würde nicht fehlschlagen, sondern hängen, und in
 * der CI als Timeout ohne Fehlermeldung enden. Mit dem Deckel wird daraus ein
 * normaler, sofort lesbarer Fehlschlag.
 */
const capApplyUpgradeCalls = (internals: Internals, limit = 500): void => {
  const original = internals.applyUpgrade.bind(internals);
  let calls = 0;
  internals.applyUpgrade = (playerId: string, upgrade: UpgradeId): boolean => {
    calls += 1;
    if (calls > limit) throw new Error(`applyUpgrade ${limit}x aufgerufen - spendBotPoints dreht endlos`);
    return original(playerId, upgrade);
  };
};

describe('familien-upgrades – zahlen', () => {
  it('hängt genau zwei Slots an, ohne die acht Basis-Indizes zu verschieben', () => {
    expect(UPGRADE_IDS.slice(0, 8)).toEqual([
      'maxHealth', 'regen', 'moveSpeed', 'reload', 'damage', 'projectileSpeed', 'penetration', 'bodyDamage'
    ]);
    // Klassen 4.0 haengt hinter den Familien-Slots zwei weitere Basis-Slots
    // an (Reichweite, Faehigkeit) - die Familien-Slots behalten Index 8 und 9.
    expect(UPGRADE_IDS.slice(8, 10)).toEqual(FAMILY_UPGRADE_IDS);
    expect(UPGRADE_IDS.length).toBe(12);
    // `EMPTY_UPGRADES` muss jeden Slot tragen – sonst steht im Snapshot
    // `undefined` und der Deckelvergleich in `applyUpgrade` scheitert still.
    for (const id of UPGRADE_IDS) expect(EMPTY_UPGRADES()[id]).toBe(0);
  });

  it('rechnet Sockel plus Punkte wie im Konzept', () => {
    // Klassen 4.0: Cap 10 statt 8 - der VOLLAUSBAU behaelt die Konzeptwerte
    // (0,352 / 2,02 / 51,6), die Steigung streckt sich ueber zehn Punkte.
    expect(rapidReloadBonus(0)).toBeCloseTo(0.08, 6);
    expect(rapidReloadBonus(GAME.maxUpgradeLevel)).toBeCloseTo(0.352, 6);
    expect(impactBodyDamageBonus(0)).toBeCloseTo(0.5, 6);
    expect(impactBodyDamageBonus(GAME.maxUpgradeLevel)).toBeCloseTo(2.02, 6);
    expect(familyBuildRate(DEFAULT_MOMENTUM.buildPerSecond, GAME.maxUpgradeLevel)).toBeCloseTo(51.6, 6);
    // Voll geladen nach 1,94 s statt 3,33 s.
    expect(SIGNATURE_MAX / familyBuildRate(DEFAULT_MOMENTUM.buildPerSecond, GAME.maxUpgradeLevel)).toBeCloseTo(1.938, 3);

    // Der heutige Festwert wird erst mitten im Ausbau wieder erreicht – das ist
    // der Preis von Variante B, und er soll sichtbar festgeschrieben sein.
    // Mit der auf Cap 10 gestreckten Steigung: Rapid erreicht 0,25 zwischen
    // sechs und sieben Punkten (0,08 + 6,25 x 0,0272), Impact 1,5 zwischen
    // sechs und sieben (0,5 + 6,58 x 0,152).
    expect(rapidReloadBonus(7)).toBeGreaterThan(DEFAULT_MOMENTUM.maxReloadBonus);
    expect(rapidReloadBonus(6)).toBeLessThan(DEFAULT_MOMENTUM.maxReloadBonus);
    expect(impactBodyDamageBonus(7)).toBeGreaterThan(DEFAULT_WUCHT.maxBodyDamageBonus);
    expect(impactBodyDamageBonus(6)).toBeLessThan(DEFAULT_WUCHT.maxBodyDamageBonus);
  });

  it('lässt Deckel und Verbrauch der Wucht unangetastet', () => {
    const upgrades = EMPTY_UPGRADES();
    upgrades.signatureRate = GAME.maxUpgradeLevel;
    upgrades.signaturePower = GAME.maxUpgradeLevel;
    const config = wuchtConfigFor(DEFAULT_WUCHT, upgrades);
    expect(config.maxContactShare).toBe(DEFAULT_WUCHT.maxContactShare);
    expect(config.contactDrainPerSecond).toBe(DEFAULT_WUCHT.contactDrainPerSecond);
    expect(config.decayPerSecond).toBe(DEFAULT_WUCHT.decayPerSecond);

    const momentum = momentumConfigFor(DEFAULT_MOMENTUM, upgrades);
    // Der Zerfall **im Stand** bleibt unangetastet: „Momentum gibt es nur in
    // Fahrt" ist die Familie selbst und darf von keinem Punkt aufgeweicht
    // werden. Ebenso die Schwelle, ab der Fahrt als Fahrt zählt.
    expect(momentum.decayPerSecond).toBe(DEFAULT_MOMENTUM.decayPerSecond);
    expect(momentum.moveThreshold).toBe(DEFAULT_MOMENTUM.moveThreshold);
  });

  it('RAPID: signatureRate haelt das Momentum auch beim Umsetzen', () => {
    /*
     * Klassen 4.3. Der Balance-Report hat den Slot als TOT gefuehrt (0,04x
     * eines Basis-Upgrades) und die Begruendung gleich mitgeliefert: Schneller
     * volles Momentum hebt die Decke nicht. Der Zerfall in Fahrt **ohne**
     * Feuer ist die andere Haelfte derselben Sache – er bestraft das Umsetzen
     * zwischen zwei Gefechten, und ihn zu bremsen ist im Spiel sofort spuerbar.
     */
    const ohne = momentumConfigFor(DEFAULT_MOMENTUM, EMPTY_UPGRADES());
    expect(ohne.holdDecayPerSecond).toBe(DEFAULT_MOMENTUM.holdDecayPerSecond);

    const upgrades = EMPTY_UPGRADES();
    upgrades.signatureRate = GAME.maxUpgradeLevel;
    const voll = momentumConfigFor(DEFAULT_MOMENTUM, upgrades);
    expect(voll.holdDecayPerSecond).toBeLessThan(DEFAULT_MOMENTUM.holdDecayPerSecond);
    // Derselbe Faktor wie beim Aufbau – eine Zahl, zwei Richtungen.
    expect(voll.holdDecayPerSecond).toBeCloseTo(
      DEFAULT_MOMENTUM.holdDecayPerSecond / (1 + FAMILY_SCALING.buildPerPoint * GAME.maxUpgradeLevel), 6
    );
  });

  it('begrenzt Punktestände außerhalb des erlaubten Bereichs', () => {
    const upgrades = EMPTY_UPGRADES();
    upgrades.signaturePower = 99;
    upgrades.signatureRate = -5;
    expect(wuchtConfigFor(DEFAULT_WUCHT, upgrades).maxBodyDamageBonus)
      .toBeCloseTo(impactBodyDamageBonus(GAME.maxUpgradeLevel), 6);
    expect(momentumConfigFor(DEFAULT_MOMENTUM, upgrades).buildPerSecond)
      .toBeCloseTo(DEFAULT_MOMENTUM.buildPerSecond, 6);
  });
});

describe('familien-upgrades – familiensperre', () => {
  it('sperrt beide Slots ohne Familie (Core)', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'core', 9);
    for (const upgrade of FAMILY_UPGRADE_IDS) {
      expect(game.applyUpgrade(id, upgrade)).toBe(false);
      expect(player.upgrades[upgrade]).toBe(0);
    }
    // Und der Punkt ist noch da: Eine Ablehnung darf nichts kosten.
    expect(player.availablePoints).toBe(upgradePointsAtLevel(9));
    expect(game.applyUpgrade(id, 'reload')).toBe(true);
    expect(player.availablePoints).toBe(upgradePointsAtLevel(9) - 1);
  });

  it('gibt sie für jede Familie mit laufender Signature frei', () => {
    const { game, internals } = createGame();
    for (const playerClass of ['storm', 'juggernaut'] as PlayerClass[]) {
      const { id, player } = spawn(game, internals, playerClass);
      for (const upgrade of FAMILY_UPGRADE_IDS) {
        expect(game.applyUpgrade(id, upgrade), `${playerClass}/${upgrade}`).toBe(true);
        expect(player.upgrades[upgrade]).toBe(1);
      }
    }
  });

  it('sperrt jede Familie, deren Signature nicht in der Liste steht', () => {
    const { game, internals } = createGame();
    for (const playerClass of ['deadeye', 'overseer', 'shade', 'scorch', 'bombard', 'reflector'] as PlayerClass[]) {
      const branch = CLASS_DEFINITIONS[playerClass].branch;
      expect(['precision', 'control', 'specter', 'tempest', 'siege', 'aegis']).toContain(branch);
      const { id } = spawn(game, internals, playerClass);
      for (const upgrade of FAMILY_UPGRADE_IDS) {
        expect(game.applyUpgrade(id, upgrade), `${playerClass}/${upgrade}`).toBe(false);
      }
    }

    // Sobald ihre Signature steht, reicht ein Eintrag in der Familienliste.
    // Klassen 4.3: Das gilt jetzt fuer alle acht – vier davon standen nie in
    // der Liste, obwohl ihre Signature lief.
    for (const playerClass of ['deadeye', 'overseer', 'shade', 'scorch', 'bombard', 'reflector'] as PlayerClass[]) {
      const open = createGame(ALL_FAMILIES);
      const { id } = spawn(open.game, open.internals, playerClass);
      for (const upgrade of FAMILY_UPGRADE_IDS) {
        expect(open.game.applyUpgrade(id, upgrade), `${playerClass}/${upgrade}`).toBe(true);
      }
    }
  });

  it('hält den Deckel je Slot ein und lässt die acht Basiswerte unberührt', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'storm');
    for (let i = 0; i < GAME.maxUpgradeLevel; i += 1) expect(game.applyUpgrade(id, 'signaturePower')).toBe(true);
    expect(player.upgrades.signaturePower).toBe(GAME.maxUpgradeLevel);
    expect(game.applyUpgrade(id, 'signaturePower')).toBe(false);

    for (const upgrade of UPGRADE_IDS.slice(0, 8)) expect(game.applyUpgrade(id, upgrade)).toBe(true);
  });

  it('sperrt ohne Flag alles – der Server verhält sich wie vor KL4', () => {
    const { game, internals } = createGame([], false);
    const { id, player } = spawn(game, internals, 'storm');
    for (const upgrade of FAMILY_UPGRADE_IDS) expect(game.applyUpgrade(id, upgrade)).toBe(false);
    expect(player.availablePoints).toBe(upgradePointsAtLevel(45));
    // Auch ein von Hand gesetzter Punktestand darf ohne Flag nichts bewirken:
    // Der Nachladefaktor bleibt der bisherige Festwert.
    player.upgrades.signaturePower = GAME.maxUpgradeLevel;
    player.upgrades.signatureRate = GAME.maxUpgradeLevel;
    expect(loadedReloadFactor(game, id, player))
      .toBeCloseTo(momentumReloadScale(SIGNATURE_MAX, DEFAULT_MOMENTUM), 6);
  });

  it('lädt ohne Flag auch mit vollen Punkten in der alten Geschwindigkeit auf', () => {
    const { game, internals } = createGame([], false);
    const { id, player } = spawn(game, internals, 'storm');
    player.upgrades.signatureRate = GAME.maxUpgradeLevel;
    drive(game, player, 40);
    const withPoints = momentumFor(game, id);

    const plain = createGame([], false);
    const other = spawn(plain.game, plain.internals, 'storm');
    drive(plain.game, other.player, 40);
    expect(withPoints).toBeCloseTo(momentumFor(plain.game, other.id), 9);
  });
});

describe('familien-upgrades – wirkung', () => {
  it('RAPID: mehr signaturePower verkürzt die Nachladezeit bei vollem Momentum', () => {
    const measure = (power: number): number => {
      const { game, internals } = createGame();
      const { id, player } = spawn(game, internals, 'storm');
      player.upgrades.signaturePower = power;
      return loadedReloadFactor(game, id, player);
    };
    const sockel = measure(0);
    const voll = measure(GAME.maxUpgradeLevel);
    expect(sockel).toBeCloseTo(1 - rapidReloadBonus(0), 6);
    expect(voll).toBeCloseTo(1 - rapidReloadBonus(GAME.maxUpgradeLevel), 6);
    expect(voll).toBeLessThan(sockel);
    // Und der Sockel ist spürbar schwächer als der bisherige Festwert – der
    // Preis von Variante B, hier festgeschrieben statt nur beschrieben.
    expect(sockel).toBeGreaterThan(momentumReloadScale(SIGNATURE_MAX, DEFAULT_MOMENTUM));
  });

  it('RAPID: mehr signatureRate lädt schneller auf', () => {
    const measure = (rate: number): number => {
      const { game, internals } = createGame();
      const { id, player } = spawn(game, internals, 'storm');
      player.upgrades.signatureRate = rate;
      drive(game, player, 40);
      return momentumFor(game, id);
    };
    const sockel = measure(0);
    const voll = measure(GAME.maxUpgradeLevel);
    expect(voll / sockel).toBeCloseTo(1 + FAMILY_SCALING.buildPerPoint * GAME.maxUpgradeLevel, 6);
  });

  it('IMPACT: mehr signaturePower erhöht den Körperschaden – bis zum Deckel', () => {
    const base = CLASS_DEFINITIONS.rammer.bodyDamage * 0.08;
    const victimHealth = 400; // dick genug, dass der Anteilsdeckel nicht greift
    const upgrades = EMPTY_UPGRADES();
    const damageAt = (power: number): number => {
      upgrades.signaturePower = power;
      return wuchtContactDamage(base, SIGNATURE_MAX, victimHealth, 40, wuchtConfigFor(DEFAULT_WUCHT, upgrades));
    };
    expect(damageAt(0)).toBeCloseTo(base * 1.5, 6);
    // Vollausbau behaelt die geeichte Staerke: 1 + 0,5 + 0,152 x 10 = 3,02 -
    // dieselbe Zahl wie vor der Cap-Erhoehung, nur ueber zehn Punkte gestreckt.
    expect(damageAt(GAME.maxUpgradeLevel)).toBeCloseTo(base * 3.02, 6);

    // Gegen ein dünnes Ziel gewinnt der Anteilsdeckel, auf jeder Stufe.
    const thin = 86;
    for (let power = 0; power <= GAME.maxUpgradeLevel; power += 1) {
      upgrades.signaturePower = power;
      const dealt = wuchtContactDamage(base, SIGNATURE_MAX, thin, 40, wuchtConfigFor(DEFAULT_WUCHT, upgrades));
      expect(dealt).toBeLessThanOrEqual(Math.max(base, thin * DEFAULT_WUCHT.maxContactShare) + 1e-9);
    }
  });

  it('IMPACT: mehr signatureRate holt den Anlauf schneller zurück', () => {
    const measure = (rate: number): number => {
      const { game, internals } = createGame();
      const { id, player } = spawn(game, internals, 'juggernaut');
      player.upgrades.signatureRate = rate;
      drive(game, player, 40, { firing: false });
      return wuchtFor(game, id);
    };
    expect(measure(GAME.maxUpgradeLevel) / measure(0))
      .toBeCloseTo(1 + FAMILY_SCALING.buildPerPoint * GAME.maxUpgradeLevel, 6);
  });
});

describe('familien-upgrades – bot-pfade', () => {
  /** Standardpfad eines Farmer-Bots, wie ihn `botState` vergibt. */
  const FARMER_PATH: UpgradeId[] =
    ['reload', 'damage', 'projectileSpeed', 'moveSpeed', 'penetration', 'maxHealth', 'regen', 'bodyDamage'];
  const botFixture = (style: string, path: UpgradeId[] = FARMER_PATH) => ({
    style, upgradePath: path, targetId: null, targetShapeId: null, decisionAt: 0,
    strafe: 1, reactionMs: 150, aimError: 0.1, preferredDistance: 430, fleeHealth: 0.4, classPath: []
  });

  it('erreicht die Slots auf Level 45 – angehängt täte er das nie', () => {
    const { game, internals } = createGame();
    const id = game.addPlayer('Bot');
    const player = internals.players.get(id);
    // Ein echter Bot-Zustand mit dem Standardpfad eines Farmers.
    player.bot = botFixture('farmer');
    player.playerClass = 'storm';
    player.level = 45;
    player.availablePoints = upgradePointsAtLevel(45);
    internals.spendBotPoints(player);

    expect(player.availablePoints).toBe(0);
    expect(player.upgrades.signaturePower).toBe(GAME.maxUpgradeLevel);
    expect(player.upgrades.signatureRate).toBe(GAME.maxUpgradeLevel);
    // Position 2 und 4: Vor den Slots liegt genau ein voller Basiswert.
    expect(player.upgrades.reload).toBe(GAME.maxUpgradeLevel);
    // 44 Punkte reichen für 5,5 Einträge – der sechste Eintrag bleibt leer.
    expect(player.upgrades.penetration).toBe(0);
  });

  it('hängt sich nicht auf, wenn ein Slot im Pfad abgelehnt wird', () => {
    // Der eigentliche Aufhänger, und er ist enger als er aussieht: Es reicht
    // nicht, dass ein gesperrter Slot im Pfad steht – beim Erreichen müssen
    // **noch Punkte übrig** sein, sonst bricht schon die Schleifenbedingung ab.
    //
    // Genau das passiert auf Level 10: 9 Punkte, der erste Pfadeintrag nimmt 8,
    // einer bleibt – und `spendBotPoints` läuft im Level-Aufstieg **vor**
    // `advanceBotClass`, der Bot ist also noch Core und damit gesperrt. Ohne
    // Abbruch dreht die Schleife hier endlos und der Server steht.
    const { game, internals } = createGame();
    const id = game.addPlayer('Bot');
    const player = internals.players.get(id);
    player.bot = botFixture('farmer');
    player.playerClass = 'core';
    // Cap ist inzwischen 10: Level 12 liefert 11 Punkte - weiterhin mehr als
    // ein einzelner Slot aufnehmen kann, worum es diesem Test geht.
    player.level = 12;
    player.availablePoints = upgradePointsAtLevel(12);
    expect(player.availablePoints - GAME.maxUpgradeLevel).toBeGreaterThan(0);
    capApplyUpgradeCalls(internals);
    internals.spendBotPoints(player);

    expect(player.upgrades.signaturePower).toBe(0);
    expect(player.upgrades.signatureRate).toBe(0);
    // Die Punkte sind trotzdem ausgegeben – nur eben in den Basiswerten.
    expect(player.availablePoints).toBe(0);
    expect(player.upgrades.reload).toBe(GAME.maxUpgradeLevel);
    expect(player.upgrades.damage).toBe(upgradePointsAtLevel(12) - GAME.maxUpgradeLevel);
  });

  it('lässt den Pfad ohne offene Familie exakt wie vorher', () => {
    const { game, internals } = createGame([], false);
    const id = game.addPlayer('Bot');
    const player = internals.players.get(id);
    player.bot = botFixture('farmer');
    player.playerClass = 'storm';
    player.level = 45;
    player.availablePoints = upgradePointsAtLevel(45);
    internals.spendBotPoints(player);

    expect(player.upgrades.signaturePower).toBe(0);
    expect(player.upgrades.signatureRate).toBe(0);
    // Cap 10 seit Klassen 4.0: die ersten vier Pfadeinträge voll (40 Punkte),
    // der Rest in den fünften – zusammen die 44 Punkte von Level 45.
    for (const id of ['reload', 'damage', 'projectileSpeed', 'moveSpeed'] as UpgradeId[]) {
      expect(player.upgrades[id], id).toBe(GAME.maxUpgradeLevel);
    }
    expect(player.upgrades.penetration).toBe(upgradePointsAtLevel(45) - 4 * GAME.maxUpgradeLevel);
    expect(player.upgrades.maxHealth).toBe(0);
    expect(player.availablePoints).toBe(0);
  });

  it('bricht auch in der ungetunten Basis ab statt endlos zu drehen', () => {
    // `game.ts` selbst muss den Abbruch tragen: Nicht jeder Aufrufpfad hängt
    // die Schicht an (Tests, Debug-Werkzeuge).
    const game = new MazeGame(0);
    const internals = game as unknown as Internals & { applyUpgrade(id: string, upgrade: UpgradeId): boolean };
    const id = game.addPlayer('Bot');
    const player = internals.players.get(id);
    player.bot = botFixture('farmer', ['reload']);
    player.level = 45;
    player.availablePoints = 10;
    // Eine Ablehnung, die keinen Punkt verbraucht – genau der Fall, der die
    // Schleife ohne Abbruch aufhängen würde.
    internals.applyUpgrade = () => false;
    capApplyUpgradeCalls(internals);
    internals.spendBotPoints(player);
    expect(player.availablePoints).toBe(10);
  });
});

/**
 * Serverautoritaet fuer die beiden Signature-Slots.
 *
 * Der Client sperrt sie bei `core` bereits (`familyUpgradeLocked`, ausgegraut
 * mit „Erst mit einer Familie ab Level 10"). Darauf darf sich der Server aber
 * nicht verlassen -- er ist die Autoritaet, der Client nur die Anzeige. Ohne
 * diese Pruefung nahm `applyUpgrade` den Punkt an und schrieb ihn in ein Feld,
 * das bei `core` NIEMAND liest: Die Slots werden ausschliesslich in den
 * Familien-Tunern ausgewertet, und `core` gehoert zu keiner der acht Familien.
 * Der Punkt war damit still verbrannt.
 *
 * Das ist kein Randfall der Stufen 2 bis 4: `respawnClassFrom` setzt nach jedem
 * Tod auf `core` zurueck, auf halber Stufe und mit allen Punkten.
 */
describe('Signature-Slots bei Klassen ohne Familie', () => {
  interface Innereien {
    players: Map<string, any>;
    applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  }

  it('lehnt sie fuer core ab, statt den Punkt zu verbrennen', () => {
    const game = tuneCombatScaling(new MazeGame(0));
    const internals = game as unknown as Innereien;
    const id = game.addPlayer('Neuling');
    const player = internals.players.get(id);
    player.playerClass = 'core';
    player.availablePoints = 5;

    for (const upgrade of FAMILY_UPGRADE_IDS) {
      expect(internals.applyUpgrade(id, upgrade as UpgradeId), upgrade).toBe(false);
    }
    // Der Punkt bleibt liegen, statt in einem toten Feld zu landen.
    expect(player.availablePoints).toBe(5);
    for (const upgrade of FAMILY_UPGRADE_IDS) {
      expect(player.upgrades[upgrade] ?? 0, upgrade).toBe(0);
    }
  });

  it('nimmt sie an, sobald eine Familie gewaehlt ist', () => {
    const game = tuneCombatScaling(new MazeGame(0));
    const internals = game as unknown as Innereien;
    const id = game.addPlayer('Rapid');
    const player = internals.players.get(id);
    player.playerClass = 'rapid';
    player.availablePoints = 5;

    for (const upgrade of FAMILY_UPGRADE_IDS) {
      expect(internals.applyUpgrade(id, upgrade as UpgradeId), upgrade).toBe(true);
    }
    expect(player.availablePoints).toBe(3);
  });
});

/**
 * Die Pruefung muss die GANZE Tuning-Kette ueberleben, nicht nur die Basis.
 *
 * `MazeGame.applyUpgrade` prueft `upgradeAppliesTo` -- mit dem Kommentar, die
 * Pruefung stehe in der Basis, "damit jede Tuning-Schicht sie erbt". Das gilt
 * aber nur fuer Schichten, die die Basis AUFRUFEN. `tuneCombatScaling` ersetzt
 * `applyUpgrade` vollstaendig, und weil es fest in der Produktionskette haengt,
 * war die Pruefung serverseitig wirkungslos: Ein Controller konnte Kugeltempo
 * kaufen und den Punkt verlieren, obwohl er kein Rohr hat. Der Client versteckte
 * den Knopf -- aber der Server ist die Autoritaet, nicht der Client.
 *
 * Dieser Test baut deshalb bewusst UEBER die Basis hinaus und prueft das
 * Ergebnis, nicht die Absicht. Kommt eine weitere Schicht dazu, die
 * `applyUpgrade` ersetzt statt umschliesst, faellt sie hier auf.
 */
describe('Upgrade-Sperre durch die gesamte Tuning-Kette', () => {
  interface Innereien {
    players: Map<string, any>;
    applyUpgrade(playerId: string, upgrade: UpgradeId): boolean;
  }

  const faelle: Array<{ klasse: PlayerClass; upgrade: UpgradeId; grund: string }> = [
    { klasse: 'warden', upgrade: 'projectileSpeed', grund: 'Drohnenklasse ohne Rohr' },
    { klasse: 'warden', upgrade: 'penetration', grund: 'Drohnenklasse ohne Rohr' },
    { klasse: 'warden', upgrade: 'projectileRange', grund: 'Drohnenklasse ohne Rohr' },
    { klasse: 'core', upgrade: 'signatureRate' as UpgradeId, grund: 'keine Familie' },
    { klasse: 'core', upgrade: 'signaturePower' as UpgradeId, grund: 'keine Familie' }
  ];

  for (const { klasse, upgrade, grund } of faelle) {
    it(`lehnt ${upgrade} fuer ${klasse} ab (${grund})`, () => {
      const game = tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), ['rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis']);
      const internals = game as unknown as Innereien;
      const id = game.addPlayer('Pruefling');
      const player = internals.players.get(id);
      player.playerClass = klasse;
      player.availablePoints = 4;

      expect(internals.applyUpgrade(id, upgrade)).toBe(false);
      expect(player.availablePoints).toBe(4);
      expect(player.upgrades[upgrade] ?? 0).toBe(0);
    });
  }

  it('laesst durch, was bei der Klasse wirklich wirkt', () => {
    const game = tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), ['rapid', 'impact', 'precision', 'control', 'specter', 'tempest', 'siege', 'aegis']);
    const internals = game as unknown as Innereien;
    const id = game.addPlayer('Pruefling');
    const player = internals.players.get(id);
    player.playerClass = 'warden';
    player.availablePoints = 4;
    expect(internals.applyUpgrade(id, 'damage')).toBe(true);
    expect(player.availablePoints).toBe(3);
  });
});

/**
 * Respawn setzt auf die Anfangsklasse zurueck -- geprueft am Spiel, nicht an
 * der Hilfsfunktion.
 *
 * `packages/shared` testet `respawnClassFrom(id) === 'core'` fuer alle 65
 * Klassen. Das war gruen, waehrend das laufende Spiel das Gegenteil tat:
 * `tuneCombatScaling` ersetzt `respawn` vollstaendig und rief dort weiterhin
 * `classAvailableAtLevel` auf -- also genau Sams beklagtes Verhalten vom
 * 07.08. ("man ist direkt in einer klasse die man davor ausgewaehlt hat").
 *
 * Ein Test, der nur die Hilfsfunktion prueft, sagt nichts darueber, ob sie
 * jemand aufruft. Dieser hier geht durch `requestRespawn`.
 */
describe('Respawn durch die gesamte Tuning-Kette', () => {
  interface Innereien {
    players: Map<string, any>;
    killPlayer(target: any, attackerId: string | null, now: number, environmentName: string): void;
  }

  it('setzt auf core zurueck, egal wie hoch die Klasse war', () => {
    for (const start of ['gatling', 'eclipse', 'sovereign', 'leviathan'] as PlayerClass[]) {
      const game = tuneCombatScaling(new MazeGame(0));
      const internals = game as unknown as Innereien;
      const id = game.addPlayer('Gefallener');
      const player = internals.players.get(id);
      player.playerClass = start;
      player.level = 60;

      const now = Date.now();
      internals.killPlayer(player, null, now, 'Arena');
      expect(player.dead, start).toBe(true);
      game.requestRespawn(id, now + GAME.respawnDelayMs + 1);

      expect(player.dead, start).toBe(false);
      expect(player.playerClass, `${start} -> nach dem Tod`).toBe('core');
      // Die halbe Stufe bleibt – zurueckgesetzt wird die Klasse, nicht der Fortschritt.
      expect(player.level, start).toBe(30);
    }
  });
});
