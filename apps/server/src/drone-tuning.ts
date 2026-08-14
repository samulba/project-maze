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
import { clampMagnitude, distanceSquared, moveVectorToward, normalize, schiebeAuseinander } from './physics.js';
import { SHAPE_CONFIG, hasLineOfSight, isFree, moveCircle } from './world.js';

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
  /**
   * Eigene Waffe der Drohne – Sam: „Factory ist noch keine Factory, sondern
   * einfach Mini-Drohnen." Nur `factory` und `carrier` tragen das: In
   * Diep.io sind Factory-„Minions" Einheiten mit einem eigenen Geschütz, kein
   * größerer Körper mit demselben Kontaktverhalten wie jede andere
   * Drohnenklasse. Optional, weil die übrigen acht Archetypen reine
   * Kontaktkämpfer bleiben – ihre Beschreibung verspricht kein Geschütz.
   */
  minionWaffe?: MinionWaffe;
}

interface MinionWaffe {
  damage: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  projectileRadius: number;
}

/**
 * Rohtabelle vor dem Tempo-Dämpfer (siehe `DROHNEN_TEMPO_SKALA` direkt
 * danach). Die relative Abstufung zwischen den Klassen ist hier dokumentiert
 * und bleibt unter dem Dämpfer erhalten – eine gleichmäßige Skalierung
 * verändert keine Verhältnisse, nur die absolute Größe.
 */
