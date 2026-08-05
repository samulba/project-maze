import {
  CLASS_DEFINITIONS,
  GAME,
  UPGRADE_IDS,
  availableClassChoices,
  xpAtLevelStart,
  type PlayerClass,
  type PlayerSnapshot,
  type UpgradeId,
  type WorldSnapshot
} from '@project-maze/shared';
import type { ArenaEventKind } from '@project-maze/shared/gameplay';
import { arenaEventStyle, cssColor } from './arena-event-style';
import { DEFAULT_THEME, applyTheme, type ClientThemeId } from './themes';

export interface JoinOptions {
  name: string;
  theme: ClientThemeId;
}

const upgradeLabels: Record<UpgradeId, string> = {
  maxHealth: 'Max. Leben',
  regen: 'Regeneration',
  moveSpeed: 'Bewegung',
  reload: 'Nachladen',
  damage: 'Kugelschaden',
  projectileSpeed: 'Kugeltempo',
  penetration: 'Durchschlag',
  bodyDamage: 'Körperschaden'
};

export class GameUI {
  readonly root: HTMLDivElement;
  private readonly start: HTMLElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly joinStatus: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly connection: HTMLElement;
  private readonly ping: HTMLElement;
  private readonly playerName: HTMLElement;
  private readonly className: HTMLElement;
  private readonly level: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly xpBar: HTMLElement;
  private readonly score: HTMLElement;
  private readonly kd: HTMLElement;
  private readonly leaderboard: HTMLElement;
  private readonly killfeed: HTMLElement;
  private readonly upgrades: HTMLElement;
  private readonly points: HTMLElement;
  private readonly autoFire: HTMLButtonElement;
  private readonly toastContainer: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly classSelection: HTMLElement;
  private readonly classChoices: HTMLElement;
  private readonly deathScreen: HTMLElement;
  private readonly deathKiller: HTMLElement;
  private readonly deathStats: HTMLElement;
  private readonly respawnButton: HTMLButtonElement;
  private readonly respawnCountdown: HTMLElement;
  private readonly upgradeButtons = new Map<UpgradeId, HTMLButtonElement>();
  private readonly vignette: HTMLElement;
  private entered = false;
  private wasBooting = false;
  /** Grafikstart endgültig gescheitert – der Play-Button wird zum Neu-laden-Knopf. */
  private failedMode = false;
  private startScreenGone: (() => void) | null = null;
  /** Sobald der Spieler selbst tippt, wird nichts mehr vorbelegt. */
  private nameTouched = false;
  private lastDeathCount = 0;
  private lastClassChoicesKey = '';
  private lastLeaderboardKey = '';
  private lastKillfeedKey = '';
  private lastStreak = 0;
  private runStartedAt = Date.now();
  private wasDead = false;

