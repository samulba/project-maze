import {
  ARENA_MODES,
  CLASS_DEFINITIONS,
  GAME,
  type ChooseClassMessage,
  type JoinMessage,
  type PlayerClass,
  type PlayerSnapshot,
  type RespawnMessage,
  type ServerMessage,
  type UpgradeMessage,
  type WorldSnapshot
} from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import type { UpgradeSlotId } from './family-upgrades';
import { GameAudio } from './audio';
import { AuthClient, AUTH_TIMEOUT_MS, withTimeout } from './auth';
import { AuthPanel } from './auth-panel';
import { ProfilePanel } from './profile-panel';
import { BalanceCombatMeter } from './balance-combat-meter';
import { deviceId } from './device-id';
import { BalanceLab } from './balance-lab';
import { enhanceClassChoices } from './class-choice-enhancer';
import { AchievementPopups } from './achievement-popups';
import { GameplayEffects } from './gameplay-effects';
import { GameplayUI } from './gameplay-ui';
import { InputController } from './input';
import { OnboardingCoach } from './onboarding-view';
import { startPerfReporting } from './perf-metrics';
import { PredictionEngine } from './prediction';
import { PredictionToggle } from './prediction-panel';
import { QualityControl } from './quality-panel';
import { GameRenderer } from './renderer';
import { SnapshotHydrator, isWireSnapshot, type WireServerMessage } from './snapshot-hydrator';
import { SpectatorBanner } from './spectator';
import { StartBackdrop } from './start-backdrop';
import { StartLeaderboard } from './start-leaderboard';
import { StartNav } from './start-nav';
import { ClassCodex, ClassOverlay } from './class-codex';
import { DEFAULT_THEME, applyTheme } from './themes';
import { GameUI, type JoinOptions } from './ui';
import './style.css';
import './stability.css';
import './boot.css';
import './start.css';
import './balance-lab.css';
import './class-choice.css';
import './gameplay-ui.css';
import './controls.css';
import './mobile.css';
import './spectator.css';
import './onboarding.css';
import './achievements.css';
import './auth.css';
import './profile.css';
// Zuletzt: sammelt die Layout-Reparaturen aus der UI-Fehlersuche und muss
// gegen die Kurzfassungen in style.css und mobile.css gewinnen.
import './class-tree.css';
import './hud-layout.css';

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
const hydrator = new SnapshotHydrator();
// Client-Prediction (N2). Ausgeschaltet rechnet sie nicht mit, sie wird nicht
// nur ausgeblendet – „Flag aus" soll heißen, dass nichts passiert.
const prediction = new PredictionEngine();
let predictionEnabled = false;

// Der Login läuft parallel zum Renderer-Start und wird bewusst nirgends
// abgewartet: Ohne Konfiguration liefert er `null`, und der Startscreen darf
// sich von einer langsamen Anmeldung nicht aufhalten lassen.
const authReady: Promise<AuthClient | null> = AuthClient.create().catch((error) => {
  console.error('Login-Start fehlgeschlagen', error);
  return null;
});

