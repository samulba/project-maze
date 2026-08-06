import { afterEach, describe, expect, it } from 'vitest';
import {
  CLASS_DEFINITIONS,
  EMPTY_UPGRADES,
  GAME,
  PLAYER_CLASS_IDS,
  type PlayerClass
} from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  BOT_LEAD_REFERENCE_FLIGHT,
  PROJECTILE_SPEED_CAP_HIGH,
  PROJECTILE_SPEED_CAP_LOW,
  PROJECTILE_SPEED_DAMPER,
  PROJECTILE_SPEED_FLOOR,
  PROJECTILE_SPEED_PER_POINT,
  compensatedLeadFactor,
  fastestPlayerSpeed,
  projectileBaseSpeed,
  projectileSpeedCapAt,
  projectileSpeedEnabled,
  projectileSpeedFor,
  setProjectileSpeedEnabled,
  softCapped
} from './projectile-speed';

/**
 * Der Schalter ist prozessweit (Begründung in `projectile-speed.ts`). Deshalb
 * gilt hier eine harte Regel: **nie zwei Spiele mit verschiedenen Ständen
 * gleichzeitig messen.** Dieser Helfer erzwingt das – er stellt den vorherigen
 * Stand immer wieder her, auch wenn die Messung wirft.
 */
const withProjectileSpeed = <T>(active: boolean, run: () => T): T => {
  const previous = setProjectileSpeedEnabled(active);
  try {
    return run();
  } finally {
    setProjectileSpeedEnabled(previous);
  }
};

afterEach(() => setProjectileSpeedEnabled(false));

const SHOOTERS = PLAYER_CLASS_IDS.filter((id) => CLASS_DEFINITIONS[id].projectileSpeed > 0);

const statsFor = (playerClass: PlayerClass, level: number, speedPoints: number) => {
  const upgrades = EMPTY_UPGRADES();
  upgrades.projectileSpeed = speedPoints;
  return tunedStatsFor({ playerClass, level, upgrades } as never);
};
/** Tempo und Reichweite vor dieser Änderung – der Bezugspunkt jeder Zusage. */
const legacy = (playerClass: PlayerClass, speedPoints: number) => {
  const base = CLASS_DEFINITIONS[playerClass];
  const scale = base.branch === 'precision' ? 0.9 : 0.75;
  return {
    speed: base.projectileSpeed * scale * (1 + speedPoints * 0.04),
    life: base.projectileLife / scale
  };
};

describe('projektiltempo – ohne Schalter', () => {
  it('lässt Tempo und Lebensdauer jeder Klasse exakt wie vorher', () => {
    withProjectileSpeed(false, () => {
      for (const id of SHOOTERS) {
        for (const points of [0, 4, GAME.maxUpgradeLevel]) {
          for (const level of [1, 24, GAME.maxLevel]) {
            const stats = statsFor(id, level, points);
            const before = legacy(id, points);
            expect(stats.projectileSpeed, `${id} L${level} ${points}`).toBeCloseTo(before.speed, 9);
            expect(stats.projectileLife, `${id} L${level} ${points}`).toBeCloseTo(before.life, 9);
          }
        }
      }
    });
  });

  it('lässt den Vorhalt der Bots unangetastet', () => {
    expect(projectileSpeedEnabled()).toBe(false);
    // Der Ausgleich wird ohne Schalter gar nicht erst aufgerufen; die Funktion
    // selbst bleibt trotzdem prüfbar.
    expect(compensatedLeadFactor(0.52, BOT_LEAD_REFERENCE_FLIGHT)).toBeCloseTo(0.52, 9);
  });
});

