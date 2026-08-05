import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';

/**
 * Rate-Limits und Missbrauchsschutz.
 *
 * Das Spiel ist öffentlich erreichbar, also gilt jede Eingabe von außen als
 * feindlich, bis das Gegenteil bewiesen ist. Geschützt werden drei Ebenen:
 *
 * 1. **Verbindungen je IP** – gleichzeitige Sockets und Join-Versuche pro
 *    Minute. Hält einen einzelnen Rechner davon ab, die Arena zu belegen.
 * 2. **Nachrichten je Verbindung** – jede Nachrichtenart hat ihr eigenes
 *    Budget. Wer darüber liegt, wird erst gedrosselt (die Nachricht fällt
 *    still weg) und erst bei anhaltendem Missbrauch getrennt.
 * 3. **HTTP-Abfragen je IP** – `/leaderboard` und `/profile` sind öffentlich
 *    und gehen im Zweifel an die Datenbank.
 *
 * Alles hängt an `RATE_LIMITS_ENABLED` (Standard: an). Steht der Schalter auf
 * `false`, gibt dieses Modul einen Wächter zurück, der nichts tut und nichts
 * speichert – der Server verhält sich dann exakt wie ohne das Modul.
 *
 * Ohne zusätzliche Abhängigkeit: feste Sekundenfenster für Nachrichten, ein
 * Token-Bucket für HTTP, eine Zeitstempelliste für Joins. Mehr braucht es für
 * einen einzelnen Prozess nicht.
 */

export type MessageKind =
  | 'join'
  | 'input'
  | 'ping'
  | 'upgrade'
  | 'chooseClass'
  | 'respawn'
  | 'equipLoadout'
  | 'activateModule'
  | 'debug'
  | 'other';

export type MessageVerdict = 'pass' | 'throttle' | 'disconnect';

/**
 * Nachrichten je Sekunde und Art im Dauerbetrieb. `input` liegt bewusst über
 * der Tickrate von 40 – ein ehrlicher Client soll nie ins Limit laufen. Alles
 * andere ist Bedienung durch einen Menschen und darf weit darunter liegen.
 *
 * Gemessen wird mit einem Token-Bucket, nicht mit festen Sekundenfenstern:
 * Timer und Netzwerk bündeln Nachrichten, und an einer festen Fenstergrenze
 * hätte schon normales Ruckeln ehrliche Eingaben verworfen (nachgemessen: 69
 * gedrosselte Nachrichten in einem sauberen 12-Client-Lasttest).
 */
const MESSAGE_BUDGET: Record<MessageKind, number> = {
  input: 50,
  ping: 5,
  join: 3,
  // Nach einem Levelaufstieg können mehrere Punkte am Stück fallen.
  upgrade: 12,
  chooseClass: 6,
  respawn: 5,
  equipLoadout: 6,
  activateModule: 12,
  debug: 20,
  other: 5
};

/**
 * Vorrat, den eine Verbindung ansparen darf – eine halbe Sekunde Nachschub,
 * mindestens fünf Nachrichten. Damit übersteht sie ein Bündel, ohne dass sich
 * das Dauerlimit verschiebt.
 */
const burstFor = (perSecond: number): number => Math.max(5, Math.ceil(perSecond / 2));

/** Ab hier ist es kein Jitter mehr, sondern eine Flut – sofort trennen. */
const HARD_MESSAGES_PER_SECOND = 250;
/** So viele gedrosselte Nachrichten toleriert eine Verbindung am Stück. */
const MAX_THROTTLED_PER_CONNECTION = 120;
/**
 * Nach so langer sauberer Zeit ist die Weste wieder weiß. Ohne dieses
 * Vergessen würden sich über eine lange Sitzung auch vereinzelte Drosselungen
 * zu einer Trennung summieren – getrennt wird aber nur, wer *anhaltend* über
 * dem Limit sendet.
 */
const THROTTLE_FORGIVENESS_MS = 10_000;
/** Unlesbare Nachrichten, bis getrennt wird (Verhalten wie bisher). */
const MAX_MALFORMED = 8;
/** Obergrenze der beobachteten IPs, damit rotierende Quellen kein Leck sind. */
const MAX_TRACKED_IPS = 20_000;
/** Aufräumintervall für IPs ohne Verbindung und ohne jüngste Aktivität. */
const SWEEP_INTERVAL_MS = 60_000;
const IDLE_EVICTION_MS = 10 * 60_000;

