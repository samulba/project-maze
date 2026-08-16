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
import type { Drohnenform } from '@project-maze/shared/drone-shape';
import { MazeGame } from './game.js';
import { clampMagnitude, distanceSquared, moveVectorToward, normalize, schiebeAuseinander, schwarmAbstand } from './physics.js';
import { SHAPE_CONFIG, hasLineOfSight, isFree, moveCircle } from './world.js';

interface DroneArchetype {
  /**
   * Die gezeichnete Form (Teil D des Klassenauftrags). Bis dahin war jede
   * Drohne in allen zehn Klassen ein Dreieck – der letzte Ort, an dem sich die
   * Drohnenklassen NICHT unterschieden haben.
   */
  form: Drohnenform;
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
  drone: { health: 36, speed: 440, acceleration: 1450, radius: 9, form: 'triangle', orbitRadius: 82, searchRadius: 520 },
  warden: { health: 39.6, speed: 480, acceleration: 1650, radius: 9, form: 'diamond', orbitRadius: 88, searchRadius: 560 },
  // Minion-Waffe (siehe `MinionWaffe`): moderates Tempo, kurze Reichweite –
  // ein Vorstoß, kein Ersatz für die Hauptwaffe des Besitzers. Schaden und
  // Nachladezeit gemessen gegen die reinen Kontaktarchetypen derselben Stufe
  // in messung-drohnen-minions.mjs; Reichweite bewusst kleiner als der
  // Suchradius, damit ein Minion erst kurz vor dem Kontakt zu schießen
  // beginnt und nicht quer durchs halbe Suchfeld feuert.
  factory: {
    health: 52.2, speed: 390, acceleration: 1250, radius: 10, form: 'square', orbitRadius: 86, searchRadius: 540,
    minionWaffe: { damage: 6, reload: 1.1, projectileSpeed: 460, projectileLife: 0.65, projectileRadius: 5 }
  },
  overseer: { health: 30.6, speed: 510, acceleration: 1780, radius: 8, form: 'small-triangle', orbitRadius: 94, searchRadius: 620 },
  carrier: {
    health: 57.6, speed: 350, acceleration: 1050, radius: 10, form: 'rectangle', orbitRadius: 92, searchRadius: 580,
    minionWaffe: { damage: 7.5, reload: 1.2, projectileSpeed: 430, projectileLife: 0.74, projectileRadius: 5.5 }
  },
  guardian: { health: 48.6, speed: 380, acceleration: 1200, radius: 11, form: 'shield-kite', orbitRadius: 62, searchRadius: 420 },
  hive: { health: 19.8, speed: 530, acceleration: 1900, radius: 6, form: 'micro-diamond', orbitRadius: 100, searchRadius: 700 },
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

