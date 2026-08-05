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
  type ShapeSnapshot,
  type Vector2,
  type Wall,
  type WorldSnapshot
} from '@project-maze/shared';
import type { ArenaEventSnapshot } from '@project-maze/shared/gameplay';
import { GUARDIAN_COLOR, GUARDIAN_NAME, arenaEventStyle } from './arena-event-style';
import { ParticleField } from './particles';
import { type RecoilState, startRecoil, stepRecoil } from './recoil';
import type { RenderQuality } from './perf-metrics';
import { signatureLabel, signatureRatio } from './signature';
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
  midnight:{background:0x080a11,outside:0x04050a,grid:0x11141c,border:0x2a2f3c,wall:0x191d27,wallEdge:0x2b313d,self:0x6f7ad6,enemy:0xc4626f,barrel:0x9aa1b2,projectile:0xdfe4f0,drone:0x5c8b84,square:0x565f85,triangle:0x877a60,pentagon:0x7d6379,label:0xd6dae6},
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
  private time=0;
  private wallsSignature='';
  private knownShapes=new Map<string,ShapeSnapshot>();
  private knownEliteIds=new Set<string>();
  private hadArenaEvent=false;
  private suppressShapeRewardsUntil=0;
  private initialized=false;
  /**
   * Welcher der drei Grafikwege tatsächlich hochgekommen ist. Die Perf-
   * Telemetrie meldet ihn als `quality`; `webgl-kompat` ist per Definition
   * der „alte PC".
   */
  quality:RenderQuality='unknown';
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
  private readonly wallFlashes:WallFlash[]=[];
  private readonly muzzleBlips:MuzzleBlip[]=[];

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

  async init(root:HTMLElement):Promise<void>{
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
      {label:'webgl',possible:webgl,options:{...base,preference:'webgl',antialias:true,resolution:Math.min(devicePixelRatio||1,2)}},
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
    this.app.stage.addChild(this.world,this.viewportMask,this.crosshair);
    this.syncSize();
    // iOS meldet neue Maße gern verspätet – deshalb nach jedem Ereignis ein
    // zweiter Abgleich mit kurzem Abstand.
    const resync=():void=>{this.syncSize();window.setTimeout(()=>this.syncSize(),350)};
    window.addEventListener('resize',resync);
    window.addEventListener('orientationchange',resync);
    document.addEventListener('fullscreenchange',resync);
    window.visualViewport?.addEventListener('resize',resync);
    window.visualViewport?.addEventListener('scroll',resync);
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
    const extended=snapshot as WorldSnapshot&{arenaEvent?:ArenaEventSnapshot|null;arenaGuardianId?:string|null;spectatorTargetId?:string|null};
    this.arenaEvent=extended.arenaEvent??null;
    this.spectatorId=extended.spectatorTargetId??null;
    const guardianId=extended.arenaGuardianId??null;
    const guardianChanged=guardianId!==this.guardianId;
    this.guardianId=guardianId;
    this.syncPlayers(snapshot,now);
    this.syncProjectiles(snapshot,now);
    this.syncDrones(snapshot,now);
    this.syncShapeEffects(snapshot);
    if(guardianChanged&&guardianId)this.announceGuardian(guardianId,snapshot);
    const self=snapshot.players.find(player=>player.id===snapshot.selfId);
    this.lastSelfPosition=self?{...self.position}:null;
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
      for(const[id,wall]of this.knownWalls){
        if(!next.has(id)&&this.wallWellInsideView(wall,self.position))this.flashWall(wall,false);
      }
      for(const[id,wall]of next){
        if(!this.knownWalls.has(id)&&this.wallWellInsideView(wall,self.position))this.flashWall(wall,true);
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
    if(self&&this.wellInsideView(position,self.position))this.shake(4);
  }

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
        const amount=Math.round(previous.health-player.health);
        if(amount>=1)this.numbers.spawn({x:view.current.x,y:view.current.y-26},`-${amount}`,isSelf?0xff8091:0xffe9b0,isSelf?14:12);
      }
      if(player.dead&&!previous.dead){
        const color=this.ownerColor(player.id);
        this.particles.burst(view.current,color,24,320,.55);
        this.rings.push({position:{...view.current},life:.5,maxLife:.5,maxRadius:86,color,width:4});
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
    for(const id of this.projectileViews.keys())if(!active.has(id))this.projectileViews.delete(id);
  }

  private syncDrones(snapshot:WorldSnapshot,now:number):void{
    const active=new Set<string>();
    for(const drone of snapshot.drones){
      active.add(drone.id);
      const existing=this.droneViews.get(drone.id);
      if(!existing){
        this.droneViews.set(drone.id,{current:{...drone.position},target:{...drone.position},velocity:{...drone.velocity},snapshot:drone,snapshotAt:now});
        continue;
      }
      const displacement=Math.hypot(drone.position.x-existing.target.x,drone.position.y-existing.target.y);
      if(displacement>240)existing.current={...drone.position};
      existing.target={...drone.position};
      existing.velocity={...drone.velocity};
      existing.snapshot=drone;
      existing.snapshotAt=now;
    }
    for(const id of this.droneViews.keys())if(!active.has(id))this.droneViews.delete(id);
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
      if(!current&&!suppressed&&self&&this.wellInsideView(previous.position,self.position)){
        const elite=previousElites.has(id);
        this.particles.burst(previous.position,elite?0xf4c866:this.shapeColor(previous),elite?22:10,elite?260:170,elite?.55:.38);
        if(elite)this.rings.push({position:{...previous.position},life:.55,maxLife:.55,maxRadius:110,color:0xf4c866,width:4});
        const reward=SHAPE_REWARDS[previous.kind]??0;
        if(reward>0)this.numbers.spawn(previous.position,`+${elite?reward+260:reward}`,0xf3c45f,elite?15:12);
      }
    }
    this.knownShapes=shapes;
  }

  /** Deutlich innerhalb des Server-Cull-Rechtecks – Despawns an der Sichtkante zählen nicht als Kill. */
  private wellInsideView(position:Vector2,center:Vector2):boolean{
    return Math.abs(position.x-center.x)<=GAME.visibleWorldWidth/2-60&&Math.abs(position.y-center.y)<=GAME.visibleWorldHeight/2-60;
  }

  private render(delta:number):void{
    this.time+=delta;
    const now=performance.now();
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;
    // Beim Zuschauen hängt die Kamera am beobachteten Spieler; `selfId` bleibt
    // unverändert, damit HUD, Death-Screen und Respawn weiter den eigenen Tank meinen.
    const camera=(this.spectatorId?this.playerViews.get(this.spectatorId):undefined)??self;
    for(const view of this.playerViews.values()){
      const age=clamp((now-view.snapshotAt)/1000,0,.09);
      const predicted={x:view.target.x+view.velocity.x*age,y:view.target.y+view.velocity.y*age};
      const factor=1-Math.exp(-(view.isSelf?42:24)*delta);
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
      this.scale=this.viewport.height/GAME.visibleWorldHeight;
      this.world.scale.set(this.scale);
      const shakeX=(Math.random()-.5)*2*this.shakeAmplitude;
      const shakeY=(Math.random()-.5)*2*this.shakeAmplitude;
      this.world.position.set(this.viewport.x+this.viewport.width/2+shakeX,this.viewport.y+this.viewport.height/2+shakeY);
      this.world.pivot.set(camera.current.x,camera.current.y);
    }
    this.emitOverchargeSparks(delta);
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
    if(!event||event.kind!=='overcharge'||event.phase!=='active'||!self){this.sparkBudget=0;return}
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
    this.drawMuzzleBlips(delta);
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
  private syncSize():void{
    const vv=window.visualViewport;
    const width=Math.max(1,Math.round(vv?.width??window.innerWidth));
    const height=Math.max(1,Math.round(vv?.height??window.innerHeight));
    if(this.app.screen.width!==width||this.app.screen.height!==height)this.app.renderer.resize(width,height);
    this.resizeViewport();
  }

  /**
   * Letterbox für das feste 16:9-Sichtfeld.
   *
   * Zwei Dinge erzeugten hier sichtbare Striche an den Bildschirmrändern:
   * ein gezeichneter Rahmen genau auf der Maskenkante (dessen Strich je zur
   * Hälfte innen und außen lag) und krumme Pixelwerte aus der Zentrierung.
   * Der Rahmen ist ersatzlos weg – die Balken sollen nicht auffallen – und
   * alle Kanten liegen jetzt auf ganzen Pixeln.
   */
  private resizeViewport():void{
    const screenWidth=Math.max(1,Math.round(this.app.screen.width||window.innerWidth));
    const screenHeight=Math.max(1,Math.round(this.app.screen.height||window.innerHeight));
    const width=Math.max(1,Math.floor(Math.min(screenWidth,screenHeight*16/9)));
    const height=Math.max(1,Math.floor(width*9/16));
    this.viewport={
      x:Math.floor((screenWidth-width)/2),
      y:Math.floor((screenHeight-height)/2),
      width,
      height
    };
    this.viewportMask.clear().rect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height).fill(0xffffff);
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
    this.drones.clear();
    for(const view of this.droneViews.values()){
      const color=this.ownerColor(view.snapshot.ownerId);
      const angle=Math.atan2(view.velocity.y,view.velocity.x)||view.snapshot.angle;
      const speed=Math.hypot(view.velocity.x,view.velocity.y);
      if(speed>90)this.drones.moveTo(view.current.x-view.velocity.x/speed*16,view.current.y-view.velocity.y/speed*16).lineTo(view.current.x,view.current.y).stroke({color,alpha:.2,width:3});
      this.drones.poly(translated(polygon(3,13,angle),view.current)).fill(color).stroke({color:0xffffff,alpha:.3,width:2});
    }
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
    // Signature (Klassen 3.0): eine dünne Linie unter dem Lebensbalken – nur
    // beim eigenen Tank, und nur wenn der Server die Mechanik überhaupt
    // meldet. Sie liegt dort, wohin man im Gefecht ohnehin schaut; wie sie
    // heißt, steht im HUD.
    // Dieselbe Regel wie im HUD: ohne Familienwort kein Balken – ein namenloser
    // Füllstand am Tank wäre ein Rätsel statt einer Information.
    const ratio=view.isSelf&&signatureLabel(player.playerClass)!==null?signatureRatio(player.signature):null;
    view.signatureBar.clear();
    if(ratio!==null){
      view.signatureBar.roundRect(-25,38,50,2,1).fill({color:0x000000,alpha:.42});
      if(ratio>0)view.signatureBar.roundRect(-25,38,50*ratio,2,1).fill(this.palette.self);
    }
    view.name.text=view.isGuardian?GUARDIAN_NAME:`${player.name}${player.isBot?' · BOT':''}`;
    view.name.style.fill=view.isGuardian?GUARDIAN_COLOR:view.isSelf?this.palette.label:this.palette.enemy;
    view.name.style.fontSize=view.isGuardian?14:12;
    view.name.style.fontWeight=view.isGuardian?'800':'600';
  }

  private drawClassBarrels(graphics:Graphics,playerClass:PlayerClass,color:number):void{
    const definition=CLASS_DEFINITIONS[playerClass];
    if(definition.barrelCount<=0)return;
    const precision=definition.branch==='precision';
    const impact=definition.branch==='impact';
    const height=precision?12:impact?16:14;
    if(definition.barrelAngles){
      for(const angle of definition.barrelAngles){
        const start=impact?1:4;
        const corners:[number,number][]=[[start,-height/2],[start+definition.barrelLength,-height/2],[start+definition.barrelLength,height/2],[start,height/2]];
        const points:number[]=[];
        for(const[x,y]of corners){
          points.push(x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle));
        }
        graphics.poly(points).fill(this.palette.barrel).stroke({color,alpha:.36,width:2});
      }
      return;
    }
    for(let index=0;index<definition.barrelCount;index+=1){
      const offset=definition.barrelCount===1?0:(index/(definition.barrelCount-1)-.5)*definition.barrelSpread;
      const y=offset*44;
      const start=impact?1:4;
      graphics.roundRect(start,y-height/2,definition.barrelLength,height,precision?3:4)
        .fill(this.palette.barrel)
        .stroke({color,alpha:.36,width:2});
    }
  }

  private drawClassHull(body:Graphics,detail:Graphics,playerClass:PlayerClass,color:number):void{
    const outline={color:0xffffff,alpha:.38,width:3};
    const subtle={color:0xffffff,alpha:.22,width:2};
    switch(playerClass){
      case'core':
        body.circle(0,0,22).fill(color).stroke(outline);
        detail.circle(0,0,6).stroke({color:0xffffff,alpha:.24,width:2});
        break;
      case'rapid':
        body.circle(0,0,21).fill(color).stroke(outline);
        detail.poly([-18,-8,-27,0,-18,8]).fill({color,alpha:.78});
        detail.circle(0,0,5).fill({color:0xffffff,alpha:.18});
        break;
      case'twin':
        body.circle(0,0,22).fill(color).stroke(outline);
        detail.circle(-16,-12,4).fill({color:0xffffff,alpha:.2});
        detail.circle(-16,12,4).fill({color:0xffffff,alpha:.2});
        break;
      case'repeater':
        body.poly(polygon(6,22,Math.PI/6)).fill(color).stroke(outline);
        detail.circle(0,0,8).stroke({color:0xffffff,alpha:.28,width:2});
        detail.rect(-19,-3,8,6).fill({color:0xffffff,alpha:.18});
        break;
      case'storm':
        body.circle(0,0,23).fill(color).stroke(outline);
        detail.circle(0,0,17).stroke(subtle);
        this.drawNodes(detail,4,17,3,color);
        break;
      case'gatling':
        body.poly(polygon(6,23,Math.PI/6)).fill(color).stroke(outline);
        detail.circle(0,0,10).stroke({color:0xffffff,alpha:.3,width:3});
        this.drawNodes(detail,6,17,2.6,color);
        break;
      case'sniper':
        body.circle(0,0,21).fill(color).stroke(outline);
        detail.poly([-17,-9,-27,0,-17,9]).fill({color:0xffffff,alpha:.17});
        detail.rect(5,-4,14,8).fill({color:0xffffff,alpha:.16});
        break;
      case'railgun':
        body.poly(polygon(6,21,Math.PI/6)).fill(color).stroke(outline);
        detail.rect(-13,-4,29,8).fill({color:0xffffff,alpha:.18});
        detail.circle(-9,0,4).fill({color:0xffffff,alpha:.3});
        break;
      case'hunter':
        body.circle(0,0,21).fill(color).stroke(outline);
        detail.poly([-11,-19,4,-13,-4,-6]).fill({color:0xffffff,alpha:.18});
        detail.poly([-11,19,4,13,-4,6]).fill({color:0xffffff,alpha:.18});
        break;
      case'lancer':
        body.poly(polygon(4,23,Math.PI/4)).fill(color).stroke(outline);
        detail.rect(-12,-3,29,6).fill({color:0xffffff,alpha:.22});
        detail.circle(-10,0,4).fill({color:0xffffff,alpha:.32});
        break;
      case'phantom':
        body.poly(polygon(6,21,0)).fill(color).stroke(outline);
        detail.circle(0,0,25).stroke({color,alpha:.42,width:2});
        detail.poly([-16,-9,-25,0,-16,9]).fill({color:0xffffff,alpha:.16});
        break;
      case'drone':
        body.circle(0,0,22).fill(color).stroke(outline);
        detail.poly(polygon(3,10,0)).fill({color:0xffffff,alpha:.28});
        detail.circle(0,0,16).stroke(subtle);
        break;
      case'warden':
        body.circle(0,0,22).fill(color).stroke(outline);
        detail.circle(0,0,17).stroke({color:0xffffff,alpha:.26,width:2});
        this.drawNodes(detail,6,18,3,color);
        break;
      case'factory':
        body.roundRect(-21,-21,42,42,8).fill(color).stroke(outline);
        detail.roundRect(-9,-9,18,18,4).stroke({color:0xffffff,alpha:.3,width:2});
        detail.rect(-20,-4,8,8).fill({color:0xffffff,alpha:.18});
        break;
      case'overseer':
        body.circle(0,0,23).fill(color).stroke(outline);
        detail.circle(0,0,18).stroke({color:0xffffff,alpha:.3,width:2});
        this.drawNodes(detail,8,19,2.7,color);
        break;
      case'carrier':
        body.poly(polygon(6,25,Math.PI/6)).fill(color).stroke(outline);
        detail.circle(0,0,11).fill({color:0xffffff,alpha:.14}).stroke({color:0xffffff,alpha:.28,width:2});
        this.drawNodes(detail,6,20,3.4,color);
        break;
      case'rammer':
        body.poly(polygon(8,23,Math.PI/8)).fill(color).stroke(outline);
        detail.roundRect(14,-13,9,26,3).fill({color:0xffffff,alpha:.24});
        break;
      case'crusher':
        body.poly(polygon(8,24,Math.PI/8)).fill(color).stroke(outline);
        detail.roundRect(12,-16,11,32,3).fill({color:0xffffff,alpha:.25});
        detail.rect(-18,-3,10,6).fill({color:0xffffff,alpha:.16});
        break;
      case'bulwark':
        body.roundRect(-23,-21,46,42,8).fill(color).stroke(outline);
        detail.roundRect(13,-17,11,34,4).fill({color:0xffffff,alpha:.26});
        detail.circle(-8,0,7).stroke(subtle);
        break;
      case'juggernaut':
        body.poly(polygon(8,26,Math.PI/8)).fill(color).stroke(outline);
        detail.poly(polygon(8,19,Math.PI/8)).stroke({color:0xffffff,alpha:.24,width:2});
        detail.roundRect(14,-17,11,34,3).fill({color:0xffffff,alpha:.28});
        break;
      case'fortress':
        body.roundRect(-26,-23,52,46,7).fill(color).stroke(outline);
        detail.roundRect(-21,-18,42,36,6).stroke({color:0xffffff,alpha:.24,width:2});
        detail.roundRect(14,-19,13,38,3).fill({color:0xffffff,alpha:.3});
        detail.circle(-8,0,6).fill({color:0xffffff,alpha:.16});
        break;
      case'flanker':
        body.circle(0,0,21).fill(color).stroke(outline);
        detail.poly([14,-7,22,0,14,7]).fill({color:0xffffff,alpha:.2});
        detail.poly([-14,-7,-22,0,-14,7]).fill({color:0xffffff,alpha:.2});
        break;
      case'octo':
        body.poly(polygon(8,23,Math.PI/8)).fill(color).stroke(outline);
        detail.circle(0,0,9).stroke({color:0xffffff,alpha:.3,width:2});
        this.drawNodes(detail,8,16,2.4,color);
        break;
      case'arbalest':
        body.poly(polygon(6,21,Math.PI/6)).fill(color).stroke(outline);
        detail.rect(-14,-8,26,4).fill({color:0xffffff,alpha:.2});
        detail.rect(-14,4,26,4).fill({color:0xffffff,alpha:.2});
        break;
      case'deadeye':
        body.poly(polygon(6,21,0)).fill(color).stroke(outline);
        detail.circle(0,0,10).stroke({color:0xffffff,alpha:.32,width:2});
        detail.moveTo(-14,0).lineTo(14,0).stroke({color:0xffffff,alpha:.26,width:2});
        detail.moveTo(0,-14).lineTo(0,14).stroke({color:0xffffff,alpha:.26,width:2});
        break;
      case'guardian':
        body.circle(0,0,22).fill(color).stroke(outline);
        detail.circle(0,0,15).stroke({color:0xffffff,alpha:.34,width:4});
        this.drawNodes(detail,5,17,3.2,color);
        break;
      case'hive':
        body.poly(polygon(6,23,Math.PI/6)).fill(color).stroke(outline);
        this.drawNodes(detail,6,13,3,color);
        detail.circle(0,0,4).fill({color:0xffffff,alpha:.3});
        this.drawNodes(detail,10,19,1.8,color);
        break;
      case'blitz':
        body.poly([24,0,-14,-17,-7,0,-14,17]).fill(color).stroke(outline);
        detail.poly([10,0,-8,-8,-4,0,-8,8]).fill({color:0xffffff,alpha:.22});
        break;
      case'comet':
        body.circle(4,0,19).fill(color).stroke(outline);
        body.poly([-2,-16,-26,0,-2,16]).fill({color,alpha:.85}).stroke({color:0xffffff,alpha:.2,width:2});
        detail.circle(8,0,7).fill({color:0xffffff,alpha:.24});
        detail.poly([-6,-8,-18,0,-6,8]).fill({color:0xffffff,alpha:.14});
        break;
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
  }

  private ownerColor(ownerId:string):number{return ownerId===this.guardianId?GUARDIAN_COLOR:ownerId===this.selfId?this.palette.self:this.palette.enemy}
  private shapeColor(shape:ShapeSnapshot):number{return shape.kind==='square'?this.palette.square:shape.kind==='triangle'?this.palette.triangle:this.palette.pentagon}
}
