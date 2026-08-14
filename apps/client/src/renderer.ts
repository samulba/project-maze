// Browser-Umgebung sofort registrieren statt sie beim init nachladen zu lassen.
import 'pixi.js/browser';
import { Application, Container, Graphics, Text, WebGLRenderer, WebGPURenderer, type ApplicationOptions } from 'pixi.js';
import {
  CLASS_DEFINITIONS,
  GAME,
  type DroneSnapshot,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeKind,
  type ShapeSnapshot,
  type Vector2,
  type Wall,
  type WorldSnapshot
} from '@project-maze/shared';
import { laeufeVon } from '@project-maze/shared/barrels';
import type { ArenaEventSnapshot } from '@project-maze/shared/gameplay';
import { GUARDIAN_COLOR, GUARDIAN_NAME, arenaEventStyle } from './arena-event-style';
import { barrelHeightFor } from './barrel-geometry';
import { ParticleField } from './particles';
import { QUALITY_TIERS, type QualitySettings, type QualityTier } from './quality';
import {
  type VerglimmendeKugel,
  stepVerglimmende,
  trifftWand,
  verglimmenLassen,
  zeichneVerglimmende
} from './projectile-fade';
import { type RecoilState, startRecoil, stepRecoil } from './recoil';
import type { RenderQuality } from './perf-metrics';
import { hullGeometry } from '@project-maze/shared/appearance';
import { zeichneDrohnen } from './drone-draw';
import { branchColor, signatureColor, signatureLabel, signatureRatio } from './signature';
import { DEFAULT_VIEW_MODE, computeViewport, type ViewMode, type WorldView } from './viewport';
import type { ClientThemeId } from './themes';

interface Palette {
  background:number; outside:number; grid:number; border:number; wall:number; wallEdge:number;
  self:number; enemy:number; barrel:number; projectile:number; drone:number;
  square:number; triangle:number; pentagon:number; label:number;
}
const PALETTES:Record<ClientThemeId,Palette>={
  // Farbe trägt Bedeutung, nicht Dekoration. Gesättigt bleiben genau vier
  // Dinge: eigener Tank, Gegner, Drohnen (eigene Mechanik) und Geschosse (muss
  // man sehen). Formen, Wände und Raster sind bewusst fast grau – zweite
  // Stufe nach „Ruhe & Gewicht", auf Sams Wunsch „weg von Neon City".
  // Richtungskorrektur (Sam, 2026-08-06): „zu düster" – die Grundtöne sind
  // gegenüber der Neon-raus-Fassung rund eine Stufe heller. Die Farbwelt
  // bleibt; nur die Fläche atmet mehr Licht.
  midnight:{background:0x151a26,outside:0x0d1019,grid:0x202636,border:0x3c4356,wall:0x293040,wallEdge:0x40485c,self:0x6f7ad6,enemy:0xc4626f,barrel:0x9aa1b2,projectile:0xdfe4f0,drone:0x5c8b84,square:0x5a6489,triangle:0x8d8065,pentagon:0x82687e,label:0xd6dae6},
  void:{background:0x030407,outside:0x000000,grid:0x111317,border:0x31343b,wall:0x181b20,wallEdge:0x343942,self:0xb8ff6a,enemy:0xff5c76,barrel:0xdde2e8,projectile:0xffffff,drone:0x65e7c2,square:0x6b7c8f,triangle:0xffb84d,pentagon:0xc77dff,label:0xf1f3f5},
  classic:{background:0xe8ebf0,outside:0xcbd0da,grid:0xd5d9e1,border:0x818a9b,wall:0xaab1bf,wallEdge:0x7e8798,self:0x536dfe,enemy:0xf14e63,barrel:0x727b8d,projectile:0x343a46,drone:0x2ba887,square:0x6f7ee8,triangle:0xe5a044,pentagon:0xbd5c9d,label:0x252a34},
  neon:{background:0x0b0620,outside:0x050210,grid:0x241154,border:0x8a3df0,wall:0x1d1040,wallEdge:0x9b52ff,self:0x35e8ff,enemy:0xff3d9e,barrel:0xd9c2ff,projectile:0xf2fbff,drone:0x7bff7d,square:0x5f6dff,triangle:0xffc247,pentagon:0xc85cff,label:0xf4f0ff}
};

interface PlayerView {
  root:Container; rotating:Container; body:Graphics; barrels:Graphics; detail:Graphics;
  shield:Graphics; flash:Graphics; healthBack:Graphics; healthFill:Graphics; signatureBar:Graphics; name:Text;
  current:Vector2; target:Vector2; velocity:Vector2; angle:number; targetAngle:number;
  snapshot:PlayerSnapshot; snapshotAt:number; classId:PlayerClass; isSelf:boolean; isGuardian:boolean; flashUntil:number;
  /** Rückstoß als Federweg (siehe recoil.ts) plus Richtung des letzten Schusses. */
  recoil:RecoilState; recoilDirection:Vector2;
}
/** Kurzer Mündungsblitz am Rohrende. */
interface MuzzleBlip { x:number; y:number; angle:number; radius:number; life:number; maxLife:number; color:number; }
interface MotionView<T> {
  current:Vector2; target:Vector2; velocity:Vector2; snapshot:T; snapshotAt:number;
}
interface ShockRing { position:Vector2; life:number; maxLife:number; maxRadius:number; color:number; width:number; }
/** Bruch-Umriss an der Stelle, an der eine Wand aufgeht (`closing:false`) oder sich schließt. */
interface WallFlash { x:number; y:number; width:number; height:number; life:number; maxLife:number; closing:boolean; }
/**
 * Quelle der vorhergesagten eigenen Position (N2, `prediction.ts`). Liefert
 * `null`, solange keine Vorhersage läuft – dann bleibt es bei der Interpolation
 * auf die Serverposition. Der Renderer kennt bewusst nur diese eine Methode.
 */
export interface SelfPredictor { sample(): { position:Vector2 }|null }
interface FloatingLabel { text:Text; life:number; maxLife:number; velocityY:number; }

const SHAPE_REWARDS:Record<string,number>={square:18,triangle:45,pentagon:120};
/** Obergrenze der Overcharge-Funken pro Sekunde – unabhängig von der Zahl der Geschosse. */
const OVERCHARGE_SPARKS_PER_SECOND=48;
/** Sicherheitsrand zum Server-Cull-Rechteck, damit Culling nicht als Bruch gilt. */
const WALL_CULL_MARGIN=140;
const MAX_WALL_FLASHES=24;
/** Weg des Rohrs nach hinten in Welteinheiten (Feder: recoil.ts). */
const RECOIL_BARREL=5;
/**
 * Der Tank selbst bleibt beim Schießen ruhig – nur das Rohr federt.
 * Ausdrücklicher Spielerwunsch (Sam): Körper-Kickback wirkte wie Wackeln.
 */
const RECOIL_BODY=0;
const MUZZLE_BLIP_SECONDS=.07;
const MAX_MUZZLE_BLIPS=24;
/**
 * Nachlauf auf die vorhergesagte eigene Position. Deutlich straffer als die
 * 42 der Interpolation: Die Vorhersage ist bereits stetig und für den aktuellen
 * Moment gerechnet, hier soll nur noch der kleine Versatz beim Wandkontakt
 * geglättet werden – kein zweites Mal Verzögerung obendrauf.
 */
const PREDICTED_SELF_RESPONSE=110;

class FloatingNumbers {
  readonly container=new Container();
  private readonly active:FloatingLabel[]=[];
  private readonly pool:Text[]=[];
  spawn(position:Vector2,value:string,color:number,size=13):void{
    if(this.active.length>=48)return;
    const text=this.pool.pop()??new Text({text:'',style:{fill:0xffffff,fontSize:13,fontWeight:'700',fontFamily:'Inter, system-ui, sans-serif',stroke:{color:0x000000,width:3,alpha:.55}}});
    text.text=value;
    text.style.fontSize=size;
    text.style.fill=color;
    text.anchor.set(.5);
    text.alpha=1;
    text.position.set(position.x+(Math.random()-.5)*14,position.y-14);
    this.container.addChild(text);
    this.active.push({text,life:.75,maxLife:.75,velocityY:-46});
  }
  update(delta:number):void{
    for(let index=this.active.length-1;index>=0;index-=1){
      const label=this.active[index];
      if(!label)continue;
      label.life-=delta;
      if(label.life<=0){
        this.container.removeChild(label.text);
        if(this.pool.length<48)this.pool.push(label.text);
        this.active.splice(index,1);
        continue;
      }
      label.text.position.y+=label.velocityY*delta;
      label.text.alpha=Math.min(1,label.life/(label.maxLife*.55));
    }
  }
}

const clamp=(value:number,min:number,max:number):number=>Math.max(min,Math.min(max,value));
const normalize=(value:Vector2):Vector2=>{const length=Math.hypot(value.x,value.y);return length<.001?{x:0,y:0}:{x:value.x/length,y:value.y/length}};
const polygon=(sides:number,radius:number,rotation=0):number[]=>{const points:number[]=[];for(let index=0;index<sides;index+=1){const angle=rotation+index*Math.PI*2/sides;points.push(Math.cos(angle)*radius,Math.sin(angle)*radius)}return points};
const translated=(points:number[],position:Vector2):number[]=>points.map((value,index)=>value+(index%2===0?position.x:position.y));
function angleLerp(current:number,target:number,factor:number):number{let difference=(target-current+Math.PI)%(Math.PI*2)-Math.PI;if(difference<-Math.PI)difference+=Math.PI*2;return current+difference*factor}

