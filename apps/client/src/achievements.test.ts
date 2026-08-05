import { ACHIEVEMENT_IDS, type AchievementId } from '@project-maze/shared/gameplay';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_GAP_MS,
  ACHIEVEMENT_POPUP_MS,
  ACHIEVEMENT_QUEUE_MAX,
  AchievementQueue,
  achievementInfo
} from './achievements';

/** Zeit ist hier ein Parameter, kein Zufall – die Abläufe sind exakt prüfbar. */
describe('AchievementQueue', () => {
  it('shows a fresh unlock right away', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel']);
    expect(queue.tick(0)).toBe('maxLevel');
  });

  it('keeps it on screen for the popup duration and then drops it', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel']);
    queue.tick(0);
    expect(queue.tick(ACHIEVEMENT_POPUP_MS - 1)).toBe('maxLevel');
    expect(queue.tick(ACHIEVEMENT_POPUP_MS)).toBeNull();
  });

  it('shows several unlocks one after another instead of stacking them', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel', 'score10k', 'guardianSlayer']);
    expect(queue.tick(0)).toBe('maxLevel');
    expect(queue.pendingCount).toBe(2);

    // Erst nach Standzeit plus Pause kommt das nächste.
    expect(queue.tick(ACHIEVEMENT_POPUP_MS)).toBeNull();
    expect(queue.tick(ACHIEVEMENT_POPUP_MS + ACHIEVEMENT_GAP_MS)).toBe('score10k');
    expect(queue.tick(2 * ACHIEVEMENT_POPUP_MS + ACHIEVEMENT_GAP_MS)).toBeNull();
    expect(queue.tick(2 * (ACHIEVEMENT_POPUP_MS + ACHIEVEMENT_GAP_MS))).toBe('guardianSlayer');
  });

  it('runs dry once everything was shown', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel']);
    queue.tick(0);
    queue.tick(ACHIEVEMENT_POPUP_MS);
    expect(queue.tick(60_000)).toBeNull();
    expect(queue.pendingCount).toBe(0);
  });

  it('never shows the same unlock twice – a reconnect must not repeat it', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel']);
    queue.tick(0);
    queue.tick(ACHIEVEMENT_POPUP_MS);
    queue.push(['maxLevel']);
    expect(queue.pendingCount).toBe(0);
    expect(queue.tick(20_000)).toBeNull();
  });

  it('ignores duplicates inside one batch and while one is showing', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel', 'maxLevel']);
    expect(queue.pendingCount).toBe(1);
    queue.tick(0);
    queue.push(['maxLevel']);
    expect(queue.pendingCount).toBe(0);
  });

  it('ignores ids the catalog does not know', () => {
    const queue = new AchievementQueue();
    queue.push(['nicht-im-katalog' as AchievementId]);
    expect(queue.pendingCount).toBe(0);
    expect(queue.tick(0)).toBeNull();
  });

  it('survives a missing field', () => {
    const queue = new AchievementQueue();
    queue.push(undefined);
    expect(queue.tick(0)).toBeNull();
  });

  it('caps the queue so a faulty server cannot wall up the screen', () => {
    const queue = new AchievementQueue();
    const many = Array.from({ length: 50 }, (_, index) => ACHIEVEMENT_IDS[index % ACHIEVEMENT_IDS.length]!);
    queue.push(many);
    expect(queue.pendingCount).toBeLessThanOrEqual(ACHIEVEMENT_QUEUE_MAX);
  });

  it('drops what is waiting but keeps what was already shown', () => {
    const queue = new AchievementQueue();
    queue.push(['maxLevel', 'score10k']);
    queue.tick(0);
    queue.clearPending();
    expect(queue.pendingCount).toBe(0);

    // Bereits Gezeigtes bleibt gesperrt, Wartendes darf erneut kommen.
    queue.push(['maxLevel', 'score10k']);
    expect(queue.pendingCount).toBe(1);
  });

  it('reports what is currently on screen', () => {
    const queue = new AchievementQueue();
    expect(queue.showing).toBeNull();
    queue.push(['score10k']);
    queue.tick(0);
    expect(queue.showing).toBe('score10k');
  });
});

describe('achievementInfo', () => {
  it('has a name and a description for every catalogued achievement', () => {
    for (const id of ACHIEVEMENT_IDS) {
      const info = achievementInfo(id);
      expect(info?.name.length).toBeGreaterThan(2);
      expect(info?.description.length).toBeGreaterThan(10);
    }
  });

  it('returns null for an unknown id instead of throwing', () => {
    expect(achievementInfo('gibtsnicht' as AchievementId)).toBeNull();
  });
});
