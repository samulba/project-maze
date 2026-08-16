import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, type PlayerClass } from './index.js';

export type ClassTier = 1 | 2 | 3 | 4;

export interface ClassBalanceMetrics {
  id: PlayerClass;
  tier: ClassTier;
  projectileDps: number;
  forwardProjectileDps: number;
  burstDamage: number;
  projectileRange: number;
  effectiveDurability: number;
  mobility: number;
  dronePressure: number;
  bodyThreat: number;
}

export function classTier(playerClass: PlayerClass): ClassTier {
  const level = CLASS_DEFINITIONS[playerClass].unlockLevel;
  if (level >= 38) return 4;
  if (level >= 24) return 3;
  if (level >= 10) return 2;
  return 1;
}

const normalizeAngle = (angle: number): number => {
  let result = angle % (Math.PI * 2);
  if (result > Math.PI) result -= Math.PI * 2;
  if (result < -Math.PI) result += Math.PI * 2;
  return result;
};

/**
 * Läufe, die grob nach vorn zeigen (±60°); ohne gesetzte Winkel zählen alle.
 *
 * **Liest seit dem 16.08. auch `barrels`.** Vorher sah diese Rechnung nur
 * `barrelAngles` – und als die Lauf-Profile (`barrels`) die festen Winkel
 * ablösten, hielt sie Octos acht Rundum-Läufe für acht Frontläufe und meldete
 * 173 statt 92 DPS. Die drei Balance-Tests haben genau das gefangen; ohne sie
 * wäre eine Klasse still um 88 % über ihr Rollenkorridor gerutscht.
 */
export function forwardBarrelCount(playerClass: PlayerClass): number {
  const tank = CLASS_DEFINITIONS[playerClass];
  const nachVorn = (winkel: number): boolean => Math.abs(normalizeAngle(winkel)) <= Math.PI / 3;
  if (tank.barrels) return tank.barrels.filter((profil) => nachVorn(profil.angle ?? 0)).length;
  if (!tank.barrelAngles) return tank.barrelCount;
  return tank.barrelAngles.filter(nachVorn).length;
}

export function classBalanceMetrics(playerClass: PlayerClass): ClassBalanceMetrics {
  const tank = CLASS_DEFINITIONS[playerClass];
  const projectileDps = tank.barrelCount > 0 ? tank.barrelCount * tank.damage / Math.max(0.001, tank.reload) : 0;
  const forwardProjectileDps = tank.barrelCount > 0 ? forwardBarrelCount(playerClass) * tank.damage / Math.max(0.001, tank.reload) : 0;
  const dronePressure = tank.droneCount > 0 ? tank.droneCount * tank.damage / Math.max(0.001, tank.reload) : 0;
  return {
    id: playerClass,
    tier: classTier(playerClass),
    projectileDps,
    forwardProjectileDps,
    burstDamage: tank.damage * Math.max(1, tank.barrelCount),
    projectileRange: tank.projectileSpeed * tank.projectileLife,
    effectiveDurability: tank.maxHealth + tank.regen * 10,
    mobility: tank.moveSpeed + tank.acceleration * 0.02,
    dronePressure,
    bodyThreat: tank.bodyDamage * tank.moveSpeed / 100
  };
}

export function allClassBalanceMetrics(): ClassBalanceMetrics[] {
  return PLAYER_CLASS_IDS.map(classBalanceMetrics);
}