export class GameRenderer {
  /**
   * Beide Renderer fest ins Bundle zwingen: PixiJS lädt sie sonst beim init per
   * dynamic import nach – hängt dieser Nachlade-Request (Deploy-Wechsel,
   * wackliges Netz, Browser-Erweiterungen), läuft jeder Grafikweg ins Zeitlimit,
   * obwohl die Grafikkarte völlig in Ordnung ist. Statisch importiert löst
   * PixiJS' interner import() sofort aus dem Modul-Cache auf.
   */
  static readonly bundledRenderers=[WebGLRenderer,WebGPURenderer] as const;
  // Nicht readonly: Schlägt der WebGL-Start fehl, braucht der WebGPU-Versuch
  // eine frische Application – eine halb initialisierte lässt sich nicht neu starten.
  app=new Application();
  private readonly world=new Container();
  private readonly background=new Graphics();
  private readonly walls=new Graphics();
  private readonly shapes=new Graphics();
  private readonly projectiles=new Graphics();
  private readonly drones=new Graphics();
  private readonly players=new Container();
  private readonly particles=new ParticleField();
  private readonly fx=new Graphics();
  private readonly numbers=new FloatingNumbers();
  private readonly rings:ShockRing[]=[];
  private shakeAmplitude=0;
  private readonly viewportMask=new Graphics();
  /** Weicher Abschluss am Rand des Sichtfelds – liegt INNEN, siehe drawViewportEdge. */
  private readonly viewportEdge=new Graphics();
  private readonly crosshair=new Graphics();
  private readonly playerViews=new Map<string,PlayerView>();
  private readonly projectileViews=new Map<string,MotionView<ProjectileSnapshot>>();
  private readonly droneViews=new Map<string,MotionView<DroneSnapshot>>();
  private snapshot:WorldSnapshot|null=null;
  private selfId:string|null=null;
  private palette=PALETTES.midnight;
  private pointer:Vector2={x:innerWidth/2,y:innerHeight/2};
  private primary=false;
  private secondary=false;
  private showCrosshair=false;
  private scale=1;
  private viewport={x:0,y:0,width:1280,height:720};
  /** Sichtbarer Weltausschnitt – bei festem 16:9 immer 1600x900 (viewport.ts). */
  private worldView:WorldView={width:GAME.visibleWorldWidth,height:GAME.visibleWorldHeight};
  private viewMode:ViewMode=DEFAULT_VIEW_MODE;
  private time=0;
  private wallsSignature='';
  private knownShapes=new Map<string,ShapeSnapshot>();
  private knownEliteIds=new Set<string>();
  private hadArenaEvent=false;
  private suppressShapeRewardsUntil=0;
  /** Einschlagsorte eigener Projektile der letzten ~300 ms (Befund 1). */
  private ownImpacts:Array<{position:Vector2;at:number}>=[];
  /** Gegner-Gesundheitsabfälle, die noch auf ihre Urheber-Prüfung warten. */
  private pendingEnemyHits:Array<{position:Vector2;at:number}>=[];
  /** Rückmeldungen für main (Audio) – je Snapshot abgeholt. */
  private feedback:{hits:number;shapeBreaks:ShapeKind[];droneSpawns:number;droneLosses:number;discharges:number}={hits:0,shapeBreaks:[],droneSpawns:0,droneLosses:0,discharges:0};
  /** Höchste bereits abgespielte Entladungs-Id (Befund 7) – Ids wachsen monoton. */
  private lastDischargeId=0;
  /** Hitmarker im Fadenkreuz, kurz nach einem bestätigten Treffer. */
  private hitmarkerUntil=0;
  /** Erst nach dem ersten Drohnen-Sync zählen – der Join liefert alle auf einmal. */
  private dronesSynced=false;
  private initialized=false;
  /**
   * Welcher der drei Grafikwege tatsächlich hochgekommen ist. Die Perf-
   * Telemetrie meldet ihn als `quality`; `webgl-kompat` ist per Definition
   * der „alte PC".
   */
  quality:RenderQuality='unknown';
  /** Aktive Qualitätsstufe (R4). Steuert Partikel, Leuchten und Auflösung. */
  private tier:QualityTier='mid';
  private ratioCheck=1;
  private lastDeviceRatio=1;
  private settings:QualitySettings=QUALITY_TIERS.mid;
  private lastSnapshotAt=performance.now();
  private guardianId:string|null=null;
  /** Gesetzt, solange der Server einen Zuschauer-Blick vorgibt (SPECTATOR_ENABLED). */
  private spectatorId:string|null=null;
  private arenaEvent:ArenaEventSnapshot|null=null;
  /** Bruchteile eines Funkens, damit die Rate unabhängig von der Bildrate bleibt. */
  private sparkBudget=0;
  private knownWalls=new Map<string,Wall>();
  private wallsInitialized=false;
  private lastSelfPosition:Vector2|null=null;
  /** Client-Prediction (N2). `null` = aus, dann zeichnet der Renderer wie bisher. */
  private selfPredictor:SelfPredictor|null=null;
  private readonly wallFlashes:WallFlash[]=[];
  private readonly muzzleBlips:MuzzleBlip[]=[];
  /** Kugeln, die aus dem Snapshot gefallen sind und noch ausgeblendet werden. */
  private readonly verglimmende:VerglimmendeKugel[]=[];

  /** Erst true, wenn PixiJS fertig initialisiert ist – vorher darf nichts auf app.renderer zugreifen. */
  get ready():boolean{return this.initialized}

  /** Schneller Vorabtest: Bekommt die Seite überhaupt einen WebGL-Kontext? */
  static webglAvailable():boolean{
    try{
      const canvas=document.createElement('canvas');
      const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
      if(!gl)return false;
      // Den Testkontext sofort zurückgeben – Browser vergeben nur ~16 Kontexte,
      // und dieser hier würde sonst bis zur Garbage Collection einen blockieren.
      (gl.getExtension('WEBGL_lose_context') as {loseContext():void}|null)?.loseContext();
      return true;
    }catch{
      return false;
    }
  }

  /** app.init() kann bei kaputten Treibern hängen statt abzulehnen – deshalb ein hartes Zeitlimit. */
  private static withTimeout(promise:Promise<void>,ms:number,label:string):Promise<void>{
    return new Promise((resolve,reject)=>{
      const timer=window.setTimeout(()=>reject(new Error(label)),ms);
      promise.then(
        ()=>{window.clearTimeout(timer);resolve()},
        (error:unknown)=>{window.clearTimeout(timer);reject(error instanceof Error?error:new Error(String(error)))}
      );
    });
  }

  /**
   * Stufe setzen. Antialias und Auflösung greifen erst beim nächsten Start
   * bzw. beim nächsten `syncSize` – Partikel und Leuchten sofort.
   */
  setQuality(tier:QualityTier):void{
    this.tier=tier;
    this.settings=QUALITY_TIERS[tier];
    this.particles.setQuality(this.settings.particleScale,this.settings.maxParticles);
    if(this.initialized)this.syncSize();
  }

  get qualityTier():QualityTier{return this.tier}

  async init(root:HTMLElement,tier:QualityTier='mid'):Promise<void>{
    this.setQuality(tier);
    // Kein resizeTo: Die Größe wird selbst verwaltet (syncSize), weil
    // window.innerHeight auf iOS nicht dem sichtbaren Bereich entspricht.
    const base={background:this.palette.outside,autoDensity:true};
    // Drei Grafikwege, jeder mit hartem Zeitlimit (PixiJS hängt sonst ohne
    // Rückmeldung, wenn der Browser keinen Kontext hergibt):
    // 1. WebGL in voller Qualität.
    // 2. WebGL im Kompatibilitätsmodus: ohne Antialiasing, Auflösung 1 und mit
    //    ausdrücklich erlaubtem Software-Rendering – langsamer, läuft aber auch
    //    ohne Hardwarebeschleunigung.
    // 3. WebGPU (Chrome/Edge vergeben den teils auch, wenn WebGL blockiert ist).
    const webgl=GameRenderer.webglAvailable();
    // `RenderQuality` statt `string`: Die Labels sind zugleich das Vokabular,
    // das der Telemetrie-Endpunkt akzeptiert – ein Tippfehler fiele sonst erst
    // in der Server-Statistik auf.
    const attempts:{label:RenderQuality;possible:boolean;options:Partial<ApplicationOptions>}[]=[
      {label:'webgl',possible:webgl,options:{...base,preference:'webgl',antialias:this.settings.antialias,resolution:this.pixelRatio()}},
      {label:'webgl-kompat',possible:webgl,options:{...base,preference:'webgl',antialias:false,resolution:1,failIfMajorPerformanceCaveat:false,powerPreference:'low-power'}},
      {label:'webgpu',possible:'gpu' in navigator,options:{...base,preference:'webgpu',antialias:true,resolution:1}}
    ];
    const failures:string[]=[];
    let running=false;
    for(const attempt of attempts){
      if(!attempt.possible){failures.push(`${attempt.label}: vom Browser blockiert`);continue;}
      const candidate=this.app;
      const boot=candidate.init(attempt.options);
      try{
        await GameRenderer.withTimeout(boot,6000,'Zeitlimit');
        running=true;
        this.quality=attempt.label;
        break;
      }catch(error){
        failures.push(`${attempt.label}: ${error instanceof Error&&error.message?error.message:'Fehler'}`);
        console.warn(`Grafikweg ${attempt.label} fehlgeschlagen`,error);
        // Läuft der abgebrochene Init später doch noch zu Ende, hinterließe er
        // einen unsichtbaren Renderer samt Ticker und GPU-Kontext – deshalb
        // wird er beim Eintreffen sofort entsorgt. Eine halb initialisierte
        // Application lässt sich ohnehin nicht neu starten.
        void boot.then(()=>candidate.destroy(true),()=>{});
        this.app=new Application();
      }
    }
    if(!running)throw new Error(failures.join(' · '));
    this.initialized=true;
    root.prepend(this.app.canvas);
    this.world.addChild(this.background,this.walls,this.shapes,this.projectiles,this.drones,this.particles.graphics,this.players,this.fx,this.numbers.container);
    this.world.mask=this.viewportMask;
    this.viewportEdge.mask=this.viewportMask;
    this.app.stage.addChild(this.world,this.viewportEdge,this.viewportMask,this.crosshair);
    this.syncSize();
    // iOS meldet neue Maße gern verspätet – deshalb nach jedem Ereignis ein
    // zweiter Abgleich mit kurzem Abstand.
    const resync=():void=>{this.syncSize();window.setTimeout(()=>this.syncSize(),350)};
    window.addEventListener('resize',resync);
    window.addEventListener('orientationchange',resync);
    document.addEventListener('fullscreenchange',resync);
    window.visualViewport?.addEventListener('resize',resync);
    window.visualViewport?.addEventListener('scroll',resync);
    // Zoom und Monitorwechsel melden nicht überall ein `resize` – die
    // Medienabfrage auf die aktuelle Dichte tut es zuverlässig. Sie gilt immer
    // nur für genau einen Wert und wird nach jedem Treffer neu gestellt.
    const watchRatio=():void=>{
      const query=window.matchMedia(`(resolution: ${window.devicePixelRatio||1}dppx)`);
      const once=():void=>{resync();watchRatio()};
      if('addEventListener' in query)query.addEventListener('change',once,{once:true});
    };
    watchRatio();
    this.drawBackground();
    this.app.ticker.add(ticker=>this.render(Math.min(.05,ticker.deltaMS/1000)));
  }

