import {
  CLASS_DEFINITIONS,
  GAME,
  availableClassChoices,
  upgradeAppliesTo,
  xpAtLevelStart,
  type PlayerClass,
  type UpgradeId,
  type PlayerSnapshot,
  type WorldSnapshot
} from '@project-maze/shared';
import type { ArenaEventKind } from '@project-maze/shared/gameplay';
import { arenaEventStyle, cssColor } from './arena-event-style';
import { classPreviewSvg } from './class-preview';
import { deathToastText, respawnFacts, respawnTileLabel, respawnTileValue } from './death-summary';
import {
  FAMILY_LOCK_HINT,
  UPGRADE_SLOT_IDS,
  familyUpgradeLabel,
  familyUpgradeLocked,
  isFamilyUpgrade,
  upgradeHotkeyLabel,
  type UpgradeSlotId
} from './family-upgrades';
import { royaleDeathText, royaleZoneOf } from './royale-hud';
import { runDurationText, runSeconds } from './run-clock';
import { signatureLabel, signatureRatio } from './signature';
import { START_NAV } from './start-nav';
import { spectatedName, spectatedPlayer } from './spectator';
import { DEFAULT_THEME, applyTheme, type ClientThemeId } from './themes';

export interface JoinOptions {
  name: string;
  theme: ClientThemeId;
}

/**
 * `Partial`, damit die Tabelle nicht bricht, wenn `UPGRADE_IDS` in `shared`
 * um die beiden Familien-Slots wächst – die tragen ihre Beschriftung ohnehin
 * aus der Klasse, nicht von hier.
 */
const upgradeLabels: Partial<Record<UpgradeSlotId, string>> = {
  maxHealth: 'Max. Leben',
  regen: 'Regeneration',
  moveSpeed: 'Bewegung',
  reload: 'Nachladen',
  damage: 'Kugelschaden',
  projectileSpeed: 'Kugeltempo',
  penetration: 'Durchschlag',
  bodyDamage: 'Körperschaden',
  // Klassen 4.0: Reichweite als bewusste Entscheidung, Fähigkeit als Tempo
  // auf Dash/Barriere/Reparatur/Repulse.
  projectileRange: 'Reichweite',
  moduleCooldown: 'Fähigkeit',
  // Platzhalter, damit `Record<UpgradeId, string>` nach der Shared-Erweiterung
  // vollständig bleibt. Die familienabhängigen Beschriftungen (abgeleitet aus
  // `playerClass`, wie beim Signature-Balken) und die Sperre ohne Familie
  // liegen bei Chat 03 – deren Fassung ersetzt diese beiden Zeilen.
  signatureRate: 'Signatur-Tempo',
  signaturePower: 'Signatur-Stärke'
};

/** Beschriftung eines Platzes – Familien-Slots hängen an der Klasse. */
const slotLabel = (id: UpgradeSlotId, playerClass: PlayerClass): string =>
  isFamilyUpgrade(id) ? familyUpgradeLabel(playerClass, id) : upgradeLabels[id] ?? id;

/**
 * Zweiter Haken an der Marke des Navigationseintrags. Die Panels schreiben
 * ihren Kurzhinweis dorthin („GAST", „TOP 10") – sie kennen die Navigation
 * nicht und sollen sie auch nicht kennen müssen.
 */
const navBadgeHook: Partial<Record<string, string>> = {
  profil: 'data-profile-hint',
  achievements: 'data-achievements-hint',
  bestenliste: 'data-board-meta'
};

