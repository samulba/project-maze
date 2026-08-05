import {
  CLASS_DEFINITIONS,
  GAME,
  type ChooseClassMessage,
  type JoinMessage,
  type PlayerClass,
  type PlayerSnapshot,
  type RespawnMessage,
  type ServerMessage,
  type UpgradeId,
  type UpgradeMessage,
  type WorldSnapshot
} from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { GameAudio } from './audio';
import { BalanceCombatMeter } from './balance-combat-meter';
import { BalanceLab } from './balance-lab';
import { enhanceClassChoices } from './class-choice-enhancer';
import { GameplayEffects } from './gameplay-effects';
import { GameplayUI } from './gameplay-ui';
import { InputController } from './input';
import { KillcamView } from './killcam-view';
import { OnboardingCoach } from './onboarding-view';
import { GameRenderer } from './renderer';
import { DEFAULT_THEME, applyTheme } from './themes';
import { GameUI, type JoinOptions } from './ui';
import './style.css';
import './stability.css';
import './boot.css';
import './balance-lab.css';
import './class-choice.css';
import './gameplay-ui.css';
import './mobile.css';
import './killcam.css';
import './onboarding.css';

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
let previousModuleActiveUntil = 0;
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
const gameplayUI = new GameplayUI(ui.root, send);
const killcam = new KillcamView(ui.root);
const onboarding = new OnboardingCoach(ui.root);
new BalanceLab(ui.root, send);
const balanceCombatMeter = new BalanceCombatMeter(ui.root);
enhanceClassChoices(ui.root);

// Der Startscreen bleibt gesperrt, bis der Renderer wirklich läuft: PixiJS lädt seine
// Renderer-Chunks dynamisch nach, und ein Klick davor hätte keinen Renderer zum Zeichnen.
const GRAPHICS_HELP = 'Grafik konnte nicht gestartet werden. Das liegt fast immer am Browser: Hardwarebeschleunigung einschalten (Einstellungen → System) oder ein paar Tabs schließen – Browser vergeben nur eine begrenzte Zahl an WebGL-Fenstern. Danach Seite neu laden.';

ui.setJoinPending(true, 'Grafik wird geladen …', 'booting');
const rendererReady = renderer.init(ui.root);
// Hängt PixiJS trotz vorhandenem Kontext, bleibt der Spieler sonst ohne Erklärung sitzen.
const stuckNotice = window.setTimeout(() => ui.setJoinPending(true, GRAPHICS_HELP, 'failed'), 8000);
try {
  await rendererReady;
  window.clearTimeout(stuckNotice);
  ui.setJoinPending(false);
} catch (error) {
  window.clearTimeout(stuckNotice);
  console.error('Renderer-Init fehlgeschlagen', error);
  ui.setJoinPending(true, GRAPHICS_HELP, 'failed');
  throw error;
}
const gameplayEffects = new GameplayEffects(renderer.app);
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
  // Dev: Vite (5173) spricht den lokalen Game-Server auf 2567 an.
  if (import.meta.env.DEV) return `${protocol}://${window.location.hostname}:2567`;
  // Produktion (Single-Service): gleiche Origin wie die ausgelieferte Seite.
  return `${protocol}://${window.location.host}`;
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
    previousModuleActiveUntil = 0;
    gameplayUI.onDisconnect();
    killcam.reset();
    onboarding.pause();
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
    previousModuleActiveUntil = 0;
    ui.setJoinPending(false);
    ui.enterGame();
    gameplayUI.onWelcome();
    enteredGame = true;
    ui.setConnection('online', 'MAZERS ALPHA');
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
  balanceCombatMeter.update(snapshot);
  gameplayUI.update(snapshot);
  gameplayEffects.update(snapshot);
  killcam.update(snapshot);
  onboarding.update(snapshot, input?.isMoving ?? false);
  const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
  if (self) {
    playSnapshotAudio(snapshot, self);
    const extended = snapshot as WorldSnapshot & Partial<GameplayWorldExtension>;
    const gameplay = extended.gameplay?.[self.id];
    if (
      gameplay &&
      gameplay.moduleActiveUntil > snapshot.serverTime &&
      gameplay.moduleActiveUntil > previousModuleActiveUntil
    ) {
      audio.module(gameplay.activeModule);
    }
    previousModuleActiveUntil = gameplay?.moduleActiveUntil ?? 0;
  }
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

let previousArenaPhase: string | null = null;
let previousBountyId: string | null = null;

function playSnapshotAudio(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
  if (previousSelf) {
    const healthDrop = previousSelf.health - self.health;
    if (healthDrop > 0.01 && self.deaths === previousSelf.deaths) {
      audio.damage(healthDrop / 10);
      renderer.shake(Math.min(6, 1.5 + healthDrop * 0.12));
    }
    if (self.kills > previousSelf.kills) {
      audio.kill(self.streak);
      renderer.shake(3);
    }
    if (self.deaths > previousSelf.deaths) {
      audio.death();
      renderer.shake(9);
    }
    if (self.level > previousSelf.level) audio.level();
  }
  if (CLASS_DEFINITIONS[self.playerClass].barrelCount > 0) {
    const fired = snapshot.projectiles.some(
      (projectile) => projectile.ownerId === self.id && !previousProjectileIds.has(projectile.id)
    );
    if (fired) audio.shot(self.playerClass);
  }
  const extended = snapshot as WorldSnapshot & Partial<GameplayWorldExtension>;
  const phase = extended.arenaEvent?.phase ?? null;
  if ((phase === 'warning' && previousArenaPhase === null) || (phase === 'active' && previousArenaPhase === 'warning')) {
    audio.eventHorn();
  }
  previousArenaPhase = phase;
  const bountyId = extended.bountyTargetId ?? null;
  if (bountyId && bountyId !== previousBountyId) audio.bounty();
  previousBountyId = bountyId;
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

const volumeSlider = document.querySelector<HTMLInputElement>('#volume');
if (volumeSlider) {
  volumeSlider.value = String(Math.round(audio.getVolume() * 100));
  volumeSlider.addEventListener('input', () => {
    audio.unlock();
    audio.setVolume(Number(volumeSlider.value) / 100);
  });
}

// Vorerst ein einziges, neutrales Erscheinungsbild – die Themes bleiben im Code,
// die Auswahl kommt erst zurück, wenn jede Variante wirklich gepflegt ist.
applyTheme(DEFAULT_THEME);
renderer.setTheme(DEFAULT_THEME);
