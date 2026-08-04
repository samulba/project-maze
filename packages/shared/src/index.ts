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
export interface UpgradeLevels { maxHealth:number; regen:number; moveSpeed:number; reload:number; damage:number; projectileSpeed:number; penetration:number; bodyDamage:number; }
export interface ClassDefinition { id:PlayerClass; label:string; description:string; parent:PlayerClass|null; unlockLevel:number; branch:'core'|'rapid'|'precision'|'control'|'impact'; maxHealth:number; regen:number; acceleration:number; moveSpeed:number; reload:number; projectileSpeed:number; projectileLife:number; damage:number; projectileRadius:number; penetration:number; bodyDamage:number; barrelCount:number; barrelSpread:number; barrelLength:number; droneCount:number; droneRespawn:number; }
const classDef=(definition:ClassDefinition):ClassDefinition=>definition;
export const CLASS_DEFINITIONS:Record<PlayerClass,ClassDefinition>={
core:classDef({id:'core',label:'Core',description:'Ausgewogener Starttank.',parent:null,unlockLevel:1,branch:'core',maxHealth:100,regen:1.8,acceleration:1220,moveSpeed:255,reload:.32,projectileSpeed:790,projectileLife:1.65,damage:17,projectileRadius:7,penetration:20,bodyDamage:12,barrelCount:1,barrelSpread:0,barrelLength:36,droneCount:0,droneRespawn:0}),
rapid:classDef({id:'rapid',label:'Rapid',description:'Hohe Feuerrate und viel Bewegung.',parent:'core',unlockLevel:12,branch:'rapid',maxHealth:96,regen:1.7,acceleration:1320,moveSpeed:270,reload:.22,projectileSpeed:790,projectileLife:1.55,damage:13,projectileRadius:6,penetration:16,bodyDamage:10,barrelCount:1,barrelSpread:0,barrelLength:34,droneCount:0,droneRespawn:0}),
sniper:classDef({id:'sniper',label:'Sniper',description:'Reichweite, Präzision und hoher Einzelschaden.',parent:'core',unlockLevel:12,branch:'precision',maxHealth:88,regen:1.45,acceleration:1120,moveSpeed:235,reload:.72,projectileSpeed:1190,projectileLife:2.15,damage:43,projectileRadius:8,penetration:50,bodyDamage:9,barrelCount:1,barrelSpread:0,barrelLength:52,droneCount:0,droneRespawn:0}),
drone:classDef({id:'drone',label:'Controller',description:'Steuert eine kleine Drohnengruppe.',parent:'core',unlockLevel:12,branch:'control',maxHealth:108,regen:2,acceleration:1160,moveSpeed:242,reload:.48,projectileSpeed:0,projectileLife:0,damage:15,projectileRadius:0,penetration:0,bodyDamage:11,barrelCount:0,barrelSpread:0,barrelLength:0,droneCount:4,droneRespawn:1.25}),
rammer:classDef({id:'rammer',label:'Impact',description:'Schneller Nahkämpfer mit starkem Körper.',parent:'core',unlockLevel:12,branch:'impact',maxHealth:128,regen:2.2,acceleration:1450,moveSpeed:285,reload:.42,projectileSpeed:690,projectileLife:1.35,damage:11,projectileRadius:7,penetration:13,bodyDamage:31,barrelCount:1,barrelSpread:0,barrelLength:28,droneCount:0,droneRespawn:0}),
twin:classDef({id:'twin',label:'Twin',description:'Zwei versetzte Läufe halten konstant Druck.',parent:'rapid',unlockLevel:25,branch:'rapid',maxHealth:98,regen:1.8,acceleration:1320,moveSpeed:266,reload:.2,projectileSpeed:805,projectileLife:1.55,damage:12,projectileRadius:6,penetration:16,bodyDamage:10,barrelCount:2,barrelSpread:.16,barrelLength:35,droneCount:0,droneRespawn:0}),
railgun:classDef({id:'railgun',label:'Railgun',description:'Langsamer Schuss, enorme Durchschlagskraft.',parent:'sniper',unlockLevel:25,branch:'precision',maxHealth:86,regen:1.35,acceleration:1050,moveSpeed:222,reload:1.08,projectileSpeed:1430,projectileLife:2.5,damage:68,projectileRadius:9,penetration:92,bodyDamage:8,barrelCount:1,barrelSpread:0,barrelLength:62,droneCount:0,droneRespawn:0}),
warden:classDef({id:'warden',label:'Warden',description:'Mehr Drohnen und bessere defensive Kontrolle.',parent:'drone',unlockLevel:25,branch:'control',maxHealth:116,regen:2.3,acceleration:1170,moveSpeed:238,reload:.4,projectileSpeed:0,projectileLife:0,damage:19,projectileRadius:0,penetration:0,bodyDamage:12,barrelCount:0,barrelSpread:0,barrelLength:0,droneCount:6,droneRespawn:.95}),
crusher:classDef({id:'crusher',label:'Crusher',description:'Massiver Rammer mit hoher Standfestigkeit.',parent:'rammer',unlockLevel:25,branch:'impact',maxHealth:158,regen:2.8,acceleration:1370,moveSpeed:275,reload:.48,projectileSpeed:650,projectileLife:1.2,damage:10,projectileRadius:8,penetration:14,bodyDamage:46,barrelCount:1,barrelSpread:0,barrelLength:25,droneCount:0,droneRespawn:0}),
storm:classDef({id:'storm',label:'Storm',description:'Vier Läufe erzeugen eine kontrollierbare Kugelwand.',parent:'twin',unlockLevel:40,branch:'rapid',maxHealth:100,regen:1.9,acceleration:1300,moveSpeed:260,reload:.17,projectileSpeed:820,projectileLife:1.45,damage:10,projectileRadius:6,penetration:15,bodyDamage:10,barrelCount:4,barrelSpread:.32,barrelLength:34,droneCount:0,droneRespawn:0}),
lancer:classDef({id:'lancer',label:'Lancer',description:'Extremer Präzisionsschuss mit langer Vorbereitung.',parent:'railgun',unlockLevel:40,branch:'precision',maxHealth:82,regen:1.25,acceleration:980,moveSpeed:212,reload:1.42,projectileSpeed:1660,projectileLife:2.8,damage:92,projectileRadius:10,penetration:132,bodyDamage:8,barrelCount:1,barrelSpread:0,barrelLength:70,droneCount:0,droneRespawn:0}),
overseer:classDef({id:'overseer',label:'Overseer',description:'Großer Schwarm mit hohem Mikro-Management.',parent:'warden',unlockLevel:40,branch:'control',maxHealth:120,regen:2.5,acceleration:1140,moveSpeed:232,reload:.34,projectileSpeed:0,projectileLife:0,damage:23,projectileRadius:0,penetration:0,bodyDamage:12,barrelCount:0,barrelSpread:0,barrelLength:0,droneCount:8,droneRespawn:.72}),
juggernaut:classDef({id:'juggernaut',label:'Juggernaut',description:'Langsamer, extrem widerstandsfähiger Kollisions-Tank.',parent:'crusher',unlockLevel:40,branch:'impact',maxHealth:205,regen:3.4,acceleration:1180,moveSpeed:248,reload:.58,projectileSpeed:620,projectileLife:1.1,damage:9,projectileRadius:9,penetration:14,bodyDamage:66,barrelCount:1,barrelSpread:0,barrelLength:22,droneCount:0,droneRespawn:0})};
export interface PlayerSnapshot{id:string;name:string;playerClass:PlayerClass;position:Vector2;velocity:Vector2;angle:number;health:number;maxHealth:number;level:number;xp:number;xpForNextLevel:number;availablePoints:number;upgrades:UpgradeLevels;score:number;kills:number;deaths:number;invulnerable:boolean;isBot:boolean;dead:boolean;deathLevel:number;respawnLevel:number;canRespawnAt:number;autoRespawnAt:number;killerName:string}
export interface ProjectileSnapshot{id:string;ownerId:string;position:Vector2;velocity:Vector2;radius:number;integrity:number;maxIntegrity:number}
export interface DroneSnapshot{id:string;ownerId:string;position:Vector2;velocity:Vector2;angle:number;health:number;maxHealth:number}
export interface Wall{id:string;x:number;y:number;width:number;height:number}
export interface ShapeSnapshot{id:string;kind:ShapeKind;position:Vector2;velocity:Vector2;radius:number;rotation:number;health:number;maxHealth:number}
export interface KillEvent{id:number;killer:string;victim:string;at:number}
export interface LeaderboardEntry{id:string;name:string;score:number;level:number;playerClass:PlayerClass;isBot:boolean}
export interface WorldSnapshot{type:'snapshot';selfId:string|null;tick:number;serverTime:number;players:PlayerSnapshot[];projectiles:ProjectileSnapshot[];drones:DroneSnapshot[];shapes:ShapeSnapshot[];walls:Wall[];leaderboard:LeaderboardEntry[];killfeed:KillEvent[]}
export interface WelcomeMessage{type:'welcome';selfId:string}
export interface ErrorMessage{type:'error';message:string}
export interface PongMessage{type:'pong';sentAt:number;serverTime:number}
export type ServerMessage=WorldSnapshot|WelcomeMessage|ErrorMessage|PongMessage;
export const GAME={worldWidth:6000,worldHeight:4000,visibleWorldWidth:1600,visibleWorldHeight:900,viewRadius:1100,maxAimDistance:650,playerRadius:22,tickRate:40,snapshotRate:20,maxUpgradeLevel:8,maxLevel:45,maxPlayers:40,shapeTargetCount:220,respawnDelayMs:2500,autoRespawnDelayMs:7000,respawnInvulnerabilityMs:2600,snapshotBackpressureBytes:512000,projectileStepDistance:10}as const;
export const EMPTY_UPGRADES=():UpgradeLevels=>({maxHealth:0,regen:0,moveSpeed:0,reload:0,damage:0,projectileSpeed:0,penetration:0,bodyDamage:0});
export const sanitizePlayerName=(value:string):string=>value.normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,18);
export const xpThresholdForLevel=(level:number):number=>{const clamped=Math.max(1,Math.min(GAME.maxLevel,Math.floor(level)));return Math.floor(58*clamped+15*clamped*clamped+.55*clamped*clamped*clamped)};
export const xpAtLevelStart=(level:number):number=>level<=1?0:xpThresholdForLevel(level-1);
export const upgradePointsAtLevel=(level:number):number=>Math.max(0,Math.min(GAME.maxLevel,Math.floor(level))-1);
export const respawnLevelFrom=(level:number):number=>Math.max(1,Math.floor(level*.5));
export const availableClassChoices=(current:PlayerClass,level:number):PlayerClass[]=>PLAYER_CLASS_IDS.filter(id=>{const definition=CLASS_DEFINITIONS[id];return definition.parent===current&&definition.unlockLevel<=level});
export const isValidClassChoice=(current:PlayerClass,target:PlayerClass,level:number):boolean=>availableClassChoices(current,level).includes(target);
export const classAvailableAtLevel=(playerClass:PlayerClass,level:number):PlayerClass=>{let current=CLASS_DEFINITIONS[playerClass];const visited=new Set<PlayerClass>();while(current.unlockLevel>level&&current.parent){if(visited.has(current.id))return'core';visited.add(current.id);current=CLASS_DEFINITIONS[current.parent]}return current.id};