  setSnapshot(snapshot:WorldSnapshot):void{
    const now=performance.now();
    this.lastSnapshotAt=now;
    this.snapshot=snapshot;
    this.selfId=snapshot.selfId;
    const signature=snapshot.walls.map(wall=>`${wall.id}:${wall.x}:${wall.y}:${wall.width}:${wall.height}`).join('|');
    if(signature!==this.wallsSignature){this.wallsSignature=signature;this.syncWallChanges(snapshot);this.drawWalls(snapshot)}
    const extended=snapshot as WorldSnapshot&{arenaEvent?:ArenaEventSnapshot|null;arenaGuardianId?:string|null;spectatorTargetId?:string|null;dischargeBursts?:Array<{id:number;x:number;y:number;radius:number;ownerId:string|null}>};
    this.arenaEvent=extended.arenaEvent??null;
    this.spectatorId=extended.spectatorTargetId??null;
    for(const burst of extended.dischargeBursts??[]){
      if(burst.id<=this.lastDischargeId)continue;
      this.lastDischargeId=burst.id;
      this.playDischarge(burst);
    }
    const guardianId=extended.arenaGuardianId??null;
    const guardianChanged=guardianId!==this.guardianId;
    this.guardianId=guardianId;
    this.syncPlayers(snapshot,now);
    this.syncProjectiles(snapshot,now);
    this.syncDrones(snapshot,now);
    this.syncShapeEffects(snapshot);
    this.correlateOwnHits(now);
    if(guardianChanged&&guardianId)this.announceGuardian(guardianId,snapshot);
    const self=snapshot.players.find(player=>player.id===snapshot.selfId);
    this.lastSelfPosition=self?{...self.position}:null;
  }

  /**
   * Treffer-Bestätigung (Befund 1): Ein Gegner-Gesundheitsabfall zählt nur
   * dann als EIGENER Treffer, wenn in denselben ~300 ms ein eigenes Projektil
   * in seiner Nähe verschwunden ist oder eine eigene Drohne Kontakt hat –
   * sonst quittiert der Client fremde Duelle. Läuft NACH allen Syncs, weil
   * syncPlayers vor syncProjectiles dran ist und den Einschlag desselben
   * Snapshots sonst nicht sähe.
   */
  private correlateOwnHits(now:number):void{
    this.ownImpacts=this.ownImpacts.filter(impact=>now-impact.at<=320);
    const open:Array<{position:Vector2;at:number}>=[];
    for(const hit of this.pendingEnemyHits){
      if(now-hit.at>320)continue;
      const byProjectile=this.ownImpacts.some(impact=>Math.hypot(impact.position.x-hit.position.x,impact.position.y-hit.position.y)<=90);
      const byDrone=!byProjectile&&[...this.droneViews.values()].some(view=>view.snapshot.ownerId===this.selfId&&Math.hypot(view.current.x-hit.position.x,view.current.y-hit.position.y)<=44);
      if(byProjectile||byDrone){
        this.feedback.hits+=1;
        this.hitmarkerUntil=now+90;
        this.particles.burst(hit.position,0xffffff,3,120,.2);
      }else open.push(hit);
    }
    this.pendingEnemyHits=open;
  }

  /**
   * Von main je Snapshot abgeholt – der Renderer kennt die Ereignisse, das
   * Audio wohnt in main. Zurückgesetzt beim Lesen.
   */
  consumeFeedback():{hits:number;shapeBreaks:ShapeKind[];droneSpawns:number;droneLosses:number;discharges:number}{
    const out=this.feedback;
    this.feedback={hits:0,shapeBreaks:[],droneSpawns:0,droneLosses:0,discharges:0};
    return out;
  }

  /**
   * AEGIS-Entladung (Befund 7): Der Server verrechnet sie in einem Tick –
   * Getroffene flogen bisher „grundlos" weg, und der Träger bekam für den
   * halben Lebensbalken Aufladung keinen einzigen Frame Auftritt. Jetzt: ein
   * Schockring über den vollen Wirkradius (die 240 kommen vom Server mit, keine
   * zweite Zahlenquelle), Funken in Familienfarbe, ein Kamera-Stoß für den
   * Träger. Der Ton wohnt in main und kommt über `feedback.discharges`.
   */
  private playDischarge(burst:{x:number;y:number;radius:number;ownerId:string|null}):void{
    const position={x:burst.x,y:burst.y};
    const color=branchColor('aegis')??0x4ea9a4;
    this.rings.push({position:{...position},life:.55,maxLife:.55,maxRadius:burst.radius,color,width:5});
    this.rings.push({position:{...position},life:.8,maxLife:.8,maxRadius:burst.radius*.55,color:0xdff5f2,width:2});
    this.particles.burst(position,color,20,300,.5);
    if(burst.ownerId!==null&&burst.ownerId===this.selfId)this.shake(4);
    this.feedback.discharges+=1;
  }

  /** Klassenwahl sichtbar machen (Befund 10): Ring, Funken und ein Ruck am eigenen Tank. */
  celebrateClassChange():void{
    const view=this.selfId?this.playerViews.get(this.selfId):null;
    if(!view)return;
    const color=this.palette.self;
    this.particles.burst(view.current,color,18,260,.5);
    this.rings.push({position:{...view.current},life:.6,maxLife:.6,maxRadius:120,color,width:4});
    this.shake(4);
  }

  /**
   * Erkennt aufgebrochene und wieder geschlossene Wände (Fracture).
   *
   * Heikel daran: Der Server schneidet die Wandliste am Sichtfeld zu, es
   * kommen also ständig Wände dazu und weg, nur weil sich der Spieler bewegt.
   * Gezeigt wird deshalb nur, was *deutlich innerhalb* des Sichtfelds
   * verschwindet oder auftaucht – und gar nichts, wenn der Spieler gerade
   * gesprungen ist (Respawn), weil dann die ganze Liste wechselt.
   */
  private syncWallChanges(snapshot:WorldSnapshot):void{
    const self=snapshot.players.find(player=>player.id===snapshot.selfId);
    const next=new Map(snapshot.walls.map(wall=>[wall.id,wall] as const));
    const jumped=!self||!this.lastSelfPosition
      ||Math.hypot(self.position.x-this.lastSelfPosition.x,self.position.y-this.lastSelfPosition.y)>400;
    if(this.wallsInitialized&&self&&!jumped){
      const anchor=this.viewAnchor(self.position);
      for(const[id,wall]of this.knownWalls){
        if(!next.has(id)&&this.wallWellInsideView(wall,anchor))this.flashWall(wall,false);
      }
      for(const[id,wall]of next){
        if(!this.knownWalls.has(id)&&this.wallWellInsideView(wall,anchor))this.flashWall(wall,true);
      }
    }
    this.knownWalls=next;
    this.wallsInitialized=true;
  }

  /**
   * Die Wand muss vollständig innerhalb des Server-Cull-Rechtecks liegen, mit
   * Rand. Nur dann kann ihr Verschwinden kein Culling gewesen sein.
   */
  private wallWellInsideView(wall:Wall,center:Vector2):boolean{
    const halfWidth=GAME.visibleWorldWidth*.62-WALL_CULL_MARGIN;
    const halfHeight=GAME.visibleWorldHeight*.72-WALL_CULL_MARGIN;
    return wall.x>=center.x-halfWidth&&wall.x+wall.width<=center.x+halfWidth
      &&wall.y>=center.y-halfHeight&&wall.y+wall.height<=center.y+halfHeight;
  }

