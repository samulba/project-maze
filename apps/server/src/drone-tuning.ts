import crypto from 'node:crypto';
import {
  CLASS_DEFINITIONS,
  GAME,
  type DroneSnapshot,
  type PlayerClass,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type Vector2
} from '@project-maze/shared';
import {
  PASSIVE_MODIFIER_DEFINITIONS,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { MazeGame } from './game.js';
import { clampMagnitude, distanceSquared, moveVectorToward, normalize } from './physics.js';
import { SHAPE_CONFIG, hasLineOfSight, moveCircle } from './world.js';

interface DroneArchetype {
  health: number;
  speed: number;
  acceleration: number;
  radius: number;
  orbitRadius: number;
  /**
   * Wie weit die Drohne um ihren BESITZER herum nach einem Ziel sucht, wenn
   * der Spieler nichts befiehlt (Drohnen-Rework, Stufe 1).
   *
   * Um den Besitzer, nicht um sich selbst: Sonst zieht eine Drohne die
   * nächste hinter sich her, und die Flotte wandert aus. Die Zahl ist der
   * Regler, an dem sich die zehn Klassen zum ersten Mal wirklich
   * unterscheiden – sie läuft mit dem Orbitradius mit: Wächter bleiben zu
   * Hause, Schwärme greifen weit.
   */
  searchRadius: number;
}

const DRONE_ARCHETYPES: Partial<Record<PlayerClass, DroneArchetype>> = {
  drone: { health: 36, speed: 440, acceleration: 1450, radius: 12, orbitRadius: 82, searchRadius: 520 },
  warden: { health: 32, speed: 480, acceleration: 1650, radius: 10.5, orbitRadius: 88, searchRadius: 560 },
  factory: { health: 54, speed: 390, acceleration: 1250, radius: 13.5, orbitRadius: 86, searchRadius: 540 },
  overseer: { health: 28, speed: 510, acceleration: 1780, radius: 9.5, orbitRadius: 94, searchRadius: 620 },
  carrier: { health: 72, speed: 350, acceleration: 1050, radius: 15.5, orbitRadius: 92, searchRadius: 580 },
  guardian: { health: 62, speed: 380, acceleration: 1200, radius: 13, orbitRadius: 62, searchRadius: 420 },
  hive: { health: 18, speed: 530, acceleration: 1900, radius: 7.5, orbitRadius: 100, searchRadius: 700 },
  /*
   * Klassen 4.0/4.1: drei Drohnenklassen kamen dazu, die Tabelle nicht.
   *
   * `archetypeFor` faellt still auf den Starter zurueck -- ohne Warnung, ohne
   * Test. `sentinel`, `aviary` und `sovereign` liefen deshalb mit dem Koerper
   * der Startklasse (36 HP, r12, Orbit 82), und die Beschreibung der Klasse war
   * damit schlicht falsch: „Drei schwere Waechter statt eines Schwarms" ergab
   * 3 x 36 = 108 Flotten-HP, waehrend die Geschwister derselben Stufe auf 192
   * (warden), 270 (factory) und 310 (guardian) kamen. Wer Sentinel waehlte,
   * bekam die schwaechste Flotte des Spiels und einen Satz, der das Gegenteil
   * versprach.
   *
   * Die Werte hier sind gesetzt, nicht geerbt -- jeweils entlang der eigenen
   * Beschreibung und der Nachbarn derselben Stufe:
   */
  // „Drei schwere Waechter" – wenige, dicke Koerper im engen Orbit. Flotte 216,
  // also zwischen warden (192) und factory (270), aber auf drei Ziele verteilt.

  sentinel: { health: 72, speed: 340, acceleration: 1020, radius: 15.5, orbitRadius: 70, searchRadius: 460 },
  // „Neun flinke Voegel" – leicht und schnell, zwischen hive (10 x 18) und
  // overseer (8 x 28). Flotte 207.
  aviary: { health: 23, speed: 545, acceleration: 1850, radius: 8.5, orbitRadius: 104, searchRadius: 720 },
  // Apex der Familie: „Sieben Waechter, ein Wille." Flotte 462 – oberhalb von
  // carrier (432), wie es sich fuer eine Endstufe auf Level 42 gehoert.
  sovereign: { health: 66, speed: 430, acceleration: 1400, radius: 13.5, orbitRadius: 88, searchRadius: 640 }
};

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  primary: boolean;
  secondary: boolean;
  passiveModifier?: PassiveModifierId;
}
interface RuntimeDrone extends DroneSnapshot {
  slot: number;
  contactCooldown: number;
  gameplayRadius?: number;
}
interface DroneInternals {
  players: Map<string, RuntimePlayer>;
  drones: Map<string, RuntimeDrone>;
  shapes: Map<string, ShapeSnapshot>;
  nextDroneSpawn: Map<string, number>;
  spawnDrone(owner: RuntimePlayer, slot: number): void;
  stepDrones(dt: number, now: number): void;
  damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
}

