/**
 * Onboarding für die ersten 60 Sekunden. Die Hinweise reagieren auf den
 * Spielzustand statt auf einen starren Timer: Wer schon farmt, bekommt keinen
 * Farm-Hinweis mehr. Reine Logik – die Darstellung liegt in `onboarding-view.ts`.
 */

export const ONBOARDING_DURATION_MS = 60_000;
export const ONBOARDING_STORAGE_KEY = 'project-maze-onboarded';

export interface OnboardingContext {
  /** Vergangene Arena-Zeit in Millisekunden (Todeszeit zählt nicht mit). */
  elapsedMs: number;
  /** Touch-Gerät – entscheidet über den Wortlaut der Hinweise. */
  touch: boolean;
  moved: boolean;
  farmed: boolean;
  availablePoints: number;
  spentPoint: boolean;
  usedAbility: boolean;
  classChoicesOpen: boolean;
  specialized: boolean;
}

export interface OnboardingStep {
  id: string;
  title: string;
  /** Hinweistext, getrennt nach Eingabeart. */
  hint: (touch: boolean) => string;
  /** HUD-Element, das begleitend hervorgehoben wird. */
  focus: (touch: boolean) => string | null;
  /** Der Hinweis ist in dieser Situation überhaupt sinnvoll. */
  isRelevant: (context: OnboardingContext) => boolean;
  /** Der Spieler hat es verstanden – der Hinweis kommt nicht wieder. */
  isDone: (context: OnboardingContext) => boolean;
}

/**
 * Reihenfolge = Priorität. Der erste Schritt, der relevant und noch nicht
 * erledigt ist, wird angezeigt.
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'move',
    title: 'Beweg dich',
    hint: (touch) =>
      touch
        ? 'Linker Daumen: Der Stick entsteht dort, wo du die linke Hälfte berührst.'
        : 'WASD oder die Pfeiltasten steuern deinen Tank.',
    focus: (touch) => (touch ? '#move-stick' : null),
    isRelevant: () => true,
    // Nach kurzer Zeit ausblenden, damit der Ablauf nie hängen bleibt.
    isDone: (context) => context.moved || context.elapsedMs > 14_000
  },
  {
    id: 'specialize',
    title: 'Spezialisierung wählen',
    hint: () => 'Du hast einen neuen Entwicklungspfad frei. Jede Klasse spielt sich anders.',
    focus: () => '#class-selection',
    isRelevant: (context) => context.classChoicesOpen,
    isDone: (context) => context.specialized
  },
  {
    id: 'upgrade',
    title: 'Upgrade-Punkt vergeben',
    hint: (touch) =>
      touch
        ? 'Level-up! Tippe im Upgrade-Panel auf die Eigenschaft, die du stärken willst.'
        : 'Level-up! Die Tasten 1–8 vergeben deine Upgrade-Punkte.',
    focus: () => '#upgrades',
    isRelevant: (context) => context.availablePoints > 0,
    isDone: (context) => context.spentPoint
  },
  {
    id: 'farm',
    title: 'Formen farmen',
    hint: (touch) =>
      touch
        ? 'Rechter Daumen zielt und feuert. Zerlege die Formen – sie geben XP.'
        : 'Linksklick feuert. Zerlege die Formen – sie geben XP.',
    focus: (touch) => (touch ? '#aim-stick' : null),
    isRelevant: () => true,
    isDone: (context) => context.farmed || context.elapsedMs > 34_000
  },
  {
    id: 'ability',
    title: 'Fähigkeit einsetzen',
    hint: (touch) =>
      touch
        ? 'Der runde Button neben dem rechten Stick löst deine Fähigkeit aus.'
        : 'Leertaste löst deine Fähigkeit aus – Dash, Barriere oder Reparatur.',
    focus: () => '.core-ability',
    // Erst zeigen, wenn der Einstieg sitzt.
    isRelevant: (context) => context.elapsedMs > 18_000,
    isDone: (context) => context.usedAbility
  }
];

/** Der Hinweis, der gerade dran ist – oder `null`, wenn nichts mehr zu zeigen ist. */
export function activeStep(context: OnboardingContext): OnboardingStep | null {
  if (context.elapsedMs >= ONBOARDING_DURATION_MS) return null;
  return ONBOARDING_STEPS.find((step) => step.isRelevant(context) && !step.isDone(context)) ?? null;
}

/** Zählt die erledigten Schritte – für die Fortschrittsanzeige. */
export function completedSteps(context: OnboardingContext): number {
  return ONBOARDING_STEPS.filter((step) => step.isDone(context)).length;
}

/** Onboarding ist vorbei, wenn die Zeit um ist oder alles verstanden wurde. */
export function isOnboardingComplete(context: OnboardingContext): boolean {
  return context.elapsedMs >= ONBOARDING_DURATION_MS || ONBOARDING_STEPS.every((step) => step.isDone(context));
}