  /** Bruch-Partikel plus violetter Umriss – nach außen beim Öffnen, nach innen beim Schließen. */
  private flashWall(wall:Wall,closing:boolean):void{
    if(this.wallFlashes.length>=MAX_WALL_FLASHES)this.wallFlashes.shift();
    this.wallFlashes.push({x:wall.x,y:wall.y,width:wall.width,height:wall.height,life:.62,maxLife:.62,closing});
    const style=arenaEventStyle('fracture');
    const count=Math.min(20,6+Math.round((wall.width+wall.height)/38));
    for(let index=0;index<count;index+=1){
      const point={x:wall.x+Math.random()*wall.width,y:wall.y+Math.random()*wall.height};
      this.particles.burst(point,index%2===0?style.ring:style.core,1,closing?70:165,closing?.3:.48);
    }
  }

  /** Auftritt des Guardians: doppelter Schockring, goldener Funkenkranz, kurzer Kamera-Stoß. */
  private announceGuardian(guardianId:string,snapshot:WorldSnapshot):void{
    const view=this.playerViews.get(guardianId);
    if(!view)return;
    const position={...view.current};
    this.particles.burst(position,GUARDIAN_COLOR,30,340,.7);
    this.particles.burst(position,0xffe3a0,14,170,.5);
    this.rings.push({position:{...position},life:.7,maxLife:.7,maxRadius:180,color:GUARDIAN_COLOR,width:5});
    this.rings.push({position:{...position},life:1,maxLife:1,maxRadius:280,color:0xffe3a0,width:2});
    const self=snapshot.players.find(player=>player.id===snapshot.selfId);
    if(self&&this.wellInsideView(position,this.viewAnchor(self.position)))this.shake(4);
  }

  /**
   * Vorhersage der eigenen Position an- oder abmelden (N2). Wirkt sofort, auch
   * mitten im Spiel: Ohne Quelle fällt der eigene Tank ab dem nächsten Frame
   * wieder auf die interpolierte Serverposition zurück.
   */
  setSelfPredictor(predictor:SelfPredictor|null):void{this.selfPredictor=predictor}

  /**
   * Sichtfeld-Modus umstellen (Sams Rand-Befund). Wirkt sofort, auch mitten im
   * Spiel: Maske, Skalierung und die HUD-Variablen werden neu gesetzt.
   */
  setViewMode(mode:ViewMode):void{
    if(mode===this.viewMode)return;
    this.viewMode=mode;
    if(this.initialized)this.resizeViewport();
  }

  get currentViewMode():ViewMode{return this.viewMode}

  setInput(pointer:Vector2,primary:boolean,secondary:boolean,showCrosshair:boolean):void{
    this.pointer=pointer;this.primary=primary;this.secondary=secondary;this.showCrosshair=showCrosshair;
  }

  screenPointToWorldAim(pointer:Vector2):Vector2{
    const center={x:this.viewport.x+this.viewport.width/2,y:this.viewport.y+this.viewport.height/2};
    const direction={x:(pointer.x-center.x)/Math.max(.001,this.scale),y:(pointer.y-center.y)/Math.max(.001,this.scale)};
    const length=Math.hypot(direction.x,direction.y);
    if(length<=GAME.maxAimDistance)return direction;
    const factor=GAME.maxAimDistance/Math.max(.001,length);
    return{x:direction.x*factor,y:direction.y*factor};
  }

  setTheme(theme:ClientThemeId):void{
    this.palette=PALETTES[theme]??PALETTES.midnight;
    // Vor dem Init existiert kein Renderer – die Palette gilt dann ab dem ersten Frame.
    if(!this.initialized)return;
    this.app.renderer.background.color=this.palette.outside;
    this.resizeViewport();
    this.drawBackground();
    if(this.snapshot)this.drawWalls(this.snapshot);
    for(const view of this.playerViews.values())this.redrawPlayer(view,true);
  }

  private syncPlayers(snapshot:WorldSnapshot,now:number):void{
    const active=new Set<string>();
    for(const player of snapshot.players){
      active.add(player.id);
      let view=this.playerViews.get(player.id);
      const isSelf=player.id===snapshot.selfId;
      if(!view){
        view=this.createPlayerView(player,isSelf,now);
        this.playerViews.set(player.id,view);
        this.players.addChild(view.root);
      }
      const previous=view.snapshot;
      if(!player.dead&&!previous.dead&&player.health<previous.health-.01&&player.deaths===previous.deaths){
        view.flashUntil=now+130;
        // Sam: „diese Zahlen wenn man iwas damaged auch kacke, raus damit" –
        // keine Schadenszahl mehr über einem GEGNER, den man selbst trifft.
        // Der eigene Lebensverlust bleibt sichtbar (Rand-Anzeige, das war ein
        // anderer Punkt) – hier geht es nur um den Schaden, den man AUSTEILT.
        const amount=Math.round(previous.health-player.health);
        if(isSelf&&amount>=1)this.numbers.spawn({x:view.current.x,y:view.current.y-26},`-${amount}`,0xff8091,14);
        // Kandidat für die Treffer-Bestätigung – ob es ein EIGENER Treffer
        // war, entscheidet correlateOwnHits nach den Projektil-Syncs.
        if(!isSelf)this.pendingEnemyHits.push({position:{...view.current},at:now});
      }
      if(player.dead&&!previous.dead){
        const color=this.ownerColor(player.id);
        this.particles.burst(view.current,color,24,320,.55);
        this.rings.push({position:{...view.current},life:.5,maxLife:.5,maxRadius:86,color,width:4});
        // Der eigene Kill bekommt seine Zahl (Befund 4): Ein Abschuss bringt
        // 130 + Level·18 Score – das 7- bis 35-Fache einer Form, und auf dem
        // Schirm stand davon bisher nichts, während jedes fremde Quadrat ein
        // goldenes '+18' bekam. killerName liegt nach dem Tod im Snapshot.
        const selfName=snapshot.players.find(p=>p.id===snapshot.selfId)?.name;
        if(!isSelf&&selfName&&player.killerName===selfName){
          this.numbers.spawn({x:view.current.x,y:view.current.y-8},`+${130+player.level*18}`,this.palette.self,17);
        }
      }
      const displacement=Math.hypot(player.position.x-view.target.x,player.position.y-view.target.y);
      if(displacement>320||(!player.dead&&view.snapshot.dead))view.current={...player.position};
      view.target={...player.position};
      view.velocity={...player.velocity};
      view.targetAngle=player.angle;
      view.snapshot=player;
      view.snapshotAt=now;
      const isGuardian=player.id===this.guardianId;
      if(view.classId!==player.playerClass||view.isSelf!==isSelf||view.isGuardian!==isGuardian){view.classId=player.playerClass;view.isSelf=isSelf;view.isGuardian=isGuardian;this.redrawPlayer(view,true)}
      else this.redrawPlayer(view,false);
      view.root.visible=!player.dead;
    }
    for(const[id,view]of this.playerViews){
      if(active.has(id))continue;
      view.root.destroy({children:true});
      this.playerViews.delete(id);
    }
  }

  private syncProjectiles(snapshot:WorldSnapshot,now:number):void{
    const active=new Set<string>();
    for(const projectile of snapshot.projectiles){
      active.add(projectile.id);
      const existing=this.projectileViews.get(projectile.id);
      if(!existing){
        this.projectileViews.set(projectile.id,{current:{...projectile.position},target:{...projectile.position},velocity:{...projectile.velocity},snapshot:projectile,snapshotAt:now});
        const owner=this.playerViews.get(projectile.ownerId);
        if(owner){
          const direction=normalize(projectile.velocity);
          this.particles.muzzle(owner.current,direction,this.ownerColor(projectile.ownerId));
          this.fireRecoil(owner,direction,projectile);
        }
        continue;
      }
      const displacement=Math.hypot(projectile.position.x-existing.target.x,projectile.position.y-existing.target.y);
      if(displacement>260)existing.current={...projectile.position};
      existing.target={...projectile.position};
      existing.velocity={...projectile.velocity};
      existing.snapshot=projectile;
      existing.snapshotAt=now;
    }
    for(const[id,view]of this.projectileViews){
      if(active.has(id))continue;
      // Eigene Einschläge merken (Befund 1): Der letzte bekannte Ort eines
      // verschwundenen eigenen Projektils ist die Urheber-Spur für die
      // Treffer-Bestätigung.
      if(view.snapshot.ownerId===this.selfId){
        this.ownImpacts.push({position:{...view.current},at:now});
        if(this.ownImpacts.length>24)this.ownImpacts.shift();
      }
      this.verglimmenLassen(view,snapshot);
      this.projectileViews.delete(id);
    }
  }

  /**
   * Übergibt eine verschwundene Kugel ans Ausblenden (Sams Punkt 2 vom 14.08.).
   * Die Logik selbst steht als reine Funktion in `projectile-fade.ts` – hier
   * wird nur zusammengetragen, was der Renderer über sie weiß.
   */
  private verglimmenLassen(view:MotionView<ProjectileSnapshot>,snapshot:WorldSnapshot):void{
    verglimmenLassen(
      this.verglimmende,
      {position:view.current,velocity:view.velocity,radius:view.snapshot.radius,color:this.ownerColor(view.snapshot.ownerId)},
      trifftWand(view.current,view.velocity,view.snapshot.radius,snapshot.walls)
    );
  }

