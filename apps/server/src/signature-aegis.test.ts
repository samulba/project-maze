import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, GAME, type PlayerClass } from '@project-maze/shared';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import {
  DEFAULT_SCHILD,
  SIGNATURE_MAX,
  isAegisClass,
  schildFor,
  tuneAegisSignature,
  type SchildConfig
} from './signature-aegis';
import { tuneImpactSignature, wuchtFor } from './signature-impact';
import { signatureStateFor } from './signature';
import { messfeld } from './messfeld';
import { isFree } from './world';

const DT = 0.025;
/** Nachweislich freies Feld – der Tank und seine Nachbarn stehen frei. */
// Auf der Karte gesucht statt hingeschrieben (siehe messfeld.ts): Die
// Entladung wirkt radial, der Messpunkt braucht also den vollen Radius in
// JEDE Richtung – sonst misst der Test eine Wand statt eines Abfalls.
const OPEN_GROUND = messfeld(DEFAULT_SCHILD.dischargeRadius + 120);
/** 120 Einheiten entfernt: genau der halbe Entladungsradius (240). */
const NEAR = { x: OPEN_GROUND.x + 120, y: OPEN_GROUND.y };
/** 300 Einheiten entfernt: sicher außerhalb des Radius. */
const FAR = { x: OPEN_GROUND.x + 300, y: OPEN_GROUND.y };
/** Ladung genau bis zum Deckel: 100 / 1,4 Punkte Schaden. */
const FULL_CHARGE_DAMAGE = SIGNATURE_MAX / DEFAULT_SCHILD.chargePerDamage;

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  stepPlayer(player: any, dt: number, now: number): void;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

/** Macht aus einem frisch gespawnten Spieler einen kampfbereiten Testfall. */
const configure = (player: any, playerClass: PlayerClass, position: { x: number; y: number }): void => {
  player.playerClass = playerClass;
  player.level = 45;
  player.position = { ...position };
  player.velocity = { x: 0, y: 0 };
  player.move = { x: 0, y: 0 };
  player.aim = { x: 200, y: 0 };
  player.primary = false;
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
};

const setup = (playerClass: PlayerClass = 'aegis', enabled = true, config: SchildConfig = DEFAULT_SCHILD) => {
  const game = tuneAegisSignature(tuneCombatScaling(new MazeGame(0)), enabled, config);
  const internals = game as unknown as Internals;
  // Formen spawnen zufällig und machen Körperkontakt-Schaden – eine Form am
  // Messpunkt würde den Schild unvorhersehbar laden. Also weg damit; im echten
  // Betrieb wachsen sie nach, hier bleibt die Arena leer.
  internals.shapes.clear();
  const id = game.addPlayer('Schildträger');
  const player = internals.players.get(id);
  configure(player, playerClass, OPEN_GROUND);
  return { game, internals, id, player };
};

/** Ein zweiter Spieler an fester Stelle – Ziel oder Zuschauer der Entladung. */
const addOther = (
  game: MazeGame,
  internals: Internals,
  name: string,
  playerClass: PlayerClass,
  position: { x: number; y: number }
) => {
  const id = game.addPlayer(name);
  const player = internals.players.get(id);
  configure(player, playerClass, position);
  return { id, player };
};

