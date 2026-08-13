import { describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  PLAYER_CLASS_IDS,
  type PlayerClass
} from '@project-maze/shared';
import { messfeld } from './messfeld';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { chargeConfigFor, tuneFamilyUpgrades } from './family-upgrades';
import { MazeGame } from './game';
import { SIGNATURE_MAX } from './signature';
import {
  DEFAULT_CHARGE,
  chargeDamageScale,
  chargeFor,
  chargePenetrationScale,
  chargeRadiusScale,
  chargeSeconds,
  isPrecisionClass,
  tunePrecisionSignature
} from './signature-precision';

const DT = 0.025;
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Die feste
// Koordinate stammte von einer aelteren Karte und hatte nach dem
// Labyrinth-Umbau nur noch 200 px Luft.
const OPEN_GROUND = messfeld(340);
const PRECISION_CLASSES = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].branch === 'precision');

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  projectiles: Map<string, any>;
}

const createGame = (enabled = true, familyUpgrades = false) => {
  const game = tunePrecisionSignature(
    tuneFamilyUpgrades(tuneCombatScaling(new MazeGame(0)), familyUpgrades ? ['precision'] : []),
    enabled,
    DEFAULT_CHARGE,
    familyUpgrades
  );
  const internals = game as unknown as Internals;
  internals.shapes.clear();
  internals.projectiles.clear();
  return { game, internals };
};

const spawn = (game: MazeGame, internals: Internals, playerClass: PlayerClass) => {
  const id = game.addPlayer('Schuetze');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.level = GAME.maxLevel;
  player.position = { ...OPEN_GROUND };
  player.aim = { x: 200, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.cooldown = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  return { id, player };
};

/**
 * Hält die Feuertaste `seconds` lang und sammelt alle Schüsse ein.
 * `release` gibt am Ende los – das ist die Schussanweisung.
 */
const hold = (
  game: MazeGame,
  internals: Internals,
  player: any,
  seconds: number,
  options: { release?: boolean; start?: number } = {}
): { shots: { damage: number; radius: number; penetration: number }[]; now: number } => {
  const shots: { damage: number; radius: number; penetration: number }[] = [];
  const seen = new Set<string>();
  let now = options.start ?? 100_000;
  const collect = (): void => {
    for (const [id, projectile] of internals.projectiles) {
      if (seen.has(id)) continue;
      seen.add(id);
      shots.push({ damage: projectile.damage, radius: projectile.radius, penetration: projectile.integrity });
    }
  };
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    now += DT * 1000;
    player.primary = true;
    game.step(DT, now);
    player.position = { ...OPEN_GROUND };
    collect();
  }
  if (options.release !== false) {
    now += DT * 1000;
    player.primary = false;
    game.step(DT, now);
    player.position = { ...OPEN_GROUND };
    collect();
  }
  return { shots, now };
};

