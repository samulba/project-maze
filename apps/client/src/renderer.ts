import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME, type DroneSnapshot, type PlayerSnapshot, type ProjectileSnapshot, type ShapeSnapshot, type ThemeId, type Vector2, type WorldSnapshot } from '@project-maze/shared';
import { CameraRig } from './camera';
import { ParticleField } from './particles';

interface Palette { background:number; grid:number; border:number; wall:number; wallEdge:number; self:number; enemy:number; barrel:number; projectile:number; drone:number; square:number; triangle:number; pentagon:number; label:number }
const PALETTES: Record<ThemeId, Palette> = {
  midnight:{background:0x070910,grid:0x151a28,border:0x3d4661,wall:0x222839,wallEdge:0x3f4964,self:0x7d88ff,enemy:0xe7677b,barrel:0xc4cad9,projectile:0xf5f7ff,drone:0x78d7c7,square:0x6574dd,triangle:0xe6a954,pentagon:0xcf6eb5,label:0xe9ecf5},
  void:{background:0x030407,grid:0x111317,border:0x31343b,wall:0x181b20,wallEdge:0x343942,self:0xb8ff6a,enemy:0xff5c76,barrel:0xdde2e8,projectile:0xffffff,drone:0x65e7c2,square:0x6b7c8f,triangle:0xffb84d,pentagon:0xc77dff,label:0xf1f3f5},
  classic:{background:0xe8ebf0,grid:0xd5d9e1,border:0x818a9b,wall:0xaab1bf,wallEdge:0x7e8798,self:0x536dfe,enemy:0xf14e63,barrel:0x727b8d,projectile:0x343a46,drone:0x2ba887,square:0x6f7ee8,triangle:0xe5a044,pentagon:0xbd5c9d,label:0x252a34}
};
interface PlayerView { root:Container; rotating:Container; body:Graphics; barrel:Graphics; detail:Graphics; shield:Graphics; healthBackground:Graphics; healthFill:Graphics; name:Text; current:Vector2; target:Vector2; angle:number; targetAngle:number; snapshot:PlayerSnapshot; snapshotAt:number; recoil:number; flash:number }
interface Motion<T> { current:Vector2; target:Vector2; velocity:Vector2; snapshot:T; snapshotAt:number }
const clamp=(value:number,min:number,max:number):number=>Math.max(min,Math.min(max,value));
const normalize=(vector:Vector2):Vector2=>{const length=Math.hypot(vector.x,vector.y);return length<.001?{x:0,y:0}:{x:vector.x/length,y:vector.y/length}};
const shortestAngle=(current:number,target:number):number=>{let difference=(target-current+Math.PI)%(Math.PI*2)-Math.PI;if(difference<-Math.PI)difference+=Math.PI*2;return current+difference};
const polygon=(sides:number,radius:number,rotation=0):number[]=>{const points:number[]=[];for(let index=0;index<sides;index+=1){const angle=rotation+index*Math.PI*2/sides;points.push(Math.cos(angle)*radius,Math.sin(angle)*radius)}return points};
const translate=(points:number[],x:number,y:number):number[]=>points.map((value,index)=>value+(index%2===0?x:y));
const hash=(id:string):number=>{let value=0;for(let index=0;index<id.length;index+=1)value=(value*31+id.charCodeAt(index))|0;return Math.abs(value)};

export class GameRenderer {
  readonly app=new Application();
  private readonly world=new Container();
  private readonly background=new Graphics();
  private readonly walls=new Graphics();
  private readonly shapes=new Graphics();
  private readonly trails=new Graphics();
  private readonly projectiles=new Graphics();
  private readonly drones=new Graphics();
  private readonly players=new Container();
  private readonly screenFx=new Graphics();
  private readonly crosshair=new Graphics();
  private readonly particleField=new ParticleField();
  private readonly camera=new CameraRig();
  private readonly playerViews=new Map<string,PlayerView>();
  private readonly projectileViews=new Map<string,Motion<ProjectileSnapshot>>();
  private readonly droneViews=new Map<string,Motion<DroneSnapshot>>();
  private readonly previousShapes=new Map<string,ShapeSnapshot>();
  private readonly shapeFlashes=new Map<string,number>();
  private snapshot:WorldSnapshot|null=null;
  private palette:Palette=PALETTES.midnight;
  private selfId:string|null=null;
  private wallsSignature='';
  private lastSnapshotAt=performance.now();
  private time=0;
  private aim:Vector2={x:1,y:0};
  private move:Vector2={x:0,y:0};
  private pointer:Vector2={x:innerWidth/2,y:innerHeight/2};
  private requestedZoom=.94;
  private shooting=false;
  private crosshairVisible=false;
  private damageOverlay=0;

