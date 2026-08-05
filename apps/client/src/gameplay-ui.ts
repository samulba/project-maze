import type { PlayerSnapshot, WorldSnapshot } from '@project-maze/shared';
import {
  ACTIVE_MODULE_DEFINITIONS,
  ACTIVE_MODULE_IDS,
  DEFAULT_ACTIVE_MODULE,
  DEFAULT_PASSIVE_MODIFIER,
  PASSIVE_MODIFIER_DEFINITIONS,
  PASSIVE_MODIFIER_IDS,
  type ActiveModuleId,
  type EquipLoadoutMessage,
  type GameplayWorldExtension,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { vibrate } from './input';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;
type SendMessage = (message: object) => void;

const editableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
};

const EVENT_COPY: Partial<Record<string, { name: string; active: string; where: string }>> = {
  coreSurge: { name: 'CORE SURGE', active: 'mehr Shapes und Elites im Zentrum', where: 'Zentrum' },
  overcharge: { name: 'OVERCHARGE', active: 'Geschosse löschen sich in der Zone nicht mehr aus', where: 'Zentrum' },
  hunterSignal: { name: 'HUNTER SIGNAL', active: 'neutraler Guardian im Zentrum · 600 Bonus-XP', where: 'Zentrum' },
  // Fracture ist ortlos – ein "Zentrum"-Hinweis würde Spieler an eine Stelle schicken, an der nichts passiert.
  fracture: { name: 'FRACTURE', active: 'einzelne Wände sind arenaweit aufgebrochen', where: 'arenaweit' }
};

export class GameplayUI {
  private readonly root: HTMLElement;
  private readonly send: SendMessage;
  private readonly loadoutPanel: HTMLElement;
  private readonly moduleSelect: HTMLSelectElement;
  private readonly modifierSelect: HTMLSelectElement;
  private readonly abilityButton: HTMLButtonElement;
  private readonly abilityLabel: HTMLElement;
  private readonly abilityCooldown: HTMLElement;
  private readonly eventBanner: HTMLElement;
  private readonly bountyBanner: HTMLElement;
  private self: PlayerSnapshot | null = null;
  private connected = false;

