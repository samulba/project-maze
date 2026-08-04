import { CLASS_DEFINITIONS, PLAYER_CLASS_IDS, type PlayerClass } from './index.js';

export type ClassTier = 1 | 2 | 3 | 4;

export interface ClassBalanceMetrics {
  id: PlayerClass;
  tier: ClassTier;
  projectileDps: number;
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

export function classBalanceMetrics(playerClass: PlayerClass): ClassBalanceMetrics {
  const tank = CLASS_DEFINITIONS[playerClass];
  const projectileDps = tank.barrelCount > 0 ? tank.barrelCount * tank.damage / Math.max(0.001, tank.reload) : 0;
  const dronePressure = tank.droneCount > 0 ? tank.droneCount * tank.damage / Math.max(0.001, tank.reload) : 0;
  return {
    id: playerClass,
    tier: classTier(playerClass),
    projectileDps,
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