  async init(root:HTMLElement):Promise<void>{
    await this.app.init({resizeTo:window,antialias:true,background:this.palette.background,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});
    root.prepend(this.app.canvas);
    this.world.addChild(this.background,this.walls,this.shapes,this.trails,this.projectiles,this.drones,this.particleField.graphics,this.players);
    this.app.stage.addChild(this.world,this.screenFx,this.crosshair);
    this.drawBackground();
    this.app.ticker.add(ticker=>this.render(Math.min(.05,ticker.deltaMS/1000)));
  }

  setSnapshot(snapshot:WorldSnapshot):void{
    const now=performance.now();
    const snapshotDelta=clamp((now-this.lastSnapshotAt)/1000,1/120,.25);
    this.lastSnapshotAt=now;this.snapshot=snapshot;this.selfId=snapshot.selfId;
    const signature=snapshot.walls.map(wall=>`${wall.id}:${wall.x}:${wall.y}:${wall.width}:${wall.height}`).join('|');
    if(signature!==this.wallsSignature){this.wallsSignature=signature;this.drawWalls(snapshot)}
    this.syncPlayers(snapshot,now);
    this.syncProjectiles(snapshot,now,snapshotDelta);
    this.syncDrones(snapshot,now,snapshotDelta);
    this.syncShapes(snapshot);
  }

  setCameraInput(aim:Vector2,move:Vector2,zoom:number,pointer:Vector2,shooting:boolean,crosshairVisible:boolean):void{
    this.aim=aim;this.move=move;this.requestedZoom=clamp(zoom,.7,1.18);this.pointer=pointer;this.shooting=shooting;this.crosshairVisible=crosshairVisible;
  }

  getSelfScreenPosition():Vector2{
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;
    if(!self)return{x:this.app.screen.width/2,y:this.app.screen.height/2};
    return{x:(self.current.x-this.world.pivot.x)*this.world.scale.x+this.world.position.x,y:(self.current.y-this.world.pivot.y)*this.world.scale.y+this.world.position.y};
  }

  setTheme(theme:ThemeId):void{
    this.palette=PALETTES[theme];this.app.renderer.background.color=this.palette.background;this.drawBackground();
    if(this.snapshot)this.drawWalls(this.snapshot);
    for(const view of this.playerViews.values())this.redrawPlayer(view,view.snapshot.id===this.selfId);
  }

  private syncPlayers(snapshot:WorldSnapshot,now:number):void{
    const active=new Set<string>();
    for(const player of snapshot.players){
      active.add(player.id);let view=this.playerViews.get(player.id);
      if(!view){view=this.createPlayerView(player,now);this.playerViews.set(player.id,view);this.players.addChild(view.root)}
      else{
        const previous=view.snapshot;const displacement=Math.hypot(player.position.x-view.target.x,player.position.y-view.target.y);
        if(player.health<previous.health-.01){view.flash=1;this.particleField.burst(player.position,player.id===snapshot.selfId?this.palette.self:this.palette.enemy,8,145,.28);if(player.id===snapshot.selfId){this.camera.hit();this.damageOverlay=1}}
        if(player.deaths>previous.deaths||displacement>620){view.current={...player.position};if(player.id===snapshot.selfId){this.camera.snap();this.camera.hit(.75)}}
        view.target={...player.position};view.targetAngle=player.angle;view.snapshot=player;view.snapshotAt=now;
      }
      this.redrawPlayer(view,player.id===snapshot.selfId);
    }
    for(const[id,view]of this.playerViews){if(active.has(id))continue;this.particleField.burst(view.current,this.palette.enemy,12,185,.38);view.root.destroy({children:true});this.playerViews.delete(id)}
  }

