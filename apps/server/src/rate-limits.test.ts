import type { IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clientIpFrom,
  createRateLimiter,
  messageKindOf,
  normalizeIp,
  rateLimitsEnabled,
  type RateLimiter
} from './rate-limits';

const limiters: RateLimiter[] = [];

const limiter = (options: Parameters<typeof createRateLimiter>[0] = {}): RateLimiter => {
  const created = createRateLimiter({ enabled: true, sweepIntervalMs: null, ...options });
  limiters.push(created);
  return created;
};

const request = (remoteAddress: string, forwardedFor?: string): IncomingMessage => ({
  headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
  socket: { remoteAddress }
} as unknown as IncomingMessage);

const respond = () => {
  const state: { status: number; body: unknown; headers: Record<string, string>; nexts: number } = {
    status: 200, body: null, headers: {}, nexts: 0
  };
  const response = {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    setHeader(key: string, value: string) { state.headers[key] = value; return response; }
  };
  return { response, state, next: () => { state.nexts += 1; } };
};

afterEach(() => {
  for (const created of limiters.splice(0)) created.stop();
  delete process.env.RATE_LIMITS_ENABLED;
});

describe('client ip extraction', () => {
  it('falls back to the socket address without a proxy header', () => {
    expect(clientIpFrom(request('203.0.113.9'), 1)).toBe('203.0.113.9');
  });

  it('trusts only the hop its own proxy appended', () => {
    // Railway hängt die echte IP rechts an.
    expect(clientIpFrom(request('10.0.0.1', '198.51.100.7'), 1)).toBe('198.51.100.7');
  });

  it('ignores forged entries a client puts in front', () => {
    // Der Angreifer schickt selbst einen Header; der Proxy hängt seine Sicht an.
    // Nur der rechte Eintrag stammt vom Proxy – alles links davon ist gelogen.
    const forged = clientIpFrom(request('10.0.0.1', '1.1.1.1, 2.2.2.2, 198.51.100.7'), 1);
    expect(forged).toBe('198.51.100.7');
    expect(forged).not.toBe('1.1.1.1');
  });

  it('counts further to the left with more trusted hops', () => {
    expect(clientIpFrom(request('10.0.0.1', '1.1.1.1, 198.51.100.7, 10.0.0.9'), 2)).toBe('198.51.100.7');
  });

  it('ignores the header entirely when no proxy is trusted', () => {
    expect(clientIpFrom(request('203.0.113.9', '1.1.1.1'), 0)).toBe('203.0.113.9');
  });

  it('normalizes mapped, bracketed and ported addresses', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('203.0.113.9:51234')).toBe('203.0.113.9');
    expect(normalizeIp('[::1]:8080')).toBe('::1');
    expect(normalizeIp('  198.51.100.7  ')).toBe('198.51.100.7');
  });

  it('buckets IPv6 by /64 because a single line owns the whole prefix', () => {
    const a = normalizeIp('2001:db8:85a3:8d3:1319:8a2e:370:7348');
    const b = normalizeIp('2001:db8:85a3:8d3:ffff:ffff:ffff:0001');
    expect(a).toBe('2001:db8:85a3:8d3::/64');
    expect(a).toBe(b);
  });
});