describe('precision signature – ladeschuss, die zahlen', () => {
  it('setzt Testannahmen: eine reine Precision-Familie', () => {
    expect(isPrecisionClass('lancer')).toBe(true);
    expect(isPrecisionClass('sniper')).toBe(true);
    expect(isPrecisionClass('storm')).toBe(false);
    expect(isPrecisionClass('core')).toBe(false);
    expect(PRECISION_CLASSES.length).toBeGreaterThanOrEqual(7);
  });

  it('führt den Schaden vom Klick-Sockel auf genau den heutigen Wert', () => {
    expect(chargeDamageScale(0)).toBeCloseTo(DEFAULT_CHARGE.minDamageScale, 9);
    expect(chargeDamageScale(SIGNATURE_MAX * DEFAULT_CHARGE.damageFullAt)).toBeCloseTo(1, 9);
    expect(chargeDamageScale(SIGNATURE_MAX)).toBeCloseTo(1, 9);
    // Monoton steigend, und nirgends über 1 – das ist die Ein-Schuss-Zusage.
    let previous = -1;
    for (let step = 0; step <= 100; step += 1) {
      const value = chargeDamageScale(step);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
      previous = value;
    }
  });

  it('erzeugt in keiner Klasse einen neuen Ein-Schuss-Tod', () => {
    // Der Kern der Zusage, gegen den echten Statikpfad geprüft: Der geladene
    // Schuss trägt nie mehr Schaden als der heutige Schuss derselben Klasse.
    const upgrades = EMPTY_UPGRADES();
    upgrades.damage = GAME.maxUpgradeLevel;
    for (const id of PRECISION_CLASSES) {
      const today = tunedStatsFor({ playerClass: id, level: GAME.maxLevel, upgrades } as never).damage;
      for (let step = 0; step <= SIGNATURE_MAX; step += 5) {
        expect(today * chargeDamageScale(step), `${id} @ ${step}`).toBeLessThanOrEqual(today + 1e-9);
      }
    }
  });

  it('lässt Größe und Durchschlag über die ganze Ladung wachsen', () => {
    expect(chargeRadiusScale(0)).toBe(1);
    expect(chargeRadiusScale(SIGNATURE_MAX)).toBeCloseTo(DEFAULT_CHARGE.maxRadiusScale, 9);
    expect(chargePenetrationScale(0)).toBe(1);
    expect(chargePenetrationScale(SIGNATURE_MAX)).toBeCloseTo(DEFAULT_CHARGE.maxPenetrationScale, 9);
  });

  it('erreicht den vollen Schaden genau dort, wo die Kadenz noch nachladegebunden ist', () => {
    // Der Angelpunkt des ganzen Entwurfs: Bei `damageFullAt` entspricht die
    // Ladezeit der Nachladezeit. Bis dahin kostet Laden keine Kadenz.
    for (const id of PRECISION_CLASSES) {
      const reload = tunedStatsFor({ playerClass: id, level: GAME.maxLevel, upgrades: EMPTY_UPGRADES() } as never).reload;
      const untilFullDamage = chargeSeconds(reload) * DEFAULT_CHARGE.damageFullAt;
      expect(untilFullDamage, id).toBeCloseTo(reload, 1);
    }
  });
});