  private syncDrones(snapshot:WorldSnapshot,now:number):void{
    const active=new Set<string>();
    for(const drone of snapshot.drones){
      active.add(drone.id);
      const existing=this.droneViews.get(drone.id);
      if(!existing){
        this.droneViews.set(drone.id,{current:{...drone.position},target:{...drone.position},velocity:{...drone.velocity},snapshot:drone,snapshotAt:now});
        // Nachschub der eigenen Flotte hörbar machen (Befund 8) – aber nicht
        // beim Join, wo alle auf einmal auftauchen.
        if(this.dronesSynced&&drone.ownerId===this.selfId)this.feedback.droneSpawns+=1;
        continue;
      }
      // Drohnen-Treffer sichtbar machen (Befund 8): health/maxHealth liegen in
      // jedem Snapshot – der Renderer hat sie bisher nie gelesen.
      if(drone.health<existing.snapshot.health-.01){
        this.particles.burst(existing.current,this.ownerColor(drone.ownerId),2,80,.16);
      }
      const displacement=Math.hypot(drone.position.x-existing.target.x,drone.position.y-existing.target.y);
      if(displacement>240)existing.current={...drone.position};
      existing.target={...drone.position};
      existing.velocity={...drone.velocity};
      existing.snapshot=drone;
      existing.snapshotAt=now;
    }
    for(const[id,view]of this.droneViews){
      if(active.has(id))continue;
      // Bisher war eine Drohne im nächsten Bild einfach nicht mehr da – kein
      // Splitter, kein Ton. Für einen Overseer ist das die halbe Feuerkraft.
      const self=this.snapshot?.players.find(p=>p.id===this.selfId);
      if(self&&this.wellInsideView(view.current,self.position)){
        this.particles.burst(view.current,this.ownerColor(view.snapshot.ownerId),6,140,.3);
      }
      if(this.dronesSynced&&view.snapshot.ownerId===this.selfId)this.feedback.droneLosses+=1;
      this.droneViews.delete(id);
    }
    this.dronesSynced=true;
  }

  private syncShapeEffects(snapshot:WorldSnapshot):void{
    const extended=snapshot as WorldSnapshot&{eliteShapeIds?:string[];arenaEvent?:{phase:string}|null};
    const previousElites=this.knownEliteIds;
    this.knownEliteIds=new Set(extended.eliteShapeIds??[]);
    if(this.hadArenaEvent&&!extended.arenaEvent)this.suppressShapeRewardsUntil=performance.now()+1500;
    this.hadArenaEvent=Boolean(extended.arenaEvent);
    const self=snapshot.players.find(player=>player.id===snapshot.selfId);
    const suppressed=performance.now()<this.suppressShapeRewardsUntil;
    const shapes=new Map(snapshot.shapes.map(shape=>[shape.id,shape] as const));
    for(const[id,previous]of this.knownShapes){
      const current=shapes.get(id);
      if(current&&current.health<previous.health)this.particles.burst(current.position,this.shapeColor(current),3,85,.18);
      if(!current&&!suppressed&&self&&this.wellInsideView(previous.position,this.viewAnchor(self.position))){
        const elite=previousElites.has(id);
        this.particles.burst(previous.position,elite?0xf4c866:this.shapeColor(previous),elite?22:10,elite?260:170,elite?.55:.38);
        if(elite)this.rings.push({position:{...previous.position},life:.55,maxLife:.55,maxRadius:110,color:0xf4c866,width:4});
        const reward=SHAPE_REWARDS[previous.kind]??0;
        if(reward>0)this.numbers.spawn(previous.position,`+${elite?reward+260:reward}`,0xf3c45f,elite?15:12);
        // Ton nur für EIGENE Abschüsse (Befund 9): Ein eigener Einschlag in
        // Reichweite der Form ist die Urheber-Spur – fremde Farmer sollen
        // nicht die eigene Tonspur füllen.
        const own=this.ownImpacts.some(impact=>Math.hypot(impact.position.x-previous.position.x,impact.position.y-previous.position.y)<=previous.radius+70);
        if(own)this.feedback.shapeBreaks.push(previous.kind);
      }
    }
    this.knownShapes=shapes;
  }

  /** Deutlich innerhalb des Server-Cull-Rechtecks – Despawns an der Sichtkante zählen nicht als Kill. */
  private wellInsideView(position:Vector2,center:Vector2):boolean{
    return Math.abs(position.x-center.x)<=GAME.visibleWorldWidth/2-60&&Math.abs(position.y-center.y)<=GAME.visibleWorldHeight/2-60;
  }

  /**
   * Bezugspunkt für „ist das gerade im Bild" – beim Zuschauen der beobachtete
   * Spieler, sonst man selbst (B2, Sam: „beim Zuschauen sind ab und zu random
   * gelbe Ringe im Screen").
   *
   * Der Server baut den Snapshot eines Toten aus der Perspektive des Killers
   * (siehe spectator.ts): Culling und Sichtfenster hängen an dessen Position,
   * die eigene Leiche bleibt aber an der Todesstelle liegen – oft weit weg von
   * dem, was der Killer inzwischen sieht. Wer trotzdem gegen `self.position`
   * rechnet, zeigt Effekte (Form-Ring, Wandblitz) mal zufällig, mal gar nicht
   * – je nachdem, wie weit die eigene Leiche gerade vom Killer entfernt liegt,
   * nicht danach, ob etwas wirklich im Bild passiert ist. Derselbe Kniff wie
   * bei `camera` in `render()`, nur wiederverwendbar für Sync-Methoden ohne
   * eigene Kamera-Variable.
   */
  private viewAnchor(self:Vector2):Vector2{
    const spectated=this.spectatorId?this.playerViews.get(this.spectatorId):undefined;
    return spectated?.current??self;
  }

  private render(delta:number):void{
    this.ensureSize();
    this.time+=delta;
    const now=performance.now();
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;
    // Beim Zuschauen hängt die Kamera am beobachteten Spieler; `selfId` bleibt
    // unverändert, damit HUD, Death-Screen und Respawn weiter den eigenen Tank meinen.
    const camera=(this.spectatorId?this.playerViews.get(this.spectatorId):undefined)??self;
    // Beim Zuschauen sagt die eigene Eingabe nichts über den beobachteten Tank
    // aus – dann bleibt es auch für den eigenen Tank bei der Interpolation.
    const selfPrediction=this.spectatorId?null:this.selfPredictor?.sample()??null;
    for(const view of this.playerViews.values()){
      const age=clamp((now-view.snapshotAt)/1000,0,.09);
      const own=view.isSelf?selfPrediction:null;
      const predicted=own
        ?{x:own.position.x,y:own.position.y}
        :{x:view.target.x+view.velocity.x*age,y:view.target.y+view.velocity.y*age};
      const factor=1-Math.exp(-(own?PREDICTED_SELF_RESPONSE:view.isSelf?42:24)*delta);
      view.current.x+=(predicted.x-view.current.x)*factor;
      view.current.y+=(predicted.y-view.current.y)*factor;
      if(view.isSelf&&this.showCrosshair){
        // Der eigene Turm folgt der Maus SOFORT. Auf das Server-Echo zu warten
        // (halbe Rundlaufzeit + Interpolation) macht das Zielen schwammig –
        // der Server bleibt trotzdem autoritativ dafür, wohin geschossen wird.
        const aim=this.screenPointToWorldAim(this.pointer);
        if(Math.hypot(aim.x,aim.y)>4)view.angle=Math.atan2(aim.y,aim.x);
      }else{
        view.angle=angleLerp(view.angle,view.targetAngle,1-Math.exp(-28*delta));
      }
      // Feder zurück in die Ruhelage – unterkritisch gedämpft, damit das Rohr
      // kurz zurückgeht und danach federnd wieder vorschwingt.
      if(stepRecoil(view.recoil,delta))view.barrels.position.x=-view.recoil.offset*RECOIL_BARREL;
      view.root.position.set(
        view.current.x-view.recoilDirection.x*view.recoil.offset*RECOIL_BODY,
        view.current.y-view.recoilDirection.y*view.recoil.offset*RECOIL_BODY
      );
      view.rotating.rotation=view.angle;
      view.shield.alpha=view.snapshot.invulnerable?.45+Math.sin(this.time*8)*.16:0;
      view.flash.alpha=view.flashUntil>now?.62*((view.flashUntil-now)/130):0;
    }
    this.updateMotion(this.projectileViews,delta,now,46,.085);
    this.updateMotion(this.droneViews,delta,now,30,.09);
    this.shakeAmplitude*=Math.exp(-6.5*delta);
    if(this.shakeAmplitude<.15)this.shakeAmplitude=0;
    if(camera){
      this.scale=this.viewport.height/this.worldView.height;
      this.world.scale.set(this.scale);
      const shakeX=(Math.random()-.5)*2*this.shakeAmplitude;
      const shakeY=(Math.random()-.5)*2*this.shakeAmplitude;
      this.world.position.set(this.viewport.x+this.viewport.width/2+shakeX,this.viewport.y+this.viewport.height/2+shakeY);
      this.world.pivot.set(camera.current.x,camera.current.y);
    }
    this.checkPixelRatio(delta);
    this.emitOverchargeSparks(delta);
    stepVerglimmende(this.verglimmende,delta);
    this.drawDynamic(now);
    this.particles.update(delta);
    this.particles.draw();
    this.numbers.update(delta);
    this.drawRings(delta);
    this.drawCrosshair();
  }