/**
 * Der Koerper der Drohnen dieser Klasse.
 *
 * Der Rueckfall auf den Starter bleibt als Notnagel stehen -- eine Drohne ohne
 * Koerper waere ein Absturz --, aber er ist kein Ersatz mehr fuer einen
 * Eintrag: `drone-tuning.test.ts` verlangt fuer JEDE Klasse mit
 * `droneCount > 0` einen eigenen. Genau dieser stille Rueckfall hat drei
 * Klassen ueber zwei Ausbaustufen hinweg mit fremden Werten laufen lassen.
 */
const archetypeFor = (playerClass: PlayerClass): DroneArchetype => DRONE_ARCHETYPES[playerClass] ?? DRONE_ARCHETYPES.drone!;

/** Fuer Tests und Balance-Werkzeuge: die Tabelle, wie sie wirklich dasteht. */
export const droneArchetypes = (): Readonly<Partial<Record<PlayerClass, DroneArchetype>>> => DRONE_ARCHETYPES;
const modifierFor = (player: RuntimePlayer) => PASSIVE_MODIFIER_DEFINITIONS[player.passiveModifier ?? 'standard'];
const damageFor = (player: RuntimePlayer): number => CLASS_DEFINITIONS[player.playerClass].damage * (1 + player.upgrades.damage * 0.07);
const reloadFor = (player: RuntimePlayer): number => Math.max(
  0.09,
  CLASS_DEFINITIONS[player.playerClass].reload * modifierFor(player).reloadMultiplier * Math.pow(0.95, player.upgrades.reload)
);
const bodyDamageFor = (player: RuntimePlayer): number => CLASS_DEFINITIONS[player.playerClass].bodyDamage * (1 + player.upgrades.bodyDamage * 0.1);

/**
 * Wie weit ein Rechtsklick die Drohnen vom Zeiger wegschiebt. Weit genug, dass
 * die Flotte sichtbar auffächert, kurz genug, dass sie beim Loslassen sofort
 * wieder da ist.
 */
const ABSTOSS_WEG = 260;
/**
 * Kein Zielpunkt liegt weiter vom Besitzer weg als `GAME.maxAimDistance` –
 * dieselbe Reichweite, die auch der Zeiger hat. Die Drohnen bleiben damit im
 * selben Kreis, in dem der Spieler zeigen kann.
 */
const LEINE = GAME.maxAimDistance;
/** Radius des Rings, auf dem sich die Flotte um ihr gemeinsames Ziel verteilt. */
const FORMATION_RING = 26;
/** Über diese Zeit wird die Restdistanz abgebremst – gegen das Überschwingen. */
const BREMS_SEKUNDEN = 0.18;

/**
 * Das nächste lohnende Ziel im Umkreis des BESITZERS – oder `null`.
 *
 * Gesucht wird um den Besitzer, nicht um die Drohne: Sonst zieht jede Drohne
 * die nächste hinter sich her und die Flotte wandert aus dem Bild.
 *
 * Spieler schlagen Formen, auch wenn eine Form näher liegt – wer angegriffen
 * wird, will nicht zusehen, wie seine Flotte nebenan ein Quadrat frisst.
 * Geprüft wird am Ende genau EINE Sichtlinie (die des Siegers): Eine Drohne,
 * die auf eine Wand zufliegt, hinter der ihr Ziel steht, bleibt dort kleben –
 * und Sichtlinien sind das Teuerste an dieser Suche.
 */