  constructor(
    onJoin: (options: JoinOptions) => void,
    onUpgrade: (upgrade: UpgradeId) => void,
    onAutoFire: () => boolean,
    onClassChoice: (playerClass: PlayerClass) => void,
    onRespawn: () => void
  ) {
    const root = document.querySelector<HTMLDivElement>('#app');
    if (!root) throw new Error('Missing #app root');
    this.root = root;
    root.innerHTML = `
      <div class="ui-layer">
        <section class="start-screen" id="start-screen">
          <canvas class="start-backdrop" id="start-backdrop" aria-hidden="true"></canvas>
          <div class="start-stage">
            <form class="start-card" id="join-form">
              <div class="start-brand">
                <div class="start-logo-wrap">
                  <img class="start-logo" src="/logo.png" alt="" width="112" height="112" />
                  <span class="start-logo-ring" aria-hidden="true"></span>
                </div>
                <h1>MAZE<b>RS</b></h1>
                <p class="start-tagline">Farmen. Leveln. Die Arena übernehmen.</p>
              </div>

              <div class="start-primary">
                <label class="field-label" for="player-name">DEIN NAME</label>
                <input id="player-name" maxlength="18" autocomplete="off" value="Player" />
                <button class="play-button" id="join-button" type="submit"><span>ARENA BETRETEN</span><b>→</b></button>
              </div>

              <p class="start-status" id="join-status" aria-live="polite"></p>

              <div class="start-auth" id="start-auth" hidden></div>

              <details class="start-settings" id="start-settings">
                <summary><span>Sound &amp; Loadout</span><i aria-hidden="true"></i></summary>
                <div class="start-settings-body" id="start-settings-body">
                  <label class="start-sound"><span>SOUND</span><input type="range" id="volume" min="0" max="100" step="5" /></label>
                </div>
              </details>

              <p class="start-note"><span>WASD</span><span>LINKS FEUER</span><span>RECHTS DROHNEN</span><span>ALPHA 1.0</span></p>
            </form>

            <details class="start-board" id="start-board" hidden>
              <summary><strong>BESTENLISTE</strong><small data-board-meta></small></summary>
              <ol class="start-board-list" data-board-list></ol>
            </details>
          </div>
        </section>

        <section class="hud" id="hud" hidden>
          <div class="top-left">
            <div class="glass player-panel">
              <div class="player-heading"><div><strong id="ui-name">Player</strong><span id="ui-class">CORE</span></div><div class="level-badge">LVL <b id="ui-level">1</b></div></div>
              <div class="meter health-meter"><div id="health-bar"></div></div>
              <div class="meter-row"><span id="health-text">100 / 100 HP</span><span id="kd">0 K / 0 D</span></div>
              <div class="meter xp-meter"><div id="xp-bar"></div></div>
              <div class="meter-row"><span id="xp-text">0 / 73 XP</span><span id="score">0 SCORE</span></div>
            </div>
            <div class="killfeed" id="killfeed"></div>
          </div>

          <div class="network-pill"><span id="connection-dot"></span><b id="connection">VERBINDE</b><i></i><span id="ping">-- MS</span></div>
          <aside class="glass leaderboard" id="leaderboard"><div class="panel-title">TOP PLAYERS</div></aside>

          <div class="upgrade-panel" id="upgrades" hidden>
            <div class="upgrade-header"><span>UPGRADES</span><b><span id="upgrade-points">0</span> PUNKTE</b></div>
            <div class="upgrade-list">
              ${UPGRADE_IDS.map((id, index) => `<button data-upgrade="${id}"><kbd>${index + 1}</kbd><span>${upgradeLabels[id]}</span><div class="upgrade-pips" data-pips="${id}">${Array.from({ length: GAME.maxUpgradeLevel }, () => '<i></i>').join('')}</div></button>`).join('')}
            </div>
          </div>

          <section class="class-selection glass" id="class-selection" hidden>
            <div class="panel-title">NEUE SPEZIALISIERUNG</div>
            <p>Wähle deinen nächsten Entwicklungspfad.</p>
            <div class="class-choices" id="class-choices"></div>
          </section>

          <section class="death-screen" id="death-screen" hidden>
            <div class="death-card glass">
              <div class="eyebrow danger">RUN BEENDET</div>
              <h2>ELIMINIERT</h2>
              <p id="death-killer">Eliminiert von Arena</p>
              <div class="death-stats" id="death-stats"></div>
              <button id="respawn-button" type="button" disabled>RESPAWN</button>
              <span id="respawn-countdown">Respawn verfügbar in 2.5s</span>
            </div>
          </section>

          <canvas class="minimap" id="minimap" width="180" height="120"></canvas>
          <div class="controls-hint"><span>WASD BEWEGEN</span><span>LINKS FEUERN</span><span>RECHTS DROHNEN ABSTOSSEN</span><span>1–8 UPGRADES</span></div>
          <button class="auto-fire" id="auto-fire" type="button">AUTO <b>OFF</b></button>
          <button class="secondary-action" id="secondary-action" type="button">REPEL</button>
        </section>

        <div class="touch-control move-stick" id="move-stick"><div class="stick-ring"><div class="stick-knob"></div></div></div>
        <div class="touch-control aim-stick" id="aim-stick"><div class="stick-ring"><div class="stick-knob"></div></div></div>
        <div class="rotate-notice">Bitte Gerät drehen</div>
        <div class="damage-vignette" id="damage-vignette"></div>
        <div class="toasts" id="toasts"></div>
      </div>`;

    this.start = this.require('#start-screen');
    this.joinButton = this.require<HTMLButtonElement>('#join-button');
    this.joinStatus = this.require('#join-status');
    this.hud = this.require('#hud');
    this.connection = this.require('#connection');
    this.ping = this.require('#ping');
    this.playerName = this.require('#ui-name');
    this.className = this.require('#ui-class');
    this.level = this.require('#ui-level');
    this.healthText = this.require('#health-text');
    this.healthBar = this.require('#health-bar');
    this.xpText = this.require('#xp-text');
    this.xpBar = this.require('#xp-bar');
    this.score = this.require('#score');
    this.kd = this.require('#kd');
    this.leaderboard = this.require('#leaderboard');
    this.killfeed = this.require('#killfeed');
    this.upgrades = this.require('#upgrades');
    this.points = this.require('#upgrade-points');
    this.autoFire = this.require<HTMLButtonElement>('#auto-fire');
    this.toastContainer = this.require('#toasts');
    this.minimap = this.require<HTMLCanvasElement>('#minimap');
    this.classSelection = this.require('#class-selection');
    this.classChoices = this.require('#class-choices');
    this.deathScreen = this.require('#death-screen');
    this.deathKiller = this.require('#death-killer');
    this.deathStats = this.require('#death-stats');
    this.respawnButton = this.require<HTMLButtonElement>('#respawn-button');
    this.respawnCountdown = this.require('#respawn-countdown');
    this.vignette = this.require('#damage-vignette');

    this.require<HTMLInputElement>('#player-name').addEventListener('input', () => { this.nameTouched = true; });

    this.require<HTMLFormElement>('#join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      // Nach einem Grafikfehler lädt der Button die Seite neu – eine Sackgasse
      // mit totem Knopf hilft niemandem weiter.
      if (this.failedMode) {
        location.reload();
        return;
      }
      if (this.joinButton.disabled) return;
      const name = this.require<HTMLInputElement>('#player-name').value.trim() || 'Player';
      // Vorerst genau ein neutrales Theme – die Auswahl kommt zurück, wenn das
      // Spiel steht und die Varianten wirklich gepflegt sind.
      const theme = DEFAULT_THEME;
      applyTheme(theme);
      onJoin({ name, theme });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => {
      const upgrade = button.dataset.upgrade as UpgradeId;
      this.upgradeButtons.set(upgrade, button);
      button.addEventListener('click', () => onUpgrade(upgrade));
    });
    this.autoFire.addEventListener('click', () => this.setAutoFire(onAutoFire()));
    this.respawnButton.addEventListener('click', onRespawn);
    this.classChoices.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-class-choice]');
      if (button) onClassChoice(button.dataset.classChoice as PlayerClass);
    });
  }

  /**
   * `mode: 'booting'` ist der Zustand vor dem ersten Klick: PixiJS lädt seine
   * Renderer-Chunks nach. Der Startscreen zeigt das als eigene Inszenierung –
   * ein Ladebalken wäre gelogen, weil es keinen Fortschritt zu melden gibt.
   */
  setJoinPending(pending: boolean, message = '', mode: 'connecting' | 'booting' | 'failed' = 'connecting'): void {
    if (this.entered) return;
    const booting = pending && mode === 'booting';
    const failed = mode === 'failed';
    this.failedMode = failed;
    this.joinButton.disabled = pending && !failed;
    const label = this.joinButton.querySelector('span');
    if (label) {
      label.textContent = failed ? 'NEU LADEN'
        : booting ? 'GRAFIK LÄDT …'
          : pending ? 'VERBINDE …' : 'ARENA BETRETEN';
    }
    this.joinStatus.textContent = message;
    this.joinStatus.classList.toggle('error', failed || (!pending && message.length > 0));
    this.start.classList.toggle('booting', booting);
    // Erst wenn der Renderer steht, ist der Startscreen „scharf“ – das quittiert
    // ein kurzes Aufblitzen des Logos statt eines stillen Zustandswechsels.
    if (!booting && this.wasBooting) {
      this.start.classList.add('booted');
      window.setTimeout(() => this.start.classList.remove('booted'), 900);
    }
    this.wasBooting = booting;
  }

  /**
   * Holt das Loadout-Panel in die eingeklappten Einstellungen. Die GameplayUI
   * hängt es selbst vor den Play-Button – dort wäre es genau das, was der
   * Startscreen nicht mehr sein soll: eine gleich gewichtete Kiste vor der
   * einen Aktion, um die es geht. Muss nach dem Bau der GameplayUI laufen.
   */
  /**
   * Schlägt einen Namen vor (etwa aus dem Google-Profil). Wer schon selbst
   * getippt hat, behält seine Eingabe – der Vorschlag ist kein Zwang.
   */
  prefillPlayerName(name: string): void {
    if (this.entered || this.nameTouched) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const input = this.require<HTMLInputElement>('#player-name');
    input.value = trimmed.slice(0, input.maxLength > 0 ? input.maxLength : trimmed.length);
  }

  adoptStartSettings(): void {
    const loadout = this.root.querySelector<HTMLElement>('.core-loadout');
    const body = this.root.querySelector<HTMLElement>('#start-settings-body');
    if (loadout && body && loadout.parentElement !== body) body.append(loadout);
  }

  /** Callback, um den Hintergrund zu stoppen, sobald der Startscreen verschwindet. */
  onStartScreenGone(handler: () => void): void {
    this.startScreenGone = handler;
  }

  enterGame(): void {
    if (this.entered) return;
    this.entered = true;
    this.runStartedAt = Date.now();
    this.root.classList.add('playing');
    this.start.classList.add('leaving');
    window.setTimeout(() => {
      this.start.remove();
      this.startScreenGone?.();
    }, 360);
    this.hud.hidden = false;
  }

  setConnection(state: 'connecting' | 'online' | 'offline', text?: string): void {
    this.connection.textContent = text ?? (state === 'online' ? 'ONLINE' : state === 'connecting' ? 'VERBINDE' : 'OFFLINE');
    this.require('#connection-dot').dataset.state = state;
  }
  setPing(value: number): void { this.ping.textContent = `${Math.max(0, Math.round(value))} MS`; }
  setAutoFire(enabled: boolean): void {
    this.autoFire.classList.toggle('active', enabled);
    const label = this.autoFire.querySelector('b');
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
  }

  update(snapshot: WorldSnapshot): PlayerSnapshot | null {
    const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
    if (!self) return null;
    this.playerName.textContent = self.name;
    this.className.textContent = CLASS_DEFINITIONS[self.playerClass].label.toUpperCase();
    this.level.textContent = String(self.level);
    this.healthText.textContent = `${Math.ceil(self.health)} / ${self.maxHealth} HP`;
    this.healthBar.style.width = `${Math.max(0, Math.min(100, (self.health / Math.max(1, self.maxHealth)) * 100))}%`;
    const previousThreshold = xpAtLevelStart(self.level);
    const progress = Math.max(0, self.xp - previousThreshold);
    const required = Math.max(1, self.xpForNextLevel - previousThreshold);
    this.xpText.textContent = self.level >= GAME.maxLevel ? 'MAX LEVEL' : `${progress} / ${required} XP`;
    this.xpBar.style.width = `${self.level >= GAME.maxLevel ? 100 : Math.max(0, Math.min(100, (progress / required) * 100))}%`;
    this.score.textContent = `${self.score.toLocaleString('de-DE')} SCORE`;
    this.kd.textContent = `${self.kills} K / ${self.deaths} D`;
    this.points.textContent = String(self.availablePoints);
    this.upgrades.hidden = self.availablePoints <= 0 || self.dead;

    for (const id of UPGRADE_IDS) {
      const currentLevel = self.upgrades[id];
      const pips = this.root.querySelectorAll<HTMLElement>(`[data-pips="${id}"] i`);
      pips.forEach((pip, index) => pip.classList.toggle('filled', index < currentLevel));
      const button = this.upgradeButtons.get(id);
      if (button) {
        button.disabled = self.dead || self.availablePoints <= 0 || currentLevel >= GAME.maxUpgradeLevel;
        button.title = currentLevel >= GAME.maxUpgradeLevel ? 'Maximum erreicht' : '';
      }
    }

    const healthRatio = self.health / Math.max(1, self.maxHealth);
    this.vignette.classList.toggle('active', !self.dead && healthRatio < 0.35);

    if (this.wasDead && !self.dead) this.runStartedAt = Date.now();
    this.wasDead = self.dead;

    if (self.streak > this.lastStreak && [3, 5, 8, 12].includes(self.streak)) {
      this.toast(`${self.streak}er-Streak!`, 'Du bist nicht zu stoppen – bleib wachsam.', 'success');
    }
    this.lastStreak = self.streak;

    this.updateClassSelection(self);
    this.updateDeathScreen(snapshot, self);
    this.renderLeaderboard(snapshot);
    this.renderKillfeed(snapshot);
    this.renderRadar(snapshot, self);
    if (self.deaths > this.lastDeathCount) this.toast('Run beendet', `Du startest auf Level ${self.respawnLevel} neu.`, 'danger');
    this.lastDeathCount = self.deaths;
    return self;
  }

  toast(title: string, message: string, tone: 'normal' | 'danger' | 'success' = 'normal'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    const heading = document.createElement('strong');
    const text = document.createElement('span');
    heading.textContent = title;
    text.textContent = message;
    toast.append(heading, text);
    this.toastContainer.append(toast);
    window.setTimeout(() => toast.classList.add('show'), 20);
    window.setTimeout(() => { toast.classList.remove('show'); window.setTimeout(() => toast.remove(), 240); }, 2600);
  }

  private updateClassSelection(self: PlayerSnapshot): void {
    const choices = availableClassChoices(self.playerClass, self.level);
    this.classSelection.hidden = choices.length === 0 || self.dead;
    const key = self.dead ? '' : choices.join('|');
    if (key === this.lastClassChoicesKey) return;
    this.lastClassChoicesKey = key;
    this.classChoices.replaceChildren();
    for (const choice of choices) {
      const definition = CLASS_DEFINITIONS[choice];
      const button = document.createElement('button');
      button.dataset.classChoice = choice;
      const title = document.createElement('strong');
      const description = document.createElement('span');
      const level = document.createElement('small');
      title.textContent = definition.label;
      description.textContent = definition.description;
      level.textContent = `LEVEL ${definition.unlockLevel}`;
      button.append(title, description, level);
      this.classChoices.append(button);
    }
  }

  private updateDeathScreen(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
    this.deathScreen.hidden = !self.dead;
    if (!self.dead) return;
    const remaining = Math.max(0, self.canRespawnAt - snapshot.serverTime);
    const aliveSeconds = Math.max(0, Math.round((Date.now() - this.runStartedAt) / 1000));
    const aliveText = aliveSeconds >= 60 ? `${Math.floor(aliveSeconds / 60)}m ${aliveSeconds % 60}s` : `${aliveSeconds}s`;
    this.deathKiller.textContent = `Eliminiert von ${self.killerName || 'Arena'}`;
    this.deathStats.innerHTML = `<div><span>Erreicht</span><b>Level ${self.deathLevel}</b></div><div><span>Neustart</span><b>Level ${self.respawnLevel}</b></div><div><span>Score</span><b>${self.score.toLocaleString('de-DE')}</b></div><div><span>Kills</span><b>${self.kills}</b></div><div><span>Überlebt</span><b>${aliveText}</b></div><div><span>Beste Streak</span><b>${self.bestStreak}</b></div>`;
    this.respawnButton.disabled = remaining > 0;
    this.respawnCountdown.textContent = remaining > 0
      ? `Respawn verfügbar in ${(remaining / 1000).toFixed(1)}s`
      : `Respawn bereit · automatisch in ${Math.max(0, Math.ceil((self.autoRespawnAt - snapshot.serverTime) / 1000))}s`;
  }

  private renderLeaderboard(snapshot: WorldSnapshot): void {
    const key = snapshot.leaderboard.map((entry) => `${entry.id}:${entry.score}:${entry.level}:${entry.playerClass}`).join('|');
    if (key === this.lastLeaderboardKey) return;
    this.lastLeaderboardKey = key;
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'TOP PLAYERS';
    const fragment = document.createDocumentFragment();
    fragment.append(title);
    snapshot.leaderboard.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = `leader-row ${entry.id === snapshot.selfId ? 'self' : ''}`;
      const rank = document.createElement('b');
      const name = document.createElement('span');
      const details = document.createElement('small');
      const score = document.createElement('strong');
      rank.textContent = String(index + 1);
      name.textContent = entry.name;
      if (entry.isBot) { const bot = document.createElement('em'); bot.textContent = 'BOT'; name.append(bot); }
      details.textContent = `${CLASS_DEFINITIONS[entry.playerClass].label} · L${entry.level}`;
      score.textContent = entry.score.toLocaleString('de-DE');
      row.append(rank, name, details, score);
      fragment.append(row);
    });
    this.leaderboard.replaceChildren(fragment);
  }

  private renderKillfeed(snapshot: WorldSnapshot): void {
    const events = snapshot.killfeed.slice(-4).reverse();
    const key = events.map((event) => event.id).join('|');
    if (key === this.lastKillfeedKey) return;
    this.lastKillfeedKey = key;
    const fragment = document.createDocumentFragment();
    for (const event of events) {
      const row = document.createElement('div');
      const killer = document.createElement('strong');
      const action = document.createElement('span');
      const victim = document.createElement('b');
      killer.textContent = event.killer;
      action.textContent = 'eliminierte';
      victim.textContent = event.victim;
      row.append(killer, action, victim);
      if ((event.streak ?? 0) >= 3) {
        const streak = document.createElement('em');
        streak.className = 'streak-flame';
        streak.textContent = `🔥${event.streak}`;
        row.append(streak);
      }
      fragment.append(row);
    }
    this.killfeed.replaceChildren(fragment);
  }

  private renderRadar(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
    const context = this.minimap.getContext('2d');
    if (!context) return;
    const extended = snapshot as WorldSnapshot & {
      eliteShapeIds?: string[];
      arenaEvent?: { center: { x: number; y: number }; radius: number; phase: string; kind?: ArenaEventKind } | null;
      bountyTargetId?: string | null;
      arenaGuardianId?: string | null;
    };
    const { width, height } = this.minimap;
    const halfWorldWidth = GAME.visibleWorldWidth * 0.62;
    const halfWorldHeight = GAME.visibleWorldHeight * 0.72;
    const toRadar = (position: { x: number; y: number }): { x: number; y: number } => ({
      x: width / 2 + ((position.x - self.position.x) / halfWorldWidth) * (width / 2),
      y: height / 2 + ((position.y - self.position.y) / halfWorldHeight) * (height / 2)
    });
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(7,10,18,.88)';
    context.fillRect(0, 0, width, height);
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    context.fillStyle = 'rgba(255,255,255,.13)';
    for (const wall of snapshot.walls) {
      const topLeft = toRadar({ x: wall.x, y: wall.y });
      context.fillRect(topLeft.x, topLeft.y, (wall.width / halfWorldWidth) * (width / 2), (wall.height / halfWorldHeight) * (height / 2));
    }
    const event = extended.arenaEvent;
    if (event && arenaEventStyle(event.kind).zoned) {
      const center = toRadar(event.center);
      context.beginPath();
      // Gleiche Farbsprache wie die Zone im Spielfeld.
      context.strokeStyle = cssColor(arenaEventStyle(event.kind).ring, event.phase === 'active' ? 0.85 : 0.4);
      context.lineWidth = 1.5;
      context.arc(center.x, center.y, (event.radius / halfWorldWidth) * (width / 2), 0, Math.PI * 2);
      context.stroke();
    }
    const elites = new Set(extended.eliteShapeIds ?? []);
    for (const shape of snapshot.shapes) {
      const elite = elites.has(shape.id);
      if (!elite && shape.kind !== 'pentagon') continue;
      const point = toRadar(shape.position);
      context.beginPath();
      context.fillStyle = elite ? '#f4c866' : 'rgba(207,110,181,.55)';
      context.arc(point.x, point.y, elite ? 2.6 : 1.6, 0, Math.PI * 2);
      context.fill();
    }
    for (const player of snapshot.players) {
      if (player.dead) continue;
      const point = toRadar(player.position);
      const bounty = player.id === extended.bountyTargetId;
      const guardian = player.id === extended.arenaGuardianId;
      context.beginPath();
      context.fillStyle = player.id === self.id ? '#8c95ff' : guardian ? '#f4c866' : bounty ? '#f3c45f' : '#ef7181';
      context.arc(point.x, point.y, player.id === self.id ? 3.4 : guardian ? 3.6 : bounty ? 3 : 2, 0, Math.PI * 2);
      context.fill();
      if (bounty || guardian) {
        context.beginPath();
        context.strokeStyle = 'rgba(243,196,95,.8)';
        context.lineWidth = 1;
        context.arc(point.x, point.y, guardian ? 6 : 5, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
    // Ortlose Events (Fracture) bekommen keinen Zonenkreis – stattdessen färbt
    // sich der Rahmen der Minimap, weil die ganze Arena betroffen ist.
    const zonelessStyle = event && !arenaEventStyle(event.kind).zoned ? arenaEventStyle(event.kind) : null;
    context.strokeStyle = zonelessStyle
      ? cssColor(zonelessStyle.ring, event?.phase === 'active' ? 0.8 : 0.45)
      : 'rgba(255,255,255,.18)';
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }
}
