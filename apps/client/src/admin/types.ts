/**
 * Die Antwortformen der Admin-Routen (`apps/server/src/admin.ts`).
 *
 * Bewusst hier noch einmal geschrieben statt aus dem Server importiert: Client
 * und Server sind getrennte Pakete, und eine gemeinsame Typdatei in `shared`
 * wäre für zwei Routen, die nur ein Mensch aufruft, mehr Bindung als Nutzen.
 * Die Felder sind alle optional gedacht – veraltete Server antworten knapper.
 */

export interface AdminSession {
  authEnabled: boolean;
  allowlistSize: number;
  userId: string | null;
  displayName: string | null;
  isAdmin: boolean;
}

export interface Summary {
  players: number;
  newPlayers: number;
  sessions: number;
  accounts: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  avgSessionSeconds: number;
}

export interface DailyRow {
  day: string;
  sessions: number;
  players: number;
  newPlayers: number;
  accounts: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  bestLevel: number;
}

export interface ClassUsage {
  playerClass: string;
  label: string;
  branch: string;
  runs: number;
  share: number;
  avgLevel: number;
  avgScore: number;
  avgSeconds: number;
  kills: number;
  bestScore: number;
  bestLevel: number;
}

export interface TopRun {
  rank: number;
  playerName: string;
  score: number;
  level: number;
  playerClass: string;
  kills: number;
  durationSeconds: number;
  achievedAt: string;
}

export interface LiveState {
  humans?: number;
  bots?: number;
  players?: number;
  projectiles?: number;
  drones?: number;
  shapes?: number;
  draining?: boolean;
  uptimeSeconds?: number;
  commit?: string;
  deploymentId?: string;
  snapshotRate?: number;
  debugTools?: boolean;
  features?: Record<string, unknown>;
  /** Feldnamen aus `telemetryTickHealth` (apps/server/src/telemetry.ts). */
  tick?: {
    averageMs?: number;
    p95Ms?: number;
    maxMs?: number;
    budgetMs?: number;
    busyRatio?: number;
    overrunsTotal?: number;
    ticksTotal?: number;
  };
  persistence?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
  auth?: { enabled?: boolean; mode?: string; verified?: number; rejected?: number };
  clientMetrics?: Record<string, unknown>;
  abuse?: Record<string, unknown>;
}

export interface Overview {
  live: LiveState;
  persistence: Record<string, unknown>;
  sessions: Record<string, unknown>;
  days: number;
  database: boolean;
  hint?: string;
  daily: DailyRow[];
  today: Summary;
  window: Summary;
  classes: ClassUsage[];
  unusedClasses: string[];
  top: TopRun[];
}

export interface DeviceRow {
  deviceId: string;
  firstSeen: string;
  lastSeen: string;
  sessions: number;
  runs: number;
  kills: number;
  totalSeconds: number;
  bestScore: number;
  bestLevel: number;
  lastUserId: string | null;
  lastName: string | null;
}

export interface PlayersResponse {
  database: boolean;
  players: DeviceRow[];
  total: number;
}
