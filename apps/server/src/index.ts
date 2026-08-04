import { createServer } from 'node:http';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { GAME, type ClientMessage, type PlayerClass, type PlayerSnapshot, type ProjectileSnapshot, type ShapeSnapshot, type Vector2, type Wall, type WorldSnapshot } from '@project-maze/shared';

const PORT = Number(process.env.PORT ?? 2567);
const app = express();
app.use(cors());
const server = createServer(app);
const wss = new WebSocketServer({ server });

interface Player extends PlayerSnapshot {
  socket: WebSocket;
  move: Vector2;
  aim: Vector2;
  shooting: boolean;
  lastInput: number;
  cooldown: number;
  score: number;
}
interface Projectile extends ProjectileSnapshot { velocity: Vector2; damage: number; life: number; }

const players = new Map<string, Player>();
const projectiles = new Map<string, Projectile>();
const shapes = new Map<string, ShapeSnapshot>();
const walls: Wall[] = [
  { x: 400, y: 300, width: 520, height: 65 }, { x: 1050, y: 240, width: 65, height: 620 },
  { x: 1430, y: 520, width: 600, height: 65 }, { x: 2250, y: 220, width: 65, height: 700 },
  { x: 350, y: 1050, width: 760, height: 65 }, { x: 1370, y: 900, width: 65, height: 760 },
  { x: 1770, y: 1320, width: 800, height: 65 }, { x: 2700, y: 870, width: 65, height: 780 }
];
for (let i = 0; i < 70; i += 1) {
  shapes.set(`shape-${i}`, { id: `shape-${i}`, position: { x: 120 + ((i * 347) % 2960), y: 120 + ((i * 223) % 1960) }, radius: i % 5 === 0 ? 18 : 13, health: i % 5 === 0 ? 45 : 25 });
}

const stats: Record<PlayerClass, { speed: number; rate: number; projectileSpeed: number; damage: number; radius: number }> = {
  shooter: { speed: 250, rate: 0.22, projectileSpeed: 760, damage: 18, radius: 7 },
  sniper: { speed: 225, rate: 0.72, projectileSpeed: 1100, damage: 46, radius: 8 },
  drone: { speed: 240, rate: 0.34, projectileSpeed: 590, damage: 14, radius: 9 }
};
const joinSchema = z.object({ type: z.literal('join'), name: z.string().trim().min(1).max(18), playerClass: z.enum(['shooter', 'sniper', 'drone']) });
const inputSchema = z.object({ type: z.literal('input'), sequence: z.number().int().nonnegative(), move: z.object({ x: z.number().finite(), y: z.number().finite() }), aim: z.object({ x: z.number().finite(), y: z.number().finite() }), shooting: z.boolean() });

const normalize = (v: Vector2): Vector2 => {
  const length = Math.hypot(v.x, v.y);
  return !Number.isFinite(length) || length < 0.001 ? { x: 0, y: 0 } : { x: v.x / Math.max(1, length), y: v.y / Math.max(1, length) };
};
const hitsWall = (p: Vector2, r: number, wall: Wall): boolean => {
  const x = Math.max(wall.x, Math.min(p.x, wall.x + wall.width));
  const y = Math.max(wall.y, Math.min(p.y, wall.y + wall.height));
  return Math.hypot(p.x - x, p.y - y) < r;
};
const respawn = (player: Player): void => {
  player.position = { x: 160 + Math.random() * 450, y: 160 + Math.random() * 450 };
  player.health = 100;
  player.xp = Math.floor(player.xp * 0.45);
  player.level = Math.max(1, Math.floor(player.xp / 100) + 1);
};