describe('connection limits per ip', () => {
  it('allows the configured number and refuses the next', () => {
    const guard = limiter({ connectionsPerIp: 3 });
    const opened = [0, 1, 2].map(() => guard.accept(request('198.51.100.7')));
    expect(opened.every((decision) => decision.allowed)).toBe(true);

    const refused = guard.accept(request('198.51.100.7'));
    expect(refused.allowed).toBe(false);
    expect(guard.stats().rejectedConnections).toBe(1);
    expect(guard.stats().openConnections).toBe(3);
  });

  it('frees the slot again when a connection closes', () => {
    const guard = limiter({ connectionsPerIp: 1 });
    const first = guard.accept(request('198.51.100.7'));
    expect(guard.accept(request('198.51.100.7')).allowed).toBe(false);

    first.guard.release();
    expect(guard.accept(request('198.51.100.7')).allowed).toBe(true);
    expect(guard.stats().openConnections).toBe(1);
  });

  it('counts a double release only once', () => {
    const guard = limiter({ connectionsPerIp: 2 });
    const decision = guard.accept(request('198.51.100.7'));
    decision.guard.release();
    decision.guard.release();
    expect(guard.stats().openConnections).toBe(0);
  });

  it('keeps separate budgets per address', () => {
    const guard = limiter({ connectionsPerIp: 1 });
    expect(guard.accept(request('10.0.0.1', '198.51.100.7')).allowed).toBe(true);
    expect(guard.accept(request('10.0.0.1', '198.51.100.8')).allowed).toBe(true);
    expect(guard.accept(request('10.0.0.1', '198.51.100.7')).allowed).toBe(false);
  });
});

describe('join limits per ip', () => {
  it('allows the quota per minute and refuses beyond it', () => {
    const guard = limiter({ joinsPerMinute: 3, connectionsPerIp: 50 });
    const connection = guard.accept(request('198.51.100.7')).guard;
    const now = 1_000_000;

    expect(connection.admitJoin(now)).toBe(true);
    expect(connection.admitJoin(now + 10)).toBe(true);
    expect(connection.admitJoin(now + 20)).toBe(true);
    expect(connection.admitJoin(now + 30)).toBe(false);
    expect(guard.stats().rejectedJoins).toBe(1);
  });

  it('forgets attempts once the minute has passed', () => {
    const guard = limiter({ joinsPerMinute: 2, connectionsPerIp: 50 });
    const connection = guard.accept(request('198.51.100.7')).guard;
    const now = 1_000_000;
    connection.admitJoin(now);
    connection.admitJoin(now + 1);
    expect(connection.admitJoin(now + 2)).toBe(false);

    expect(connection.admitJoin(now + 60_001)).toBe(true);
  });

  it('shares the quota across connections of the same address', () => {
    const guard = limiter({ joinsPerMinute: 2, connectionsPerIp: 5 });
    const a = guard.accept(request('198.51.100.7')).guard;
    const b = guard.accept(request('198.51.100.7')).guard;
    const now = 1_000_000;

    expect(a.admitJoin(now)).toBe(true);
    expect(b.admitJoin(now + 1)).toBe(true);
    expect(b.admitJoin(now + 2)).toBe(false);
  });
});

