import { createServer } from 'node:http';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import {
  GAME,
  PLAYER_CLASS_IDS,
  UPGRADE_IDS,
  sanitizePlayerName,
  type ClientMessage,
  type ServerMessage
} from '@project-maze/shared';
import { MazeGame } from './game.js';
import { tuneProgression } from './progression-tuning.js';
import { hardenSimulation } from './simulation-hardening.js';

function integerEnvironment(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

const PORT = integerEnvironment('PORT', 2567, 1, 65535);
const BOT_COUNT = integerEnvironment('BOT_COUNT', 8, 0, 18);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN?.trim() || '*';
const allowedOrigins = ALLOWED_ORIGIN === '*'
  ? null
  : new Set(ALLOWED_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean));

function originAllowed(origin: string | undefined): boolean {
  if (!allowedOrigins || !origin) return true;
  return allowedOrigins.has(origin);
}

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins ? [...allowedOrigins] : true }));
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const game = tuneProgression(hardenSimulation(new MazeGame(BOT_COUNT)));
const socketPlayerIds = new WeakMap<WebSocket, string>();
const socketAlive = new WeakMap<WebSocket, boolean>();

const joinSchema = z.object({
  type: z.literal('join'),
  name: z.string().transform(sanitizePlayerName).pipe(z.string().min(1).max(18))
}).strict();
const inputSchema = z.object({
  type: z.literal('input'),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  move: z.object({ x: z.number().finite().min(-2).max(2), y: z.number().finite().min(-2).max(2) }),
  aim: z.object({
    x: z.number().finite().min(-GAME.maxAimDistance * 1.25).max(GAME.maxAimDistance * 1.25),
    y: z.number().finite().min(-GAME.maxAimDistance * 1.25).max(GAME.maxAimDistance * 1.25)
  }),
  primary: z.boolean(),
  secondary: z.boolean()
}).strict();
const upgradeSchema = z.object({ type: z.literal('upgrade'), upgrade: z.enum(UPGRADE_IDS) }).strict();
const classSchema = z.object({ type: z.literal('chooseClass'), playerClass: z.enum(PLAYER_CLASS_IDS) }).strict();
const respawnSchema = z.object({ type: z.literal('respawn') }).strict();
const pingSchema = z.object({ type: z.literal('ping'), sentAt: z.number().finite() }).strict();

function send(socket: WebSocket, message: ServerMessage, allowDrop = false): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  if (allowDrop && socket.bufferedAmount > GAME.snapshotBackpressureBytes) return;
  socket.send(JSON.stringify(message));
}

wss.on('connection', (socket, request) => {
  if (!originAllowed(request.headers.origin)) {
    socket.close(1008, 'Origin not allowed');
    return;
  }

  socketAlive.set(socket, true);
  let playerId: string | null = null;
  let messageCount = 0;
  let malformedCount = 0;
  let windowStartedAt = Date.now();

  socket.on('pong', () => socketAlive.set(socket, true));
  socket.on('message', (raw: RawData) => {
    const now = Date.now();
    if (now - windowStartedAt >= 1000) {
      messageCount = 0;
      windowStartedAt = now;
    }
    messageCount += 1;
    const rawSize = Array.isArray(raw) ? raw.reduce((total, part) => total + part.byteLength, 0) : raw.byteLength;
    if (rawSize > 4096) {
      socket.close(1009, 'Message too large');
      return;
    }
    if (messageCount > 110) return;

    try {
      const rawText = Array.isArray(raw) ? Buffer.concat(raw).toString() : raw.toString();
      const message = JSON.parse(rawText) as ClientMessage;
      if (message.type === 'join') {
        const parsed = joinSchema.safeParse(message);
        if (!parsed.success || playerId || game.humanCount >= GAME.maxPlayers) {
          send(socket, { type: 'error', message: game.humanCount >= GAME.maxPlayers ? 'Die Arena ist voll.' : 'Beitritt nicht möglich.' });
          return;
        }
        playerId = game.addPlayer(parsed.data.name);
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
        if (parsed.success) game.applyUpgrade(playerId, parsed.data.upgrade);
        return;
      }
      if (message.type === 'chooseClass' && playerId) {
        const parsed = classSchema.safeParse(message);
        if (parsed.success) game.chooseClass(playerId, parsed.data.playerClass);
        return;
      }
      if (message.type === 'respawn' && playerId) {
        const parsed = respawnSchema.safeParse(message);
        if (parsed.success) game.requestRespawn(playerId, now);
        return;
      }
      if (message.type === 'ping') {
        const parsed = pingSchema.safeParse(message);
        if (parsed.success) send(socket, { type: 'pong', sentAt: parsed.data.sentAt, serverTime: now });
      }
    } catch {
      malformedCount += 1;
      if (malformedCount >= 8) socket.close(1008, 'Too many invalid messages');
    }
  });

  socket.on('close', () => {
    if (playerId) game.removePlayer(playerId);
    socketPlayerIds.delete(socket);
    socketAlive.delete(socket);
  });
  socket.on('error', () => {});
});

const tickTimer = setInterval(() => game.step(1 / GAME.tickRate), 1000 / GAME.tickRate);
const snapshotTimer = setInterval(() => {
  for (const socket of wss.clients) {
    const playerId = socketPlayerIds.get(socket);
    if (playerId) send(socket, game.snapshot(playerId), true);
  }
}, 1000 / GAME.snapshotRate);
const heartbeatTimer = setInterval(() => {
  for (const socket of wss.clients) {
    if (socketAlive.get(socket) === false) {
      socket.terminate();
      continue;
    }
    socketAlive.set(socket, false);
    socket.ping();
  }
}, 30000);
tickTimer.unref();
snapshotTimer.unref();
heartbeatTimer.unref();

app.get('/health', (_request: Request, response: Response) => response.json({
  ok: true,
  humans: game.humanCount,
  ...game.entityCounts,
  mode: 'maze-alpha',
  version: '0.5.0',
  snapshotRate: GAME.snapshotRate
}));
server.listen(PORT, () => console.log(`Project Maze server listening on http://localhost:${PORT}`));
