import { Application, Container, Graphics, Text } from 'pixi.js';
import { GAME, type InputMessage, type PlayerClass, type WorldSnapshot } from '@project-maze/shared';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');
root.innerHTML = `<div class="overlay"><div class="start" id="start"><form class="card" id="join"><h1>Project Maze</h1><p>Moderner Browser-Arena-Prototyp. Zerstöre Formen, sammle XP und kämpfe dich durchs Maze.</p><input id="name" maxlength="18" value="Player" aria-label="Name"><select id="class"><option value="shooter">Shooter · Allrounder</option><option value="sniper">Sniper · Reichweite</option><option value="drone">Drone · Taktisch</option></select><button>ARENA BETRETEN</button></form></div><div class="hud" id="hud" hidden><div class="panel stats"><strong id="player">Level 1</strong><div id="health">100 HP</div><div class="bar"><div id="xp" style="width:0%"></div></div></div><div class="status" id="status">Verbinden …</div><div class="panel leaderboard" id="board"><strong>LEADERBOARD</strong></div></div><div class="joystick left" id="move-stick"><div class="stick"></div></div><div class="joystick right" id="aim-stick"><div class="stick"></div></div></div>`;

const app = new Application();
await app.init({ resizeTo: window, antialias: true, background: '#090b12', resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
root.prepend(app.canvas);
const world = new Container();
const grid = new Graphics();
const walls = new Graphics();
const shapes = new Graphics();
const bullets = new Graphics();
const tanks = new Container();
world.addChild(grid, walls, shapes, bullets, tanks);
app.stage.addChild(world);
for (let x = 0; x <= GAME.worldWidth; x += 80) grid.moveTo(x, 0).lineTo(x, GAME.worldHeight);
for (let y = 0; y <= GAME.worldHeight; y += 80) grid.moveTo(0, y).lineTo(GAME.worldWidth, y);
grid.stroke({ color: 0x171b29, width: 1 });
grid.rect(0, 0, GAME.worldWidth, GAME.worldHeight).stroke({ color: 0x31384e, width: 5 });

let socket: WebSocket | null = null;
let snapshot: WorldSnapshot | null = null;
let sequence = 0;
let selectedClass: PlayerClass = 'shooter';
const keys = new Set<string>();
const pointer = { x: innerWidth / 2, y: innerHeight / 2, down: false };
const touchMove = { x: 0, y: 0 };
const touchAim = { x: 1, y: 0, active: false };
const status = (value: string) => { const element = document.querySelector('#status'); if (element) element.textContent = value; };

function connect(name: string): void {
  const endpoint = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
  socket = new WebSocket(endpoint);
  socket.addEventListener('open', () => { socket?.send(JSON.stringify({ type: 'join', name, playerClass: selectedClass })); status('Online · Maze Alpha'); });
  socket.addEventListener('message', (event) => { snapshot = JSON.parse(event.data as string) as WorldSnapshot; });
  socket.addEventListener('close', () => status('Verbindung getrennt'));
  socket.addEventListener('error', () => status('Server nicht erreichbar'));
}

document.querySelector<HTMLFormElement>('#join')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.querySelector<HTMLInputElement>('#name')?.value.trim() || 'Player';
  selectedClass = (document.querySelector<HTMLSelectElement>('#class')?.value ?? 'shooter') as PlayerClass;
  document.querySelector('#start')?.remove();
  const hud = document.querySelector<HTMLElement>('#hud');
  if (hud) hud.hidden = false;
  connect(name);
});
addEventListener('keydown', (event) => keys.add(event.code));
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); pointer.down = false; });
addEventListener('pointermove', (event) => { pointer.x = event.clientX; pointer.y = event.clientY; });
addEventListener('pointerdown', (event) => { if (event.pointerType === 'mouse' && event.button === 0) pointer.down = true; });
addEventListener('pointerup', () => { pointer.down = false; });