describe('aegis signature – schild', () => {
  it('setzt Testannahmen: freies Feld, gemessene Abstände, eine reine Aegis-Familie', () => {
    expect(isFree(OPEN_GROUND, 40)).toBe(true);
    expect(isFree(NEAR, 40)).toBe(true);
    expect(isFree(FAR, 40)).toBe(true);
    expect(Math.hypot(NEAR.x - OPEN_GROUND.x, NEAR.y - OPEN_GROUND.y)).toBe(DEFAULT_SCHILD.dischargeRadius / 2);
    expect(Math.hypot(FAR.x - OPEN_GROUND.x, FAR.y - OPEN_GROUND.y)).toBeGreaterThan(DEFAULT_SCHILD.dischargeRadius);

    for (const aegis of ['aegis', 'bulwarker', 'reflector', 'paladin', 'retributor', 'sanctum'] as const) {
      expect(isAegisClass(aegis)).toBe(true);
      expect(CLASS_DEFINITIONS[aegis].branch).toBe('aegis');
    }
    expect(isAegisClass('core')).toBe(false);
    expect(isAegisClass('storm')).toBe(false);
    expect(isAegisClass('juggernaut')).toBe(false);
    expect(isAegisClass('siege')).toBe(false);
  });

  it('lädt den Schild mit erlittenem Schaden und mindert ihn dabei nicht', () => {
    const { game, internals, id, player } = setup('bulwarker');
    const before = player.health;

    internals.damagePlayer(player, 20, null, 100_000);
    // Unterhalb der Rüstungsschwelle kommt der Schaden voll an …
    expect(before - player.health).toBeCloseTo(20, 6);
    // … und lädt mit 1,4 Punkten je Schadenspunkt.
    expect(schildFor(game, id)).toBeCloseTo(20 * DEFAULT_SCHILD.chargePerDamage, 6);
    expect(player.signature).toBe(28);

    internals.damagePlayer(player, 10, null, 100_000);
    expect(schildFor(game, id)).toBeCloseTo(30 * DEFAULT_SCHILD.chargePerDamage, 6);
  });

  it('mindert erlittenen Schaden erst oberhalb der Rüstungsschwelle', () => {
    const { game, internals, id, player } = setup('paladin');

    // Erster Treffer: Der Schild steht noch auf 0, die Rüstung greift nicht –
    // auch dann nicht, wenn genau dieser Treffer über die Schwelle hebt.
    const beforeFirst = player.health;
    internals.damagePlayer(player, 45, null, 100_000);
    expect(beforeFirst - player.health).toBeCloseTo(45, 6);
    const charged = schildFor(game, id);
    expect(charged).toBeCloseTo(63, 6);
    expect(charged).toBeGreaterThan(DEFAULT_SCHILD.armorThreshold);

    // Zweiter Treffer: Jetzt steht der Schild über 60 – 18 % weniger Schaden,
    // und entsprechend weniger Ladung.
    const beforeSecond = player.health;
    internals.damagePlayer(player, 10, null, 100_000);
    const taken = 10 * (1 - DEFAULT_SCHILD.armorReduction);
    expect(beforeSecond - player.health).toBeCloseTo(taken, 6);
    expect(schildFor(game, id)).toBeCloseTo(charged + taken * DEFAULT_SCHILD.chargePerDamage, 6);
  });

  it('behandelt die Rüstungsschwelle als echte Untergrenze', () => {
    // „Über 60" ist strikt gemeint. Mit `chargePerDamage: 1` ist der Füllstand
    // gleich dem erlittenen Schaden – nur so lässt sich die Schwelle exakt
    // treffen, statt sie über Fließkommareste zu streifen.
    const config: SchildConfig = { ...DEFAULT_SCHILD, chargePerDamage: 1 };
    const { game, internals, id, player } = setup('bulwarker', true, config);

    internals.damagePlayer(player, config.armorThreshold, null, 100_000);
    expect(schildFor(game, id)).toBe(config.armorThreshold);

    // Genau auf der Schwelle: noch keine Minderung.
    const beforeOn = player.health;
    internals.damagePlayer(player, 5, null, 100_000);
    expect(beforeOn - player.health).toBeCloseTo(5, 6);

    // Einen Punkt darüber: die Rüstung greift.
    const beforeOver = player.health;
    internals.damagePlayer(player, 5, null, 100_000);
    expect(beforeOver - player.health).toBeCloseTo(5 * (1 - config.armorReduction), 6);
  });

  it('entlädt bei 100 sofort, deckelt die Ladung und steht danach auf 0', () => {
    const { game, internals, id, player } = setup();
    const { player: near } = addOther(game, internals, 'Nachbar', 'storm', NEAR);
    const nearHealth = near.health;

    // Ein Treffer weit über der Ladeschwelle: gedeckelt bei 100, zündet sofort.
    internals.damagePlayer(player, FULL_CHARGE_DAMAGE + 40, null, 100_000);
    expect(schildFor(game, id)).toBe(0);
    expect(player.signature).toBe(0);
    expect(nearHealth - near.health).toBeCloseTo(DEFAULT_SCHILD.dischargeDamage, 6);
  });

  it('trifft alle Gegner im Radius und keinen außerhalb', () => {
    const { game, internals, player } = setup('sanctum');
    const { player: near } = addOther(game, internals, 'Nah', 'storm', NEAR);
    const { player: far } = addOther(game, internals, 'Fern', 'storm', FAR);
    const nearHealth = near.health;
    const farHealth = far.health;

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    expect(nearHealth - near.health).toBeCloseTo(DEFAULT_SCHILD.dischargeDamage, 6);
    expect(far.health).toBe(farHealth);
    expect(far.velocity).toEqual({ x: 0, y: 0 });
  });

  it('stößt radial weg, mit linearem Abfall auf 0 am Radiusrand', () => {
    const { game, internals, player } = setup();
    // Halber Radius nach rechts, voller Radius minus eins nach oben: zwei
    // Punkte auf derselben Rampe, an denen der Abfall exakt nachrechenbar ist.
    const edge = { x: OPEN_GROUND.x, y: OPEN_GROUND.y - (DEFAULT_SCHILD.dischargeRadius - 24) };
    expect(isFree(edge, 40)).toBe(true);
    const { player: near } = addOther(game, internals, 'Nah', 'storm', NEAR);
    const { player: rim } = addOther(game, internals, 'Rand', 'storm', edge);

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);

    // Auf halbem Radius die halbe Wucht, exakt radial nach außen.
    expect(near.velocity.x).toBeCloseTo(DEFAULT_SCHILD.dischargeImpulse * 0.5, 6);
    expect(near.velocity.y).toBeCloseTo(0, 6);
    // Kurz vor dem Rand bleibt fast nichts übrig – und die Richtung stimmt.
    const rimFalloff = 1 - (DEFAULT_SCHILD.dischargeRadius - 24) / DEFAULT_SCHILD.dischargeRadius;
    expect(rim.velocity.y).toBeCloseTo(-DEFAULT_SCHILD.dischargeImpulse * rimFalloff, 6);
    expect(rim.velocity.x).toBeCloseTo(0, 6);
    expect(Math.abs(rim.velocity.y)).toBeLessThan(Math.abs(near.velocity.x));
  });

  it('verschont Tote, Unverwundbare und den Träger selbst', () => {
    const { game, internals, player } = setup();
    const { player: dead } = addOther(game, internals, 'Toter', 'storm', NEAR);
    const { player: safe } = addOther(game, internals, 'Geschützt', 'storm', { x: OPEN_GROUND.x, y: OPEN_GROUND.y + 100 });
    dead.dead = true;
    dead.health = 0;
    safe.invulnerable = true;

    const ownHealthBefore = player.health;
    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);

    expect(dead.health).toBe(0);
    expect(dead.velocity).toEqual({ x: 0, y: 0 });
    expect(safe.health).toBe(safe.maxHealth);
    expect(safe.velocity).toEqual({ x: 0, y: 0 });
    // Der Träger nimmt nur den auslösenden Treffer, nicht die eigene Entladung.
    expect(ownHealthBefore - player.health).toBeCloseTo(FULL_CHARGE_DAMAGE, 6);
  });

  it('schreibt Kills der Entladung dem Aegis gut', () => {
    const { game, internals, player } = setup();
    const { player: near } = addOther(game, internals, 'Opfer', 'storm', NEAR);
    near.health = 10;

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    expect(near.dead).toBe(true);
    expect(near.killerName).toBe(player.name);
    expect(player.kills).toBe(1);
    expect(player.streak).toBe(1);
    // Der Stoß liegt VOR dem Schaden – ein Toter segelt trotzdem nicht davon,
    // weil `killPlayer` seine Geschwindigkeit nullt.
    expect(near.velocity).toEqual({ x: 0, y: 0 });
  });

  it('lädt fremde Aegis-Schilde, zündet sie aber nicht in derselben Kette', () => {
    const { game, internals, id: aId, player: a } = setup();
    const { id: bId, player: b } = addOther(game, internals, 'Zweiter Tank', 'aegis', NEAR);

    // B fast voll vorladen, damit die Entladung von A ihn über den Deckel hebt.
    internals.damagePlayer(b, 95 / DEFAULT_SCHILD.chargePerDamage, null, 100_000);
    expect(schildFor(game, bId)).toBeCloseTo(95, 6);
    const aHealthBefore = a.health - FULL_CHARGE_DAMAGE;

    // A zündet. B nimmt den Schaden (mit eigener Rüstung) und steht danach auf
    // 100 – aber A bekommt in diesem Aufruf nichts zurück.
    internals.damagePlayer(a, FULL_CHARGE_DAMAGE, null, 100_000);
    expect(schildFor(game, aId)).toBe(0);
    expect(schildFor(game, bId)).toBe(SIGNATURE_MAX);
    expect(a.health).toBeCloseTo(aHealthBefore, 6);

    // Erst der nächste Tick von B löst die zweite Entladung aus – aus der
    // Endlosschleife wird ein Schlagabtausch.
    b.velocity = { x: 0, y: 0 };
    b.position = { ...NEAR };
    internals.stepPlayer(b, DT, 100_100);
    expect(schildFor(game, bId)).toBe(0);
    expect(aHealthBefore - a.health).toBeCloseTo(DEFAULT_SCHILD.dischargeDamage, 6);
    expect(schildFor(game, aId))
      .toBeCloseTo(DEFAULT_SCHILD.dischargeDamage * DEFAULT_SCHILD.chargePerDamage, 6);
  });

  it('bleibt bei zwei Tanks nebeneinander in endlicher Zeit stehen', () => {
    // Der harte Fall aus der Vorgabe: zwei Aegis in Reichweite. Ohne
    // Reentrancy-Schutz würde sich das gegenseitig hochschaukeln.
    const { game, internals, id: aId, player: a } = setup();
    const { id: bId, player: b } = addOther(game, internals, 'Zweiter Tank', 'aegis', NEAR);
    internals.damagePlayer(b, 95 / DEFAULT_SCHILD.chargePerDamage, null, 100_000);
    internals.damagePlayer(a, FULL_CHARGE_DAMAGE, null, 100_000);

    let now = 100_000;
    for (let tick = 0; tick < 200; tick += 1) {
      now += DT * 1000;
      for (const player of [a, b]) {
        player.velocity = { x: 0, y: 0 };
        internals.stepPlayer(player, DT, now);
        player.position = player === a ? { ...OPEN_GROUND } : { ...NEAR };
      }
      if (a.dead || b.dead) break;
    }
    // Der Test kommt überhaupt hier an – kein Stapelüberlauf, keine Endlosfolge.
    // Und beide Schilde stehen unter dem Deckel: Ein voller Schild bleibt nie
    // liegen, er zündet spätestens im nächsten Tick.
    expect(schildFor(game, aId)).toBeLessThan(SIGNATURE_MAX);
    expect(schildFor(game, bId)).toBeLessThan(SIGNATURE_MAX);
  });

  it('lässt Klassen außerhalb der Aegis-Familie unberührt', () => {
    const { game, internals, id, player } = setup('juggernaut');
    const { player: near } = addOther(game, internals, 'Nachbar', 'storm', NEAR);
    const nearHealth = near.health;
    const before = player.health;

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE + 40, null, 100_000);
    // Voller Schaden, kein Schild, keine Entladung.
    expect(before - player.health).toBeCloseTo(FULL_CHARGE_DAMAGE + 40, 6);
    expect(schildFor(game, id)).toBe(0);
    expect(near.health).toBe(nearHealth);
    internals.stepPlayer(player, DT, 100_100);
    expect(player.signature).toBeUndefined();
  });

  it('setzt den Schild beim Tod zurück', () => {
    const { game, internals, id, player } = setup('reflector');
    internals.damagePlayer(player, 40, null, 100_000);
    expect(schildFor(game, id)).toBeCloseTo(56, 6);

    // Der tödliche Treffer lädt nichts mehr und lässt keinen Rest stehen.
    internals.damagePlayer(player, player.health + 10, null, 100_100);
    expect(player.dead).toBe(true);
    expect(player.signature).toBe(0);
    expect(schildFor(game, id)).toBe(0);

    // Und der Wiedereinstieg beginnt bei null.
    configure(player, 'reflector', OPEN_GROUND);
    player.dead = false;
    internals.damagePlayer(player, 10, null, 100_200);
    expect(schildFor(game, id)).toBeCloseTo(10 * DEFAULT_SCHILD.chargePerDamage, 6);
  });

  it('räumt das Feld, wenn ein Spieler die Familie verlässt', () => {
    const { game, internals, id, player } = setup();
    internals.damagePlayer(player, 20, null, 100_000);
    expect(player.signature).toBe(28);

    // Der Respawn auf niedrigem Level macht aus dem Aegis wieder einen Core.
    player.playerClass = 'core';
    internals.stepPlayer(player, DT, 100_100);
    expect(player.signature).toBeUndefined();
    expect(schildFor(game, id)).toBe(0);
  });

  it('räumt den Eintrag, wenn der Spieler das Spiel verlässt', () => {
    const { game, internals, id, player } = setup();
    internals.damagePlayer(player, 20, null, 100_000);
    expect(schildFor(game, id)).toBeGreaterThan(0);

    game.removePlayer(id);
    expect(schildFor(game, id)).toBe(0);
    expect(internals.players.has(id)).toBe(false);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const { game, internals, id, player } = setup('aegis', false);
    const { player: near } = addOther(game, internals, 'Nachbar', 'storm', NEAR);
    const nearHealth = near.health;
    const before = player.health;

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE + 40, null, 100_000);
    internals.stepPlayer(player, DT, 100_100);

    // Kein Feld, nirgends …
    expect(player.signature).toBeUndefined();
    expect(schildFor(game, id)).toBe(0);
    expect(game.snapshot(id).players.find((entry) => entry.id === id)?.signature).toBeUndefined();
    // … kein geminderter Schaden und keine Entladung.
    expect(before - player.health).toBeCloseTo(FULL_CHARGE_DAMAGE + 40, 6);
    expect(near.health).toBe(nearHealth);
    expect(near.velocity).toEqual({ x: 0, y: 0 });
  });

  it('trägt den gerundeten Wert in den Snapshot und respektiert die Konfiguration', () => {
    // 1,1 statt 1,4 erzeugt absichtlich krumme Füllstände – nur so ist die
    // Rundung im Snapshot von einer Kopie des Rohwerts unterscheidbar.
    const config: SchildConfig = { ...DEFAULT_SCHILD, chargePerDamage: 1.1 };
    const { game, internals, id, player } = setup('retributor', true, config);
    internals.damagePlayer(player, 23, null, 100_000);
    expect(schildFor(game, id)).toBeCloseTo(25.3, 6);

    const entry = game.snapshot(id).players.find((candidate) => candidate.id === id);
    expect(entry?.signature).toBe(Math.round(schildFor(game, id)));
    expect(Number.isInteger(entry?.signature)).toBe(true);
    expect(entry!.signature).toBe(25);
    expect(entry!.signature).toBeLessThan(SIGNATURE_MAX);
  });
});

