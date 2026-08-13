import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { messfeld } from './messfeld';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  DEFAULT_STELLUNG,
  SIGNATURE_MAX,
  isSiegeClass,
  siegeDamageScale,
  siegeRangeScale,
  stellungFor,
  tuneSiegeSignature,
  type StellungConfig
} from './signature-siege';
import { isFree } from './world';

const DT = 0.025;
/** Nachweislich freies Feld – der Panzer muss anfahren können, nicht anecken. */
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Die feste
// Koordinate stammte von einer aelteren Karte und hatte nach dem
// Labyrinth-Umbau nur noch 200 px Luft.
const OPEN_GROUND = messfeld(340);

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  projectiles: Map<string, any>;
  stepPlayer(player: any, dt: number, now: number): void;
}

const setup = (playerClass: PlayerClass, enabled = true, config: StellungConfig = DEFAULT_STELLUNG) => {
  const game = tuneSiegeSignature(tuneCombatScaling(new MazeGame(0)), enabled, config);
  const internals = game as unknown as Internals;
  // Formen spawnen zufällig und machen Körperkontakt-Schaden – eine Form am
  // Messpunkt würde die Salve abfangen, bevor sie gemessen werden kann. Also
  // weg damit; im echten Betrieb wachsen sie nach, hier bleibt die Arena leer.
  internals.shapes.clear();
  const id = game.addPlayer('Kanonier');
  const player = internals.players.get(id);
  player.playerClass = playerClass;
  player.level = 45;
  player.position = { ...OPEN_GROUND };
  player.velocity = { x: 0, y: 0 };
  player.aim = { x: 200, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
  return { game, internals, id, player };
};

/**
 * N Ticks stehen oder fahren, dabei feuern oder nicht.
 *
 * Der Panzer läuft auf einem Laufband: Nach jedem Tick geht die Position auf den
 * Startpunkt zurück, sonst wäre nach Sekunden Geradeausfahrt der Weltrand
 * erreicht. Die Geschwindigkeit wird VOR jedem Tick exakt gesetzt (0 beim
 * Stehen, volle Höchstgeschwindigkeit beim Fahren) – `moveVectorToward` lässt
 * sie dann unverändert, und die Messung hängt nicht an der Anfahrkurve.
 */
const hold = (
  internals: Internals,
  player: any,
  options: { ticks: number; moving: boolean; firing?: boolean; start?: number }
): number => {
  let now = options.start ?? 100_000;
  const speed = tunedStatsFor(player).moveSpeed;
  for (let index = 0; index < options.ticks; index += 1) {
    player.move = options.moving ? { x: 1, y: 0 } : { x: 0, y: 0 };
    player.velocity = options.moving ? { x: speed, y: 0 } : { x: 0, y: 0 };
    player.aim = { x: 200, y: 0 };
    player.primary = options.firing ?? false;
    now += DT * 1000;
    internals.stepPlayer(player, DT, now);
    player.position = { ...OPEN_GROUND };
  }
  return now;
};

/** Genau ein Schuss im nächsten Tick, aus dem Stand; gibt die neue Zeit zurück. */
const fireOnce = (internals: Internals, player: any, start: number): number => {
  player.cooldown = 0;
  const now = hold(internals, player, { ticks: 1, moving: false, firing: true, start });
  player.primary = false;
  return now;
};

/** Die letzte Salve eines Spielers: Schaden und Lebenszeit jeder Kugel. */
const salvo = (internals: Internals, ownerId: string): Array<{ damage: number; life: number }> =>
  [...internals.projectiles.values()]
    .filter((projectile) => projectile.ownerId === ownerId)
    .map((projectile) => ({ damage: projectile.damage, life: projectile.life }));

describe('siege signature – stellung', () => {
  it('setzt Testannahmen: freies Feld und eine reine Siege-Familie', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    // Die Testschüsse fliegen nach rechts; eine Wand im ersten Tick würde die
    // Salve löschen, bevor sie gemessen werden kann.
    expect(isFree({ x: OPEN_GROUND.x + 150, y: OPEN_GROUND.y }, 12)).toBe(true);
    for (const siege of ['siege', 'bombard', 'mortar', 'howitzer', 'trebuchet', 'ragnarok'] as const) {
      expect(isSiegeClass(siege)).toBe(true);
      expect(CLASS_DEFINITIONS[siege].branch).toBe('siege');
    }
    expect(isSiegeClass('core')).toBe(false);
    expect(isSiegeClass('storm')).toBe(false);
    expect(isSiegeClass('deadeye')).toBe(false);
    expect(isSiegeClass('aegis')).toBe(false);
  });

  it('rechnet Schadens- und Reichweitenskala an den Rändern richtig', () => {
    expect(siegeDamageScale(0)).toBe(1);
    expect(siegeDamageScale(SIGNATURE_MAX)).toBeCloseTo(1 + DEFAULT_STELLUNG.maxDamageBonus, 10);
    expect(siegeDamageScale(50)).toBeCloseTo(1 + DEFAULT_STELLUNG.maxDamageBonus / 2, 10);
    expect(siegeRangeScale(0)).toBe(1);
    expect(siegeRangeScale(SIGNATURE_MAX)).toBeCloseTo(1 + DEFAULT_STELLUNG.maxRangeBonus, 10);
    expect(siegeRangeScale(50)).toBeCloseTo(1 + DEFAULT_STELLUNG.maxRangeBonus / 2, 10);

    // Werte außerhalb 0..100 dürfen die Salve nie ins Absurde ziehen.
    expect(siegeDamageScale(-40)).toBe(1);
    expect(siegeRangeScale(-40)).toBe(1);
    expect(siegeDamageScale(400)).toBe(siegeDamageScale(SIGNATURE_MAX));
    expect(siegeRangeScale(400)).toBe(siegeRangeScale(SIGNATURE_MAX));

    // Die Konfiguration wird respektiert, nicht der Festwert.
    const config: StellungConfig = { ...DEFAULT_STELLUNG, maxDamageBonus: 1, maxRangeBonus: 2 };
    expect(siegeDamageScale(SIGNATURE_MAX, config)).toBe(2);
    expect(siegeRangeScale(50, config)).toBe(2);
  });

  it('baut Stellung im Stillstand auf und deckelt bei 100', () => {
    const { internals, game, id, player } = setup('siege');
    expect(player.signature).toBeUndefined();

    // Eine Sekunde stehen = exakt eine Aufbaurate.
    hold(internals, player, { ticks: 40, moving: false });
    expect(stellungFor(game, id)).toBeCloseTo(DEFAULT_STELLUNG.buildPerSecond, 6);

    // Lange genug für den Vollausschlag – und darüber hinaus.
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
  });

  it('baut in Bewegung doppelt so schnell ab, wie er im Stand aufbaut', () => {
    const { internals, game, id, player } = setup('ragnarok');
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);

    // Eine Sekunde fahren kostet genau `decayPerSecond` …
    hold(internals, player, { ticks: 40, moving: true });
    expect(stellungFor(game, id)).toBeCloseTo(SIGNATURE_MAX - DEFAULT_STELLUNG.decayPerSecond, 6);
    // … und das ist bewusst das Doppelte des Aufbaus: Umstellen kostet.
    expect(DEFAULT_STELLUNG.decayPerSecond).toBe(DEFAULT_STELLUNG.buildPerSecond * 2);

    // Weiterfahren führt bis auf null – und nicht darunter.
    hold(internals, player, { ticks: 60, moving: true });
    expect(stellungFor(game, id)).toBe(0);
    expect(player.signature).toBe(0);
  });

  it('misst die tatsächliche Geschwindigkeit, nicht die Eingabe', () => {
    // Schleichen unterhalb der Schwelle lädt weiter, ein Schritt darüber baut
    // ab – obwohl in beiden Fällen eine Bewegungseingabe anliegt.
    const { internals, game, id, player } = setup('mortar');
    const speed = tunedStatsFor(player).moveSpeed;
    const creep = (DEFAULT_STELLUNG.standstillSpeed - 4) / speed;
    const walk = (DEFAULT_STELLUNG.standstillSpeed + 4) / speed;

    let now = 100_000;
    for (let index = 0; index < 40; index += 1) {
      player.move = { x: creep, y: 0 };
      player.aim = { x: 200, y: 0 };
      player.primary = false;
      now += DT * 1000;
      internals.stepPlayer(player, DT, now);
      player.position = { ...OPEN_GROUND };
    }
    expect(Math.hypot(player.velocity.x, player.velocity.y))
      .toBeCloseTo(DEFAULT_STELLUNG.standstillSpeed - 4, 6);
    expect(stellungFor(game, id)).toBeCloseTo(DEFAULT_STELLUNG.buildPerSecond, 6);

    const built = stellungFor(game, id);
    for (let index = 0; index < 20; index += 1) {
      player.move = { x: walk, y: 0 };
      player.primary = false;
      now += DT * 1000;
      internals.stepPlayer(player, DT, now);
      player.position = { ...OPEN_GROUND };
    }
    expect(Math.hypot(player.velocity.x, player.velocity.y))
      .toBeCloseTo(DEFAULT_STELLUNG.standstillSpeed + 4, 6);
    expect(stellungFor(game, id)).toBeCloseTo(built - DEFAULT_STELLUNG.decayPerSecond * 0.5, 6);
  });

  it('verstärkt die volle Stellung in Schaden UND Lebenszeit der Salve', () => {
    const { internals, game, id, player } = setup('trebuchet');
    const stats = tunedStatsFor(player);
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);

    internals.projectiles.clear();
    fireOnce(internals, player, 200_000);
    const shots = salvo(internals, id);
    expect(shots).toHaveLength(1);
    expect(shots[0]!.damage).toBeCloseTo(stats.damage * (1 + DEFAULT_STELLUNG.maxDamageBonus), 6);
    expect(shots[0]!.life).toBeCloseTo(stats.projectileLife * (1 + DEFAULT_STELLUNG.maxRangeBonus), 6);
    // Das Feuern verbraucht die Stellung nicht: Wer steht, hält seinen Vorteil.
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);
  });

  it('skaliert bei Teilfüllung genau linear', () => {
    const { internals, game, id, player } = setup('siege');
    const stats = tunedStatsFor(player);
    // Eine Sekunde stehen: exakt 35 von 100.
    hold(internals, player, { ticks: 40, moving: false });
    const value = stellungFor(game, id);
    expect(value).toBeCloseTo(DEFAULT_STELLUNG.buildPerSecond, 6);

    internals.projectiles.clear();
    fireOnce(internals, player, 200_000);
    const shots = salvo(internals, id);
    expect(shots[0]!.damage).toBeCloseTo(stats.damage * siegeDamageScale(value), 6);
    expect(shots[0]!.life).toBeCloseTo(stats.projectileLife * siegeRangeScale(value), 6);
    // Gegenprobe gegen eine versehentliche Stufenfunktion.
    expect(shots[0]!.damage).toBeLessThan(stats.damage * (1 + DEFAULT_STELLUNG.maxDamageBonus));
    expect(shots[0]!.damage).toBeGreaterThan(stats.damage);
  });

  it('trägt den Aufschlag auf jede Kugel einer Mehrlauf-Salve', () => {
    const { internals, game, id, player } = setup('howitzer');
    const stats = tunedStatsFor(player);
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);

    internals.projectiles.clear();
    fireOnce(internals, player, 200_000);
    const shots = salvo(internals, id);
    // Alle drei Rohre feuern im selben Tick – alle drei SIND die eine Salve.
    expect(shots).toHaveLength(CLASS_DEFINITIONS.howitzer.barrelCount);
    for (const shot of shots) {
      expect(shot.damage).toBeCloseTo(stats.damage * (1 + DEFAULT_STELLUNG.maxDamageBonus), 6);
      expect(shot.life).toBeCloseTo(stats.projectileLife * (1 + DEFAULT_STELLUNG.maxRangeBonus), 6);
    }
  });

  it('gibt der Salve den Füllstand beim Abdrücken, nicht den nach dem Tick', () => {
    const { internals, game, id, player } = setup('bombard');
    const stats = tunedStatsFor(player);
    hold(internals, player, { ticks: 200, moving: false });
    const value = stellungFor(game, id);

    // Im Feuertick fährt der Panzer los: Die Stellung fällt in diesem Tick um
    // 1,75 – die bereits abgefeuerte Salve trägt trotzdem noch die vollen 100.
    internals.projectiles.clear();
    player.cooldown = 0;
    hold(internals, player, { ticks: 1, moving: true, firing: true, start: 200_000 });
    expect(stellungFor(game, id)).toBeCloseTo(value - DEFAULT_STELLUNG.decayPerSecond * DT, 6);
    for (const shot of salvo(internals, id)) {
      expect(shot.damage).toBeCloseTo(stats.damage * (1 + DEFAULT_STELLUNG.maxDamageBonus), 6);
    }
  });

  it('lässt Klassen außerhalb der Siege-Familie unberührt', () => {
    const { internals, game, id, player } = setup('deadeye');
    const stats = tunedStatsFor(player);
    hold(internals, player, { ticks: 200, moving: false });
    expect(player.signature).toBeUndefined();
    expect(stellungFor(game, id)).toBe(0);

    internals.projectiles.clear();
    fireOnce(internals, player, 200_000);
    for (const shot of salvo(internals, id)) {
      expect(shot.damage).toBeCloseTo(stats.damage, 6);
      expect(shot.life).toBeCloseTo(stats.projectileLife, 6);
    }
  });

  it('setzt Stellung beim Tod zurück', () => {
    const { internals, game, id, player } = setup('mortar');
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);

    player.dead = true;
    hold(internals, player, { ticks: 1, moving: false });
    expect(player.signature).toBe(0);
    expect(stellungFor(game, id)).toBe(0);

    // Und der Wiedereinstieg beginnt bei null, nicht beim alten Stand.
    player.dead = false;
    hold(internals, player, { ticks: 40, moving: false });
    expect(stellungFor(game, id)).toBeCloseTo(DEFAULT_STELLUNG.buildPerSecond, 6);
  });

  it('räumt das Feld, wenn ein Spieler die Familie verlässt', () => {
    const { internals, game, id, player } = setup('siege');
    hold(internals, player, { ticks: 40, moving: false });
    expect(player.signature).toBeGreaterThan(0);

    // Der Respawn auf niedrigem Level macht aus dem Siege wieder einen Core.
    player.playerClass = 'core';
    hold(internals, player, { ticks: 1, moving: false });
    expect(player.signature).toBeUndefined();
    expect(stellungFor(game, id)).toBe(0);
  });

  it('räumt den Eintrag, wenn der Spieler das Spiel verlässt', () => {
    const { internals, game, id, player } = setup('ragnarok');
    hold(internals, player, { ticks: 200, moving: false });
    expect(stellungFor(game, id)).toBe(SIGNATURE_MAX);

    game.removePlayer(id);
    expect(stellungFor(game, id)).toBe(0);
    expect(internals.players.has(id)).toBe(false);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const { internals, game, id, player } = setup('trebuchet', false);
    const stats = tunedStatsFor(player);
    hold(internals, player, { ticks: 200, moving: false });

    // Kein Feld, nirgends …
    expect(player.signature).toBeUndefined();
    expect(stellungFor(game, id)).toBe(0);
    expect(game.snapshot(id).players[0]?.signature).toBeUndefined();

    // … und keine Kugel, die härter oder weiter fliegt.
    internals.projectiles.clear();
    fireOnce(internals, player, 200_000);
    const shots = salvo(internals, id);
    expect(shots).toHaveLength(1);
    expect(shots[0]!.damage).toBeCloseTo(stats.damage, 6);
    expect(shots[0]!.life).toBeCloseTo(stats.projectileLife, 6);
  });

  it('trägt den gerundeten Wert in den Snapshot und respektiert die Konfiguration', () => {
    // 37/s erzeugt absichtlich krumme Füllstände – nur so ist die Rundung im
    // Snapshot von einer Kopie des Rohwerts unterscheidbar.
    const config: StellungConfig = { ...DEFAULT_STELLUNG, buildPerSecond: 37 };
    const { internals, game, id, player } = setup('bombard', true, config);
    hold(internals, player, { ticks: 15, moving: false });
    expect(stellungFor(game, id)).toBeCloseTo(37 * 0.375, 6);

    const entry = game.snapshot(id).players.find((candidate) => candidate.id === id);
    expect(entry?.signature).toBe(Math.round(stellungFor(game, id)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBeGreaterThan(0);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
    expect(player.signature).toBe(entry!.signature);
  });
});