  sentinel: { health: 68.4, speed: 340, acceleration: 1020, radius: 14, form: 'hexagon', orbitRadius: 70, searchRadius: 460 },
  // „Neun flinke Voegel" – leicht und schnell, zwischen hive (10 x 18) und
  // overseer (8 x 28). Flotte 207.
  aviary: { health: 23.4, speed: 545, acceleration: 1850, radius: 7, form: 'chevron', orbitRadius: 104, searchRadius: 720 },
  // Apex der Familie: „Sieben Waechter, ein Wille." Flotte 462 – oberhalb von
  // carrier (432), wie es sich fuer eine Endstufe auf Level 42 gehoert.
  sovereign: { health: 43.2, speed: 430, acceleration: 1400, radius: 10, form: 'royal-kite', orbitRadius: 88, searchRadius: 640 }
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
  /**
   * Das Formenraster der Basis (`game.ts`), einmal je Tick gebaut. Diese
   * Schicht ERSETZT `stepDrones` und löst die Berührung seit Sams Punkt 7 in
   * JEDEM Tick auf – der lineare Durchlauf über alle 562 Formen war damit
   * 160 × je Tick statt nur, wenn der Rempler nachgeladen hatte, und allein
   * ein Drittel der Tickzeit (gemessen 14.08.).
   */
  formenraster: { finde(position: Vector2, radius: number, passt?: (kandidat: ShapeSnapshot) => boolean): ShapeSnapshot | undefined };
  /** Dasselbe für Drohnen – gebraucht für die Eigenkollisionen des Schwarms. */
  drohnenraster: { finde(position: Vector2, radius: number, passt?: (kandidat: RuntimeDrone) => boolean): RuntimeDrone | undefined; entwerten(): void };
  gegnerAmPunkt(position: Vector2, radius: number, ownerId: string): RuntimePlayer | undefined;
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
/**
 * Die Bewegungswerte je Drohnenklasse – Teil D des finalen Klassenauftrags.
 *
 * ## Warum das die Recherche vom 16.08. ersetzt
 *
 * Sams Recherche (DiepInDepth, arras.io-Quellcode) beschreibt für Diep.io
 * **kein** Ankommen: dauerhafter Schub, Trägheit, Überschießen, Umkreisen des
 * Cursors. Genau so war es hier auch gebaut. Der Auftrag weicht davon
 * ausdrücklich ab und begründet es mit derselben Beobachtung, die diese
 * Umsetzung gestern gemessen hat:
 *
 * > „Die Flotte folgt bewusst keinem weit ausschwingenden Orbit um den
 * > Mauspunkt. In offenen Arenen wirkt Überschwingen lebendig; in 320-px-Gängen
 * > erzeugt es hingegen zufällige Wandtode."
 *
 * Gemessen war das drastisch: Mit vollem Schub und ohne Ankunftsbremse war die
 * Flotte nach 60 Ticks leer, weil die weiten Bögen in die Gangwände liefen.
 * Diep.io hat diese Wände nicht, Mazers schon.
 *
 * Also: stabile Slots, kritisch gedämpfte Ankunft, kein Umkreisen.
 */
interface Drohnensteuerung {
  /** Höchstgeschwindigkeit in px/s. */
  vMax: number;
  /** Beschleunigungsdeckel in px/s². */
  beschleunigung: number;
  /** Harte Leine zum Besitzer in px. */
  leine: number;
  /** Ruheorbit: Radius in px und Winkelgeschwindigkeit in rad/s. */
  orbit: number;
  drehung: number;
}

const STEUERUNG: Partial<Record<PlayerClass, Drohnensteuerung>> = {
  drone: { vMax: 540, beschleunigung: 1600, leine: 560, orbit: 72, drehung: 1.35 },
  warden: { vMax: 500, beschleunigung: 1450, leine: 500, orbit: 78, drehung: 1.55 },
  factory: { vMax: 400, beschleunigung: 900, leine: 500, orbit: 82, drehung: 0.85 },
  guardian: { vMax: 460, beschleunigung: 1250, leine: 420, orbit: 60, drehung: 1.7 },
  sentinel: { vMax: 380, beschleunigung: 750, leine: 470, orbit: 92, drehung: 0.65 },
  overseer: { vMax: 590, beschleunigung: 1900, leine: 680, orbit: 88, drehung: 1.45 },
  carrier: { vMax: 390, beschleunigung: 850, leine: 560, orbit: 96, drehung: 0.72 },
  hive: { vMax: 650, beschleunigung: 2300, leine: 610, orbit: 84, drehung: 2.1 },
  aviary: { vMax: 700, beschleunigung: 2600, leine: 720, orbit: 94, drehung: 1.9 },
  sovereign: { vMax: 560, beschleunigung: 1700, leine: 650, orbit: 86, drehung: 1.6 }
};

const steuerungFuer = (klasse: PlayerClass): Drohnensteuerung =>
  STEUERUNG[klasse] ?? STEUERUNG.drone!;

/** Slotabstand in Drohnenradien (Auftrag, Teil D: „Abstand ist 2,4 × Drohnenradius"). */
const SLOT_ABSTAND = 2.4;
/** Bremsfaktor: Zielgeschwindigkeit ist `min(vMax, BREMSE × Distanz)`. */
const BREMSE = 5;
/** Restgeschwindigkeit, die am Slot noch erlaubt ist. */
const REST_TEMPO = 18;
/** Ab Leine + diesem Abstand ignoriert eine Drohne Eingaben und kehrt heim. */
const LEINEN_TOLERANZ = 24;
/** Ab Leine + diesem Abstand wird sie zerstört (Schutz gegen Desync/Teleport). */
const LEINEN_TOD = 120;
/** Tempo auf dem Heimweg, als Faktor auf vMax. */
const HEIMKEHR_TEMPO = 1.15;
/** Öffnung der Abwehrfront beim Abstoßen, in Grad. */
const ABWEHR_FRONT = 110;
/** Vorausschau des Wand-Raycasts: mindestens so weit, sonst Tempo × dieser Zeit. */
const WAND_VORSCHAU = 48;
const WAND_VORSCHAU_SEKUNDEN = 0.16;
/** Anteil der Lenkbeschleunigung, der bei erkannter Wand auf die Tangente geht. */
const WAND_AUSWEICHEN = 0.7;
/** Drehrate der Ausrichtung („smoothToTarget"), je Sekunde. */
const DREH_RATE = 11;

/** Gerade oder ungerade Spieler-Id – bestimmt die Orbitrichtung (Teil D). */
function idIstGerade(id: string): boolean {
  let summe = 0;
  for (let i = 0; i < id.length; i += 1) summe += id.charCodeAt(i);
  return summe % 2 === 0;
}

/** Kürzester Weg von einem Winkel zum anderen, anteilig. */
function drehenNach(von: number, nach: number, anteil: number): number {
  let differenz = (nach - von) % (Math.PI * 2);
  if (differenz > Math.PI) differenz -= Math.PI * 2;
  if (differenz < -Math.PI) differenz += Math.PI * 2;
  return von + differenz * anteil;
}

/**
 * Grundradius des Rings, auf dem sich die Flotte um ihr gemeinsames Ziel
 * verteilt. `formationsring` weitet ihn für große Flotten auf.
 */
const FORMATION_RING = 30;
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
      gameplayRadius: archetype.radius,
      form: archetype.form
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
      /*
       * Nur noch EINE Frage bleibt hier: Gibt es ein Angriffsziel?
       *
       * Wohin die einzelne Drohne fliegt, entscheidet danach die Slot-Rechnung
       * aus Teil D. Die alte Kette („Ziel setzen, dann Formation draufrechnen")
       * ist damit aufgelöst; `kampfziel` bleibt, weil die Minion-Waffen von
       * Factory und Carrier wissen müssen, ob dieser Tick ein Angriff ist.
       */
      let kampfziel: Vector2 | null = null;
      if (owner.secondary) {
        // Abstoßen ist kein Angriff – eine fliehende Drohne feuert nicht zurück.
        kampfziel = null;
      } else if (owner.primary) {
        /*
         * **Auto-Fire ist nicht Auto-Aim** (Sams Recherche vom 16.08.):
         * Linksklick UND gehaltenes Auto-Feuer führen dieselbe manuelle
         * Steuerung aus. `primary` ist Klick ODER Auto-Feuer und deckt damit
         * genau diesen Fall ab. Teil D ändert daran nichts – es ändert nur,
         * WIE die Flotte den Zeiger anfliegt.
         */
        kampfziel = zeiger;
      } else {
        // Gar nichts gedrückt: eigene Zielsuche, sonst Schutzorbit.
        kampfziel = sucheZiel(internals, owner, archetype.searchRadius, zielSpeicher) ?? null;
      }