  /**
   * Schuss-Feedback: Das Rohr bekommt einen Federstoß nach hinten, der Tank
   * einen angedeuteten Ruck, und am Rohrende sitzt kurz ein Mündungsblitz.
   * Rein visuell – Flugbahn und Schaden kommen unverändert vom Server.
   */
  private fireRecoil(view:PlayerView,direction:Vector2,projectile:ProjectileSnapshot):void{
    if(direction.x===0&&direction.y===0)return;
    startRecoil(view.recoil);
    view.recoilDirection=direction;
    if(this.muzzleBlips.length>=MAX_MUZZLE_BLIPS)this.muzzleBlips.shift();
    const distance=GAME.playerRadius+12;
    this.muzzleBlips.push({
      x:view.current.x+direction.x*distance,
      y:view.current.y+direction.y*distance,
      angle:Math.atan2(direction.y,direction.x),
      radius:Math.max(3.5,projectile.radius*1.35),
      life:MUZZLE_BLIP_SECONDS,
      maxLife:MUZZLE_BLIP_SECONDS,
      color:this.ownerColor(projectile.ownerId)
    });
  }

  /** Kurzer, gedämpfter Kamera-Impuls (eigener Schaden, Kills, Tod). */
  shake(strength:number):void{this.shakeAmplitude=Math.min(9,Math.max(this.shakeAmplitude,strength))}

  /**
   * Overcharge fühlbar machen: Geschosse in der aktiven Zone sprühen Funken.
   * Die Rate ist zeitbasiert gedeckelt, damit der Partikel-Pool auch bei sehr
   * vielen Projektilen nicht überläuft und die Bildrate stabil bleibt.
   */
  private emitOverchargeSparks(delta:number):void{
    const event=this.arenaEvent;
    // Was sichtbar ist, hängt an der Kamera – beim Zuschauen also am beobachteten Tank.
    const self=(this.spectatorId?this.playerViews.get(this.spectatorId):undefined)
      ??(this.selfId?this.playerViews.get(this.selfId):undefined);
    if(!this.settings.glow||!event||event.kind!=='overcharge'||event.phase!=='active'||!self){this.sparkBudget=0;return}
    // Ohne frische Snapshots (Verbindungsverlust) friert der Weltzustand ein –
    // dann dürfen auch die Funken nicht endlos weitersprühen.
    if(performance.now()-this.lastSnapshotAt>2000){this.sparkBudget=0;return}
    const radiusSquared=event.radius**2;
    const inZone:Vector2[]=[];
    for(const view of this.projectileViews.values()){
      const dx=view.current.x-event.center.x,dy=view.current.y-event.center.y;
      if(dx*dx+dy*dy>radiusSquared)continue;
      if(!this.wellInsideView(view.current,self.current))continue;
      inZone.push(view.current);
    }
    if(inZone.length===0){this.sparkBudget=0;return}
    // Rückstand deckeln, damit ein Frame-Hänger keinen Funken-Schwall auslöst.
    this.sparkBudget=Math.min(OVERCHARGE_SPARKS_PER_SECOND*.25,this.sparkBudget+delta*OVERCHARGE_SPARKS_PER_SECOND);
    const style=arenaEventStyle('overcharge');
    while(this.sparkBudget>=1){
      this.sparkBudget-=1;
      const origin=inZone[Math.floor(Math.random()*inZone.length)];
      if(!origin)break;
      this.particles.burst(origin,Math.random()<.5?style.ring:style.core,1,70,.16);
    }
  }

  private drawRings(delta:number):void{
    this.fx.clear();
    for(let index=this.rings.length-1;index>=0;index-=1){
      const ring=this.rings[index];
      if(!ring)continue;
      ring.life-=delta;
      if(ring.life<=0){this.rings.splice(index,1);continue;}
      const progress=1-ring.life/ring.maxLife;
      const eased=1-Math.pow(1-progress,2.4);
      this.fx.circle(ring.position.x,ring.position.y,ring.maxRadius*eased)
        .stroke({color:ring.color,alpha:(1-progress)*.75,width:ring.width*(1-progress*.5)});
    }
    this.drawWallFlashes(delta);
    if(this.settings.glow)this.drawMuzzleBlips(delta);
    else this.muzzleBlips.length=0;
  }

  /** Kurzer heller Fleck am Rohrende, quer zur Schussrichtung gestreckt. */
  private drawMuzzleBlips(delta:number):void{
    for(let index=this.muzzleBlips.length-1;index>=0;index-=1){
      const blip=this.muzzleBlips[index];
      if(!blip)continue;
      blip.life-=delta;
      if(blip.life<=0){this.muzzleBlips.splice(index,1);continue;}
      const fade=blip.life/blip.maxLife;
      const reach=blip.radius*(1.4+(1-fade)*1.4);
      const tip={x:blip.x+Math.cos(blip.angle)*reach,y:blip.y+Math.sin(blip.angle)*reach};
      this.fx.moveTo(blip.x,blip.y).lineTo(tip.x,tip.y)
        .stroke({color:blip.color,alpha:fade*.5,width:blip.radius*1.1});
      this.fx.circle(blip.x,blip.y,blip.radius*(.7+fade*.5))
        .fill({color:0xffffff,alpha:fade*.55});
    }
  }

  /** Öffnen: Umriss dehnt sich nach außen. Schließen: Umriss zieht sich auf die Wand zusammen. */
  private drawWallFlashes(delta:number):void{
    if(this.wallFlashes.length===0)return;
    const style=arenaEventStyle('fracture');
    for(let index=this.wallFlashes.length-1;index>=0;index-=1){
      const flash=this.wallFlashes[index];
      if(!flash)continue;
      flash.life-=delta;
      if(flash.life<=0){this.wallFlashes.splice(index,1);continue;}
      const progress=1-flash.life/flash.maxLife;
      const spread=flash.closing?(1-progress)*18:progress*15;
      const fade=1-progress;
      this.fx.roundRect(flash.x-spread,flash.y-spread,flash.width+spread*2,flash.height+spread*2,10)
        .stroke({color:style.ring,alpha:fade*(flash.closing?.8:.95),width:flash.closing?2.5:3});
      this.fx.roundRect(flash.x,flash.y,flash.width,flash.height,10)
        .stroke({color:style.core,alpha:fade*.5,width:1.5});
    }
  }

  private updateMotion<T>(views:Map<string,MotionView<T>>,delta:number,now:number,response:number,maxAge:number):void{
    const factor=1-Math.exp(-response*delta);
    for(const view of views.values()){
      const age=clamp((now-view.snapshotAt)/1000,0,maxAge);
      const predicted={x:view.target.x+view.velocity.x*age,y:view.target.y+view.velocity.y*age};
      view.current.x+=(predicted.x-view.current.x)*factor;
      view.current.y+=(predicted.y-view.current.y)*factor;
    }
  }

  /**
   * Koppelt die Canvas-Größe an den WIRKLICH sichtbaren Ausschnitt.
   * window.innerHeight lügt auf iOS: Mit ein- oder ausgeblendeten
   * Safari-Leisten meldet es den Layout-Viewport – dann rutscht die
   * Spielfeldmitte unter den Bildschirmrand. visualViewport ist die Wahrheit.
   */
  /**
   * Weicher Abschluss zwischen Spielfeld und Letterbox-Balken (R2).
   *
   * Bewusst KEIN Rahmenstrich: Genau der hat die „komischen Striche" erzeugt,
   * weil sein Strich zur Hälfte außerhalb der Maske lag. Hier liegen alle
   * Rechtecke vollständig innen (`alignment: 0`) und werden zusätzlich von der
   * Maske beschnitten; die Abstufung ist so fein, dass keine Kante entsteht –
   * der Rand des Sichtfelds wird ruhig dunkler statt abgeschnitten.
   */
  private drawViewportEdge():void{
    const steps=7;
    const depth=Math.max(6,Math.round(Math.min(this.viewport.width,this.viewport.height)*.018));
    const width=Math.max(1,Math.ceil(depth/steps));
    this.viewportEdge.clear();
    for(let index=0;index<steps;index+=1){
      const inset=Math.round(depth*index/steps);
      const boxWidth=this.viewport.width-inset*2;
      const boxHeight=this.viewport.height-inset*2;
      if(boxWidth<=0||boxHeight<=0)break;
      this.viewportEdge
        .rect(this.viewport.x+inset,this.viewport.y+inset,boxWidth,boxHeight)
        .stroke({color:this.palette.outside,alpha:.085,width,alignment:0});
    }
  }

  /** Auflösung: Gerätedichte, gedeckelt von der Qualitätsstufe. */
  private pixelRatio():number{return Math.max(1,Math.min(window.devicePixelRatio||1,this.settings.resolutionCap))}

  /**
   * Sicherheitsnetz für Zoom und Monitorwechsel: Die Medienabfrage auf die
   * Gerätedichte ist der saubere Weg, aber nicht überall zuverlässig (unter
   * Emulation etwa feuert sie nicht). Ein Vergleich zweier Zahlen einmal pro
   * Sekunde kostet nichts und schließt die Lücke.
   */
  private checkPixelRatio(delta:number):void{
    this.ratioCheck-=delta;
    if(this.ratioCheck>0)return;
    this.ratioCheck=1;
    const ratio=window.devicePixelRatio||1;
    if(Math.abs(ratio-this.lastDeviceRatio)<.01)return;
    this.lastDeviceRatio=ratio;
    this.syncSize();
  }

