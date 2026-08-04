export type PlayerClass = 'shooter' | 'sniper' | 'drone';

export interface Vector2 { x: number; y: number; }

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

export type ClientMessage = InputMessage | JoinMessage;

export interface PlayerSnapshot {
  id: string;
  name: string;
  playerClass: PlayerClass;
  position: Vector2;
  angle: number;
  health: number;
  level: number;
  xp: number;
}

export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  position: Vector2;
  radius: number;
}

export interface Wall { x: number; y: number; width: number; height: number; }

export interface ShapeSnapshot {
  id: string;
  position: Vector2;
  radius: number;
  health: number;
}

export interface WorldSnapshot {
  type: 'snapshot';
  selfId: string | null;
  tick: number;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  shapes: ShapeSnapshot[];
  walls: Wall[];
  leaderboard: Array<{ name: string; score: number }>;
}

export const GAME = {
  worldWidth: 3200,
  worldHeight: 2200,
  playerRadius: 22,
  tickRate: 30,
  snapshotRate: 15
} as const;