describe('projektiltempo – die drei Regeln', () => {
  it('macht keine einzige Kugel schneller als heute', () => {
    withProjectileSpeed(true, () => {
      for (const id of SHOOTERS) {
        for (const points of [0, 4, GAME.maxUpgradeLevel]) {
          for (const level of [1, 10, 24, GAME.maxLevel]) {
            const now = statsFor(id, level, points).projectileSpeed;
            expect(now, `${id} L${level} ${points}`).toBeLessThanOrEqual(legacy(id, points).speed + 1e-9);
          }
        }
      }
    });
  });

  it('hält den Boden ein, wo die Klasse heute darüber liegt', () => {
    const floor = fastestPlayerSpeed * PROJECTILE_SPEED_FLOOR;
    for (const id of SHOOTERS) {
      const base = CLASS_DEFINITIONS[id];
      const before = legacy(id, 0).speed;
      const after = projectileBaseSpeed(base, GAME.maxLevel);
      if (before >= floor) expect(after, id).toBeGreaterThanOrEqual(floor - 1e-9);
      // Klassen, die schon heute unter dem Boden liegen, bleiben unverändert –
      // sie hätten sonst nach oben korrigiert werden müssen.
      else expect(after, id).toBeCloseTo(before, 9);
    }
  });

  it('deckelt das Grundtempo, und der Deckel fällt mit dem Level', () => {
    expect(projectileSpeedCapAt(1)).toBeCloseTo(fastestPlayerSpeed * PROJECTILE_SPEED_CAP_HIGH, 9);
    expect(projectileSpeedCapAt(GAME.maxLevel)).toBeCloseTo(fastestPlayerSpeed * PROJECTILE_SPEED_CAP_LOW, 9);
    for (let level = 2; level <= GAME.maxLevel; level += 1) {
      expect(projectileSpeedCapAt(level)).toBeLessThan(projectileSpeedCapAt(level - 1));
    }
    // Außerhalb des Levelbereichs bleibt der Deckel stehen, statt abzudriften.
    expect(projectileSpeedCapAt(0)).toBeCloseTo(projectileSpeedCapAt(1), 9);
    expect(projectileSpeedCapAt(999)).toBeCloseTo(projectileSpeedCapAt(GAME.maxLevel), 9);

    // Lancer ist die schnellste Klasse und liegt auf jeder Stufe ueber dem
    // Deckel – aber nur um den gestauchten Ueberschuss.
    for (const level of [38, 45]) {
      const cap = projectileSpeedCapAt(level);
      const damped = CLASS_DEFINITIONS.lancer.projectileSpeed * PROJECTILE_SPEED_DAMPER;
      expect(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, level))
        .toBeCloseTo(softCapped(damped, cap), 9);
      expect(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, level)).toBeGreaterThan(cap);
      expect(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, level)).toBeLessThan(damped);
    }
    expect(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, 45))
      .toBeLessThan(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, 38));
  });

  it('behaelt ueber dem Deckel die Reihenfolge – jede Klasse hat ihr eigenes Tempo', () => {
    // Der Grund fuer den weichen Deckel: Ein harter machte aus allen sieben
    // Precision-Klassen einen einzigen Wert, obwohl ihr Rohtempo zwischen 1100
    // und 1640 px/s liegt.
    const speeds = SHOOTERS.map((id) => ({
      id,
      raw: CLASS_DEFINITIONS[id].projectileSpeed,
      value: projectileBaseSpeed(CLASS_DEFINITIONS[id], GAME.maxLevel)
    }));
    // Gemessen an den **verschiedenen Rohtempi**: Crusher und Comet teilen sich
    // 660 px/s schon in der Klassendefinition – die duerfen gleich bleiben.
    const distinctRaw = new Set(speeds.map((entry) => entry.raw));
    const distinctValues = new Set(speeds.map((entry) => Math.round(entry.value)));
    expect(distinctValues.size).toBe(distinctRaw.size);

    // Und die Ordnung stimmt: schnelleres Rohtempo bleibt schneller, solange
    // beide ueber dem Deckel liegen.
    const above = speeds
      .filter((entry) => CLASS_DEFINITIONS[entry.id].branch === 'precision')
      .sort((a, b) => a.raw - b.raw);
    for (let i = 1; i < above.length; i += 1) {
      expect(above[i]!.value, `${above[i]!.id} > ${above[i - 1]!.id}`).toBeGreaterThan(above[i - 1]!.value);
    }
  });

  it('lässt das Upgrade in jeder Klasse gleich viel wert sein', () => {
    const expected = 1 + PROJECTILE_SPEED_PER_POINT * GAME.maxUpgradeLevel;
    for (const id of SHOOTERS) {
      const base = CLASS_DEFINITIONS[id];
      const ratio = projectileSpeedFor(base, GAME.maxLevel, GAME.maxUpgradeLevel)
        / projectileSpeedFor(base, GAME.maxLevel, 0);
      // Genau das ist der Grund, warum das Upgrade nach dem Deckel rechnet:
      // Vor dem Deckel wäre es für jede Precision-Klasse wirkungslos.
      expect(ratio, id).toBeCloseTo(expected, 9);
    }
  });

  it('hält die Reichweite jeder Klasse exakt konstant', () => {
    withProjectileSpeed(true, () => {
      for (const id of SHOOTERS) {
        const base = CLASS_DEFINITIONS[id];
        const reach = base.projectileSpeed * base.projectileLife;
        for (const points of [0, GAME.maxUpgradeLevel]) {
          for (const level of [1, GAME.maxLevel]) {
            const stats = statsFor(id, level, points);
            expect(stats.projectileSpeed * stats.projectileLife, `${id} L${level} ${points}`)
              .toBeCloseTo(reach, 6);
          }
        }
      }
    });
  });

  it('nimmt Precision die Sonderbehandlung – dort war die Kugel am unfairsten', () => {
    withProjectileSpeed(true, () => {
      const lancer = statsFor('lancer', GAME.maxLevel, 0).projectileSpeed;
      const core = statsFor('core', GAME.maxLevel, 0).projectileSpeed;
      // Heute liegt Lancer beim 3,3-Fachen des schnellsten Spielers, Core beim
      // 1,38-Fachen. Danach ist der Abstand deutlich kleiner.
      expect(legacy('lancer', 0).speed / fastestPlayerSpeed).toBeGreaterThan(3);
      // Mit dem weichen Deckel liegt die Spitze knapp darueber – gestaucht auf
      // den Ueberschuss, nicht abgeschnitten.
      expect(lancer / fastestPlayerSpeed).toBeGreaterThan(PROJECTILE_SPEED_CAP_LOW);
      expect(lancer / fastestPlayerSpeed).toBeLessThan(PROJECTILE_SPEED_CAP_LOW * 1.15);
      expect(lancer).toBeGreaterThan(core);
    });
  });
});

