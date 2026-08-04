import {
  CLASS_DEFINITIONS,
  GAME,
  PLAYER_CLASS_IDS,
  type PlayerClass
} from '@project-maze/shared';
import { classBalanceMetrics } from '@project-maze/shared/balance';

export type DebugPreset = 'blank' | 'balanced' | 'offense' | 'defense' | 'mobility';

type SendDebug = (message: object) => void;

const abilityText: Record<PlayerClass, string> = {
  core: 'Keine Spezialregel – verlässlicher Allrounder.',
  rapid: 'Hohe Feuerrate und geringe Schussrückstöße.',
  twin: 'Zwei kontrollierte Läufe für Projektilabwehr.',
  repeater: 'Drei eng gebündelte Läufe für Fokusfeuer.',
  storm: 'Breite Kugelwand für Flächenkontrolle.',
  gatling: 'Sechs leichte Läufe für maximales Dauerfeuer.',
  sniper: 'Präzisionsschüsse stoßen getroffene Ziele zurück.',
  hunter: 'Eigene Bewegung wird teilweise auf Kugeln übertragen.',
  railgun: 'Starker Treffer-Rückstoß und hohe Penetration.',
  phantom: 'Bewegte Schüsse erhalten zusätzlichen Schaden und Durchschlag.',
  lancer: 'Extremer Rückstoß und besonders langlebige Projektile.',
  drone: 'Linksklick Angriff, Rechtsklick Repel, sonst Orbit.',
  warden: 'Schnelle, leichte defensive Drohnen.',
  factory: 'Langsamere und deutlich robustere Drohnen.',
  overseer: 'Sehr schneller, fragiler Acht-Drohnen-Schwarm.',
  carrier: 'Große schwere Drohnen für langsamen Flächendruck.',
  rammer: 'Hohe Geschwindigkeit und starker Kontaktschaden.',
  crusher: 'Mehr Haltbarkeit und schwere Nahkampftreffer.',
  bulwark: 'Frontale Treffer verursachen 26 % weniger Schaden.',
  juggernaut: '8 % allgemeine Schadensreduktion und maximaler Body-Damage.',
  fortress: 'Frontale Treffer verursachen 38 % weniger Schaden.'
};

const clampPercent = (value: number): number => Math.max(4, Math.min(100, Math.round(value)));

export class BalanceLab {
  private readonly panel: HTMLElement | null;
  private readonly toggle: HTMLButtonElement | null;
  private readonly classSelect: HTMLSelectElement | null;
  private readonly levelSelect: HTMLSelectElement | null;
  private readonly presetSelect: HTMLSelectElement | null;
  private readonly title: HTMLElement | null;
  private readonly description: HTMLElement | null;
  private readonly ability: HTMLElement | null;
  private readonly metrics: HTMLElement | null;

  constructor(root: HTMLElement, send: SendDebug) {
    const local = import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!local) {
      this.panel = null;
      this.toggle = null;
      this.classSelect = null;
      this.levelSelect = null;
      this.presetSelect = null;
      this.title = null;
      this.description = null;
      this.ability = null;
      this.metrics = null;
      return;
    }

    const layer = root.querySelector<HTMLElement>('.ui-layer') ?? root;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'balance-lab-toggle';
    toggle.textContent = 'BALANCE LAB · F2';

