import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { GOING_AWAY, createGracefulShutdown, installSignalHandlers } from './shutdown';

interface Harness {
  server: Server;
  wss: WebSocketServer;
  port: number;
}

const harnesses: Harness[] = [];

const listen = async (): Promise<Harness> => {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  const harness: Harness = { server, wss, port: address.port };
  harnesses.push(harness);
  return harness;
};

const connect = (port: number): Promise<WebSocket> => new Promise((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.on('open', () => resolve(socket));
  socket.on('error', reject);
});

const closeEvent = (socket: WebSocket): Promise<{ code: number; reason: string }> =>
  new Promise((resolve) => socket.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    for (const socket of harness.wss.clients) socket.terminate();
    harness.wss.close();
    await new Promise<void>((resolve) => harness.server.close(() => resolve()));
  }
});

describe('graceful shutdown', () => {
  it('closes live sockets with the going-away code so clients reconnect at once', async () => {
    const { server, wss, port } = await listen();
    const shutdown = createGracefulShutdown({ server, wss });
    const [first, second] = await Promise.all([connect(port), connect(port)]);
    const closes = Promise.all([closeEvent(first), closeEvent(second)]);

    await shutdown.shutdown('SIGTERM');

    expect(await closes).toEqual([
      { code: GOING_AWAY, reason: 'Server restart' },
      { code: GOING_AWAY, reason: 'Server restart' }
    ]);
    expect(wss.clients.size).toBe(0);
  });

  it('stops the listener so a redeploy can bind the port again', async () => {
    const { server, wss, port } = await listen();
    const shutdown = createGracefulShutdown({ server, wss });
    await connect(port);

    await shutdown.shutdown('SIGTERM');

    expect(server.listening).toBe(false);
    await expect(connect(port)).rejects.toThrow();
  });

  it('clears the simulation timers exactly once, even on a repeated signal', async () => {
    const { server, wss } = await listen();
    let ticks = 0;
    const timer = setInterval(() => { ticks += 1; }, 1);
    const shutdown = createGracefulShutdown({ server, wss, timers: [timer] });

    await Promise.all([shutdown.shutdown('SIGTERM'), shutdown.shutdown('SIGTERM')]);
    const afterShutdown = ticks;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(shutdown.isShuttingDown()).toBe(true);
    expect(ticks).toBe(afterShutdown);
  });

  it('reports draining state before the sockets are gone', async () => {
    const { server, wss, port } = await listen();
    const shutdown = createGracefulShutdown({ server, wss });
    await connect(port);

    expect(shutdown.isShuttingDown()).toBe(false);
    const pending = shutdown.shutdown('SIGTERM');
    expect(shutdown.isShuttingDown()).toBe(true);
    await pending;
  });

  it('keeps the listener open during the drain window so a proxy sees the 503', async () => {
    const { server, wss, port } = await listen();
    const shutdown = createGracefulShutdown({ server, wss, drainMs: 120 });
    await connect(port);

    const pending = shutdown.shutdown('SIGTERM');
    expect(shutdown.isShuttingDown()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(server.listening).toBe(true);

    await pending;
    expect(server.listening).toBe(false);
  });

  it('terminates sockets that ignore the close handshake', async () => {
    const { server, wss, port } = await listen();
    const shutdown = createGracefulShutdown({ server, wss, graceMs: 40, hardDeadlineMs: 400 });
    const socket = await connect(port);
    // Ein Client, der nie mit einem Close-Frame antwortet, darf den Redeploy
    // nicht blockieren.
    socket.removeAllListeners('close');
    socket.pause();

    await shutdown.shutdown('SIGTERM');

    expect(wss.clients.size).toBe(0);
    expect(server.listening).toBe(false);
  });

  it('exits with 0 on the first signal and forces 1 on the second', async () => {
    const { server, wss } = await listen();
    const shutdown = createGracefulShutdown({ server, wss });
    const handlers = new Map<string, () => void>();
    const codes: number[] = [];
    installSignalHandlers(shutdown, {
      signals: ['SIGTERM'],
      exit: (code) => codes.push(code),
      target: { on: ((signal: string, handler: () => void) => { handlers.set(signal, handler); return process; }) as NodeJS.Process['on'] }
    });

    handlers.get('SIGTERM')?.();
    handlers.get('SIGTERM')?.();
    await shutdown.shutdown();

    expect(codes).toContain(1);
    expect(codes).toContain(0);
  });
});
