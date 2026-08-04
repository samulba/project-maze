import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { z } from 'zod';
import { GAME, type ClientMessage, type PlayerClass, type ServerMessage, type UpgradeId } from '@project-maze/shared';
import { MazeGame } from './game.js';

const PORT = Number(process.env.PORT ?? 2567);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const game = new MazeGame(Number(process.env.BOT_COUNT ?? 7));
const socketPlayerIds = new WeakMap<WebSocket, string>();

const joinSchema = z.object({
  type: z.literal('join'),
  name: z.string().trim().min(1).max(18).transform((value: string) => value.replace(/[<>]/g, '')),
  playerClass: z.enum(['shooter', 'sniper', 'drone'])
});
const inputSchema = z.object({
  type: z.literal('input'),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  move: z.object({ x: z.number().finite().min(-2).max(2), y: z.number().finite().min(-2).max(2) }),
  aim: z.object({ x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000) }),
  shooting: z.boolean()
});
const upgradeSchema = z.object({ type: z.literal('upgrade'), upgrade: z.enum(['maxHealth', 'regen', 'moveSpeed', 'reload', 'damage', 'projectileSpeed']) });
const pingSchema = z.object({ type: z.literal('ping'), sentAt: z.number().finite() });

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

wss.on('connection', (socket) => {
  let playerId: string | null = null;
  let messageCount = 0;
  let windowStartedAt = Date.now();

  socket.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStartedAt >= 1000) {
      messageCount = 0;
      windowStartedAt = now;
    }
    messageCount += 1;
    if (messageCount > 90 || raw.byteLength > 4096) return;

    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === 'join') {
        const parsed = joinSchema.safeParse(message);
        if (!parsed.success || playerId || game.humanCount >= GAME.maxPlayers) {
          send(socket, { type: 'error', message: game.humanCount >= GAME.maxPlayers ? 'Die Arena ist voll.' : 'Beitritt nicht möglich.' });
          return;
        }
        playerId = game.addPlayer(parsed.data.name, parsed.data.playerClass as PlayerClass);
        socketPlayerIds.set(socket, playerId);
        send(socket, { type: 'welcome', selfId: playerId });
        return;
      }
      if (message.type === 'input' && playerId) {
        const parsed = inputSchema.safeParse(message);
        if (parsed.success) game.applyInput(playerId, parsed.data);
        return;
      }
      if (message.type === 'upgrade' && playerId) {
        const parsed = upgradeSchema.safeParse(message);
        if (parsed.success) game.applyUpgrade(playerId, parsed.data.upgrade as UpgradeId);
        return;
      }
      if (message.type === 'ping') {
        const parsed = pingSchema.safeParse(message);
        if (parsed.success) send(socket, { type: 'pong', sentAt: parsed.data.sentAt, serverTime: now });
      }
    } catch {
      // Malformed client messages are ignored intentionally.
    }
  });

  socket.on('close', () => {
    if (playerId) game.removePlayer(playerId);
    socketPlayerIds.delete(socket);
  });
});

setInterval(() => game.step(1 / GAME.tickRate), 1000 / GAME.tickRate);
setInterval(() => {
  for (const socket of wss.clients) send(socket, game.snapshot(socketPlayerIds.get(socket) ?? null));
}, 1000 / GAME.snapshotRate);

app.get('/health', (_request, response) => response.json({ ok: true, players: game.humanCount, entities: game.playerCount, mode: 'maze-alpha', version: '0.2.0' }));
server.listen(PORT, () => console.log(`Project Maze server listening on http://localhost:${PORT}`));