describe('message limits per connection', () => {
  const connectionOf = (guard: RateLimiter) => guard.accept(request('198.51.100.7')).guard;

  it('never throttles an honest client sending inputs at tick rate', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    // Zehn Sekunden mit 40 Hz, so wie der echte Client sendet.
    for (let tick = 0; tick < 400; tick += 1) {
      expect(connection.admit('input', 1_000_000 + tick * 25)).toBe('pass');
    }
    expect(guard.stats().throttledMessages).toBe(0);
  });

  it('survives a bundle of inputs from a stuttering timer', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    let now = 1_000_000;
    for (let second = 0; second < 5; second += 1) {
      // Erst eine Pause, dann kommen zehn Nachrichten auf einen Schlag an.
      now += 1_000;
      for (let index = 0; index < 10; index += 1) {
        expect(connection.admit('input', now)).toBe('pass');
      }
    }
    expect(guard.stats().throttledMessages).toBe(0);
  });

  it('throttles a burst beyond the reserve without dropping the connection', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    const now = 1_000_000;
    const verdicts = Array.from({ length: 60 }, () => connection.admit('input', now));

    // Ohne Zeitfortschritt gibt es nur den angesparten Vorrat.
    expect(verdicts.filter((verdict) => verdict === 'pass')).toHaveLength(25);
    expect(verdicts.filter((verdict) => verdict === 'throttle')).toHaveLength(35);
    expect(verdicts).not.toContain('disconnect');
    expect(guard.stats().throttledMessages).toBe(35);
  });

  it('refills the reserve over time', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    const now = 1_000_000;
    for (let index = 0; index < 60; index += 1) connection.admit('input', now);
    // Eine halbe Sekunde später ist wieder Vorrat da.
    expect(connection.admit('input', now + 500)).toBe('pass');
  });

  it('forgives isolated bursts across a long session', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    let now = 1_000_000;
    let disconnected = false;
    // Eine Stunde lang alle 30 Sekunden ein kurzer Ausreißer.
    for (let round = 0; round < 120; round += 1) {
      for (let index = 0; index < 60; index += 1) {
        if (connection.admit('input', now) === 'disconnect') disconnected = true;
      }
      now += 30_000;
    }
    expect(disconnected).toBe(false);
    expect(guard.stats().throttledMessages).toBeGreaterThan(0);
  });

  it('keeps a much tighter budget for everything that is not input', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    const now = 1_000_000;
    const pings = Array.from({ length: 10 }, () => connection.admit('ping', now));
    expect(pings.filter((verdict) => verdict === 'pass')).toHaveLength(5);
    // Das Input-Budget bleibt davon unberührt.
    expect(connection.admit('input', now)).toBe('pass');
  });

  it('disconnects a client that stays over the limit', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    let verdict: string = 'pass';
    let throttles = 0;
    // Dauerhaft 100 Hz gegen ein 50er-Budget.
    for (let index = 0; index < 2_000 && verdict !== 'disconnect'; index += 1) {
      verdict = connection.admit('input', 1_000_000 + index * 10);
      if (verdict === 'throttle') throttles += 1;
    }
    expect(verdict).toBe('disconnect');
    // Erst drosseln, dann trennen – und zwar erst nach vielen Drosselungen.
    expect(throttles).toBeGreaterThanOrEqual(120);
    expect(guard.stats().disconnectedSockets).toBe(1);
  });

  it('cuts a flood inside a single second immediately', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    const now = 1_000_000;
    let verdict: string = 'pass';
    let sent = 0;
    while (verdict !== 'disconnect' && sent < 1_000) {
      verdict = connection.admit('other', now);
      sent += 1;
    }
    expect(verdict).toBe('disconnect');
    expect(sent).toBeLessThanOrEqual(251);
  });

  it('counts a doomed connection only once', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    const now = 1_000_000;
    for (let index = 0; index < 400; index += 1) connection.admit('other', now);
    expect(guard.stats().disconnectedSockets).toBe(1);
  });

  it('drops a connection after too many unreadable messages', () => {
    const guard = limiter();
    const connection = connectionOf(guard);
    for (let index = 0; index < 7; index += 1) expect(connection.admitMalformed()).toBe(true);
    expect(connection.admitMalformed()).toBe(false);
    expect(guard.stats().disconnectedSockets).toBe(1);
  });

  it('maps message types to their budget bucket', () => {
    expect(messageKindOf({ type: 'input' })).toBe('input');
    expect(messageKindOf({ type: 'chooseClass' })).toBe('chooseClass');
    expect(messageKindOf({ type: 'was-auch-immer' })).toBe('other');
    expect(messageKindOf({ type: 'other' })).toBe('other');
    expect(messageKindOf(null)).toBe('other');
    expect(messageKindOf({})).toBe('other');
  });
});