const DRONE_ARCHETYPES_ROH: Partial<Record<PlayerClass, DroneArchetype>> = {
  drone: { health: 36, speed: 440, acceleration: 1450, radius: 12, orbitRadius: 82, searchRadius: 520 },
  warden: { health: 32, speed: 480, acceleration: 1650, radius: 10.5, orbitRadius: 88, searchRadius: 560 },
  // Minion-Waffe (siehe `MinionWaffe`): moderates Tempo, kurze Reichweite –
  // ein Vorstoß, kein Ersatz für die Hauptwaffe des Besitzers. Schaden und
  // Nachladezeit gemessen gegen die reinen Kontaktarchetypen derselben Stufe
  // in messung-drohnen-minions.mjs; Reichweite bewusst kleiner als der
  // Suchradius, damit ein Minion erst kurz vor dem Kontakt zu schießen
  // beginnt und nicht quer durchs halbe Suchfeld feuert.
  factory: {
    health: 54, speed: 390, acceleration: 1250, radius: 13.5, orbitRadius: 86, searchRadius: 540,
    minionWaffe: { damage: 6, reload: 1.1, projectileSpeed: 460, projectileLife: 0.65, projectileRadius: 5 }
  },
  overseer: { health: 28, speed: 510, acceleration: 1780, radius: 9.5, orbitRadius: 94, searchRadius: 620 },
  carrier: {
    health: 72, speed: 350, acceleration: 1050, radius: 15.5, orbitRadius: 92, searchRadius: 580,
    minionWaffe: { damage: 7.5, reload: 1.2, projectileSpeed: 430, projectileLife: 0.74, projectileRadius: 5.5 }
  },
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

/**
 * Tempo- und Beschleunigungsdämpfer (Drohnen-Rework 2, Sam 13.08.):
 * „Drohnen bewegen sich noch zu schnell" und „die Bewegung ist noch nicht so
 * clean."
 *
 * Gemessen (`messung-drohnen-bewegung.mjs`) lag das Verhältnis
 * Drohnentempo : Besitzertempo vorher bei 1,38–2,20× (Schnitt 1,79×) – eine
 * Drohne war schneller als ein Sportwagen neben dem eigenen Panzer. 0,72
 * drückt das auf 0,99–1,58× (Schnitt 1,25×). Das ist kein runder Wert,
 * sondern der Punkt, an dem selbst die langsamste Klasse (sentinel) gerade
 * noch mit dem eigenen Besitzer mithält – niedriger, und Wächter-Drohnen
 * fielen beim Fahren hinter den eigenen Tank zurück.
 *
 * Die Beschleunigung sinkt STÄRKER (0,55). `moveVectorToward` rampt linear,
 * die Zeit bis zum vollen Tempo ist also exakt Tempo/Beschleunigung – vorher
 * 0,28–0,33 s, jetzt 0,37–0,44 s. Das ist der eigentliche Hebel gegen
 * „ruckartig": nicht das Tempo selbst, sondern wie abrupt es erreicht wird.
 */
const DROHNEN_TEMPO_SKALA = 0.72;
const DROHNEN_BESCHLEUNIGUNG_SKALA = 0.55;

const DRONE_ARCHETYPES: Partial<Record<PlayerClass, DroneArchetype>> = Object.fromEntries(
  Object.entries(DRONE_ARCHETYPES_ROH).map(([id, archetype]) => [
    id,
    {
      ...archetype,
      speed: archetype.speed * DROHNEN_TEMPO_SKALA,
      acceleration: archetype.acceleration * DROHNEN_BESCHLEUNIGUNG_SKALA
    }
  ])
) as Partial<Record<PlayerClass, DroneArchetype>>;

interface RuntimePlayer extends PlayerSnapshot {
  aim: Vector2;
  primary: boolean;
  /** Echter Zeigerbefehl ohne Auto-Modus (siehe `zeigerbefehl`/`autoModus`). */
  klick?: boolean;
  secondary: boolean;
  /** Nur zur Unterscheidung Mensch/Bot – der Inhalt interessiert hier nicht. */
  bot?: unknown;
  passiveModifier?: PassiveModifierId;
}

/**
 * Zeigt der Spieler gerade aktiv irgendwohin? – Sams Regel vom 14.08.:
 *
 * > „die sollen nur angreifen, wenn du im E-Auto-Modus bist und man nix klickt;
 * > sonst immer in der Maus-Nähe, wenn man klickt, obv wie bei Diep.io"
 *
 * Bots kennen das Feld nicht: Sie setzen `primary` direkt, und ihr `primary`
 * IST ihr Zeigerbefehl (`updateBot` richtet die Zielrichtung auf den Gegner,
 * bevor es feuert). Deshalb lesen sie hier `primary`, Menschen `klick`.
 */
const zeigerbefehl = (spieler: RuntimePlayer): boolean =>
  (spieler.bot ? spieler.primary : spieler.klick ?? spieler.primary);

/**
 * Läuft der Auto-Modus, ohne dass gerade gezeigt wird? Nur dann suchen sich
 * Drohnen selbst ein Ziel.
 *
 * `primary && !klick` heißt genau das: Der Tank feuert (Auto-Modus an), aber
 * die Maustaste ist oben. Bots gelten immer als im Auto-Modus – sie haben
 * keinen Knopf, und ohne diese Zeile hätten Controller-Bots aufgehört zu
 * jagen, sobald ihr Ziel außer Reichweite gerät.
 */
const autoModus = (spieler: RuntimePlayer): boolean =>
  (spieler.bot ? true : spieler.primary && !zeigerbefehl(spieler));
interface RuntimeDrone extends DroneSnapshot {
  slot: number;
  contactCooldown: number;
  /** Nachladezeit der Minion-Waffe – nur an Drohnen mit `minionWaffe` gepflegt. */
  fireCooldown?: number;
  gameplayRadius?: number;
}
interface RuntimeProjectile {
  id: string;
  ownerId: string;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  integrity: number;
  maxIntegrity: number;
  damage: number;
  life: number;
}
interface DroneInternals {
  players: Map<string, RuntimePlayer>;
  drones: Map<string, RuntimeDrone>;
  shapes: Map<string, ShapeSnapshot>;
  projectiles: Map<string, RuntimeProjectile>;
  nextDroneSpawn: Map<string, number>;
  spawnDrone(owner: RuntimePlayer, slot: number): void;
  stepDrones(dt: number, now: number): void;
  damageShape(shape: ShapeSnapshot, damage: number, ownerId: string, now: number): void;
  damagePlayer(target: RuntimePlayer, damage: number, attackerId: string | null, now: number): void;
  damageDrone(drone: RuntimeDrone, damage: number, now: number): void;
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
 * Öffnungswinkel des Rechtsklick-Fächers – Sam: „Rechtsklick […] geht noch
 * wesentlich smoother."
 *
 * Der erste Rechtsklick-Fix (D3) hat den alten Spiegel-Bug behoben, aber
 * einen neuen Fehler eingeführt: Das Ziel wurde jeden Tick neu aus der
 * AKTUELLEN Position der Drohne berechnet – 260 px vor ihr, in ihre eigene
 * Fluchtrichtung. Das ist eine Möhre am Stock, keine Ankunft: Die Drohne
 * beschleunigt auf Höchsttempo und bleibt dort, bis die Leine (`LEINE`)
 * greift, statt sanft abzubremsen und stehenzubleiben.
 *
 * Jetzt ist das Ziel fest: `Besitzer + Richtung × ABSTOSS_WEG`, wobei die
 * Richtung „weg vom Zeiger" ist – aber pro Drohne um einen Fächerwinkel
 * gedreht, sonst laufen wieder alle auf denselben Punkt zusammen (genau der
 * Fehler, den D3 beheben sollte). 150° Gesamtöffnung sind breit genug für
 * eine sichtbare Front, eng genug, dass die Flotte klar „weg vom Zeiger"
 * bleibt und nicht in Cursor-Richtung zurückfächert.
 */
const FAECHER_OEFFNUNG = Math.PI * (5 / 6);

/**
 * Schwellen für den Wandtod (Sam: „Alles was gegen Wände geht sollte
 * kaputtgehen"). Beide relativ zum eigenen Archetyp-Tempo, nicht absolut –
 * damit sie mit jeder künftigen Neuabstimmung von `DROHNEN_TEMPO_SKALA`
 * mitwandern, statt still falsch zu werden.
 */
const WANDTOD_MIN_ANLAUF_ANTEIL = 0.5;
const WANDTOD_REST_ANTEIL = 0.3;
/**
 * Kein Zielpunkt liegt weiter vom Besitzer weg als `GAME.maxAimDistance` –
 * dieselbe Reichweite, die auch der Zeiger hat. Die Drohnen bleiben damit im
 * selben Kreis, in dem der Spieler zeigen kann.
 */
const LEINE = GAME.maxAimDistance;
/**
 * Grundradius des Rings, auf dem sich die Flotte um ihr gemeinsames Ziel
 * verteilt. `formationsring` weitet ihn für große Flotten auf.
 */
const FORMATION_RING = 30;
/**
 * Der Ring wächst mit der Flotte – sonst überlappen sich neun Vögel auf einem
 * 30-px-Kreis (Bogenabstand 21 px bei 17 px Körperdurchmesser) zu einem
 * einzigen Klumpen, und der ganze Zweck der Formation ist wieder weg. Der
 * Faktor 0,85 je Körper hält den Bogenabstand bei rund dem 5,3-fachen des
 * Durchmessers, unabhängig von der Flottengröße.
 */
const formationsring = (droneCount: number, koerperradius: number): number =>
  Math.max(FORMATION_RING, droneCount * koerperradius * 0.85);
/**
 * **Wie schnell dieser Ring sich dreht** – der Kern von Sams Punkt 8
 * („eins zu eins wie in Diep.io vom Feeling").
 *
 * In Diep.io steht eine Drohne nie. Sie fliegt zum Zeiger und **kreist dort**,
 * bis ein neuer Befehl kommt; genau dieses ständige Schwirren ist das Gefühl,
 * das Sam meint. Hier war der Formationsplatz eine feste Zahl je Slot: Die
 * Flotte flog hin, bremste (siehe `ANKUNFT_RADIUS`) und **parkte**. Eine
 * parkende Flotte ist ein Standbild.
 *
 * Mit einer Drehung wird aus demselben Formationsplatz ein wanderndes Ziel –
 * die Drohne kommt nie an und kreist deshalb von selbst. 2,2 rad/s sind rund
 * 2,9 Sekunden je Umlauf: schnell genug, dass es lebt, langsam genug, dass man
 * einzelne Drohnen mit dem Auge verfolgen kann.
 */
const FORMATION_DREHUNG = 2.2;
/** Über diese Zeit wird die Restdistanz abgebremst – gegen das Überschwingen. */
const BREMS_SEKUNDEN = 0.18;
/**
 * Mit wie viel Schwung eine frische Drohne aus dem Spawner kommt, als Anteil
 * ihres Archetyp-Tempos.
 *
 * In Diep.io fällt eine Drohne nicht aus der Mitte des Panzers, sie wird aus
 * dem Spawner-Rohr GESCHOSSEN und schwenkt dann in die Formation ein. Vorher
 * stand hier `position: { ...owner.position }, velocity: { x: 0, y: 0 }` – die
 * Drohne erschien im Mittelpunkt des eigenen Tanks und musste sich von dort
 * erst herausarbeiten.
 */
const SPAWN_SCHWUNG = 0.55;

interface Zielspeichereintrag {
  id: string;
  istSpieler: boolean;
}

/**
 * Wie viel weiter als der Suchradius ein GEHALTENES Ziel noch gültig bleibt –
 * Sam: „Auto-Modus […] geht noch wesentlich smoother."
 *
 * Ohne Gedächtnis wertet `sucheZiel` jeden Tick neu die kürzeste Distanz aus.
 * Liegen zwei Kandidaten fast gleich weit weg, kippt die Rangfolge bei jeder
 * kleinen Bewegung – die Flotte riss dann zwischen zwei Zielen hin und her,
 * statt bei einem zu bleiben. Ein gehaltenes Ziel bekommt zusätzlich 20 %
 * mehr Leine, damit es nicht schon beim ersten Pixel jenseits der Grenze
 * fällt und dort dasselbe Flackern erzeugt.
 */
const ZIEL_HYSTERESE = 1.2;

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
 *
 * `speicher` hält das zuletzt gewählte Ziel je Besitzer fest (siehe
 * `ZIEL_HYSTERESE`) – eine Karte pro Spiel, in `tuneDrones` angelegt.
 */
function sucheZiel(
  internals: DroneInternals,
  owner: RuntimePlayer,
  searchRadius: number,
  speicher: Map<string, Zielspeichereintrag>
): Vector2 | null {
  const reichweite = searchRadius * searchRadius;

  const gehalten = speicher.get(owner.id);
  if (gehalten) {
    const position = gehalten.istSpieler
      ? (() => {
          const spieler = internals.players.get(gehalten.id);
          return spieler && !spieler.dead && !spieler.invulnerable ? spieler.position : null;
        })()
      : internals.shapes.get(gehalten.id)?.position ?? null;
    if (
      position &&
      distanceSquared(position, owner.position) <= reichweite * ZIEL_HYSTERESE * ZIEL_HYSTERESE &&
      hasLineOfSight(owner.position, position)
    ) {
      return { ...position };
    }
    speicher.delete(owner.id);
  }

  let bester: Vector2 | null = null;
  let besteEntfernung = Infinity;
  let besteId: string | null = null;
  let besteIstSpieler = false;

  for (const kandidat of internals.players.values()) {
    if (kandidat.id === owner.id || kandidat.dead || kandidat.invulnerable) continue;
    const entfernung = distanceSquared(kandidat.position, owner.position);
    if (entfernung > reichweite || entfernung >= besteEntfernung) continue;
    besteEntfernung = entfernung;
    bester = kandidat.position;
    besteId = kandidat.id;
    besteIstSpieler = true;
  }
  if (!bester) {
    for (const form of internals.shapes.values()) {
      const entfernung = distanceSquared(form.position, owner.position);
      if (entfernung > reichweite || entfernung >= besteEntfernung) continue;
      besteEntfernung = entfernung;
      bester = form.position;
      besteId = form.id;
      besteIstSpieler = false;
    }
  }
  if (!bester || !besteId || !hasLineOfSight(owner.position, bester)) return null;
  speicher.set(owner.id, { id: besteId, istSpieler: besteIstSpieler });
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
  // Eine Karte je Spiel – `tuneDrones` läuft genau einmal pro Instanz (wie
  // die entsprechenden Karten in `perks.ts`), ein WeakMap-Umweg über das
  // Spiel selbst ist hier nicht nötig.
  const zielSpeicher = new Map<string, Zielspeichereintrag>();

  internals.spawnDrone = (owner: RuntimePlayer, slot: number): void => {
    const id = crypto.randomUUID();
    const archetype = archetypeFor(owner.playerClass);
    const maximum = archetype.health * (1 + owner.upgrades.maxHealth * 0.08) * modifierFor(owner).healthMultiplier;
    /*
     * Aus dem Spawner, nicht aus dem Mittelpunkt (siehe `SPAWN_SCHWUNG`).
     *
     * Die Richtung ist die Blickrichtung des Panzers – dort sitzt in Diep.io
     * das Spawner-Rohr. Liegt der Austrittspunkt in einer Wand, bleibt es beim
     * Mittelpunkt: Lieber eine Drohne, die sich herausarbeitet, als eine, die
     * in einer Wand steht.
     */
    const richtung = { x: Math.cos(owner.angle), y: Math.sin(owner.angle) };
    const muendung = {
      x: owner.position.x + richtung.x * (GAME.playerRadius + archetype.radius),
      y: owner.position.y + richtung.y * (GAME.playerRadius + archetype.radius)
    };
    const frei = isFree(muendung, archetype.radius);
    internals.drones.set(id, {
      id,
      ownerId: owner.id,
      position: frei ? muendung : { ...owner.position },
      velocity: frei
        ? { x: richtung.x * archetype.speed * SPAWN_SCHWUNG, y: richtung.y * archetype.speed * SPAWN_SCHWUNG }
        : { x: 0, y: 0 },
      angle: owner.angle,
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
      /*
       * Wer kein Leben mehr hat, bekommt keinen Zug.
       *
       * Der Kehraus stand früher am ENDE der Schleife („`if (drone.health <= 0)`
       * → löschen"), also nach Waffe und Kontakt. Seit der Tod über
       * `damageDrone` läuft, ist er dort nicht mehr nötig – hier oben ist er
       * aber weiterhin die Zusicherung, dass keine Drohne mit aufgebrauchtem
       * Leben noch einen Tick schießt oder rempelt, ganz gleich, welche Schicht
       * ihr das Leben genommen hat.
       */
      if (drone.health <= 0) {
        internals.damageDrone(drone, 0, now);
        continue;
      }

      const definition = CLASS_DEFINITIONS[owner.playerClass];
      const archetype = archetypeFor(owner.playerClass);
      const modifier = modifierFor(owner);
      const radius = drone.gameplayRadius ?? archetype.radius;
      const reload = reloadFor(owner);
      const damage = damageFor(owner);
      drone.contactCooldown = Math.max(0, drone.contactCooldown - dt);
      if (archetype.minionWaffe) drone.fireCooldown = Math.max(0, (drone.fireCooldown ?? 0) - dt);

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
      // Für Minion-Waffen (siehe unten): der rohe Angriffspunkt VOR der
      // Formations-Verschiebung, oder `null`, wenn dieser Tick kein Angriff
      // ist (Rückzug, Orbit). Beim Rechtsklick nie gesetzt – eine fliehende
      // Drohne feuert nicht zurück.
      let kampfziel: Vector2 | null = null;
      if (owner.secondary) {
        // Weg vom Zeiger – aber als FESTER Punkt relativ zum Besitzer, nicht
        // mehr relativ zur eigenen (wandernden) Position der Drohne. Die alte
        // Fassung hat das Ziel jeden Tick neu 260 px vor der Drohne berechnet:
        // eine Möhre am Stock, die nie ankam, sondern nur bis zur Leine
        // beschleunigte (Sam: „Rechtsklick […] geht noch wesentlich
        // smoother"). Der Fächerwinkel pro Slot verhindert dabei, dass die
        // Flotte wieder auf einem einzigen Punkt zusammenläuft – genau der
        // Fehler, den der vorige Rechtsklick-Fix schon einmal behoben hat.
        const weg = normalize({ x: owner.position.x - zeiger.x, y: owner.position.y - zeiger.y });
        const richtung = weg.x === 0 && weg.y === 0 ? { x: 1, y: 0 } : weg;
        const basiswinkel = Math.atan2(richtung.y, richtung.x);
        const faecher = definition.droneCount > 1
          ? (drone.slot / (definition.droneCount - 1) - 0.5) * FAECHER_OEFFNUNG
          : 0;
        const winkel = basiswinkel + faecher;
        ziel = { x: owner.position.x + Math.cos(winkel) * ABSTOSS_WEG, y: owner.position.y + Math.sin(winkel) * ABSTOSS_WEG };
        formation = false;
      } else if (zeigerbefehl(owner)) {
        // Geklickt heißt: dorthin. Immer, auch wenn der Auto-Modus läuft.
        ziel = zeiger;
        kampfziel = zeiger;
      } else if (autoModus(owner)) {
        // Auto-Modus und die Maustaste ist oben: Jetzt – und nur jetzt – suchen
        // sich die Drohnen selbst ein Ziel.
        const gesucht = sucheZiel(internals, owner, archetype.searchRadius, zielSpeicher);
        if (gesucht) { ziel = gesucht; kampfziel = gesucht; }
        else formation = false;
      } else {
        // Weder Klick noch Auto: Orbit, und sie greifen nichts an. Bis zum
        // 14.08. jagten sie auch hier – das war der Stand, den Sam mit „nur
        // wenn du im E-Auto-Modus bist" korrigiert hat.
        formation = false;
        zielSpeicher.delete(owner.id);
      }

      /*
       * Formation statt Pulk – und seit Sams Punkt 8 eine KREISENDE Formation.
       *
       * Jede Drohne bekommt ihren Slot-Winkel auch beim Angriff, fliegt also
       * einen eigenen Punkt auf einem kleinen Ring um das gemeinsame Ziel an.
       * Ohne das stapelt sich die ganze Flotte auf einer Koordinate und sieht
       * aus wie eine Drohne.
       *
       * Neu ist der Zeitanteil (`FORMATION_DREHUNG`): Der Platz wandert um das
       * Ziel herum, die Drohne kommt also nie an und umkreist es. Genau das
       * macht Diep.io, und genau das fehlte hier – die Flotte flog hin und
       * blieb stehen.
       *
       * Auch bei EINER Drohne (die Bedingung stand vorher auf `> 1`): Ein
       * einzelner Wächter, der auf seinem Ziel parkt, sieht genauso tot aus wie
       * sieben.
       */
      if (formation) {
        const platz = drone.slot * Math.PI * 2 / Math.max(1, definition.droneCount) + (now / 1000) * FORMATION_DREHUNG;
        const ring = formationsring(definition.droneCount, radius);
        ziel = { x: ziel.x + Math.cos(platz) * ring, y: ziel.y + Math.sin(platz) * ring };
      }
      // Leine: Kein Zielpunkt liegt weiter vom Besitzer entfernt als sein
      // Zeiger reichen kann. Ohne sie schiebt ein gehaltener Rechtsklick die
      // Flotte bis an den Kartenrand, und sie käme nicht zurück.
      const zumZiel = clampMagnitude({ x: ziel.x - owner.position.x, y: ziel.y - owner.position.y }, LEINE);
      const target = { x: owner.position.x + zumZiel.x, y: owner.position.y + zumZiel.y };

      const abstand = Math.hypot(target.x - drone.position.x, target.y - drone.position.y);
      const direction = normalize({ x: target.x - drone.position.x, y: target.y - drone.position.y });
      const travelMultiplier = modifier.moveMultiplier * modifier.projectileSpeedMultiplier;
      /*
       * Ankommen statt Überschwingen: Auf den letzten Metern wird die
       * Wunschgeschwindigkeit von der Reststrecke gedeckelt. Ohne das pendelte
       * eine Drohne am Zielpunkt mit bis zu 71 px Amplitude, weil sie mit
       * vollem Tempo hineinfuhr und erst dahinter bremste.
       *
       * Die Bremse BLEIBT, obwohl sie im Zielpunkt 0 ergibt – seit der
       * Formationsplatz wandert (`FORMATION_DREHUNG`), gibt es diesen Zielpunkt
       * nämlich nicht mehr: Die Drohne verfolgt einen mit 66 px/s kreisenden
       * Punkt und stellt sich auf rund 12 px Rückstand ein. Das ergibt einen
       * sauberen Kreis statt eines Zitterns um eine Stelle – ein Tempo-Boden
       * hätte genau dieses Zittern zurückgebracht.
       */
      const speed = Math.min(archetype.speed * travelMultiplier, abstand / BREMS_SEKUNDEN);
      drone.velocity = moveVectorToward(
        drone.velocity,
        { x: direction.x * speed, y: direction.y * speed },
        archetype.acceleration * travelMultiplier * dt
      );
      const anlaufTempo = Math.hypot(drone.velocity.x, drone.velocity.y);
      const moved = moveCircle(drone.position, drone.velocity, dt, radius);
      drone.position = moved.position;
      drone.velocity = moved.velocity;
      drone.angle = Math.atan2(drone.velocity.y, drone.velocity.x);

      /*
       * Wandtod – Sam: „Alles was gegen Wände geht sollte kaputtgehen
       * (Drohnen etc.)."
       *
       * Nicht jede Wandberührung ist ein Absturz: Beim normalen Navigieren
       * streift `moveCircle` ständig Wände (eine Achse blockiert, die andere
       * trägt weiter) – das ist Gleiten, kein Aufprall. Gemessen im echten
       * Labyrinth (`messung-drohnen-bewegung.mjs`): Ein Kopf-auf-Treffer
       * (Restgeschwindigkeit unter 30 % des Anlaufs) kommt zwanzigmal
       * seltener vor als ein solcher Streifschuss (0,21 % gegen 4,08 % aller
       * Tempo-Vergleiche). Nur der Kopf-Treffer darf töten – sonst zerlegt
       * sich die Flotte an jeder Kurve des neuen, engeren Labyrinths von
       * selbst.
       *
       * Der Mindest-Anlauf (halbes Archetyp-Tempo) filtert außerdem den
       * Fall heraus, in dem eine ohnehin fast stehende Drohne minimal an
       * einer Wand hängt – da gibt es nichts, das „einschlagen" könnte.
       */
      if (moved.collided) {
        const archetypTempo = archetype.speed * travelMultiplier;
        const restTempo = Math.hypot(drone.velocity.x, drone.velocity.y);
        if (anlaufTempo >= archetypTempo * WANDTOD_MIN_ANLAUF_ANTEIL && restTempo < anlaufTempo * WANDTOD_REST_ANTEIL) {
          internals.drones.delete(drone.id);
          internals.nextDroneSpawn.set(owner.id, now + Math.max(400, definition.droneRespawn * 1000));
          continue;
        }
      }
      /*
       * Minion-Waffe – Sam: „Factory ist noch keine Factory, sondern einfach
       * Mini-Drohnen." Ein echtes Diep.io-Minion hat ein eigenes Geschütz,
       * keinen bloß größeren Körper mit demselben Kontaktverhalten wie jede
       * andere Drohnenklasse. Das Geschütz kommt zusätzlich zum Kontakt,
       * nicht statt ihm – deshalb eigene Nachladezeit, eigene Bedingung, und
       * bewusst VOR dem `contactCooldown`-Abbruch: Ein Minion, dessen letzter
       * Rempler noch nachlädt, darf trotzdem schießen.
       *
       * `kampfziel` ist der rohe Angriffspunkt vor der Formations-Verschiebung
       * (siehe oben) – beim Rückzug oder ohne Ziel bleibt er `null`, und es
       * wird nicht geschossen. Sichtlinie wird von der DROHNE aus geprüft,
       * nicht vom Besitzer: Die Formation kann eine Drohne an eine Stelle
       * verschieben, an der eine Wand im Weg steht, obwohl der Besitzer freie
       * Sicht hat.
       */
      if (archetype.minionWaffe && kampfziel && (drone.fireCooldown ?? 0) <= 0) {
        const waffe = archetype.minionWaffe;
        const zumZiel2 = { x: kampfziel.x - drone.position.x, y: kampfziel.y - drone.position.y };
        const entfernung = Math.hypot(zumZiel2.x, zumZiel2.y);
        const reichweite = waffe.projectileSpeed * waffe.projectileLife;
        if (entfernung > 0.001 && entfernung <= reichweite && hasLineOfSight(drone.position, kampfziel)) {
          const richtung = { x: zumZiel2.x / entfernung, y: zumZiel2.y / entfernung };
          const id = crypto.randomUUID();
          internals.projectiles.set(id, {
            id,
            ownerId: owner.id,
            position: { x: drone.position.x + richtung.x * (radius + waffe.projectileRadius), y: drone.position.y + richtung.y * (radius + waffe.projectileRadius) },
            velocity: { x: richtung.x * waffe.projectileSpeed, y: richtung.y * waffe.projectileSpeed },
            radius: waffe.projectileRadius,
            integrity: 1,
            maxIntegrity: 1,
            damage: waffe.damage,
            life: waffe.projectileLife
          });
          drone.fireCooldown = waffe.reload;
        }
      }

      /*
       * Kontakt – Sam, 14.08.: „[Drohnen] fliegen auch einfach wie Schüsse
       * durch Objekte durch, obwohl sie die entweder killen oder dort sterben
       * sollten."
       *
       * Die Berührung wird JEDEN Tick aufgelöst, der Schaden nur, wenn der
       * Rempler nachgeladen hat. Vorher stand `if (contactCooldown > 0)
       * continue;` ganz oben – eine Drohne mit laufender Nachladezeit
       * durchquerte das Quadrat, das sie gerade gebissen hatte, ungebremst.
       */
      const shape = [...internals.shapes.values()].find(
        (candidate) => distanceSquared(candidate.position, drone.position) <= Math.pow(candidate.radius + radius, 2)
      );
      const targetPlayer = shape ? undefined : [...internals.players.values()].find(
        (candidate) => !candidate.dead && !candidate.invulnerable && candidate.id !== owner.id &&
          distanceSquared(candidate.position, drone.position) <= Math.pow(GAME.playerRadius + radius, 2)
      );
      if (shape) schiebeAuseinander(drone, shape.position, shape.radius + radius, (position) => isFree(position, radius));
      else if (targetPlayer) schiebeAuseinander(drone, targetPlayer.position, GAME.playerRadius + radius, (position) => isFree(position, radius));

      if (drone.contactCooldown > 0) continue;
      if (shape) {
        internals.damageShape(shape, damage, owner.id, now);
        internals.damageDrone(drone, SHAPE_CONFIG[shape.kind].bodyDamage, now);
        drone.contactCooldown = reload;
      } else if (targetPlayer) {
        internals.damagePlayer(targetPlayer, damage, owner.id, now);
        internals.damageDrone(drone, bodyDamageFor(targetPlayer) * 0.5, now);
        drone.contactCooldown = reload;
      }
    }
  };

  /*
   * Der Tod einer Drohne – die Naht aus `game.ts`, hier mit der Nachschubregel
   * dieser Schicht (`Math.max(400, …)`).
   *
   * Sie wird jetzt von DREI Seiten aufgerufen: vom Kontakt oben, vom Wandtod
   * und – neu, Sams Punkt 7 – von `stepProjectiles`. Deshalb ist sie eine
   * ersetzbare Methode und keine dreimal abgeschriebene Buchführung.
   */
  internals.damageDrone = (drone: RuntimeDrone, schaden: number, now: number): void => {
    drone.health -= Math.max(0, schaden);
    if (drone.health > 0) return;
    internals.drones.delete(drone.id);
    const owner = internals.players.get(drone.ownerId);
    if (!owner) return;
    internals.nextDroneSpawn.set(owner.id, now + Math.max(400, CLASS_DEFINITIONS[owner.playerClass].droneRespawn * 1000));
  };

  return game;
}
