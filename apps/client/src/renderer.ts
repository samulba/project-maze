import { Application, Container, Graphics, Text } from 'pixi.js';
import {
  CLASS_DEFINITIONS,
  GAME,
  type PlayerClass,
  type PlayerSnapshot,
  type ShapeSnapshot,
  type ThemeId,
  type Vector2,
  type WorldSnapshot
} from '@project-maze/shared';
import { ParticleField } from './particles';

interface Palette {
  background:number; grid:number; border:number; wall:number; wallEdge:number;
  self:number; enemy:number; barrel:number; projectile:number; drone:number;
  square:number; triangle:number; pentagon:number; label:number;
}
const PALETTES:Record<ThemeId,Palette>={
  midnight:{background:0x070910,grid:0x151a28,border:0x3d4661,wall:0x222839,wallEdge:0x3f4964,self:0x7d88ff,enemy:0xe7677b,barrel:0xc4cad9,projectile:0xf5f7ff,drone:0x78d7c7,square:0x6574dd,triangle:0xe6a954,pentagon:0xcf6eb5,label:0xe9ecf5},
  void:{background:0x030407,grid:0x111317,border:0x31343b,wall:0x181b20,wallEdge:0x343942,self:0xb8ff6a,enemy:0xff5c76,barrel:0xdde2e8,projectile:0xffffff,drone:0x65e7c2,square:0x6b7c8f,triangle:0xffb84d,pentagon:0xc77dff,label:0xf1f3f5},
  classic:{background:0xe8ebf0,grid:0xd5d9e1,border:0x818a9b,wall:0xaab1bf,wallEdge:0x7e8798,self:0x536dfe,enemy:0xf14e63,barrel:0x727b8d,projectile:0x343a46,drone:0x2ba887,square:0x6f7ee8,triangle:0xe5a044,pentagon:0xbd5c9d,label:0x252a34}
};

interface PlayerView {
  root:Container; rotating:Container; body:Graphics; barrels:Graphics; detail:Graphics;
  shield:Graphics; healthBack:Graphics; healthFill:Graphics; name:Text;
  current:Vector2; target:Vector2; angle:number; targetAngle:number;
  snapshot:PlayerSnapshot; classId:PlayerClass; isSelf:boolean;
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
  private readonly trails=new Graphics();
  private readonly projectiles=new Graphics();
  private readonly drones=new Graphics();
  private readonly players=new Container();
  private readonly particles=new ParticleField();
  private readonly crosshair=new Graphics();
  private readonly playerViews=new Map<string,PlayerView>();
  private snapshot:WorldSnapshot|null=null;
  private selfId:string|null=null;
  private palette=PALETTES.midnight;
  private pointer:Vector2={x:innerWidth/2,y:innerHeight/2};
  private primary=false;
  private secondary=false;
  private showCrosshair=false;
  private scale=1;
  private time=0;
  private wallsSignature='';
  private knownProjectiles=new Set<string>();
  private knownShapes=new Map<string,ShapeSnapshot>();

  async init(root:HTMLElement):Promise<void>{
    await this.app.init({resizeTo:window,antialias:true,background:this.palette.background,resolution:Math.min(devicePixelRatio||1,2),autoDensity:true,preference:'webgl'});
    root.prepend(this.app.canvas);
    this.world.addChild(this.background,this.walls,this.shapes,this.trails,this.projectiles,this.drones,this.particles.graphics,this.players);
    this.app.stage.addChild(this.world,this.crosshair);
    this.drawBackground();
    this.app.ticker.add(ticker=>this.render(Math.min(.05,ticker.deltaMS/1000)));
  }

  setSnapshot(snapshot:WorldSnapshot):void{
    this.snapshot=snapshot;
    this.selfId=snapshot.selfId;
    const signature=snapshot.walls.map(wall=>`${wall.id}:${wall.x}:${wall.y}:${wall.width}:${wall.height}`).join('|');
    if(signature!==this.wallsSignature){this.wallsSignature=signature;this.drawWalls(snapshot)}
    this.syncPlayers(snapshot);
    this.syncEffects(snapshot);
  }

  setInput(pointer:Vector2,primary:boolean,secondary:boolean,showCrosshair:boolean):void{
    this.pointer=pointer;this.primary=primary;this.secondary=secondary;this.showCrosshair=showCrosshair;
  }