export interface RateLimitOptions {
  enabled?: boolean;
  connectionsPerIp?: number;
  joinsPerMinute?: number;
  httpRequestsPerMinute?: number;
  /** Wie viele Proxy-Hops vor uns stehen. Siehe `clientIpFrom`. */
  trustProxyHops?: number;
  /** Nur für Tests: verhindert den Aufräum-Timer. */
  sweepIntervalMs?: number | null;
}

export interface AbuseStats {
  enabled: boolean;
  trackedIps: number;
  openConnections: number;
  rejectedConnections: number;
  rejectedJoins: number;
  throttledMessages: number;
  disconnectedSockets: number;
  rejectedRequests: number;
}

export interface ConnectionGuard {
  readonly ip: string;
  /** Urteil über eine eingehende Nachricht. */
  admit(kind: MessageKind, now?: number): MessageVerdict;
  /** Join-Versuch dieser IP – zählt auch, wenn er danach scheitert. */
  admitJoin(now?: number): boolean;
  /** Unlesbare Nachricht; `false` heißt: Verbindung beenden. */
  admitMalformed(): boolean;
  /** Beim Schließen aufrufen, genau einmal. */
  release(): void;
}

export interface ConnectionDecision {
  allowed: boolean;
  reason: string | null;
  guard: ConnectionGuard;
}

export interface RateLimiter {
  readonly enabled: boolean;
  /** Entscheidet über eine neue WebSocket-Verbindung. */
  accept(request: IncomingMessage, now?: number): ConnectionDecision;
  /**
   * Express-Wächter für öffentliche Routen. `cost` zieht mehrere Token je
   * Anfrage – Schreibzugriffe sind teurer als Lesen und laufen damit früher
   * ins Limit, ohne dass ein zweiter Zähler nötig wäre.
   */
  httpGuard(options?: { cost?: number }): (request: Request, response: Response, next: () => void) => void;
  stats(): AbuseStats;
  /** Stoppt den Aufräum-Timer – für Shutdown und Tests. */
  stop(): void;
}

const flagEnabled = (): boolean =>
  // Opt-out: Auch 'FALSE', '0' und 'off' müssen abschalten. Ein Tippfehler darf
  // nicht kommentarlos in die riskante Richtung „aus" fallen – deshalb ist
  // alles außer diesen drei Werten „an".
  !['false', '0', 'off'].includes((process.env.RATE_LIMITS_ENABLED ?? '').trim().toLowerCase());

export const rateLimitsEnabled = flagEnabled;

const integerEnvironment = (name: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
};

/**
 * Ermittelt die Client-IP.
 *
 * `x-forwarded-for` ist eine Liste, an die **jeder** Proxy anhängt, was er
 * gesehen hat. Ein Angreifer kann den Header selbst mitschicken; seine Werte
 * landen dann **links**. Vertrauenswürdig ist deshalb nur, was der eigene
 * Proxy angehängt hat – der Eintrag `trustProxyHops` Stellen von rechts.
 *
 * Bei Railway steht genau ein Hop davor (Standard 1): Der letzte Eintrag ist
 * die IP, die Railways Edge gesehen hat. Den linken Eintrag zu nehmen wäre der
 * klassische Fehler – dann bestimmt der Angreifer seinen eigenen Limit-Bucket.
 *
 * `trustProxyHops = 0` heißt „direkt erreichbar": dann zählt ausschließlich die
 * TCP-Gegenstelle, der Header wird ignoriert.
 */
export function clientIpFrom(request: IncomingMessage, trustProxyHops = 1): string {
  const direct = normalizeIp(request.socket?.remoteAddress ?? '');
  if (trustProxyHops <= 0) return direct;

  const header = request.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header ?? '';
  const hops = raw.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (hops.length === 0) return direct;

  // Von rechts zählen: Der eigene Proxy hat zuletzt angehängt.
  const index = Math.max(0, hops.length - trustProxyHops);
  return normalizeIp(hops[index] ?? '') || direct;
}

/**
 * Vereinheitlicht Adressen: IPv4-gemappte IPv6-Adressen werden ausgepackt,
 * Ports entfernt. IPv6 wird auf das /64-Präfix gekürzt – ein Anschluss bekommt
 * üblicherweise ein ganzes /64, sonst wäre das Limit mit einer neuen Adresse je
 * Verbindung wertlos.
 */
