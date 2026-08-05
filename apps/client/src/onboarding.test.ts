import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_DURATION_MS,
  ONBOARDING_EVENT_SEEN_MS,
  ONBOARDING_EVENT_WINDOW_MS,
  ONBOARDING_STEPS,
  activeStep,
  completedSteps,
  isOnboardingComplete,
  type OnboardingContext
} from './onboarding';

const fresh = (overrides: Partial<OnboardingContext> = {}): OnboardingContext => ({
  elapsedMs: 0,
  touch: false,
  moved: false,
  farmed: false,
  availablePoints: 0,
  spentPoint: false,
  usedAbility: false,
  classChoicesOpen: false,
  specialized: false,
  eventRunning: false,
  eventHintShownMs: 0,
  ...overrides
});

/** Ein Spieler, der alles verstanden hat. */
const veteran = (overrides: Partial<OnboardingContext> = {}): OnboardingContext =>
  fresh({
    moved: true,
    farmed: true,
    spentPoint: true,
    usedAbility: true,
    specialized: true,
    eventHintShownMs: ONBOARDING_EVENT_SEEN_MS,
    elapsedMs: 20_000,
    ...overrides
  });

describe('activeStep', () => {
  it('starts by teaching movement', () => {
    expect(activeStep(fresh())?.id).toBe('move');
  });

  it('moves on to farming once the player has moved', () => {
    expect(activeStep(fresh({ moved: true }))?.id).toBe('farm');
  });

  it('does not get stuck when the player never moves', () => {
    expect(activeStep(fresh({ elapsedMs: 15_000 }))?.id).toBe('farm');
  });

  it('interrupts with the upgrade hint as soon as a point is available', () => {
    expect(activeStep(fresh({ moved: true, availablePoints: 1 }))?.id).toBe('upgrade');
  });

  it('gives the class choice priority over the upgrade hint', () => {
    const context = fresh({ moved: true, availablePoints: 1, classChoicesOpen: true });
    expect(activeStep(context)?.id).toBe('specialize');
  });

  it('holds the ability hint back until the basics are settled', () => {
    const settled = fresh({ moved: true, farmed: true });
    expect(activeStep({ ...settled, elapsedMs: 5_000 })).toBeNull();
    expect(activeStep({ ...settled, elapsedMs: 19_000 })?.id).toBe('ability');
  });

  it('stops showing hints after the onboarding window', () => {
    expect(activeStep(fresh({ elapsedMs: ONBOARDING_DURATION_MS }))).toBeNull();
  });

  it('shows nothing to a player who already knows everything', () => {
    expect(activeStep(veteran())).toBeNull();
  });

  it('never repeats the upgrade hint once a point was spent', () => {
    const context = fresh({ moved: true, farmed: true, availablePoints: 3, spentPoint: true });
    expect(activeStep(context)?.id).not.toBe('upgrade');
  });

  it('never repeats the class hint once a specialization was picked', () => {
    const context = fresh({ moved: true, farmed: true, classChoicesOpen: true, specialized: true });
    expect(activeStep(context)?.id).not.toBe('specialize');
  });
});