function sucheZiel(
  internals: DroneInternals,
  owner: RuntimePlayer,
  searchRadius: number
): Vector2 | null {
  const reichweite = searchRadius * searchRadius;
  let bester: Vector2 | null = null;
  let besteEntfernung = Infinity;

  for (const kandidat of internals.players.values()) {
    if (kandidat.id === owner.id || kandidat.dead || kandidat.invulnerable) continue;
    const entfernung = distanceSquared(kandidat.position, owner.position);
    if (entfernung > reichweite || entfernung >= besteEntfernung) continue;
    besteEntfernung = entfernung;
    bester = kandidat.position;
  }
  if (!bester) {
    for (const form of internals.shapes.values()) {
      const entfernung = distanceSquared(form.position, owner.position);
      if (entfernung > reichweite || entfernung >= besteEntfernung) continue;
      besteEntfernung = entfernung;
      bester = form.position;
    }
  }
  if (!bester || !hasLineOfSight(owner.position, bester)) return null;
  return { x: bester.x, y: bester.y };
}

/**
 * Gives each control-class branch its own physical drone identity.
 *
 * **Achtung: `spawnDrone` und `stepDrones` werden ERSETZT, nicht umschlossen.**
 * Damit gilt hier dieselbe Pflicht wie in `combat-tuning.ts`: Jede Regel der
 * Basis muss mitgeschrieben werden, und wer eine weitere Methode ersetzt,
 * vergleicht sie vorher Zeile fuer Zeile. Der stille Rueckfall in
 * `archetypeFor` ist genau diese Fehlerklasse in klein -- drei Klassen liefen
 * darueber mit fremden Werten.
 */
