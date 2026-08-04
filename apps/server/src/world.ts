import { GAME, type ShapeKind, type ShapeSnapshot, type Vector2, type Wall } from '@project-maze/shared';

const wall = (id: string, x: number, y: number, width: number, height: number): Wall => ({ id, x, y, width, height });

export const WALLS: Wall[] = [
  wall('w1', 340, 260, 600, 64),
  wall('w2', 1080, 200, 64, 620),
  wall('w3', 1390, 460, 640, 64),
  wall('w4', 2240, 180, 64, 720),
  wall('w5', 2740, 360, 520, 64),
  wall('w6', 430, 920, 720, 64),
  wall('w7', 1320, 860, 64, 720),
  wall('w8', 1660, 1120, 700, 64),
  wall('w9', 2540, 940, 64, 700),
  wall('w10', 2920, 1220, 430, 64),
  wall('w11', 260, 1590, 640, 64),
  wall('w12', 1040, 1480, 64, 620),
  wall('w13', 1430, 1940, 680, 64),
  wall('w14', 2210, 1660, 64, 520),
  wall('w15', 2580, 1920, 650, 64),
  wall('w16', 610, 520, 64, 220),
  wall('w17', 1770, 690, 64, 210),
  wall('w18', 3040, 700, 64, 260),
  wall('w19', 680, 1180, 64, 210),
  wall('w20', 1910, 1460, 64, 240)
];

const SPAWNS: Vector2[] = [
  { x: 170, y: 170 },
  { x: GAME.worldWidth - 170, y: 170 },
  { x: 170, y: GAME.worldHeight - 170 },
  { x: GAME.worldWidth - 170, y: GAME.worldHeight - 170 },
  { x: GAME.worldWidth / 2, y: 180 },
  { x: GAME.worldWidth / 2, y: GAME.worldHeight - 180 },
  { x: 180, y: GAME.worldHeight / 2 },
  { x: GAME.worldWidth - 180, y: GAME.worldHeight / 2 }
];

export function circleHitsWall(position: Vector2, radius: number, candidate: Wall): boolean {
  const nearestX = Math.max(candidate.x, Math.min(position.x, candidate.x + candidate.width));
  const nearestY = Math.max(candidate.y, Math.min(position.y, candidate.y + candidate.height));
  const dx = position.x - nearestX;
  const dy = position.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

export function isInsideWorld(position: Vector2, radius: number): boolean {
  return position.x >= radius && position.y >= radius && position.x <= GAME.worldWidth - radius && position.y <= GAME.worldHeight - radius;
}

export function isFree(position: Vector2, radius: number): boolean {
  return isInsideWorld(position, radius) && !WALLS.some((candidate) => circleHitsWall(position, radius, candidate));
}

export function randomSpawn(random = Math.random): Vector2 {
  const shuffled = [...SPAWNS].sort(() => random() - 0.5);
  const base = shuffled[0] ?? { x: 180, y: 180 };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = {
      x: base.x + (random() - 0.5) * 180,
      y: base.y + (random() - 0.5) * 180
    };
    if (isFree(candidate, 34)) return candidate;
  }
  return { ...base };
}

const shapeConfig: Record<ShapeKind, { radius: number; health: number }> = {
  square: { radius: 13, health: 26 },
  triangle: { radius: 17, health: 48 },
  pentagon: { radius: 23, health: 105 }
};

function randomShapeKind(random: () => number): ShapeKind {
  const roll = random();
  if (roll < 0.12) return 'pentagon';
  if (roll < 0.42) return 'triangle';
  return 'square';
}

export function createShape(id: string, random = Math.random): ShapeSnapshot {
  const kind = randomShapeKind(random);
  const config = shapeConfig[kind];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const position = {
      x: 90 + random() * (GAME.worldWidth - 180),
      y: 90 + random() * (GAME.worldHeight - 180)
    };
    if (isFree(position, config.radius + 12)) {
      return { id, kind, position, radius: config.radius, health: config.health, maxHealth: config.health };
    }
  }
  return { id, kind, position: { x: 180, y: 180 }, radius: config.radius, health: config.health, maxHealth: config.health };
}

export const SHAPE_REWARDS: Record<ShapeKind, number> = {
  square: 18,
  triangle: 38,
  pentagon: 90
};