describe('precision signature – im spiel', () => {
  it('feuert beim Loslassen, nicht beim Halten', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'lancer');
    const reload = tunedStatsFor(player).reload;

    // Eine halbe Ladezeit halten: kein Schuss, aber die Ladung steht.
    const held = hold(game, internals, player, chargeSeconds(reload) * 0.5, { release: false });
    expect(held.shots).toHaveLength(0);
    expect(chargeFor(game, id)).toBeGreaterThan(SIGNATURE_MAX * 0.4);
    expect(player.signature).toBe(Math.round(chargeFor(game, id)));

    // Loslassen schießt – genau einmal.
    player.primary = false;
    game.step(DT, held.now + DT * 1000);
    expect(internals.projectiles.size).toBe(1);
    expect(chargeFor(game, id)).toBe(0);
  });

  it('schießt bei voller Ladung von selbst – sonst würde Dauerfeuer nie auslösen', () => {
    // Der Client hat einen Dauerfeuer-Schalter. Ohne Selbstauslösung bei voller
    // Ladung hielte er die Taste ewig und der Spieler schösse nie.
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'sniper');
    const reload = tunedStatsFor(player).reload;
    const result = hold(game, internals, player, chargeSeconds(reload) * 1.05, { release: false });
    expect(result.shots.length).toBeGreaterThanOrEqual(1);
    expect(chargeFor(game, id)).toBeLessThan(SIGNATURE_MAX);
  });

  it('trägt den Sofortklick als schwachen Schuss aus', () => {
    const { game, internals } = createGame();
    const { player } = spawn(game, internals, 'lancer');
    const base = tunedStatsFor(player).damage;

    // Ein einziger Tick gehalten, dann los: der schwächstmögliche Schuss.
    player.primary = true;
    game.step(DT, 100_000);
    player.primary = false;
    game.step(DT, 100_025);
    const projectile = [...internals.projectiles.values()][0];
    expect(projectile).toBeDefined();
    expect(projectile.damage / base).toBeLessThan(0.55);
    expect(projectile.damage / base).toBeGreaterThanOrEqual(DEFAULT_CHARGE.minDamageScale);
  });

  it('verliert die Schussanweisung nicht, wenn beim Loslassen noch nachgeladen wird', () => {
    const { game, internals } = createGame();
    const { player } = spawn(game, internals, 'lancer');
    const reload = tunedStatsFor(player).reload;

    // Erster Schuss, danach steht der Cooldown.
    hold(game, internals, player, chargeSeconds(reload));
    const afterFirst = internals.projectiles.size;
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    expect(player.cooldown).toBeGreaterThan(0);

    // Sofort nachladen und wieder loslassen – der Schuss darf nicht verfallen,
    // sondern muss kommen, sobald der Cooldown steht. Gezaehlt werden neue
    // Projektil-IDs, nicht die Kartengroesse: Der erste Schuss laeuft
    // waehrenddessen ab.
    const known = new Set(internals.projectiles.keys());
    let later = 0;
    let now = 200_000;
    player.primary = true;
    game.step(DT, now);
    player.primary = false;
    for (let i = 0; i < Math.round((reload + 0.2) / DT); i += 1) {
      now += DT * 1000;
      game.step(DT, now);
      player.position = { ...OPEN_GROUND };
      for (const projectileId of internals.projectiles.keys()) {
        if (!known.has(projectileId)) { known.add(projectileId); later += 1; }
      }
    }
    expect(later).toBeGreaterThanOrEqual(1);
  });

  it('lässt Bots laden – sie halten die Taste ohnehin', () => {
    // Bots setzen `primary` dauerhaft, solange ein Ziel in Reichweite ist. Mit
    // der Selbstauslösung bei voller Ladung schießen sie damit automatisch mit
    // vollem Ausschlag – ohne eine einzige Zeile in der Bot-Steuerung.
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'railgun');
    player.bot = { style: 'hunter', upgradePath: [] };
    // Die Bot-Steuerung setzt `primary` **innerhalb** des Schritts, nicht
    // davor – genau deshalb verbiegt die Schicht die Eingabe nicht, sondern
    // faengt den Schuss ab. Dieser Stub bildet das nach.
    (internals as unknown as { updateBot(p: any, now: number): void }).updateBot = (target: any): void => {
      target.primary = true;
    };
    const reload = tunedStatsFor(player).reload;

    let now = 100_000;
    let fired = 0;
    const seen = new Set<string>();
    const damages: number[] = [];
    for (let i = 0; i < Math.round(chargeSeconds(reload) * 3 / DT); i += 1) {
      now += DT * 1000;
      player.primary = false;             // die Bot-Steuerung setzt sie im Schritt
      game.step(DT, now);
      player.position = { ...OPEN_GROUND };
      for (const [projectileId, projectile] of internals.projectiles) {
        if (!seen.has(projectileId)) { seen.add(projectileId); fired += 1; damages.push(projectile.damage); }
      }
    }
    expect(fired).toBeGreaterThanOrEqual(2);
    // Und die Schuesse sind volle: Der Bot hat nie zwischendurch losgelassen.
    // Gemessen beim Abschuss – am Ende der Schleife sind sie laengst abgelaufen.
    for (const damage of damages) {
      expect(damage / tunedStatsFor(player).damage).toBeCloseTo(1, 1);
    }
    expect(chargeFor(game, id)).toBeLessThan(SIGNATURE_MAX);
  });

  it('räumt das Feld bei Tod und Familienwechsel', () => {
    const { game, internals } = createGame();
    const { id, player } = spawn(game, internals, 'lancer');
    hold(game, internals, player, 0.3, { release: false });
    expect(player.signature).toBeGreaterThan(0);

    player.dead = true;
    game.step(DT, 200_000);
    expect(player.signature).toBe(0);
    expect(chargeFor(game, id)).toBe(0);

    // Fuer den zweiten Teil wieder ein echter Schuetze mit Ladung im Feld –
    // sonst gibt es nichts mehr aufzuraeumen und der Test prueft nichts.
    // Der Auto-Respawn stuft die Klasse auf das Respawn-Level herunter – fuer
    // den zweiten Teil wieder ein echter Schuetze.
    player.dead = false;
    player.playerClass = 'lancer';
    player.level = GAME.maxLevel;
    hold(game, internals, player, 0.3, { release: false, start: 200_000 });
    expect(chargeFor(game, id)).toBeGreaterThan(0);
    player.playerClass = 'storm';
    game.step(DT, 300_000);
    expect(player.signature).toBeUndefined();
    expect(chargeFor(game, id)).toBe(0);
  });
});