export function tuneDrones<T extends MazeGame>(game: T): T {
  const internals = game as unknown as DroneInternals;

  internals.spawnDrone = (owner: RuntimePlayer, slot: number): void => {
    const id = crypto.randomUUID();
    const archetype = archetypeFor(owner.playerClass);
    const maximum = archetype.health * (1 + owner.upgrades.maxHealth * 0.08) * modifierFor(owner).healthMultiplier;
    internals.drones.set(id, {
      id,
      ownerId: owner.id,
      position: { ...owner.position },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: maximum,
      maxHealth: maximum,
      slot,
      contactCooldown: 0,
      gameplayRadius: archetype.radius
    });
  };

  internals.stepDrones = (dt: number, now: number): void => {
    for (const drone of [...internals.drones.values()]) {
      const owner = internals.players.get(drone.ownerId);
      if (!owner || owner.dead) {
        internals.drones.delete(drone.id);
        continue;
      }

      const definition = CLASS_DEFINITIONS[owner.playerClass];
      const archetype = archetypeFor(owner.playerClass);
      const modifier = modifierFor(owner);
      const radius = drone.gameplayRadius ?? archetype.radius;
      const reload = reloadFor(owner);
      const damage = damageFor(owner);
      drone.contactCooldown = Math.max(0, drone.contactCooldown - dt);

      const aim = clampMagnitude(owner.aim, GAME.maxAimDistance);
      const orbitAngle = now / 850 + drone.slot * Math.PI * 2 / Math.max(1, definition.droneCount);
      const orbit = {
        x: owner.position.x + Math.cos(orbitAngle) * archetype.orbitRadius,
        y: owner.position.y + Math.sin(orbitAngle) * archetype.orbitRadius
      };
      /** Der Punkt unter dem Mauszeiger – das Gegenstück zum Diep.io-Cursor. */
      const zeiger = { x: owner.position.x + aim.x, y: owner.position.y + aim.y };

      /*
       * Die vier Zustände einer Drohne (Drohnen-Rework, Stufe 1).
       *
       * Vorher waren es drei – Orbit, „flieg zum Zeiger", „flieg hinter den
       * Tank" – und keiner davon griff je von selbst an. Sam im Spieltest:
       * „da müssen die Drohnen ja auch irgendwas angreifen. Das macht ja gar
       * keinen Sinn, dass sie einfach um dich schweben und dann nix passiert."
       * Gemessen stimmte das wörtlich: ein Gegner 200 px entfernt, kein
       * Kommando, acht Sekunden – null Schaden.
       *
       * 1. Rechtsklick: radial VOM Zeiger weg (Diep.io-Verhalten). Vorher war
       *    es eine Punktspiegelung hinter den Tank – die ganze Flotte sammelte
       *    sich auf einem Punkt, statt aufzufächern.
       * 2. Linksklick (und Auto-Feuer): zum Zeiger.
       * 3. Sonst: das nächste Ziel im Suchradius um den Besitzer angreifen.
       * 4. Findet sich keins: der alte Orbit. Er bleibt die Nahverteidigung.
       */
      let ziel = orbit;
      let formation = true;
      if (owner.secondary) {
        // Weg vom Zeiger, nicht hinter den Tank. Steht die Drohne exakt auf dem
        // Zeiger, liefert `normalize` (0,0) – dann weicht sie vom Besitzer weg,
        // statt stehenzubleiben.
        const weg = normalize({ x: drone.position.x - zeiger.x, y: drone.position.y - zeiger.y });
        const richtung = weg.x === 0 && weg.y === 0
          ? normalize({ x: drone.position.x - owner.position.x, y: drone.position.y - owner.position.y })
          : weg;
        ziel = { x: drone.position.x + richtung.x * ABSTOSS_WEG, y: drone.position.y + richtung.y * ABSTOSS_WEG };
        formation = false;
      } else if (owner.primary) {
        ziel = zeiger;
      } else {
        const gesucht = sucheZiel(internals, owner, archetype.searchRadius);
        if (gesucht) ziel = gesucht;
        else formation = false;
      }

      /*
       * Formation statt Pulk: Jede Drohne bekommt ihren Slot-Winkel auch beim
       * Angriff, fliegt also einen eigenen Punkt auf einem kleinen Ring um das
       * gemeinsame Ziel an. Ohne das stapelt sich die ganze Flotte auf einer
       * Koordinate und sieht aus wie eine Drohne.
       */
      if (formation && definition.droneCount > 1) {
        const platz = drone.slot * Math.PI * 2 / definition.droneCount;
        ziel = { x: ziel.x + Math.cos(platz) * FORMATION_RING, y: ziel.y + Math.sin(platz) * FORMATION_RING };
      }
      // Leine: Kein Zielpunkt liegt weiter vom Besitzer entfernt als sein
      // Zeiger reichen kann. Ohne sie schiebt ein gehaltener Rechtsklick die
      // Flotte bis an den Kartenrand, und sie käme nicht zurück.
      const zumZiel = clampMagnitude({ x: ziel.x - owner.position.x, y: ziel.y - owner.position.y }, LEINE);
      const target = { x: owner.position.x + zumZiel.x, y: owner.position.y + zumZiel.y };

      const abstand = Math.hypot(target.x - drone.position.x, target.y - drone.position.y);
      const direction = normalize({ x: target.x - drone.position.x, y: target.y - drone.position.y });
      const travelMultiplier = modifier.moveMultiplier * modifier.projectileSpeedMultiplier;
      // Ankommen statt Überschwingen: Auf den letzten Metern wird die
      // Wunschgeschwindigkeit von der Reststrecke gedeckelt. Vorher pendelte
      // eine Drohne am Zielpunkt mit bis zu 71 px Amplitude, weil sie mit
      // vollem Tempo hineinfuhr und erst dahinter bremste.
      const speed = Math.min(archetype.speed * travelMultiplier, abstand / BREMS_SEKUNDEN);
      drone.velocity = moveVectorToward(
        drone.velocity,
        { x: direction.x * speed, y: direction.y * speed },
        archetype.acceleration * travelMultiplier * dt
      );
      const moved = moveCircle(drone.position, drone.velocity, dt, radius);
      drone.position = moved.position;
      drone.velocity = moved.velocity;
      drone.angle = Math.atan2(drone.velocity.y, drone.velocity.x);
      if (drone.contactCooldown > 0) continue;

      const shape = [...internals.shapes.values()].find(
        (candidate) => distanceSquared(candidate.position, drone.position) <= Math.pow(candidate.radius + radius, 2)
      );
      if (shape) {
        internals.damageShape(shape, damage, owner.id, now);
        drone.health -= SHAPE_CONFIG[shape.kind].bodyDamage;
        drone.contactCooldown = reload;
      } else {
        const targetPlayer = [...internals.players.values()].find(
          (candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== owner.id &&
            distanceSquared(candidate.position, drone.position) <= Math.pow(GAME.playerRadius + radius, 2)
        );
        if (targetPlayer) {
          internals.damagePlayer(targetPlayer, damage, owner.id, now);
          drone.health -= bodyDamageFor(targetPlayer) * 0.5;
          drone.contactCooldown = reload;
        }
      }

      if (drone.health <= 0) {
        internals.drones.delete(drone.id);
        internals.nextDroneSpawn.set(owner.id, now + Math.max(400, definition.droneRespawn * 1000));
      }
    }
  };

  return game;
}
