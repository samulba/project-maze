export const PLAYER_CLASS_IDS = [
  'core',
  'rapid',
  'sniper',
  'drone',
  'rammer',
  'twin',
  'railgun',
  'warden',
  'crusher',
  'storm',
  'lancer',
  'overseer',
  'juggernaut'
] as const;

export type PlayerClass = (typeof PLAYER_CLASS_IDS)[number];

export const UPGRADE_IDS = [
  'maxHealth',
  'regen',
  'moveSpeed',
  'reload',
  'damage',
  'projectileSpeed',
  'penetration',
  'bodyDamage'
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];
export type ShapeKind = 'square' | 'triangle' | 'pentagon';
export type ThemeId = 'midnight' | 'void' | 'classic';

export interface Vector2 { x: number; y: number; }
/** `aim` is a world-space offset. Bullet classes use direction; drones also use magnitude. */
export interface InputMessage { type: 'input'; sequence: number; move: Vector2; aim: Vector2; primary: boolean; secondary: boolean; }
export interface JoinMessage { type: 'join'; name: string; }
export interface UpgradeMessage { type: 'upgrade'; upgrade: UpgradeId; }
export interface ChooseClassMessage { type: 'chooseClass'; playerClass: PlayerClass; }
export interface RespawnMessage { type: 'respawn'; }
export interface PingMessage { type: 'ping'; sentAt: number; }
export type ClientMessage = InputMessage | JoinMessage | UpgradeMessage | ChooseClassMessage | RespawnMessage | PingMessage;

export interface UpgradeLevels {
  maxHealth: number;
  regen: number;
  moveSpeed: number;
  reload: number;
  damage: number;
  projectileSpeed: number;
  penetration: number;
  bodyDamage: number;
}

export interface ClassDefinition {
  id: PlayerClass;
  label: string;
  description: string;
  parent: PlayerClass | null;
  unlockLevel: number;
  branch: 'core' | 'rapid' | 'precision' | 'control' | 'impact';
  maxHealth: number;
  regen: number;
  acceleration: number;
  moveSpeed: number;
  reload: number;
  projectileSpeed: number;
  projectileLife: number;
  damage: number;
  projectileRadius: number;
  penetration: number;
  bodyDamage: number;
  barrelCount: number;
  barrelSpread: number;
  barrelLength: number;
  droneCount: number;
  droneRespawn: number;
}

const classDef = (definition: ClassDefinition): ClassDefinition => definition;