describe('http limits', () => {
  it('serves a burst and then answers 429 with Retry-After', () => {
    const guard = limiter({ httpRequestsPerMinute: 60 });
    const handler = guard.httpGuard();
    let last = respond();
    for (let index = 0; index < 15; index += 1) {
      last = respond();
      handler(request('198.51.100.7') as never, last.response as never, last.next);
      expect(last.state.nexts).toBe(1);
    }

    const blocked = respond();
    handler(request('198.51.100.7') as never, blocked.response as never, blocked.next);
    expect(blocked.state.nexts).toBe(0);
    expect(blocked.state.status).toBe(429);
    expect(blocked.state.headers['Retry-After']).toBeDefined();
    expect(guard.stats().rejectedRequests).toBe(1);
  });

  it('keeps addresses apart', () => {
    const guard = limiter({ httpRequestsPerMinute: 60 });
    const handler = guard.httpGuard();
    for (let index = 0; index < 15; index += 1) {
      const call = respond();
      handler(request('198.51.100.7') as never, call.response as never, call.next);
    }
    const other = respond();
    handler(request('198.51.100.8') as never, other.response as never, other.next);
    expect(other.state.nexts).toBe(1);
  });

  it('uses the same proxy-aware address as the socket limit', () => {
    const guard = limiter({ httpRequestsPerMinute: 60, trustProxyHops: 1 });
    const handler = guard.httpGuard();
    for (let index = 0; index < 15; index += 1) {
      const call = respond();
      handler(request('10.0.0.1', '1.1.1.1, 198.51.100.7') as never, call.response as never, call.next);
    }
    // Gleiche echte IP, andere gefälschte Vorderglieder – dasselbe Budget.
    const blocked = respond();
    handler(request('10.0.0.1', '9.9.9.9, 198.51.100.7') as never, blocked.response as never, blocked.next);
    expect(blocked.state.status).toBe(429);
  });
});

describe('feature flag', () => {
  it('is on by default and only off for an explicit opt-out', () => {
    delete process.env.RATE_LIMITS_ENABLED;
    expect(rateLimitsEnabled()).toBe(true);
    for (const value of ['false', 'FALSE', '0', 'off', ' Off ']) {
      process.env.RATE_LIMITS_ENABLED = value;
      expect(rateLimitsEnabled()).toBe(false);
    }
    for (const value of ['true', 'yes', 'vielleicht']) {
      process.env.RATE_LIMITS_ENABLED = value;
      expect(rateLimitsEnabled()).toBe(true);
    }
  });

  it('behaves exactly as before when switched off', () => {
    process.env.RATE_LIMITS_ENABLED = 'false';
    const guard = createRateLimiter();
    limiters.push(guard);
    expect(guard.enabled).toBe(false);

    // Beliebig viele Verbindungen, Joins und Nachrichten sind erlaubt.
    for (let index = 0; index < 50; index += 1) {
      const decision = guard.accept(request('198.51.100.7'));
      expect(decision.allowed).toBe(true);
      for (let message = 0; message < 500; message += 1) {
        expect(decision.guard.admit('input')).toBe('pass');
      }
      expect(decision.guard.admitJoin()).toBe(true);
      expect(decision.guard.admitMalformed()).toBe(true);
    }

    const call = respond();
    guard.httpGuard()(request('198.51.100.7') as never, call.response as never, call.next);
    expect(call.state.nexts).toBe(1);
    expect(call.state.status).toBe(200);

    expect(guard.stats()).toEqual({
      enabled: false,
      trackedIps: 0,
      openConnections: 0,
      rejectedConnections: 0,
      rejectedJoins: 0,
      throttledMessages: 0,
      disconnectedSockets: 0,
      rejectedRequests: 0
    });
  });
});

describe('memory safety', () => {
  it('forgets idle addresses but never one with an open connection', () => {
    const guard = limiter({ connectionsPerIp: 5 });
    const kept = guard.accept(request('198.51.100.7'));
    guard.accept(request('198.51.100.8')).guard.release();
    expect(guard.stats().trackedIps).toBe(2);

    // Ein Sweep weit in der Zukunft räumt nur die Verbindungslose weg.
    guard.stop();
    const sweeper = limiter({ connectionsPerIp: 5, sweepIntervalMs: 1 });
    sweeper.accept(request('203.0.113.1')).guard.release();
    expect(sweeper.stats().trackedIps).toBe(1);
    expect(kept.allowed).toBe(true);
  });
});
