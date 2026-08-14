export const PLAYER_CLASS_IDS = [
  'core',
  'rapid',
  'sniper',
  'drone',
  'rammer',
  'twin',
  'repeater',
  'railgun',
  'hunter',
  'warden',
  'factory',
  'crusher',
  'bulwark',
  'storm',
  'gatling',
  'lancer',
  'phantom',
  'overseer',
  'carrier',
  'juggernaut',
  'fortress',
  'flanker',
  'octo',
  'arbalest',
  'deadeye',
  'guardian',
  'hive',
  'blitz',
  'comet',
  // Klassen 4.0 (Welle A): vier Apex-Klassen fuer die Altfamilien und zwei
  // komplette neue Familien. Anhaengen statt einsortieren - Reihenfolge ist
  // Teil der Kurz-ID-Abbildung im Netz.
  'vortex',
  'eclipse',
  'sovereign',
  'leviathan',
  'specter',
  'wraith',
  'shade',
  'mirage',
  'revenant',
  'eidolon',
  'tempest',
  'scorch',
  'surge',
  'inferno',
  'overload',
  'cataclysm',
  // Klassen 4.1: zwei weitere Familien (SIEGE, AEGIS) und vier neue Zweige in
  // den bestehenden. Anhaengen statt einsortieren - die Reihenfolge ist Teil
  // der Kurz-ID-Abbildung im Netz.
  'siege', 'bombard', 'mortar', 'howitzer', 'trebuchet', 'ragnarok',
  'aegis', 'bulwarker', 'reflector', 'paladin', 'retributor', 'sanctum',
  'vanguard', 'hailstorm',
  'ballista', 'siegebreaker',
  'sentinel', 'aviary',
  'rampart', 'behemoth',
  // Klassen 4.2, Stufe 4, Schritt 3: die beiden fehlenden Archetypen.
  // Anhaengen statt einsortieren, aus demselben Grund wie oben.
  'smasher', 'trapper'
] as const;

export type PlayerClass = (typeof PLAYER_CLASS_IDS)[number];

export const UPGRADE_IDS = [
  // Die acht Basiswerte behalten Reihenfolge und Index: Die Delta-Signatur des
  // Snapshots, der Hydrator im Client und die Tastenbelegung 1–8 hängen daran.
  'maxHealth',
  'regen',
  'moveSpeed',
  'reload',
  'damage',
  'projectileSpeed',
  'penetration',
  'bodyDamage',
  /**
   * Familien-Slots (Klassen 3.0/KL4). Wie `PlayerSnapshot.signature` ergibt
   * sich die Bedeutung aus der Familie des Spielers:
   *   RAPID     signatureRate = Momentum-Aufbau   · signaturePower = Nachladeabschlag
   *   IMPACT    signatureRate = Anlauf-Tempo      · signaturePower = Wucht-Skalierung
   *   PRECISION signatureRate = Ladetempo         · signaturePower = Ladebonus
   *   CONTROL   signatureRate = Budget-Nachschub  · signaturePower = Einheitenstärke
   * Ohne Familie (Core) sind beide gesperrt. Der Server entscheidet über
   * `FAMILY_UPGRADES_ENABLED`, ob und für welche Familien sie kaufbar sind.
   */
  'signatureRate',
  'signaturePower',
  /**
   * Klassen 4.0 (Welle A): zwei weitere Basis-Slots, angehaengt hinter den
   * Familien-Slots, damit alle bestehenden Indizes stehen bleiben.
   *   projectileRange  +6 % Projektil-Lebenszeit je Punkt (= echte Reichweite;
   *                    ersetzt den frueheren, unbeabsichtigten Bonus des
   *                    Tempo-Upgrades durch eine bewusste Entscheidung)
   *   moduleCooldown   -5 % Modul-Abklingzeit je Punkt (Dash/Barriere/...)
   */
  'projectileRange',
  'moduleCooldown'
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];

/**
 * Upgrades, die nur an Projektilen hängen.
 *
 * Zehn Klassen der CONTROL-Familie haben **kein einziges Rohr** – sie kämpfen
 * ausschließlich mit Drohnen. Für sie tun diese drei Werte nachweislich nichts:
 * `projectileSpeed`, `penetration` und `projectileRange` werden im Server nur
 * dort gelesen, wo aus einem Rohr etwas herauskommt (`combat-tuning.ts`,
 * `game.ts`, `projectile-speed.ts`). Trotzdem standen sie im Panel, ließen sich
 * kaufen und verbrauchten einen Punkt.
 *
 * Das ist der Kern von Sams „es gibt jetzt zu viele Upgrades INGAME": Für einen
 * Controller waren fünf der zwölf Plätze wertlos – diese drei plus die beiden
 * Familien-Slots, die seiner Familie nicht offenstehen.
 */
export const PROJECTILE_UPGRADE_IDS = ['projectileSpeed', 'penetration', 'projectileRange'] as const;

/**
 * Wirkt dieses Upgrade bei dieser Klasse überhaupt?
 *
 * Die Antwort hängt an einer einzigen Frage – hat die Klasse ein Rohr? –, und
 * genau deshalb steht sie hier in `shared` und nicht doppelt in Client und
 * Server: Der Client blendet aus, was nichts tut, der Server lehnt es ab.
 * Fiele die Antwort an den beiden Orten unterschiedlich aus, gäbe es wieder
 * einen Knopf, der einen Punkt frisst.
 *
 * Familien-Slots sind hier **nicht** enthalten: Ob die offenstehen, hängt nicht
 * an der Klasse, sondern daran, welche Signatures der Server eingehängt hat –
 * das weiß nur er (`apps/server/src/family-upgrades.ts`).
 */
/**
 * Die beiden Slots, die an der Familien-Signature hängen.
 *
 * Sie werden ausschliesslich in den Familien-Tunern gelesen
 * (`momentumConfigFor`, `stellungConfigFor`, …), und die greifen nur bei
 * Klassen ihrer Familie. Wer zu keiner Familie gehört, hat hier zwei tote
 * Plätze.
 */
export const SIGNATURE_UPGRADE_IDS = ['signatureRate', 'signaturePower'] as const;

/**
 * Wirkt dieses Upgrade bei dieser Klasse überhaupt?
 *
 * Zwei Regeln, beide aus demselben Befund: Ein Platz, der nichts tut, kostet
 * trotzdem einen Punkt – und der Punkt ist weg.
 *
 * 1. **Projektil-Upgrades brauchen ein Rohr.** Kugeltempo, Durchschlag und
 *    Reichweite werden im Server nur dort gelesen, wo aus einem Rohr etwas
 *    herauskommt. Für die zehn Drohnenklassen waren drei der zwölf Plätze
 *    wirkungslos (Sams „es gibt jetzt zu viele Upgrades INGAME").
 * 2. **Signature-Upgrades brauchen eine Familie.** `core` gehört zu keiner der
 *    acht – gemessen: null von acht `is…Class`-Prüfungen trifft zu. Das ist
 *    nicht nur ein Randfall der Stufen 2 bis 4: `respawnClassFrom` setzt nach
 *    JEDEM Tod auf `core` zurück, und zwar auf halber Stufe mit allen Punkten.
 *    Wer auf Stufe 60 stirbt, steht als `core` mit 29 Punkten da – und zwei der
 *    zwölf Plätze tun nichts.
 */
export function upgradeAppliesTo(playerClass: PlayerClass, upgrade: UpgradeId): boolean {
  if ((PROJECTILE_UPGRADE_IDS as readonly string[]).includes(upgrade)) {
    return CLASS_DEFINITIONS[playerClass].barrelCount > 0;
  }
  if ((SIGNATURE_UPGRADE_IDS as readonly string[]).includes(upgrade)) {
    return CLASS_DEFINITIONS[playerClass].branch !== 'core';
  }
  return true;
}
export type ShapeKind = 'square' | 'triangle' | 'pentagon';
export type ThemeId = 'midnight' | 'void' | 'classic';

export interface Vector2 { x: number; y: number; }
/** `aim` is a world-space offset. Bullet classes use direction; drones also use magnitude. */
export interface InputMessage { type: 'input'; sequence: number; move: Vector2; aim: Vector2; primary: boolean; secondary: boolean; }
/** `authToken` ist optional: Gast-Spielen bleibt immer möglich, Login heftet nur das Konto an. */
/**
 * `deviceId` ist eine Zufalls-ID aus dem localStorage des Browsers und dient
 * einzig der Besuchszählung im Admin-Portal (siehe `apps/client/src/device-id.ts`).
 * Optional: Ohne sie spielt man unveraendert, nur ungezaehlt.
 */
export interface JoinMessage { type: 'join'; name: string; authToken?: string; deviceId?: string; }
export interface UpgradeMessage { type: 'upgrade'; upgrade: UpgradeId; }
export interface ChooseClassMessage { type: 'chooseClass'; playerClass: PlayerClass; }
export interface RespawnMessage { type: 'respawn'; }
export interface PingMessage { type: 'ping'; sentAt: number; }
export type ClientMessage = InputMessage | JoinMessage | UpgradeMessage | ChooseClassMessage | RespawnMessage | PingMessage;

export interface UpgradeLevels {
  maxHealth: number;
  regen: number;
  moveSpeed: number;
  reload: number;
  damage: number;
  projectileSpeed: number;
  penetration: number;
  bodyDamage: number;
  signatureRate: number;
  signaturePower: number;
  projectileRange: number;
  moduleCooldown: number;
}

