import { GAME, type NetId, type Vector2 } from './index.js';

export const ACTIVE_MODULE_IDS = ['dash', 'repulse', 'barrier', 'repair'] as const;
export type ActiveModuleId = (typeof ACTIVE_MODULE_IDS)[number];

export const PASSIVE_MODIFIER_IDS = ['standard', 'lightweight', 'stabilizer', 'reinforced'] as const;
export type PassiveModifierId = (typeof PASSIVE_MODIFIER_IDS)[number];

export interface ActiveModuleDefinition {
  id: ActiveModuleId;
  label: string;
  shortLabel: string;
  description: string;
  role: 'mobility' | 'control' | 'defense' | 'sustain';
  /**
   * Anzeigename der Rolle. `role` ist ein interner Aufzählungstyp und stand
   * unübersetzt im Loadout-Menü („Dash · mobility") – der Kasten las sich wie
   * ein Entwicklerwerkzeug (Befund 44). Eine Quelle, damit Anzeige und Typ
   * nicht auseinanderlaufen.
   */
  roleLabel: string;
  cooldownMs: number;
  activeMs: number;
}

export interface PassiveModifierDefinition {
  id: PassiveModifierId;
  label: string;
  description: string;
  healthMultiplier: number;
  moveMultiplier: number;
  reloadMultiplier: number;
  projectileSpeedMultiplier: number;
}

export const ACTIVE_MODULE_DEFINITIONS: Record<ActiveModuleId, ActiveModuleDefinition> = {
  dash: {
    id: 'dash',
    label: 'Dash',
    shortLabel: 'DASH',
    description: 'Kurzer Bewegungsschub ohne Unverwundbarkeit.',
    role: 'mobility',
    roleLabel: 'Mobilität',
    cooldownMs: 10_000,
    activeMs: 180
  },
  repulse: {
    id: 'repulse',
    label: 'Repulse Pulse',
    shortLabel: 'PULSE',
    // Ehrlicher Text (Befund 63, Sams Entscheidung vom 12.08.): Gemessen
    // stößt der Puls einen Stehenden rund einen Tankdurchmesser weit und
    // kauft gegen einen Anlaufenden etwa eine halbe Sekunde – „verdrängt"
    // versprach eine Wirkung, die es in dieser Stellung nicht gibt.
    // Projektile lenkt er dagegen wirklich ab (und beschädigt sie).
    description: 'Stößt Nahe kurz zurück und lenkt Projektile ab – verschafft einen Moment Luft.',
    role: 'control',
    roleLabel: 'Kontrolle',
    cooldownMs: 12_000,
    activeMs: 260
  },
  barrier: {
    id: 'barrier',
    label: 'Front Barrier',
    shortLabel: 'BARRIER',
    description: 'Kurzer Schild gegen Angriffe aus dem Frontwinkel.',
    role: 'defense',
    roleLabel: 'Verteidigung',
    cooldownMs: 12_000,
    activeMs: 900
  },
  repair: {
    id: 'repair',
    label: 'Repair Cycle',
    shortLabel: 'REPAIR',
    description: 'Riskante Heilung, die durch Kampfhandlungen abbricht.',
    role: 'sustain',
    roleLabel: 'Erholung',
    cooldownMs: 17_000,
    activeMs: 3_000
  }
};

export const PASSIVE_MODIFIER_DEFINITIONS: Record<PassiveModifierId, PassiveModifierDefinition> = {
  standard: {
    id: 'standard',
    label: 'Standard Frame',
    description: 'Keine Veränderung. Empfohlene Basis.',
    healthMultiplier: 1,
    moveMultiplier: 1,
    reloadMultiplier: 1,
    projectileSpeedMultiplier: 1
  },
  lightweight: {
    id: 'lightweight',
    label: 'Lightweight Frame',
    description: '+6 % Bewegungs- und Drohnentempo, -8 % maximales Leben.',
    healthMultiplier: 0.92,
    moveMultiplier: 1.06,
    reloadMultiplier: 1,
    projectileSpeedMultiplier: 1
  },
  stabilizer: {
    id: 'stabilizer',
    label: 'Projectile Stabilizer',
    description: '+10 % Projektil- oder Drohnentempo, -8 % Feuer- bzw. Kontaktrate.',
    healthMultiplier: 1,
    moveMultiplier: 1,
    reloadMultiplier: 1.087,
    projectileSpeedMultiplier: 1.1
  },
  reinforced: {
    id: 'reinforced',
    label: 'Reinforced Core',
    description: '+10 % maximales Leben und Drohnenleben, -6 % Bewegungs- und Drohnentempo.',
    healthMultiplier: 1.1,
    moveMultiplier: 0.94,
    reloadMultiplier: 1,
    projectileSpeedMultiplier: 1
  }
};