  private syncProjectiles(snapshot:WorldSnapshot,now:number,snapshotDelta:number):void{
    const active=new Set<string>();
    for(const projectile of snapshot.projectiles){
      active.add(projectile.id);const existing=this.projectileViews.get(projectile.id);
      if(!existing){
        this.projectileViews.set(projectile.id,{current:{...projectile.position},target:{...projectile.position},velocity:{x:0,y:0},snapshot:projectile,snapshotAt:now});
        const owner=this.playerViews.get(projectile.ownerId);
        if(owner){owner.recoil=Math.max(owner.recoil,owner.snapshot.playerClass==='sniper'?1.35:.82);const direction={x:Math.cos(owner.targetAngle),y:Math.sin(owner.targetAngle)};this.particleField.muzzle(owner.target,direction,projectile.ownerId===snapshot.selfId?this.palette.self:this.palette.enemy);if(projectile.ownerId===snapshot.selfId)this.camera.shot(direction,owner.snapshot.playerClass==='sniper'?9:4.5)}
      }else{existing.velocity={x:(projectile.position.x-existing.target.x)/snapshotDelta,y:(projectile.position.y-existing.target.y)/snapshotDelta};existing.target={...projectile.position};existing.snapshot=projectile;existing.snapshotAt=now}
    }
    for(const[id,view]of this.projectileViews){if(active.has(id))continue;if(Math.hypot(view.velocity.x,view.velocity.y)>80)this.particleField.burst(view.current,this.palette.projectile,3,70,.14);this.projectileViews.delete(id)}
  }

  private syncDrones(snapshot:WorldSnapshot,now:number,snapshotDelta:number):void{
    const active=new Set<string>();
    for(const drone of snapshot.drones){active.add(drone.id);const existing=this.droneViews.get(drone.id);if(!existing)this.droneViews.set(drone.id,{current:{...drone.position},target:{...drone.position},velocity:{x:0,y:0},snapshot:drone,snapshotAt:now});else{existing.velocity={x:(drone.position.x-existing.target.x)/snapshotDelta,y:(drone.position.y-existing.target.y)/snapshotDelta};existing.target={...drone.position};existing.snapshot=drone;existing.snapshotAt=now}}
    for(const id of this.droneViews.keys())if(!active.has(id))this.droneViews.delete(id);
  }

  private syncShapes(snapshot:WorldSnapshot):void{
    const current=new Map<string,ShapeSnapshot>();
    for(const shape of snapshot.shapes){current.set(shape.id,shape);const previous=this.previousShapes.get(shape.id);if(previous&&shape.health<previous.health-.01){this.shapeFlashes.set(shape.id,1);this.particleField.burst(shape.position,this.shapeColor(shape),4,95,.2)}}
    for(const[id,shape]of this.previousShapes)if(!current.has(id))this.particleField.burst(shape.position,this.shapeColor(shape),shape.kind==='pentagon'?18:10,shape.kind==='pentagon'?240:170,.48);
    this.previousShapes.clear();for(const[id,shape]of current)this.previousShapes.set(id,{...shape,position:{...shape.position}});
  }

  private render(delta:number):void{
    if(!this.snapshot){this.drawCrosshair();return}this.time+=delta;const now=performance.now();
    for(const view of this.playerViews.values()){
      const age=clamp((now-view.snapshotAt)/1000,0,.11);const target={x:view.target.x+view.snapshot.velocity.x*age,y:view.target.y+view.snapshot.velocity.y*age};
      if(view.snapshot.id===this.selfId){const direction=normalize(this.move),nudge=Math.min(11,Math.hypot(this.move.x,this.move.y)*11);target.x+=direction.x*nudge;target.y+=direction.y*nudge}
      const smoothing=1-Math.exp(-(view.snapshot.id===this.selfId?24:16)*delta);view.current.x+=(target.x-view.current.x)*smoothing;view.current.y+=(target.y-view.current.y)*smoothing;view.angle+=(shortestAngle(view.angle,view.targetAngle)-view.angle)*(1-Math.exp(-24*delta));view.recoil*=Math.exp(-17*delta);view.flash*=Math.exp(-10*delta);
      const speed=clamp(Math.hypot(view.snapshot.velocity.x,view.snapshot.velocity.y)/340,0,1);view.root.position.set(view.current.x,view.current.y);view.rotating.rotation=view.angle;view.rotating.position.x=-view.recoil*5.5;view.rotating.scale.set(1+speed*.035+view.recoil*.025,1-speed*.02-view.recoil*.012);view.body.tint=view.flash>.08?0xffc9d0:0xffffff;view.shield.alpha=view.snapshot.invulnerable?.45+Math.sin(this.time*8)*.2:0;
    }
    this.updateMotion(this.projectileViews,delta,now,34,.1);this.updateMotion(this.droneViews,delta,now,21,.08);
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;if(self){const frame=this.camera.update(self.current,self.snapshot.velocity,this.aim,this.requestedZoom,this.crosshairVisible,{x:this.app.screen.width,y:this.app.screen.height},delta,this.time);this.world.pivot.set(frame.pivot.x,frame.pivot.y);this.world.position.set(this.app.screen.width/2,this.app.screen.height/2);this.world.scale.set(frame.zoom)}
    this.particleField.update(delta);for(const[id,value]of this.shapeFlashes){const next=value*Math.exp(-13*delta);if(next<.03)this.shapeFlashes.delete(id);else this.shapeFlashes.set(id,next)}
    this.drawDynamic();this.drawScreenFx(delta);
  }

