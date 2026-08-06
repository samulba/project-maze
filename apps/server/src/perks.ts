import crypto from 'node:crypto';
import {
  GAME,
  type DroneSnapshot,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type Vector2
} from '@project-maze/shared';
import type { PassiveModifierId } from '@project-maze/shared/gameplay';
import { perkFor, type PerkEffect } from '@project-maze/shared/perks';
import { tunedStatsFor } from './combat-tuning.js';
import { MazeGame } from './game.js';
import { distanceSquared, projectileSubstepCount } from './physics.js';
import { isFree } from './world.js';

/**
 * Klassen 4.0, Welle B – die Perk-Schicht.
 *
 * Die DATEN (welche Klasse welchen Perk trägt) liegen in
 * `@project-maze/shared/perks`, damit der Client dieselbe Quelle beschriftet.
 * Hier steht ausschließlich die WIRKUNG – nach dem Hausmuster der Tuning-
 * Schichten: Internals-Cast, gebundene Originale wrappen, Zustand je
 * `tunePerks`-Aufruf in Closures (ein Aufruf gehört zu genau einem Spiel).
 *
 * Diese Schicht wird vom Orchestrator AUSSEN um die Signature-Schichten
 * gelegt. Deshalb verlässt sie sich auf keine bestimmte innere Schicht: Sie
 * bindet die zum Zeitpunkt des Aufrufs aktuellen Methoden und misst Wirkung
 * nur an Dingen, die jede Fassung des Spiels garantiert (Objektzustand von
 * Projektilen/Drohnen, `lastDamageAt`, `velocity` nach dem Original-Step).
 *
 * Bots tragen Perks genauso wie Menschen – es gibt bewusst keine
 * Sonderbehandlung: Der Perk hängt an der Klasse, nicht am Spielertyp.
 */

/** Unterhalb dieses Tempos gilt ein Träger für `standingRegen` als stehend. */
export const STANDSTILL_SPEED = 12;
/**
 * „Volles Leben" für `overcharge` heißt: höchstens so weit unter dem Maximum.
 * Regeneration arbeitet in Bruchteilen je Tick – wer exakt `maxHealth`
 * verlangt, verliert den Perk an Rundungsreste.
 */
export const FULL_HEALTH_TOLERANCE = 0.5;
/**
 * Splitter-Konstanten: Die Splitter sind bewusst kurzlebige, langsame
 * Nahbereichs-Projektile – ein Abschluss-Effekt am Ort des Kills, keine
 * zweite Waffe mit Reichweite.
 */
export const SPLITTER_SHARD_SPEED = 380;
export const SPLITTER_SHARD_LIFE = 0.5;
export const SPLITTER_SHARD_RADIUS = 6;
export const SPLITTER_SHARD_INTEGRITY = 8;

interface RuntimePlayer extends PlayerSnapshot {
  move: Vector2;
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  cooldown: number;
  lastDamageAt: number;
  invulnerableUntil: number;
  passiveModifier?: PassiveModifierId;
  bot: unknown | null;
}
interface RuntimeProjectile extends ProjectileSnapshot {
  damage: number;
  life: number;
}
interface RuntimeDrone extends DroneSnapshot {
  slot: number;
  contactCooldown: number;
}

