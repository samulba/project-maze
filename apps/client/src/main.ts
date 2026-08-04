import {
  GAME,
  type JoinMessage,
  type PlayerSnapshot,
  type ServerMessage,
  type ThemeId,
  type UpgradeId,
  type UpgradeMessage,
  type WorldSnapshot
} from '@project-maze/shared';
import { GameAudio } from './audio';
import { InputController } from './input';
import { GameRenderer } from './renderer';
import { GameUI, type JoinOptions } from './ui';
import './style.css';
import './feel.css';

let socket: WebSocket | null = null;
let joinOptions: JoinOptions | null = null;
let reconnectTimer: number | null = null;
let reconnectDelay = 1200;
let lastLevel = 1;
let joined = false;
let input: InputController | null = null;
let previousSelf: PlayerSnapshot | null = null;
let previousProjectileIds = new Set<string>();

const audio = new GameAudio();

function sendUpgrade(upgrade: UpgradeId): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const message: UpgradeMessage = { type: 'upgrade', upgrade };
  socket.send(JSON.stringify(message));
}

const ui = new GameUI(
  (options) => {
    audio.unlock();
    joinOptions = options;
    renderer.setTheme(options.theme);
    ui.enterGame();
    connect();
  },
  sendUpgrade,
  () => input?.toggleAutoFire() ?? false
);

const renderer = new GameRenderer();
await renderer.init(ui.root);
input = new InputController(renderer.app.canvas, sendUpgrade, (enabled) => ui.setAutoFire(enabled), () => renderer.getSelfScreenPosition());
renderer.app.ticker.add(() => {
  if (!input) return;
  renderer.setCameraInput(
    input.getAim(),
    input.getMovement(),
    input.zoom,
    input.getPointerPosition(),
    input.isShooting,
    joined && input.showCrosshair
  );
});

function endpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:2567`;
}

function connect(): void {
  if (!joinOptions || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ui.setConnection('connecting');
  joined = false;
  const currentSocket = new WebSocket(endpoint());
  socket = currentSocket;

  currentSocket.addEventListener('open', () => {
    reconnectDelay = 1200;
    const message: JoinMessage = { type: 'join', name: joinOptions?.name ?? 'Player', playerClass: joinOptions?.playerClass ?? 'shooter' };
    currentSocket.send(JSON.stringify(message));
  });

  currentSocket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      handleServerMessage(message);
    } catch {
      ui.toast('Netzwerkfehler', 'Der Server hat ungültige Daten gesendet.', 'danger');
    }
  });

  currentSocket.addEventListener('close', () => {
    joined = false;
    previousSelf = null;
    previousProjectileIds.clear();
    ui.setConnection('offline', 'VERBINDUNG VERLOREN');
    if (socket === currentSocket && joinOptions) {
      reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(8000, Math.round(reconnectDelay * 1.65));
    }
  });

  currentSocket.addEventListener('error', () => ui.setConnection('offline', 'SERVER NICHT ERREICHBAR'));
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'welcome') {
    joined = true;
    previousSelf = null;
    previousProjectileIds.clear();
    lastLevel = 1;
    ui.setConnection('online', 'MAZE ALPHA');
    ui.toast('Arena betreten', 'Zerstöre Formen, sammle Punkte und entwickle deinen Build.', 'success');
    return;
  }
  if (message.type === 'error') {
    ui.toast('Beitritt fehlgeschlagen', message.message, 'danger');
    return;
  }
  if (message.type === 'pong') {
    ui.setPing(performance.now() - message.sentAt);
    return;
  }
  updateWorld(message);
}

function updateWorld(snapshot: WorldSnapshot): void {
  const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
  if (self) playSnapshotAudio(snapshot, self);
  renderer.setSnapshot(snapshot);
  const updatedSelf = ui.update(snapshot);
  if (!updatedSelf) return;
  if (updatedSelf.level > lastLevel) ui.toast(`Level ${updatedSelf.level}`, 'Du hast einen neuen Upgrade-Punkt erhalten.', 'success');
  lastLevel = updatedSelf.level;
  previousSelf = { ...updatedSelf, position: { ...updatedSelf.position }, velocity: { ...updatedSelf.velocity }, upgrades: { ...updatedSelf.upgrades } };
  previousProjectileIds = new Set(snapshot.projectiles.map((projectile) => projectile.id));
}

function playSnapshotAudio(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
  if (previousSelf) {
    if (self.health < previousSelf.health - 0.01 && self.deaths === previousSelf.deaths) audio.damage();
    if (self.kills > previousSelf.kills) audio.kill();
    if (self.deaths > previousSelf.deaths) audio.death();
    if (self.level > previousSelf.level) audio.level();
  }
  if (self.playerClass !== 'drone') {
    const fired = snapshot.projectiles.some((projectile) => projectile.ownerId === self.id && !previousProjectileIds.has(projectile.id));
    if (fired) audio.shot(self.playerClass);
  }
}

window.setInterval(() => {
  if (!joined || !input || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(input.nextMessage()));
}, 1000 / GAME.tickRate);

window.setInterval(() => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'ping', sentAt: performance.now() }));
}, 2000);

const storedTheme = (window.localStorage.getItem('project-maze-theme') as ThemeId | null) ?? 'midnight';
document.documentElement.dataset.theme = storedTheme;
const themeSelect = document.querySelector<HTMLSelectElement>('#theme');
if (themeSelect) {
  themeSelect.value = storedTheme;
  themeSelect.addEventListener('change', () => {
    const theme = themeSelect.value as ThemeId;
    window.localStorage.setItem('project-maze-theme', theme);
    document.documentElement.dataset.theme = theme;
    renderer.setTheme(theme);
  });
}
renderer.setTheme(storedTheme);