  private updateMotion<T>(views:Map<string,Motion<T>>,delta:number,now:number,response:number,maxAge:number):void{for(const view of views.values()){const age=clamp((now-view.snapshotAt)/1000,0,maxAge);const target={x:view.target.x+view.velocity.x*age,y:view.target.y+view.velocity.y*age};const smoothing=1-Math.exp(-response*delta);view.current.x+=(target.x-view.current.x)*smoothing;view.current.y+=(target.y-view.current.y)*smoothing}}

  private drawBackground():void{this.background.clear().rect(0,0,GAME.worldWidth,GAME.worldHeight).fill(this.palette.background);for(let x=0;x<=GAME.worldWidth;x+=80)this.background.moveTo(x,0).lineTo(x,GAME.worldHeight);for(let y=0;y<=GAME.worldHeight;y+=80)this.background.moveTo(0,y).lineTo(GAME.worldWidth,y);this.background.stroke({color:this.palette.grid,width:1});this.background.rect(0,0,GAME.worldWidth,GAME.worldHeight).stroke({color:this.palette.border,width:7})}
  private drawWalls(snapshot:WorldSnapshot):void{this.walls.clear();for(const wall of snapshot.walls){this.walls.roundRect(wall.x+5,wall.y+7,wall.width,wall.height,12).fill({color:0x000000,alpha:.18});this.walls.roundRect(wall.x,wall.y,wall.width,wall.height,12).fill(this.palette.wall).stroke({color:this.palette.wallEdge,width:3});this.walls.roundRect(wall.x+6,wall.y+6,Math.max(0,wall.width-12),Math.max(0,wall.height-12),7).stroke({color:0xffffff,alpha:.045,width:1})}}

