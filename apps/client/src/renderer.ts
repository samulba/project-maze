import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME, type PlayerSnapshot, type ThemeId, type Vector2, type WorldSnapshot } from '@project-maze/shared';

interface Palette {
  background: number;
  grid: number;
  border: number;
  wall: number;
  wallEdge: number;
  self: number;
  enemy: number;
  barrel: number;
  projectile: number;
  drone: number;
  square: number;
  triangle: number;
  pentagon: number;
  label: number;
}

const PALETTES: Record<ThemeId, Palette> = {
  midnight: { background: 0x070910, grid: 0x151a28, border: 0x3d4661, wall: 0x222839, wallEdge: 0x3f4964, self: 0x7d88ff, enemy: 0xe7677b, barrel: 0xc4cad9, projectile: 0xf5f7ff, drone: 0x78d7c7, square: 0x6574dd, triangle: 0xe6a954, pentagon: 0xcf6eb5, label: 0xe9ecf5 },
  void: { background: 0x030407, grid: 0x111317, border: 0x31343b, wall: 0x181b20, wallEdge: 0x343942, self: 0xb8ff6a, enemy: 0xff5c76, barrel: 0xdde2e8, projectile: 0xffffff, drone: 0x65e7c2, square: 0x6b7c8f, triangle: 0xffb84d, pentagon: 0xc77dff, label: 0xf1f3f5 },
  classic: { background: 0xe8ebf0, grid: 0xd5d9e1, border: 0x818a9b, wall: 0xaab1bf, wallEdge: 0x7e8798, self: 0x536dfe, enemy: 0xf14e63, barrel: 0x727b8d, projectile: 0x343a46, drone: 0x2ba887, square: 0x6f7ee8, triangle: 0xe5a044, pentagon: 0xbd5c9d, label: 0x252a34 }
};

interface PlayerView {
  root: Container;
  rotating: Container;
  body: Graphics;
  barrel: Graphics;
  detail: Graphics;
  shield: Graphics;
  healthBackground: Graphics;
  healthFill: Graphics;
  name: Text;
  current: Vector2;
  target: Vector2;
  angle: number;
  targetAngle: number;
  snapshot: PlayerSnapshot;
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  return length < 0.001 ? { x: 0, y: 0 } : { x: vector.x / length, y: vector.y / length };
}

function shortestAngle(current: number, target: number): number {
  let difference = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return current + difference;
}

