export type PlayerClass = 'shooter' | 'sniper' | 'drone';
export type UpgradeId = 'maxHealth' | 'regen' | 'moveSpeed' | 'reload' | 'damage' | 'projectileSpeed';
export type ShapeKind = 'square' | 'triangle' | 'pentagon';
export type ThemeId = 'midnight' | 'void' | 'classic';

export interface Vector2 {
  x: number;
  y: number;
}

export interface InputMessage {
  type: 'input';
  sequence: number;
  move: Vector2;
  aim: Vector2;
  shooting: boolean;
}

export interface JoinMessage {
  type: 'join';
  name: string;
  playerClass: PlayerClass;
}

export interface UpgradeMessage {
  type: 'upgrade';
  upgrade: UpgradeId;
}

export interface PingMessage {
  type: 'ping';
  sentAt: number;
}

export type ClientMessage = InputMessage | JoinMessage | UpgradeMessage | PingMessage;

export interface UpgradeLevels {
  maxHealth: number;
  regen: number;
  moveSpeed: number;
  reload: number;
  damage: number;
  projectileSpeed: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  playerClass: PlayerClass;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpForNextLevel: number;
  availablePoints: number;
  upgrades: UpgradeLevels;
  score: number;
  kills: number;
  deaths: number;
  invulnerable: boolean;
  isBot: boolean;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  position: Vector2;
  radius: number;
  kind: 'bullet' | 'drone-shot';
}

export interface DroneSnapshot {
  id: string;
  ownerId: string;
  position: Vector2;
  angle: number;
  health: number;
}

export interface Wall {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeSnapshot {
  id: string;
  kind: ShapeKind;
  position: Vector2;
  radius: number;
  health: number;
  maxHealth: number;
}

export interface KillEvent {
  id: number;
  killer: string;
  victim: string;
  at: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  level: number;
  isBot: boolean;
}

export interface WorldSnapshot {
  type: 'snapshot';
  selfId: string | null;
  tick: number;
  serverTime: number;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  drones: DroneSnapshot[];
  shapes: ShapeSnapshot[];
  walls: Wall[];
  leaderboard: LeaderboardEntry[];
  killfeed: KillEvent[];
}

export interface WelcomeMessage {
  type: 'welcome';
  selfId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface PongMessage {
  type: 'pong';
  sentAt: number;
  serverTime: number;
}

export type ServerMessage = WorldSnapshot | WelcomeMessage | ErrorMessage | PongMessage;

export const xpThresholdForLevel = (level: number): number => 70 * level + 18 * level * level;

export const UPGRADE_IDS: UpgradeId[] = [
  'maxHealth',
  'regen',
  'moveSpeed',
  'reload',
  'damage',
  'projectileSpeed'
];

export const GAME = {
  worldWidth: 3600,
  worldHeight: 2400,
  playerRadius: 22,
  tickRate: 30,
  snapshotRate: 15,
  maxUpgradeLevel: 8,
  maxPlayers: 40,
  shapeTargetCount: 110,
  respawnInvulnerabilityMs: 2200
} as const;
