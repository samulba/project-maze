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

const ALL_FAMILIES: SignatureFamily[] = ['rapid', 'impact', 'precision', 'control'];

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
    expect(UPGRADE_IDS.slice(8)).toEqual(FAMILY_UPGRADE_IDS);
    expect(UPGRADE_IDS.length).toBe(10);
    // `EMPTY_UPGRADES` muss jeden Slot tragen – sonst steht im Snapshot
    // `undefined` und der Deckelvergleich in `applyUpgrade` scheitert still.
    for (const id of UPGRADE_IDS) expect(EMPTY_UPGRADES()[id]).toBe(0);
  });

  it('rechnet Sockel plus Punkte wie im Konzept', () => {
    expect(rapidReloadBonus(0)).toBeCloseTo(0.08, 6);
    expect(rapidReloadBonus(8)).toBeCloseTo(0.352, 6);
    expect(impactBodyDamageBonus(0)).toBeCloseTo(0.5, 6);
    expect(impactBodyDamageBonus(8)).toBeCloseTo(2.02, 6);
    expect(familyBuildRate(DEFAULT_MOMENTUM.buildPerSecond, 8)).toBeCloseTo(51.6, 6);
    // Voll geladen nach 1,94 s statt 3,33 s.
    expect(SIGNATURE_MAX / familyBuildRate(DEFAULT_MOMENTUM.buildPerSecond, 8)).toBeCloseTo(1.938, 3);

    // Der heutige Festwert wird erst mitten im Ausbau wieder erreicht – das ist
    // der Preis von Variante B, und er soll sichtbar festgeschrieben sein.
    // Rapid: exakt bei 5 Punkten (0,08 + 5 × 0,034 = 0,25).
    expect(rapidReloadBonus(5)).toBeCloseTo(DEFAULT_MOMENTUM.maxReloadBonus, 6);
    expect(rapidReloadBonus(4)).toBeLessThan(DEFAULT_MOMENTUM.maxReloadBonus);
    // Impact: bei 6, nicht bei 5 – das Konzept hatte 5,26 auf 5 gerundet.
    expect(impactBodyDamageBonus(6)).toBeGreaterThan(DEFAULT_WUCHT.maxBodyDamageBonus);
    expect(impactBodyDamageBonus(5)).toBeLessThan(DEFAULT_WUCHT.maxBodyDamageBonus);
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
    expect(momentum.decayPerSecond).toBe(DEFAULT_MOMENTUM.decayPerSecond);
    expect(momentum.holdDecayPerSecond).toBe(DEFAULT_MOMENTUM.holdDecayPerSecond);
    expect(momentum.moveThreshold).toBe(DEFAULT_MOMENTUM.moveThreshold);
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

  it('sperrt Familien ohne laufende Signature – Precision und Control', () => {
    const { game, internals } = createGame();
    for (const playerClass of ['deadeye', 'overseer'] as PlayerClass[]) {
      const branch = CLASS_DEFINITIONS[playerClass].branch;
      expect(['precision', 'control']).toContain(branch);
      const { id } = spawn(game, internals, playerClass);
      for (const upgrade of FAMILY_UPGRADE_IDS) {
        expect(game.applyUpgrade(id, upgrade), `${playerClass}/${upgrade}`).toBe(false);
      }
    }

    // Sobald ihre Signature steht, reicht ein Eintrag in der Familienliste.
    const open = createGame(ALL_FAMILIES);
    const { id } = spawn(open.game, open.internals, 'deadeye');
    for (const upgrade of FAMILY_UPGRADE_IDS) expect(open.game.applyUpgrade(id, upgrade)).toBe(true);
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
    player.level = 10;
    player.availablePoints = upgradePointsAtLevel(10);
    expect(player.availablePoints - GAME.maxUpgradeLevel).toBeGreaterThan(0);
    capApplyUpgradeCalls(internals);
    internals.spendBotPoints(player);

    expect(player.upgrades.signaturePower).toBe(0);
    expect(player.upgrades.signatureRate).toBe(0);
    // Die Punkte sind trotzdem ausgegeben – nur eben in den Basiswerten.
    expect(player.availablePoints).toBe(0);
    expect(player.upgrades.reload).toBe(GAME.maxUpgradeLevel);
    expect(player.upgrades.damage).toBe(upgradePointsAtLevel(10) - GAME.maxUpgradeLevel);
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
    // Der alte Bau: die ersten fünf Pfadeinträge voll (40 Punkte), der Rest in
    // den sechsten – zusammen die 44 Punkte von Level 45.
    for (const id of ['reload', 'damage', 'projectileSpeed', 'moveSpeed', 'penetration'] as UpgradeId[]) {
      expect(player.upgrades[id], id).toBe(GAME.maxUpgradeLevel);
    }
    expect(player.upgrades.maxHealth).toBe(upgradePointsAtLevel(45) - 5 * GAME.maxUpgradeLevel);
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