      /*
       * **Slots statt gemeinsamem Zielpunkt** – Teil D des finalen
       * Klassenauftrags. Das ersetzt die Fassung vom 16.08., die dem Vorbild
       * folgte (ein Zielpunkt für alle, Überschießen, Umkreisen). Der Auftrag
       * begründet die Abweichung selbst, und die Messung von gestern sagt
       * dasselbe:
       *
       * > „In offenen Arenen wirkt Überschwingen lebendig; in 320-px-Gängen
       * > erzeugt es hingegen zufällige Wandtode."
       *
       * Gemessen war das drastisch: mit weiten Bögen war die Flotte nach 60
       * Ticks leer.
       */
      const steuerung = steuerungFuer(owner.playerClass);
      const flotte = Math.max(1, definition.droneCount);
      const slotAbstand = SLOT_ABSTAND * radius;

      let slot: Vector2;
      if (owner.secondary) {
        /*
         * Abstoßen: Sollpunkt ist `Tank − norm(Maus − Tank) × Leine`, die
         * Formation verteilt sich auf eine 110°-Abwehrfront. Das ist echtes
         * Wegdrücken von der Zeigerrichtung, kein Rückruf.
         */
        const weg = normalize({ x: owner.position.x - zeiger.x, y: owner.position.y - zeiger.y });
        const richtung = weg.x === 0 && weg.y === 0 ? { x: 1, y: 0 } : weg;
        const basis = Math.atan2(richtung.y, richtung.x);
        const anteil = flotte > 1 ? (drone.slot / (flotte - 1) - 0.5) : 0;
        const winkel = basis + anteil * (ABWEHR_FRONT * Math.PI / 180);
        slot = { x: owner.position.x + Math.cos(winkel) * steuerung.leine, y: owner.position.y + Math.sin(winkel) * steuerung.leine };
        kampfziel = null;
      } else if (owner.primary) {
        /*
         * Zeigerbefehl: Formationszentrum ist die Mausposition, auf die Leine
         * begrenzt. Die Slots liegen SENKRECHT zur Tank-Maus-Achse – eine Reihe
         * quer zur Blickrichtung, kein Ring um den Cursor.
         */
        const zumZeiger = clampMagnitude({ x: zeiger.x - owner.position.x, y: zeiger.y - owner.position.y }, steuerung.leine);
        const mitte = { x: owner.position.x + zumZeiger.x, y: owner.position.y + zumZeiger.y };
        const achse = normalize(zumZeiger);
        const quer = achse.x === 0 && achse.y === 0 ? { x: 0, y: 1 } : { x: -achse.y, y: achse.x };
        const platz = (drone.slot - (flotte - 1) / 2) * slotAbstand;
        slot = { x: mitte.x + quer.x * platz, y: mitte.y + quer.y * platz };
        kampfziel = mitte;
      } else if (kampfziel) {
        // Selbst gesuchtes Ziel: dieselbe Querreihe wie beim Zeigerbefehl.
        const zumZiel = clampMagnitude({ x: kampfziel.x - owner.position.x, y: kampfziel.y - owner.position.y }, steuerung.leine);
        const mitte = { x: owner.position.x + zumZiel.x, y: owner.position.y + zumZiel.y };
        const achse = normalize(zumZiel);
        const quer = achse.x === 0 && achse.y === 0 ? { x: 0, y: 1 } : { x: -achse.y, y: achse.x };
        const platz = (drone.slot - (flotte - 1) / 2) * slotAbstand;
        slot = { x: mitte.x + quer.x * platz, y: mitte.y + quer.y * platz };
      } else {
        /*
         * Ruhe: phasenversetzter Schutzorbit. Der Sollwinkel ist
         * `2π × Slot / Flotte`; die Drehrichtung hängt an der Spieler-Id –
         * gerade im Uhrzeigersinn, ungerade dagegen. Dadurch drehen nicht alle
         * Flotten der Arena gleich, innerhalb einer Flotte bleiben die Slots
         * aber stabil.
         */
        const richtung = idIstGerade(owner.id) ? 1 : -1;
        const winkel = (drone.slot / flotte) * Math.PI * 2 + richtung * (now / 1000) * steuerung.drehung;
        slot = { x: owner.position.x + Math.cos(winkel) * steuerung.orbit, y: owner.position.y + Math.sin(winkel) * steuerung.orbit };
      }