export interface EquipLoadoutMessage {
  type: 'equipLoadout';
  activeModule: ActiveModuleId;
  passiveModifier: PassiveModifierId;
}

export interface ActivateModuleMessage {
  type: 'activateModule';
}

export type GameplayClientMessage = EquipLoadoutMessage | ActivateModuleMessage;

export interface PlayerGameplaySnapshot {
  activeModule: ActiveModuleId;
  passiveModifier: PassiveModifierId;
  moduleReadyAt: number;
  moduleActiveUntil: number;
  moduleCharge: number;
  barrierHealth: number;
  barrierMaxHealth: number;
  repairing: boolean;
  bountyValue: number;
}

export type ArenaEventKind = 'coreSurge' | 'overcharge' | 'hunterSignal' | 'fracture';
export type ArenaEventPhase = 'warning' | 'active';

export interface ArenaEventSnapshot {
  id: number;
  kind: ArenaEventKind;
  phase: ArenaEventPhase;
  startsAt: number;
  endsAt: number;
  center: Vector2;
  radius: number;
}

/**
 * Eine AEGIS-Entladung als Einmal-Ereignis (Befund 7).
 *
 * Die Entladung passiert serverseitig in einem Tick: 34 Schaden und ein Stoß
 * an alle im Radius, Schild auf null. Auf der Leitung war davon nichts zu
 * sehen – Getroffene flogen „grundlos" weg, und der Träger bekam für seinen
 * halben Lebensbalken Aufladung keinen einzigen Frame Auftritt. Der Server
 * hält gezündete Entladungen deshalb kurz vor (~1 s) und legt sie jedem
 * Snapshot bei, dessen Betrachter sie sehen kann; der Client spielt jede `id`
 * genau einmal ab.
 */
export interface DischargeBurst {
  /** Monoton wachsend über die Arena – der Client dedupliziert darüber. */
  id: number;
  x: number;
  y: number;
  /** Wirkradius der Entladung in Weltpixeln (`dischargeRadius` des Trägers). */
  radius: number;
  /** Träger des Schilds – für Kamera-Stoß und Ton beim eigenen Zünden. */
  ownerId: string | null;
}

/**
 * Ein erlittener Treffer mit Richtung (Befund 5).
 *
 * Wer aus dem Off beschossen wird, wusste bisher nur DASS es weh tut – der
 * Bildschirm ruckte, das Leben fiel, aber die Richtung stand nirgends. Der
 * Server kennt den Angreifer; dieser Eintrag trägt die Richtung vom
 * Getroffenen zu ihm. Er liegt **nur im eigenen Snapshot** – fremde Treffer
 * gehen niemanden etwas an und wären Bytes für nichts.
 */
export interface DamageDirection {
  /** Monoton über die Arena – der Client spielt jede Id genau einmal. */
  id: number;
  /** Richtung vom Getroffenen ZUM Angreifer, Radiant in Weltkoordinaten. */
  angle: number;
}

/**
 * Die schrumpfende Zone des Battle-Royale-Modus.
 *
 * Bewusst dieselbe Form wie `ArenaEventSnapshot` (Mittelpunkt plus Radius) –
 * der Client zeichnet Event-Zonen bereits im Feld und auf der Minimap. Eine
 * zweite Geometrie zu erfinden hieße, dieselbe Sache zweimal zu zeichnen und
 * zweimal falsch machen zu können.
 *
 * Der Unterschied zum Event: Diese Zone schrumpft, und wer draußen steht,
 * verliert Leben. `damagePerSecond` steht deshalb mit drin, damit die Anzeige
 * sagen kann, wie dringend es ist, statt nur *dass* es dringend ist.
 */
