import {
  CLASS_DEFINITIONS,
  GAME,
  type ChooseClassMessage,
  type JoinMessage,
  type PlayerClass,
  type PlayerSnapshot,
  type RespawnMessage,
  type ServerMessage,
  type ThemeId,
  type UpgradeId,
  type UpgradeMessage,
  type WorldSnapshot
} from '@project-maze/shared';
import { GameAudio } from './audio';
import { BalanceLab } from './balance-lab';
import { enhanceClassChoices } from './class-choice-enhancer';
import { InputController } from './input';
import { GameRenderer } from './renderer';
import { GameUI, type JoinOptions } from './ui';
import './style.css';
import './stability.css';
import './balance-lab.css';
import './class-choice.css';

let socket: WebSocket | null = null;
let joinOptions: JoinOptions | null = null;
let reconnectTimer: number | null = null;
let reconnectDelay = 1200;
let joined = false;
let enteredGame = false;
let currentSelfDead = true;
let input: InputController | null = null;
let previousSelf: PlayerSnapshot | null = null;
let previousProjectileIds = new Set<string>();
let lastClientErrorToastAt = 0;

const audio = new GameAudio();
const renderer = new GameRenderer();

function send(message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

const ui = new GameUI(
  (options) => {
    audio.unlock();
    joinOptions = options;
    renderer.setTheme(options.theme);
    ui.setJoinPending(true, 'Verbindung zur Arena wird hergestellt …');
    connect();
  },
  (upgrade: UpgradeId) => {
    const message: UpgradeMessage = { type: 'upgrade', upgrade };
    send(message);
  },
  () => input?.toggleAutoFire() ?? false,
  (playerClass: PlayerClass) => {
    const message: ChooseClassMessage = { type: 'chooseClass', playerClass };
    send(message);
  },
  () => {
    const message: RespawnMessage = { type: 'respawn' };
    send(message);
  }
);
new BalanceLab(ui.root, send);
enhanceClassChoices(ui.root);

await renderer.init(ui.root);
input = new InputController(
  renderer.app.canvas,
  (pointer) => renderer.screenPointToWorldAim(pointer),
  (upgrade) => send({ type: 'upgrade', upgrade } satisfies UpgradeMessage),
  (enabled) => ui.setAutoFire(enabled)
);
input.setEnabled(false);

renderer.app.ticker.add(() => {
  if (!input) return;
  renderer.setInput(
    input.getPointerPosition(),
    input.isPrimary,
    input.isSecondary,
    joined && !currentSelfDead && input.showCrosshair
  );
});

function endpoint(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.hostname}:2567`;
}

function clearReconnectTimer(): void {
  if (reconnectTimer === null) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function connect(): void {
  if (!joinOptions || socket?.readyState === WebSocket.CONNECTING) return;
  if (socket?.readyState === WebSocket.OPEN) {
    const message: JoinMessage = { type: 'join', name: joinOptions.name };
    socket.send(JSON.stringify(message));
    return;
  }
  clearReconnectTimer();
  ui.setConnection('connecting');
  joined = false;
  input?.setEnabled(false);

  const currentSocket = new WebSocket(endpoint());
  socket = currentSocket;

  currentSocket.addEventListener('open', () => {
    reconnectDelay = 1200;
    const message: JoinMessage = { type: 'join', name: joinOptions?.name ?? 'Player' };
    currentSocket.send(JSON.stringify(message));
  });

  currentSocket.addEventListener('message', (event) => {
    try {
      handleServerMessage(JSON.parse(String(event.data)) as ServerMessage);
    } catch (error) {
      console.error('Invalid server message', error);
      ui.toast('Netzwerkfehler', 'Der Server hat ungültige Daten gesendet.', 'danger');
    }
  });

  currentSocket.addEventListener('close', () => {
    if (socket !== currentSocket) return;
    socket = null;
    joined = false;
    currentSelfDead = true;
    previousSelf = null;
    previousProjectileIds.clear();
    if (input?.resetAll()) ui.setAutoFire(false);
    input?.setEnabled(false);
    ui.setConnection('offline', 'VERBINDUNG VERLOREN');

    if (!enteredGame) {
      ui.setJoinPending(false, 'Server nicht erreichbar. Prüfe, ob npm run dev noch läuft.');
      return;
    }
    if (joinOptions) {
      reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(8000, Math.round(reconnectDelay * 1.65));
    }
  });

  currentSocket.addEventListener('error', () => {
    ui.setConnection('offline', 'SERVER NICHT ERREICHBAR');
  });
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === 'welcome') {
    joined = true;
    currentSelfDead = false;
    previousSelf = null;
    previousProjectileIds.clear();
    ui.setJoinPending(false);
    ui.enterGame();
    enteredGame = true;
    ui.setConnection('online', 'MAZE ALPHA');
    ui.toast('Arena betreten', 'Farme Formen und entwickle deinen Tank.', 'success');
    input?.setEnabled(true);
    return;
  }

  if (message.type === 'error') {
    ui.toast('Beitritt fehlgeschlagen', message.message, 'danger');
    if (!enteredGame) ui.setJoinPending(false, message.message);
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

  const wasDead = previousSelf?.dead ?? false;
  currentSelfDead = updatedSelf.dead;
  if (updatedSelf.dead && !wasDead) {
    if (input?.resetAll()) ui.setAutoFire(false);
  }
  if (!updatedSelf.dead && wasDead) input?.resetTransient();
  input?.setEnabled(joined && !updatedSelf.dead);

  if (previousSelf && updatedSelf.level > previousSelf.level) {
    ui.toast(`Level ${updatedSelf.level}`, 'Du hast einen neuen Upgrade-Punkt erhalten.', 'success');
  }

  previousSelf = {
    ...updatedSelf,
    position: { ...updatedSelf.position },
    velocity: { ...updatedSelf.velocity },
    upgrades: { ...updatedSelf.upgrades }
  };
  previousProjectileIds = new Set(snapshot.projectiles.map((projectile) => projectile.id));
}

function playSnapshotAudio(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
  if (previousSelf) {
    if (self.health < previousSelf.health - 0.01 && self.deaths === previousSelf.deaths) audio.damage();
    if (self.kills > previousSelf.kills) audio.kill();
    if (self.deaths > previousSelf.deaths) audio.death();
    if (self.level > previousSelf.level) audio.level();
  }
  if (CLASS_DEFINITIONS[self.playerClass].barrelCount > 0) {
    const fired = snapshot.projectiles.some(
      (projectile) => projectile.ownerId === self.id && !previousProjectileIds.has(projectile.id)
    );
    if (fired) audio.shot(self.playerClass);
  }
}

window.setInterval(() => {
  if (!joined || currentSelfDead || !input || socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(input.nextMessage()));
}, 1000 / GAME.tickRate);

window.setInterval(() => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'ping', sentAt: performance.now() }));
  }
}, 2000);

function reportClientError(error: unknown): void {
  console.error(error);
  const now = Date.now();
  if (now - lastClientErrorToastAt < 4000) return;
  lastClientErrorToastAt = now;
  ui.toast('Client-Fehler', 'Ein Fehler wurde abgefangen. Details stehen in der Browserkonsole.', 'danger');
}
window.addEventListener('error', (event) => reportClientError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportClientError(event.reason));

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