function bindStick(id: string, target: { x: number; y: number }, active?: { active: boolean }): void {
  const area = document.querySelector<HTMLElement>(`#${id}`);
  const knob = area?.querySelector<HTMLElement>('.stick');
  if (!area || !knob) return;
  let pointerId: number | null = null;
  const update = (event: PointerEvent) => {
    const rect = area.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const scale = Math.min(1, 42 / Math.max(1, Math.hypot(dx, dy)));
    const px = dx * scale; const py = dy * scale;
    target.x = px / 42; target.y = py / 42;
    knob.style.transform = `translate(${px}px,${py}px)`;
  };
  area.addEventListener('pointerdown', (event) => { pointerId = event.pointerId; area.setPointerCapture(pointerId); if (active) active.active = true; update(event); });
  area.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
  const release = (event: PointerEvent) => { if (event.pointerId !== pointerId) return; pointerId = null; target.x = 0; target.y = 0; if (active) active.active = false; knob.style.transform = ''; };
  area.addEventListener('pointerup', release); area.addEventListener('pointercancel', release);
}
bindStick('move-stick', touchMove); bindStick('aim-stick', touchAim, touchAim);

setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  let x = 0; let y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (Math.abs(touchMove.x) + Math.abs(touchMove.y) > 0.05) { x = touchMove.x; y = touchMove.y; }
  const aim = touchAim.active ? { x: touchAim.x, y: touchAim.y } : { x: pointer.x - innerWidth / 2, y: pointer.y - innerHeight / 2 };
  const message: InputMessage = { type: 'input', sequence: ++sequence, move: { x, y }, aim, shooting: pointer.down || touchAim.active };
  socket.send(JSON.stringify(message));
}, 1000 / 30);

app.ticker.add(() => {
  if (!snapshot) return;
  const self = snapshot.players.find((player) => player.id === snapshot?.selfId);
  if (self) { world.x += (innerWidth / 2 - self.position.x - world.x) * 0.16; world.y += (innerHeight / 2 - self.position.y - world.y) * 0.16; }
  walls.clear(); for (const wall of snapshot.walls) walls.roundRect(wall.x, wall.y, wall.width, wall.height, 8).fill(0x252a3b).stroke({ color: 0x414960, width: 2 });
  shapes.clear(); for (const shape of snapshot.shapes) shapes.circle(shape.position.x, shape.position.y, shape.radius).fill(shape.radius > 15 ? 0xd9a84d : 0x5a67c9).stroke({ color: 0xffffff, alpha: 0.2, width: 2 });
  bullets.clear(); for (const projectile of snapshot.projectiles) bullets.circle(projectile.position.x, projectile.position.y, projectile.radius).fill(0xf5f7ff);
  tanks.removeChildren().forEach((child) => child.destroy());
  for (const player of snapshot.players) {
    const tank = new Container(); tank.position.set(player.position.x, player.position.y); tank.rotation = player.angle;
    tank.addChild(new Graphics().roundRect(0, -7, player.playerClass === 'sniper' ? 44 : 34, 14, 5).fill(0xb9bfd0), new Graphics().circle(0, 0, GAME.playerRadius).fill(player.id === snapshot.selfId ? 0x7883ff : 0xe66476).stroke({ color: 0xffffff, alpha: 0.35, width: 3 }));
    tanks.addChild(tank);
    const label = new Text({ text: player.name, style: { fill: 0xdfe3f1, fontSize: 12, fontWeight: '600' } }); label.anchor.set(0.5); label.position.set(player.position.x, player.position.y - 36); tanks.addChild(label);
  }
  if (self) {
    const player = document.querySelector('#player'); const health = document.querySelector('#health'); const xp = document.querySelector<HTMLElement>('#xp');
    if (player) player.textContent = `${self.name} · Level ${self.level}`;
    if (health) health.textContent = `${Math.max(0, Math.ceil(self.health))} HP · ${self.playerClass}`;
    if (xp) xp.style.width = `${self.xp % 100}%`;
  }
  const board = document.querySelector('#board'); if (board) board.innerHTML = `<strong>LEADERBOARD</strong>${snapshot.leaderboard.map((entry, index) => `<div>${index + 1}. ${entry.name} · ${entry.score}</div>`).join('')}`;
});
