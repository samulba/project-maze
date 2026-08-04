import { type JoinMessage, type ServerMessage, type ThemeId, type UpgradeId, type UpgradeMessage, type WorldSnapshot } from '@project-maze/shared';
import { InputController } from './input';
import { GameRenderer } from './renderer';
import { GameUI, type JoinOptions } from './ui';
import './style.css';

let socket: WebSocket | null = null;
let joinOptions: JoinOptions | null = null;
let reconnectTimer: number | null = null;
let reconnectDelay = 1200;
let lastLevel = 1;
let joined = false;
let input: InputController | null = null;

function sendUpgrade(upgrade: UpgradeId): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const message: UpgradeMessage = { type: 'upgrade', upgrade };
  socket.send(JSON.stringify(message));
}

const ui = new GameUI(
  (options) => {
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
input = new InputController(renderer.app.canvas, sendUpgrade, (enabled) => ui.setAutoFire(enabled));
renderer.app.ticker.add(() => {
  if (input) renderer.setCameraInput(input.getAim(), input.zoom);
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
  renderer.setSnapshot(snapshot);
  const self = ui.update(snapshot);
  if (!self) return;
  if (self.level > lastLevel) ui.toast(`Level ${self.level}`, 'Du hast einen neuen Upgrade-Punkt erhalten.', 'success');
  lastLevel = self.level;
}

window.setInterval(() => {
  if (!joined || !input || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(input.nextMessage()));
}, 1000 / 30);

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