  screenPointToWorldAim(pointer:Vector2):Vector2{
    const direction={x:(pointer.x-this.app.screen.width/2)/Math.max(.001,this.scale),y:(pointer.y-this.app.screen.height/2)/Math.max(.001,this.scale)};
    const length=Math.hypot(direction.x,direction.y);
    if(length<=GAME.maxAimDistance)return direction;
    const factor=GAME.maxAimDistance/Math.max(.001,length);
    return{x:direction.x*factor,y:direction.y*factor};
  }

  setTheme(theme:ThemeId):void{
    this.palette=PALETTES[theme];
    this.app.renderer.background.color=this.palette.background;
    this.drawBackground();
    if(this.snapshot)this.drawWalls(this.snapshot);
    for(const view of this.playerViews.values())this.redrawPlayer(view,true);
  }

  private syncPlayers(snapshot:WorldSnapshot):void{
    const active=new Set<string>();
    for(const player of snapshot.players){
      active.add(player.id);
      let view=this.playerViews.get(player.id);
      const isSelf=player.id===snapshot.selfId;
      if(!view){
        view=this.createPlayerView(player,isSelf);
        this.playerViews.set(player.id,view);
        this.players.addChild(view.root);
      }
      view.target={...player.position};
      view.targetAngle=player.angle;
      view.snapshot=player;
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

  private syncEffects(snapshot:WorldSnapshot):void{
    const projectileIds=new Set(snapshot.projectiles.map(projectile=>projectile.id));
    for(const projectile of snapshot.projectiles){
      if(this.knownProjectiles.has(projectile.id))continue;
      const owner=this.playerViews.get(projectile.ownerId);
      if(owner){const direction=normalize(projectile.velocity);this.particles.muzzle(owner.target,direction,projectile.ownerId===snapshot.selfId?this.palette.self:this.palette.enemy)}
    }
    this.knownProjectiles=projectileIds;
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
    const self=this.selfId?this.playerViews.get(this.selfId):undefined;
    for(const view of this.playerViews.values()){
      const factor=1-Math.exp(-(view.isSelf?28:18)*delta);
      view.current.x+=(view.target.x-view.current.x)*factor;
      view.current.y+=(view.target.y-view.current.y)*factor;
      view.angle=angleLerp(view.angle,view.targetAngle,1-Math.exp(-24*delta));
      view.root.position.set(view.current.x,view.current.y);
      view.rotating.rotation=view.angle;
      view.shield.alpha=view.snapshot.invulnerable?.45+Math.sin(this.time*8)*.16:0;
    }
    if(self){
      this.scale=Math.min(this.app.screen.width/GAME.visibleWorldWidth,this.app.screen.height/GAME.visibleWorldHeight);
      this.world.scale.set(this.scale);
      this.world.position.set(this.app.screen.width/2,this.app.screen.height/2);
      this.world.pivot.set(self.current.x,self.current.y);
    }
    this.drawDynamic();
    this.particles.update(delta);
    this.particles.draw();
    this.drawCrosshair();
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
    for(const wall of snapshot.walls){
      this.walls.roundRect(wall.x,wall.y,wall.width,wall.height,10).fill(this.palette.wall).stroke({color:this.palette.wallEdge,width:3});
    }
  }

  private drawDynamic():void{
    const snapshot=this.snapshot;if(!snapshot)return;
    this.shapes.clear();
    for(const shape of snapshot.shapes){
      const sides=shape.kind==='square'?4:shape.kind==='triangle'?3:5;
      const color=this.shapeColor(shape);
      this.shapes.poly(translated(polygon(sides,shape.radius,shape.rotation),shape.position)).fill(color).stroke({color:0xffffff,alpha:.22,width:2});
      if(shape.health<shape.maxHealth){
        const width=shape.radius*2;
        this.shapes.roundRect(shape.position.x-width/2,shape.position.y+shape.radius+7,width,4,2).fill({color:0x000000,alpha:.45});
        this.shapes.roundRect(shape.position.x-width/2,shape.position.y+shape.radius+7,width*clamp(shape.health/shape.maxHealth,0,1),4,2).fill(color);
      }
    }
    this.trails.clear();this.projectiles.clear();
    for(const projectile of snapshot.projectiles){
      const direction=normalize(projectile.velocity);
      const length=clamp(Math.hypot(projectile.velocity.x,projectile.velocity.y)*.025,8,34);
      this.trails.moveTo(projectile.position.x,projectile.position.y).lineTo(projectile.position.x-direction.x*length,projectile.position.y-direction.y*length).stroke({color:this.palette.projectile,alpha:.24,width:Math.max(2,projectile.radius*.65)});
      this.projectiles.circle(projectile.position.x,projectile.position.y,projectile.radius).fill(this.palette.projectile);
    }
    this.drones.clear();
    for(const drone of snapshot.drones){
      this.drones.poly(translated(polygon(3,13,drone.angle),drone.position)).fill(this.palette.drone).stroke({color:0xffffff,alpha:.3,width:2});
    }
  }

  private createPlayerView(player:PlayerSnapshot,isSelf:boolean):PlayerView{
    const root=new Container();const rotating=new Container();const barrels=new Graphics();const body=new Graphics();const detail=new Graphics();const shield=new Graphics();
    rotating.addChild(barrels,body,detail,shield);root.addChild(rotating);
    const healthBack=new Graphics();const healthFill=new Graphics();root.addChild(healthBack,healthFill);
    const name=new Text({text:'',style:{fill:this.palette.label,fontSize:12,fontWeight:'650',fontFamily:'Inter, system-ui, sans-serif'}});name.anchor.set(.5);name.position.set(0,-39);root.addChild(name);
    const view:PlayerView={root,rotating,body,barrels,detail,shield,healthBack,healthFill,name,current:{...player.position},target:{...player.position},angle:player.angle,targetAngle:player.angle,snapshot:player,classId:player.playerClass,isSelf};
    root.position.set(player.position.x,player.position.y);this.redrawPlayer(view,true);return view;
  }

  private redrawPlayer(view:PlayerView,geometry:boolean):void{
    const player=view.snapshot;const color=view.isSelf?this.palette.self:this.palette.enemy;
    if(geometry){
      view.body.clear().circle(0,0,GAME.playerRadius).fill(color).stroke({color:0xffffff,alpha:.34,width:3});
      view.barrels.clear();view.detail.clear();
      const definition=CLASS_DEFINITIONS[player.playerClass];
      if(definition.barrelCount>0){
        for(let index=0;index<definition.barrelCount;index+=1){
          const offset=definition.barrelCount===1?0:(index/(definition.barrelCount-1)-.5)*definition.barrelSpread;
          const y=offset*42;
          view.barrels.roundRect(4,y-7,definition.barrelLength,14,4).fill(this.palette.barrel).stroke({color:0x000000,alpha:.16,width:2});
        }
      }else view.detail.poly(polygon(3,10,0)).fill(this.palette.drone);
      view.shield.clear().circle(0,0,GAME.playerRadius+8).stroke({color,alpha:.72,width:2});
    }
    view.healthBack.clear().roundRect(-25,29,50,5,3).fill({color:0x000000,alpha:.48});
    view.healthFill.clear().roundRect(-25,29,50*clamp(player.health/Math.max(1,player.maxHealth),0,1),5,3).fill(player.health/player.maxHealth>.35?0x65d39a:0xf05e72);
    view.name.text=`${player.name}${player.isBot?' · BOT':''}`;view.name.style.fill=this.palette.label;
  }

  private drawCrosshair():void{
    this.crosshair.clear();if(!this.showCrosshair)return;
    const radius=this.primary||this.secondary?12:10;const color=this.palette.self;
    this.crosshair.circle(this.pointer.x,this.pointer.y,2).fill({color,alpha:.9});
    this.crosshair.circle(this.pointer.x,this.pointer.y,radius).stroke({color,alpha:.55,width:1.5});
  }
  private shapeColor(shape:ShapeSnapshot):number{return shape.kind==='square'?this.palette.square:shape.kind==='triangle'?this.palette.triangle:this.palette.pentagon}
  private distanceToSelf(position:Vector2):number{const self=this.selfId?this.playerViews.get(this.selfId):undefined;return self?Math.hypot(position.x-self.current.x,position.y-self.current.y):Infinity}
}