function send(message: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/**
 * Ein Upgrade anfordern. Der Cast überbrückt die beiden Familien-Slots (KL4),
 * die `UPGRADE_IDS` in `shared` noch nicht kennt – 01 baut sie nach 02s Konzept
 * ein, danach fällt er ersatzlos weg. Angeboten werden sie ohnehin erst, wenn
 * der Server sie selbst im Snapshot führt (siehe `ui.ts`).
 */
function sendUpgrade(upgrade: UpgradeSlotId): void {
  send({ type: 'upgrade', upgrade } satisfies Omit<UpgradeMessage, 'upgrade'> & { upgrade: UpgradeSlotId });
}

const ui = new GameUI(
  (options) => {
    audio.unlock();
    joinOptions = options;
    renderer.setTheme(options.theme);
    ui.setJoinPending(true, 'Verbindung zur Arena wird hergestellt …');
    connect();
  },
  sendUpgrade,
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
// Muss direkt nach der GameplayUI laufen: sie hängt das Loadout-Panel vor den
// Play-Button, der Startscreen will es eingeklappt bei den Einstellungen.
ui.adoptStartSettings();

// Startseite und Unterseiten (Befund 2). Muss vor den Panels laufen, damit
// deren Flächen schon in der richtigen Seite hängen.
const startNav = new StartNav(ui.root);
// Enzyklopädie (KL3). Sie hängt an keiner Verbindung – der Klassenbaum steht
// im Client, sie funktioniert also auch ohne Server und ohne Anmeldung.
const codexHost = ui.root.querySelector<HTMLElement>('[data-codex-body]');
if (codexHost) new ClassCodex(codexHost);
const startBackdrop = new StartBackdrop(document.querySelector<HTMLCanvasElement>('#start-backdrop')!);
startBackdrop.start();
ui.onStartScreenGone(() => startBackdrop.stop());
void new StartLeaderboard(ui.root).load();
// Ohne konfigurierten Login bleibt der Container leer und versteckt – es gibt
// dann keinen Knopf, der ins Leere führt.
const profilePanel = new ProfilePanel(
  ui.root,
  (title, message, tone) => ui.toast(title, message, tone),
  (name) => ui.prefillPlayerName(name)
);
void authReady.then((client) => {
  if (!client) return;
  new AuthPanel(ui.root, client, (title, message, tone) => ui.toast(title, message, tone), (name) => ui.prefillPlayerName(name));
  // Das Profil-Panel kennt Supabase nicht – es bekommt nur ein frisches Token,
  // wenn es eines braucht.
  profilePanel.setTokenProvider(() => client.accessToken());
  client.onChange((user) => profilePanel.setUser(user));
  profilePanel.setUser(client.user);
});
// Das Rad im Spiel (Taste C). Es hält nichts an und schluckt keine Klicks,
// die ins Spielfeld gehören – siehe class-codex.ts.
const classOverlay = new ClassOverlay(ui.root.querySelector<HTMLElement>('#hud') ?? ui.root);
const spectator = new SpectatorBanner(ui.root);
const onboarding = new OnboardingCoach(ui.root);
const achievements = new AchievementPopups(ui.root);
new BalanceLab(ui.root, send);
const balanceCombatMeter = new BalanceCombatMeter(ui.root);
enhanceClassChoices(ui.root);

// Der Startscreen bleibt gesperrt, bis der Renderer wirklich läuft: PixiJS lädt seine
// Renderer-Chunks dynamisch nach, und ein Klick davor hätte keinen Renderer zum Zeichnen.
const GRAPHICS_HELP = 'Grafik konnte nicht gestartet werden. Das liegt fast immer am Browser: Hardwarebeschleunigung einschalten (Einstellungen → System), ein paar Tabs schließen oder den Browser einmal komplett schließen und neu öffnen. Danach unten auf NEU LADEN drücken.';

ui.setJoinPending(true, 'Grafik wird geladen …', 'booting');
// Die Stufe muss VOR dem Start feststehen: Antialias und Auflösung lassen sich
// an einem laufenden Grafikkontext nicht mehr ändern.
// Beides muss VOR dem ersten Frame feststehen: die Stufe, weil Antialias und
// Auflösung sich an einem laufenden Kontext nicht mehr ändern lassen – der
// Sichtfeld-Modus, damit der Startschuss nicht mit 16:9 beginnt und dann
// sichtbar umspringt.
renderer.setViewMode(QualityControl.initialViewMode());
const rendererReady = renderer.init(ui.root, QualityControl.initialTier());
new QualityControl(ui.root, renderer, () => enteredGame && joined);
new PredictionToggle(ui.root, (enabled) => {
  predictionEnabled = enabled;
  prediction.reset();
  renderer.setSelfPredictor(enabled ? prediction : null);
});
// Sicherheitsnetz hinter den Init-Zeitlimits (3 Versuche à 6 s): Sollte trotzdem
// etwas hängen, bleibt der Spieler nicht ohne Erklärung sitzen.
const stuckNotice = window.setTimeout(() => ui.setJoinPending(true, GRAPHICS_HELP, 'failed'), 20_000);
const GFX_RETRY_KEY = 'mazersGfxAutoRetry';
try {
  await rendererReady;
  window.clearTimeout(stuckNotice);
  try { sessionStorage.removeItem(GFX_RETRY_KEY); } catch { /* Storage blockiert – egal */ }
  ui.setJoinPending(false);
} catch (error) {
  window.clearTimeout(stuckNotice);
  console.error('Renderer-Init fehlgeschlagen', error);
  // Hängengebliebene Kontexte anderer Tabs verschwinden oft schon durch ein
  // Neuladen – ein Versuch passiert deshalb automatisch, aber nur einer. Neu
  // geladen wird nur, wenn die Sperre nachweislich gespeichert wurde: Ein
  // Browser ohne sessionStorage (strikter Privatmodus) würde sonst endlos laden.
  let autoRetry = false;
  try {
    if (!sessionStorage.getItem(GFX_RETRY_KEY)) {
      sessionStorage.setItem(GFX_RETRY_KEY, '1');
      autoRetry = sessionStorage.getItem(GFX_RETRY_KEY) === '1';
    }
  } catch { autoRetry = false; }
  if (autoRetry) {
    location.reload();
    throw error;
  }
  const detail = error instanceof Error && error.message ? ` — Diagnose: ${error.message}` : '';
  ui.setJoinPending(true, GRAPHICS_HELP + detail, 'failed');
  throw error;
}
const gameplayEffects = new GameplayEffects(renderer.app, () => renderer.currentViewMode);
input = new InputController(
  renderer.app.canvas,
  (pointer) => renderer.screenPointToWorldAim(pointer),
  sendUpgrade,
  (enabled) => ui.setAutoFire(enabled),
  () => classOverlay.toggle()
);
// Esc schließt das Rad. Nur wenn es offen ist – sonst nähme es dem Browser
// eine Taste weg, die er im Vollbild selbst braucht.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && classOverlay.isOpen) {
    event.preventDefault();
    classOverlay.setOpen(false);
  }
});
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