  private drawDynamic():void{
    const snapshot=this.snapshot;if(!snapshot)return;this.shapes.clear();
    for(const shape of snapshot.shapes){const color=this.shapeColor(shape),sides=shape.kind==='square'?4:shape.kind==='triangle'?3:5,speed=shape.kind==='pentagon'?.16:shape.kind==='triangle'?-.28:.22,rotation=hash(shape.id)*.01+this.time*speed+(shape.kind==='square'?Math.PI/4:-Math.PI/2),flash=this.shapeFlashes.get(shape.id)??0,pulse=1+flash*.08;this.shapes.poly(translate(polygon(sides,shape.radius*pulse,rotation),shape.position.x,shape.position.y)).fill(flash>.12?0xffffff:color).stroke({color:0xffffff,alpha:.24+flash*.45,width:2});if(shape.health<shape.maxHealth){const width=shape.radius*2;this.shapes.roundRect(shape.position.x-width/2,shape.position.y+shape.radius+8,width,4,2).fill({color:0x000000,alpha:.42});this.shapes.roundRect(shape.position.x-width/2,shape.position.y+shape.radius+8,width*Math.max(0,shape.health/shape.maxHealth),4,2).fill(color)}}
    this.trails.clear();this.projectiles.clear();for(const view of this.projectileViews.values()){const direction=normalize(view.velocity),length=clamp(Math.hypot(view.velocity.x,view.velocity.y)*.035,10,38);this.trails.moveTo(view.current.x,view.current.y).lineTo(view.current.x-direction.x*length,view.current.y-direction.y*length).stroke({color:this.palette.projectile,alpha:.24,width:Math.max(2,view.snapshot.radius*.72)});this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius+5).fill({color:this.palette.projectile,alpha:.08});this.projectiles.circle(view.current.x,view.current.y,view.snapshot.radius).fill(this.palette.projectile)}
    this.drones.clear();for(const view of this.droneViews.values()){const angle=Math.atan2(view.velocity.y,view.velocity.x)||view.snapshot.angle;this.drones.poly(translate(polygon(3,13,angle),view.current.x,view.current.y)).fill(this.palette.drone).stroke({color:0xffffff,alpha:.32,width:2})}this.particleField.draw();
  }

  private drawScreenFx(delta:number):void{this.damageOverlay*=Math.exp(-4.8*delta);this.screenFx.clear();if(this.damageOverlay>.02){this.screenFx.rect(0,0,this.app.screen.width,this.app.screen.height).fill({color:0xff3151,alpha:this.damageOverlay*.045});this.screenFx.rect(4,4,Math.max(0,this.app.screen.width-8),Math.max(0,this.app.screen.height-8)).stroke({color:0xff4964,alpha:this.damageOverlay*.35,width:8})}this.drawCrosshair()}
  private drawCrosshair():void{this.crosshair.clear();if(!this.crosshairVisible)return;const radius=this.shooting?12:10,gap=this.shooting?5:4,length=5,color=this.palette.self;this.crosshair.circle(this.pointer.x,this.pointer.y,2).fill({color,alpha:.9});this.crosshair.circle(this.pointer.x,this.pointer.y,radius).stroke({color,alpha:.5,width:1.5});this.crosshair.moveTo(this.pointer.x-gap-length,this.pointer.y).lineTo(this.pointer.x-gap,this.pointer.y).moveTo(this.pointer.x+gap,this.pointer.y).lineTo(this.pointer.x+gap+length,this.pointer.y).moveTo(this.pointer.x,this.pointer.y-gap-length).lineTo(this.pointer.x,this.pointer.y-gap).moveTo(this.pointer.x,this.pointer.y+gap).lineTo(this.pointer.x,this.pointer.y+gap+length).stroke({color,alpha:.78,width:1.5})}
  private shapeColor(shape:ShapeSnapshot):number{return shape.kind==='square'?this.palette.square:shape.kind==='triangle'?this.palette.triangle:this.palette.pentagon}

  private createPlayerView(player:PlayerSnapshot,now:number):PlayerView{
    const root=new Container(),rotating=new Container(),barrel=new Graphics(),body=new Graphics(),detail=new Graphics(),shield=new Graphics();rotating.addChild(barrel,body,detail,shield);root.addChild(rotating);const healthBackground=new Graphics(),healthFill=new Graphics();root.addChild(healthBackground,healthFill);const name=new Text({text:`${player.name}${player.isBot?' · BOT':''}`,style:{fill:this.palette.label,fontSize:12,fontWeight:'650',fontFamily:'Inter, system-ui, sans-serif',dropShadow:{color:0x000000,alpha:.5,blur:2,distance:1}}});name.anchor.set(.5);name.position.set(0,-39);root.addChild(name);const view={root,rotating,body,barrel,detail,shield,healthBackground,healthFill,name,current:{...player.position},target:{...player.position},angle:player.angle,targetAngle:player.angle,snapshot:player,snapshotAt:now,recoil:0,flash:0};root.position.set(player.position.x,player.position.y);this.redrawPlayer(view,player.id===this.selfId);return view;
  }

  private redrawPlayer(view:PlayerView,isSelf:boolean):void{
    const player=view.snapshot,color=isSelf?this.palette.self:this.palette.enemy;view.body.clear().circle(0,0,GAME.playerRadius).fill(color).stroke({color:0xffffff,alpha:.34,width:3});view.barrel.clear();view.detail.clear();
    if(player.playerClass==='shooter'){view.barrel.roundRect(4,-8,35,16,5).fill(this.palette.barrel).stroke({color:0x000000,alpha:.16,width:2});view.detail.circle(-5,0,5).fill({color:0xffffff,alpha:.13})}else if(player.playerClass==='sniper'){view.barrel.roundRect(4,-6,51,12,4).fill(this.palette.barrel).stroke({color:0x000000,alpha:.18,width:2});view.detail.rect(15,-10,9,20).fill({color,alpha:.9});view.detail.circle(-5,0,5).fill({color:0xffffff,alpha:.13})}else{view.detail.poly(polygon(3,10,0)).fill(this.palette.drone);view.detail.circle(0,0,7).fill({color:0xffffff,alpha:.16})}
    view.shield.clear().circle(0,0,GAME.playerRadius+8).stroke({color,alpha:.72,width:2});view.healthBackground.clear().roundRect(-25,29,50,5,3).fill({color:0x000000,alpha:.48});view.healthFill.clear().roundRect(-25,29,50*Math.max(0,player.health/player.maxHealth),5,3).fill(player.health/player.maxHealth>.35?0x65d39a:0xf05e72);view.name.text=`${player.name}${player.isBot?' · BOT':''}`;view.name.style.fill=this.palette.label;
  }
}