  /**
   * Prüft VOR jedem Zeichnen, ob die Zeichenfläche noch zum sichtbaren Bereich
   * passt – und zieht sie sonst sofort nach.
   *
   * Grund: Sam berichtet Ränder *beim Wechsel* des Vollbildmodus. Die
   * Ereignisse, an denen `syncSize` bisher allein hing (`resize`,
   * `fullscreenchange`, `visualViewport`), kommen nicht überall in derselben
   * Reihenfolge und nicht überall vor dem nächsten Bild. Genau daraus entsteht
   * ein Frame mit alter Geometrie: das Fenster ist schon breit, die Maske noch
   * schmal.
   *
   * Mit dieser Prüfung ist die Reihenfolge egal. **Kein Bild wird mehr mit
   * veralteten Maßen gezeichnet**, weil jedes Bild vorher nachsieht – auch
   * wenn gar kein Ereignis ankommt. Es sind zwei Zahlenvergleiche je Frame;
   * gearbeitet wird nur, wenn sich wirklich etwas geändert hat.
   */
  private ensureSize():void{
    if(!this.initialized)return;
    const vv=window.visualViewport;
    const width=Math.max(1,Math.round(vv?.width??window.innerWidth));
    const height=Math.max(1,Math.round(vv?.height??window.innerHeight));
    if(this.app.screen.width===width&&this.app.screen.height===height)return;
    this.syncSize();
  }

  private syncSize():void{
    const vv=window.visualViewport;
    const width=Math.max(1,Math.round(vv?.width??window.innerWidth));
    const height=Math.max(1,Math.round(vv?.height??window.innerHeight));
    // Zoom, Monitorwechsel und Stufenwechsel ändern die nötige Auflösung. Ohne
    // das bliebe der Renderer auf dem Wert vom Start – nach einem Wechsel auf
    // einen HiDPI-Monitor sähe alles matschig aus, umgekehrt kostet es Leistung.
    const ratio=this.pixelRatio();
    const ratioChanged=Math.abs(this.app.renderer.resolution-ratio)>.01;
    // Die Auflösung gehört als drittes Argument in `resize` – sie nur am
    // Renderer zu setzen ändert die Zeichenfläche nicht mit.
    if(ratioChanged||this.app.screen.width!==width||this.app.screen.height!==height){
      this.app.renderer.resize(width,height,ratio);
    }
    this.resizeViewport();
  }