export interface ClassDefinition {
  id: PlayerClass;
  label: string;
  description: string;
  parent: PlayerClass | null;
  unlockLevel: number;
  branch: 'core' | 'rapid' | 'precision' | 'control' | 'impact' | 'specter' | 'tempest' | 'siege' | 'aegis';
  /**
   * Apex-Klassen (L42) sind aus JEDER Klasse ihrer Familie erreichbar, nicht
   * nur aus einem Pfad - `availableClassChoices` wertet dieses Feld aus. Der
   * `parent` zeigt fuer die Respawn-Rueckstufung auf den Familien-Starter.
   */
  apexOf?: 'rapid' | 'precision' | 'control' | 'impact' | 'specter' | 'tempest' | 'siege' | 'aegis';
  maxHealth: number;
  regen: number;
  acceleration: number;
  moveSpeed: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  damage: number;
  projectileRadius: number;
  penetration: number;
  bodyDamage: number;
  barrelCount: number;
  barrelSpread: number;
  barrelLength: number;
  /** Feste Laufwinkel relativ zur Zielrichtung (z. B. Heckläufe). Ersetzt das Spread-Layout. */
  barrelAngles?: number[];
  /**
   * Pro-Lauf-Profile (Klassen 4.2, Stufe 4, Schritt 2 – Plan „26-plan-rework":
   * „Das ist der Schritt, der Spreadshot von Penta trennt."). Ohne dieses
   * Feld feuert jeder Lauf mit demselben `damage`/`projectileSpeed` – ein
   * Fächer aus vier Läufen und ein Fächer aus acht Läufen unterscheiden sich
   * dann nur in der Zahl, nicht im Gefühl. Mit `barrels` bekommt jeder Lauf
   * seinen eigenen Winkel (ersetzt `barrelAngles`, wenn gesetzt) sowie einen
   * Schaden-/Tempo-Faktor (Standard je 1). Die Summe der `damageScale`-Werte
   * sollte `barrelCount` ergeben, damit der Gesamtschaden pro Sekunde – die
   * Zahl, mit der `damage` in jeder Balance-Rechnung auftaucht – unverändert
   * bleibt und nur die Verteilung ÜBER die Läufe wechselt.
   */
  barrels?: Array<{ angle: number; damageScale?: number; speedScale?: number }>;
  /**
   * Salve statt Fächer (Klassen 4.2, Stufe 4 – Sam: „Der eine schießt drei
   * nach vorne, der andere zwei.") – dieselben `barrelCount` Schüsse, aber
   * nacheinander statt gleichzeitig, mit dieser Pause dazwischen. Unbesetzt
   * (Standard): alle Läufe feuern in einem Frame, wie bisher. Bleibt klar
   * innerhalb von `reload`, damit sich am Gesamtschaden pro Sekunde nichts
   * ändert – nur am Gefühl.
   */
  burstDelay?: number;
  /**
   * Stehendes Projektil (Klassen 4.2, Stufe 4, Schritt 3 – Trapper): Sekunden
   * Flugzeit, nach denen ein Schuss auf der Stelle stehen bleibt (Tempo 0)
   * statt weiterzufliegen – die verbleibende `projectileLife` läuft als
   * liegengebliebene Falle weiter, mit derselben Trefferlogik wie jedes
   * andere Projektil. Unbesetzt (Standard): Schüsse fliegen bis zum Ende
   * ihrer Lebenszeit, wie bisher.
   */
  trapAfter?: number;
  droneCount: number;
  droneRespawn: number;
}

const classDef = (definition: ClassDefinition): ClassDefinition => definition;