describe('arena event step', () => {
  const settled = { moved: true, farmed: true, spentPoint: true, usedAbility: true, specialized: true };

  it('appears as soon as the first event runs', () => {
    expect(activeStep(fresh({ ...settled, eventRunning: true }))?.id).toBe('event');
  });

  it('stays away while no event is running', () => {
    expect(activeStep(fresh({ ...settled }))).toBeNull();
  });

  it('still appears long after the basics window – events are rare', () => {
    const late = fresh({ ...settled, eventRunning: true, elapsedMs: ONBOARDING_DURATION_MS * 4 });
    expect(activeStep(late)?.id).toBe('event');
  });

  it('does not resurrect the basics after the window', () => {
    const late = fresh({ eventRunning: true, elapsedMs: ONBOARDING_DURATION_MS * 4 });
    // "move" wäre sonst der erste offene Schritt.
    expect(activeStep(late)?.id).toBe('event');
  });

  it('is not marked read just because an event happened to run', () => {
    // Ein Event während der Grundlagen erklärt dem Spieler nichts – der Hinweis
    // stand ja nie. Gezählt wird die Standzeit des Hinweises, nicht des Events.
    const busy = fresh({ eventRunning: true, elapsedMs: 30_000 });
    expect(activeStep(busy)?.id).not.toBe('event');
    expect(ONBOARDING_STEPS.find((entry) => entry.id === 'event')!.isDone(busy)).toBe(false);
  });

  it('is done once an event was on screen long enough', () => {
    const seen = fresh({ ...settled, eventRunning: true, eventHintShownMs: ONBOARDING_EVENT_SEEN_MS });
    expect(activeStep(seen)).toBeNull();
  });

  it('does not come back for later events', () => {
    const later = fresh({ ...settled, eventRunning: true, eventHintShownMs: ONBOARDING_EVENT_SEEN_MS * 10 });
    expect(activeStep(later)).toBeNull();
  });

  it('gives up entirely at the end of the event window', () => {
    const tooLate = fresh({ ...settled, eventRunning: true, elapsedMs: ONBOARDING_EVENT_WINDOW_MS });
    expect(activeStep(tooLate)).toBeNull();
  });

  it('points at the event banner', () => {
    const step = ONBOARDING_STEPS.find((entry) => entry.id === 'event')!;
    expect(step.focus(true)).toBe('.arena-event-banner');
    expect(step.focus(false)).toBe('.arena-event-banner');
    expect(step.outlivesWindow).toBe(true);
  });

  it('is not blocked by a basics hint that is still open after the window', () => {
    // Ungenutzte Upgrade-Punkte laufen nie ab – sie dürfen den Event-Hinweis
    // trotzdem nicht verdecken, sobald das Grundlagen-Fenster vorbei ist.
    const late = fresh({ ...settled, spentPoint: false, availablePoints: 3, eventRunning: true, elapsedMs: ONBOARDING_DURATION_MS * 2 });
    expect(activeStep(late)?.id).toBe('event');
  });

  it('yields to a pending class choice', () => {
    const both = fresh({ ...settled, specialized: false, eventRunning: true, classChoicesOpen: true });
    expect(activeStep(both)?.id).toBe('specialize');
  });
});

describe('hint wording', () => {
  it('has a distinct text per input method for every step', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.hint(true).length).toBeGreaterThan(10);
      expect(step.hint(false).length).toBeGreaterThan(10);
    }
  });

  it('mentions keys on desktop and thumbs on touch where the input differs', () => {
    const move = ONBOARDING_STEPS.find((step) => step.id === 'move')!;
    expect(move.hint(false)).toMatch(/WASD/);
    expect(move.hint(true)).toMatch(/Stick|Daumen/);
  });

  it('points at the sticks only on touch devices', () => {
    const move = ONBOARDING_STEPS.find((step) => step.id === 'move')!;
    expect(move.focus(true)).toBe('#move-stick');
    expect(move.focus(false)).toBeNull();
  });

  it('uses unique step ids', () => {
    const ids = ONBOARDING_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('completion', () => {
  it('counts progress as steps are understood', () => {
    expect(completedSteps(fresh())).toBe(0);
    expect(completedSteps(fresh({ moved: true }))).toBeGreaterThan(0);
    expect(completedSteps(veteran())).toBe(ONBOARDING_STEPS.length);
  });

  it('ends once everything is understood', () => {
    expect(isOnboardingComplete(fresh())).toBe(false);
    expect(isOnboardingComplete(veteran())).toBe(true);
  });

  it('ends when the basics window runs out and no event hint is pending', () => {
    const seenEvent = fresh({ elapsedMs: ONBOARDING_DURATION_MS, eventHintShownMs: ONBOARDING_EVENT_SEEN_MS });
    expect(isOnboardingComplete(seenEvent)).toBe(true);
  });

  it('stays open past the basics window while the event hint is still owed', () => {
    // Das erste Arena-Event kommt fast nie in der ersten Minute.
    expect(isOnboardingComplete(fresh({ elapsedMs: ONBOARDING_DURATION_MS }))).toBe(false);
    expect(isOnboardingComplete(fresh({ elapsedMs: ONBOARDING_DURATION_MS * 3 }))).toBe(false);
  });

  it('gives up on the event hint at the end of the event window', () => {
    expect(isOnboardingComplete(fresh({ elapsedMs: ONBOARDING_EVENT_WINDOW_MS }))).toBe(true);
  });

  it('reports progress that never exceeds the step count', () => {
    for (const elapsed of [0, 15_000, 35_000, 59_000]) {
      expect(completedSteps(fresh({ elapsedMs: elapsed }))).toBeLessThanOrEqual(ONBOARDING_STEPS.length);
    }
  });
});