function polygonPoints(sides: number, radius: number, rotation = 0): number[] {
  const points: number[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + index * Math.PI * 2 / sides;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  return points;
}

function translatePoints(points: number[], x: number, y: number): number[] {
  return points.map((value, index) => value + (index % 2 === 0 ? x : y));
}

export class GameRenderer {
  readonly app = new Application();
  private readonly world = new Container();
  private readonly background = new Graphics();
  private readonly wallLayer = new Graphics();
  private readonly shapeLayer = new Graphics();
  private readonly projectileLayer = new Graphics();
  private readonly droneLayer = new Graphics();
  private readonly playerLayer = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private snapshot: WorldSnapshot | null = null;
  private palette: Palette = PALETTES.midnight;
  private camera = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
  private cameraZoom = 1;
  private aim: Vector2 = { x: 1, y: 0 };
  private selfId: string | null = null;
  private wallsSignature = '';

  async init(root: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: window, antialias: true, background: this.palette.background, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    root.prepend(this.app.canvas);
    this.world.addChild(this.background, this.wallLayer, this.shapeLayer, this.projectileLayer, this.droneLayer, this.playerLayer);
    this.app.stage.addChild(this.world);
    this.drawBackground();
    this.app.ticker.add((ticker) => this.render(Math.min(2, ticker.deltaTime)));
  }

  setSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    this.selfId = snapshot.selfId;
    const signature = snapshot.walls.map((wall) => `${wall.id}:${wall.x}:${wall.y}`).join('|');
    if (signature !== this.wallsSignature) {
      this.wallsSignature = signature;
      this.drawWalls(snapshot);
    }
    const active = new Set<string>();
    for (const player of snapshot.players) {
      active.add(player.id);
      let view = this.playerViews.get(player.id);
      if (!view) {
        view = this.createPlayerView(player);
        this.playerViews.set(player.id, view);
        this.playerLayer.addChild(view.root);
      }
      view.target = { ...player.position };
      view.targetAngle = player.angle;
      view.snapshot = player;
      this.redrawPlayer(view, player.id === snapshot.selfId);
    }
    for (const [id, view] of this.playerViews) {
      if (active.has(id)) continue;
      view.root.destroy({ children: true });
      this.playerViews.delete(id);
    }
  }

  setCameraInput(aim: Vector2, zoom: number): void {
    this.aim = aim;
    this.cameraZoom = zoom;
  }

  setTheme(theme: ThemeId): void {
    this.palette = PALETTES[theme];
    this.app.renderer.background.color = this.palette.background;
    this.drawBackground();
    if (this.snapshot) this.drawWalls(this.snapshot);
    for (const view of this.playerViews.values()) this.redrawPlayer(view, view.snapshot.id === this.selfId);
  }

  private render(delta: number): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const selfView = this.selfId ? this.playerViews.get(this.selfId) : undefined;
    for (const view of this.playerViews.values()) {
      const smoothing = 1 - Math.pow(0.76, delta);
      view.current.x += (view.target.x - view.current.x) * smoothing;
      view.current.y += (view.target.y - view.current.y) * smoothing;
      view.angle += (shortestAngle(view.angle, view.targetAngle) - view.angle) * smoothing;
      view.root.position.set(view.current.x, view.current.y);
      view.rotating.rotation = view.angle;
    }
    if (selfView) {
      const aim = normalize(this.aim);
      const targetX = selfView.current.x + aim.x * 66;
      const targetY = selfView.current.y + aim.y * 66;
      const cameraSmoothing = 1 - Math.pow(0.82, delta);
      this.camera.x += (targetX - this.camera.x) * cameraSmoothing;
      this.camera.y += (targetY - this.camera.y) * cameraSmoothing;
    }
    this.world.pivot.set(this.camera.x, this.camera.y);
    this.world.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    this.world.scale.set(this.cameraZoom);
    this.drawDynamic(snapshot);
  }

  private drawBackground(): void {
    this.background.clear();
    this.background.rect(0, 0, GAME.worldWidth, GAME.worldHeight).fill(this.palette.background);
    for (let x = 0; x <= GAME.worldWidth; x += 80) this.background.moveTo(x, 0).lineTo(x, GAME.worldHeight);
    for (let y = 0; y <= GAME.worldHeight; y += 80) this.background.moveTo(0, y).lineTo(GAME.worldWidth, y);
    this.background.stroke({ color: this.palette.grid, width: 1 });
    this.background.rect(0, 0, GAME.worldWidth, GAME.worldHeight).stroke({ color: this.palette.border, width: 7 });
  }

  private drawWalls(snapshot: WorldSnapshot): void {
    this.wallLayer.clear();
    for (const wall of snapshot.walls) {
      this.wallLayer.roundRect(wall.x, wall.y, wall.width, wall.height, 12).fill(this.palette.wall).stroke({ color: this.palette.wallEdge, width: 3 });
      this.wallLayer.roundRect(wall.x + 6, wall.y + 6, Math.max(0, wall.width - 12), Math.max(0, wall.height - 12), 7).stroke({ color: 0xffffff, alpha: 0.045, width: 1 });
    }
  }

  private drawDynamic(snapshot: WorldSnapshot): void {
    this.shapeLayer.clear();
    for (const shape of snapshot.shapes) {
      const color = shape.kind === 'square' ? this.palette.square : shape.kind === 'triangle' ? this.palette.triangle : this.palette.pentagon;
      const sides = shape.kind === 'square' ? 4 : shape.kind === 'triangle' ? 3 : 5;
      this.shapeLayer.poly(translatePoints(polygonPoints(sides, shape.radius, shape.kind === 'square' ? Math.PI / 4 : -Math.PI / 2), shape.position.x, shape.position.y)).fill(color).stroke({ color: 0xffffff, alpha: 0.24, width: 2 });
      if (shape.health < shape.maxHealth) {
        const width = shape.radius * 2;
        this.shapeLayer.roundRect(shape.position.x - width / 2, shape.position.y + shape.radius + 8, width, 4, 2).fill({ color: 0x000000, alpha: 0.42 });
        this.shapeLayer.roundRect(shape.position.x - width / 2, shape.position.y + shape.radius + 8, width * Math.max(0, shape.health / shape.maxHealth), 4, 2).fill(color);
      }
    }

    this.projectileLayer.clear();
    for (const projectile of snapshot.projectiles) {
      this.projectileLayer.circle(projectile.position.x, projectile.position.y, projectile.radius + 4).fill({ color: this.palette.projectile, alpha: 0.09 });
      this.projectileLayer.circle(projectile.position.x, projectile.position.y, projectile.radius).fill(this.palette.projectile);
    }

    this.droneLayer.clear();
    for (const drone of snapshot.drones) {
      this.droneLayer.poly(translatePoints(polygonPoints(3, 13, drone.angle), drone.position.x, drone.position.y)).fill(this.palette.drone).stroke({ color: 0xffffff, alpha: 0.32, width: 2 });
    }
  }

  private createPlayerView(player: PlayerSnapshot): PlayerView {
    const root = new Container();
    const rotating = new Container();
    const barrel = new Graphics();
    const body = new Graphics();
    const detail = new Graphics();
    const shield = new Graphics();
    rotating.addChild(barrel, body, detail, shield);
    root.addChild(rotating);
    const healthBackground = new Graphics();
    const healthFill = new Graphics();
    root.addChild(healthBackground, healthFill);
    const name = new Text({ text: `${player.name}${player.isBot ? ' · BOT' : ''}`, style: { fill: this.palette.label, fontSize: 12, fontWeight: '650', fontFamily: 'Inter, system-ui, sans-serif', dropShadow: { color: 0x000000, alpha: 0.5, blur: 2, distance: 1 } } });
    name.anchor.set(0.5);
    name.position.set(0, -39);
    root.addChild(name);
    const view: PlayerView = { root, rotating, body, barrel, detail, shield, healthBackground, healthFill, name, current: { ...player.position }, target: { ...player.position }, angle: player.angle, targetAngle: player.angle, snapshot: player };
    root.position.set(player.position.x, player.position.y);
    this.redrawPlayer(view, player.id === this.selfId);
    return view;
  }

  private redrawPlayer(view: PlayerView, isSelf: boolean): void {
    const player = view.snapshot;
    const color = isSelf ? this.palette.self : this.palette.enemy;
    view.body.clear().circle(0, 0, GAME.playerRadius).fill(color).stroke({ color: 0xffffff, alpha: 0.34, width: 3 });
    view.barrel.clear();
    view.detail.clear();
    if (player.playerClass === 'shooter') {
      view.barrel.roundRect(4, -8, 35, 16, 5).fill(this.palette.barrel).stroke({ color: 0x000000, alpha: 0.16, width: 2 });
      view.detail.circle(-5, 0, 5).fill({ color: 0xffffff, alpha: 0.13 });
    } else if (player.playerClass === 'sniper') {
      view.barrel.roundRect(4, -6, 51, 12, 4).fill(this.palette.barrel).stroke({ color: 0x000000, alpha: 0.18, width: 2 });
      view.detail.rect(15, -10, 9, 20).fill({ color, alpha: 0.9 });
      view.detail.circle(-5, 0, 5).fill({ color: 0xffffff, alpha: 0.13 });
    } else {
      view.detail.poly(polygonPoints(3, 10, 0)).fill(this.palette.drone);
      view.detail.circle(0, 0, 7).fill({ color: 0xffffff, alpha: 0.16 });
    }
    view.shield.clear();
    if (player.invulnerable) view.shield.circle(0, 0, GAME.playerRadius + 8).stroke({ color, alpha: 0.62, width: 2 });
    view.healthBackground.clear().roundRect(-25, 29, 50, 5, 3).fill({ color: 0x000000, alpha: 0.48 });
    view.healthFill.clear().roundRect(-25, 29, 50 * Math.max(0, player.health / player.maxHealth), 5, 3).fill(player.health / player.maxHealth > 0.35 ? 0x65d39a : 0xf05e72);
    view.name.text = `${player.name}${player.isBot ? ' · BOT' : ''}`;
    view.name.style.fill = this.palette.label;
  }
}
