import { GAME, type ShapeKind, type ShapeSnapshot, type Vector2, type Wall } from '@project-maze/shared';
import { clamp, normalize } from './physics.js';

interface ShapeConfig { radius: number; health: number; reward: number; bodyDamage: number; drift: number; }
export const SHAPE_CONFIG: Record<ShapeKind, ShapeConfig> = {
  square: { radius: 13, health: 28, reward: 20, bodyDamage: 8, drift: 20 },
  triangle: { radius: 18, health: 58, reward: 48, bodyDamage: 13, drift: 27 },
  pentagon: { radius: 25, health: 145, reward: 125, bodyDamage: 22, drift: 16 }
};
function seededRandom(seed: number): () => number { let state = seed >>> 0; return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; }; }
const wall = (id: string, x: number, y: number, width: number, height: number): Wall => ({ id, x, y, width, height });
function generateWalls(): Wall[] {
  const random = seededRandom(0x4d415a45); const walls: Wall[] = []; let id = 0;
  for (let x = 650; x < GAME.worldWidth - 500; x += 650) {
    for (let row = 0; row < 4; row += 1) {
      if (random() < 0.34) continue; const laneHeight = GAME.worldHeight / 4; const height = 280 + random() * 390; const y = row * laneHeight + 110 + random() * Math.max(80, laneHeight - height - 180); walls.push(wall(`v${id++}`, x + (random() - 0.5) * 110, y, 54, height));
    }
  }
  for (let y = 560; y < GAME.worldHeight - 430; y += 570) {
    for (let column = 0; column < 6; column += 1) {
      if (random() < 0.38) continue; const laneWidth = GAME.worldWidth / 6; const width = 320 + random() * 500; const x = column * laneWidth + 120 + random() * Math.max(80, laneWidth - width - 190); walls.push(wall(`h${id++}`, x, y + (random() - 0.5) * 95, width, 54));
    }
  }
  walls.push(wall(`l${id++}`, 2750, 1710, 500, 54), wall(`l${id++}`, 2973, 1485, 54, 500), wall(`l${id++}`, 1150, 780, 420, 54), wall(`l${id++}`, 4450, 3090, 420, 54), wall(`l${id++}`, 850, 2850, 54, 420), wall(`l${id++}`, 5070, 680, 54, 420));
  return walls.filter((candidate) => candidate.x >= 120 && candidate.y >= 120 && candidate.x + candidate.width <= GAME.worldWidth - 120 && candidate.y + candidate.height <= GAME.worldHeight - 120);
}
export const WALLS: Wall[] = generateWalls();
const SPAWNS: Vector2[] = [{ x: 240, y: 240 }, { x: GAME.worldWidth - 240, y: 240 }, { x: 240, y: GAME.worldHeight - 240 }, { x: GAME.worldWidth - 240, y: GAME.worldHeight - 240 }, { x: GAME.worldWidth / 2, y: 250 }, { x: GAME.worldWidth / 2, y: GAME.worldHeight - 250 }, { x: 250, y: GAME.worldHeight / 2 }, { x: GAME.worldWidth - 250, y: GAME.worldHeight / 2 }, { x: GAME.worldWidth * 0.25, y: GAME.worldHeight * 0.5 }, { x: GAME.worldWidth * 0.75, y: GAME.worldHeight * 0.5 }];
export function circleHitsWall(position: Vector2, radius: number, candidate: Wall): boolean { const nearestX = clamp(position.x, candidate.x, candidate.x + candidate.width); const nearestY = clamp(position.y, candidate.y, candidate.y + candidate.height); const dx = position.x - nearestX; const dy = position.y - nearestY; return dx * dx + dy * dy < radius * radius; }
export function isInsideWorld(position: Vector2, radius: number): boolean { return position.x >= radius && position.y >= radius && position.x <= GAME.worldWidth - radius && position.y <= GAME.worldHeight - radius; }
export function nearbyWalls(position: Vector2, radius: number): Wall[] { return WALLS.filter((candidate) => candidate.x <= position.x + radius && candidate.x + candidate.width >= position.x - radius && candidate.y <= position.y + radius && candidate.y + candidate.height >= position.y - radius); }
export function isFree(position: Vector2, radius: number): boolean { return isInsideWorld(position, radius) && !nearbyWalls(position, radius + 12).some((candidate) => circleHitsWall(position, radius, candidate)); }
export function moveCircle(position: Vector2, velocity: Vector2, dt: number, radius: number): { position: Vector2; velocity: Vector2; collided: boolean } {
  const distance = Math.hypot(velocity.x, velocity.y) * dt; const steps = Math.max(1, Math.ceil(distance / Math.max(8, radius * 0.55))); const stepDt = dt / steps; const next = { ...position }; const resolvedVelocity = { ...velocity }; let collided = false;
  for (let step = 0; step < steps; step += 1) {
    const xCandidate = { x: next.x + resolvedVelocity.x * stepDt, y: next.y }; if (isFree(xCandidate, radius)) next.x = xCandidate.x; else { resolvedVelocity.x = 0; collided = true; }
    const yCandidate = { x: next.x, y: next.y + resolvedVelocity.y * stepDt }; if (isFree(yCandidate, radius)) next.y = yCandidate.y; else { resolvedVelocity.y = 0; collided = true; }
  }
  return { position: next, velocity: resolvedVelocity, collided };
}
export function randomSpawn(random = Math.random): Vector2 {
  const start = Math.floor(random() * SPAWNS.length);
  for (let offset = 0; offset < SPAWNS.length; offset += 1) { const base = SPAWNS[(start + offset) % SPAWNS.length] ?? SPAWNS[0] ?? { x: 240, y: 240 }; for (let attempt = 0; attempt < 24; attempt += 1) { const candidate = { x: base.x + (random() - 0.5) * 340, y: base.y + (random() - 0.5) * 340 }; if (isFree(candidate, 42)) return candidate; } }
  for (let attempt = 0; attempt < 120; attempt += 1) { const candidate = { x: 120 + random() * (GAME.worldWidth - 240), y: 120 + random() * (GAME.worldHeight - 240) }; if (isFree(candidate, 42)) return candidate; }
  return { x: 240, y: 240 };
}
function randomShapeKind(random: () => number): ShapeKind { const roll = random(); if (roll < 0.1) return 'pentagon'; if (roll < 0.38) return 'triangle'; return 'square'; }
export function createShape(id: string, random = Math.random): ShapeSnapshot {
  const kind = randomShapeKind(random); const config = SHAPE_CONFIG[kind];
  for (let attempt = 0; attempt < 160; attempt += 1) { const position = { x: 100 + random() * (GAME.worldWidth - 200), y: 100 + random() * (GAME.worldHeight - 200) }; if (!isFree(position, config.radius + 12)) continue; const angle = random() * Math.PI * 2; const speed = config.drift * (0.45 + random() * 0.55); return { id, kind, position, velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, radius: config.radius, rotation: random() * Math.PI * 2, health: config.health, maxHealth: config.health }; }
  return { id, kind, position: randomSpawn(random), velocity: { x: 0, y: 0 }, radius: config.radius, rotation: 0, health: config.health, maxHealth: config.health };
}
export function stepShape(shape: ShapeSnapshot, dt: number): void { shape.rotation += (shape.kind === 'triangle' ? -0.55 : shape.kind === 'pentagon' ? 0.22 : 0.38) * dt; const result = moveCircle(shape.position, shape.velocity, dt, shape.radius); shape.position = result.position; if (result.collided) { const direction = normalize({ x: -shape.velocity.x + (Math.random() - 0.5) * 18, y: -shape.velocity.y + (Math.random() - 0.5) * 18 }); const speed = Math.max(8, Math.hypot(shape.velocity.x, shape.velocity.y)); shape.velocity = { x: direction.x * speed, y: direction.y * speed }; } }
function segmentIntersectsWall(start: Vector2, end: Vector2, candidate: Wall): boolean { const dx = end.x - start.x; const dy = end.y - start.y; let tMin = 0; let tMax = 1; const checks: Array<[number, number]> = [[-dx, start.x - candidate.x], [dx, candidate.x + candidate.width - start.x], [-dy, start.y - candidate.y], [dy, candidate.y + candidate.height - start.y]]; for (const [p, q] of checks) { if (Math.abs(p) < 0.00001) { if (q < 0) return false; continue; } const ratio = q / p; if (p < 0) tMin = Math.max(tMin, ratio); else tMax = Math.min(tMax, ratio); if (tMin > tMax) return false; } return true; }
export function hasLineOfSight(start: Vector2, end: Vector2): boolean { const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }; const radius = Math.hypot(end.x - start.x, end.y - start.y) / 2 + 20; return !nearbyWalls(center, radius).some((candidate) => segmentIntersectsWall(start, end, candidate)); }
export function wallsInView(position: Vector2): Wall[] { const halfWidth = GAME.visibleWorldWidth * 0.62; const halfHeight = GAME.visibleWorldHeight * 0.72; return WALLS.filter((candidate) => candidate.x <= position.x + halfWidth && candidate.x + candidate.width >= position.x - halfWidth && candidate.y <= position.y + halfHeight && candidate.y + candidate.height >= position.y - halfHeight); }
