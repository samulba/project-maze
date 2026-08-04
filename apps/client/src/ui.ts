import { GAME, UPGRADE_IDS, xpThresholdForLevel, type PlayerClass, type PlayerSnapshot, type ThemeId, type UpgradeId, type WorldSnapshot } from '@project-maze/shared';

export interface JoinOptions {
  name: string;
  playerClass: PlayerClass;
  theme: ThemeId;
}

const upgradeLabels: Record<UpgradeId, string> = {
  maxHealth: 'Max. Leben',
  regen: 'Regeneration',
  moveSpeed: 'Bewegung',
  reload: 'Nachladen',
  damage: 'Schaden',
  projectileSpeed: 'Projektiltempo'
};

export class GameUI {
  readonly root: HTMLDivElement;
  private readonly start: HTMLElement;
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
  private lastDeathCount = 0;
  private lastKillEvent = 0;

  constructor(onJoin: (options: JoinOptions) => void, onUpgrade: (upgrade: UpgradeId) => void, onAutoFire: () => boolean) {
    const root = document.querySelector<HTMLDivElement>('#app');
    if (!root) throw new Error('Missing #app root');
    this.root = root;
    root.innerHTML = `
      <div class="ui-layer">
        <section class="start-screen" id="start-screen">
          <div class="start-glow"></div>
          <form class="start-card" id="join-form">
            <div class="eyebrow"><span class="live-dot"></span> PRIVATE ALPHA</div>
            <h1>PROJECT <span>MAZE</span></h1>
            <p class="intro">Kämpfe dich durch ein modernes geometrisches Labyrinth. Jeder Run beginnt bei null – Aim, Movement und dein Build entscheiden.</p>
            <label class="field-label" for="player-name">SPIELERNAME</label>
            <input id="player-name" maxlength="18" autocomplete="off" value="Player" />
            <div class="field-label class-label">KLASSE WÄHLEN</div>
            <div class="class-grid">
              <label class="class-card selected" data-class-card="shooter"><input type="radio" name="class" value="shooter" checked><span class="class-icon shooter-icon"></span><strong>Shooter</strong><small>Direkt · flexibel · schnell</small></label>
              <label class="class-card" data-class-card="sniper"><input type="radio" name="class" value="sniper"><span class="class-icon sniper-icon"></span><strong>Sniper</strong><small>Reichweite · Burst · Präzision</small></label>
              <label class="class-card" data-class-card="drone"><input type="radio" name="class" value="drone"><span class="class-icon drone-icon"></span><strong>Drone</strong><small>Kontrolle · Druck · Taktik</small></label>
            </div>
            <div class="start-options">
              <label><span>Theme</span><select id="theme"><option value="midnight">Midnight</option><option value="void">Void</option><option value="classic">Classic</option></select></label>
              <div class="control-preview"><span>WASD</span><span>MAUS</span><span>1–6 UPGRADES</span></div>
            </div>
            <button class="play-button" type="submit"><span>ARENA BETRETEN</span><b>→</b></button>
            <p class="start-note">Kein Account. Kein Pay-to-win. Sofort spielen.</p>
          </form>
        </section>

        <section class="hud" id="hud" hidden>
          <div class="top-left">
            <div class="glass player-panel">
              <div class="player-heading"><div><strong id="ui-name">Player</strong><span id="ui-class">SHOOTER</span></div><div class="level-badge">LVL <b id="ui-level">1</b></div></div>
              <div class="meter health-meter"><div id="health-bar"></div></div>
              <div class="meter-row"><span id="health-text">100 / 100 HP</span><span id="kd">0 K / 0 D</span></div>
              <div class="meter xp-meter"><div id="xp-bar"></div></div>
              <div class="meter-row"><span id="xp-text">0 / 88 XP</span><span id="score">0 SCORE</span></div>
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

          <canvas class="minimap" id="minimap" width="180" height="120"></canvas>
          <div class="controls-hint"><span>WASD BEWEGEN</span><span>MAUS ZIELEN</span><span>E AUTO-FIRE</span><span>SCROLL ZOOM</span></div>
          <button class="auto-fire" id="auto-fire" type="button">AUTO <b>OFF</b></button>
        </section>

        <div class="touch-control move-stick" id="move-stick"><div class="stick-ring"><div class="stick-knob"></div></div></div>
        <div class="touch-control aim-stick" id="aim-stick"><div class="stick-ring"><div class="stick-knob"></div></div></div>
        <div class="toasts" id="toasts"></div>
      </div>`;

    this.start = this.require('#start-screen');
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

    root.querySelectorAll<HTMLElement>('[data-class-card]').forEach((card) => {
      card.addEventListener('click', () => {
        root.querySelectorAll('[data-class-card]').forEach((candidate) => candidate.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    this.require<HTMLFormElement>('#join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.require<HTMLInputElement>('#player-name').value.trim() || 'Player';
      const selected = root.querySelector<HTMLInputElement>('input[name="class"]:checked')?.value ?? 'shooter';
      const theme = this.require<HTMLSelectElement>('#theme').value as ThemeId;
      document.documentElement.dataset.theme = theme;
      onJoin({ name, playerClass: selected as PlayerClass, theme });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach((button) => button.addEventListener('click', () => onUpgrade(button.dataset.upgrade as UpgradeId)));
    this.autoFire.addEventListener('click', () => this.setAutoFire(onAutoFire()));
  }

  enterGame(): void {
    this.root.classList.add('playing');
    this.start.classList.add('leaving');
    window.setTimeout(() => this.start.remove(), 420);
    this.hud.hidden = false;
  }

  setConnection(state: 'connecting' | 'online' | 'offline', text?: string): void {
    this.connection.textContent = text ?? (state === 'online' ? 'ONLINE' : state === 'connecting' ? 'VERBINDE' : 'OFFLINE');
    const dot = this.require('#connection-dot');
    dot.dataset.state = state;
  }

  setPing(value: number): void {
    this.ping.textContent = `${Math.max(0, Math.round(value))} MS`;
  }

  setAutoFire(enabled: boolean): void {
    this.autoFire.classList.toggle('active', enabled);
    const label = this.autoFire.querySelector('b');
    if (label) label.textContent = enabled ? 'ON' : 'OFF';
  }

  update(snapshot: WorldSnapshot): PlayerSnapshot | null {
    const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
    if (!self) return null;
    this.playerName.textContent = self.name;
    this.className.textContent = self.playerClass.toUpperCase();
    this.level.textContent = String(self.level);
    this.healthText.textContent = `${Math.ceil(self.health)} / ${self.maxHealth} HP`;
    this.healthBar.style.width = `${Math.max(0, Math.min(100, self.health / self.maxHealth * 100))}%`;
    const previousThreshold = self.level <= 1 ? 0 : xpThresholdForLevel(self.level - 1);
    const progress = Math.max(0, self.xp - previousThreshold);
    const required = Math.max(1, self.xpForNextLevel - previousThreshold);
    this.xpText.textContent = `${progress} / ${required} XP`;
    this.xpBar.style.width = `${Math.max(0, Math.min(100, progress / required * 100))}%`;
    this.score.textContent = `${self.score.toLocaleString('de-DE')} SCORE`;
    this.kd.textContent = `${self.kills} K / ${self.deaths} D`;
    this.points.textContent = String(self.availablePoints);
    this.upgrades.hidden = self.availablePoints <= 0;
    for (const id of UPGRADE_IDS) {
      const pips = this.root.querySelectorAll<HTMLElement>(`[data-pips="${id}"] i`);
      pips.forEach((pip, index) => pip.classList.toggle('filled', index < self.upgrades[id]));
    }
    this.renderLeaderboard(snapshot);
    this.renderKillfeed(snapshot);
    this.renderMinimap(snapshot, self);
    if (self.deaths > this.lastDeathCount) this.toast('Du wurdest eliminiert', 'Dein Build wurde zurückgesetzt.', 'danger');
    this.lastDeathCount = self.deaths;
    return self;
  }

  toast(title: string, message: string, tone: 'normal' | 'danger' | 'success' = 'normal'): void {
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    toast.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    this.toastContainer.append(toast);
    window.setTimeout(() => toast.classList.add('show'), 20);
    window.setTimeout(() => { toast.classList.remove('show'); window.setTimeout(() => toast.remove(), 260); }, 2800);
  }

  private renderLeaderboard(snapshot: WorldSnapshot): void {
    this.leaderboard.innerHTML = `<div class="panel-title">TOP PLAYERS</div>${snapshot.leaderboard.map((entry, index) => `<div class="leader-row ${entry.id === snapshot.selfId ? 'self' : ''}"><b>${index + 1}</b><span>${this.escape(entry.name)}${entry.isBot ? '<em>BOT</em>' : ''}</span><small>LVL ${entry.level}</small><strong>${entry.score.toLocaleString('de-DE')}</strong></div>`).join('')}`;
  }

  private renderKillfeed(snapshot: WorldSnapshot): void {
    const latest = snapshot.killfeed.at(-1)?.id ?? 0;
    if (latest > this.lastKillEvent) this.lastKillEvent = latest;
    this.killfeed.innerHTML = snapshot.killfeed.slice(-4).reverse().map((event) => `<div><strong>${this.escape(event.killer)}</strong><span>eliminierte</span><b>${this.escape(event.victim)}</b></div>`).join('');
  }

  private renderMinimap(snapshot: WorldSnapshot, self: PlayerSnapshot): void {
    const context = this.minimap.getContext('2d');
    if (!context) return;
    const width = this.minimap.width;
    const height = this.minimap.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(7, 10, 18, .86)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(255,255,255,.14)';
    for (const wall of snapshot.walls) context.fillRect(wall.x / GAME.worldWidth * width, wall.y / GAME.worldHeight * height, wall.width / GAME.worldWidth * width, wall.height / GAME.worldHeight * height);
    for (const player of snapshot.players) {
      context.beginPath();
      context.fillStyle = player.id === self.id ? '#8c95ff' : '#ef7181';
      context.arc(player.position.x / GAME.worldWidth * width, player.position.y / GAME.worldHeight * height, player.id === self.id ? 3.2 : 2, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = 'rgba(255,255,255,.18)';
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  private escape(value: string): string {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
  }

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing UI element: ${selector}`);
    return element;
  }
}
