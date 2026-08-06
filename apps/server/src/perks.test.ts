import { describe, expect, it } from 'vitest';
import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { perkFor, type PerkEffect } from '@project-maze/shared/perks';
import { tuneCombatScaling, tunedStatsFor } from './combat-tuning';
import { MazeGame } from './game';
import { SPLITTER_SHARD_LIFE, tunePerks } from './perks';
import { isFree } from './world';

const DT = 0.025;
/**
 * Nachweislich freie Messpunkte (der Annahmen-Test belegt jeden einzelnen).
 * Alle weit genug auseinander, dass keine ungewollten Rempler entstehen.
 */
const TRAEGER = { x: 2800, y: 2200 };
const GEGNER = { x: 2400, y: 2200 };
const KONTROLLE = { x: 2400, y: 2600 };
const ABSEITS = { x: 500, y: 500 };
/** Direkt am Träger – für gewollte Rempler. */
const RAMMPUNKT = { x: 2810, y: 2200 };

interface Internals {
  players: Map<string, any>;
  shapes: Map<string, any>;
  projectiles: Map<string, any>;
  drones: Map<string, any>;
  damagePlayer(target: any, damage: number, attackerId: string | null, now: number): void;
}

/** Perk-Wirkung einer Klasse, typsicher – schlägt fehl, wenn die Daten driften. */
const effectOf = <K extends PerkEffect['kind']>(playerClass: PlayerClass, kind: K): Extract<PerkEffect, { kind: K }> => {
  const effect = perkFor(playerClass)?.effect;
  if (!effect || effect.kind !== kind) throw new Error(`${playerClass} trägt nicht ${kind}`);
  return effect as Extract<PerkEffect, { kind: K }>;
};

/** Macht aus einem frisch gespawnten Spieler einen kampfbereiten Testfall. */
const configure = (player: any, playerClass: PlayerClass, position: { x: number; y: number }): void => {
  player.playerClass = playerClass;
  player.level = 45;
  player.position = { ...position };
  player.velocity = { x: 0, y: 0 };
  player.invulnerable = false;
  player.invulnerableUntil = 0;
  // Feste Uhr statt Date.now(): Die Tests rechnen mit synthetischen Zeiten ab
  // 100 000 ms – eine echte Wanduhr würde jede Ruhe-Messung unvorhersehbar machen.
  player.lastDamageAt = 0;
  player.maxHealth = tunedStatsFor(player).maxHealth;
  player.health = player.maxHealth;
};

const setup = (playerClass: PlayerClass, enabled = true) => {
  const game = tunePerks(tuneCombatScaling(new MazeGame(0)), enabled);
  const internals = game as unknown as Internals;
  // Formen spawnen zufällig und machen Körperkontakt-Schaden – eine Form am
  // Messpunkt würde jede Schadensmessung verfälschen. Also weg damit; im
  // echten Betrieb wachsen sie nach, hier bleibt die Arena leer.
  internals.shapes.clear();
  const id = game.addPlayer('Träger');
  const player = internals.players.get(id);
  configure(player, playerClass, TRAEGER);
  return { game, internals, id, player };
};