  /**
   * Letterbox und Weltausschnitt. Die Rechnung selbst liegt in `viewport.ts`
   * und ist dort über eine Matrix aus Fenstergrößen getestet – hier bleibt nur
   * das Übertragen auf Maske, Skalierung und HUD.
   *
   * Zwei Dinge erzeugten hier sichtbare Striche an den Bildschirmrändern:
   * ein gezeichneter Rahmen genau auf der Maskenkante (dessen Strich je zur
   * Hälfte innen und außen lag) und krumme Pixelwerte aus der Zentrierung.
   * Der Rahmen ist ersatzlos weg – die Balken sollen nicht auffallen – und
   * alle Kanten liegen auf ganzen Pixeln.
   */
  private resizeViewport():void{
    const screenWidth=Math.max(1,Math.round(this.app.screen.width||window.innerWidth));
    const screenHeight=Math.max(1,Math.round(this.app.screen.height||window.innerHeight));
    const computed=computeViewport(screenWidth,screenHeight,this.viewMode);
    this.viewport=computed.rect;
    this.worldView=computed.world;
    this.viewportMask.clear().rect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height).fill(0xffffff);
    this.drawViewportEdge();
    // Das HUD hängt sich auf breiten Bildschirmen an diese Werte, damit die
    // Panels am Spielfeld kleben statt im schwarzen Balken zu schweben.
    const root=document.documentElement.style;
    root.setProperty('--view-x',`${this.viewport.x}px`);
    root.setProperty('--view-y',`${this.viewport.y}px`);
  }

  private drawBackground():void{
    this.background.clear().rect(0,0,GAME.worldWidth,GAME.worldHeight).fill(this.palette.background);
    for(let x=0;x<=GAME.worldWidth;x+=80)this.background.moveTo(x,0).lineTo(x,GAME.worldHeight);
    for(let y=0;y<=GAME.worldHeight;y+=80)this.background.moveTo(0,y).lineTo(GAME.worldWidth,y);
    this.background.stroke({color:this.palette.grid,width:1});
    for(let x=0;x<=GAME.worldWidth;x+=400)this.background.moveTo(x,0).lineTo(x,GAME.worldHeight);
    for(let y=0;y<=GAME.worldHeight;y+=400)this.background.moveTo(0,y).lineTo(GAME.worldWidth,y);
    this.background.stroke({color:this.palette.grid,alpha:.85,width:2});
    this.background.rect(14,14,GAME.worldWidth-28,GAME.worldHeight-28).stroke({color:this.palette.border,alpha:.3,width:16});
    this.background.rect(0,0,GAME.worldWidth,GAME.worldHeight).stroke({color:this.palette.border,width:7});
  }

  private drawWalls(snapshot:WorldSnapshot):void{
    this.walls.clear();
    for(const wall of snapshot.walls){
      this.walls.roundRect(wall.x+3,wall.y+4,wall.width,wall.height,10).fill({color:0x000000,alpha:.32});
      this.walls.roundRect(wall.x,wall.y,wall.width,wall.height,10).fill(this.palette.wall).stroke({color:this.palette.wallEdge,width:3});
      this.walls.roundRect(wall.x+4,wall.y+4,wall.width-8,Math.max(4,wall.height*.28),8).fill({color:0xffffff,alpha:.045});
    }
  }

  private drawDynamic(now:number):void{
    const snapshot=this.snapshot;if(!snapshot)return;
    const snapshotAge=clamp((now-this.lastSnapshotAt)/1000,0,.09);
    this.shapes.clear();
    for(const shape of snapshot.shapes){
      const position={x:shape.position.x+shape.velocity.x*snapshotAge,y:shape.position.y+shape.velocity.y*snapshotAge};
      const sides=shape.kind==='square'?4:shape.kind==='triangle'?3:5;
      const color=this.shapeColor(shape);
      this.shapes.poly(translated(polygon(sides,shape.radius,shape.rotation),position)).fill(color).stroke({color:0xffffff,alpha:.12,width:2});
      if(shape.health<shape.maxHealth){
        const width=shape.radius*2;
        this.shapes.roundRect(position.x-width/2,position.y+shape.radius+7,width,4,2).fill({color:0x000000,alpha:.45});
        this.shapes.roundRect(position.x-width/2,position.y+shape.radius+7,width*clamp(shape.health/shape.maxHealth,0,1),4,2).fill(color);
      }
    }
    this.projectiles.clear();
    for(const view of this.projectileViews.values()){
      const color=this.ownerColor(view.snapshot.ownerId);
      const outline=view.snapshot.ownerId===this.selfId?0xe9edff:0xffd5db;
      const speed=Math.hypot(view.velocity.x,view.velocity.y);
      if(speed>60){
        const trail=Math.min(30,speed*.032);
        const tail={x:view.current.x-view.velocity.x/speed*trail,y:view.current.y-view.velocity.y/speed*trail};
        this.projectiles.moveTo(tail.x,tail.y).lineTo(view.current.x,view.current.y).stroke({color,alpha:.3,width:Math.max(2,view.snapshot.radius*.9)});
      }
      this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius+3).fill({color,alpha:.14});
      this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius).fill(color).stroke({color:outline,alpha:.7,width:1.5});
      this.projectiles.circle(view.current.x-view.snapshot.radius*.22,view.current.y-view.snapshot.radius*.22,Math.max(1.2,view.snapshot.radius*.28)).fill({color:0xffffff,alpha:.48});
    }
    // Verglimmende Kugeln in DERSELBEN Ebene wie die lebenden (Sams Punkt 2).
    zeichneVerglimmende(this.projectiles,this.verglimmende);
    // Das Zeichnen selbst liegt in `drone-draw.ts` – als reine Funktion, damit
    // es Tests gibt. Sams Strich-Bug (arc ohne moveTo) konnte nur entstehen,
    // weil keine einzige Client-Testdatei je einen Zeichenaufruf angefasst hat.
    this.drones.clear();
    zeichneDrohnen(this.drones,[...this.droneViews.values()].map(view=>({
      position:view.current,
      velocity:view.velocity,
      angle:view.snapshot.angle,
      // Echte Größe statt Einheitsdreieck (Befund 41): Der Server rechnet mit
      // Radien von 7,5 (Hive) bis 15,5 (Carrier) – gezeichnet wurde immer 13.
      radius:view.snapshot.gameplayRadius??13,
      health:view.snapshot.health,
      maxHealth:view.snapshot.maxHealth,
      color:this.ownerColor(view.snapshot.ownerId)
    })));
  }

  private createPlayerView(player:PlayerSnapshot,isSelf:boolean,now:number):PlayerView{
    const root=new Container();const rotating=new Container();const barrels=new Graphics();const body=new Graphics();const detail=new Graphics();const shield=new Graphics();const flash=new Graphics();
    flash.circle(0,0,26).fill(0xffffff);flash.alpha=0;
    rotating.addChild(barrels,body,detail,flash,shield);root.addChild(rotating);
    const healthBack=new Graphics();const healthFill=new Graphics();const signatureBar=new Graphics();root.addChild(healthBack,healthFill,signatureBar);
    const name=new Text({text:'',style:{fill:this.palette.label,fontSize:12,fontWeight:'600',fontFamily:'Inter, system-ui, sans-serif'}});name.anchor.set(.5);name.position.set(0,-42);root.addChild(name);
    const view:PlayerView={root,rotating,body,barrels,detail,shield,flash,healthBack,healthFill,signatureBar,name,current:{...player.position},target:{...player.position},velocity:{...player.velocity},angle:player.angle,targetAngle:player.angle,snapshot:player,snapshotAt:now,classId:player.playerClass,isSelf,isGuardian:player.id===this.guardianId,flashUntil:0,recoil:{offset:0,velocity:0},recoilDirection:{x:1,y:0}};
    root.position.set(player.position.x,player.position.y);this.redrawPlayer(view,true);return view;
  }

  private redrawPlayer(view:PlayerView,geometry:boolean):void{
    const player=view.snapshot;
    // Der Guardian ist ein neutraler Boss – er trägt Gold statt Gegnerrot.
    const color=view.isGuardian?GUARDIAN_COLOR:view.isSelf?this.palette.self:this.palette.enemy;
    if(geometry){
      view.body.clear();view.barrels.clear();view.detail.clear();
      this.drawClassHull(view.body,view.detail,player.playerClass,color);
      this.drawClassBarrels(view.barrels,player.playerClass,color);
      view.shield.clear().circle(0,0,GAME.playerRadius+9).stroke({color,alpha:.72,width:2});
    }
    view.healthBack.clear().roundRect(-25,31,50,5,3).fill({color:0x000000,alpha:.48});
    view.healthFill.clear().roundRect(-25,31,50*clamp(player.health/Math.max(1,player.maxHealth),0,1),5,3).fill(player.health/player.maxHealth>.35?0x65d39a:0xf05e72);
    // Signature (Klassen 3.0): eine dünne Linie unter dem Lebensbalken – bei
    // JEDEM Tank mit Familienmechanik, nicht nur beim eigenen (Befund 6: der
    // Wert lag für alle längst im Snapshot, die Specter-Tarnung las ihn schon –
    // nur gezeichnet wurde er beim Gegner nie. Dabei ist er dort Information:
    // ein AEGIS kurz vor der Entladung, ein SIEGE in Stellung). Gegner tragen
    // ihre Familienfarbe, der eigene Balken bleibt in der Eigenfarbe.
    // Dieselbe Regel wie im HUD: ohne Familienwort kein Balken – ein namenloser
    // Füllstand am Tank wäre ein Rätsel statt einer Information.
    // Tarnung (SPECTER): Der Fuellstand IST die Sichtbarkeit. Gegner werden bis
    // 85 % ausgeblendet; der eigene Tank bleibt als Schemen (55 %) sichtbar,
    // sonst weiss man nicht, wo man steht. Alle anderen Familien: voll sichtbar.
    // Der Balken hängt am selben Root und verblasst mit – ein getarnter SPECTER
    // verrät sich nicht über seinen eigenen Füllstand.
    const stealth=CLASS_DEFINITIONS[player.playerClass]?.branch==='specter'?(signatureRatio(player.signature)??0):0;
    view.root.alpha=view.isSelf?1-0.55*stealth:1-0.85*stealth;
    const ratio=signatureLabel(player.playerClass)!==null?signatureRatio(player.signature):null;
    view.signatureBar.clear();
    if(ratio!==null){
      view.signatureBar.roundRect(-25,38,50,2,1).fill({color:0x000000,alpha:.42});
      if(ratio>0)view.signatureBar.roundRect(-25,38,50*ratio,2,1).fill(view.isSelf?this.palette.self:signatureColor(player.playerClass)??this.palette.enemy);
    }
    // Sam: „seinen eigenen Namen beim Tank muss man nicht sehen" und „kein
    // Level direkt beim Tank, nur oben rechts im Leaderboard" – das Level
    // (vormals hier, Befund 11) steht dort ohnehin schon (siehe ui.ts). Auch
    // der Bot-Zusatz fällt weg (Sam: Bots sollen nicht erkennbar sein) –
    // Gegner zeigen nur noch ihren Namen, der eigene Tank gar keinen.
    view.name.text=view.isGuardian?GUARDIAN_NAME:view.isSelf?'':player.name;
    view.name.style.fill=view.isGuardian?GUARDIAN_COLOR:view.isSelf?this.palette.label:this.palette.enemy;
    view.name.style.fontSize=view.isGuardian?14:12;
    view.name.style.fontWeight=view.isGuardian?'800':'600';
  }

  /**
   * Die Rohre – seit Sams Punkt 6 (14.08.) aus derselben Quelle wie der Schuss.
   *
   * Vorher zeichnete diese Schleife Mehrlauf-Tanks als PARALLELE Balken,
   * seitlich versetzt (`y = offset * 44`), während der Server sie als
   * Winkelfächer feuerte – Storm zeigte sechs parallele Rohre und feuerte einen
   * 24°-Fächer aus der Mitte. Das Feld `barrels` (Pro-Lauf-Profile, z. B.
   * Flanker mit zwei Rohren nach hinten) las die Zeichnung überhaupt nicht.
   *
   * `laeufeVon` in `shared/barrels.ts` liefert jetzt für beide Seiten dieselben
   * Winkel und dieselbe Mündung. Ein Rohr, das anders aussieht als es schießt,
   * ist danach nicht mehr baubar, ohne diese Datei UND den Server zu ändern.
   */
  private drawClassBarrels(graphics:Graphics,playerClass:PlayerClass,color:number):void{
    const definition=CLASS_DEFINITIONS[playerClass];
    const height=barrelHeightFor(definition,playerClass);
    for(const lauf of laeufeVon(playerClass)){
      const corners:[number,number][]=[[lauf.start,-height/2],[lauf.muendung,-height/2],[lauf.muendung,height/2],[lauf.start,height/2]];
      const points:number[]=[];
      for(const[x,y]of corners){
        points.push(x*Math.cos(lauf.winkel)-y*Math.sin(lauf.winkel),x*Math.sin(lauf.winkel)+y*Math.cos(lauf.winkel));
      }
      graphics.poly(points).fill(this.palette.barrel).stroke({color,alpha:.36,width:2});
    }
  }

  /**
   * Rumpf aus der geteilten Geometrie (shared/appearance) – dieselben Befehle
   * zeichnet die Wahlkarten-Vorschau als SVG. Wenn hier etwas anders aussieht
   * als auf der Karte, ist das ein Bug und kein Stilmittel.
   */
  private drawClassHull(body:Graphics,detail:Graphics,playerClass:PlayerClass,color:number):void{
    const outline={color:0xffffff,alpha:.38,width:3};
    for(const op of hullGeometry(playerClass)){
      switch(op.role){
        case'hull':
          if(op.kind==='poly')body.poly(op.points).fill(color).stroke(outline);
          else body.circle(op.x,op.y,op.r).fill(color).stroke(outline);
          break;
        case'armor':
          if(op.kind==='poly')detail.poly(op.points).fill({color,alpha:.82}).stroke({color:0xffffff,alpha:.16,width:1.5});
          else detail.circle(op.x,op.y,op.r).fill({color,alpha:.82}).stroke({color:0xffffff,alpha:.16,width:1.5});
          break;
        case'accent':
          if(op.kind==='ring')detail.circle(op.x,op.y,op.r).stroke({color:0xffffff,alpha:.3,width:2});
          else if(op.kind==='poly')detail.poly(op.points).fill({color:0xffffff,alpha:.2});
          else detail.circle(op.x,op.y,op.r).fill({color:0xffffff,alpha:.22});
          break;
        case'void':
          if(op.kind==='poly')detail.poly(op.points).fill({color:0x000000,alpha:.34});
          else detail.circle(op.x,op.y,op.r).fill({color:0x000000,alpha:.34});
          break;
        case'crown':
          // Der Apex-Ring: gestrichelt kann Pixi Graphics nicht ohne Umweg –
          // ein doppelter feiner Ring liest sich als dieselbe Krone.
          if(op.kind!=='poly'){
            detail.circle(op.x,op.y,op.r).stroke({color,alpha:.55,width:2});
            detail.circle(op.x,op.y,op.r-3).stroke({color,alpha:.3,width:1});
          }
          break;
      }
    }
  }

  private drawNodes(graphics:Graphics,count:number,radius:number,nodeRadius:number,color:number):void{
    for(let index=0;index<count;index+=1){
      const angle=index*Math.PI*2/count;
      graphics.circle(Math.cos(angle)*radius,Math.sin(angle)*radius,nodeRadius)
        .fill({color:0xffffff,alpha:.34})
        .stroke({color,alpha:.6,width:1});
    }
  }

  private drawCrosshair():void{
    this.crosshair.clear();if(!this.showCrosshair)return;
    const radius=this.primary||this.secondary?12:10;const color=this.palette.self;
    const x=clamp(this.pointer.x,this.viewport.x+8,this.viewport.x+this.viewport.width-8);
    const y=clamp(this.pointer.y,this.viewport.y+8,this.viewport.y+this.viewport.height-8);
    this.crosshair.circle(x,y,2).fill({color,alpha:.9});
    this.crosshair.circle(x,y,radius).stroke({color,alpha:.55,width:1.5});
    // Hitmarker (Befund 1): vier kurze helle Striche für 90 ms nach einem
    // bestätigten eigenen Treffer – die Antwort auf „treffe ich überhaupt?"
    // direkt dort, wo der Blick liegt.
    if(performance.now()<this.hitmarkerUntil){
      for(const[dx,dy]of[[1,1],[1,-1],[-1,1],[-1,-1]] as const){
        this.crosshair.moveTo(x+dx*(radius+2),y+dy*(radius+2)).lineTo(x+dx*(radius+7),y+dy*(radius+7)).stroke({color:0xffffff,alpha:.9,width:2});
      }
    }
  }

  private ownerColor(ownerId:string):number{return ownerId===this.guardianId?GUARDIAN_COLOR:ownerId===this.selfId?this.palette.self:this.palette.enemy}
  private shapeColor(shape:ShapeSnapshot):number{return shape.kind==='square'?this.palette.square:shape.kind==='triangle'?this.palette.triangle:this.palette.pentagon}
}