export const CLASS_DEFINITIONS: Record<PlayerClass, ClassDefinition> = {
  core: classDef({
    id: 'core', label: 'Core', description: 'Stabiler Allrounder für Farming und erste Kämpfe.', parent: null,
    unlockLevel: 1, branch: 'core', maxHealth: 110, regen: 2.2, acceleration: 1500, moveSpeed: 270,
    reload: 0.3, projectileSpeed: 820, projectileLife: 1.55, damage: 16, projectileRadius: 7,
    penetration: 20, bodyDamage: 13, barrelCount: 1, barrelSpread: 0, barrelLength: 36,
    droneCount: 0, droneRespawn: 0
  }),
  rapid: classDef({
    id: 'rapid', label: 'Rapid', description: 'Schneller Drucktank mit guter Mobilität.', parent: 'core',
    unlockLevel: 5, branch: 'rapid', maxHealth: 100, regen: 2, acceleration: 1650, moveSpeed: 290,
    reload: 0.19, projectileSpeed: 840, projectileLife: 1.45, damage: 10.5, projectileRadius: 6,
    penetration: 15, bodyDamage: 10, barrelCount: 1, barrelSpread: 0, barrelLength: 34,
    droneCount: 0, droneRespawn: 0
  }),
  sniper: classDef({
    id: 'sniper', label: 'Sniper', description: 'Hoher Burst und Reichweite, aber wenig Fehlertoleranz.', parent: 'core',
    unlockLevel: 5, branch: 'precision', maxHealth: 94, regen: 1.8, acceleration: 1400, moveSpeed: 250,
    reload: 0.68, projectileSpeed: 1200, projectileLife: 2, damage: 38, projectileRadius: 8,
    penetration: 46, bodyDamage: 9, barrelCount: 1, barrelSpread: 0, barrelLength: 52,
    droneCount: 0, droneRespawn: 0
  }),
  drone: classDef({
    id: 'drone', label: 'Controller', description: 'Vier Drohnen für Farming und Raumkontrolle.', parent: 'core',
    unlockLevel: 5, branch: 'control', maxHealth: 112, regen: 2.4, acceleration: 1400, moveSpeed: 258,
    reload: 0.72, projectileSpeed: 0, projectileLife: 0, damage: 8.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 11, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 4, droneRespawn: 1.45
  }),
  rammer: classDef({
    id: 'rammer', label: 'Impact', description: 'Mobiler Nahkämpfer mit hohem Körperschaden.', parent: 'core',
    unlockLevel: 5, branch: 'impact', maxHealth: 140, regen: 2.8, acceleration: 1750, moveSpeed: 300,
    reload: 0.45, projectileSpeed: 700, projectileLife: 1.25, damage: 9, projectileRadius: 7,
    penetration: 12, bodyDamage: 29, barrelCount: 1, barrelSpread: 0, barrelLength: 27,
    droneCount: 0, droneRespawn: 0
  }),
  twin: classDef({
    id: 'twin', label: 'Twin', description: 'Zwei Läufe erzeugen konstanten, kontrollierbaren Druck.', parent: 'rapid',
    unlockLevel: 15, branch: 'rapid', maxHealth: 104, regen: 2.1, acceleration: 1600, moveSpeed: 282,
    reload: 0.25, projectileSpeed: 850, projectileLife: 1.45, damage: 9.5, projectileRadius: 6,
    penetration: 15, bodyDamage: 10, barrelCount: 2, barrelSpread: 0.15, barrelLength: 35,
    droneCount: 0, droneRespawn: 0
  }),
  repeater: classDef({
    id: 'repeater', label: 'Repeater', description: 'Drei Läufe feuern im schnellen Stakkato statt auf einmal – ein Nachlade-Hebel spürbar in jedem Schuss.', parent: 'rapid',
    unlockLevel: 15, branch: 'rapid', maxHealth: 102, regen: 2, acceleration: 1640, moveSpeed: 286,
    reload: 0.34, projectileSpeed: 835, projectileLife: 1.45, damage: 8, projectileRadius: 6,
    penetration: 14, bodyDamage: 10, barrelCount: 3, barrelSpread: 0.22, barrelLength: 32, burstDelay: 0.07,
    droneCount: 0, droneRespawn: 0
  }),
  railgun: classDef({
    id: 'railgun', label: 'Railgun', description: 'Schwerer Präzisionsschuss mit hoher Durchschlagskraft.', parent: 'sniper',
    unlockLevel: 15, branch: 'precision', maxHealth: 92, regen: 1.6, acceleration: 1250, moveSpeed: 235,
    reload: 1, projectileSpeed: 1420, projectileLife: 2.35, damage: 60, projectileRadius: 9,
    penetration: 78, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 62,
    droneCount: 0, droneRespawn: 0
  }),
  hunter: classDef({
    id: 'hunter', label: 'Hunter', description: 'Mobiler Präzisionstank mit schnellerer Schussfolge.', parent: 'sniper',
    unlockLevel: 15, branch: 'precision', maxHealth: 98, regen: 1.8, acceleration: 1450, moveSpeed: 270,
    reload: 0.5, projectileSpeed: 1100, projectileLife: 1.8, damage: 32, projectileRadius: 7,
    penetration: 36, bodyDamage: 9, barrelCount: 1, barrelSpread: 0, barrelLength: 47,
    droneCount: 0, droneRespawn: 0
  }),
  warden: classDef({
    id: 'warden', label: 'Warden', description: 'Sechs Drohnen für defensive Kontrolle und Gegenangriffe.', parent: 'drone',
    unlockLevel: 15, branch: 'control', maxHealth: 122, regen: 2.7, acceleration: 1360, moveSpeed: 252,
    reload: 0.62, projectileSpeed: 0, projectileLife: 0, damage: 10.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 6, droneRespawn: 1.12
  }),
  factory: classDef({
    id: 'factory', label: 'Factory', description: 'Weniger, stärkere Drohnen mit langsamerer Wiederherstellung.', parent: 'drone',
    unlockLevel: 15, branch: 'control', maxHealth: 130, regen: 2.9, acceleration: 1280, moveSpeed: 242,
    reload: 0.8, projectileSpeed: 0, projectileLife: 0, damage: 13, projectileRadius: 0,
    penetration: 0, bodyDamage: 13, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 5, droneRespawn: 1.4
  }),
  crusher: classDef({
    id: 'crusher', label: 'Crusher', description: 'Schwerer Rammer mit hoher Haltbarkeit.', parent: 'rammer',
    unlockLevel: 15, branch: 'impact', maxHealth: 170, regen: 3.3, acceleration: 1550, moveSpeed: 285,
    reload: 0.5, projectileSpeed: 660, projectileLife: 1.15, damage: 8.5, projectileRadius: 8,
    penetration: 13, bodyDamage: 42, barrelCount: 1, barrelSpread: 0, barrelLength: 24,
    droneCount: 0, droneRespawn: 0
  }),
  bulwark: classDef({
    id: 'bulwark', label: 'Bulwark', description: 'Defensiver Hybrid mit hoher Haltbarkeit und schweren Projektilen.', parent: 'rammer',
    unlockLevel: 15, branch: 'impact', maxHealth: 185, regen: 3.6, acceleration: 1320, moveSpeed: 255,
    reload: 0.65, projectileSpeed: 640, projectileLife: 1.4, damage: 13, projectileRadius: 10,
    penetration: 22, bodyDamage: 34, barrelCount: 1, barrelSpread: 0, barrelLength: 22,
    droneCount: 0, droneRespawn: 0
  }),
  storm: classDef({
    id: 'storm', label: 'Storm', description: 'Vier Läufe fächern auf – die Mitte trifft härter, außen schwirrt es schneller und leichter heraus.', parent: 'twin',
    unlockLevel: 28, branch: 'rapid', maxHealth: 108, regen: 2.2, acceleration: 1550, moveSpeed: 276,
    reload: 0.26, projectileSpeed: 860, projectileLife: 1.35, damage: 6, projectileRadius: 6,
    penetration: 12, bodyDamage: 10, barrelCount: 4, barrelSpread: 0.3, barrelLength: 34,
    /*
     * Pro-Lauf-Profile, erster Anwendungsfall: dieselben vier Winkel wie
     * bisher (aus barrelCount/barrelSpread, hier nur ausgeschrieben, damit
     * Server-Feuerrichtung und Client-Rohrgrafik – die weiter über
     * barrelSpread rechnet – exakt zusammenbleiben), aber die beiden
     * mittleren Läufe treffen härter und fliegen dafür langsamer, die
     * äußeren sind schwächer und schneller. Summe der damageScale 0,65+1,35+
     * 1,35+0,65 = 4 = barrelCount: derselbe Gesamtschaden pro Sekunde wie vor
     * diesem Profil, nur anders über die Läufe verteilt.
     */
    barrels: [
      { angle: -0.15, damageScale: 0.65, speedScale: 1.15 },
      { angle: -0.05, damageScale: 1.35, speedScale: 0.92 },
      { angle: 0.05, damageScale: 1.35, speedScale: 0.92 },
      { angle: 0.15, damageScale: 0.65, speedScale: 1.15 }
    ],
    droneCount: 0, droneRespawn: 0
  }),
  gatling: classDef({
    id: 'gatling', label: 'Gatling', description: 'Sechs leichte Läufe liefern konzentriertes Dauerfeuer.', parent: 'repeater',
    unlockLevel: 28, branch: 'rapid', maxHealth: 106, regen: 2.1, acceleration: 1520, moveSpeed: 278,
    reload: 0.28, projectileSpeed: 875, projectileLife: 1.3, damage: 4.3, projectileRadius: 5.5,
    penetration: 10, bodyDamage: 10, barrelCount: 6, barrelSpread: 0.42, barrelLength: 31,
    droneCount: 0, droneRespawn: 0
  }),
  lancer: classDef({
    id: 'lancer', label: 'Lancer', description: 'Extremer Einzelschuss mit langer Vorbereitung.', parent: 'railgun',
    unlockLevel: 28, branch: 'precision', maxHealth: 86, regen: 1.45, acceleration: 1150, moveSpeed: 222,
    reload: 1.3, projectileSpeed: 1640, projectileLife: 2.65, damage: 82, projectileRadius: 10,
    penetration: 112, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 70,
    droneCount: 0, droneRespawn: 0
  }),
  phantom: classDef({
    id: 'phantom', label: 'Phantom', description: 'Schneller Final-Sniper für Bewegung, Winkel und präzise Picks.', parent: 'hunter',
    unlockLevel: 28, branch: 'precision', maxHealth: 90, regen: 1.55, acceleration: 1380, moveSpeed: 260,
    reload: 0.62, projectileSpeed: 1500, projectileLife: 2.25, damage: 50, projectileRadius: 8,
    penetration: 72, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 58,
    droneCount: 0, droneRespawn: 0
  }),
  overseer: classDef({
    id: 'overseer', label: 'Overseer', description: 'Acht leichtere Drohnen für anspruchsvolle Schwarmkontrolle.', parent: 'warden',
    // Balance 4.3: 12 -> 11,5 Schaden. Overseer stand mit 165,5 Drohnendruck bei
    // 99,7 % des Familien-Deckels und damit ueber dem eigenen Apex.
    unlockLevel: 28, branch: 'control', maxHealth: 128, regen: 3, acceleration: 1320, moveSpeed: 246,
    reload: 0.58, projectileSpeed: 0, projectileLife: 0, damage: 11.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 8, droneRespawn: 0.88
  }),
  carrier: classDef({
    id: 'carrier', label: 'Carrier', description: 'Sechs schwere Drohnen für langsamen, massiven Flächendruck.', parent: 'factory',
    unlockLevel: 28, branch: 'control', maxHealth: 150, regen: 3.4, acceleration: 1180, moveSpeed: 230,
    reload: 0.85, projectileSpeed: 0, projectileLife: 0, damage: 16, projectileRadius: 0,
    penetration: 0, bodyDamage: 15, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 6, droneRespawn: 1.5
  }),
  juggernaut: classDef({
    id: 'juggernaut', label: 'Juggernaut', description: 'Extrem widerstandsfähiger Nahkämpfer mit kurzer Reichweite.', parent: 'crusher',
    unlockLevel: 28, branch: 'impact', maxHealth: 215, regen: 4, acceleration: 1350, moveSpeed: 255,
    reload: 0.62, projectileSpeed: 620, projectileLife: 1, damage: 8, projectileRadius: 9,
    penetration: 13, bodyDamage: 60, barrelCount: 1, barrelSpread: 0, barrelLength: 21,
    droneCount: 0, droneRespawn: 0
  }),
  fortress: classDef({
    id: 'fortress', label: 'Fortress', description: 'Langsamer Defensivanker mit maximaler Haltbarkeit und schweren Schüssen.', parent: 'bulwark',
    unlockLevel: 28, branch: 'impact', maxHealth: 250, regen: 4.8, acceleration: 1050, moveSpeed: 225,
    reload: 0.75, projectileSpeed: 600, projectileLife: 1.5, damage: 16, projectileRadius: 11,
    penetration: 28, bodyDamage: 45, barrelCount: 1, barrelSpread: 0, barrelLength: 20,
    droneCount: 0, droneRespawn: 0
  }),
  flanker: classDef({
    id: 'flanker', label: 'Flanker', description: 'Ein Lauf nach vorn, einer nach hinten – Druck und Rückendeckung zugleich.', parent: 'rapid',
    unlockLevel: 15, branch: 'rapid', maxHealth: 103, regen: 2.05, acceleration: 1620, moveSpeed: 288,
    reload: 0.24, projectileSpeed: 845, projectileLife: 1.45, damage: 11, projectileRadius: 6,
    penetration: 15, bodyDamage: 10, barrelCount: 2, barrelSpread: 0, barrelLength: 34,
    barrelAngles: [0, Math.PI], droneCount: 0, droneRespawn: 0
  }),
  octo: classDef({
    id: 'octo', label: 'Octo', description: 'Acht Läufe decken jede Richtung ab – niemand flankiert dich.', parent: 'flanker',
    unlockLevel: 28, branch: 'rapid', maxHealth: 112, regen: 2.3, acceleration: 1500, moveSpeed: 268,
    reload: 0.3, projectileSpeed: 855, projectileLife: 1.35, damage: 6.5, projectileRadius: 5.5,
    penetration: 12, bodyDamage: 11, barrelCount: 8, barrelSpread: 0, barrelLength: 32,
    barrelAngles: [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, -Math.PI * 3 / 4, -Math.PI / 2, -Math.PI / 4],
    droneCount: 0, droneRespawn: 0
  }),
  arbalest: classDef({
    id: 'arbalest', label: 'Arbalest', description: 'Zwei parallele Präzisionsläufe für doppelten Druck auf Distanz.', parent: 'sniper',
    unlockLevel: 15, branch: 'precision', maxHealth: 96, regen: 1.8, acceleration: 1380, moveSpeed: 246,
    reload: 0.75, projectileSpeed: 1150, projectileLife: 1.9, damage: 26, projectileRadius: 7,
    penetration: 40, bodyDamage: 9, barrelCount: 2, barrelSpread: 0.09, barrelLength: 50,
    droneCount: 0, droneRespawn: 0
  }),
  deadeye: classDef({
    id: 'deadeye', label: 'Deadeye', description: 'Vollstrecker: Doppelläufe mit Bonusschaden auf schwer verwundete Ziele.', parent: 'arbalest',
    unlockLevel: 28, branch: 'precision', maxHealth: 92, regen: 1.6, acceleration: 1320, moveSpeed: 240,
    reload: 0.8, projectileSpeed: 1350, projectileLife: 2.1, damage: 34, projectileRadius: 8,
    penetration: 60, bodyDamage: 8, barrelCount: 2, barrelSpread: 0.07, barrelLength: 56,
    droneCount: 0, droneRespawn: 0
  }),
  guardian: classDef({
    id: 'guardian', label: 'Guardian', description: 'Fünf zähe Schildwächter-Drohnen in engem Verteidigungsorbit.', parent: 'drone',
    unlockLevel: 15, branch: 'control', maxHealth: 126, regen: 2.8, acceleration: 1300, moveSpeed: 250,
    reload: 0.7, projectileSpeed: 0, projectileLife: 0, damage: 11, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 5, droneRespawn: 1.3
  }),
  hive: classDef({
    id: 'hive', label: 'Hive', description: 'Zehn Mikro-Drohnen mit blitzschnellem Nachschub überfluten das Feld.', parent: 'guardian',
    unlockLevel: 28, branch: 'control', maxHealth: 132, regen: 3.1, acceleration: 1280, moveSpeed: 242,
    reload: 0.55, projectileSpeed: 0, projectileLife: 0, damage: 6.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 10, droneRespawn: 0.55
  }),
  blitz: classDef({
    id: 'blitz', label: 'Blitz', description: 'Leichter Sturm-Rammer: Körperschaden wächst mit deinem Tempo.', parent: 'rammer',
    unlockLevel: 15, branch: 'impact', maxHealth: 150, regen: 3, acceleration: 1850, moveSpeed: 320,
    reload: 0.5, projectileSpeed: 680, projectileLife: 1.1, damage: 8, projectileRadius: 7,
    penetration: 12, bodyDamage: 30, barrelCount: 1, barrelSpread: 0, barrelLength: 25,
    droneCount: 0, droneRespawn: 0
  }),
  comet: classDef({
    id: 'comet', label: 'Comet', description: 'Der schnellste Tank der Arena – bei Vollgas verheerender Aufprall.', parent: 'blitz',
    unlockLevel: 28, branch: 'impact', maxHealth: 175, regen: 3.6, acceleration: 1950, moveSpeed: 340,
    reload: 0.55, projectileSpeed: 660, projectileLife: 1, damage: 7.5, projectileRadius: 8,
    penetration: 12, bodyDamage: 44, barrelCount: 1, barrelSpread: 0, barrelLength: 22,
    droneCount: 0, droneRespawn: 0
  }),
  /*
   * Klassen 4.2, Stufe 4, Schritt 3 – der rohrlose Smasher: kein Rohr, keine
   * Reichweite, nur Aufprall. `barrelCount: 0` bei einer Nicht-Drohnen-Klasse
   * ist neu (game.ts/combat-tuning.ts feuern seitdem nur noch, wenn
   * `barrelCount > 0`) – bisher hatte jede Nahkampfklasse trotzdem ein
   * kleines Rohr. Läuft auf Blitz/Comets Rammkurve mit (`MOMENTUM_CLASSES`
   * in simulation-hardening.ts): 0,6× Körperschaden im Stand bis 1,35× bei
   * Vollgas. Damit der `damage`-Punkt kein toter Platz wird (er wirkt sonst
   * nur auf Schuss-Schaden, den es hier nicht gibt), verstärkt er bei dieser
   * einen Klasse stattdessen den Körperschaden mit – siehe combat-tuning.ts.
   */
  smasher: classDef({
    id: 'smasher', label: 'Smasher', description: 'Kein Rohr, kein Ausweichen nötig – nur der Aufprall zählt.', parent: 'blitz',
    unlockLevel: 28, branch: 'impact', maxHealth: 195, regen: 3.4, acceleration: 1900, moveSpeed: 305,
    reload: 0, projectileSpeed: 0, projectileLife: 0, damage: 0, projectileRadius: 0,
    penetration: 0, bodyDamage: 52, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.0, Welle A - Apex-Klassen der Altfamilien (L42)
  // ------------------------------------------------------------------
  vortex: classDef({
    id: 'vortex', label: 'Vortex', description: 'Fünf Läufe im Fächer, Momentum ohne Ende – die wandelnde Schrotwand.', parent: 'rapid',
    unlockLevel: 42, branch: 'rapid', apexOf: 'rapid', maxHealth: 118, regen: 2.4, acceleration: 1580, moveSpeed: 280,
    // 5 Laeufe zwingen den Einzelschaden nach unten: 5,2 / 0,27 x 5 = 96 DPS,
    // knapp unter dem Korridor-Deckel von 100 - der Test hat die erste
    // Fassung (161,9) zu Recht kassiert.
    reload: 0.27, projectileSpeed: 865, projectileLife: 1.35, damage: 5.2, projectileRadius: 6,
    penetration: 13, bodyDamage: 11, barrelCount: 5, barrelSpread: 0.55, barrelLength: 33,
    droneCount: 0, droneRespawn: 0
  }),
  eclipse: classDef({
    id: 'eclipse', label: 'Eclipse', description: 'Ein Schuss wie eine Finsternis – wer ihn sieht, sieht ihn zu spät.', parent: 'sniper',
    /*
     * Balance 4.3: Der Apex fuehrte auf **keiner** Achse.
     *
     * Gemessen stand er hinter Lancer (Stufe 3 desselben Pfades) bei
     * Reichweite (3900 gegen 4346) und Einzelschuss (74 gegen 82), hinter
     * Deadeye und Phantom beim Dauerschaden. Wer auf Level 42 zu Eclipse
     * aufstieg, wurde schlechter – das ist kein Gipfel, das ist eine Falle.
     *
     * Er bekommt jetzt die Spitze auf den beiden Achsen, die PRECISION
     * ausmachen: Reichweite (1560 x 2,85 = 4446) und Einzelschuss (86). Beim
     * Dauerschaden bleibt Deadeye vorn – das ist Absicht, der ist die
     * schnellfeuernde Praezision, Eclipse der eine Schuss.
     */
    unlockLevel: 42, branch: 'precision', apexOf: 'precision', maxHealth: 90, regen: 1.5, acceleration: 1220, moveSpeed: 230,
    reload: 1.15, projectileSpeed: 1560, projectileLife: 2.85, damage: 86, projectileRadius: 10,
    penetration: 100, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 66,
    droneCount: 0, droneRespawn: 0
  }),
  sovereign: classDef({
    id: 'sovereign', label: 'Sovereign', description: 'Sieben Wächter, ein Wille – der Hofstaat regiert das Feld.', parent: 'drone',
    /*
     * Balance 4.3: Derselbe Fehler wie bei Eclipse, nur eine Familie weiter.
     *
     * Der Drohnendruck des Apex lag bei 163,3 – **unter** dem von Overseer
     * (165,5), einer Klasse von Stufe 28. Auf der einzigen Achse, die CONTROL
     * ueberhaupt hat, war der Gipfel der schlechtere Kauf.
     *
     * Sovereign geht auf 169,2 (Deckel 170), Overseer auf 158,6. Der Deckel
     * gehoert dem Apex; eine Klasse von Stufe 28 hatte bei 99,7 % davon
     * nichts verloren. Haltbarkeit steigt mit, damit Carrier ihn nicht auch
     * dort schlaegt.
     */
    unlockLevel: 42, branch: 'control', apexOf: 'control', maxHealth: 156, regen: 3.4, acceleration: 1240, moveSpeed: 238,
    reload: 0.6, projectileSpeed: 0, projectileLife: 0, damage: 14.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 13, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 7, droneRespawn: 1
  }),
  leviathan: classDef({
    id: 'leviathan', label: 'Leviathan', description: 'Eine Wand aus Stahl, die auf dich zurollt.', parent: 'rammer',
    // Erste Fassung: 280 HP / 5,2 Regen -> Haltbarkeit 332, Korridor-Deckel
    // ist 310 (Fortress-Niveau). Der Apex soll die Familie kroenen, nicht den
    // Korridor sprengen.
    unlockLevel: 42, branch: 'impact', apexOf: 'impact', maxHealth: 262, regen: 4.8, acceleration: 1250, moveSpeed: 245,
    reload: 0.8, projectileSpeed: 615, projectileLife: 1.4, damage: 18, projectileRadius: 12,
    penetration: 30, bodyDamage: 63, barrelCount: 1, barrelSpread: 0, barrelLength: 20,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.0, Welle A - Familie SPECTER (Tarnung): Hinterhalt und Geduld.
  // Reichweite bewusst im Nicht-Precision-Korridor (<= 1300): Tarnung kauft
  // Naehe und Winkel, nicht Distanz - ein unsichtbarer Sniper waere Frust.
  // ------------------------------------------------------------------
  specter: classDef({
    id: 'specter', label: 'Specter', description: 'Wer nicht schießt, verschwindet – und schlägt aus dem Nichts zu.', parent: 'core',
    unlockLevel: 5, branch: 'specter', maxHealth: 96, regen: 1.9, acceleration: 1600, moveSpeed: 288,
    reload: 0.55, projectileSpeed: 900, projectileLife: 1.4, damage: 24, projectileRadius: 7,
    penetration: 26, bodyDamage: 12, barrelCount: 1, barrelSpread: 0, barrelLength: 40,
    droneCount: 0, droneRespawn: 0
  }),
  wraith: classDef({
    id: 'wraith', label: 'Wraith', description: 'Der schnelle Schleicher: flinker enttarnt, flinker verschwunden.', parent: 'specter',
    unlockLevel: 15, branch: 'specter', maxHealth: 94, regen: 1.85, acceleration: 1680, moveSpeed: 300,
    reload: 0.42, projectileSpeed: 880, projectileLife: 1.4, damage: 18, projectileRadius: 6,
    penetration: 20, bodyDamage: 12, barrelCount: 1, barrelSpread: 0, barrelLength: 36,
    droneCount: 0, droneRespawn: 0
  }),
  shade: classDef({
    id: 'shade', label: 'Shade', description: 'Der schwere Schatten: ein Schuss, der sitzt.', parent: 'specter',
    unlockLevel: 15, branch: 'specter', maxHealth: 100, regen: 2, acceleration: 1480, moveSpeed: 262,
    reload: 0.78, projectileSpeed: 1000, projectileLife: 1.25, damage: 40, projectileRadius: 8,
    penetration: 44, bodyDamage: 11, barrelCount: 1, barrelSpread: 0, barrelLength: 48,
    droneCount: 0, droneRespawn: 0
  }),
  mirage: classDef({
    id: 'mirage', label: 'Mirage', description: 'Zwei Stiche aus dem Dunkel – das Trugbild jagt in Paaren.', parent: 'wraith',
    unlockLevel: 28, branch: 'specter', maxHealth: 98, regen: 1.9, acceleration: 1620, moveSpeed: 292,
    reload: 0.5, projectileSpeed: 920, projectileLife: 1.4, damage: 17, projectileRadius: 6,
    penetration: 22, bodyDamage: 12, barrelCount: 2, barrelSpread: 0.12, barrelLength: 38,
    droneCount: 0, droneRespawn: 0
  }),
  revenant: classDef({
    id: 'revenant', label: 'Revenant', description: 'Rammt aus der Unsichtbarkeit – kehrt zurück, wenn niemand hinsieht.', parent: 'shade',
    unlockLevel: 28, branch: 'specter', maxHealth: 150, regen: 2.9, acceleration: 1780, moveSpeed: 305,
    reload: 0.6, projectileSpeed: 720, projectileLife: 1.2, damage: 9, projectileRadius: 7,
    penetration: 12, bodyDamage: 38, barrelCount: 1, barrelSpread: 0, barrelLength: 26,
    droneCount: 0, droneRespawn: 0
  }),
  eidolon: classDef({
    id: 'eidolon', label: 'Eidolon', description: 'Das Gespenst der Arena: ganz verschwinden, vernichtend erscheinen.', parent: 'specter',
    unlockLevel: 42, branch: 'specter', apexOf: 'specter', maxHealth: 104, regen: 2.1, acceleration: 1650, moveSpeed: 296,
    reload: 0.6, projectileSpeed: 1060, projectileLife: 1.15, damage: 46, projectileRadius: 8,
    penetration: 50, bodyDamage: 14, barrelCount: 1, barrelSpread: 0, barrelLength: 52,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.0, Welle A - Familie TEMPEST (Hitze): Burst-Fenster und Risiko
  // ------------------------------------------------------------------
  tempest: classDef({
    id: 'tempest', label: 'Tempest', description: 'Feuern heizt den Reaktor: mehr Schaden, bis er glüht.', parent: 'core',
    unlockLevel: 5, branch: 'tempest', maxHealth: 116, regen: 2.3, acceleration: 1470, moveSpeed: 264,
    reload: 0.34, projectileSpeed: 815, projectileLife: 1.5, damage: 13, projectileRadius: 7,
    penetration: 18, bodyDamage: 14, barrelCount: 1, barrelSpread: 0, barrelLength: 34,
    droneCount: 0, droneRespawn: 0
  }),
  scorch: classDef({
    id: 'scorch', label: 'Scorch', description: 'Brennt schnell heiß: zwei Läufe im Wimpernschlag-Abstand statt eines Fächers.', parent: 'tempest',
    unlockLevel: 15, branch: 'tempest', maxHealth: 110, regen: 2.2, acceleration: 1520, moveSpeed: 274,
    reload: 0.26, projectileSpeed: 800, projectileLife: 1.4, damage: 9.5, projectileRadius: 6,
    penetration: 14, bodyDamage: 13, barrelCount: 2, barrelSpread: 0.18, barrelLength: 33, burstDelay: 0.05,
    droneCount: 0, droneRespawn: 0
  }),
  surge: classDef({
    id: 'surge', label: 'Surge', description: 'Ein schwerer Puls je Ladung – Hitze als Hammer.', parent: 'tempest',
    unlockLevel: 15, branch: 'tempest', maxHealth: 124, regen: 2.5, acceleration: 1400, moveSpeed: 252,
    reload: 0.52, projectileSpeed: 760, projectileLife: 1.6, damage: 22, projectileRadius: 9,
    penetration: 26, bodyDamage: 15, barrelCount: 1, barrelSpread: 0, barrelLength: 38,
    droneCount: 0, droneRespawn: 0
  }),
  inferno: classDef({
    id: 'inferno', label: 'Inferno', description: 'Drei Kehlen, ein Feuersturm im Stakkato – bis die Sicherung kommt.', parent: 'scorch',
    unlockLevel: 28, branch: 'tempest', maxHealth: 114, regen: 2.3, acceleration: 1490, moveSpeed: 268,
    reload: 0.29, projectileSpeed: 810, projectileLife: 1.4, damage: 7.5, projectileRadius: 6,
    penetration: 12, bodyDamage: 13, barrelCount: 3, barrelSpread: 0.3, barrelLength: 32, burstDelay: 0.06,
    droneCount: 0, droneRespawn: 0
  }),
  overload: classDef({
    id: 'overload', label: 'Overload', description: 'Überladen bis an die Kante: riesige Projektile, kurze Lunte.', parent: 'surge',
    unlockLevel: 28, branch: 'tempest', maxHealth: 130, regen: 2.6, acceleration: 1360, moveSpeed: 246,
    reload: 0.6, projectileSpeed: 740, projectileLife: 1.7, damage: 30, projectileRadius: 11,
    penetration: 34, bodyDamage: 16, barrelCount: 1, barrelSpread: 0, barrelLength: 40,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.1 - Familie SIEGE (Stellung): das Gegenteil von Momentum
  // ------------------------------------------------------------------
  siege: classDef({
    id: 'siege', label: 'Siege', description: 'Wer steht, wird zur Kanone: Stillstand baut Stellung auf.', parent: 'core',
    unlockLevel: 5, branch: 'siege', maxHealth: 124, regen: 2.5, acceleration: 1180, moveSpeed: 232,
    reload: 0.62, projectileSpeed: 881, projectileLife: 1.3, damage: 28, projectileRadius: 9,
    penetration: 30, bodyDamage: 12, barrelCount: 1, barrelSpread: 0, barrelLength: 44,
    droneCount: 0, droneRespawn: 0
  }),
  /*
   * Klassen 4.2, Stufe 4, Schritt 3 – Trapper, das stehende Projektil: Der
   * Schuss fliegt kurz (trapAfter, siehe ClassDefinition), bleibt dann liegen
   * und wirkt für den Rest seiner Lebenszeit als Falle – dieselbe Treffer-
   * und Durchschlagslogik wie jedes andere Projektil, nur ohne weitere
   * Bewegung. Passt zu Siege: „Stillstand baut Stellung auf" gilt jetzt auch
   * für das, was man abschießt.
   */
  trapper: classDef({
    id: 'trapper', label: 'Trapper', description: 'Der Schuss bleibt liegen, wo er landet – eine Falle statt einer Kugel.', parent: 'siege',
    unlockLevel: 15, branch: 'siege', maxHealth: 128, regen: 2.6, acceleration: 1150, moveSpeed: 224,
    reload: 1.1, projectileSpeed: 620, projectileLife: 2.3, damage: 20, projectileRadius: 12,
    penetration: 34, bodyDamage: 13, barrelCount: 1, barrelSpread: 0, barrelLength: 40, trapAfter: 0.28,
    droneCount: 0, droneRespawn: 0
  }),
  bombard: classDef({
    id: 'bombard', label: 'Bombard', description: 'Zwei schwere Rohre - die Stellung schlägt breit zu.', parent: 'siege',
    unlockLevel: 15, branch: 'siege', maxHealth: 130, regen: 2.6, acceleration: 1150, moveSpeed: 226,
    reload: 0.72, projectileSpeed: 830, projectileLife: 1.5, damage: 21, projectileRadius: 10,
    penetration: 28, bodyDamage: 13, barrelCount: 2, barrelSpread: 0.2, barrelLength: 42,
    droneCount: 0, droneRespawn: 0
  }),
  mortar: classDef({
    id: 'mortar', label: 'Mortar', description: 'Langsame Brocken mit gewaltigem Einschlag.', parent: 'siege',
    unlockLevel: 15, branch: 'siege', maxHealth: 136, regen: 2.8, acceleration: 1100, moveSpeed: 222,
    reload: 0.95, projectileSpeed: 690, projectileLife: 1.75, damage: 44, projectileRadius: 13,
    penetration: 42, bodyDamage: 14, barrelCount: 1, barrelSpread: 0, barrelLength: 38,
    droneCount: 0, droneRespawn: 0
  }),
  howitzer: classDef({
    id: 'howitzer', label: 'Howitzer', description: 'Drei Rohre halten eine ganze Schneise unter Feuer.', parent: 'bombard',
    unlockLevel: 28, branch: 'siege', maxHealth: 134, regen: 2.7, acceleration: 1120, moveSpeed: 222,
    reload: 0.78, projectileSpeed: 844, projectileLife: 1.5, damage: 15, projectileRadius: 9,
    penetration: 24, bodyDamage: 13, barrelCount: 3, barrelSpread: 0.34, barrelLength: 40,
    droneCount: 0, droneRespawn: 0
  }),
  trebuchet: classDef({
    id: 'trebuchet', label: 'Trebuchet', description: 'Ein Rohr, ein Brocken, eine Entscheidung.', parent: 'mortar',
    unlockLevel: 28, branch: 'siege', maxHealth: 140, regen: 3, acceleration: 1050, moveSpeed: 222,
    reload: 1.25, projectileSpeed: 645, projectileLife: 1.85, damage: 66, projectileRadius: 15,
    penetration: 62, bodyDamage: 15, barrelCount: 1, barrelSpread: 0, barrelLength: 48,
    droneCount: 0, droneRespawn: 0
  }),
  ragnarok: classDef({
    id: 'ragnarok', label: 'Ragnarok', description: 'Apex der Belagerung: eingegraben ist er nicht zu halten.', parent: 'siege',
    unlockLevel: 42, branch: 'siege', apexOf: 'siege', maxHealth: 150, regen: 3.2, acceleration: 1080, moveSpeed: 224,
    reload: 0.85, projectileSpeed: 801, projectileLife: 1.5, damage: 34, projectileRadius: 12,
    penetration: 50, bodyDamage: 15, barrelCount: 2, barrelSpread: 0.14, barrelLength: 46,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.1 - Familie AEGIS (Schild): Treffer einstecken und zurückgeben
  // ------------------------------------------------------------------
  aegis: classDef({
    id: 'aegis', label: 'Aegis', description: 'Erlittener Schaden lädt den Schild - die Entladung stößt zurück.', parent: 'core',
    unlockLevel: 5, branch: 'aegis', maxHealth: 152, regen: 3, acceleration: 1420, moveSpeed: 256,
    reload: 0.44, projectileSpeed: 744, projectileLife: 1.4, damage: 14, projectileRadius: 8,
    penetration: 20, bodyDamage: 16, barrelCount: 1, barrelSpread: 0, barrelLength: 30,
    droneCount: 0, droneRespawn: 0
  }),
  bulwarker: classDef({
    id: 'bulwarker', label: 'Warder', description: 'Dickeres Schild, längeres Stehvermögen.', parent: 'aegis',
    unlockLevel: 15, branch: 'aegis', maxHealth: 178, regen: 3.4, acceleration: 1340, moveSpeed: 244,
    reload: 0.5, projectileSpeed: 732, projectileLife: 1.4, damage: 15, projectileRadius: 8,
    penetration: 22, bodyDamage: 18, barrelCount: 1, barrelSpread: 0, barrelLength: 28,
    droneCount: 0, droneRespawn: 0
  }),
  reflector: classDef({
    id: 'reflector', label: 'Reflector', description: 'Der Schild wirft zurück, was er schluckt.', parent: 'aegis',
    unlockLevel: 15, branch: 'aegis', maxHealth: 158, regen: 3.1, acceleration: 1400, moveSpeed: 252,
    reload: 0.46, projectileSpeed: 803, projectileLife: 1.45, damage: 13, projectileRadius: 7,
    penetration: 20, bodyDamage: 17, barrelCount: 2, barrelSpread: 0.16, barrelLength: 30,
    droneCount: 0, droneRespawn: 0
  }),
  paladin: classDef({
    id: 'paladin', label: 'Paladin', description: 'Läuft ins Feuer und kommt stärker heraus.', parent: 'bulwarker',
    unlockLevel: 28, branch: 'aegis', maxHealth: 205, regen: 3.9, acceleration: 1360, moveSpeed: 248,
    reload: 0.55, projectileSpeed: 712, projectileLife: 1.4, damage: 16, projectileRadius: 9,
    penetration: 24, bodyDamage: 22, barrelCount: 1, barrelSpread: 0, barrelLength: 27,
    droneCount: 0, droneRespawn: 0
  }),
  retributor: classDef({
    id: 'retributor', label: 'Retributor', description: 'Jeder Treffer auf ihn ist eine Anzahlung – drei Läufe zahlen sie in schneller Folge zurück, nicht auf einmal.', parent: 'reflector',
    unlockLevel: 28, branch: 'aegis', maxHealth: 168, regen: 3.3, acceleration: 1420, moveSpeed: 256,
    reload: 0.48, projectileSpeed: 811, projectileLife: 1.45, damage: 12, projectileRadius: 7,
    penetration: 22, bodyDamage: 19, barrelCount: 3, barrelSpread: 0.26, barrelLength: 29, burstDelay: 0.09,
    droneCount: 0, droneRespawn: 0
  }),
  sanctum: classDef({
    id: 'sanctum', label: 'Sanctum', description: 'Apex des Schildes: eine wandelnde Festung, die zurückschlägt.', parent: 'aegis',
    unlockLevel: 42, branch: 'aegis', apexOf: 'aegis', maxHealth: 218, regen: 4.2, acceleration: 1380, moveSpeed: 250,
    reload: 0.52, projectileSpeed: 743, projectileLife: 1.45, damage: 17, projectileRadius: 9,
    penetration: 26, bodyDamage: 24, barrelCount: 2, barrelSpread: 0.12, barrelLength: 31,
    droneCount: 0, droneRespawn: 0
  }),
  // ------------------------------------------------------------------
  // Klassen 4.1 - vier neue Zweige in den bestehenden Familien
  // ------------------------------------------------------------------
  vanguard: classDef({
    id: 'vanguard', label: 'Vanguard', description: 'Vier kurze Läufe im engen Fächer - eine Wand aus Nadeln.', parent: 'rapid',
    unlockLevel: 15, branch: 'rapid', maxHealth: 108, regen: 2.15, acceleration: 1580, moveSpeed: 280,
    reload: 0.33, projectileSpeed: 831, projectileLife: 1.4, damage: 6.5, projectileRadius: 5.5,
    penetration: 13, bodyDamage: 11, barrelCount: 4, barrelSpread: 0.16, barrelLength: 32,
    droneCount: 0, droneRespawn: 0
  }),
  hailstorm: classDef({
    id: 'hailstorm', label: 'Hailstorm', description: 'Sieben Läufe, ein Hagelschlag - Deckung gibt es nicht.', parent: 'vanguard',
    unlockLevel: 28, branch: 'rapid', maxHealth: 110, regen: 2.2, acceleration: 1540, moveSpeed: 274,
    reload: 0.36, projectileSpeed: 847, projectileLife: 1.3, damage: 4.2, projectileRadius: 5,
    penetration: 11, bodyDamage: 11, barrelCount: 7, barrelSpread: 0.5, barrelLength: 30,
    droneCount: 0, droneRespawn: 0
  }),
  ballista: classDef({
    id: 'ballista', label: 'Ballista', description: 'Ein Bolzen, der durch alles geht, was in einer Reihe steht.', parent: 'sniper',
    unlockLevel: 15, branch: 'precision', maxHealth: 92, regen: 1.7, acceleration: 1300, moveSpeed: 242,
    reload: 0.88, projectileSpeed: 1260, projectileLife: 2.1, damage: 46, projectileRadius: 8,
    penetration: 68, bodyDamage: 9, barrelCount: 1, barrelSpread: 0, barrelLength: 58,
    droneCount: 0, droneRespawn: 0
  }),
  siegebreaker: classDef({
    id: 'siegebreaker', label: 'Siegebreaker', description: 'Bricht Stellungen: schwerster Bolzen der Arena.', parent: 'ballista',
    unlockLevel: 28, branch: 'precision', maxHealth: 88, regen: 1.5, acceleration: 1200, moveSpeed: 228,
    reload: 1.18, projectileSpeed: 1440, projectileLife: 2.4, damage: 70, projectileRadius: 10,
    penetration: 96, bodyDamage: 9, barrelCount: 1, barrelSpread: 0, barrelLength: 68,
    droneCount: 0, droneRespawn: 0
  }),
  sentinel: classDef({
    id: 'sentinel', label: 'Sentinel', description: 'Drei schwere Wächter statt eines Schwarms.', parent: 'drone',
    unlockLevel: 15, branch: 'control', maxHealth: 134, regen: 2.9, acceleration: 1300, moveSpeed: 246,
    reload: 0.9, projectileSpeed: 0, projectileLife: 0, damage: 19, projectileRadius: 0,
    penetration: 0, bodyDamage: 14, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 3, droneRespawn: 1.7
  }),
  aviary: classDef({
    id: 'aviary', label: 'Aviary', description: 'Neun flinke Vögel - der Himmel gehört ihm.', parent: 'sentinel',
    unlockLevel: 28, branch: 'control', maxHealth: 126, regen: 2.8, acceleration: 1310, moveSpeed: 248,
    reload: 0.56, projectileSpeed: 0, projectileLife: 0, damage: 8, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 9, droneRespawn: 0.7
  }),
  rampart: classDef({
    id: 'rampart', label: 'Rampart', description: 'Rollt nicht schnell, aber unbeirrt - und trägt schwer.', parent: 'rammer',
    unlockLevel: 15, branch: 'impact', maxHealth: 190, regen: 3.7, acceleration: 1280, moveSpeed: 248,
    reload: 0.7, projectileSpeed: 650, projectileLife: 1.35, damage: 14, projectileRadius: 10,
    penetration: 24, bodyDamage: 32, barrelCount: 1, barrelSpread: 0, barrelLength: 23,
    droneCount: 0, droneRespawn: 0
  }),
  behemoth: classDef({
    id: 'behemoth', label: 'Behemoth', description: 'Was ihm in den Weg kommt, war vorher da.', parent: 'rampart',
    unlockLevel: 28, branch: 'impact', maxHealth: 232, regen: 4.3, acceleration: 1220, moveSpeed: 238,
    reload: 0.82, projectileSpeed: 630, projectileLife: 1.4, damage: 17, projectileRadius: 11,
    penetration: 28, bodyDamage: 52, barrelCount: 1, barrelSpread: 0, barrelLength: 21,
    droneCount: 0, droneRespawn: 0
  }),
  cataclysm: classDef({
    id: 'cataclysm', label: 'Cataclysm', description: 'Wenn der Reaktor singt, brennt die halbe Arena.', parent: 'tempest',
    unlockLevel: 42, branch: 'tempest', apexOf: 'tempest', maxHealth: 128, regen: 2.7, acceleration: 1430, moveSpeed: 258,
    reload: 0.4, projectileSpeed: 806, projectileLife: 1.6, damage: 17, projectileRadius: 9,
    penetration: 24, bodyDamage: 15, barrelCount: 2, barrelSpread: 0.22, barrelLength: 36,
    droneCount: 0, droneRespawn: 0
  })
};

export interface PlayerSnapshot { id:string; name:string; playerClass:PlayerClass; position:Vector2; velocity:Vector2; angle:number; health:number; maxHealth:number; level:number; xp:number; xpForNextLevel:number; availablePoints:number; upgrades:UpgradeLevels; score:number; kills:number; deaths:number; streak:number; bestStreak:number; invulnerable:boolean; isBot:boolean; dead:boolean; deathLevel:number; respawnLevel:number; canRespawnAt:number; autoRespawnAt:number; killerName:string;
  /**
   * Füllstand der Familien-Signature in Prozent (0–100, ganzzahlig) – EIN Feld
   * für alle vier Spielstile (Klassen 3.0/KL2). Bedeutung ergibt sich aus der
   * Familie: Rapid = Momentum, Precision = Ladung, Control = freies
   * Einheiten-Budget, Impact = Wucht. Fehlt, solange die Signature-Mechanik
   * der Klasse nicht aktiv ist.
   */
  signature?: number;
}
export interface ProjectileSnapshot { id:string; ownerId:string; position:Vector2; velocity:Vector2; radius:number; integrity:number; maxIntegrity:number; }
/**
 * `gameplayRadius` ist der Kollisionsradius aus der Drohnen-Schicht des
 * Servers (7,5 bei Hive bis 15,5 bei Carrier – Faktor 2 in der Fläche). Er
 * lag schon immer ungenutzt auf der Leitung; seit Befund 41 zeichnet der
 * Client damit, statt jede Drohne als 13er-Dreieck zu zeigen und Treffer
 * durch „Luft" bzw. großzügiges Ausweichen vor kleinen Drohnen zu erzeugen.
 * Optional, weil die Basisklasse ohne Tuning-Schicht ihn nicht setzt.
 */
export interface DroneSnapshot { id:string; ownerId:string; position:Vector2; velocity:Vector2; angle:number; health:number; maxHealth:number; gameplayRadius?:number; }
export interface Wall { id:string; x:number; y:number; width:number; height:number; }
/**
 * Antwort von `GET /map` – die STATISCHE Kartenlayout, einmal beim Start
 * geholt statt bei jedem Snapshot (Sam: die Minimap soll die ganze Karte
 * zeigen, nicht nur den aktuellen Ausschnitt; `WorldSnapshot.walls` liefert
 * dafür nur die nahen Wände). `WALLS` und `HAUPTPLAETZE` ändern sich nie
 * während der Laufzeit eines Prozesses, ein einziger Abruf reicht also.
 */
export interface MapPlaza { id:string; name:string; bereich:{x:number;y:number;width:number;height:number}; mitte:Vector2; }
export interface MapInfo { walls:Wall[]; plazas:MapPlaza[]; worldWidth:number; worldHeight:number; }
export interface ShapeSnapshot { id:string; kind:ShapeKind; position:Vector2; velocity:Vector2; radius:number; rotation:number; health:number; maxHealth:number; }
export interface KillEvent { id:number; killer:string; victim:string; at:number; streak:number; }
/**
 * `rank` kam mit Befund 19: Die Liste trägt die Top-Plätze plus – falls der
 * Betrachter nicht darunter ist – seine eigene Zeile mit echtem Rang. Aus
 * einer Top-8 allein lässt sich der eigene Platz nicht rechnen. Optional,
 * damit alte Server ohne das Feld weiter verstanden werden (Anzeige fällt
 * dann auf die Listenposition zurück).
 */
export interface LeaderboardEntry { id:string; name:string; score:number; level:number; playerClass:PlayerClass; isBot:boolean; rank?:number; }
export interface WorldSnapshot { type:'snapshot'; selfId:string|null; tick:number; serverTime:number; players:PlayerSnapshot[]; projectiles:ProjectileSnapshot[]; drones:DroneSnapshot[]; shapes:ShapeSnapshot[]; walls:Wall[]; leaderboard:LeaderboardEntry[]; killfeed:KillEvent[];
  /**
   * Sequenznummer der zuletzt in einen Tick eingeflossenen Eingabe dieses
   * Empfängers. `-1` = noch nichts verarbeitet. Der Client verwirft alle
   * gepufferten Eingaben bis einschließlich dieser Nummer und rechnet den Rest
   * auf der Serverposition nach. Wird von der äußersten Server-Schicht gesetzt
   * und weder kurz-ID-umgeschrieben noch delta-gestrippt.
   */
  lastProcessedInput?: number;
}
/**
 * `mode` ist optional, weil ein Client, der die Nachricht schon kennt, nicht an
 * einem neuen Pflichtfeld scheitern darf: Ein Spieler mit gepuffertem Bündel
 * trifft nach einem Deploy auf einen neuen Server. Fehlt das Feld, gilt `maze` –
 * derselbe Stand wie vor der Einführung der Modi.
 */
/**
 * `achievements` sagt, ob der Server die Erfolgs-Engine angehängt hat
 * (Befund 60): Die Galerie verspricht sonst sieben Erfolge, die auf einem
 * Server mit `ACHIEVEMENTS_ENABLED=false` nie fallen können. Optional aus
 * demselben Grund wie `mode` – ein alter Server lässt es weg, dann bleibt
 * die Galerie kommentarlos wie bisher.
 */
export interface WelcomeMessage { type:'welcome'; selfId:string; mode?:ArenaMode; achievements?:boolean; }
export interface ErrorMessage { type:'error'; message:string; }
export interface PongMessage { type:'pong'; sentAt:number; serverTime:number; }
export type ServerMessage = WorldSnapshot | WelcomeMessage | ErrorMessage | PongMessage;

/**
 * Wie weit der Server Entitaeten ueberhaupt mitschickt.
 *
 * `hardenSimulation` schneidet Spieler, Kugeln, Drohnen und Formen an einem
 * festen Rechteck um den Blickpunkt ab -- und zwar an DIESEM. Die Zahl stand
 * bis zum 12.08. nur dort, waehrend der Client seine Sichtgrenzen gegen
 * `viewRadius` (1100) und den Wand-Ausschnitt (992 x 648) rechnete: also gegen
 * Regeln, die diese Schicht laengst ersetzt hat. Im Modus
 * „Bildschirmfuellend" sah der Spieler dadurch auf 21:9 rund 76 Einheiten je
 * Seite weiter, als der Server liefert -- ein Band, in dem Raster und Waende
 * gezeichnet werden, aber nie ein Tank, eine Kugel oder eine Form erscheint.
 *
 * Deshalb steht die Grenze hier, wo beide Seiten sie lesen koennen.
 */
export const ENTITY_CULL_PADDING = 48;

export const GAME = {
  worldWidth: 9000,
  worldHeight: 6000,
  visibleWorldWidth: 1600,
  visibleWorldHeight: 900,
  viewRadius: 1100,
  /**
   * Wie weit der Zeiger vom eigenen Panzer weg gemeldet wird.
   *
   * Für Rohre zählt nur die RICHTUNG – der Betrag war dort nie wichtig. Für
   * Drohnen ist er alles: Sie fliegen zu dem Punkt, auf den der Zeiger deutet,
   * und weiter als hier steht, kommen sie nicht.
   *
   * Bei 650 war das ein Fehler, den man sehen konnte: Das Sichtfenster ist
   * 1600 x 900, die halbe Bilddiagonale also 918 px. Ein Gegner in der Ecke des
   * eigenen Bildschirms war mit dem Zeiger auf ihm **nicht erreichbar** – die
   * Flotte blieb 268 px vor ihm stehen und wartete. Sam, 14.08.: „Die
   * Drohnen-Klasse fühlt sich noch immer MEGA MEGA komisch an zu spielen. Ich
   * will das EINS ZU EINS wie in Diep.io haben vom Feeling."
   *
   * 920 ist genau diese halbe Bilddiagonale, aufgerundet: Jeder Punkt, den der
   * Spieler sieht, ist auch ein Punkt, den er befehlen kann – und keiner
   * darüber hinaus.
   */
  maxAimDistance: 920,
  playerRadius: 22,
  tickRate: 40,
  snapshotRate: 30,
  maxUpgradeLevel: 10,
  maxLevel: 60,
  maxPlayers: 80,
  shapeTargetCount: 562,
  respawnDelayMs: 2500,
  autoRespawnDelayMs: 7000,
  respawnInvulnerabilityMs: 2800,
  snapshotBackpressureBytes: 512000,
  projectileStepDistance: 10
} as const;

/**
 * Halbe Kantenlaengen des Entitaeten-Ausschnitts, den der Server liefert.
 *
 * Wer weiter sieht als das, sieht ein leeres Band: Waende und Raster zeichnet
 * der Client selbst, Tanks und Kugeln kommen vom Server. `viewport.ts` leitet
 * daraus seine Seitenverhaeltnis-Grenzen ab, `simulation-hardening.ts`
 * schneidet danach.
 */
export const ENTITY_CULL_HALF = {
  width: GAME.visibleWorldWidth / 2 + ENTITY_CULL_PADDING,
  height: GAME.visibleWorldHeight / 2 + ENTITY_CULL_PADDING
} as const;


export const EMPTY_UPGRADES = (): UpgradeLevels => ({ maxHealth:0, regen:0, moveSpeed:0, reload:0, damage:0, projectileSpeed:0, penetration:0, bodyDamage:0, signatureRate:0, signaturePower:0, projectileRange:0, moduleCooldown:0 });
export const sanitizePlayerName = (value:string):string => value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
export const xpThresholdForLevel = (level:number):number => { const clamped = Math.max(1, Math.min(GAME.maxLevel, Math.floor(level))); return Math.floor(58 * clamped + 15 * clamped * clamped + 0.55 * clamped * clamped * clamped); };
export const xpAtLevelStart = (level:number):number => level <= 1 ? 0 : xpThresholdForLevel(level - 1);
export const upgradePointsAtLevel = (level:number):number => Math.max(0, Math.min(GAME.maxLevel, Math.floor(level)) - 1);
export const respawnLevelFrom = (level:number):number => Math.max(1, Math.floor(level * 0.5));
/**
 * Score nach dem Respawn. Lebt in shared, damit Regel und Beschriftung aus
 * derselben Quelle rechnen: Die Basisklasse trug lange 0,45, die aktive
 * Tuning-Schicht 0,5 – gelaufen ist immer 0,5, und der Death-Screen soll
 * exakt die Zahl nennen, die der Server gleich setzt.
 */
export const respawnScoreFrom = (score:number):number => Math.max(0, Math.floor(score * 0.5));
/**
 * Klasse nach dem Respawn – **immer zurück auf den Anfang**.
 *
 * Vorher wurde nur auf die höchste noch legale Klasse zurückgestuft
 * (`classAvailableAtLevel`): Wer auf Level 60 als Gatling starb, kam auf
 * Level 30 als Gatling zurück und hat nie wieder gewählt. Sam: „man sollte
 * aber bei der Anfangsklasse wieder sein." Genau so – der zweite Run ist eine
 * neue Entscheidung, nicht die Fortsetzung der alten. Die behaltenen
 * Upgrade-Punkte machen ihn trotzdem stärker als den allerersten.
 */
export const respawnClassFrom = (_playerClass:PlayerClass):PlayerClass => 'core';
/**
 * Serverseitige Skalierung der Klassen-Beschleunigung (Ausweich-Buff).
 * Lebt in shared, weil die Client-Prediction exakt dieselbe Zahl spiegeln
 * muss – eine Abweichung von 12 % wäre in jedem Tick sichtbares Ruckeln.
 */
export const ACCELERATION_SCALE = 1.12;

/**
 * Spielmodi. Sams Reihenfolge vom 11.08.: Maze (heute) + FFA + Battle Royale,
 * und die Modi kommen zuletzt – „Modi erst wenn alles sitzt".
 *
 * Der Modus ist bewusst **eine Eigenschaft der Arena, nicht des Spielers**: Ein
 * Serverprozess betreibt genau eine Arena, so wie `WALLS` prozessweit ist. Wer
 * zwei Modi gleichzeitig anbieten will, startet zwei Prozesse – das ist
 * derselbe Weg, den auch `BOT_COUNT` und `RATE_LIMIT_*` schon gehen, und er
 * spart eine Menge Zustand, den sonst jede Regel mitschleppen müsste.
 *
 * `walls` ist der ganze Unterschied zwischen den ersten beiden Modi. Das klingt
 * nach wenig und ist trotzdem ein anderes Spiel: Ohne Deckung zählen Reichweite
 * und Tempo statt Ecken, SPECTER verliert seine Verstecke, SIEGE gewinnt freie
 * Schusslinien.
 */
export const ARENA_MODE_IDS = ['maze', 'ffa', 'royale'] as const;
export type ArenaMode = typeof ARENA_MODE_IDS[number];

export interface ArenaModeDefinition {
  readonly id: ArenaMode;
  readonly label: string;
  /** Kurzbeschreibung für die Auswahl – ein Satz, kein Absatz. */
  readonly blurb: string;
  /** Erzeugt die Arena Wände? Der einzige mechanische Unterschied. */
  readonly walls: boolean;
}

export const ARENA_MODES: Record<ArenaMode, ArenaModeDefinition> = {
  maze: {
    id: 'maze',
    label: 'Maze',
    blurb: 'Wände, Ecken und Deckung. Wer die Karte kennt, gewinnt Duelle, die er sonst verliert.',
    walls: true
  },
  ffa: {
    id: 'ffa',
    label: 'Free for All',
    blurb: 'Offene Arena ohne Wände. Freie Sichtlinien – Reichweite und Tempo entscheiden.',
    walls: false
  },
  royale: {
    id: 'royale',
    label: 'Battle Royale',
    blurb: 'Die Zone schrumpft. Wer draußen bleibt, verliert Leben – am Ende wird es eng.',
    // Wände bleiben: Eine schrumpfende Zone auf freiem Feld ist am Schluss ein
    // Kreis ohne Deckung, in dem nur noch zählt, wer zuerst schießt. Mit Ecken
    // bleibt die Endphase eine Entscheidung.
    walls: true
  }
};

/** Prüft eine Modus-Angabe von außen (Umgebungsvariable, künftig Client). */
export const isArenaMode = (value: unknown): value is ArenaMode =>
  typeof value === 'string' && (ARENA_MODE_IDS as readonly string[]).includes(value);

/**
 * Bewegungswerte aus Grundklasse, Tempo-Upgrade und Rahmen – **die einzige
 * Stelle**, an der diese Rechnung steht.
 *
 * Vorher stand sie zweimal: einmal im Server (`tunedStatsFor`) und einmal in
 * der Client-Vorhersage (`prediction.ts`). Beide waren zeichengleich, aber nur
 * per Hand gleichgehalten. Genau dieses Muster – eine Regel an einer Stelle
 * gepflegt, an einer zweiten dupliziert – hat in diesem Server schon zweimal
 * still versagt (`upgradeAppliesTo` und `respawnClassFrom` wurden von einer
 * Tuning-Schicht ueberschrieben und liefen monatelang nicht).
 *
 * Hier waere der Schaden besonders unangenehm: Weicht der Client um wenige
 * Prozent ab, zieht der Server ihn in jedem Tick zurueck. Das ist das
 * Gummiband, an dem man ein Prototyp-Gefuehl sofort erkennt – und es waere kein
 * Absturz, sondern ein schleichendes Ruckeln, das kein Test meldet.
 *
 * `ACCELERATION_SCALE` steckt bereits drin; Aufrufer multiplizieren ihn nicht
 * noch einmal.
 */
/**
 * Aufbau und Abbau der Signature, soweit sie sich aus der **eigenen Eingabe**
 * ergeben – und damit die einzigen Signature-Zahlen, die der Client vorhersagen
 * kann und muss.
 *
 * Sie standen zweimal: im Server (`DEFAULT_MOMENTUM`, `DEFAULT_WUCHT`) und in
 * `apps/client/src/prediction.ts`. Der Client darf `apps/server` nicht
 * importieren, deshalb war es dort abgeschrieben – mit einem Kommentar, der
 * genau diese Auflösung vorschlug. Beide Fassungen waren gleich, aber nur per
 * Hand gleichgehalten, und eine Abweichung zeigt sich nicht als Fehler, sondern
 * als Momentum-Balken, der im Client anders füllt als im Server.
 *
 * Nur diese vier Zahlen gehören hierher. Was danach damit passiert
 * (`maxReloadBonus`, `maxBodyDamageBonus`, Kontaktverbrauch) bleibt im Server:
 * Der Client sagt den Füllstand voraus, nicht die Wirkung.
 */
export const SIGNATURE_MOVEMENT = {
  /** Anteil der eigenen Höchstgeschwindigkeit, ab dem „in Fahrt" gilt. */
  moveThreshold: 0.45,
  buildPerSecond: 30,
  decayPerSecond: 50,
  /** Nur RAPID: fährt, hält die Feuertaste aber nicht. */
  holdDecayPerSecond: 10
} as const;

/**
 * Punkte-Ökonomie (BAL1): 0,03 → 0,05 je Punkt, damit volles Tempo (vorher
 * 1,30×) sich wieder wie ein echter Build anfühlt statt wie das schwächste
 * der drei sichtbaren Ziele (Schaden, Leben, Tempo) – siehe combat-tuning.ts
 * für die volle Rechnung. `acceleration` skaliert im selben Verhältnis mit
 * (0,018 → 0,03), sonst würde volles Tempo-Investment einen Tank bauen, der
 * schnell fährt, aber trödelig lenkt.
 */
/**
 * **Weicher Deckel auf das Fahrtempo** – Sams Spieltest vom 14.08., Punkt 9:
 * „Ich finde, paar Tanks bewegen sich noch überdurchschnittlich schnell, OP!"
 *
 * Gemessen über alle 67 Klassen bei vollem Tempo-Slot und dem schnellsten
 * Rahmen (`lightweight`, ×1,06):
 *
 * ```
 * comet     541 px/s     Median   401 px/s
 * blitz     509 px/s     Langsamste 353 px/s
 * smasher   485 px/s
 * ```
 *
 * Die eigentliche Zahl steht aber woanders: Das ganze Projektilsystem rechnet
 * seine Deckel und seinen Boden gegen `fastestPlayerSpeed` – und das sind
 * **447 px/s** (`projectile-speed.ts`). Ein voll ausgebauter Comet fuhr also
 * 21 % schneller als der Wert, gegen den jede Kugel im Spiel kalibriert ist.
 * Der Boden „keine Kugel ist langsamer als 1,25× Spielertempo" war für diese
 * Klassen schlicht falsch – sie liefen den Kugeln davon, gegen die sie
 * ausbalanciert sein sollten.
 *
 * Ein harter Deckel würde die Spitze einebnen (derselbe Fehler, den der
 * Tempo-Deckel der Projektile schon einmal gemacht hat, siehe dort). Deshalb
 * geht nur der ÜBERSCHUSS über dem Deckel zu 20 % durch: Die Reihenfolge bleibt,
 * der Abstand schrumpft.
 *
 * | | vorher | jetzt |
 * |---|---:|---:|
 * | comet | 541 | 452 |
 * | blitz | 509 | 446 |
 * | rapid | 461 | 436 |
 * | Median | 401 | 401 |
 *
 * 430 liegt bewusst ÜBER dem Median: Wer nichts in Tempo investiert, merkt
 * nichts – kein Grundtempo einer Klasse (Höchstwert 340) kommt in die Nähe.
 * Getroffen wird genau der voll ausgebaute Tempo-Build, also das, was Sam
 * gesehen hat. Danach liegt der schnellste überhaupt baubare Panzer bei
 * 452 px/s, also 1,2 % neben dem Bezugswert des Projektilsystems statt 21 %.
 *
 * Die Regel steht in `shared`, weil die Client-Vorhersage dieselbe Funktion
 * ruft: Zwei Fassungen wären in jedem Tick sichtbares Gummiband.
 */
export const TEMPO_DECKEL = 430;
export const TEMPO_WEICHHEIT = 0.2;

/** Unterhalb des Deckels unverändert, darüber geht nur der Überschuss anteilig durch. */
export const weichesTempo = (tempo: number): number =>
  (tempo <= TEMPO_DECKEL ? tempo : TEMPO_DECKEL + (tempo - TEMPO_DECKEL) * TEMPO_WEICHHEIT);

export function movementStatsFor(
  base: { moveSpeed: number; acceleration: number },
  moveUpgradeLevel: number,
  moveMultiplier = 1
): { moveSpeed: number; acceleration: number } {
  const punkte = Math.max(0, moveUpgradeLevel);
  return {
    moveSpeed: weichesTempo(base.moveSpeed * (1 + punkte * 0.05) * moveMultiplier),
    acceleration: base.acceleration * ACCELERATION_SCALE * (1 + punkte * 0.03) * moveMultiplier
  };
}

export const availableClassChoices = (current:PlayerClass, level:number):PlayerClass[] => PLAYER_CLASS_IDS.filter((id) => {
  if (id === current) return false;
  const definition = CLASS_DEFINITIONS[id];
  if (definition.unlockLevel > level) return false;
  if (definition.parent === current) return true;
  // Apex (L42): aus jeder Klasse der eigenen Familie erreichbar - wer bei
  // Gatling steht, soll den Rapid-Apex nicht verpassen, nur weil sein Pfad
  // vor drei Entscheidungen anders abgebogen ist.
  return definition.apexOf !== undefined && definition.apexOf === CLASS_DEFINITIONS[current].branch;
});
export const isValidClassChoice = (current:PlayerClass, target:PlayerClass, level:number):boolean => availableClassChoices(current, level).includes(target);
export const classAvailableAtLevel = (playerClass:PlayerClass, level:number):PlayerClass => { let current = CLASS_DEFINITIONS[playerClass]; const visited = new Set<PlayerClass>(); while (current.unlockLevel > level && current.parent) { if (visited.has(current.id)) return 'core'; visited.add(current.id); current = CLASS_DEFINITIONS[current.parent]; } return current.id; };

// ---------------------------------------------------------------------------
// Wire-Typen für den Delta-Versand (SNAPSHOT_DELTAS): Felder, die sich selten
// ändern, fehlen im Netzwerk-Snapshot und werden clientseitig aus einem Cache
// hydriert. Die vollständigen Typen oben bleiben unangetastet – Renderer, UI
// und Killcam arbeiten weiter mit garantiert vollständigen Daten.
// ---------------------------------------------------------------------------

/**
 * Auf der Leitung sind Entitäts-IDs entweder UUID-Strings oder – mit
 * SHORT_NET_IDS – fortlaufende Zahlen. Der Client normalisiert beim Empfang
 * alles per String(id); ab dort arbeitet er unverändert mit String-IDs.
 */
export type NetId = number | string;

export type WirePlayerSnapshot =
  Omit<PlayerSnapshot, 'id' | 'name' | 'playerClass' | 'isBot' | 'upgrades'>
  & { id: NetId }
  & Partial<Pick<PlayerSnapshot, 'name' | 'playerClass' | 'isBot' | 'upgrades'>>;
export type WireProjectileSnapshot =
  Omit<ProjectileSnapshot, 'id' | 'ownerId'> & { id: NetId; ownerId: NetId };
export type WireDroneSnapshot =
  Omit<DroneSnapshot, 'id' | 'ownerId'> & { id: NetId; ownerId: NetId };
export type WireShapeSnapshot =
  Omit<ShapeSnapshot, 'id' | 'kind' | 'radius' | 'maxHealth'>
  & { id: NetId }
  & Partial<Pick<ShapeSnapshot, 'kind' | 'radius' | 'maxHealth'>>;
export type WireLeaderboardEntry = Omit<LeaderboardEntry, 'id'> & { id: NetId };
export interface WireWorldSnapshot
  extends Omit<WorldSnapshot, 'selfId' | 'players' | 'projectiles' | 'drones' | 'shapes' | 'walls' | 'leaderboard' | 'killfeed'> {
  selfId: NetId | null;
  players: WirePlayerSnapshot[];
  projectiles: WireProjectileSnapshot[];
  drones: WireDroneSnapshot[];
  shapes: WireShapeSnapshot[];
  /** Wand-IDs bleiben kurze Strings (v3, h7, …). */
  walls?: Wall[];
  leaderboard?: WireLeaderboardEntry[];
  /** Enthält Namen, keine Entitäts-IDs. */
  killfeed?: KillEvent[];
}