function simulate(dt: number): void {
  for (const player of players.values()) {
    const move = normalize(player.move);
    const speed = stats[player.playerClass].speed;
    const nextX = { x: player.position.x + move.x * speed * dt, y: player.position.y };
    const nextY = { x: player.position.x, y: player.position.y + move.y * speed * dt };
    if (nextX.x > GAME.playerRadius && nextX.x < GAME.worldWidth - GAME.playerRadius && !walls.some((wall) => hitsWall(nextX, GAME.playerRadius, wall))) player.position.x = nextX.x;
    if (nextY.y > GAME.playerRadius && nextY.y < GAME.worldHeight - GAME.playerRadius && !walls.some((wall) => hitsWall(nextY, GAME.playerRadius, wall))) player.position.y = nextY.y;
    const aim = normalize(player.aim);
    if (aim.x || aim.y) player.angle = Math.atan2(aim.y, aim.x);
    player.cooldown = Math.max(0, player.cooldown - dt);
    if (player.shooting && player.cooldown === 0 && (aim.x || aim.y)) {
      const config = stats[player.playerClass];
      const id = crypto.randomUUID();
      projectiles.set(id, { id, ownerId: player.id, position: { x: player.position.x + aim.x * 35, y: player.position.y + aim.y * 35 }, velocity: { x: aim.x * config.projectileSpeed, y: aim.y * config.projectileSpeed }, damage: config.damage, radius: config.radius, life: 1.7 });
      player.cooldown = config.rate;
    }
  }

  for (const projectile of [...projectiles.values()]) {
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.y += projectile.velocity.y * dt;
    projectile.life -= dt;
    if (projectile.life <= 0 || walls.some((wall) => hitsWall(projectile.position, projectile.radius, wall))) { projectiles.delete(projectile.id); continue; }
    let consumed = false;
    for (const shape of shapes.values()) {
      if (Math.hypot(shape.position.x - projectile.position.x, shape.position.y - projectile.position.y) <= shape.radius + projectile.radius) {
        shape.health -= projectile.damage;
        projectiles.delete(projectile.id);
        consumed = true;
        if (shape.health <= 0) {
          shapes.delete(shape.id);
          const owner = players.get(projectile.ownerId);
          if (owner) { owner.xp += 25; owner.score += 25; owner.level = Math.floor(owner.xp / 100) + 1; }
        }
        break;
      }
    }
    if (consumed) continue;
    for (const target of players.values()) {
      if (target.id === projectile.ownerId) continue;
      if (Math.hypot(target.position.x - projectile.position.x, target.position.y - projectile.position.y) <= GAME.playerRadius + projectile.radius) {
        target.health -= projectile.damage;
        projectiles.delete(projectile.id);
        if (target.health <= 0) {
          const owner = players.get(projectile.ownerId);
          if (owner) { owner.xp += 150; owner.score += 150; owner.level = Math.floor(owner.xp / 100) + 1; }
          respawn(target);
        }
        break;
      }
    }
  }
}

let tick = 0;
setInterval(() => { simulate(1 / GAME.tickRate); tick += 1; }, 1000 / GAME.tickRate);
setInterval(() => {
  const leaderboard = [...players.values()].sort((a, b) => b.score - a.score).slice(0, 8).map(({ name, score }) => ({ name, score }));
  for (const recipient of players.values()) {
    const snapshot: WorldSnapshot = {
      type: 'snapshot', selfId: recipient.id, tick,
      players: [...players.values()].map(({ socket: _s, move: _m, aim: _a, shooting: _sh, lastInput: _li, cooldown: _c, score: _sc, ...publicPlayer }) => publicPlayer),
      projectiles: [...projectiles.values()].map(({ velocity: _v, damage: _d, life: _l, ...publicProjectile }) => publicProjectile),
      shapes: [...shapes.values()], walls, leaderboard
    };
    if (recipient.socket.readyState === WebSocket.OPEN) recipient.socket.send(JSON.stringify(snapshot));
  }
}, 1000 / GAME.snapshotRate);

wss.on('connection', (socket) => {
  let playerId: string | null = null;
  socket.on('message', (raw) => {
    if (raw.byteLength > 2000) return;
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === 'join') {
        const parsed = joinSchema.safeParse(message);
        if (!parsed.success || playerId) return;
        playerId = crypto.randomUUID();
        players.set(playerId, { id: playerId, name: parsed.data.name, playerClass: parsed.data.playerClass, position: { x: 220 + Math.random() * 320, y: 220 + Math.random() * 320 }, angle: 0, health: 100, level: 1, xp: 0, socket, move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, shooting: false, lastInput: -1, cooldown: 0, score: 0 });
      } else if (message.type === 'input' && playerId) {
        const parsed = inputSchema.safeParse(message);
        const player = players.get(playerId);
        if (!parsed.success || !player || parsed.data.sequence <= player.lastInput) return;
        player.lastInput = parsed.data.sequence;
        player.move = normalize(parsed.data.move);
        player.aim = normalize(parsed.data.aim);
        player.shooting = parsed.data.shooting;
      }
    } catch { /* Invalid client messages are ignored. */ }
  });
  socket.on('close', () => { if (playerId) players.delete(playerId); });
});

app.get('/health', (_request, response) => response.json({ ok: true, players: players.size }));
server.listen(PORT, () => console.log(`Project Maze server: http://localhost:${PORT}`));