/**
 * Der Schild lud aus dem Wert VOR dem Wucht-Aufschlag.
 *
 * `tuneImpactSignature` haengt INNERHALB von Aegis (index.ts) und
 * multipliziert den Kontaktschaden noch einmal mit der Wucht des Rammenden.
 * Aegis reichte `taken` nach innen und lud mit demselben `taken` -- den
 * Aufschlag sah es nie. Ausgerechnet gegen die eine Familie, deren ganzes
 * Spiel das Rammen ist, fuellte sich der Schild also am langsamsten, wenn er
 * am meisten einsteckte.
 *
 * Der Test misst deshalb VERLORENES LEBEN gegen GELADENEN SCHILD -- die
 * einzige Groesse, die jeden Aufschlag jeder Schicht darunter kennt.
 */
describe('aegis signature – Ladung gegen den Rammstoss', () => {
  const rammen = (wucht: number) => {
    const game = tuneAegisSignature(
      tuneImpactSignature(tuneCombatScaling(new MazeGame(0)), true),
      true
    );
    const internals = game as unknown as Internals;
    internals.shapes.clear();
    const schildId = game.addPlayer('Schild');
    const rammerId = game.addPlayer('Rammer');
    const schildTank = internals.players.get(schildId);
    const rammer = internals.players.get(rammerId);
    configure(schildTank, 'aegis', OPEN_GROUND);
    configure(rammer, 'rammer', { x: OPEN_GROUND.x + GAME.playerRadius, y: OPEN_GROUND.y });
    (rammer as { level: number }).level = 40;
    (schildTank as { level: number }).level = 40;

    const now = Date.now();
    // Wucht von aussen setzen, damit die Messung nicht von der Anfahrt abhaengt.
    signatureStateFor(game, 'impact').set(rammerId, wucht);
    rammer.signature = wucht;
    expect(wuchtFor(game, rammerId)).toBe(wucht);
    const lebenVorher = schildTank.health;
    game.step(1 / 40, now);
    return {
      verloren: lebenVorher - schildTank.health,
      geladen: schildFor(game, schildId)
    };
  };

  it('laedt im selben Verhaeltnis, egal wie hart der Stoss war', () => {
    const ohne = rammen(0);
    const voll = rammen(100);
    expect(ohne.verloren).toBeGreaterThan(0);
    // Der Stoss mit voller Wucht tut deutlich mehr weh -- sonst misst der Test
    // gar keinen Aufschlag und waere gruen, ohne etwas geprueft zu haben.
    expect(voll.verloren).toBeGreaterThan(ohne.verloren * 1.3);
    // Und genau deshalb muss er auch mehr laden.
    expect(voll.geladen).toBeGreaterThan(ohne.geladen * 1.3);
    // Dasselbe Verhaeltnis Schild je verlorenem Leben, in beiden Faellen.
    expect(voll.geladen / voll.verloren).toBeCloseTo(ohne.geladen / ohne.verloren, 4);
  });
});