      /*
       * Die harte Leine. Jenseits von Leine + 24 px ignoriert die Drohne jede
       * Eingabe und kehrt heim; jenseits von Leine + 120 px stirbt sie, damit
       * ein Desync oder Teleport keine unendlichen Drohnen erzeugt.
       */
      const heimAbstand = Math.hypot(drone.position.x - owner.position.x, drone.position.y - owner.position.y);
      let heimkehr = false;
      if (heimAbstand > steuerung.leine + LEINEN_TOD) { internals.damageDrone(drone, drone.health, now); continue; }
      if (heimAbstand > steuerung.leine + LEINEN_TOLERANZ) { slot = owner.position; heimkehr = true; kampfziel = null; }

      /*
       * Kritisch gedämpfte Ankunft: Die Wunschgeschwindigkeit fällt linear mit
       * der Reststrecke (`BREMSE × Distanz`), gedeckelt auf `vMax`. Bei einer
       * Standarddrohne beginnt das Bremsen damit unter 108 px. Am Slot bleibt
       * höchstens `REST_TEMPO` übrig – kein Umkreisen, kein Zittern.
       */
      const zumSlot = { x: slot.x - drone.position.x, y: slot.y - drone.position.y };
      const abstand = Math.hypot(zumSlot.x, zumSlot.y);
      const richtungSlot = normalize(zumSlot);
      const travelMultiplier = modifier.moveMultiplier * modifier.projectileSpeedMultiplier;
      const vMax = steuerung.vMax * travelMultiplier * (heimkehr ? HEIMKEHR_TEMPO : 1);
      const wunschTempo = Math.min(vMax, Math.max(abstand <= 1 ? 0 : REST_TEMPO, BREMSE * abstand));
      let wunsch = { x: richtungSlot.x * wunschTempo, y: richtungSlot.y * wunschTempo };

