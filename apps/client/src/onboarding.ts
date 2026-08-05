/**
 * Onboarding für die ersten 60 Sekunden. Die Hinweise reagieren auf den
 * Spielzustand statt auf einen starren Timer: Wer schon farmt, bekommt keinen
 * Farm-Hinweis mehr. Reine Logik – die Darstellung liegt in `onboarding-view.ts`.
 */

export const ONBOARDING_DURATION_MS = 60_000;
/**
 * Arena-Events kommen selten und selten in der ersten Minute. Der Event-Hinweis
 * hängt deshalb am ersten Event statt am 60-Sekunden-Fenster – aber nicht ewig.
 */
export const ONBOARDING_EVENT_WINDOW_MS = 600_000;
/** So lange muss der Event-Hinweis gestanden haben, damit er als gelesen gilt. */
export const ONBOARDING_EVENT_SEEN_MS = 6_000;
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
  /** Gerade läuft ein Arena-Event (Vorwarnung oder aktiv). */
  eventRunning: boolean;
  /**
   * Wie lange der Event-Hinweis schon auf dem Schirm stand. Bewusst nicht
   * „wie lange lief ein Event“: Ein Event, das lief, während der Spieler noch
   * Grundlagen lernte, hat ihm nichts erklärt.
   */
  eventHintShownMs: number;
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
  /**
   * Schritt darf auch nach dem 60-Sekunden-Fenster noch erscheinen. Nötig für
   * Ereignisse, auf deren Zeitpunkt der Spieler keinen Einfluss hat.
   */
  outlivesWindow?: boolean;
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
    id: 'event',
    title: 'Arena-Event läuft',
    hint: () =>
      'Events ändern für kurze Zeit die Regeln der ganzen Arena. Der Banner oben nennt, was gerade gilt – Farbe und Rahmen zeigen es dir auch im Spielfeld.',
    focus: () => '.arena-event-banner',
    isRelevant: (context) => context.eventRunning,
    isDone: (context) => context.eventHintShownMs >= ONBOARDING_EVENT_SEEN_MS,
    // Das erste Event kommt fast nie in der ersten Minute.
    outlivesWindow: true
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

const OUTLIVING_STEPS = ONBOARDING_STEPS.filter((step) => step.outlivesWindow);

/** Der Hinweis, der gerade dran ist – oder `null`, wenn nichts mehr zu zeigen ist. */
export function activeStep(context: OnboardingContext): OnboardingStep | null {
  if (context.elapsedMs >= ONBOARDING_EVENT_WINDOW_MS) return null;
  // Nach dem Grundlagen-Fenster kommen nur noch ereignisgebundene Hinweise in
  // Frage – ein weiterhin offener Grundlagen-Schritt darf sie nicht verdecken.
  const candidates = context.elapsedMs < ONBOARDING_DURATION_MS ? ONBOARDING_STEPS : OUTLIVING_STEPS;
  return candidates.find((entry) => entry.isRelevant(context) && !entry.isDone(context)) ?? null;
}

/** Zählt die erledigten Schritte – für die Fortschrittsanzeige. */
export function completedSteps(context: OnboardingContext): number {
  return ONBOARDING_STEPS.filter((step) => step.isDone(context)).length;
}

/**
 * Onboarding ist vorbei, wenn alles verstanden wurde, wenn nach dem
 * Grundlagen-Fenster kein ereignisgebundener Hinweis mehr aussteht – oder
 * spätestens am Ende des Event-Fensters.
 */
export function isOnboardingComplete(context: OnboardingContext): boolean {
  if (ONBOARDING_STEPS.every((step) => step.isDone(context))) return true;
  if (context.elapsedMs >= ONBOARDING_EVENT_WINDOW_MS) return true;
  return context.elapsedMs >= ONBOARDING_DURATION_MS && OUTLIVING_STEPS.every((step) => step.isDone(context));
}
