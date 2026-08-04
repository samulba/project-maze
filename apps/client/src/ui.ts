import {
  CLASS_DEFINITIONS,
  GAME,
  UPGRADE_IDS,
  availableClassChoices,
  xpAtLevelStart,
  type PlayerClass,
  type PlayerSnapshot,
  type ThemeId,
  type UpgradeId,
  type WorldSnapshot
} from '@project-maze/shared';

export interface JoinOptions {
  name: string;
  theme: ThemeId;
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
  private entered = false;
  private lastDeathCount = 0;
  private lastClassChoicesKey = '';
  private lastLeaderboardKey = '';
  private lastKillfeedKey = '';

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
          <form class="start-card" id="join-form">
            <div class="eyebrow"><span></span> PLAYABLE ALPHA 0.3.1</div>
            <h1>PROJECT <b>MAZE</b></h1>
            <p class="intro">Farmen, leveln, spezialisieren und mit deinem Build die Arena kontrollieren. Jeder startet als Core-Tank.</p>
            <label class="field-label" for="player-name">SPIELERNAME</label>
            <input id="player-name" maxlength="18" autocomplete="off" value="Player" />
            <div class="start-options">
              <label><span>THEME</span><select id="theme"><option value="midnight">Midnight</option><option value="void">Void</option><option value="classic">Classic</option></select></label>
              <div class="control-preview"><span>WASD</span><span>LINKSKLICK FEUER</span><span>RECHTSKLICK DROHNEN</span></div>
            </div>
            <button class="play-button" id="join-button" type="submit"><span>ARENA BETRETEN</span><b>→</b></button>
            <p class="start-status" id="join-status" aria-live="polite"></p>
            <p class="start-note">Feste Sichtweite · kein Account · kein Pay-to-win</p>
          </form>
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

    this.require<HTMLFormElement>('#join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.joinButton.disabled) return;
      const name = this.require<HTMLInputElement>('#player-name').value.trim() || 'Player';
      const theme = this.require<HTMLSelectElement>('#theme').value as ThemeId;
      document.documentElement.dataset.theme = theme;
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

  setJoinPending(pending: boolean, message = ''): void {
    if (this.entered) return;
    this.joinButton.disabled = pending;
    const label = this.joinButton.querySelector('span');
    if (label) label.textContent = pending ? 'VERBINDE …' : 'ARENA BETRETEN';
    this.joinStatus.textContent = message;
    this.joinStatus.classList.toggle('error', !pending && message.length > 0);
  }

  enterGame(): void {
    if (this.entered) return;
    this.entered = true;
    this.root.classList.add('playing');
    this.start.classList.add('leaving');
    window.setTimeout(() => this.start.remove(), 360);
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
    this.deathKiller.textContent = `Eliminiert von ${self.killerName || 'Arena'}`;
    this.deathStats.innerHTML = `<div><span>Erreicht</span><b>Level ${self.deathLevel}</b></div><div><span>Neustart</span><b>Level ${self.respawnLevel}</b></div><div><span>Score</span><b>${self.score.toLocaleString('de-DE')}</b></div><div><span>Kills</span><b>${self.kills}</b></div>`;
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
      fragment.append(row);
    }
    this.killfeed.replaceChildren(fragment);
  }

  private renderRadar(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
    const context = this.minimap.getContext('2d');
    if (!context) return;
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
    for (const player of snapshot.players) {
      if (player.dead) continue;
      const point = toRadar(player.position);
      context.beginPath();
      context.fillStyle = player.id === self.id ? '#8c95ff' : '#ef7181';
      context.arc(point.x, point.y, player.id === self.id ? 3.4 : 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    context.strokeStyle = 'rgba(255,255,255,.18)';
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }
}
