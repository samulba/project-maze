import { UPGRADE_IDS, availableClassChoices, type PlayerSnapshot, type WorldSnapshot } from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import {
  ONBOARDING_DURATION_MS,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  activeStep,
  completedSteps,
  isOnboardingComplete,
  type OnboardingContext
} from './onboarding';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;

const upgradeTotal = (player: PlayerSnapshot): number =>
  UPGRADE_IDS.reduce((sum, id) => sum + player.upgrades[id], 0);

/**
 * Blendet den jeweils passenden Einstiegshinweis ein und hebt das zugehörige
 * HUD-Element hervor. Läuft nur beim ersten Besuch und lässt sich überspringen.
 */
export class OnboardingCoach {
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly touch = window.matchMedia('(pointer: coarse)').matches;
  private active: boolean;
  private elapsedMs = 0;
  private lastTickAt: number | null = null;
  private moved = false;
  private farmed = false;
  private spentPoint = false;
  private usedAbility = false;
  private baselineUpgrades: number | null = null;
  private eventRunning = false;
  private eventHintShownMs = 0;
  private lastStepMs = 0;
  private focused: Element | null = null;
  private currentStepId: string | null = null;

  constructor(private readonly root: HTMLElement) {
    this.active = !hasCompletedOnboarding();

    this.card = document.createElement('section');
    this.card.className = 'onboarding';
    this.card.hidden = true;
    this.card.innerHTML = `
      <div class="onboarding-head">
        <span class="onboarding-eyebrow">ERSTE SCHRITTE</span>
        <span class="onboarding-counter" data-onboarding-counter></span>
        <button class="onboarding-skip" type="button" data-onboarding-skip aria-label="Hinweise überspringen">ÜBERSPRINGEN</button>
      </div>
      <strong data-onboarding-title></strong>
      <span data-onboarding-text></span>
      <i class="onboarding-progress"><b data-onboarding-progress></b></i>`;
    this.title = this.card.querySelector<HTMLElement>('[data-onboarding-title]')!;
    this.text = this.card.querySelector<HTMLElement>('[data-onboarding-text]')!;
    this.counter = this.card.querySelector<HTMLElement>('[data-onboarding-counter]')!;
    this.progress = this.card.querySelector<HTMLElement>('[data-onboarding-progress]')!;
    this.card.querySelector<HTMLButtonElement>('[data-onboarding-skip]')?.addEventListener('click', () => this.finish());

    const hud = this.root.querySelector<HTMLElement>('#hud') ?? this.root;
    hud.append(this.card);
  }

  /** `moving` kommt aus dem Input, weil nur dort echte Eingabe von Rückstoß unterscheidbar ist. */
  update(snapshot: WorldSnapshot, moving: boolean): void {
    if (!this.active) return;
    const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
    if (!self) return;

    this.track(snapshot, self, moving);
    const context = this.context(self);
    const step = activeStep(context);

    if (isOnboardingComplete(context)) {
      this.finish();
      return;
    }

    // Im Tod ruht das Onboarding – dort erklärt der Death-Screen.
    if (!step || self.dead) {
      this.card.hidden = true;
      this.setFocus(null);
      this.currentStepId = null;
      // Die Klasse gehört an „gerade steht eine Karte", nicht an „das
      // Onboarding ist noch nicht abgeschlossen": Zwischen den Grundlagen und
      // dem Event-Hinweis liegen bis zu zehn Minuten (ONBOARDING_EVENT_WINDOW),
      // und solange die Klasse hing, fehlten auf Touch Event- und
      // Bounty-Banner, auf dem Desktop stand die obere Spalte 108 px zu tief
      // (Befund 14).
      document.documentElement.classList.remove('onboarding-active');
      return;
    }

    // Der Event-Hinweis gilt erst als gelesen, wenn er auch wirklich stand.
    if (step.id === 'event') this.eventHintShownMs += this.lastStepMs;

    if (step.id !== this.currentStepId) {
      this.currentStepId = step.id;
      this.title.textContent = step.title;
      this.text.textContent = step.hint(this.touch);
      this.setFocus(step.focus(this.touch));
      this.card.classList.remove('enter');
      void this.card.offsetWidth;
      this.card.classList.add('enter');
    }
    this.counter.textContent = `${Math.min(ONBOARDING_STEPS.length, completedSteps(context) + 1)}/${ONBOARDING_STEPS.length}`;
    // Der Balken zeigt das Grundlagen-Fenster; ereignisgebundene Hinweise
    // danach lassen ihn schlicht voll stehen.
    this.progress.style.width = `${Math.min(100, Math.round((context.elapsedMs / ONBOARDING_DURATION_MS) * 100))}%`;
    this.card.hidden = false;
    document.documentElement.classList.add('onboarding-active');
  }

  /** Verbindungsabbruch: Uhr anhalten, damit die Wartezeit nicht als Spielzeit zählt. */
  pause(): void {
    this.lastTickAt = null;
  }

  private track(snapshot: WorldSnapshot, self: PlayerSnapshot, moving: boolean): void {
    const now = performance.now();
    this.lastStepMs = this.lastTickAt === null ? 0 : Math.min(1000, now - this.lastTickAt);
    if (this.lastTickAt !== null && !self.dead) this.elapsedMs += this.lastStepMs;
    this.eventRunning = Boolean((snapshot as ExtendedSnapshot).arenaEvent);
    this.lastTickAt = now;

    if (moving) this.moved = true;
    if (self.score > 0) this.farmed = true;

    const total = upgradeTotal(self);
    if (this.baselineUpgrades === null) this.baselineUpgrades = total;
    if (total > this.baselineUpgrades) this.spentPoint = true;

    const gameplay = (snapshot as ExtendedSnapshot).gameplay?.[self.id];
    if (gameplay && gameplay.moduleActiveUntil > snapshot.serverTime) this.usedAbility = true;
  }

  private context(self: PlayerSnapshot): OnboardingContext {
    return {
      elapsedMs: this.elapsedMs,
      touch: this.touch,
      moved: this.moved,
      farmed: this.farmed,
      availablePoints: self.availablePoints,
      spentPoint: this.spentPoint,
      usedAbility: this.usedAbility,
      classChoicesOpen: availableClassChoices(self.playerClass, self.level).length > 0,
      specialized: self.playerClass !== 'core',
      eventRunning: this.eventRunning,
      eventHintShownMs: this.eventHintShownMs
    };
  }

  private setFocus(selector: string | null): void {
    if (this.focused) this.focused.classList.remove('onboarding-focus');
    this.focused = selector ? this.root.querySelector(selector) : null;
    this.focused?.classList.add('onboarding-focus');
  }

  private finish(): void {
    this.active = false;
    this.card.hidden = true;
    this.setFocus(null);
    document.documentElement.classList.remove('onboarding-active');
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      /* Ohne Storage erscheinen die Hinweise beim nächsten Besuch erneut. */
    }
  }
}

function hasCompletedOnboarding(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
