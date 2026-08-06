import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  DEFAULT_STEALTH,
  SIGNATURE_MAX,
  ambushDamageScale,
  isSpecterClass,
  stealthFor,
  tuneSpecterSignature,
  type StealthConfig
} from './signature-specter';
import { isFree } from './world';

const DT = 0.025;
/** Nachweislich freies Feld – auch die Flugbahn der Testschüsse ist frei. */
const OPEN_GROUND = { x: 2800, y: 2200 };
const FAR_AWAY = { x: 500, y: 500 };

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  projectiles: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

/** Macht aus einem frisch gespawnten Spieler einen kampfbereiten Testfall. */
const configure = (player: any, playerClass: PlayerClass, position: { x: number; y: number }): void => {
  player.playerClass = playerClass;
  player.level = 45;
  player.position = { ...position };
  player.velocity = { x: 0, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
};

const setup = (playerClass: PlayerClass, enabled = true, config: StealthConfig = DEFAULT_STEALTH) => {
  const game = tuneSpecterSignature(tuneCombatScaling(new MazeGame(0)), enabled, config);
  const internals = game as unknown as Internals;
  // Formen spawnen zufällig und machen Körperkontakt-Schaden – eine Form am
  // Messpunkt würde die Tarnung unvorhersehbar brechen. Also weg damit; im
  // echten Betrieb wachsen sie nach, hier bleibt die Arena leer.
  internals.shapes.clear();
  const id = game.addPlayer('Schleicher');
  const player = internals.players.get(id);
  configure(player, playerClass, OPEN_GROUND);
  return { game, internals, id, player };
};

/**
 * N Ticks Ruhe: kein Schuss, kein Kontakt. Nach jedem Tick werden Position und
 * Geschwindigkeit verankert – Kollisionsauflösung schiebt, `moveVectorToward`
 * lässt austrudeln, und beides soll die Messung nicht verfälschen.
 */
const rest = (
  game: MazeGame,
  anchors: ReadonlyArray<readonly [any, { x: number; y: number }]>,
  ticks: number,
  start: number
): number => {
  let now = start;
  for (let i = 0; i < ticks; i += 1) {
    now += DT * 1000;
    for (const [player] of anchors) {
      player.move = { x: 0, y: 0 };
      player.primary = false;
    }
    game.step(DT, now);
    for (const [player, at] of anchors) {
      player.position = { ...at };
      player.velocity = { x: 0, y: 0 };
    }
  }
  return now;
};

/** Genau ein Schuss im nächsten Tick; gibt die neue Zeit zurück. */
const fireOnce = (game: MazeGame, player: any, start: number): number => {
  const now = start + DT * 1000;
  player.aim = { x: 200, y: 0 };
  player.primary = true;
  player.cooldown = 0;
  game.step(DT, now);
  player.primary = false;
  return now;
};

/** Schadenswerte aller lebenden Projektile eines Spielers (die letzte Salve). */
const salvoDamages = (internals: Internals, ownerId: string): number[] =>
  [...internals.projectiles.values()]
    .filter((projectile) => projectile.ownerId === ownerId)
    .map((projectile) => projectile.damage);

describe('specter signature – tarnung', () => {
  it('setzt Testannahmen: freies Feld, freie Flugbahn, eine reine Specter-Familie', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    // Die Testschüsse fliegen nach rechts; ein Treffer an einer Wand im ersten
    // Tick würde die Salve löschen, bevor sie gemessen werden kann.
    expect(isFree({ x: OPEN_GROUND.x + 150, y: OPEN_GROUND.y }, 12)).toBe(true);
    for (const specter of ['specter', 'wraith', 'shade', 'mirage', 'revenant', 'eidolon'] as const) {
      expect(isSpecterClass(specter)).toBe(true);
    }
    expect(isSpecterClass('core')).toBe(false);
    expect(isSpecterClass('storm')).toBe(false);
    expect(isSpecterClass('juggernaut')).toBe(false);
    expect(isSpecterClass('tempest')).toBe(false);
  });

  it('rechnet die Erstschlag-Stufe an den Rändern richtig', () => {
    expect(ambushDamageScale(0)).toBe(1);
    expect(ambushDamageScale(DEFAULT_STEALTH.ambushThreshold - 0.001)).toBe(1);
    expect(ambushDamageScale(DEFAULT_STEALTH.ambushThreshold)).toBeCloseTo(1 + DEFAULT_STEALTH.ambushBonus, 10);
    expect(ambushDamageScale(SIGNATURE_MAX)).toBeCloseTo(1 + DEFAULT_STEALTH.ambushBonus, 10);
    // Die Konfiguration wird respektiert, nicht der Festwert.
    expect(ambushDamageScale(50, { ...DEFAULT_STEALTH, ambushThreshold: 40, ambushBonus: 0.5 })).toBe(1.5);
  });

  it('baut ab Spawn ohne Störung auf und deckelt bei 100', () => {
    const { game, id, player } = setup('wraith');
    expect(player.signature).toBeUndefined();

    // Wer nie gestört wurde, ist ruhig – die Uhr misst den Abstand zur letzten
    // Störung, nicht die Zeit seit dem Spawn. Eine Sekunde = eine Aufbaurate.
    let now = rest(game, [[player, OPEN_GROUND]], 40, 100_000);
    expect(stealthFor(game, id)).toBeCloseTo(DEFAULT_STEALTH.buildPerSecond * 1, 5);

    now = rest(game, [[player, OPEN_GROUND]], 120, now);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
  });

  it('lädt in voller Fahrt genauso – Tarnung ist ein Flanken-Werkzeug', () => {
    const { game, id, player } = setup('specter');
    let now = 100_000;
    for (let i = 0; i < 60; i += 1) {
      now += DT * 1000;
      player.move = { x: 1, y: 0 };
      player.primary = false;
      game.step(DT, now);
      // Laufband: sonst wäre nach Sekunden Geradeausfahrt der Weltrand erreicht.
      player.position = { ...OPEN_GROUND };
    }
    // Erst belegen, dass wirklich gefahren wurde – sonst misst der Test nichts.
    expect(Math.hypot(player.velocity.x, player.velocity.y))
      .toBeGreaterThan(tunedStatsFor(player).moveSpeed * 0.5);
    expect(stealthFor(game, id)).toBeCloseTo(DEFAULT_STEALTH.buildPerSecond * 1.5, 5);
  });

  it('nullt beim eigenen Schuss sofort und baut erst nach quietDelay wieder auf', () => {
    const { game, id, player } = setup('specter');
    let now = rest(game, [[player, OPEN_GROUND]], 120, 100_000);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);

    now = fireOnce(game, player, now);
    expect(stealthFor(game, id)).toBe(0);
    expect(player.signature).toBe(0);

    // 47 Ticks = 1,175 s: noch innerhalb der Ruhephase, kein Aufbau.
    now = rest(game, [[player, OPEN_GROUND]], 47, now);
    expect(stealthFor(game, id)).toBe(0);

    // Die nächsten 40 Ticks liegen ab 1,2 s – volle Aufbaurate von Anfang an.
    now = rest(game, [[player, OPEN_GROUND]], 40, now);
    expect(stealthFor(game, id)).toBeCloseTo(DEFAULT_STEALTH.buildPerSecond * 1, 5);
  });

  it('gibt den Erstschlag-Bonus genau einmal – und nach neuem Aufladen wieder', () => {
    const { game, internals, id, player } = setup('shade');
    const plain = tunedStatsFor(player).damage;
    let now = rest(game, [[player, OPEN_GROUND]], 120, 100_000);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);

    // Erstschlag aus voller Tarnung: die eine Kugel trägt den Aufschlag.
    internals.projectiles.clear();
    now = fireOnce(game, player, now);
    expect(salvoDamages(internals, id)).toHaveLength(1);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain * (1 + DEFAULT_STEALTH.ambushBonus), 6);

    // Der Schuss hat enttarnt – der direkt folgende trägt nichts mehr.
    internals.projectiles.clear();
    now = fireOnce(game, player, now);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain, 6);

    // Der Erstschlag ist kein Einmal-Ereignis: voll aufgeladen gilt er erneut.
    now = rest(game, [[player, OPEN_GROUND]], 160, now);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);
    internals.projectiles.clear();
    fireOnce(game, player, now);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain * (1 + DEFAULT_STEALTH.ambushBonus), 6);
  });

  it('trägt den Bonus bei Mehrlauf-Klassen auf die eine komplette Salve', () => {
    const { game, internals, id, player } = setup('mirage');
    const plain = tunedStatsFor(player).damage;
    const now = rest(game, [[player, OPEN_GROUND]], 120, 100_000);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);

    internals.projectiles.clear();
    fireOnce(game, player, now);
    const salvo = salvoDamages(internals, id);
    // Beide Läufe feuern im selben Tick – beide Kugeln SIND der Erstschlag.
    expect(salvo).toHaveLength(CLASS_DEFINITIONS.mirage.barrelCount);
    for (const damage of salvo) expect(damage).toBeCloseTo(plain * (1 + DEFAULT_STEALTH.ambushBonus), 6);
    expect(stealthFor(game, id)).toBe(0);
  });

  it('zieht bei Körperkontakt genau einmal ab und stellt die Ruhe-Uhr neu', () => {
    const { game, internals, id, player } = setup('revenant');
    const otherId = game.addPlayer('Rempler');
    const other = internals.players.get(otherId);
    configure(other, 'storm', FAR_AWAY);

    let now = rest(game, [[player, OPEN_GROUND], [other, FAR_AWAY]], 120, 100_000);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);

    // Ein Tick Kontakt. Der Rempler erzeugt ZWEI Schadensereignisse (erlitten
    // und ausgeteilt) – bezahlt wird trotzdem genau einmal −60.
    now += DT * 1000;
    other.position = { x: OPEN_GROUND.x + 10, y: OPEN_GROUND.y };
    game.step(DT, now);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX - DEFAULT_STEALTH.contactPenalty);
    expect(player.signature).toBe(SIGNATURE_MAX - DEFAULT_STEALTH.contactPenalty);
    // Der Nicht-Specter bleibt komplett unbebucht.
    expect(other.signature).toBeUndefined();
    expect(stealthFor(game, otherId)).toBe(0);

    // Auch der Kontakt startet die Ruhephase neu: 1,175 s lang kein Aufbau …
    now = rest(game, [[player, OPEN_GROUND], [other, FAR_AWAY]], 47, now);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX - DEFAULT_STEALTH.contactPenalty);
    // … danach geht es mit voller Rate weiter.
    now = rest(game, [[player, OPEN_GROUND], [other, FAR_AWAY]], 20, now);
    expect(stealthFor(game, id))
      .toBeCloseTo(SIGNATURE_MAX - DEFAULT_STEALTH.contactPenalty + DEFAULT_STEALTH.buildPerSecond * 0.5, 5);
  });

  it('lässt erlittenen Fernschaden die Tarnung nicht brechen', () => {
    // Bewusste Design-Grenze: Nur die eigenen Aktionen enttarnen. Wer den
    // Schleicher aus der Distanz trifft, macht Schaden – mehr nicht.
    const { game, internals, id, player } = setup('specter');
    const now = rest(game, [[player, OPEN_GROUND]], 120, 100_000);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);

    const before = player.health;
    internals.damagePlayer(player, 5, null, now);
    expect(before - player.health).toBeCloseTo(5, 6);
    expect(stealthFor(game, id)).toBe(SIGNATURE_MAX);
    expect(player.signature).toBe(SIGNATURE_MAX);
  });

  it('lässt Klassen außerhalb der Specter-Familie unberührt', () => {
    const { game, internals, id, player } = setup('deadeye');
    let now = rest(game, [[player, OPEN_GROUND]], 160, 100_000);
    expect(player.signature).toBeUndefined();
    expect(stealthFor(game, id)).toBe(0);

    // Und kein Bonus, egal wie lange er ruhig war.
    internals.projectiles.clear();
    fireOnce(game, player, now);
    for (const damage of salvoDamages(internals, id)) {
      expect(damage).toBeCloseTo(tunedStatsFor(player).damage, 6);
    }
  });

  it('setzt Tarnung und Ruhe-Uhr beim Tod zurück', () => {
    const { game, id, player } = setup('wraith');
    let now = rest(game, [[player, OPEN_GROUND]], 120, 100_000);
    // Sterben mitten in der Ruhephase nach einem Schuss – der härteste Fall:
    // Ohne Löschung der Uhr müsste der Respawn die alte Störung absitzen.
    now = fireOnce(game, player, now);

    player.dead = true;
    now += DT * 1000;
    game.step(DT, now);
    expect(player.signature).toBe(0);
    expect(stealthFor(game, id)).toBe(0);

    // Der Auto-Respawn hat den Spieler auf Level 1/Core zurückgestuft; für den
    // zweiten Teil des Tests wieder ein echter Wraith.
    configure(player, 'wraith', OPEN_GROUND);
    player.dead = false;
    now = rest(game, [[player, OPEN_GROUND]], 20, now);
    // 0,5 s nach dem Tod läuft der Aufbau schon – die 1,2 s des Schusses vor
    // dem Tod zählen nicht mehr.
    expect(stealthFor(game, id)).toBeCloseTo(DEFAULT_STEALTH.buildPerSecond * 0.5, 5);
  });

  it('räumt das Feld, wenn ein Spieler die Familie verlässt', () => {
    const { game, id, player } = setup('specter');
    let now = rest(game, [[player, OPEN_GROUND]], 40, 100_000);
    expect(player.signature).toBeGreaterThan(0);

    player.playerClass = 'core';
    rest(game, [[player, OPEN_GROUND]], 1, now);
    expect(player.signature).toBeUndefined();
    expect(stealthFor(game, id)).toBe(0);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const { game, internals, id, player } = setup('specter', false);
    const now = rest(game, [[player, OPEN_GROUND]], 160, 100_000);

    // Kein Feld, nirgends …
    expect(player.signature).toBeUndefined();
    expect(stealthFor(game, id)).toBe(0);
    expect(game.snapshot(id).players[0]?.signature).toBeUndefined();

    // … und kein Erstschlag, obwohl 4 s Ruhe vergangen sind.
    internals.projectiles.clear();
    fireOnce(game, player, now);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(tunedStatsFor(player).damage, 6);
  });

  it('trägt den gerundeten Wert in den Snapshot und respektiert die Konfiguration', () => {
    // 37/s erzeugt absichtlich krumme Füllstände – nur so ist die Rundung
    // im Snapshot von einer Kopie des Rohwerts unterscheidbar.
    const config: StealthConfig = { ...DEFAULT_STEALTH, buildPerSecond: 37 };
    const { game, id, player } = setup('specter', true, config);
    rest(game, [[player, OPEN_GROUND]], 30, 100_000);
    expect(stealthFor(game, id)).toBeCloseTo(37 * 0.75, 5);

    const entry = game.snapshot(id).players.find((candidate) => candidate.id === id);
    expect(entry?.signature).toBe(Math.round(stealthFor(game, id)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBeGreaterThan(0);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
  });
});