describe('aegis signature – Entladung im Snapshot (Befund 7)', () => {
  it('legt jede Entladung mit Ort, Radius und Träger dem Snapshot bei', () => {
    const { game, internals, id, player } = setup();
    const { id: nearId } = addOther(game, internals, 'Zeuge', 'storm', NEAR);

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    const bursts = (game.snapshot(nearId, 100_100) as any).dischargeBursts;
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({
      x: OPEN_GROUND.x,
      y: OPEN_GROUND.y,
      radius: DEFAULT_SCHILD.dischargeRadius,
      ownerId: id
    });
    expect(bursts[0].id).toBeGreaterThan(0);
  });

  it('liegt binnen der Sekunde jedem Snapshot bei und verfällt danach', () => {
    const { game, internals, player } = setup();
    const { id: nearId } = addOther(game, internals, 'Zeuge', 'storm', NEAR);

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    const erster = (game.snapshot(nearId, 100_100) as any).dischargeBursts;
    const zweiter = (game.snapshot(nearId, 100_900) as any).dischargeBursts;
    // Gleiche Id in beiden Lieferungen – der Client spielt sie genau einmal.
    expect(zweiter).toEqual(erster);
    expect((game.snapshot(nearId, 101_100) as any).dischargeBursts).toBeUndefined();
  });

  it('erreicht nur Betrachter, in deren Sichtfeld die Entladung ragt', () => {
    const { game, internals, player } = setup();
    // Jenseits von Sichtradius + Wirkradius: kein Pixel der Entladung im Bild.
    const fern = { x: OPEN_GROUND.x + GAME.viewRadius + DEFAULT_SCHILD.dischargeRadius + 60, y: OPEN_GROUND.y };
    const { id: nearId } = addOther(game, internals, 'Nah', 'storm', NEAR);
    const { id: fernId } = addOther(game, internals, 'Fern', 'storm', fern);

    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    expect((game.snapshot(nearId, 100_100) as any).dischargeBursts).toHaveLength(1);
    expect((game.snapshot(fernId, 100_100) as any).dischargeBursts).toBeUndefined();
  });

  it('lässt den Snapshot ohne Flag unangetastet', () => {
    const { game, internals, id, player } = setup('aegis', false);
    internals.damagePlayer(player, FULL_CHARGE_DAMAGE, null, 100_000);
    expect((game.snapshot(id, 100_100) as any).dischargeBursts).toBeUndefined();
  });
});