      /*
       * Wandausweichen ohne Wegfindung: ein Vorwärts-Raycast; steht dort eine
       * Wand, wandern 70 % der Lenkung auf die Wandtangente. Der Kontakt bleibt
       * tödlich – das Labyrinth soll eine Fähigkeit bleiben, kein Autopilot.
       */
      const tempoJetzt = Math.hypot(drone.velocity.x, drone.velocity.y);
      const vorschau = Math.max(WAND_VORSCHAU, tempoJetzt * WAND_VORSCHAU_SEKUNDEN);
      const spitze = { x: drone.position.x + richtungSlot.x * vorschau, y: drone.position.y + richtungSlot.y * vorschau };
      if (!isFree(spitze, radius)) {
        const tangente = { x: -richtungSlot.y, y: richtungSlot.x };
        const seite = (tangente.x * drone.velocity.x + tangente.y * drone.velocity.y) >= 0 ? 1 : -1;
        wunsch = {
          x: wunsch.x * (1 - WAND_AUSWEICHEN) + tangente.x * seite * wunschTempo * WAND_AUSWEICHEN,
          y: wunsch.y * (1 - WAND_AUSWEICHEN) + tangente.y * seite * wunschTempo * WAND_AUSWEICHEN
        };
      }

      // Beschleunigung ist auf den Klassenwert gedeckelt.
      drone.velocity = moveVectorToward(drone.velocity, wunsch, steuerung.beschleunigung * travelMultiplier * dt);
      const anlaufTempo = Math.hypot(drone.velocity.x, drone.velocity.y);
      const moved = moveCircle(drone.position, drone.velocity, dt, radius);
      drone.position = moved.position;
      drone.velocity = moved.velocity;
      // Ausrichtung weich zum Slot (arras.io: „smoothToTarget").
      drone.angle = drehenNach(drone.angle, Math.atan2(zumSlot.y, zumSlot.x), 1 - Math.exp(-DREH_RATE * dt));

      const nachbar = internals.drohnenraster.finde(
        drone.position,
        radius,
        (kandidat) => kandidat.id !== drone.id && kandidat.ownerId === drone.ownerId
      );
      if (nachbar) {
        const nachbarradius = nachbar.gameplayRadius ?? 12;
        schwarmAbstand(drone, nachbar.position, radius + nachbarradius, (position) => isFree(position, radius));
      }

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
      const shape = internals.formenraster.finde(drone.position, radius);
      const targetPlayer = shape ? undefined : internals.gegnerAmPunkt(drone.position, radius, owner.id);
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