export function normalizeIp(value: string): string {
  let address = value.trim().toLowerCase();
  if (!address) return '';
  if (address.startsWith('[')) address = address.slice(1, address.indexOf(']') > 0 ? address.indexOf(']') : undefined);
  if (address.startsWith('::ffff:')) address = address.slice(7);
  // "1.2.3.4:5678" – nur bei IPv4 ist ein Doppelpunkt ein Port.
  const colon = address.indexOf(':');
  if (colon > 0 && address.indexOf('.') > 0 && address.indexOf(':', colon + 1) === -1) address = address.slice(0, colon);
  if (!address.includes(':')) return address;

  const groups = address.split(':');
  if (groups.length <= 4 || address.includes('::')) return address;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

interface IpState {
  connections: number;
  joins: number[];
  httpTokens: number;
  httpRefilledAt: number;
  lastSeenAt: number;
}

interface Counters {
  rejectedConnections: number;
  rejectedJoins: number;
  throttledMessages: number;
  disconnectedSockets: number;
  rejectedRequests: number;
}

const passThroughGuard = (ip: string): ConnectionGuard => ({
  ip,
  admit: () => 'pass',
  admitJoin: () => true,
  admitMalformed: () => true,
  release: () => {}
});

/** Wächter ohne Zustand – exakt das Verhalten vor diesem Modul. */
function createDisabledLimiter(): RateLimiter {
  return {
    enabled: false,
    accept: (request: IncomingMessage): ConnectionDecision => ({
      allowed: true,
      reason: null,
      guard: passThroughGuard(clientIpFrom(request, 0))
    }),
    httpGuard: () => (_request, _response, next): void => next(),
    stats: (): AbuseStats => ({
      enabled: false,
      trackedIps: 0,
      openConnections: 0,
      rejectedConnections: 0,
      rejectedJoins: 0,
      throttledMessages: 0,
      disconnectedSockets: 0,
      rejectedRequests: 0
    }),
    stop: () => {}
  };
}

export function createRateLimiter(options: RateLimitOptions = {}): RateLimiter {
  const enabled = options.enabled ?? flagEnabled();
  if (!enabled) return createDisabledLimiter();

  const connectionsPerIp = options.connectionsPerIp
    ?? integerEnvironment('RATE_LIMIT_CONNECTIONS_PER_IP', 5, 1, 200);
  const joinsPerMinute = options.joinsPerMinute
    ?? integerEnvironment('RATE_LIMIT_JOINS_PER_MINUTE', 20, 1, 1_000);
  const httpPerMinute = options.httpRequestsPerMinute
    ?? integerEnvironment('RATE_LIMIT_HTTP_PER_MINUTE', 60, 1, 10_000);
  const trustProxyHops = options.trustProxyHops
    ?? integerEnvironment('TRUST_PROXY_HOPS', 1, 0, 8);
  // Burst: eine Seite darf Bestenliste und Profil zusammen laden, ohne zu warten.
  const httpBurst = Math.max(5, Math.min(httpPerMinute, 15));

  const ips = new Map<string, IpState>();
  const counters: Counters = {
    rejectedConnections: 0,
    rejectedJoins: 0,
    throttledMessages: 0,
    disconnectedSockets: 0,
    rejectedRequests: 0
  };
  let openConnections = 0;

  const stateFor = (ip: string, now: number): IpState => {
    const existing = ips.get(ip);
    if (existing) {
      existing.lastSeenAt = now;
      return existing;
    }
    // Notbremse gegen IP-Rotation: Die ältesten inaktiven Einträge fliegen
    // raus, bevor die Map unbegrenzt wächst.
    if (ips.size >= MAX_TRACKED_IPS) evictIdle(now);
    const created: IpState = {
      connections: 0,
      joins: [],
      httpTokens: httpBurst,
      httpRefilledAt: now,
      lastSeenAt: now
    };
    ips.set(ip, created);
    return created;
  };

  const evictIdle = (now: number): void => {
    for (const [ip, state] of ips) {
      if (state.connections > 0 || now - state.lastSeenAt < IDLE_EVICTION_MS) continue;
      ips.delete(ip);
    }
    if (ips.size < MAX_TRACKED_IPS) return;
    // Immer noch voll: Ältestes zuerst, Verbindungen bleiben unangetastet.
    for (const [ip, state] of ips) {
      if (state.connections > 0) continue;
      ips.delete(ip);
      if (ips.size < MAX_TRACKED_IPS) break;
    }
  };

  const createGuard = (ip: string, state: IpState): ConnectionGuard => {
    let windowStartedAt = 0;
    const buckets = new Map<MessageKind, { tokens: number; refilledAt: number }>();
    let inWindow = 0;
    let throttled = 0;
    let lastThrottleAt = 0;
    let malformed = 0;
    let released = false;
    // Nach dem Trennungsurteil trudeln noch Nachrichten ein, bis der
    // Close-Handshake durch ist. Die zählen nicht noch einmal.
    let doomed = false;

    const doom = (): MessageVerdict => {
      if (!doomed) {
        doomed = true;
        counters.disconnectedSockets += 1;
      }
      return 'disconnect';
    };

    return {
      ip,
      admit(kind: MessageKind, now = Date.now()): MessageVerdict {
        if (doomed) return 'disconnect';
        // Grobes Sekundenfenster nur für die Flut-Notbremse.
        if (now - windowStartedAt >= 1_000) {
          windowStartedAt = now;
          inWindow = 0;
        }
        inWindow += 1;
        if (inWindow > HARD_MESSAGES_PER_SECOND) return doom();

        const perSecond = MESSAGE_BUDGET[kind];
        const burst = burstFor(perSecond);
        const bucket = buckets.get(kind) ?? { tokens: burst, refilledAt: now };
        bucket.tokens = Math.min(burst, bucket.tokens + Math.max(0, now - bucket.refilledAt) / 1_000 * perSecond);
        bucket.refilledAt = now;
        buckets.set(kind, bucket);
        if (bucket.tokens >= 1) {
          bucket.tokens -= 1;
          return 'pass';
        }

        // Erst drosseln: Die Nachricht fällt weg, die Verbindung bleibt.
        counters.throttledMessages += 1;
        if (now - lastThrottleAt > THROTTLE_FORGIVENESS_MS) throttled = 0;
        lastThrottleAt = now;
        throttled += 1;
        if (throttled <= MAX_THROTTLED_PER_CONNECTION) return 'throttle';
        return doom();
      },
      admitJoin(now = Date.now()): boolean {
        const cutoff = now - 60_000;
        while (state.joins.length > 0 && (state.joins[0] ?? 0) <= cutoff) state.joins.shift();
        if (state.joins.length >= joinsPerMinute) {
          counters.rejectedJoins += 1;
          return false;
        }
        state.joins.push(now);
        state.lastSeenAt = now;
        return true;
      },
      admitMalformed(): boolean {
        if (doomed) return false;
        malformed += 1;
        if (malformed < MAX_MALFORMED) return true;
        doom();
        return false;
      },
      release(): void {
        if (released) return;
        released = true;
        openConnections = Math.max(0, openConnections - 1);
        state.connections = Math.max(0, state.connections - 1);
        state.lastSeenAt = Date.now();
      }
    };
  };

  const sweepIntervalMs = options.sweepIntervalMs === undefined ? SWEEP_INTERVAL_MS : options.sweepIntervalMs;
  let timer: NodeJS.Timeout | null = null;
  if (sweepIntervalMs !== null) {
    timer = setInterval(() => evictIdle(Date.now()), sweepIntervalMs);
    timer.unref();
  }

  return {
    enabled: true,
    accept(request: IncomingMessage, now = Date.now()): ConnectionDecision {
      const ip = clientIpFrom(request, trustProxyHops) || 'unknown';
      const state = stateFor(ip, now);
      if (state.connections >= connectionsPerIp) {
        counters.rejectedConnections += 1;
        return { allowed: false, reason: 'Zu viele Verbindungen', guard: passThroughGuard(ip) };
      }
      state.connections += 1;
      openConnections += 1;
      return { allowed: true, reason: null, guard: createGuard(ip, state) };
    },
    httpGuard(options: { cost?: number } = {}) {
      const cost = Math.max(1, Math.min(httpBurst, Math.round(options.cost ?? 1)));
      return (request: Request, response: Response, next: () => void): void => {
        const now = Date.now();
        const ip = clientIpFrom(request as unknown as IncomingMessage, trustProxyHops) || 'unknown';
        const state = stateFor(ip, now);
        // Token-Bucket: gleichmäßiges Nachfüllen, kurze Spitzen erlaubt.
        const refill = ((now - state.httpRefilledAt) / 60_000) * httpPerMinute;
        if (refill > 0) {
          state.httpTokens = Math.min(httpBurst, state.httpTokens + refill);
          state.httpRefilledAt = now;
        }
        if (state.httpTokens < cost) {
          counters.rejectedRequests += 1;
          response.setHeader('Retry-After', String(Math.ceil((60 * cost) / httpPerMinute)));
          response.status(429).json({ error: 'Zu viele Anfragen. Bitte kurz warten.' });
          return;
        }
        state.httpTokens -= cost;
        next();
      };
    },
    stats: (): AbuseStats => ({
      enabled: true,
      trackedIps: ips.size,
      openConnections,
      ...counters
    }),
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

/** Ordnet eine eingehende Nachricht einer bekannten Art zu. */
export function messageKindOf(value: unknown): MessageKind {
  const type = (value as { type?: unknown } | null)?.type;
  if (typeof type !== 'string') return 'other';
  return type in MESSAGE_BUDGET && type !== 'other' ? type as MessageKind : 'other';
}