/** Weiterer Spieler im selben Spiel, fertig konfiguriert. */
const join = (game: MazeGame, internals: Internals, playerClass: PlayerClass, position: { x: number; y: number }) => {
  const id = game.addPlayer('Mitspieler');
  const player = internals.players.get(id);
  configure(player, playerClass, position);
  return { id, player };
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

/**
 * Ein Mess-Tick für Tempo-Vergleiche: Alle Kandidaten starten mit identischem
 * Tempo an ihrem Platz, dann ein Step. Weil das Original beide identisch
 * abbremst, ist jeder verbleibende Unterschied exakt der Perk-Faktor.
 */
const speedsAfterTick = (
  game: MazeGame,
  entries: ReadonlyArray<readonly [any, { x: number; y: number }]>,
  now: number
): number[] => {
  for (const [player, at] of entries) {
    player.position = { ...at };
    player.velocity = { x: 100, y: 0 };
    player.move = { x: 0, y: 0 };
    player.primary = false;
  }
  game.step(DT, now);
  return entries.map(([player]) => Math.hypot(player.velocity.x, player.velocity.y));
};

/** Kontaktschaden je Tick, wie ihn `resolvePlayerCollisions` des Kerns rechnet. */
const contactDamage = (attacker: PlayerClass): number => CLASS_DEFINITIONS[attacker].bodyDamage * 0.08;

describe('perks – klassen 4.0, welle B', () => {
  it('setzt Testannahmen: freie Messpunkte und die erwarteten Perk-Daten', () => {
    // Jede hier benutzte Position muss frei sein, sonst messen die Tests
    // Wandkollisionen statt Perks.
    expect(isFree(TRAEGER, 40)).toBe(true);
    expect(isFree(GEGNER, 40)).toBe(true);
    expect(isFree(KONTROLLE, 40)).toBe(true);
    expect(isFree(ABSEITS, 40)).toBe(true);
    expect(isFree(RAMMPUNKT, 22)).toBe(true);
    // Flugbahn der Testschüsse (nach rechts) und die Ricochet-Startpunkte.
    expect(isFree({ x: TRAEGER.x + 150, y: TRAEGER.y }, 12)).toBe(true);
    expect(isFree({ x: 150, y: 2200 }, 6)).toBe(true);
    expect(isFree({ x: 150, y: 2600 }, 6)).toBe(true);
    expect(isFree({ x: 2800, y: 2600 }, 6)).toBe(true);
    expect(isFree({ x: 2460, y: 2200 }, 14)).toBe(true);
    // Die Mechanik-Zuordnung der Testklassen – driftet `PERKS`, soll es HIER
    // knallen und nicht kryptisch in einem Wirk-Test.
    expect(perkFor('twin')?.effect.kind).toBe('doubleSalvo');
    expect(perkFor('railgun')?.effect.kind).toBe('overcharge');
    expect(perkFor('eclipse')?.effect.kind).toBe('frostShot');
    expect(perkFor('flanker')?.effect.kind).toBe('adrenaline');
    expect(perkFor('hunter')?.effect.kind).toBe('killHeal');
    expect(perkFor('octo')?.effect.kind).toBe('thorns');
    expect(perkFor('bulwark')?.effect.kind).toBe('thorns');
    expect(perkFor('phantom')?.effect.kind).toBe('shieldRing');
    expect(perkFor('storm')?.effect.kind).toBe('ricochet');
    expect(perkFor('vortex')?.effect.kind).toBe('splitter');
    expect(perkFor('factory')?.effect.kind).toBe('droneNova');
    expect(perkFor('crusher')?.effect.kind).toBe('contactSlow');
    expect(perkFor('juggernaut')?.effect.kind).toBe('contactArmor');
    expect(perkFor('fortress')?.effect.kind).toBe('standingRegen');
    expect(perkFor('shade')?.effect.kind).toBe('executioner');
    expect(perkFor('scorch')?.effect.kind).toBe('burn');
    // Starter und Core tragen bewusst keinen Perk.
    expect(perkFor('core')).toBeNull();
    expect(perkFor('rapid')).toBeNull();
    expect(perkFor('specter')).toBeNull();
  });

  it('doubleSalvo: jede n-te Salve feuert genau doppelt, der Rhythmus läuft weiter', () => {
    const { game, internals, id, player } = setup('twin');
    const { every } = effectOf('twin', 'doubleSalvo');
    const barrels = CLASS_DEFINITIONS.twin.barrelCount;

    let now = 100_000;
    // Zwei volle Runden: Der Zusatzschuss darf den Zähler nicht mitzählen,
    // sonst käme die zweite Doppelsalve zu früh.
    for (let round = 0; round < 2; round += 1) {
      for (let shot = 1; shot <= every; shot += 1) {
        internals.projectiles.clear();
        now = fireOnce(game, player, now);
        expect(salvoDamages(internals, id)).toHaveLength(shot === every ? barrels * 2 : barrels);
      }
    }
  });

  it('doubleSalvo: der Tod setzt den Salven-Zähler zurück', () => {
    const { game, internals, id, player } = setup('twin');
    const { every } = effectOf('twin', 'doubleSalvo');
    const barrels = CLASS_DEFINITIONS.twin.barrelCount;

    let now = 100_000;
    // Bis kurz vor die Doppelsalve schießen …
    for (let shot = 1; shot < every; shot += 1) now = fireOnce(game, player, now);
    // … dann sterben. Ohne Reset wäre der NÄCHSTE Schuss die Doppelsalve.
    internals.damagePlayer(player, 100_000, null, now);
    expect(player.dead).toBe(true);
    configure(player, 'twin', TRAEGER);
    player.dead = false;

    internals.projectiles.clear();
    now = fireOnce(game, player, now);
    expect(salvoDamages(internals, id)).toHaveLength(barrels);
    // Und der neue Rhythmus zählt wieder ab eins.
    for (let shot = 2; shot <= every; shot += 1) {
      internals.projectiles.clear();
      now = fireOnce(game, player, now);
      expect(salvoDamages(internals, id)).toHaveLength(shot === every ? barrels * 2 : barrels);
    }
  });

  it('overcharge: volle Salven tragen den Bonus, angeschlagene nicht', () => {
    const { game, internals, id, player } = setup('railgun');
    const { bonus } = effectOf('railgun', 'overcharge');
    const plain = tunedStatsFor(player).damage;

    // Voll aufgeladen: der Schuss trägt ×(1+bonus).
    internals.projectiles.clear();
    let now = fireOnce(game, player, 100_000);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain * (1 + bonus), 6);

    // Knapp unter voll zählt noch als voll: Regeneration arbeitet in
    // Tick-Bruchteilen, exakt maxHealth wäre eine unerreichbare Schwelle.
    player.health = player.maxHealth - 0.4;
    internals.projectiles.clear();
    now = fireOnce(game, player, now);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain * (1 + bonus), 6);

    // Spürbar angeschlagen: kein Bonus.
    player.health = player.maxHealth - 5;
    internals.projectiles.clear();
    fireOnce(game, player, now);
    expect(salvoDamages(internals, id)[0]).toBeCloseTo(plain, 6);
  });

  it('frostShot: Projektiltreffer dämpfen das Ziel, neuer Treffer stellt nur die Uhr neu', () => {
    const { game, internals, id } = setup('eclipse');
    const frost = effectOf('eclipse', 'frostShot');
    const { player: victim } = join(game, internals, 'core', GEGNER);
    const { player: control } = join(game, internals, 'core', KONTROLLE);

    const t0 = 100_000;
    internals.damagePlayer(victim, 5, id, t0);
    // Beide starten identisch; der Unterschied nach einem Step ist exakt der Faktor.
    const [slowed, free] = speedsAfterTick(game, [[victim, GEGNER], [control, KONTROLLE]], t0 + 25);
    expect(slowed).toBeCloseTo(free! * (1 - frost.slow), 6);

    // Zweiter Treffer bei t0+500: Der Slow stapelt nicht, aber die Uhr läuft
    // neu – deutlich nach dem Ablauf des ERSTEN Treffers ist er noch da …
    internals.damagePlayer(victim, 5, id, t0 + 500);
    const later = t0 + 500 + frost.seconds * 1000 - 200;
    const [slowed2, free2] = speedsAfterTick(game, [[victim, GEGNER], [control, KONTROLLE]], later);
    expect(slowed2).toBeCloseTo(free2! * (1 - frost.slow), 6);

    // … und nach der neuen Uhr ist er weg: identische Physik für beide.
    const expired = t0 + 500 + frost.seconds * 1000 + 100;
    const [slowed3, free3] = speedsAfterTick(game, [[victim, GEGNER], [control, KONTROLLE]], expired);
    expect(slowed3).toBeCloseTo(free3!, 6);
  });

  it('adrenaline: ein Kill beschleunigt befristet, der eigene Tod löscht den Boost', () => {
    const { game, internals, id, player } = setup('flanker');
    const boost = effectOf('flanker', 'adrenaline');
    const { player: control } = join(game, internals, 'flanker', KONTROLLE);
    const { player: victim } = join(game, internals, 'core', GEGNER);

    const t0 = 100_000;
    victim.health = 5;
    internals.damagePlayer(victim, 500, id, t0);
    expect(victim.dead).toBe(true);

    // Träger und Kontroll-Flanker teilen Klasse und damit Bremsverhalten –
    // der Restunterschied ist exakt der Boost-Faktor.
    const [boosted, plain] = speedsAfterTick(game, [[player, TRAEGER], [control, KONTROLLE]], t0 + 25);
    expect(boosted).toBeCloseTo(plain! * (1 + boost.bonus), 6);

    // Nach Ablauf: gleiches Tempo.
    const expired = t0 + boost.seconds * 1000 + 100;
    const [after, plainAfter] = speedsAfterTick(game, [[player, TRAEGER], [control, KONTROLLE]], expired);
    expect(after).toBeCloseTo(plainAfter!, 6);

    // Reset bei Tod: frischer Kill, dann stirbt der Träger selbst – sein
    // Respawn darf den halben Boost nicht erben.
    const t1 = t0 + 5_000;
    const { player: victim2 } = join(game, internals, 'core', GEGNER);
    victim2.health = 5;
    internals.damagePlayer(victim2, 500, id, t1);
    internals.damagePlayer(player, 100_000, null, t1);
    expect(player.dead).toBe(true);
    configure(player, 'flanker', TRAEGER);
    player.dead = false;
    const [revived, plainRevived] = speedsAfterTick(game, [[player, TRAEGER], [control, KONTROLLE]], t1 + 25);
    expect(revived).toBeCloseTo(plainRevived!, 6);
  });

  it('killHeal: ein Kill heilt anteilig und deckelt bei maxHealth', () => {
    const { game, internals, id, player } = setup('hunter');
    const { share } = effectOf('hunter', 'killHeal');
    const { player: victim } = join(game, internals, 'core', GEGNER);

    victim.health = 5;
    player.health = player.maxHealth * 0.5;
    internals.damagePlayer(victim, 500, id, 100_000);
    expect(player.health).toBeCloseTo(player.maxHealth * (0.5 + share), 6);

    // Deckel: Fast voll + Heilanteil > Maximum bleibt exakt Maximum.
    const { player: victim2 } = join(game, internals, 'core', KONTROLLE);
    victim2.health = 5;
    player.health = player.maxHealth - 1;
    internals.damagePlayer(victim2, 500, id, 100_100);
    expect(player.health).toBe(player.maxHealth);
  });

  it('thorns: der Rempler zahlt anteilig zurück, Reflexion reflektiert nie erneut', () => {
    const { game, internals, player } = setup('octo');
    const { share } = effectOf('octo', 'thorns');
    const { player: rammer } = join(game, internals, 'storm', RAMMPUNKT);

    game.step(DT, 100_025);
    // Der Träger erleidet den normalen Kontaktschaden des Storms …
    expect(player.maxHealth - player.health).toBeCloseTo(contactDamage('storm'), 6);
    // … der Storm seinen normalen Kontakt PLUS den reflektierten Anteil.
    expect(rammer.maxHealth - rammer.health)
      .toBeCloseTo(contactDamage('octo') + share * contactDamage('storm'), 6);

    // Zwei Dornen-Träger gegeneinander: je genau EINE Reflexion, kein
    // Ping-Pong – die Summen sind exakt einstufig.
    const second = setup('octo');
    const octoShare = share;
    const bulwarkShare = effectOf('bulwark', 'thorns').share;
    const { player: bulwark } = join(second.game, second.internals, 'bulwark', RAMMPUNKT);
    second.game.step(DT, 100_025);
    expect(second.player.maxHealth - second.player.health)
      .toBeCloseTo(contactDamage('bulwark') + bulwarkShare * contactDamage('octo'), 6);
    expect(bulwark.maxHealth - bulwark.health)
      .toBeCloseTo(contactDamage('octo') + octoShare * contactDamage('bulwark'), 6);
  });

  it('shieldRing: nach ruhiger Phase schluckt der Schild genau einen Treffer', () => {
    const { game: _game, internals, player } = setup('phantom');
    const { quietSeconds } = effectOf('phantom', 'shieldRing');
    const full = player.health;

    // Lange Ruhe (lastDamageAt = 0, jetzt = 100 s): Der Schild steht.
    const t0 = 100_000;
    internals.damagePlayer(player, 20, null, t0);
    expect(player.health).toBe(full);
    // Der Schildverbrauch stellt die Ruhe-Uhr neu …
    expect(player.lastDamageAt).toBe(t0);

    // … also trifft der direkte Nachschlag voll.
    internals.damagePlayer(player, 20, null, t0 + 100);
    expect(full - player.health).toBeCloseTo(20, 6);

    // Nach einer weiteren vollen Ruhephase lädt der Schild erneut.
    internals.damagePlayer(player, 20, null, t0 + 100 + quietSeconds * 1000);
    expect(full - player.health).toBeCloseTo(20, 6);
  });

  it('ricochet: prallt am Weltrand ab statt zu sterben – legitime Tode bleiben Tode', () => {
    const { game, internals, id } = setup('storm');
    const { player: other, id: otherId } = join(game, internals, 'core', KONTROLLE);
    expect(other.dead).toBe(false);

    // Drei handgebaute Projektile: eines mit Perk-Besitzer Richtung Weltrand,
    // eines ohne Perk auf gleicher Bahn, eines mit Perk, aber ablaufender
    // Lebenszeit im freien Feld.
    const projectile = (pid: string, ownerId: string, position: { x: number; y: number }, velocity: { x: number; y: number }, life: number) =>
      internals.projectiles.set(pid, {
        id: pid, ownerId, position: { ...position }, velocity: { ...velocity },
        radius: 6, integrity: 20, maxIntegrity: 20, damage: 5, life
      });
    projectile('mit-perk', id, { x: 150, y: 2200 }, { x: -400, y: 0 }, 5);
    projectile('ohne-perk', otherId, { x: 150, y: 2600 }, { x: -400, y: 0 }, 5);
    projectile('lebenszeit', id, { x: 2800, y: 2600 }, { x: 50, y: 0 }, 0.05);

    let now = 100_000;
    for (let tick = 0; tick < 30; tick += 1) {
      now += DT * 1000;
      game.step(DT, now);
    }

    // Der Perk-Schuss lebt und fliegt exakt gespiegelt zurück.
    const bounced = internals.projectiles.get('mit-perk');
    expect(bounced).toBeDefined();
    expect(bounced.velocity.x).toBe(400);
    expect(bounced.velocity.y).toBe(0);
    // Ohne Perk stirbt derselbe Flug am Rand; abgelaufene Lebenszeit wird
    // auch beim Träger nicht wiederbelebt.
    expect(internals.projectiles.has('ohne-perk')).toBe(false);
    expect(internals.projectiles.has('lebenszeit')).toBe(false);
  });

  it('splitter: nur ein Projektil-Kill zerlegt sich in Splitter am Zielort', () => {
    const { game, internals, id, player } = setup('vortex');
    const { shards, damageShare } = effectOf('vortex', 'splitter');
    const { player: victim } = join(game, internals, 'core', GEGNER);

    victim.health = 10;
    internals.projectiles.clear();
    internals.damagePlayer(victim, 50, id, 100_000);
    expect(victim.dead).toBe(true);

    const spawned = [...internals.projectiles.values()];
    expect(spawned).toHaveLength(shards);
    let sumX = 0;
    let sumY = 0;
    for (const shard of spawned) {
      expect(shard.ownerId).toBe(id);
      expect(shard.damage).toBeCloseTo(50 * damageShare, 6);
      expect(shard.life).toBe(SPLITTER_SHARD_LIFE);
      expect(shard.position.x).toBe(GEGNER.x);
      expect(shard.position.y).toBe(GEGNER.y);
      sumX += shard.velocity.x;
      sumY += shard.velocity.y;
    }
    // Gleichmäßig im Kreis: Die Richtungsvektoren heben sich auf.
    expect(sumX).toBeCloseTo(0, 6);
    expect(sumY).toBeCloseTo(0, 6);

    // Ein Kontakt-Kill splittert NICHT: Der Perk gehört dem Projektil.
    const { player: victim2 } = join(game, internals, 'core', RAMMPUNKT);
    victim2.health = 0.4; // stirbt sicher am ersten Kontakt-Tick des Vortex
    internals.projectiles.clear();
    game.step(DT, 100_025);
    expect(victim2.dead).toBe(true);
    expect([...internals.projectiles.values()].filter((shard) => shard.ownerId === player.id)).toHaveLength(0);
  });

  it('droneNova: eine an Schaden sterbende Drohne verletzt Gegner im Radius', () => {
    const { game, internals, id } = setup('factory');
    const nova = effectOf('factory', 'droneNova');
    const { player: near } = join(game, internals, 'core', GEGNER);
    const { player: far } = join(game, internals, 'core', KONTROLLE);

    // Drohne mit aufgebrauchtem Leben nahe am Gegner (60 < radius), aber
    // außerhalb der Kontakt-Reichweite: Der Original-Step löscht sie am Ende
    // des Ticks – genau der Todespfad, den die Schicht erkennen muss.
    internals.drones.set('nova-drohne', {
      id: 'nova-drohne', ownerId: id, position: { x: 2460, y: 2200 }, velocity: { x: 0, y: 0 },
      angle: 0, health: 0, maxHealth: 40, slot: 9, contactCooldown: 0
    });
    game.step(DT, 100_025);

    expect(internals.drones.has('nova-drohne')).toBe(false);
    // Im Radius: exakt der Nova-Schaden, sonst nichts (kein Kontakt, keine Formen).
    expect(near.maxHealth - near.health).toBeCloseTo(nova.damage, 6);
    // Außerhalb (Abstand ~400): unberührt.
    expect(far.health).toBe(far.maxHealth);
  });

  it('contactSlow: der Rammstoß des Trägers dämpft das Ziel befristet', () => {
    const { game, internals, player } = setup('crusher');
    const slow = effectOf('crusher', 'contactSlow');
    const { player: victim } = join(game, internals, 'core', RAMMPUNKT);
    const { player: control } = join(game, internals, 'core', KONTROLLE);

    // Ein Tick Kontakt registriert den Slow (und macht normalen Kontaktschaden).
    const t0 = 100_025;
    game.step(DT, t0);
    expect(victim.maxHealth - victim.health).toBeCloseTo(contactDamage('crusher'), 6);

    // Träger aus dem Weg: Die Messung soll reine Bewegung sein, kein Gerempel.
    player.position = { ...ABSEITS };
    player.velocity = { x: 0, y: 0 };

    const [slowed, free] = speedsAfterTick(game, [[victim, GEGNER], [control, KONTROLLE]], t0 + 25);
    expect(slowed).toBeCloseTo(free! * (1 - slow.slow), 6);

    // Nach Ablauf der Uhr: gleiche Physik.
    const expired = t0 + slow.seconds * 1000 + 100;
    const [after, freeAfter] = speedsAfterTick(game, [[victim, GEGNER], [control, KONTROLLE]], expired);
    expect(after).toBeCloseTo(freeAfter!, 6);
  });

  it('contactArmor: der Träger erleidet reduzierten Kontaktschaden, teilt aber vollen aus', () => {
    const { game, internals, player } = setup('juggernaut');
    const { reduction } = effectOf('juggernaut', 'contactArmor');
    const { player: rammer } = join(game, internals, 'storm', RAMMPUNKT);

    game.step(DT, 100_025);
    expect(player.maxHealth - player.health).toBeCloseTo(contactDamage('storm') * (1 - reduction), 6);
    // Die Rüstung ist kein Angriffs-Nerf: Der Gegner zahlt den vollen Preis.
    expect(rammer.maxHealth - rammer.health).toBeCloseTo(contactDamage('juggernaut'), 6);
  });

  it('standingRegen: im Stillstand kommt exakt der Zuschlag obendrauf', () => {
    const { game, internals, player } = setup('fortress');
    const { multiplier } = effectOf('fortress', 'standingRegen');
    const { player: mover } = join(game, internals, 'fortress', KONTROLLE);
    const stats = tunedStatsFor(player);

    // Beide gleich verletzt und lange außer Gefecht: Basis- und Chill-Regen
    // laufen für beide identisch, nur der Stillstand unterscheidet sie.
    const t0 = 100_000;
    player.health = 150;
    mover.health = 150;
    player.lastDamageAt = t0 - 20_000;
    mover.lastDamageAt = t0 - 20_000;

    let now = t0;
    for (let tick = 0; tick < 40; tick += 1) {
      now += DT * 1000;
      player.position = { ...TRAEGER };
      player.velocity = { x: 0, y: 0 };
      player.move = { x: 0, y: 0 };
      // Der Kontrolltank fährt: Jeder Tick startet mit 100 u/s – nach dem
      // Original-Step bleibt er klar über der Stillstands-Schwelle.
      mover.position = { ...KONTROLLE };
      mover.velocity = { x: 100, y: 0 };
      mover.move = { x: 0, y: 0 };
      game.step(DT, now);
    }

    // Nach 20 s Ruhe ist die Chill-Rampe voll: 4 % maxHealth je Sekunde.
    const chill = 0.04 * player.maxHealth;
    const seconds = 40 * DT;
    expect(mover.health).toBeCloseTo(150 + (stats.regen + chill) * seconds, 6);
    expect(player.health).toBeCloseTo(150 + (stats.regen + chill + (multiplier - 1) * stats.regen) * seconds, 6);
  });

  it('burn: der Brand tickt über die Laufzeit und stapelt nicht', () => {
    const { game, internals, id } = setup('scorch');
    const burn = effectOf('scorch', 'burn');
    const { player: victim } = join(game, internals, 'core', GEGNER);
    const tickMs = DT * 1000;
    // Ticks, in denen der Brand nach einem Treffer wirklich brennt: Die Uhr
    // endet exakt auf einer Tick-Kante, und die Kante selbst brennt nicht mehr.
    const burningTicks = burn.seconds * 1000 / tickMs - 1;

    // Phase 1: ein Treffer, dann nur noch Zeit. Verlust = Direktschaden + DoT.
    let now = 100_000;
    internals.damagePlayer(victim, 5, id, now);
    for (let tick = 0; tick < 60; tick += 1) {
      now += tickMs;
      game.step(DT, now);
    }
    expect(victim.maxHealth - victim.health).toBeCloseTo(5 + burningTicks * burn.dps * DT, 6);

    // Phase 2: zwei überlappende Treffer. Stapelte der Brand, käme der
    // doppelte Tick-Schaden – tatsächlich stellt der zweite nur die Uhr neu.
    victim.health = victim.maxHealth;
    now = 200_000;
    internals.damagePlayer(victim, 5, id, now);
    const renewTicks = 10;
    for (let tick = 0; tick < renewTicks; tick += 1) {
      now += tickMs;
      game.step(DT, now);
    }
    internals.damagePlayer(victim, 5, id, now);
    for (let tick = 0; tick < 60 - renewTicks; tick += 1) {
      now += tickMs;
      game.step(DT, now);
    }
    expect(victim.maxHealth - victim.health)
      .toBeCloseTo(10 + (renewTicks + burningTicks) * burn.dps * DT, 6);
  });

  it('lässt Klassen ohne Perk vollständig unberührt', () => {
    const { game, internals, id, player } = setup('core');
    const { player: victim } = join(game, internals, 'core', GEGNER);
    const { player: control } = join(game, internals, 'core', KONTROLLE);

    // Kein doubleSalvo, egal wie oft gefeuert wird.
    let now = 100_000;
    for (let shot = 0; shot < 5; shot += 1) {
      internals.projectiles.clear();
      now = fireOnce(game, player, now);
      expect(salvoDamages(internals, id)).toHaveLength(CLASS_DEFINITIONS.core.barrelCount);
    }

    // Kein executioner: Schaden gegen ein fast totes Ziel bleibt nominal.
    victim.health = 20;
    const before = victim.health;
    internals.damagePlayer(victim, 10, id, now);
    expect(before - victim.health).toBeCloseTo(10, 6);

    // Kein killHeal und kein adrenaline nach einem Kill.
    player.health = player.maxHealth * 0.5;
    internals.damagePlayer(victim, 500, id, now);
    expect(victim.dead).toBe(true);
    expect(player.health).toBeCloseTo(player.maxHealth * 0.5, 6);
    const [killer, plain] = speedsAfterTick(game, [[player, TRAEGER], [control, KONTROLLE]], now + 25);
    expect(killer).toBeCloseTo(plain!, 6);
  });

  it('verhält sich ohne Flag exakt wie vorher', () => {
    const { game, internals, id, player } = setup('twin', false);
    const { every } = effectOf('twin', 'doubleSalvo');
    const barrels = CLASS_DEFINITIONS.twin.barrelCount;
    const { player: shade, id: shadeId } = join(game, internals, 'shade', ABSEITS);
    const { player: phantom } = join(game, internals, 'phantom', KONTROLLE);
    const { player: victim } = join(game, internals, 'core', GEGNER);
    expect(shade.dead).toBe(false);

    // Keine Doppelsalve – auch nicht auf dem n-ten Schuss.
    let now = 100_000;
    for (let shot = 1; shot <= every; shot += 1) {
      internals.projectiles.clear();
      now = fireOnce(game, player, now);
      expect(salvoDamages(internals, id)).toHaveLength(barrels);
    }

    // Kein executioner-Bonus trotz Ziel tief unter der Schwelle.
    victim.health = 20;
    const before = victim.health;
    internals.damagePlayer(victim, 10, shadeId, now);
    expect(before - victim.health).toBeCloseTo(10, 6);

    // Kein Schild trotz beliebig langer Ruhe.
    const full = phantom.health;
    internals.damagePlayer(phantom, 20, null, now);
    expect(full - phantom.health).toBeCloseTo(20, 6);
  });
});
