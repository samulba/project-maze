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

  const rollenname = definition.branch === 'rapid' ? 'DAUERFEUER'
    : definition.branch === 'precision' ? 'PRÄZISION'
      : definition.branch === 'control' ? 'KONTROLLE'
        : definition.branch === 'impact' ? 'PANZERUNG'
          : definition.branch === 'specter' ? 'TARNUNG'
            : definition.branch === 'tempest' ? 'HITZE'
              : definition.branch === 'siege' ? 'STELLUNG'
                : definition.branch === 'aegis' ? 'SCHILD' : 'ALLROUNDER';

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
  const werte: Array<readonly [string, number]> = [
    ['Angriff', percent(attack / 1.05)],
    ['Defense', percent(metrics.effectiveDurability / 3)],
    ['Tempo', percent(metrics.mobility / 3.5)],
    ['Range', percent(metrics.projectileRange / 42)]
  ];

  // Das Bild des Tanks, gezeichnet aus denselben Werten wie im Spiel – jetzt
  // das einzige, was auf der Karte Platz einnimmt (Sams Punkt 4 vom 14.08.).
  const preview = document.createElement('figure');
  preview.className = 'class-choice-preview';
  preview.innerHTML = classPreviewSvg(playerClass);
  button.prepend(preview);

  /*
   * Alles Übrige wandert in den Tooltip statt von der Karte zu verschwinden.
   *
   * Sam will Bild und Name – Rolle, Signature-Kurzform, vier Balken, Perk-Zeile
   * und „führt zu" nahmen zusammen rund zwei Drittel der Kartenhöhe ein und
   * ließen für das Bild 64 px. Gelöscht ist davon nichts: Der Tooltip trägt
   * dieselben Angaben, nur ohne Platz zu kosten.
   */
  const info = familyInfo(definition.branch);
  const perk = perkFor(playerClass);
  const ziele = leadsTo(playerClass);
  const zeilen = [
    `${definition.label} · ${rollenname}${info ? ` · ${info.buildsKurz}` : ''}`,
    definition.description,
    werte.map(([label, wert]) => `${label} ${wert}`).join(' · '),
    perk ? `${perk.label}: ${perk.blurb}` : '',
    ziele ? `führt zu → ${ziele.join(' · ')}` : ''
  ].filter(Boolean);
  button.title = zeilen.join('\n');
}

export function enhanceClassChoices(root: HTMLElement): void {
  const container = root.querySelector<HTMLElement>('#class-choices');
  if (!container) return;
  const refresh = (): void => container.querySelectorAll<HTMLButtonElement>('[data-class-choice]').forEach(enhanceButton);
  refresh();
  new MutationObserver(refresh).observe(container, { childList: true });
}