export interface RoyaleZoneSnapshot {
  center: Vector2;
  /** Aktueller Radius – zwischen zwei Stufen linear unterwegs. */
  radius: number;
  /** Ziel der laufenden Verengung; gleich `radius`, solange die Zone hält. */
  targetRadius: number;
  phase: 'wartet' | 'schrumpft' | 'haelt';
  /**
   * Millisekunden, bis die **nächste Verengung beginnt**. `0`, solange schon
   * eine läuft, in der Rundenpause und sobald die Zone ihren Mindestradius
   * erreicht hat – dann kommt keine mehr.
   *
   * Bewusst diese eine Bedeutung statt „Restzeit der laufenden Phase": Am
   * Mindestradius hält die Zone in Zyklen weiter, ein Phasenende wäre dort ein
   * angekündigtes Schrumpfen, das nie kommt. Eine Anzeige, die einmal lügt,
   * glaubt danach niemand mehr.
   *
   * Relativ und nicht als Zeitpunkt, weil der Client keine mit dem Server
   * abgeglichene Uhr hat – `nextRoundInMs` steht aus demselben Grund so da.
   *
   * Ohne diese Zahl erfährt ein Spieler erst vom Schrumpfen, wenn es schon
   * läuft – dann ist die Entscheidung „noch eine Form oder schon losfahren"
   * bereits gefallen. Genau diese Entscheidung ist der Takt des Modus.
   */
  nextShrinkInMs: number;
  /** Schaden je Sekunde außerhalb, steigt mit jeder Stufe. */
  damagePerSecond: number;
  /** Wie viele Stufen die Zone schon hinter sich hat. */
  stage: number;
  /**
   * Runde und Zone stehen zusammen in einem Feld, obwohl es zwei Dinge sind.
   *
   * Grund: Sie treten nie getrennt auf – es gibt keine Zone ohne Runde und
   * keine Runde ohne Zone. Ein zweites Wire-Feld hieße, an jeder Stelle beide
   * auf `null` zu prüfen, ohne dass je nur eines gesetzt wäre.
   */
  /** Wie viele Spieler noch leben – die Zahl, die im Battle Royale zählt. */
  alive: number;
  /** Runde entschieden: Es lebt höchstens noch einer. */
  roundOver: boolean;
  /** Name des Überlebenden, sobald die Runde entschieden ist. */
  winnerName: string | null;
  /** Millisekunden bis zur nächsten Runde; 0, solange die aktuelle läuft. */
  nextRoundInMs: number;
}

export interface GameplayWorldExtension {
  gameplay: Record<string, PlayerGameplaySnapshot>;
  eliteShapeIds: string[];
  arenaEvent: ArenaEventSnapshot | null;
  /** Nur im Battle-Royale-Modus gesetzt, sonst null. */
  royaleZone: RoyaleZoneSnapshot | null;
  bountyTargetId: string | null;
  bountyValue: number;
  /** Neutraler Elite-Guardian des Hunter-Signal-Events (Spieler-ID in snapshot.players), sonst null. */
  arenaGuardianId: string | null;
  /** Seit dem letzten Snapshot dieses Clients freigeschaltet. Leer = nichts Neues. */
  freshAchievements: AchievementId[];
  /** AEGIS-Entladungen der letzten ~1 s im Sichtfeld (Befund 7). Leer = keine. */
  dischargeBursts: DischargeBurst[];
  /** Eigene erlittene Treffer der letzten ~1 s, mit Richtung (Befund 5). Nur Self. */
  damageDirections: DamageDirection[];
  /**
   * Tank, aus dessen Perspektive dieser Snapshot gebaut wurde – gesetzt, solange
   * der eigene Spieler tot ist und seinem Killer zusieht (SPECTATOR_ENABLED).
   * `selfId` bleibt davon unberührt und zeigt weiterhin auf den eigenen Spieler.
   */
  spectatorTargetId: string | null;
}