/** Kopf jeder Unterseite: ein Zurück-Weg und die Überschrift, sonst nichts. */
const seitenkopf = (titel: string): string =>
  `<header class="start-page-head">
     <button class="start-back" type="button" data-back data-autofocus aria-label="Zurück zum Start"><i aria-hidden="true"></i><span>ZURÜCK</span></button>
     <h2>${titel}</h2>
   </header>`;

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
  /** Beschriftung der Familien-Signature; der Balken selbst sitzt am Tank. */
  private readonly signatureRow: HTMLElement;
  private readonly signatureLabelEl: HTMLElement;
  private readonly signatureValue: HTMLElement;
  /** Touch-Einstieg in die Upgrades: Badge an der Statusleiste öffnet das Sheet. */
  private readonly pointsBadge: HTMLButtonElement;
  private readonly pointsBadgeCount: HTMLElement;
  private readonly autoFire: HTMLButtonElement;
  private readonly toastContainer: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly secondaryAction: HTMLButtonElement;
  private readonly classSelection: HTMLElement;
  private readonly classChoices: HTMLElement;
  private readonly deathScreen: HTMLElement;
  private readonly deathKiller: HTMLElement;
  private readonly deathStats: HTMLElement;
  private readonly deathPortrait: HTMLElement;
  /** Kurzfassung derselben Zahlen – ersetzt die Kachelwand beim Zuschauen. */
  private readonly deathSummary: HTMLElement;
  private readonly respawnButton: HTMLButtonElement;
  private readonly respawnCountdown: HTMLElement;
  /** Rundenstand auf der Todeskarte – nur im Battle Royale sichtbar. */
  private readonly royaleDeathNote: HTMLElement;
  private readonly upgradeButtons = new Map<UpgradeSlotId, HTMLButtonElement>();
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
  /**
   * Auf Touch klappt eine neue Klassenwahl nicht von selbst auf: Offen legt
   * sie dort Sticks und Fähigkeit still (Befund 13).
   */
  private readonly autoCollapseClassSelection = window.matchMedia('(pointer: coarse)').matches;
  private lastLeaderboardKey = '';
  private lastKillfeedKey = '';
  private lastStreak = 0;
  private runStartedAt = Date.now();
  /**
   * Sitzungs-Kills beim Start des aktuellen Lebens: Die Engine setzt `kills`
   * beim Respawn nie zurück, die Death-Karte gilt aber je Leben (Befund 58).
   */
  private killsAtLifeStart = 0;
  /** Zeitpunkt des Todes – die Laufzeit steht danach still. */
  private runEndedAt: number | null = null;
  private wasDead = false;

  constructor(
    onJoin: (options: JoinOptions) => void,
    onUpgrade: (upgrade: UpgradeSlotId) => void,
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
            <form class="start-card" id="join-form" data-view="start">
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

              <nav class="start-nav" id="start-nav" aria-label="Weitere Seiten">
                ${START_NAV.map((eintrag) => `<button type="button" data-goto="${eintrag.id}"><strong>${eintrag.label}</strong><span>${eintrag.hint}</span><small data-nav-badge ${navBadgeHook[eintrag.id] ?? ''}></small><i aria-hidden="true"></i></button>`).join('')}
              </nav>

              <p class="start-note"><span>WASD</span><span>LINKS FEUER</span><span>E AUTOFEUER</span><span>SPACE FÄHIGKEIT</span><span>C KLASSEN</span></p>
            </form>

            <section class="start-page start-page-wide" data-view="klassen" hidden>
              ${seitenkopf('Klassen')}
              <div class="start-page-body" data-codex-body></div>
            </section>

            <section class="start-page" data-view="profil" hidden>
              ${seitenkopf('Profil')}
              <div class="start-page-body">
                <div class="start-auth" id="start-auth" hidden></div>
                <div class="start-profile" id="start-profile"><div data-profile-body></div></div>
              </div>
            </section>

            <section class="start-page" data-view="achievements" hidden>
              ${seitenkopf('Achievements')}
              <div class="start-page-body">
                <div class="start-achievements" id="start-achievements" data-achievements-body></div>
              </div>
            </section>

            <section class="start-page" data-view="bestenliste" hidden>
              ${seitenkopf('Bestenliste')}
              <div class="start-page-body">
                <div class="start-board" id="start-board">
                  <ol class="start-board-list" data-board-list></ol>
                  <p class="start-page-empty" data-board-empty>Die Bestenliste ist auf diesem Server noch nicht eingerichtet.</p>
                </div>
              </div>
            </section>

            <section class="start-page" data-view="einstellungen" hidden>
              ${seitenkopf('Einstellungen')}
              <div class="start-page-body" id="start-settings-body">
                <div class="setting">
                  <div class="setting-head"><strong>Sound</strong><b id="volume-value">80%</b></div>
                  <input type="range" id="volume" min="0" max="100" step="5" aria-label="Lautstärke" />
                </div>

                <div class="setting">
                  <div class="setting-head"><strong>Grafik</strong></div>
                  <p class="setting-note">Partikel, Leuchten und Renderauflösung. „Automatisch" misst im Spiel und stuft selbst ein.</p>
                  <div class="setting-row">
                    <span class="setting-select"><select id="quality-select" aria-label="Grafikstufe"></select></span>
                    <button class="start-fullscreen" id="fullscreen-toggle" type="button" hidden>VOLLBILD</button>
                  </div>
                </div>

                <div class="setting">
                  <div class="setting-head"><strong>Sichtfeld</strong></div>
                  <p class="setting-note">„Fest 16:9" lässt auf breiten Bildschirmen Ränder stehen. „Bildschirmfüllend" nutzt die ganze Fläche und zeigt dabei genauso viel Arena – nur breiter und dafür flacher.</p>
                  <div class="setting-row">
                    <span class="setting-select"><select id="view-select" aria-label="Sichtfeld"></select></span>
                  </div>
                </div>

                <div class="setting">
                  <div class="setting-head"><strong>Vorhersage</strong></div>
                  <p class="setting-note">Der Client rechnet die eigene Bewegung sofort, statt auf die Antwort des Servers zu warten. Spürbar bei langer Leitung.</p>
                  <label class="setting-switch"><input type="checkbox" id="prediction-toggle" /><span>Bewegung sofort anzeigen</span></label>
                </div>
              </div>
            </section>
          </div>
        </section>

        <section class="hud" id="hud" hidden>
          <div class="top-left">
            <div class="glass player-panel" id="player-panel">
              <div class="player-heading"><div><strong id="ui-name">Player</strong><span id="ui-class">CORE</span></div><div class="level-badge">LVL <b id="ui-level">1</b></div></div>
              <div class="meter health-meter"><div id="health-bar"></div></div>
              <div class="meter-row hp-row"><span id="health-text">100 / 100 HP</span><span id="kd">0 K / 0 D</span></div>
              <div class="meter xp-meter"><div id="xp-bar"></div></div>
              <div class="meter-row xp-row"><span id="xp-text">0 / 73 XP</span><span id="score">0 SCORE</span></div>
              <div class="meter-row signature-row" id="signature-row" hidden><span id="signature-label">MOMENTUM</span><span id="signature-value">0 %</span></div>
            </div>
            <button class="points-badge" id="points-badge" type="button" hidden><b id="points-badge-count">1</b><span>PUNKTE</span></button>
            <div class="killfeed" id="killfeed"></div>
          </div>

          <div class="network-pill"><span id="connection-dot"></span><b id="connection">VERBINDE</b><i></i><span id="ping">-- MS</span></div>
          <aside class="glass leaderboard" id="leaderboard"><div class="panel-title">BESTENLISTE</div></aside>

          <div class="upgrade-panel" id="upgrades" hidden>
            <div class="upgrade-header"><span>UPGRADES</span><b><span id="upgrade-points">0</span> PUNKTE</b><button class="sheet-close" id="upgrades-close" type="button" aria-label="Upgrades schließen">✕</button></div>
            <div class="upgrade-list">
              ${UPGRADE_SLOT_IDS.map((id, index) => `<button data-upgrade="${id}"${isFamilyUpgrade(id) ? ' hidden' : ''}>${upgradeHotkeyLabel(index) ? `<kbd>${upgradeHotkeyLabel(index)}</kbd>` : ''}<span data-upgrade-label="${id}">${slotLabel(id, 'core')}</span><div class="upgrade-pips" data-pips="${id}">${Array.from({ length: GAME.maxUpgradeLevel }, () => '<i></i>').join('')}</div></button>`).join('')}
            </div>
          </div>

          <!--
            Klassen 4.2: Die Wahl steht in der Ecke, nicht in der Bildmitte, und
            lässt sich zuklappen. Sams Begründung ist die bessere: „vlt will man
            ja garnichts wählen" – eine Entscheidung, die man nicht treffen will,
            darf einem nicht die Sicht auf die Arena nehmen.
          -->
          <section class="class-selection glass" id="class-selection" hidden>
            <button class="class-selection-bar" id="class-selection-open" type="button">
              <b>NEUE KLASSE</b><span id="class-selection-count"></span><i>▸</i>
            </button>
            <div class="class-selection-body">
              <div class="panel-title">
                NEUE SPEZIALISIERUNG
                <button class="sheet-close" id="class-selection-close" type="button" aria-label="Klassenwahl zuklappen">✕</button>
              </div>
              <p>Wähle deinen nächsten Entwicklungspfad.</p>
              <div class="class-choices" id="class-choices"></div>
            </div>
          </section>

          <section class="death-screen" id="death-screen" hidden>
            <div class="death-card glass">
              <div class="eyebrow danger">RUN BEENDET</div>
              <!--
                Der Rundenstand im Royale steht GANZ OBEN, nicht unten beim
                Respawn-Knopf: Die Karte ist länger als ein 720-px-Bildschirm,
                und dort unten hat ihn niemand gesehen. Es ist die einzige
                Auskunft, die im Royale zählt – „bin ich raus, und wie lange".
              -->
              <p class="royale-death-note" id="royale-death-note" hidden></p>
              <figure class="death-portrait" id="death-portrait"></figure>
              <h2>ELIMINIERT</h2>
              <p id="death-killer">Eliminiert von Arena</p>
              <div class="death-stats" id="death-stats"></div>
              <p class="death-summary" id="death-summary"></p>
              <!--
                Der Weg zurück ins Spiel steht in einem eigenen Kasten, der am
                unteren Rand der Karte klebt (hud-layout.css, position sticky).

                Der Grund ist gemessen, nicht gestaltet: Die Karte ist mit
                Loadout-Panel 564 px hoch und wird oben gedeckelt. Auf
                1280 x 720 lag der RESPAWN-Knopf damit komplett außerhalb des
                sichtbaren Kastens (Karte endet bei 661, Knopf beginnt bei
                685), auf 1366 x 768 ragte er 26 px heraus - ein Klick auf
                seine Mitte traf den Hintergrund. Der einzige Weg zurück ins
                Spiel war, in der Karte zu scrollen, ohne dass etwas darauf
                hinwies.
              -->
              <div class="death-actions">
                <button id="respawn-button" type="button" disabled>RESPAWN</button>
                <span id="respawn-countdown">Respawn verfügbar in 2.5s</span>
                <button id="exit-to-start" type="button">ZUM STARTSCREEN</button>
              </div>
            </div>
          </section>

          <canvas class="minimap" id="minimap" width="180" height="120"></canvas>
          <button class="auto-fire" id="auto-fire" type="button">AUTO <b>OFF</b></button>
          <button class="secondary-action" id="secondary-action" type="button" hidden>DROHNEN</button>
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
    this.signatureRow = this.require('#signature-row');
    this.signatureLabelEl = this.require('#signature-label');
    this.signatureValue = this.require('#signature-value');
    this.pointsBadge = this.require<HTMLButtonElement>('#points-badge');
    this.pointsBadgeCount = this.require('#points-badge-count');
    this.autoFire = this.require<HTMLButtonElement>('#auto-fire');
    this.toastContainer = this.require('#toasts');
    this.minimap = this.require<HTMLCanvasElement>('#minimap');
    this.secondaryAction = this.require<HTMLButtonElement>('#secondary-action');
    this.classSelection = this.require('#class-selection');
    this.classChoices = this.require('#class-choices');
    // Zuklappen und wieder aufklappen. Der Zustand hängt am Element, nicht an
    // einem Feld: So sieht CSS ihn ohne Umweg, und `updateClassSelection`
    // setzt ihn bei einer neuen Auswahl in einer Zeile zurück.
    this.classSelection.dataset.collapsed = this.autoCollapseClassSelection ? 'true' : 'false';
    this.require<HTMLButtonElement>('#class-selection-close')
      .addEventListener('click', () => { this.classSelection.dataset.collapsed = 'true'; });
    this.require<HTMLButtonElement>('#class-selection-open')
      .addEventListener('click', () => { this.classSelection.dataset.collapsed = 'false'; });
    this.deathScreen = this.require('#death-screen');
    this.deathKiller = this.require('#death-killer');
    this.deathStats = this.require('#death-stats');
    this.deathPortrait = this.require('#death-portrait');
    this.deathSummary = this.require('#death-summary');
    this.respawnButton = this.require<HTMLButtonElement>('#respawn-button');
    this.respawnCountdown = this.require('#respawn-countdown');
    this.royaleDeathNote = this.require('#royale-death-note');
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
      const upgrade = button.dataset.upgrade as UpgradeSlotId;
      this.upgradeButtons.set(upgrade, button);
      button.addEventListener('click', () => onUpgrade(upgrade));
    });
    this.autoFire.addEventListener('click', () => this.setAutoFire(onAutoFire()));
    this.respawnButton.addEventListener('click', onRespawn);

    // Touch-Wege ins HUD. Beide Umschalter setzen nur eine Klasse – ob daraus
    // ein Bottom-Sheet bzw. eine sichtbare Minimap wird, entscheidet mobile.css.
    // Auf Maus-Geräten ändert sich dadurch nichts.
    this.pointsBadge.addEventListener('click', () => this.upgrades.classList.toggle('sheet-open'));
    this.require<HTMLButtonElement>('#upgrades-close').addEventListener('click', () => {
      this.upgrades.classList.remove('sheet-open');
    });
    // Die Minimap kostet auf dem Handy Spielfeld – sie kommt auf Abruf über die
    // Statusleiste und geht beim nächsten Tipp wieder.
    this.require('#player-panel').addEventListener('click', () => {
      this.root.classList.toggle('minimap-open');
    });
    // Zurück zur Landingpage: Ein sauberer Neuladen ist hier bewusst die ganze
    // Wahrheit – frischer Startscreen, frische Bestenliste, kein halber Zustand.
    this.require<HTMLButtonElement>('#exit-to-start').addEventListener('click', () => location.reload());
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
    // Signature nur zeigen, wenn der Server die Mechanik meldet UND die
    // Familie ein Wort dafür hat – sonst stünde dort ein namenloser Prozentwert.
    const signature = signatureRatio(self.signature);
    const signatureName = signatureLabel(self.playerClass);
    const showSignature = signature !== null && signatureName !== null;
    this.signatureRow.hidden = !showSignature;
    if (showSignature) {
      this.signatureLabelEl.textContent = signatureName;
      this.signatureValue.textContent = `${Math.round(signature * 100)} %`;
    }

    this.points.textContent = String(self.availablePoints);
    const noPoints = self.availablePoints <= 0;
    /*
     * Das Panel bleibt stehen, auch wenn kein Punkt mehr offen ist.
     *
     * Die zehn Pips je Wert sind die EINZIGE Darstellung der investierten
     * Punkte im ganzen Client – kein zweiter Ort rendert sie, das Rad zeigt
     * ausdrücklich keine Werte, und die Wahlkarten zeigen die Basisklasse ohne
     * die eigenen Punkte. Solange das Panel mit dem letzten Punkt verschwand,
     * konnte niemand die Frage „was habe ich eigentlich gebaut?" beantworten.
     * Die Knöpfe sind ohne Punkte ohnehin schon `disabled` (weiter unten) –
     * es fehlte nur das Hinsehen.
     */
    this.upgrades.hidden = self.dead;
    // Nur-Lese-Zustand: kein Punkt offen, das Panel steht als Bilanz da. Auf
    // sehr flachen Fenstern blendet die CSS genau diesen Zustand wieder aus --
    // dort ist der Platz die knappere Ressource (gemessen: 1280x430).
    this.upgrades.classList.toggle('read-only', noPoints);
    this.pointsBadge.hidden = self.dead;
    this.pointsBadgeCount.textContent = String(self.availablePoints);
    // Der letzte verteilte Punkt schließt das Sheet – sonst bliebe eine leere
    // Fläche über den Sticks stehen. Aufmachen darf man es danach weiter: Das
    // Badge bleibt, und der Blick auf den eigenen Build ist genau der Grund.
    if (noPoints || self.dead) this.upgrades.classList.remove('sheet-open');

    // Cast, bis 01 die beiden Familien-Slots in `shared` aufgenommen hat
    // (Muster wie bei `spectatorTargetId`). Danach fällt er ersatzlos weg.
    const levels = self.upgrades as unknown as Partial<Record<UpgradeSlotId, number>>;
    const familyLocked = familyUpgradeLocked(self.playerClass);
    for (const id of UPGRADE_SLOT_IDS) {
      const family = isFamilyUpgrade(id);
      // Ein Familien-Slot erscheint erst, wenn der Server ihn selbst mitschickt.
      // Solange `upgrades` ihn nicht kennt, würde ein Klick eine Nachricht
      // auslösen, die der Server mit einer Fehlermeldung verwirft – ein Knopf
      // ins Leere ist schlimmer als gar keiner.
      // Was bei dieser Klasse nichts tut, steht auch nicht im Panel. Für einen
      // Controller sind das Kugeltempo, Durchschlag und Reichweite – er hat
      // kein Rohr. Der Server lehnt sie ohnehin ab (`upgradeAppliesTo`); ein
      // Knopf, der einen Punkt zu kosten scheint und nichts bewirkt, ist genau
      // die Sorte „zu viele Upgrades", über die Sam gestolpert ist.
      //
      // Das `family ||` sieht nach einer Hintertür aus – es lässt die beiden
      // Signature-Slots an `upgradeAppliesTo` vorbei, und bei `core` wirken die
      // nicht. Es bleibt trotzdem stehen, und zwar mit Absicht: Diese beiden
      // werden weiter unten über `familyUpgradeLocked` gesperrt und tragen dann
      // `FAMILY_LOCK_HINT` – „Erst mit einer Familie ab Level 10". Ausgegraut
      // mit Begründung ist hier besser als unsichtbar; der Spieler sieht, dass
      // es die Plätze gibt und was sie freischaltet. Verstecken hiesse, den
      // halben Fortschrittsbaum zu verheimlichen.
      //
      // Der Server verlaesst sich darauf ausdrücklich NICHT: `applyUpgrade`
      // lehnt sie über dieselbe Prüfung ab, egal was der Client schickt.
      const wirkt = family || upgradeAppliesTo(self.playerClass, id as UpgradeId);
      const known = wirkt && (!family || levels[id] !== undefined);
      const currentLevel = levels[id] ?? 0;
      const pips = this.root.querySelectorAll<HTMLElement>(`[data-pips="${id}"] i`);
      pips.forEach((pip, index) => pip.classList.toggle('filled', index < currentLevel));
      const button = this.upgradeButtons.get(id);
      if (!button) continue;
      button.hidden = !known;
      if (!known) continue;
      if (family) {
        const label = this.root.querySelector<HTMLElement>(`[data-upgrade-label="${id}"]`);
        if (label) label.textContent = slotLabel(id, self.playerClass);
        button.classList.toggle('locked', familyLocked);
      }
      const locked = family && familyLocked;
      const maxed = currentLevel >= GAME.maxUpgradeLevel;
      button.disabled = self.dead || self.availablePoints <= 0 || maxed || locked;
      button.title = locked ? FAMILY_LOCK_HINT : maxed ? 'Maximum erreicht' : '';
    }

    const healthRatio = self.health / Math.max(1, self.maxHealth);
    this.vignette.classList.toggle('active', !self.dead && healthRatio < 0.35);

    /*
     * Die Laufzeit wird beim Tod eingefroren, nicht bis in alle Ewigkeit
     * weitergerechnet.
     *
     * `updateDeathScreen` rechnete `Date.now() - runStartedAt` bei JEDEM
     * Snapshot neu – also zwanzigmal pro Sekunde, auch lange nach dem Tod. Im
     * Battle Royale, wo es keinen Wiedereinstieg gibt und eine Runde rund zehn
     * Minuten dauert, wurde aus „Überlebt 1m 30s" beim Zusehen „Überlebt
     * 7m 30s". Die Kachel behauptete damit ein Vielfaches der echten Zeit.
     */
    if (this.wasDead && !self.dead) {
      this.runStartedAt = Date.now();
      this.runEndedAt = null;
      this.killsAtLifeStart = self.kills;
    }
    if (!this.wasDead && self.dead) this.runEndedAt = Date.now();
    this.wasDead = self.dead;

    if (self.streak > this.lastStreak && [3, 5, 8, 12].includes(self.streak)) {
      this.toast(`${self.streak}er-Streak!`, 'Du bist nicht zu stoppen – bleib wachsam.', 'success');
    }
    this.lastStreak = self.streak;

    // Der Drohnen-Knopf existiert nur für Klassen mit Drohnen: Für die
    // übrigen 55 tat „REPEL" nichts – außer still den Spawnschutz zu beenden
    // (Befund 40). Der CSS-Guard `[hidden]` steht in style.css, weil die
    // Touch-Regeln `display` sonst überschreiben.
    this.secondaryAction.hidden = CLASS_DEFINITIONS[self.playerClass].droneCount === 0;

    this.updateClassSelection(self);
    this.updateDeathScreen(snapshot, self);
    this.renderLeaderboard(snapshot);
    this.renderKillfeed(snapshot);
    this.renderRadar(snapshot, self);
    if (self.deaths > this.lastDeathCount) {
      // Im Royale ist der Tod das Ende der Runde, kein Neustart auf Level x –
      // die gewohnte Meldung wäre dort schlicht falsch.
      if (royaleZoneOf(snapshot)) this.toast('Ausgeschieden', 'Du bist raus, bis die Runde vorbei ist.', 'danger');
      // Klasse und Score gehören dazu: „Level 11" allein verschwieg, dass es
      // als Core mit halbem Score weitergeht (Befund 15).
      else this.toast('Run beendet', deathToastText(respawnFacts(self)), 'danger');
    }
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
    // Im Tod nichts umbauen und den Auswahl-Schlüssel stehen lassen: Sonst
    // klappte nach JEDEM Respawn dieselbe Auswahl wieder auf, auch wenn der
    // Spieler sie vor dem Tod bewusst zugeklappt hatte (Befund 13).
    if (self.dead) return;
    const key = choices.join('|');
    if (key === this.lastClassChoicesKey) return;
    this.lastClassChoicesKey = key;
    // Eine *neue* Auswahl klappt wieder auf: Wer die letzte weggeklickt hat,
    // wollte diese eine nicht sehen – nicht alle künftigen. Auf Touch bleibt
    // sie zu: Die offene Wahl schaltet dort bewusst Sticks und Fähigkeit stumm
    // (hud-layout.css) – ohne Zutun aufgeklappt stünde der Tank mitten in der
    // Arena still, rund zwölfmal in den ersten zehn Minuten (Befund 13). Die
    // Leiste „NEUE KLASSE – N Wege offen" fällt trotzdem auf; wer sie antippt,
    // akzeptiert den Stillstand bewusst.
    this.classSelection.dataset.collapsed = this.autoCollapseClassSelection ? 'true' : 'false';
    const zaehler = this.classSelection.querySelector('#class-selection-count');
    if (zaehler) zaehler.textContent = `${choices.length} ${choices.length === 1 ? 'Weg' : 'Wege'} offen`;
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
    // Das Bild des Tanks, mit dem dieser Run endete - dieselbe Geometrie wie
    // ueberall. Nur neu zeichnen, wenn sich die Klasse geaendert hat.
    if (this.deathPortrait.dataset.classId !== self.playerClass) {
      this.deathPortrait.dataset.classId = self.playerClass;
      this.deathPortrait.dataset.branch = CLASS_DEFINITIONS[self.playerClass].branch;
      this.deathPortrait.innerHTML = classPreviewSvg(self.playerClass);
    }
    // Beim Zuschauen ist der Death-Screen im Weg: Er legt sich abgedunkelt und
    // weichgezeichnet über genau das, was man sehen soll. Dann schrumpft die
    // Karte in die untere Ecke und gibt die Arena frei – Respawn, Countdown und
    // der Weg zum Startscreen bleiben dabei sichtbar und klickbar.
    this.deathScreen.classList.toggle('spectating', spectatedName(snapshot) !== null);
    const remaining = Math.max(0, self.canRespawnAt - snapshot.serverTime);
    const aliveText = runDurationText(runSeconds(this.runStartedAt, this.runEndedAt, Date.now()));
    // Kills DIESES Lebens: Die Engine zählt `kills` über die Sitzung weiter,
    // die Karte sagt aber „RUN BEENDET" (Befund 58).
    const lifeKills = Math.max(0, self.kills - this.killsAtLifeStart);
    // Ehrliche Neustart-Zeile: Klasse, halbierter Score und XP-Behalt aus
    // denselben shared-Formeln, mit denen der Server rechnet (Befunde 15/28).
    const facts = respawnFacts(self);
    this.deathKiller.textContent = `Eliminiert von ${self.killerName || 'Arena'}`;
    // Dieselben Zahlen in einer Zeile statt in sechs Kacheln.
    this.deathSummary.textContent = `LEVEL ${self.deathLevel} · ${lifeKills} KILLS · ${self.score.toLocaleString('de-DE')} SCORE · ${aliveText}`;
    this.deathStats.innerHTML = `<div><span>Erreicht</span><b>Level ${self.deathLevel}</b></div><div><span>${respawnTileLabel(facts)}</span><b>${respawnTileValue(facts)}</b></div><div><span>Score</span><b>${self.score.toLocaleString('de-DE')}</b></div><div><span>Kills</span><b>${lifeKills}</b></div><div><span>Überlebt</span><b>${aliveText}</b></div><div><span>Beste Streak</span><b>${self.bestStreak}</b></div>`;
    /*
     * Im Battle Royale gibt es keinen Wiedereinstieg in die laufende Runde –
     * der Server schiebt `canRespawnAt` dafür auf Unendlich. Ein Countdown
     * darüber rechnete „Respawn verfügbar in Infinitys": eine Zahl, die es
     * nicht gibt, über einem Knopf, der nie freigeht. Hier steht deshalb, was
     * wirklich passiert – und der Knopf verschwindet, statt tot dazustehen.
     */
    const royaleText = royaleDeathText(royaleZoneOf(snapshot));
    this.respawnButton.hidden = royaleText !== null;
    this.royaleDeathNote.hidden = royaleText === null;
    if (royaleText !== null) {
      this.royaleDeathNote.textContent = royaleText;
      // Unten steht dasselbe noch einmal: Die Karte laesst sich scrollen, und
      // wer unten landet, soll dort nicht den alten Respawn-Text vorfinden.
      this.respawnCountdown.textContent = royaleText;
      return;
    }
    this.respawnButton.disabled = remaining > 0;
    const autoInSeconds = Math.max(0, Math.ceil((self.autoRespawnAt - snapshot.serverTime) / 1000));
    // Menschen werden nicht mehr zwangs-respawnt (nur das 10-Minuten-AFK-Netz) –
    // ein Countdown über einer Minute ist also keiner, den man anzeigt.
    this.respawnCountdown.textContent = remaining > 0
      ? `Respawn verfügbar in ${(remaining / 1000).toFixed(1)}s`
      : autoInSeconds <= 60 ? `Respawn bereit · automatisch in ${autoInSeconds}s` : 'Respawn bereit';
  }

  private renderLeaderboard(snapshot: WorldSnapshot): void {
    const key = snapshot.leaderboard.map((entry) => `${entry.id}:${entry.score}:${entry.level}:${entry.playerClass}`).join('|');
    if (key === this.lastLeaderboardKey) return;
    this.lastLeaderboardKey = key;
    const title = document.createElement('div');
    title.className = 'panel-title';
    // Dieselbe Liste heißt auf dem Startscreen „Bestenliste" – ein Name für
    // eine Sache (Befund 45).
    title.textContent = 'BESTENLISTE';
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
    /*
     * Mittelpunkt ist die KAMERA, nicht der eigene Tank.
     *
     * Beim Zuschauen ist der eigene Tank eine Leiche, und der Server baut den
     * Snapshot aus der Perspektive des Killers: Culling, Wandauswahl und
     * Sichtfenster hängen an dessen Position. Ein Radar um die Leiche zeigte
     * deshalb eine Fläche, in der nichts mehr ist -- Wände, Zone und Gegner
     * liegen alle ausserhalb. Der Renderer rechnet längst so; hier fehlte es.
     */
    const kamera = spectatedPlayer(snapshot) ?? self;
    const toRadar = (position: { x: number; y: number }): { x: number; y: number } => ({
      x: width / 2 + ((position.x - kamera.position.x) / halfWorldWidth) * (width / 2),
      y: height / 2 + ((position.y - kamera.position.y) / halfWorldHeight) * (height / 2)
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
    /*
     * Die Royale-Zone auf dem Radar. Sie ist hier wichtiger als im Spielfeld:
     * Der Radar zeigt nur die nähere Umgebung, und genau dort entscheidet sich,
     * ob man noch drin ist. Ein Kreis, der über den Radarrand hinausreicht,
     * wird vom `clip` sauber abgeschnitten – das ist gewollt, denn dann ist die
     * Grenze weit weg und die Antwort lautet ohnehin „drin".
     */
    const zone = royaleZoneOf(snapshot);
    if (zone) {
      const mitte = toRadar(zone.center);
      context.beginPath();
      context.strokeStyle = cssColor(0x7bd6ff, zone.phase === 'schrumpft' ? 0.95 : 0.6);
      context.lineWidth = 1.5;
      context.arc(mitte.x, mitte.y, (zone.radius / halfWorldWidth) * (width / 2), 0, Math.PI * 2);
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
