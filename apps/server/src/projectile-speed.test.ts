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
  DEFAULT_RANGE_CAP,
  setProjectileRangeCap,
  PROJECTILE_SPEED_DAMPER,
  PROJECTILE_SPEED_FLOOR,
  PROJECTILE_SPEED_PER_POINT,
  PROJECTILE_SPEED_TRIM,
  compensatedLeadFactor,
  fastestPlayerSpeed,
  projectileBaseSpeed,
  projectileSpeedCapAt,
  projectileSpeedEnabled,
  projectileSpeedFor,
  projectileRadiusFor,
  projektilReichweite,
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

/**
 * Dasselbe fuer den Reichweiten-Deckel.
 *
 * Die Tests in dieser Datei pruefen das TEMPO-Versprechen ("Reichweite bleibt
 * konstant, nur Tempo und Flugzeit tauschen"). Der Reichweiten-Deckel ist eine
 * spaetere, bewusst daruebergelegte Obergrenze (Sams "die Schuesse gehen noch
 * immer zu weit") - er wuerde diese Aussage verdecken. Deshalb laufen die
 * Tempo-Tests ohne Deckel; der Deckel hat seinen eigenen Block am Ende.
 */
const ohneDeckel = <T>(run: () => T): T => {
  const previous = setProjectileRangeCap(0);
  try {
    return run();
  } finally {
    setProjectileRangeCap(previous);
  }
};

