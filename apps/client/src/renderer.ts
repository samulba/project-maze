import { Application, Container, Graphics, Text } from 'pixi.js';
import {
  CLASS_DEFINITIONS,
  GAME,
  type DroneSnapshot,
  type PlayerClass,
  type PlayerSnapshot,
  type ProjectileSnapshot,
  type ShapeSnapshot,
  type ThemeId,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import { ParticleField } from './particles';

interface Palette {
  background:number; outside:number; grid:number; border:number; wall:number; wallEdge:number;
  self:number; enemy:number; barrel:number; projectile:number; drone:number;
  square:number; triangle:number; pentagon:number; label:number;
}
const PALETTES:Record<ThemeId,Palette>={
  midnight:{background:0x070910,outside:0x020307,grid:0x151a28,border:0x3d4661,wall:0x222839,wallEdge:0x3f4964,self:0x7d88ff,enemy:0xe7677b,barrel:0xc4cad9,projectile:0xf5f7ff,drone:0x78d7c7,square:0x6574dd,triangle:0xe6a954,pentagon:0xcf6eb5,label:0xe9ecf5},
  void:{background:0x030407,outside:0x000000,grid:0x111317,border:0x31343b,wall:0x181b20,wallEdge:0x343942,self:0xb8ff6a,enemy:0xff5c76,barrel:0xdde2e8,projectile:0xffffff,drone:0x65e7c2,square:0x6b7c8f,triangle:0xffb84d,pentagon:0xc77dff,label:0xf1f3f5},
  classic:{background:0xe8ebf0,outside:0xcbd0da,grid:0xd5d9e1,border:0x818a9b,wall:0xaab1bf,wallEdge:0x7e8798,self:0x536dfe,enemy:0xf14e63,barrel:0x727b8d,projectile:0x343a46,drone:0x2ba887,square:0x6f7ee8,triangle:0xe5a044,pentagon:0xbd5c9d,label:0x252a34}
};

interface PlayerView {
  root:Container; rotating:Container; body:Graphics; barrels:Graphics; detail:Graphics;
  shield:Graphics; healthBack:Graphics; healthFill:Graphics; name:Text;
  current:Vector2; target:Vector2; velocity:Vector2; angle:number; targetAngle:number;
  snapshot:PlayerSnapshot; snapshotAt:number; classId:PlayerClass; isSelf:boolean;
}
interface MotionView<T> {
  current:Vector2; target:Vector2; velocity:Vector2; snapshot:T; snapshotAt:number;
}

const clamp=(value:number,min:number,max:number):number=>Math.max(min,Math.min(max,value));
const normalize=(value:Vector2):Vector2=>{const length=Math.hypot(value.x,value.y);return length<.001?{x:0,y:0}:{x:value.x/length,y:value.y/length}};
const polygon=(sides:number,radius:number,rotation=0):number[]=>{const points:number[]=[];for(let index=0;index<sides;index+=1){const angle=rotation+index*Math.PI*2/sides;points.push(Math.cos(angle)*radius,Math.sin(angle)*radius)}return points};
const translated=(points:number[],position:Vector2):number[]=>points.map((value,index)=>value+(index%2===0?position.x:position.y));
function angleLerp(current:number,target:number,factor:number):number{let difference=(target-current+Math.PI)%(Math.PI*2)-Math.PI;if(difference<-Math.PI)difference+=Math.PI*2;return current+difference*factor}

export class GameRenderer {
  readonly app=new Application();
  private readonly world=new Container();
  private readonly background=new Graphics();
  private readonly walls=new Graphics();
  private readonly shapes=new Graphics();
  private readonly projectiles=new Graphics();
  private readonly drones=new Graphics();
  private readonly players=new Container();
  private readonly particles=new ParticleField();
  private readonly viewportMask=new Graphics();
  private readonly viewportFrame=new Graphics();
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
  private lastSnapshotAt=performance.now();

  async init(root:HTMLElement):Promise<void>{
    await this.app.init({resizeTo:window,antialias:true,background:this.palette.outside,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});
    root.prepend(this.app.canvas);
    this.world.addChild(this.background,this.walls,this.shapes,this.projectiles,this.drones,this.particles.graphics,this.players);
    this.world.mask=this.viewportMask;
    this.app.stage.addChild(this.world,this.viewportMask,this.viewportFrame,this.crosshair);
    this.resizeViewport();
    window.addEventListener('resize',()=>this.resizeViewport());
    this.drawBackground();
    this.app.ticker.add(ticker=>this.render(Math.min(.05,ticker.deltaMS/1000)));
  }

  setSnapshot(snapshot:WorldSnapshot):void{
    const now=performance.now();
    this.lastSnapshotAt=now;
    this.snapshot=snapshot;
    this.selfId=snapshot.selfId;
    const signature=snapshot.walls.map(wall=>`${wall.id}:${wall.x}:${wall.y}:${wall.width}:${wall.height}`).join('|');
    if(signature!==this.wallsSignature){this.wallsSignature=signature;this.drawWalls(snapshot)}
    this.syncPlayers(snapshot,now);
    this.syncProjectiles(snapshot,now);
    this.syncDrones(snapshot,now);
    this.syncShapeEffects(snapshot);
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

  setTheme(theme:ThemeId):void{
    this.palette=PALETTES[theme];
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
      const displacement=Math.hypot(player.position.x-view.target.x,player.position.y-view.target.y);
      if(displacement>320||(!player.dead&&view.snapshot.dead))view.current={...player.position};
      view.target={...player.position};
      view.velocity={...player.velocity};
      view.targetAngle=player.angle;
      view.snapshot=player;
      view.snapshotAt=now;
      if(view.classId!==player.playerClass||view.isSelf!==isSelf){view.classId=player.playerClass;view.isSelf=isSelf;this.redrawPlayer(view,true)}
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
        if(owner)this.particles.muzzle(owner.current,normalize(projectile.velocity),this.ownerColor(projectile.ownerId));
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
    const shapes=new Map(snapshot.shapes.map(shape=>[shape.id,shape] as const));
    for(const[id,previous]of this.knownShapes){
      const current=shapes.get(id);
      if(current&&current.health<previous.health)this.particles.burst(current.position,this.shapeColor(current),3,85,.18);
      if(!current&&this.distanceToSelf(previous.position)<GAME.viewRadius*.88)this.particles.burst(previous.position,this.shapeColor(previous),10,170,.38);
    }
    this.knownShapes=shapes;
  }

  private render(delta:number):void{
    this.time+=delta;
    const now=performance.now();
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;
    for(const view of this.playerViews.values()){
      const age=clamp((now-view.snapshotAt)/1000,0,.09);
      const predicted={x:view.target.x+view.velocity.x*age,y:view.target.y+view.velocity.y*age};
      const factor=1-Math.exp(-(view.isSelf?42:24)*delta);
      view.current.x+=(predicted.x-view.current.x)*factor;
      view.current.y+=(predicted.y-view.current.y)*factor;
      view.angle=angleLerp(view.angle,view.targetAngle,1-Math.exp(-28*delta));
      view.root.position.set(view.current.x,view.current.y);
      view.rotating.rotation=view.angle;
      view.shield.alpha=view.snapshot.invulnerable?.45+Math.sin(this.time*8)*.16:0;
    }
    this.updateMotion(this.projectileViews,delta,now,46,.085);
    this.updateMotion(this.droneViews,delta,now,30,.09);
    if(self){
      this.scale=this.viewport.height/GAME.visibleWorldHeight;
      this.world.scale.set(this.scale);
      this.world.position.set(this.viewport.x+this.viewport.width/2,this.viewport.y+this.viewport.height/2);
      this.world.pivot.set(self.current.x,self.current.y);
    }
    this.drawDynamic(now);
    this.particles.update(delta);
    this.particles.draw();
    this.drawCrosshair();
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

  private resizeViewport():void{
    const screenWidth=this.app.screen.width||window.innerWidth;
    const screenHeight=this.app.screen.height||window.innerHeight;
    const width=Math.min(screenWidth,screenHeight*16/9);
    const height=width*9/16;
    this.viewport={x:(screenWidth-width)/2,y:(screenHeight-height)/2,width,height};
    this.viewportMask.clear().rect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height).fill(0xffffff);
    this.viewportFrame.clear().rect(this.viewport.x,this.viewport.y,this.viewport.width,this.viewport.height).stroke({color:this.palette.border,alpha:.55,width:2});
  }

  private drawBackground():void{
    this.background.clear().rect(0,0,GAME.worldWidth,GAME.worldHeight).fill(this.palette.background);
    for(let x=0;x<=GAME.worldWidth;x+=80)this.background.moveTo(x,0).lineTo(x,GAME.worldHeight);
    for(let y=0;y<=GAME.worldHeight;y+=80)this.background.moveTo(0,y).lineTo(GAME.worldWidth,y);
    this.background.stroke({color:this.palette.grid,width:1});
    this.background.rect(0,0,GAME.worldWidth,GAME.worldHeight).stroke({color:this.palette.border,width:7});
  }

  private drawWalls(snapshot:WorldSnapshot):void{
    this.walls.clear();
    for(const wall of snapshot.walls)this.walls.roundRect(wall.x,wall.y,wall.width,wall.height,10).fill(this.palette.wall).stroke({color:this.palette.wallEdge,width:3});
  }

  private drawDynamic(now:number):void{
    const snapshot=this.snapshot;if(!snapshot)return;
    const snapshotAge=clamp((now-this.lastSnapshotAt)/1000,0,.09);
    this.shapes.clear();
    for(const shape of snapshot.shapes){
      const position={x:shape.position.x+shape.velocity.x*snapshotAge,y:shape.position.y+shape.velocity.y*snapshotAge};
      const sides=shape.kind==='square'?4:shape.kind==='triangle'?3:5;
      const color=this.shapeColor(shape);
      this.shapes.poly(translated(polygon(sides,shape.radius,shape.rotation),position)).fill(color).stroke({color:0xffffff,alpha:.22,width:2});
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
      this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius+3).fill({color,alpha:.14});
      this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius).fill(color).stroke({color:outline,alpha:.7,width:1.5});
      this.projectiles.circle(view.current.x-view.snapshot.radius*.22,view.current.y-view.snapshot.radius*.22,Math.max(1.2,view.snapshot.radius*.28)).fill({color:0xffffff,alpha:.48});
    }
    this.drones.clear();
    for(const view of this.droneViews.values()){
      const color=this.ownerColor(view.snapshot.ownerId);
      const angle=Math.atan2(view.velocity.y,view.velocity.x)||view.snapshot.angle;
      this.drones.poly(translated(polygon(3,13,angle),view.current)).fill(color).stroke({color:0xffffff,alpha:.48,width:2});
    }
  }

  private createPlayerView(player:PlayerSnapshot,isSelf:boolean,now:number):PlayerView{
    const root=new Container();const rotating=new Container();const barrels=new Graphics();const body=new Graphics();const detail=new Graphics();const shield=new Graphics();
    rotating.addChild(barrels,body,detail,shield);root.addChild(rotating);
    const healthBack=new Graphics();const healthFill=new Graphics();root.addChild(healthBack,healthFill);
    const name=new Text({text:'',style:{fill:this.palette.label,fontSize:12,fontWeight:'650',fontFamily:'Inter, system-ui, sans-serif'}});name.anchor.set(.5);name.position.set(0,-42);root.addChild(name);
    const view:PlayerView={root,rotating,body,barrels,detail,shield,healthBack,healthFill,name,current:{...player.position},target:{...player.position},velocity:{...player.velocity},angle:player.angle,targetAngle:player.angle,snapshot:player,snapshotAt:now,classId:player.playerClass,isSelf};
    root.position.set(player.position.x,player.position.y);this.redrawPlayer(view,true);return view;
  }

  private redrawPlayer(view:PlayerView,geometry:boolean):void{
    const player=view.snapshot;const color=view.isSelf?this.palette.self:this.palette.enemy;
    if(geometry){
      view.body.clear();view.barrels.clear();view.detail.clear();
      this.drawClassHull(view.body,view.detail,player.playerClass,color);
      this.drawClassBarrels(view.barrels,player.playerClass,color);
      view.shield.clear().circle(0,0,GAME.playerRadius+9).stroke({color,alpha:.72,width:2});
    }
    view.healthBack.clear().roundRect(-25,31,50,5,3).fill({color:0x000000,alpha:.48});
    view.healthFill.clear().roundRect(-25,31,50*clamp(player.health/Math.max(1,player.maxHealth),0,1),5,3).fill(player.health/player.maxHealth>.35?0x65d39a:0xf05e72);
    view.name.text=`${player.name}${player.isBot?' · BOT':''}`;
    view.name.style.fill=view.isSelf?this.palette.label:this.palette.enemy;
  }

  private drawClassBarrels(graphics:Graphics,playerClass:PlayerClass,color:number):void{
    const definition=CLASS_DEFINITIONS[playerClass];
    if(definition.barrelCount<=0)return;
    const precision=definition.branch==='precision';
    const impact=definition.branch==='impact';
    const height=precision?12:impact?16:14;
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

  private ownerColor(ownerId:string):number{return ownerId===this.selfId?this.palette.self:this.palette.enemy}
  private shapeColor(shape:ShapeSnapshot):number{return shape.kind==='square'?this.palette.square:shape.kind==='triangle'?this.palette.triangle:this.palette.pentagon}
  private distanceToSelf(position:Vector2):number{const self=this.selfId?this.playerViews.get(this.selfId):undefined;return self?Math.hypot(position.x-self.current.x,position.y-self.current.y):Infinity}
}