describe('precision signature – ohne flag', () => {
  it('feuert wie bisher: gehaltene Taste schießt sofort und mit vollem Schaden', () => {
    const { game, internals } = createGame(false);
    const { id, player } = spawn(game, internals, 'lancer');
    const base = tunedStatsFor(player).damage;

    player.primary = true;
    game.step(DT, 100_000);
    const projectile = [...internals.projectiles.values()][0];
    expect(projectile).toBeDefined();
    expect(projectile.damage).toBeCloseTo(base, 6);
    expect(player.signature).toBeUndefined();
    expect(chargeFor(game, id)).toBe(0);
  });
});

describe('precision signature – familien-upgrades (KL4)', () => {
  it('verkürzt die Ladezeit über alle acht Stufen – der Slot stirbt nicht', () => {
    const upgrades = EMPTY_UPGRADES();
    const factorAt = (points: number): number => {
      upgrades.signatureRate = points;
      return chargeConfigFor(DEFAULT_CHARGE, upgrades).chargeReloadFactor;
    };
    for (let points = 1; points <= GAME.maxUpgradeLevel; points += 1) {
      expect(factorAt(points), `Punkt ${points}`).toBeLessThan(factorAt(points - 1));
    }
    // Genau das Raster: acht Punkte drücken die Ladezeit auf eine Nachladezeit.
    expect(factorAt(GAME.maxUpgradeLevel)).toBeCloseTo(1, 2);
    // Und keinen Schritt darunter – sonst liefe der Slot ins Leere.
    expect(factorAt(GAME.maxUpgradeLevel)).toBeGreaterThanOrEqual(0.99);
  });

  it('skaliert Größe und Durchschlag, aber nie den Schaden', () => {
    const upgrades = EMPTY_UPGRADES();
    upgrades.signaturePower = 0;
    const sockel = chargeConfigFor(DEFAULT_CHARGE, upgrades);
    upgrades.signaturePower = GAME.maxUpgradeLevel;
    const voll = chargeConfigFor(DEFAULT_CHARGE, upgrades);

    expect(voll.maxRadiusScale).toBeGreaterThan(sockel.maxRadiusScale);
    expect(voll.maxPenetrationScale).toBeGreaterThan(sockel.maxPenetrationScale);
    expect(voll.maxRadiusScale).toBeCloseTo(DEFAULT_CHARGE.maxRadiusScale, 9);
    // Der Schadensverlauf ist in beiden Fällen identisch – die Ein-Schuss-Zusage
    // darf von keinem Upgrade angefasst werden.
    expect(voll.minDamageScale).toBe(DEFAULT_CHARGE.minDamageScale);
    expect(voll.damageFullAt).toBe(DEFAULT_CHARGE.damageFullAt);
    expect(chargeDamageScale(SIGNATURE_MAX, voll)).toBeCloseTo(1, 9);
  });

  it('gibt die Slots für Precision frei, sobald die Signature läuft', () => {
    const { game, internals } = createGame(true, true);
    const { id } = spawn(game, internals, 'lancer');
    const player = internals.players.get(id);
    player.availablePoints = 8;
    expect(game.applyUpgrade(id, 'signatureRate')).toBe(true);
    expect(game.applyUpgrade(id, 'signaturePower')).toBe(true);
    expect(player.upgrades.signatureRate).toBe(1);
  });
});