    const panel = document.createElement('section');
    panel.className = 'balance-lab-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="balance-lab-head">
        <div><span>LOCAL DEV TOOLS</span><h2>BALANCE LAB</h2></div>
        <button type="button" data-lab-close>×</button>
      </div>
      <div class="balance-lab-layout">
        <div class="balance-lab-classes" data-lab-classes></div>
        <div class="balance-lab-config">
          <div class="balance-lab-current">
            <span data-lab-branch>CORE</span>
            <h3 data-lab-title>Core</h3>
            <p data-lab-description></p>
            <strong data-lab-ability></strong>
          </div>
          <div class="balance-lab-fields">
            <label>KLASSE<select data-lab-class></select></label>
            <label>LEVEL<select data-lab-level>${[10, 24, 38, 45].map((level) => `<option value="${level}">${level}</option>`).join('')}</select></label>
            <label>BUILD<select data-lab-preset>
              <option value="balanced">Balanced</option>
              <option value="offense">Offense</option>
              <option value="defense">Defense</option>
              <option value="mobility">Mobility</option>
              <option value="blank">Punkte selbst verteilen</option>
            </select></label>
          </div>
          <div class="balance-lab-metrics" data-lab-metrics></div>
          <div class="balance-lab-actions">
            <button type="button" class="primary" data-lab-apply>BUILD LADEN</button>
            <button type="button" data-lab-heal>HEILEN</button>
            <button type="button" data-lab-clear>PROJEKTILE LÖSCHEN</button>
          </div>
          <p class="balance-lab-note">Nur lokal aktiv. Auf dem späteren Produktivserver sind diese Befehle standardmäßig deaktiviert.</p>
        </div>
      </div>`;

    layer.append(toggle, panel);
    this.panel = panel;
    this.toggle = toggle;
    this.classSelect = panel.querySelector('[data-lab-class]');
    this.levelSelect = panel.querySelector('[data-lab-level]');
    this.presetSelect = panel.querySelector('[data-lab-preset]');
    this.title = panel.querySelector('[data-lab-title]');
    this.description = panel.querySelector('[data-lab-description]');
    this.ability = panel.querySelector('[data-lab-ability]');
    this.metrics = panel.querySelector('[data-lab-metrics]');

    if (!this.classSelect || !this.levelSelect || !this.presetSelect) return;

    for (const playerClass of PLAYER_CLASS_IDS) {
      const definition = CLASS_DEFINITIONS[playerClass];
      const option = document.createElement('option');
      option.value = playerClass;
      option.textContent = `${definition.label} · L${definition.unlockLevel}`;
      this.classSelect.append(option);
    }

    const classes = panel.querySelector<HTMLElement>('[data-lab-classes]');
    if (classes) {
      for (const playerClass of PLAYER_CLASS_IDS) {
        const definition = CLASS_DEFINITIONS[playerClass];
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.labClassCard = playerClass;
        button.dataset.branch = definition.branch;
        button.innerHTML = `<span>${definition.branch}</span><strong>${definition.label}</strong><small>L${definition.unlockLevel}</small>`;
        button.addEventListener('click', () => {
          if (!this.classSelect || !this.levelSelect) return;
          this.classSelect.value = playerClass;
          this.levelSelect.value = String(Math.max(definition.unlockLevel, Number(this.levelSelect.value)));
          this.renderClass(playerClass);
        });
        classes.append(button);
      }
    }

    const setOpen = (open: boolean): void => {
      panel.hidden = !open;
      toggle.classList.toggle('active', open);
      if (open) this.renderClass(this.classSelect?.value as PlayerClass || 'core');
    };
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    panel.querySelector('[data-lab-close]')?.addEventListener('click', () => setOpen(false));
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        setOpen(panel.hidden);
      }
      if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    this.classSelect.addEventListener('change', () => {
      const selected = this.classSelect?.value as PlayerClass;
      const definition = CLASS_DEFINITIONS[selected];
      if (this.levelSelect && Number(this.levelSelect.value) < definition.unlockLevel) this.levelSelect.value = String(definition.unlockLevel);
      this.renderClass(selected);
    });
    panel.querySelector('[data-lab-apply]')?.addEventListener('click', () => {
      send({
        type: 'debug',
        action: 'setBuild',
        playerClass: this.classSelect?.value as PlayerClass,
        level: Number(this.levelSelect?.value ?? GAME.maxLevel),
        preset: this.presetSelect?.value as DebugPreset
      });
    });
    panel.querySelector('[data-lab-heal]')?.addEventListener('click', () => send({ type: 'debug', action: 'heal' }));
    panel.querySelector('[data-lab-clear]')?.addEventListener('click', () => send({ type: 'debug', action: 'clearProjectiles' }));

    this.classSelect.value = 'core';
    this.levelSelect.value = '45';
    this.renderClass('core');
  }

  private renderClass(playerClass: PlayerClass): void {
    if (!this.panel) return;
    const definition = CLASS_DEFINITIONS[playerClass];
    const metrics = classBalanceMetrics(playerClass);
    const branch = this.panel.querySelector<HTMLElement>('[data-lab-branch]');
    if (branch) {
      branch.textContent = definition.branch.toUpperCase();
      branch.dataset.branch = definition.branch;
    }
    if (this.title) this.title.textContent = definition.label;
    if (this.description) this.description.textContent = definition.description;
    if (this.ability) this.ability.textContent = abilityText[playerClass];
    this.panel.querySelectorAll<HTMLElement>('[data-lab-class-card]').forEach((card) => card.classList.toggle('active', card.dataset.labClassCard === playerClass));

    if (!this.metrics) return;
    const values = [
      ['Dauerfeuer', metrics.projectileDps, clampPercent(metrics.projectileDps / 1.05)],
      ['Burst', metrics.burstDamage, clampPercent(metrics.burstDamage / 1.05)],
      ['Reichweite', metrics.projectileRange, clampPercent(metrics.projectileRange / 42)],
      ['Haltbarkeit', metrics.effectiveDurability, clampPercent(metrics.effectiveDurability / 3)],
      ['Mobilität', metrics.mobility, clampPercent(metrics.mobility / 3.5)],
      ['Drohnen', metrics.dronePressure, clampPercent(metrics.dronePressure / 1.4)],
      ['Body', metrics.bodyThreat, clampPercent(metrics.bodyThreat / 1.75)]
    ] as const;
    this.metrics.replaceChildren();
    for (const [label, value, percent] of values) {
      const row = document.createElement('div');
      row.innerHTML = `<span>${label}</span><div><i style="width:${percent}%"></i></div><b>${Math.round(value)}</b>`;
      this.metrics.append(row);
    }
  }
}
