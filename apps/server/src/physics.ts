import type { Vector2 } from '@project-maze/shared';

export const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
export const lengthSquared = (vector: Vector2): number => vector.x * vector.x + vector.y * vector.y;
export const distanceSquared = (a: Vector2, b: Vector2): number => { const dx = a.x - b.x; const dy = a.y - b.y; return dx * dx + dy * dy; };
export const normalize = (vector: Vector2): Vector2 => { const length = Math.hypot(vector.x, vector.y); if (!Number.isFinite(length) || length < 0.00001) return { x: 0, y: 0 }; return { x: vector.x / length, y: vector.y / length }; };
export const clampMagnitude = (vector: Vector2, maximum: number): Vector2 => { const length = Math.hypot(vector.x, vector.y); if (!Number.isFinite(length) || length < 0.00001) return { x: 0, y: 0 }; if (length <= maximum) return vector; const scale = maximum / length; return { x: vector.x * scale, y: vector.y * scale }; };
export const moveToward = (current: number, target: number, maximumDelta: number): number => { const difference = target - current; if (Math.abs(difference) <= maximumDelta) return target; return current + Math.sign(difference) * maximumDelta; };
export const moveVectorToward = (current: Vector2, target: Vector2, maximumDelta: number): Vector2 => { const difference = { x: target.x - current.x, y: target.y - current.y }; const distance = Math.hypot(difference.x, difference.y); if (distance <= maximumDelta || distance < 0.00001) return { ...target }; const scale = maximumDelta / distance; return { x: current.x + difference.x * scale, y: current.y + difference.y * scale }; };
export interface ProjectileDurability { damage: number; integrity: number; }
export function resolveProjectilePair(a: ProjectileDurability, b: ProjectileDurability): void { const damageToA = Math.max(0, b.damage); const damageToB = Math.max(0, a.damage); a.integrity -= damageToA; b.integrity -= damageToB; }