describe('projektiltempo – vorhalt der bots', () => {
  it('hält den absoluten Vorhaltfehler über die Flugzeit konstant', () => {
    const targetSpeed = 360;
    const missAt = (leadFactor: number, travelTime: number): number =>
      targetSpeed * travelTime * (1 - compensatedLeadFactor(leadFactor, travelTime));
    for (const leadFactor of [0.3, 0.52, 0.78]) {
      const reference = missAt(leadFactor, BOT_LEAD_REFERENCE_FLIGHT);
      for (const travelTime of [0.4, 0.6, 0.9, 1.4]) {
        expect(missAt(leadFactor, travelTime), `${leadFactor} @ ${travelTime}`).toBeCloseTo(reference, 6);
      }
    }
  });

  it('gleicht nur nach oben aus – kurze Flugzeiten bleiben, wie sie waren', () => {
    for (const travelTime of [0.05, 0.2, BOT_LEAD_REFERENCE_FLIGHT]) {
      expect(compensatedLeadFactor(0.52, travelTime)).toBeCloseTo(0.52, 9);
    }
    expect(compensatedLeadFactor(0.52, 0.7)).toBeGreaterThan(0.52);
    // Und nie über den perfekten Vorhalt hinaus.
    expect(compensatedLeadFactor(0.78, 100)).toBeLessThanOrEqual(1);
    expect(compensatedLeadFactor(0.3, 0)).toBe(0.3);
  });
});

describe('projektiltempo – im laufenden Spiel', () => {
  const fireOnce = (playerClass: PlayerClass, level: number, points: number) => {
    const game = tuneCombatScaling(new MazeGame(0));
    const internals = game as unknown as { players: Map<string, any>; projectiles: Map<string, any> };
    internals.projectiles.clear();
    const id = game.addPlayer('Schuetze');
    const player = internals.players.get(id);
    player.playerClass = playerClass;
    player.level = level;
    player.upgrades.projectileSpeed = points;
    player.position = { x: 2800, y: 2200 };
    player.aim = { x: 200, y: 0 };
    player.primary = true;
    player.cooldown = 0;
    player.invulnerable = false;
    player.invulnerableUntil = 0;
    game.step(0.025, 100_000);
    const projectile = [...internals.projectiles.values()][0];
    return projectile ? { speed: Math.hypot(projectile.velocity.x, projectile.velocity.y), life: projectile.life } : null;
  };

  it('verschießt die Kugel wirklich langsamer – und ohne Schalter wie bisher', () => {
    const before = withProjectileSpeed(false, () => fireOnce('lancer', 45, GAME.maxUpgradeLevel));
    const after = withProjectileSpeed(true, () => fireOnce('lancer', 45, GAME.maxUpgradeLevel));
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before!.speed).toBeCloseTo(legacy('lancer', GAME.maxUpgradeLevel).speed, 6);
    expect(after!.speed).toBeLessThan(before!.speed * 0.6);

    // Reichweite: langsamer, dafür länger unterwegs. Bezugspunkt ist die
    // Reichweite der Klassendefinition – nicht die von heute. Heute schiebt das
    // Tempo-Upgrade die Reichweite nebenbei um 32 % hoch; genau diesen
    // unbeabsichtigten Bonus nimmt die Änderung weg (Bericht, Abweichung 2).
    const base = CLASS_DEFINITIONS.lancer;
    const reach = base.projectileSpeed * base.projectileLife;
    // Ein Tick Flugzeit ist schon abgezogen, deshalb relativ statt absolut.
    expect(after!.speed * after!.life).toBeGreaterThan(reach * 0.97);
    expect(after!.speed * after!.life).toBeLessThanOrEqual(reach);
    expect(before!.speed * before!.life).toBeGreaterThan(reach * 1.3);
  });
});