export const CLASS_DEFINITIONS: Record<PlayerClass, ClassDefinition> = {
  core: classDef({
    id: 'core', label: 'Core', description: 'Stabiler Allrounder für Farming und erste Kämpfe.', parent: null,
    unlockLevel: 1, branch: 'core', maxHealth: 110, regen: 2.2, acceleration: 1500, moveSpeed: 270,
    reload: 0.3, projectileSpeed: 820, projectileLife: 1.55, damage: 16, projectileRadius: 7,
    penetration: 20, bodyDamage: 13, barrelCount: 1, barrelSpread: 0, barrelLength: 36,
    droneCount: 0, droneRespawn: 0
  }),
  rapid: classDef({
    id: 'rapid', label: 'Rapid', description: 'Schneller Drucktank mit guter Mobilität.', parent: 'core',
    unlockLevel: 10, branch: 'rapid', maxHealth: 100, regen: 2, acceleration: 1650, moveSpeed: 290,
    reload: 0.19, projectileSpeed: 840, projectileLife: 1.45, damage: 10.5, projectileRadius: 6,
    penetration: 15, bodyDamage: 10, barrelCount: 1, barrelSpread: 0, barrelLength: 34,
    droneCount: 0, droneRespawn: 0
  }),
  sniper: classDef({
    id: 'sniper', label: 'Sniper', description: 'Hoher Burst und Reichweite, aber wenig Fehlertoleranz.', parent: 'core',
    unlockLevel: 10, branch: 'precision', maxHealth: 94, regen: 1.8, acceleration: 1400, moveSpeed: 250,
    reload: 0.68, projectileSpeed: 1200, projectileLife: 2, damage: 38, projectileRadius: 8,
    penetration: 46, bodyDamage: 9, barrelCount: 1, barrelSpread: 0, barrelLength: 52,
    droneCount: 0, droneRespawn: 0
  }),
  drone: classDef({
    id: 'drone', label: 'Controller', description: 'Vier Drohnen für Farming und Raumkontrolle.', parent: 'core',
    unlockLevel: 10, branch: 'control', maxHealth: 112, regen: 2.4, acceleration: 1400, moveSpeed: 258,
    reload: 0.72, projectileSpeed: 0, projectileLife: 0, damage: 8.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 11, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 4, droneRespawn: 1.45
  }),
  rammer: classDef({
    id: 'rammer', label: 'Impact', description: 'Mobiler Nahkämpfer mit hohem Körperschaden.', parent: 'core',
    unlockLevel: 10, branch: 'impact', maxHealth: 140, regen: 2.8, acceleration: 1750, moveSpeed: 300,
    reload: 0.45, projectileSpeed: 700, projectileLife: 1.25, damage: 9, projectileRadius: 7,
    penetration: 12, bodyDamage: 29, barrelCount: 1, barrelSpread: 0, barrelLength: 27,
    droneCount: 0, droneRespawn: 0
  }),
  twin: classDef({
    id: 'twin', label: 'Twin', description: 'Zwei Läufe erzeugen konstanten, kontrollierbaren Druck.', parent: 'rapid',
    unlockLevel: 24, branch: 'rapid', maxHealth: 104, regen: 2.1, acceleration: 1600, moveSpeed: 282,
    reload: 0.25, projectileSpeed: 850, projectileLife: 1.45, damage: 9.5, projectileRadius: 6,
    penetration: 15, bodyDamage: 10, barrelCount: 2, barrelSpread: 0.15, barrelLength: 35,
    droneCount: 0, droneRespawn: 0
  }),
  railgun: classDef({
    id: 'railgun', label: 'Railgun', description: 'Schwerer Präzisionsschuss mit hoher Durchschlagskraft.', parent: 'sniper',
    unlockLevel: 24, branch: 'precision', maxHealth: 92, regen: 1.6, acceleration: 1250, moveSpeed: 235,
    reload: 1, projectileSpeed: 1420, projectileLife: 2.35, damage: 60, projectileRadius: 9,
    penetration: 78, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 62,
    droneCount: 0, droneRespawn: 0
  }),
  warden: classDef({
    id: 'warden', label: 'Warden', description: 'Sechs Drohnen für defensive Kontrolle und Gegenangriffe.', parent: 'drone',
    unlockLevel: 24, branch: 'control', maxHealth: 122, regen: 2.7, acceleration: 1360, moveSpeed: 252,
    reload: 0.62, projectileSpeed: 0, projectileLife: 0, damage: 10.5, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 6, droneRespawn: 1.12
  }),
  crusher: classDef({
    id: 'crusher', label: 'Crusher', description: 'Schwerer Rammer mit hoher Haltbarkeit.', parent: 'rammer',
    unlockLevel: 24, branch: 'impact', maxHealth: 170, regen: 3.3, acceleration: 1550, moveSpeed: 285,
    reload: 0.5, projectileSpeed: 660, projectileLife: 1.15, damage: 8.5, projectileRadius: 8,
    penetration: 13, bodyDamage: 42, barrelCount: 1, barrelSpread: 0, barrelLength: 24,
    droneCount: 0, droneRespawn: 0
  }),
  storm: classDef({
    id: 'storm', label: 'Storm', description: 'Vier Läufe bilden eine breite, aber abwehrbare Kugelwand.', parent: 'twin',
    unlockLevel: 38, branch: 'rapid', maxHealth: 108, regen: 2.2, acceleration: 1550, moveSpeed: 276,
    reload: 0.26, projectileSpeed: 860, projectileLife: 1.35, damage: 6, projectileRadius: 6,
    penetration: 12, bodyDamage: 10, barrelCount: 4, barrelSpread: 0.3, barrelLength: 34,
    droneCount: 0, droneRespawn: 0
  }),
  lancer: classDef({
    id: 'lancer', label: 'Lancer', description: 'Extremer Einzelschuss mit langer Vorbereitung.', parent: 'railgun',
    unlockLevel: 38, branch: 'precision', maxHealth: 86, regen: 1.45, acceleration: 1150, moveSpeed: 222,
    reload: 1.3, projectileSpeed: 1640, projectileLife: 2.65, damage: 82, projectileRadius: 10,
    penetration: 112, bodyDamage: 8, barrelCount: 1, barrelSpread: 0, barrelLength: 70,
    droneCount: 0, droneRespawn: 0
  }),
  overseer: classDef({
    id: 'overseer', label: 'Overseer', description: 'Acht Drohnen für anspruchsvolle Schwarmkontrolle.', parent: 'warden',
    unlockLevel: 38, branch: 'control', maxHealth: 128, regen: 3, acceleration: 1320, moveSpeed: 246,
    reload: 0.58, projectileSpeed: 0, projectileLife: 0, damage: 12, projectileRadius: 0,
    penetration: 0, bodyDamage: 12, barrelCount: 0, barrelSpread: 0, barrelLength: 0,
    droneCount: 8, droneRespawn: 0.88
  }),
  juggernaut: classDef({
    id: 'juggernaut', label: 'Juggernaut', description: 'Extrem widerstandsfähiger Nahkämpfer mit kurzer Reichweite.', parent: 'crusher',
    unlockLevel: 38, branch: 'impact', maxHealth: 215, regen: 4, acceleration: 1350, moveSpeed: 255,
    reload: 0.62, projectileSpeed: 620, projectileLife: 1, damage: 8, projectileRadius: 9,
    penetration: 13, bodyDamage: 60, barrelCount: 1, barrelSpread: 0, barrelLength: 21,
    droneCount: 0, droneRespawn: 0
  })
};

