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
    description: '+6 % Bewegung, -8 % maximales Leben.',
    healthMultiplier: 0.92,
    moveMultiplier: 1.06,
    reloadMultiplier: 1,
    projectileSpeedMultiplier: 1
  },
  stabilizer: {
    id: 'stabilizer',
    label: 'Projectile Stabilizer',
    description: '+10 % Projektiltempo, -8 % Feuerrate.',
    healthMultiplier: 1,
    moveMultiplier: 1,
    reloadMultiplier: 1.087,
    projectileSpeedMultiplier: 1.1
  },
  reinforced: {
    id: 'reinforced',
    label: 'Reinforced Core',
    description: '+10 % maximales Leben, -6 % Bewegung.',
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

export type ArenaEventKind = 'coreSurge';
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
}

export const DEFAULT_ACTIVE_MODULE: ActiveModuleId = 'dash';
export const DEFAULT_PASSIVE_MODIFIER: PassiveModifierId = 'standard';
