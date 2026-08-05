import type { Vector2 } from './index.js';

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
    cooldownMs: 10_000,
    activeMs: 180
  },
  repulse: {
    id: 'repulse',
    label: 'Repulse Pulse',
    shortLabel: 'PULSE',
    description: 'Verdrängt Gegner, Drohnen und nahe Projektile.',
    role: 'control',
    cooldownMs: 12_000,
    activeMs: 260
  },
  barrier: {
    id: 'barrier',
    label: 'Front Barrier',
    shortLabel: 'BARRIER',
    description: 'Kurzer Schild gegen Angriffe aus dem Frontwinkel.',
    role: 'defense',
    cooldownMs: 12_000,
    activeMs: 900
  },
  repair: {
    id: 'repair',
    label: 'Repair Cycle',
    shortLabel: 'REPAIR',
    description: 'Riskante Heilung, die durch Kampfhandlungen abbricht.',
    role: 'sustain',
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

export interface GameplayWorldExtension {
  gameplay: Record<string, PlayerGameplaySnapshot>;
  eliteShapeIds: string[];
  arenaEvent: ArenaEventSnapshot | null;
  bountyTargetId: string | null;
  bountyValue: number;
  /** Neutraler Elite-Guardian des Hunter-Signal-Events (Spieler-ID in snapshot.players), sonst null. */
  arenaGuardianId: string | null;
  /** Seit dem letzten Snapshot dieses Clients freigeschaltet. Leer = nichts Neues. */
  freshAchievements: AchievementId[];
}

export const DEFAULT_ACTIVE_MODULE: ActiveModuleId = 'dash';
export const DEFAULT_PASSIVE_MODIFIER: PassiveModifierId = 'standard';

export const ACHIEVEMENT_IDS = [
  'firstStreak5',
  'guardianSlayer',
  'maxLevel',
  'threeFamilies',
  'overchargeDuelist',
  'fractureFlanker',
  'score10k'
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
  maxLevel: { id: 'maxLevel', name: 'Ausgereizt', description: 'Erreiche Level 45.' },
  threeFamilies: { id: 'threeFamilies', name: 'Allrounder', description: 'Spiele drei verschiedene Klassenfamilien in einer Verbindung.' },
  overchargeDuelist: { id: 'overchargeDuelist', name: 'Überladen', description: 'Besiege einen Gegner während Overcharge innerhalb der Eventzone.' },
  fractureFlanker: { id: 'fractureFlanker', name: 'Durch die Bresche', description: 'Besiege einen Gegner durch ein von Fracture aufgebrochenes Wandsegment.' },
  score10k: { id: 'score10k', name: 'Fünfstellig', description: 'Erreiche 10.000 Punkte in einem Lauf.' }
};