export interface PlayerSnapshot { id:string; name:string; playerClass:PlayerClass; position:Vector2; velocity:Vector2; angle:number; health:number; maxHealth:number; level:number; xp:number; xpForNextLevel:number; availablePoints:number; upgrades:UpgradeLevels; score:number; kills:number; deaths:number; invulnerable:boolean; isBot:boolean; dead:boolean; deathLevel:number; respawnLevel:number; canRespawnAt:number; autoRespawnAt:number; killerName:string; }
export interface ProjectileSnapshot { id:string; ownerId:string; position:Vector2; velocity:Vector2; radius:number; integrity:number; maxIntegrity:number; }
export interface DroneSnapshot { id:string; ownerId:string; position:Vector2; velocity:Vector2; angle:number; health:number; maxHealth:number; }
export interface Wall { id:string; x:number; y:number; width:number; height:number; }
export interface ShapeSnapshot { id:string; kind:ShapeKind; position:Vector2; velocity:Vector2; radius:number; rotation:number; health:number; maxHealth:number; }
export interface KillEvent { id:number; killer:string; victim:string; at:number; }
export interface LeaderboardEntry { id:string; name:string; score:number; level:number; playerClass:PlayerClass; isBot:boolean; }
export interface WorldSnapshot { type:'snapshot'; selfId:string|null; tick:number; serverTime:number; players:PlayerSnapshot[]; projectiles:ProjectileSnapshot[]; drones:DroneSnapshot[]; shapes:ShapeSnapshot[]; walls:Wall[]; leaderboard:LeaderboardEntry[]; killfeed:KillEvent[]; }
export interface WelcomeMessage { type:'welcome'; selfId:string; }
export interface ErrorMessage { type:'error'; message:string; }
export interface PongMessage { type:'pong'; sentAt:number; serverTime:number; }
export type ServerMessage = WorldSnapshot | WelcomeMessage | ErrorMessage | PongMessage;

export const GAME = {
  worldWidth: 6000,
  worldHeight: 4000,
  visibleWorldWidth: 1600,
  visibleWorldHeight: 900,
  viewRadius: 1100,
  maxAimDistance: 650,
  playerRadius: 22,
  tickRate: 40,
  snapshotRate: 30,
  maxUpgradeLevel: 8,
  maxLevel: 45,
  maxPlayers: 40,
  shapeTargetCount: 250,
  respawnDelayMs: 2500,
  autoRespawnDelayMs: 7000,
  respawnInvulnerabilityMs: 2800,
  snapshotBackpressureBytes: 512000,
  projectileStepDistance: 10
} as const;

export const EMPTY_UPGRADES = (): UpgradeLevels => ({ maxHealth:0, regen:0, moveSpeed:0, reload:0, damage:0, projectileSpeed:0, penetration:0, bodyDamage:0 });
export const sanitizePlayerName = (value:string):string => value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
export const xpThresholdForLevel = (level:number):number => { const clamped = Math.max(1, Math.min(GAME.maxLevel, Math.floor(level))); return Math.floor(58 * clamped + 15 * clamped * clamped + 0.55 * clamped * clamped * clamped); };
export const xpAtLevelStart = (level:number):number => level <= 1 ? 0 : xpThresholdForLevel(level - 1);
export const upgradePointsAtLevel = (level:number):number => Math.max(0, Math.min(GAME.maxLevel, Math.floor(level)) - 1);
export const respawnLevelFrom = (level:number):number => Math.max(1, Math.floor(level * 0.5));
export const availableClassChoices = (current:PlayerClass, level:number):PlayerClass[] => PLAYER_CLASS_IDS.filter((id) => { const definition = CLASS_DEFINITIONS[id]; return definition.parent === current && definition.unlockLevel <= level; });
export const isValidClassChoice = (current:PlayerClass, target:PlayerClass, level:number):boolean => availableClassChoices(current, level).includes(target);
export const classAvailableAtLevel = (playerClass:PlayerClass, level:number):PlayerClass => { let current = CLASS_DEFINITIONS[playerClass]; const visited = new Set<PlayerClass>(); while (current.unlockLevel > level && current.parent) { if (visited.has(current.id)) return 'core'; visited.add(current.id); current = CLASS_DEFINITIONS[current.parent]; } return current.id; };