  constructor(root: HTMLElement, send: SendMessage) {
    this.root = root;
    this.send = send;

    const storedModule = window.localStorage.getItem('project-maze-module') as ActiveModuleId | null;
    const storedModifier = window.localStorage.getItem('project-maze-modifier') as PassiveModifierId | null;
    const initialModule = storedModule && ACTIVE_MODULE_IDS.includes(storedModule) ? storedModule : DEFAULT_ACTIVE_MODULE;
    const initialModifier = storedModifier && PASSIVE_MODIFIER_IDS.includes(storedModifier) ? storedModifier : DEFAULT_PASSIVE_MODIFIER;

    const loadout = document.createElement('section');
    loadout.className = 'core-loadout';
    loadout.innerHTML = `
      <div class="core-loadout-heading"><span>CORE LOADOUT</span><small>1 Fähigkeit · 1 optionaler Trade-off</small></div>
      <div class="core-loadout-fields">
        <label>AKTIVES MODUL<select data-module-select></select></label>
        <label>FRAME<select data-modifier-select></select></label>
      </div>
      <div class="core-loadout-description" data-loadout-description></div>`;
    this.loadoutPanel = loadout;

    const playButton = root.querySelector('#join-button');
    playButton?.parentElement?.insertBefore(loadout, playButton);
    this.moduleSelect = loadout.querySelector<HTMLSelectElement>('[data-module-select]')!;
    this.modifierSelect = loadout.querySelector<HTMLSelectElement>('[data-modifier-select]')!;

    for (const id of ACTIVE_MODULE_IDS) {
      const definition = ACTIVE_MODULE_DEFINITIONS[id];
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${definition.label} · ${definition.role}`;
      this.moduleSelect.append(option);
    }
    for (const id of PASSIVE_MODIFIER_IDS) {
      const definition = PASSIVE_MODIFIER_DEFINITIONS[id];
      const option = document.createElement('option');
      option.value = id;
      option.textContent = definition.label;
      this.modifierSelect.append(option);
    }
    this.moduleSelect.value = initialModule;
    this.modifierSelect.value = initialModifier;

    const updateDescription = (): void => {
      const module = ACTIVE_MODULE_DEFINITIONS[this.selectedModule];
      const modifier = PASSIVE_MODIFIER_DEFINITIONS[this.selectedModifier];
      const element = loadout.querySelector<HTMLElement>('[data-loadout-description]');
      if (element) element.textContent = `${module.description} ${modifier.description}`;
    };
    const changed = (): void => {
      window.localStorage.setItem('project-maze-module', this.selectedModule);
      window.localStorage.setItem('project-maze-modifier', this.selectedModifier);
      updateDescription();
      if (this.connected && (this.self?.dead || this.self?.invulnerable)) this.sendLoadout();
    };
    this.moduleSelect.addEventListener('change', changed);
    this.modifierSelect.addEventListener('change', changed);
    updateDescription();

    const hud = root.querySelector<HTMLElement>('#hud') ?? root;
    this.abilityButton = document.createElement('button');
    this.abilityButton.type = 'button';
    this.abilityButton.className = 'core-ability';
    this.abilityButton.setAttribute('aria-label', 'Fähigkeit auslösen');
    this.abilityButton.innerHTML = `
      <span class="core-ability-key">SPACE</span>
      <strong data-ability-label>DASH</strong>
      <small data-ability-cooldown>READY</small>
      <i></i>`;
    hud.append(this.abilityButton);
    this.abilityLabel = this.abilityButton.querySelector<HTMLElement>('[data-ability-label]')!;
    this.abilityCooldown = this.abilityButton.querySelector<HTMLElement>('[data-ability-cooldown]')!;

    this.eventBanner = document.createElement('div');
    this.eventBanner.className = 'arena-event-banner';
    this.eventBanner.hidden = true;
    hud.append(this.eventBanner);

    this.bountyBanner = document.createElement('div');
    this.bountyBanner.className = 'bounty-banner';
    this.bountyBanner.hidden = true;
    hud.append(this.bountyBanner);

    // Auf Touch zählt der Moment des Aufsetzens: Warten auf `click` (Press *und* Release
    // am selben Punkt) kostet in einem Gefecht spürbar Zeit.
    let lastTouchActivation = 0;
    this.abilityButton.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      event.preventDefault();
      lastTouchActivation = performance.now();
      if (this.activate()) vibrate(14);
    });
    this.abilityButton.addEventListener('click', () => {
      // Der synthetische Klick nach einer Touch-Auslösung darf nicht doppelt zünden.
      if (performance.now() - lastTouchActivation < 600) return;
      this.activate();
    });
    window.addEventListener('keydown', (event) => {
      if (event.repeat || editableTarget(event.target)) return;
      if (event.code !== 'Space' && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
      event.preventDefault();
      this.activate();
    });
  }

  get selectedModule(): ActiveModuleId { return this.moduleSelect.value as ActiveModuleId; }
  get selectedModifier(): PassiveModifierId { return this.modifierSelect.value as PassiveModifierId; }

  onWelcome(): void {
    this.connected = true;
    const deathCard = this.root.querySelector<HTMLElement>('.death-card');
    const respawnButton = deathCard?.querySelector<HTMLElement>('#respawn-button');
    if (deathCard && this.loadoutPanel.parentElement !== deathCard) {
      if (respawnButton) deathCard.insertBefore(this.loadoutPanel, respawnButton);
      else deathCard.append(this.loadoutPanel);
    }
    this.sendLoadout();
  }

  onDisconnect(): void {
    this.connected = false;
    this.self = null;
    this.abilityButton.disabled = true;
  }

  update(snapshot: WorldSnapshot): void {
    const extended = snapshot as ExtendedSnapshot;
    const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
    this.self = self;
    if (!self) return;

    const gameplay = extended.gameplay?.[self.id];
    if (!gameplay) return;
    if (this.moduleSelect.value !== gameplay.activeModule) this.moduleSelect.value = gameplay.activeModule;
    if (this.modifierSelect.value !== gameplay.passiveModifier) this.modifierSelect.value = gameplay.passiveModifier;

    const module = ACTIVE_MODULE_DEFINITIONS[gameplay.activeModule];
    const remaining = Math.max(0, gameplay.moduleReadyAt - snapshot.serverTime);
    const active = gameplay.moduleActiveUntil > snapshot.serverTime;
    const ready = remaining <= 0 && !self.dead;
    this.abilityLabel.textContent = module.shortLabel;
    this.abilityCooldown.textContent = self.dead ? 'NACH RESPAWN' : active ? 'ACTIVE' : ready ? 'READY' : `${(remaining / 1000).toFixed(1)}S`;
    this.abilityButton.disabled = !ready || active;
    this.abilityButton.classList.toggle('active', active);
    this.abilityButton.style.setProperty('--charge', `${Math.round(gameplay.moduleCharge * 100)}%`);
    this.abilityButton.dataset.module = gameplay.activeModule;

    const event = extended.arenaEvent;
    if (event) {
      const remainingEvent = Math.max(0, (event.phase === 'warning' ? event.startsAt : event.endsAt) - snapshot.serverTime);
      const copy = EVENT_COPY[event.kind] ?? EVENT_COPY.coreSurge!;
      this.eventBanner.hidden = false;
      this.eventBanner.dataset.phase = event.phase;
      this.eventBanner.innerHTML = event.phase === 'warning'
        ? `<strong>${copy.name}</strong><span>startet in ${Math.ceil(remainingEvent / 1000)}s · ${copy.where}</span>`
        : `<strong>${copy.name} AKTIV</strong><span>${Math.ceil(remainingEvent / 1000)}s · ${copy.active}</span>`;
    } else {
      this.eventBanner.hidden = true;
    }

    const bountyId = extended.bountyTargetId;
    const bountyTarget = bountyId ? snapshot.players.find((player) => player.id === bountyId) : null;
    const bountyValue = extended.bountyValue ?? 0;
    if (bountyId && bountyValue > 0) {
      this.bountyBanner.hidden = false;
      this.bountyBanner.classList.toggle('self', bountyId === self.id);
      this.bountyBanner.innerHTML = bountyId === self.id
        ? `<strong>BOUNTY AUF DIR</strong><span>${bountyValue} Bonus</span>`
        : `<strong>BOUNTY</strong><span>${bountyTarget?.name ?? 'Dominanter Spieler'} · ${bountyValue} Bonus</span>`;
    } else {
      this.bountyBanner.hidden = true;
    }

    const canChange = self.dead || self.invulnerable;
    this.moduleSelect.disabled = !canChange;
    this.modifierSelect.disabled = !canChange;
  }

  /** Gibt zurück, ob die Fähigkeit tatsächlich ausgelöst wurde (für Haptik-Feedback). */
  private activate(): boolean {
    if (!this.connected || !this.self || this.self.dead || this.abilityButton.disabled) return false;
    this.send({ type: 'activateModule' });
    return true;
  }

  private sendLoadout(): void {
    const message: EquipLoadoutMessage = {
      type: 'equipLoadout',
      activeModule: this.selectedModule,
      passiveModifier: this.selectedModifier
    };
    this.send(message);
  }
}