/**
 * HTTP-Basis des Servers – dieselbe Herleitung wie beim WebSocket, nur mit
 * http/https. In der Entwicklung liegt der Server auf 2567, in Produktion auf
 * derselben Origin wie die Seite.
 */
function httpBase(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured.replace(/^ws/, 'http').replace(/\/$/, '');
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:2567`;
  return window.location.origin;
}

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

/**
 * Holt bei jedem Join ein frisches Zugriffstoken. Wichtig beim Auto-Reconnect:
 * Nach einer längeren Unterbrechung ist das alte Token womöglich abgelaufen,
 * `getSession()` erneuert es. Antwortet der Login nicht rechtzeitig oder ist er
 * gar nicht eingerichtet, wird als Gast gejoint – blockiert wird nie.
 */
async function currentAuthToken(): Promise<string | null> {
  const client = await withTimeout(authReady, AUTH_TIMEOUT_MS, null);
  return client ? client.accessToken(AUTH_TIMEOUT_MS) : null;
}

async function sendJoin(target: WebSocket): Promise<void> {
  const authToken = await currentAuthToken();
  // Während des Wartens auf das Token kann die Verbindung schon wieder weg sein.
  if (target.readyState !== WebSocket.OPEN) return;
  const message: JoinMessage = { type: 'join', name: joinOptions?.name ?? 'Player' };
  if (authToken) message.authToken = authToken;
  // Zaehlt den Besuch im Admin-Portal. Fehlt der Speicher, fehlt die ID - der
  // Join laeuft dann genauso, nur ungezaehlt.
  const device = deviceId();
  if (device) message.deviceId = device;
  target.send(JSON.stringify(message));
}

function connect(): void {
  if (!joinOptions || socket?.readyState === WebSocket.CONNECTING) return;
  if (socket?.readyState === WebSocket.OPEN) {
    void sendJoin(socket);
    return;
  }
  clearReconnectTimer();
  // Neue Verbindung heißt neue Spieler-ID und damit eine frische Buchführung
  // auf Serverseite – der alte Cache passt dann zu nichts mehr.
  hydrator.reset();
  // Auch die Sequenznummern beginnen von vorn; ein alter Puffer würde gegen
  // eine Quittung geprüft, die zu einer anderen Verbindung gehört.
  prediction.reset();
  ui.setConnection('connecting');
  joined = false;
  input?.setEnabled(false);

  const currentSocket = new WebSocket(endpoint());
  socket = currentSocket;

  currentSocket.addEventListener('open', () => {
    reconnectDelay = 1200;
    void sendJoin(currentSocket);
  });

  currentSocket.addEventListener('message', (event) => {
    try {
      // Der Hydrator sitzt bewusst genau hier: Ab der nächsten Zeile sieht
      // niemand mehr einen unvollständigen Snapshot.
      const message = JSON.parse(String(event.data)) as WireServerMessage;
      handleServerMessage(isWireSnapshot(message) ? hydrator.hydrate(message) : message);
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
    prediction.reset();
    previousSelf = null;
    previousProjectileIds.clear();
    previousModuleActiveUntil = 0;
    gameplayUI.onDisconnect();
    spectator.reset();
    achievements.reset();
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
    // Deckt auch den Rejoin über einen bereits offenen Socket ab: Der Server
    // vergibt dabei eine neue Spieler-ID und sendet wieder volle Snapshots.
    hydrator.reset();
    prediction.reset();
    previousSelf = null;
    previousProjectileIds.clear();
    previousModuleActiveUntil = 0;
    ui.setJoinPending(false);
    ui.enterGame();
    gameplayUI.onWelcome();
    enteredGame = true;
    /*
     * Der Modus steht nur dann im Etikett, wenn er nicht der Standard ist.
     *
     * Solange nur Maze läuft, wäre „MAZERS · MAZE" eine Auskunft ohne
     * Alternative – Platz, der nichts sagt. Sobald aber ein zweiter Modus
     * existiert, muss ein Spieler ohne Nachdenken wissen, wo er gelandet ist:
     * In FFA gibt es keine Deckung, und wer das erst nach dem ersten Tod
     * merkt, hält das Spiel für kaputt statt für anders.
     */
    const modus = message.mode ?? 'maze';
    ui.setConnection('online', modus === 'maze' ? 'MAZERS ALPHA' : `MAZERS · ${ARENA_MODES[modus].label.toUpperCase()}`);
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
  spectator.update(snapshot);
  achievements.update(snapshot);
  onboarding.update(snapshot, input?.isMoving ?? false);
  const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
  if (self) {
    playSnapshotAudio(snapshot, self);
    classOverlay.setCurrent(self.playerClass);
    const extended = snapshot as WorldSnapshot & Partial<GameplayWorldExtension>;
    const gameplay = extended.gameplay?.[self.id];
    if (predictionEnabled) {
      // Vor dem Renderer und vor dem HUD: Beide sollen im selben Frame denselben
      // Stand sehen. `snapshot.walls` kommt aus dem Hydrator und trägt auch dann
      // die aktuelle Wandliste, wenn der Server sie diesmal weggelassen hat.
      const sample = prediction.reconcile(snapshot, self, gameplay?.passiveModifier);
      // Der Füllstand der Signature wird mitgerechnet (Doku, Abschnitte 6/7) –
      // gerundet, weil im Snapshot ebenfalls die gerundete Zahl steht.
      if (sample?.signature !== null && sample?.signature !== undefined) {
        self.signature = Math.round(sample.signature);
      }
    }
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
  const message = input.nextMessage();
  socket.send(JSON.stringify(message));
  // Genau dieselbe Nachricht puffern, die rausgegangen ist – die Quittung des
  // Servers nennt deren Sequenznummer, eine zweite Fassung passte nicht dazu.
  if (predictionEnabled) prediction.record(message);
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
  const volumeValue = document.querySelector<HTMLElement>('#volume-value');
  // Der eigene Regler zeichnet den gefüllten Teil der Schiene selbst – WebKit
  // hat dafür kein Gegenstück zu ::-moz-range-progress, also kommt der Stand
  // als CSS-Variable von hier.
  const showVolume = (percent: number): void => {
    volumeSlider.style.setProperty('--fill', `${percent}%`);
    if (volumeValue) volumeValue.textContent = `${percent}%`;
  };
  volumeSlider.value = String(Math.round(audio.getVolume() * 100));
  showVolume(Number(volumeSlider.value));
  volumeSlider.addEventListener('input', () => {
    audio.unlock();
    const percent = Number(volumeSlider.value);
    audio.setVolume(percent / 100);
    showVolume(percent);
  });
}

// Vorerst ein einziges, neutrales Erscheinungsbild – die Themes bleiben im Code,
// die Auswahl kommt erst zurück, wenn jede Variante wirklich gepflegt ist.
// Perf-Telemetrie (R5): einmal pro Minute, frühestens 60 s nach dem Betreten
// der Arena. Anonym, ohne Token, Fehler werden verschluckt.
startPerfReporting({
  baseUrl: httpBase(),
  quality: () => renderer.quality,
  playing: () => enteredGame && joined
});

applyTheme(DEFAULT_THEME);
renderer.setTheme(DEFAULT_THEME);