/** Wire-Variante der Gameplay-Erweiterung: IDs können kurze Zahlen sein. */
export interface WireGameplayWorldExtension
  extends Omit<GameplayWorldExtension, 'gameplay' | 'eliteShapeIds' | 'bountyTargetId' | 'arenaGuardianId' | 'spectatorTargetId' | 'dischargeBursts'> {
  /** Schlüssel sind die NetIds aus `players` – als String, wie in JSON üblich. */
  gameplay: Record<string, PlayerGameplaySnapshot>;
  eliteShapeIds: NetId[];
  bountyTargetId: NetId | null;
  arenaGuardianId: NetId | null;
  spectatorTargetId: NetId | null;
  dischargeBursts: Array<Omit<DischargeBurst, 'ownerId'> & { ownerId: NetId | null }>;
}

export const DEFAULT_ACTIVE_MODULE: ActiveModuleId = 'dash';
export const DEFAULT_PASSIVE_MODIFIER: PassiveModifierId = 'standard';

/**
 * Wirkradius des Repulse in Weltpixeln. Steht hier und nicht nur im Server,
 * damit der Client den Ring zeichnen kann, ohne die Zahl abzuschreiben – die
 * zweite Zahlenquelle ist der Fehler, den `ACCELERATION_SCALE` uns beigebracht
 * hat. Kostet kein Byte im Snapshot: Der Wert ändert sich nie.
 */
export const REPULSE_RADIUS = 195;
/**
 * Frontwinkel der Barriere als Skalarprodukt zwischen Blickrichtung des
 * Verteidigers und Richtung des Angreifers. 0,28 entspricht rund ±74°.
 * Alles darunter kommt an der Barriere vorbei.
 */
export const BARRIER_FRONT_DOT = 0.28;

export const ACHIEVEMENT_IDS = [
  'firstStreak5',
  'guardianSlayer',
  'maxLevel',
  'threeFamilies',
  'overchargeDuelist',
  'fractureFlanker',
  'score10k',
  // Befund 57: Der einzige teilbare Moment des Spiels -- letzter von allen in
  // einer Royale-Runde -- hinterliess vorher nirgends eine Spur.
  'royaleWinner'
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export interface AchievementInfo {
  id: AchievementId;
  name: string;
  description: string;
}

/** Statischer Katalog für Popups und Profilkarte – ohne Serverabfrage nutzbar. */
export const ACHIEVEMENT_CATALOG: Record<AchievementId, AchievementInfo> = {
  firstStreak5: { id: 'firstStreak5', name: 'Lauf ohne Ende', description: 'Erreiche eine Serie von fünf Abschüssen, ohne zu sterben.' },
  guardianSlayer: { id: 'guardianSlayer', name: 'Signal gebrochen', description: 'Erlege den neutralen Guardian des Hunter-Signal-Events.' },
  // Aus den Daten gebaut, nicht abgeschrieben: Der Server formuliert denselben
  // Satz aus `GAME.maxLevel` (`achievements.ts`). Als feste 45 stand hier eine
  // Zahl, die seit der Anhebung auf 60 falsch war -- und zwar ueberall, wo der
  // Katalog beschriftet: Popup, Profilkarte und die Profil-API des Servers.
  maxLevel: { id: 'maxLevel', name: 'Ausgereizt', description: `Erreiche Level ${GAME.maxLevel}.` },
  threeFamilies: { id: 'threeFamilies', name: 'Allrounder', description: 'Spiele drei verschiedene Klassenfamilien in einer Verbindung.' },
  overchargeDuelist: { id: 'overchargeDuelist', name: 'Überladen', description: 'Besiege einen Gegner während Overcharge innerhalb der Eventzone.' },
  fractureFlanker: { id: 'fractureFlanker', name: 'Durch die Bresche', description: 'Besiege einen Gegner durch ein von Fracture aufgebrochenes Wandsegment.' },
  score10k: { id: 'score10k', name: 'Fünfstellig', description: 'Erreiche 10.000 Punkte in einem Lauf.' },
  royaleWinner: { id: 'royaleWinner', name: 'Letzter Überlebender', description: 'Gewinne eine Battle-Royale-Runde.' }
};