afterEach(() => {
  setProjectileSpeedEnabled(false);
  setProjectileRangeCap(DEFAULT_RANGE_CAP);
});

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
    ohneDeckel(() => withProjectileSpeed(false, () => {
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
    }));
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
    // Der Abschlag greift NACH dem Boden (siehe PROJECTILE_SPEED_TRIM), also
    // liegt die Untergrenze der fertigen Zahl entsprechend tiefer.
    const floor = fastestPlayerSpeed * PROJECTILE_SPEED_FLOOR * PROJECTILE_SPEED_TRIM;
    for (const id of SHOOTERS) {
      const base = CLASS_DEFINITIONS[id];
      const before = legacy(id, 0).speed;
      const after = projectileBaseSpeed(base, GAME.maxLevel);
      if (before >= fastestPlayerSpeed * PROJECTILE_SPEED_FLOOR) expect(after, id).toBeGreaterThanOrEqual(floor - 1e-9);
      // Klassen, die schon heute unter dem Boden liegen, werden nicht nach oben
      // korrigiert – sie bekommen nur den Abschlag wie alle anderen.
      else expect(after, id).toBeCloseTo(before * PROJECTILE_SPEED_TRIM, 9);
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
        .toBeCloseTo(softCapped(damped, cap) * PROJECTILE_SPEED_TRIM, 9);
      expect(projectileBaseSpeed(CLASS_DEFINITIONS.lancer, level)).toBeGreaterThan(cap * PROJECTILE_SPEED_TRIM);
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
    // Der Abschlag (PROJECTILE_SPEED_TRIM) skaliert alle gleich und aendert an
    // der Zahl nichts; er rueckt die Werte nur naeher zusammen, sodass die
    // Rundung auf ganze Pixel einzelne Nachbarn zusammenfallen laesst. Genau
    // deshalb ist er der Abschlag und kein kleinerer Daempfer: Der drueckte
    // dreizehn Klassen auf denselben Bodenwert (gemessen 42 statt 54).
    const distinctValues = new Set(speeds.map((entry) => Math.round(entry.value)));
    expect(distinctValues.size).toBeGreaterThanOrEqual(distinctRaw.size - 4);

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

  /**
   * Vorher stand hier „hält die Reichweite jeder Klasse **exakt konstant**",
   * gemessen gegen `base.projectileSpeed × base.projectileLife`. Genau diese
   * Zusage war Sams Befund vom 13.08.: Sie hieß, dass die Reichweite nie
   * gesenkt wird, und 1271 px für eine Core-Kugel sind bei 800 px halber
   * Bildbreite zu weit. Drei Tempo-Pakete haben alles verändert außer der
   * Zahl, um die es ihm ging.
   *
   * Die Zusage bleibt in ihrem Kern – **Tempo ändert die Reichweite nicht** –,
   * nur der Bezugspunkt ist jetzt `projektilReichweite` statt der nominale
   * Wert der Klassendefinition.
   */
  it('hält die Reichweite jeder Klasse unabhängig von Level und Tempo-Upgrade', () => {
    ohneDeckel(() => withProjectileSpeed(true, () => {
      for (const id of SHOOTERS) {
        const base = CLASS_DEFINITIONS[id];
        const reach = projektilReichweite(base);
        // Und sie ist wirklich kleiner geworden – sonst prüfte der Test nur sich selbst.
        expect(reach, id).toBeLessThan(base.projectileSpeed * base.projectileLife);
        for (const points of [0, GAME.maxUpgradeLevel]) {
          for (const level of [1, GAME.maxLevel]) {
            const stats = statsFor(id, level, points);
            expect(stats.projectileSpeed * stats.projectileLife, `${id} L${level} ${points}`)
              .toBeCloseTo(reach, 6);
          }
        }
      }
    }));
  });

  /**
   * Sams eigentlicher Satz, als Zusicherung: „die Bullets fliegen zu WEIT
   * direkt von Anfang an, also die ‚normalen'." Eine halbe Bildbreite ist die
   * Grenze, ab der ein Schütze jemanden trifft, der ihn nicht sehen kann.
   */
  it('lässt die normalen Klassen nicht weiter schießen, als der Getroffene sieht', () => {
    withProjectileSpeed(true, () => {
      const halbeBreite = GAME.visibleWorldWidth / 2;
      for (const id of SHOOTERS) {
        if (CLASS_DEFINITIONS[id].branch === 'precision') continue;
        const stats = statsFor(id, 1, 0);
        const weite = stats.projectileSpeed * stats.projectileLife;
        expect(weite / halbeBreite, `${id} schiesst ${Math.round(weite)} px`).toBeLessThanOrEqual(1);
      }
    });
  });

  /**
   * Sams „zu klein, bzw. wenn man mehr levelt müssen die etwas größer werden
   * wie in Diep.io". Vorher war `projectileRadius` eine Klassenkonstante und
   * auf Stufe 60 exakt so groß wie auf Stufe 1.
   */
  it('lässt die Kugel mit dem Level wachsen', () => {
    withProjectileSpeed(true, () => {
      for (const id of SHOOTERS) {
        const base = CLASS_DEFINITIONS[id];
        const klein = projectileRadiusFor(base, 1);
        const gross = projectileRadiusFor(base, GAME.maxLevel);
        expect(gross, `${id} waechst nicht`).toBeGreaterThan(klein);
        // Und sie ist von Anfang an groesser als vorher.
        expect(klein, `${id} auf Stufe 1`).toBeGreaterThan(base.projectileRadius);
        // Aber nie groesser als der Panzer, der sie verschiesst.
        expect(gross, `${id} auf Stufe ${GAME.maxLevel}`).toBeLessThanOrEqual(GAME.playerRadius);
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
      // Gemessen gegen den Deckel MAL Abschlag: Der Deckel gilt vor dem
      // Abschlag, die fertige Zahl liegt entsprechend tiefer.
      const deckel = PROJECTILE_SPEED_CAP_LOW * PROJECTILE_SPEED_TRIM;
      expect(lancer / fastestPlayerSpeed).toBeGreaterThan(deckel);
      expect(lancer / fastestPlayerSpeed).toBeLessThan(deckel * 1.15);
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
    // Ohne Deckel: Dieser Test prueft den Tausch Tempo-gegen-Flugzeit, nicht
    // die spaetere Obergrenze (die den Lancer sonst auf 1400 px kuerzt).
    const before = ohneDeckel(() => withProjectileSpeed(false, () => fireOnce('lancer', 45, GAME.maxUpgradeLevel)));
    const after = ohneDeckel(() => withProjectileSpeed(true, () => fireOnce('lancer', 45, GAME.maxUpgradeLevel)));
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before!.speed).toBeCloseTo(legacy('lancer', GAME.maxUpgradeLevel).speed, 6);
    expect(after!.speed).toBeLessThan(before!.speed * 0.6);

    // Reichweite: langsamer, dafür länger unterwegs. Bezugspunkt ist die
    // Reichweite der Klassendefinition – nicht die von heute. Heute schiebt das
    // Tempo-Upgrade die Reichweite nebenbei um 32 % hoch; genau diesen
    // unbeabsichtigten Bonus nimmt die Änderung weg (Bericht, Abweichung 2).
    const base = CLASS_DEFINITIONS.lancer;
    const reach = projektilReichweite(base);
    // Ein Tick Flugzeit ist schon abgezogen, deshalb relativ statt absolut.
    expect(after!.speed * after!.life).toBeGreaterThan(reach * 0.97);
    expect(after!.speed * after!.life).toBeLessThanOrEqual(reach);
    // Und der Stand davor lag um ein Vielfaches darueber – das ist der
    // eigentliche Gewinn dieses Pakets, nicht das Tempo.
    expect(before!.speed * before!.life).toBeGreaterThan(reach * 3);
  });
});

/**
 * Der Reichweiten-Deckel (Sams Spieltest vom 13.08.: „die Schüsse gehen noch
 * immer zu weit").
 *
 * Vorher gab es keine Obergrenze, und vier Faktoren multiplizierten sich
 * unbemerkt auf: Reichweiten-Slot (×1,60), Stabilizer-Rahmen (×1,10),
 * Klassenwerte, Levelskalierung. Gemessen kam ein Lancer auf Level 60 auf
 * 7825 px – bei einem Sichtfenster von 1600 px Breite.
 */
describe('Reichweiten-Deckel', () => {
  const reichweite = (id: PlayerClass, level: number, upgrades: Partial<Record<string, number>> = {}, frame = 'standard') => {
    const stats = tunedStatsFor({
      playerClass: id, level, passiveModifier: frame as never,
      upgrades: { ...EMPTY_UPGRADES(), ...upgrades } as never,
      bot: null, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 },
      primary: false, secondary: false, cooldown: 0, lastDamageAt: 0, invulnerableUntil: 0
    } as never);
    return stats.projectileSpeed * stats.projectileLife;
  };

  it('hält jede Klasse in jeder Ausbaustufe unter dem Deckel', () => {
    withProjectileSpeed(true, () => {
      for (const id of SHOOTERS) {
        for (const level of [1, 20, GAME.maxLevel]) {
          for (const punkte of [{}, { projectileRange: GAME.maxUpgradeLevel, projectileSpeed: GAME.maxUpgradeLevel }]) {
            for (const frame of ['standard', 'stabilizer']) {
              const weite = reichweite(id, level, punkte, frame);
              expect(weite, `${id} L${level} ${frame}`).toBeLessThanOrEqual(DEFAULT_RANGE_CAP + 0.001);
            }
          }
        }
      }
    });
  });

  it('kürzt genau den Extremfall, der den Deckel nötig gemacht hat', () => {
    withProjectileSpeed(true, () => {
      const voll = { projectileRange: GAME.maxUpgradeLevel, projectileSpeed: GAME.maxUpgradeLevel };
      // Vor der Reichweiten-Skala waren es hier 7825 px – fast fuenf
      // Bildschirmbreiten. Die Skala allein bringt den Extremfall auf 1674 px;
      // der Deckel schneidet den Rest ab. Beide Regeln zusammen, nicht eine.
      const ohne = ohneDeckel(() => reichweite('lancer', GAME.maxLevel, voll, 'stabilizer'));
      expect(ohne).toBeGreaterThan(DEFAULT_RANGE_CAP);
      expect(ohne).toBeLessThan(2200);
      expect(reichweite('lancer', GAME.maxLevel, voll, 'stabilizer')).toBeCloseTo(DEFAULT_RANGE_CAP, 3);
    });
  });

  it('lässt kurze Reichweiten in Ruhe – der Deckel schneidet oben ab, er drückt nicht', () => {
    withProjectileSpeed(true, () => {
      // Die Rammklassen liegen deutlich unter dem Deckel und dürfen sich nicht
      // verändern; sonst wäre aus einer Obergrenze eine Angleichung geworden.
      for (const id of ['juggernaut', 'comet', 'crusher'] as PlayerClass[]) {
        const mit = reichweite(id, 20);
        const ohne = ohneDeckel(() => reichweite(id, 20));
        expect(mit, id).toBeCloseTo(ohne, 6);
      }
    });
  });

  it('deckelt die Lebenszeit, nicht das Tempo – die Ausweichzeit bleibt', () => {
    withProjectileSpeed(true, () => {
      // Voll ausgebauter Reichweiten-Slot: Seit der Reichweiten-Skala ist das
      // der Fall, in dem der Deckel ueberhaupt noch greift. Ohne Ausbau liegt
      // eclipse darunter – und dann darf der Deckel auch nichts tun.
      const voll = { ...EMPTY_UPGRADES(), projectileRange: GAME.maxUpgradeLevel };
      const bauen = () => tunedStatsFor({
        playerClass: 'eclipse' as PlayerClass, level: 20, passiveModifier: 'stabilizer' as never,
        upgrades: voll as never, bot: null, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 },
        primary: false, secondary: false, cooldown: 0, lastDamageAt: 0, invulnerableUntil: 0
      } as never);
      const gedeckelt = bauen();
      const frei = ohneDeckel(bauen);
      // Gleiches Tempo – nur kürzer unterwegs.
      expect(gedeckelt.projectileSpeed).toBeCloseTo(frei.projectileSpeed, 9);
      expect(gedeckelt.projectileLife).toBeLessThan(frei.projectileLife);
    });
  });

  it('lässt sich abschalten und stellt damit exakt den Stand davor her', () => {
    withProjectileSpeed(true, () => {
      const voll = { projectileRange: GAME.maxUpgradeLevel };
      const aus = ohneDeckel(() => reichweite('eclipse', 40, voll));
      expect(aus).toBeGreaterThan(DEFAULT_RANGE_CAP);
    });
  });
});