interface PerksInternals {
  players: Map<string, RuntimePlayer>;
  projectiles: Map<string, RuntimeProjectile>;
  drones: Map<string, RuntimeDrone>;
  stepPlayer(player: RuntimePlayer, dt: number, now: number): void;
  stepProjectiles(dt: number, now: number): void;
  stepDrones(dt: number, now: number): void;
  resolvePlayerCollisions(now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  killPlayer(target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void;
  fire(player: RuntimePlayer, stats: unknown): void;
}

/** Perk-Wirkung einer Klasse – `null` für Starter, Core und Familienwurzeln. */
const effectFor = (playerClass: PlayerClass): PerkEffect | null => perkFor(playerClass)?.effect ?? null;

/** Zeitgesteuerte Tempo-Faktoren (frostShot/contactSlow verlangsamen, adrenaline beschleunigt). */
interface TimedFactor {
  until: number;
  factor: number;
}
interface BurnState {
  until: number;
  dps: number;
  attackerId: string;
}
interface ProjectileKillContext {
  targetId: string;
  attackerId: string;
  damage: number;
}

/**
 * Hängt die Perk-Wirkungen an. `enabled = false` lässt die Schicht komplett
 * weg – das Spiel verhält sich dann exakt wie ohne den Aufruf.
 */
export function tunePerks<T extends MazeGame>(game: T, enabled = true): T {
  if (!enabled) return game;
  const internals = game as unknown as PerksInternals;

  // ---- Zustand je Spiel (Closures; ein tunePerks-Aufruf = ein Spiel) -------
  /** doubleSalvo: wie oft dieser Spieler seit Spawn abgedrückt hat. */
  const salvoCount = new Map<string, number>();
  /** frostShot/contactSlow: Ziel-Id -> Dämpfung. Nicht stapelnd – Überschreiben setzt die Uhr neu. */
  const slowedUntil = new Map<string, TimedFactor>();
  /** adrenaline: Killer-Id -> Beschleunigung. */
  const boostUntil = new Map<string, TimedFactor>();
  /** burn: Ziel-Id -> laufender Brand. Nicht stapelnd – Überschreiben setzt die Uhr neu. */
  const burning = new Map<string, BurnState>();
  /** ricochet: Projektil-Id -> verbleibende Abpraller. */
  const bounceBudget = new Map<string, number>();
  /** Nur Schaden innerhalb von `resolvePlayerCollisions` ist Körperkontakt. */
  let inBodyContact = false;
  /** Nur Schaden innerhalb von `stepDrones` ist Drohnenarbeit. */
  let inDroneStep = false;
  /**
   * Synchroner Kontext für splitter: `damagePlayer` setzt ihn, bevor das
   * Original läuft; stirbt das Ziel, ruft das Original `this.killPlayer`
   * synchron – der Kill-Wrap liest den Kontext und weiß damit sicher, dass
   * ein PROJEKTIL des Trägers getötet hat und wie hart es traf.
   */
  let pendingProjectileKill: ProjectileKillContext | null = null;

  const clearPlayerState = (id: string): void => {
    salvoCount.delete(id);
    slowedUntil.delete(id);
    boostUntil.delete(id);
    burning.delete(id);
  };

  const originalStepPlayer = internals.stepPlayer.bind(internals);
  const originalStepProjectiles = internals.stepProjectiles.bind(internals);
  const originalStepDrones = internals.stepDrones.bind(internals);
  const originalResolve = internals.resolvePlayerCollisions.bind(internals);
  const originalDamagePlayer = internals.damagePlayer.bind(internals);
  const originalKillPlayer = internals.killPlayer.bind(internals);
  const originalFire = internals.fire.bind(internals);

  /**
   * splitter: Splitter entstehen am Ort des Kills, gleichmäßig im Kreis.
   * Sie gehören dem Träger – tötet ein Splitter erneut, splittert er wieder,
   * aber mit `damageShare`-fach schrumpfendem Schaden: Die Kette klingt
   * geometrisch ab und braucht deshalb keine eigene Bremse.
   */
  const spawnShards = (owner: RuntimePlayer, at: Vector2, damage: number, shards: number): void => {
    for (let index = 0; index < shards; index += 1) {
      const angle = (index / shards) * Math.PI * 2;
      const id = crypto.randomUUID();
      internals.projectiles.set(id, {
        id,
        ownerId: owner.id,
        position: { x: at.x, y: at.y },
        velocity: { x: Math.cos(angle) * SPLITTER_SHARD_SPEED, y: Math.sin(angle) * SPLITTER_SHARD_SPEED },
        radius: SPLITTER_SHARD_RADIUS,
        integrity: SPLITTER_SHARD_INTEGRITY,
        maxIntegrity: SPLITTER_SHARD_INTEGRITY,
        damage,
        life: SPLITTER_SHARD_LIFE
      });
    }
  };

  // ---- damagePlayer: die zentrale Weiche ----------------------------------
  // Klassifikation ohne neue Haken: Kontakt kommt IMMER aus
  // `resolvePlayerCollisions`, Drohnenarbeit IMMER aus `stepDrones` – beide
  // setzen hier ein Flag. Was übrig bleibt und einen Angreifer trägt, ist ein
  // Projektiltreffer. Eigene interne Schäden (Dornen-Reflexion, Brand-Tick,
  // Drohnen-Nova) laufen über `originalDamagePlayer` AM WRAP VORBEI und
  // können deshalb keine weiteren Perks zünden – das ist der Kettenschutz.
  internals.damagePlayer = (target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void => {
    // Wirkungslose Aufrufe unangetastet durchreichen: An toten/unverwundbaren
    // Zielen prallt das Original ohnehin ab, und ein 0-Schaden-Ereignis darf
    // weder den Schild verbrauchen noch On-Hit-Effekte zünden.
    if (target.dead || target.invulnerable || damage <= 0) {
      originalDamagePlayer(target, damage, attackerId, now);
      return;
    }

    const attacker = attackerId ? internals.players.get(attackerId) : undefined;
    // Ein toter Angreifer wirkt nicht mehr: Sein letzter Rempler im selben
    // Tick soll nicht noch Slows oder Boni verteilen.
    const attackerEffect = attacker && !attacker.dead ? effectFor(attacker.playerClass) : null;
    const targetEffect = effectFor(target.playerClass);
    const contact = inBodyContact;
    const projectileHit = !contact && !inDroneStep && attacker !== undefined && !attacker.dead;

    // shieldRing (Ziel): Die Ruhe misst die hauseigene Uhr `lastDamageAt` –
    // sie wird von jedem angekommenen Treffer gestellt, ein eigenes
    // Snapshot-Feld braucht es nicht. Der Schild schluckt den Treffer
    // VOLLSTÄNDIG, auch die On-Hit-Effekte des Angreifers: Ein absorbierter
    // Treffer ist nie „gelandet".
    if (targetEffect?.kind === 'shieldRing' && now - target.lastDamageAt >= targetEffect.quietSeconds * 1000) {
      target.lastDamageAt = now; // der Schild ist verbraucht, die Ruhe-Uhr beginnt neu
      return;
    }

    let adjusted = damage;
    // contactArmor (Ziel): nur gegen Rempler – Projektile bleiben voll wirksam.
    if (contact && targetEffect?.kind === 'contactArmor') adjusted *= 1 - targetEffect.reduction;
    // executioner (Angreifer): Projektil- ODER Drohnenschaden, nie Kontakt.
    // Die Schwelle wird VOR der Schadensanwendung geprüft – sonst würde der
    // Treffer, der das Ziel unter die Schwelle drückt, sich selbst verstärken.
    if (!contact && attackerEffect?.kind === 'executioner'
      && target.health < target.maxHealth * attackerEffect.threshold) {
      adjusted *= 1 + attackerEffect.bonus;
    }

    if (projectileHit && attackerEffect?.kind === 'splitter' && attacker) {
      pendingProjectileKill = { targetId: target.id, attackerId: attacker.id, damage: adjusted };
      try {
        originalDamagePlayer(target, adjusted, attackerId, now);
      } finally {
        pendingProjectileKill = null;
      }
    } else {
      originalDamagePlayer(target, adjusted, attackerId, now);
    }

    // On-Hit-Effekte erst NACH dem Original: Sie gelten nur für Treffer, die
    // wirklich ankamen, und nie für ein Ziel, das der Treffer gerade getötet
    // hat – `killPlayer` hat dessen Perk-Uhren bereits geräumt, ein neuer
    // Eintrag würde als Geist bis in den Respawn überleben.
    if (projectileHit && !target.dead && attackerEffect?.kind === 'frostShot') {
      slowedUntil.set(target.id, { until: now + attackerEffect.seconds * 1000, factor: 1 - attackerEffect.slow });
    }
    if (projectileHit && !target.dead && attackerEffect?.kind === 'burn' && attacker) {
      burning.set(target.id, { until: now + attackerEffect.seconds * 1000, dps: attackerEffect.dps, attackerId: attacker.id });
    }
    if (contact && !target.dead && attackerEffect?.kind === 'contactSlow') {
      slowedUntil.set(target.id, { until: now + attackerEffect.seconds * 1000, factor: 1 - attackerEffect.slow });
    }
    // thorns (Ziel): Der Rempler zahlt einen Anteil seines Schadens zurück.
    // Die Reflexion läuft am Wrap vorbei – sie reflektiert nie erneut, auch
    // wenn beide Seiten Dornen tragen (kein Ping-Pong).
    if (contact && targetEffect?.kind === 'thorns' && attacker && !attacker.dead) {
      originalDamagePlayer(attacker, targetEffect.share * adjusted, target.id, now);
    }
  };

  // ---- killPlayer: Kill-Belohnungen und Aufräumen -------------------------
  internals.killPlayer = (target: RuntimePlayer, attackerId: string | null, now: number, environmentName: string): void => {
    if (target.dead) {
      // Das Original steigt bei bereits Toten aus – wir auch.
      originalKillPlayer(target, attackerId, now, environmentName);
      return;
    }
    // Den synchronen Projektil-Kontext VOR dem Original sichern – danach ist
    // nicht mehr erkennbar, was den Todesstoß führte.
    const projectileKill = pendingProjectileKill;
    originalKillPlayer(target, attackerId, now, environmentName);
    // Der Tod setzt alle Perk-Uhren des Opfers zurück: Ein Respawn beginnt
    // ohne alten Brand, ohne Slow und mit frischem Salven-Zähler.
    clearPlayerState(target.id);

    const attacker = attackerId ? internals.players.get(attackerId) : undefined;
    // Selbst- und Nachtod-Kills belohnen nicht: Ein toter Killer darf weder
    // heilen (er hätte wieder Leben) noch einen Boost horten.
    if (!attacker || attacker.id === target.id || attacker.dead) return;
    const effect = effectFor(attacker.playerClass);
    if (!effect) return;

    if (effect.kind === 'adrenaline') {
      boostUntil.set(attacker.id, { until: now + effect.seconds * 1000, factor: 1 + effect.bonus });
    }
    if (effect.kind === 'killHeal') {
      attacker.health = Math.min(attacker.maxHealth, attacker.health + effect.share * attacker.maxHealth);
    }
    if (effect.kind === 'splitter' && projectileKill
      && projectileKill.targetId === target.id && projectileKill.attackerId === attacker.id) {
      spawnShards(attacker, target.position, projectileKill.damage * effect.damageShare, effect.shards);
    }
  };

  // ---- fire: doubleSalvo und overcharge -----------------------------------
  internals.fire = (player: RuntimePlayer, stats: unknown): void => {
    const effect = effectFor(player.playerClass);

    if (effect?.kind === 'overcharge' && player.health >= player.maxHealth - FULL_HEALTH_TOLERANCE) {
      // Muster signature-specter-Erstschlag: Alle in diesem Aufruf neu
      // entstandenen eigenen Projektile SIND die Salve – bei Mehrlauf-Klassen
      // trägt damit jeder Lauf den Bonus.
      const before = new Set(internals.projectiles.keys());
      originalFire(player, stats);
      for (const [id, projectile] of internals.projectiles) {
        if (!before.has(id) && projectile.ownerId === player.id) projectile.damage *= 1 + effect.bonus;
      }
      return;
    }

    originalFire(player, stats);
    if (effect?.kind === 'doubleSalvo') {
      const count = (salvoCount.get(player.id) ?? 0) + 1;
      salvoCount.set(player.id, count);
      // Der Zusatz geht über `originalFire` am eigenen Wrap vorbei: kein
      // Rekursionsrisiko, und er zählt nicht als neuer Zähler-Schritt.
      if (count % effect.every === 0) originalFire(player, stats);
    }
  };

  // ---- stepPlayer: Tempo-Faktoren, standingRegen, Brand-Tick --------------
  internals.stepPlayer = (player: RuntimePlayer, dt: number, now: number): void => {
    const healthBefore = player.health;
    originalStepPlayer(player, dt, now);
    if (player.dead) return;

    // Tempo-Faktoren NACH dem Original auf die fertige velocity: Das Original
    // zieht die Geschwindigkeit jeden Tick Richtung Wunschtempo zurück, der
    // Faktor kann sich also nicht aufschaukeln – und ist exakt messbar.
    const slow = slowedUntil.get(player.id);
    if (slow) {
      if (now < slow.until) {
        player.velocity.x *= slow.factor;
        player.velocity.y *= slow.factor;
      } else {
        slowedUntil.delete(player.id);
      }
    }
    const boost = boostUntil.get(player.id);
    if (boost) {
      if (now < boost.until) {
        player.velocity.x *= boost.factor;
        player.velocity.y *= boost.factor;
      } else {
        boostUntil.delete(player.id);
      }
    }

    const effect = effectFor(player.playerClass);
    // standingRegen: nur der ZUSCHLAG – die normale Regeneration lief eben im
    // Original. Ob sie lief, verrät das gestiegene Leben; so übernimmt die
    // Schicht automatisch die Gefechtssperre der inneren Schicht, egal welche
    // innen liegt (statt deren Zeitfenster hier zu duplizieren).
    if (effect?.kind === 'standingRegen'
      && Math.hypot(player.velocity.x, player.velocity.y) < STANDSTILL_SPEED
      && player.health > healthBefore
      && player.health < player.maxHealth) {
      player.health = Math.min(
        player.maxHealth,
        player.health + (effect.multiplier - 1) * tunedStatsFor(player).regen * dt
      );
    }

    // burn: Der Brand tickt mit dem Spieler-Takt – so hat er ein `dt`, ohne
    // dass die Schicht `step` selbst anfassen muss. Der Schaden läuft über
    // `originalDamagePlayer` mit der Angreifer-Id des Zünders (Kill-Credit),
    // aber ohne Perk-Weiterverkettung: Brand zündet keinen neuen Brand.
    const burn = burning.get(player.id);
    if (burn) {
      if (now >= burn.until) burning.delete(player.id);
      else originalDamagePlayer(player, burn.dps * dt, burn.attackerId, now);
    }
  };

  // ---- resolvePlayerCollisions: nur das Kontakt-Flag ----------------------
  internals.resolvePlayerCollisions = (now: number): void => {
    inBodyContact = true;
    try {
      originalResolve(now);
    } finally {
      inBodyContact = false;
    }
  };

  // ---- stepDrones: Drohnen-Flag und droneNova -----------------------------
  // Der Drohnentod passiert tief im Original (beide Fassungen: game.ts und
  // drone-tuning.ts) ohne Haken. Aber: Die Map hält Objekt-REFERENZEN, und
  // eine gelöschte Drohne behält ihren letzten Zustand. `health <= 0` heißt
  // eindeutig „an Schaden gestorben" – die einzige andere Löschung (Besitzer
  // tot/weg) lässt das Leben unangetastet. Das ist ein exakter Befund, kein
  // Heuristik-Raten.
  internals.stepDrones = (dt: number, now: number): void => {
    const watched: Array<{ drone: RuntimeDrone; effect: Extract<PerkEffect, { kind: 'droneNova' }> }> = [];
    for (const drone of internals.drones.values()) {
      const owner = internals.players.get(drone.ownerId);
      if (!owner || owner.dead) continue;
      const effect = effectFor(owner.playerClass);
      if (effect?.kind === 'droneNova') watched.push({ drone, effect });
    }

    inDroneStep = true;
    try {
      originalStepDrones(dt, now);
    } finally {
      inDroneStep = false;
    }

    for (const { drone, effect } of watched) {
      if (internals.drones.has(drone.id)) continue; // lebt noch
      if (drone.health > 0) continue; // Besitzer verschwand – kein Kampf-Tod, keine Nova
      const owner = internals.players.get(drone.ownerId);
      if (!owner || owner.dead) continue; // niemand mehr, dem die Nova gehört
      const radiusSquared = effect.radius * effect.radius;
      for (const target of internals.players.values()) {
        if (target.dead || target.invulnerable || target.id === drone.ownerId) continue;
        if (distanceSquared(target.position, drone.position) > radiusSquared) continue;
        // Am Wrap vorbei: Die Nova ist Umgebungswirkung, kein „Treffer" –
        // sie zündet keine weiteren Perks (weder eigene noch fremde).
        originalDamagePlayer(target, effect.damage, drone.ownerId, now);
      }
    }
  };

  // ---- stepProjectiles: ricochet ------------------------------------------
  // Auch der Wandtreffer passiert tief im Original ohne Haken – aber wieder
  // verrät der Objektzustand die Todesursache exakt: Ein gelöschtes Projektil
  // mit `life > 0` UND `integrity > 0` kann NUR an Wand oder Weltrand
  // gestorben sein (Lebenszeit- und Integritätstod setzen ihr Feld <= 0,
  // andere Löschwege gibt es im Projektil-Step nicht).
  internals.stepProjectiles = (dt: number, now: number): void => {
    // Die Substep-Länge exakt wie das Original berechnen (VOR dessen Lauf,
    // mit demselben Bestand): Nur so trifft die Achsen-Probe unten denselben
    // Kandidatenpunkt, an dem das Original das Projektil sterben ließ.
    const maximumSpeed = Math.max(
      0,
      ...[...internals.projectiles.values()].map((projectile) => Math.hypot(projectile.velocity.x, projectile.velocity.y))
    );
    const subDt = dt / projectileSubstepCount(maximumSpeed, dt, GAME.projectileStepDistance);

    const watched: RuntimeProjectile[] = [];
    for (const projectile of internals.projectiles.values()) {
      const owner = internals.players.get(projectile.ownerId);
      if (!owner || owner.dead) continue;
      const effect = effectFor(owner.playerClass);
      if (effect?.kind !== 'ricochet') continue;
      if (!bounceBudget.has(projectile.id)) bounceBudget.set(projectile.id, effect.bounces);
      if ((bounceBudget.get(projectile.id) ?? 0) > 0) watched.push(projectile);
    }

    originalStepProjectiles(dt, now);

    for (const projectile of watched) {
      if (internals.projectiles.has(projectile.id)) continue; // fliegt noch
      if (projectile.life <= 0 || projectile.integrity <= 0) continue; // legitimer Tod
      const owner = internals.players.get(projectile.ownerId);
      // Starb der BESITZER in diesem Tick, hat `killPlayer` seine Salve
      // eingesammelt – diese Projektile nicht wiederbeleben.
      if (!owner || owner.dead) continue;

      // Achsengetrennte Probe wie `moveCircle`: Die blockierte Achse wird
      // gespiegelt; sind beide Einzelachsen frei, war es eine frontale Ecke.
      const position = projectile.position;
      const xFree = isFree({ x: position.x + projectile.velocity.x * subDt, y: position.y }, projectile.radius);
      const yFree = isFree({ x: position.x, y: position.y + projectile.velocity.y * subDt }, projectile.radius);
      if (!xFree || (xFree && yFree)) projectile.velocity.x = -projectile.velocity.x;
      if (!yFree || (xFree && yFree)) projectile.velocity.y = -projectile.velocity.y;

      bounceBudget.set(projectile.id, (bounceBudget.get(projectile.id) ?? 1) - 1);
      internals.projectiles.set(projectile.id, projectile);
    }

    // Buchführung nicht wachsen lassen: Einträge endgültig toter Projektile
    // (auch der außerhalb dieses Steps gelöschten, z. B. bei Spielertod) weg.
    for (const id of bounceBudget.keys()) {
      if (!internals.projectiles.has(id)) bounceBudget.delete(id);
    }
  };

  // ---- removePlayer: kompletter Abgang räumt alles ------------------------
  const originalRemovePlayer = game.removePlayer.bind(game);
  game.removePlayer = ((id: string): void => {
    clearPlayerState(id);
    originalRemovePlayer(id);
  }) as T['removePlayer'];

  return game;
}
