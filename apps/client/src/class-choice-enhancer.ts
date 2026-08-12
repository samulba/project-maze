import { CLASS_DEFINITIONS, type PlayerClass } from '@project-maze/shared';
import { classBalanceMetrics } from '@project-maze/shared/balance';
import { classPreviewSvg } from './class-preview';
import { perkFor } from '@project-maze/shared/perks';
import { familyInfo, leadsTo } from './class-tree';

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
  /*
   * „Angriff" heißt: was ankommt, wenn ich ziele.
   *
   * Hier stand `projectileDps` – die Summe ALLER Rohre, auch der nach hinten
   * gerichteten. Bei 53 der 55 Klassen mit Rohr ist das dasselbe. Bei zwei
   * nicht, und dort log der Balken kräftig:
   *
   *   Octo     173,3 gesamt, davon 65,0 nach vorn  (38 %) → Balken stand auf 100 %
   *   Flanker   91,7 gesamt, davon 45,8 nach vorn  (50 %) → Balken stand auf  87 %
   *
   * Octo saß damit am oberen Anschlag der Skala – die Karte versprach den
   * härtesten Angriff im Spiel, während zwei Drittel davon zur Seite und nach
   * hinten gingen. Wer danach wählt, wird enttäuscht, und genau dieses Gefühl
   * unterscheidet ein fertiges Spiel von einem Prototyp.
   *
   * `forwardProjectileDps` zählt nur Rohre innerhalb von ±60° zur Blickrichtung.
   * Damit bedeutet derselbe Balken bei allen Klassen dasselbe. Dass Octo auch
   * rundum austeilt, bleibt seine Stärke – sie gehört in die Beschreibung, nicht
   * in einen Balken, der „Angriff" heißt.
   */
  const attack = Math.max(metrics.forwardProjectileDps, metrics.dronePressure, metrics.bodyThreat * 0.75);
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

  // Die eine Zeile, die den Unterschied macht (Befund 12): die Füllbedingung
  // der Signature. GOAL.md nennt sie das Entscheidende an den Familien – auf
  // der Karte stand sie nie, nur im Rad auf Taste C. Erster Satz von
  // `builds`, mehr Platz hat die Ecke nicht (auf flachen Fenstern blendet
  // class-choice.css sie aus, damit alle acht Karten sichtbar bleiben).
  const info = familyInfo(definition.branch);
  if (info) {
    const fill = document.createElement('i');
    fill.className = 'class-choice-fill';
    fill.textContent = `${info.signature}: ${(info.builds.split('.')[0] ?? info.builds).trim()}.`;
    button.append(fill);
  }

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
