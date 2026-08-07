import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { classBalanceMetrics } from '@project-maze/shared/balance';
import { classPreviewSvg } from './class-preview';
import { perkFor } from '@project-maze/shared/perks';
import { leadsTo } from './class-tree';

const percent = (value: number): number => Math.max(6, Math.min(100, Math.round(value)));

function enhanceButton(button: HTMLButtonElement): void {
  if (button.dataset.enhanced === 'true') return;
  const playerClass = button.dataset.classChoice as PlayerClass | undefined;
  if (!playerClass || !CLASS_DEFINITIONS[playerClass]) return;
  button.dataset.enhanced = 'true';
  const definition = CLASS_DEFINITIONS[playerClass];
  const metrics = classBalanceMetrics(playerClass);
  button.dataset.branch = definition.branch;

  const role = document.createElement('em');
  role.className = 'class-choice-role';
  role.textContent = definition.branch === 'rapid' ? 'DAUERFEUER'
    : definition.branch === 'precision' ? 'PRÄZISION'
      : definition.branch === 'control' ? 'KONTROLLE'
        : definition.branch === 'impact' ? 'PANZERUNG'
          : definition.branch === 'specter' ? 'TARNUNG'
            : definition.branch === 'tempest' ? 'HITZE'
              : definition.branch === 'siege' ? 'STELLUNG'
                : definition.branch === 'aegis' ? 'SCHILD' : 'ALLROUNDER';

  const bars = document.createElement('div');
  bars.className = 'class-choice-bars';
  const attack = Math.max(metrics.projectileDps, metrics.dronePressure, metrics.bodyThreat * 0.75);
  const values = [
    ['Angriff', percent(attack / 1.05)],
    ['Defense', percent(metrics.effectiveDurability / 3)],
    ['Tempo', percent(metrics.mobility / 3.5)],
    ['Range', percent(metrics.projectileRange / 42)]
  ] as const;
  for (const [label, width] of values) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${label}</span><i><b style="width:${width}%"></b></i>`;
    bars.append(row);
  }
  // Das Bild des Tanks, gezeichnet aus denselben Werten wie im Spiel. Es steht
  // vor dem Rollennamen: Sam wählt auf Level 10 unter Beschuss, und eine Form
  // ist in einer Zehntelsekunde erfasst, ein Wort nicht.
  const preview = document.createElement('figure');
  preview.className = 'class-choice-preview';
  preview.innerHTML = classPreviewSvg(playerClass);

  button.prepend(role);
  button.prepend(preview);
  button.append(bars);

  // Perk-Zeile (Welle B): das Merkmal, das nur diese Klasse hat. Starter
  // tragen keinen - dort erklaert die Familien-Signature den Stil.
  const perk = perkFor(playerClass);
  if (perk) {
    const perkRow = document.createElement('span');
    perkRow.className = 'class-choice-perk';
    perkRow.innerHTML = `<b>${perk.label}</b> ${perk.blurb}`;
    button.append(perkRow);
  }

  // Wohin der Weg fuehrt - nie wieder blind waehlen (MASTERPLAN, das Rad).
  const ziele = leadsTo(playerClass);
  if (ziele) {
    const leads = document.createElement('span');
    leads.className = 'class-choice-leads';
    leads.textContent = `führt zu → ${ziele.join(' · ')}`;
    button.append(leads);
  }
}

export function enhanceClassChoices(root: HTMLElement): void {
  const container = root.querySelector<HTMLElement>('#class-choices');
  if (!container) return;
  const refresh = (): void => container.querySelectorAll<HTMLButtonElement>('[data-class-choice]').forEach(enhanceButton);
  refresh();
  new MutationObserver(refresh).observe(container, { childList: true });
}
