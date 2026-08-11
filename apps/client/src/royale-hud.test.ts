import { describe, expect, it } from 'vitest';
import type { RoyaleZoneSnapshot } from '@project-maze/shared/gameplay';
import { royaleDeathText, royaleHudView } from './royale-hud';

/**
 * Die Rundenanzeige ist der Unterschied zwischen „Karte mit toedlichem Rand"
 * und einem Modus, den man versteht, waehrend man ihn spielt. Deshalb stehen
 * ihre Regeln hier fest -- besonders die beiden, die still falsch sein koennen:
 * kein Countdown ohne kommende Verengung, und tot heisst im Royale nicht
 * „gleich wieder da".
 */

const zone = (partial: Partial<RoyaleZoneSnapshot> = {}): RoyaleZoneSnapshot => ({
  center: { x: 0, y: 0 },
  radius: 3000,
  targetRadius: 3000,
  phase: 'haelt',
  nextShrinkInMs: 20_000,
  damagePerSecond: 4,
  stage: 1,
  alive: 12,
  roundOver: false,
  winnerName: null,
  nextRoundInMs: 0,
  ...partial
});

describe('Royale-Rundenanzeige', () => {
  it('bleibt in jedem anderen Modus vollstaendig aus', () => {
    expect(royaleHudView(null)).toBeNull();
    expect(royaleDeathText(null)).toBeNull();
  });

  it('nennt die Zahl der Lebenden und die naechste Verengung', () => {
    const view = royaleHudView(zone({ alive: 12, nextShrinkInMs: 20_000 }))!;
    expect(view.alive).toBe(12);
    expect(view.status).toBe('ENGER IN 20 S');
  });

  it('rundet Sekunden auf, damit die Anzeige nie zu frueh null sagt', () => {
    expect(royaleHudView(zone({ nextShrinkInMs: 800 }))!.status).toBe('ENGER IN 1 S');
  });

  it('sagt vor der ersten Stufe "startet" statt "enger"', () => {
    // Waehrend der Schonfrist gibt es noch keine Grenze, die wehtut -- "enger"
    // waere dort die falsche Auskunft.
    expect(royaleHudView(zone({ stage: 0, nextShrinkInMs: 30_000 }))!.status).toBe('ZONE STARTET IN 30 S');
  });

  it('meldet die laufende Verengung, ohne einen zweiten Countdown zu erfinden', () => {
    const view = royaleHudView(zone({ phase: 'schrumpft', nextShrinkInMs: 0 }))!;
    expect(view.status).toBe('ZONE SCHRUMPFT');
    expect(view.tone).toBe('warnung');
  });

  it('kuendigt am Mindestradius nichts mehr an', () => {
    // Der Server meldet dort 0 -- daraus darf kein "ENGER IN 0 S" werden, das
    // in Schleife laeuft und nie eintritt.
    expect(royaleHudView(zone({ phase: 'haelt', nextShrinkInMs: 0 }))!.status).toBe('ENDPHASE · KLEINSTE ZONE');
  });

  it('wird erst dringend, wenn die Verengung nah ist', () => {
    expect(royaleHudView(zone({ nextShrinkInMs: 30_000 }))!.tone).toBe('ruhig');
    expect(royaleHudView(zone({ nextShrinkInMs: 8_000 }))!.tone).toBe('warnung');
    // In der Schonfrist nicht: Dort kostet Draussenstehen noch nichts.
    expect(royaleHudView(zone({ stage: 0, nextShrinkInMs: 8_000 }))!.tone).toBe('ruhig');
  });

  it('nennt den Sieger und den Start der naechsten Runde', () => {
    const view = royaleHudView(zone({ roundOver: true, winnerName: 'Nova', nextRoundInMs: 8_400, alive: 1 }))!;
    expect(view.status).toBe('SIEGER: NOVA · NEUE RUNDE IN 9 S');
    expect(view.tone).toBe('sieg');
  });

  it('kommt auch ohne Sieger klar', () => {
    // Die Zone kann den Letzten holen. Selten, aber der Bildschirm darf dann
    // nicht "SIEGER: null" anzeigen.
    const view = royaleHudView(zone({ roundOver: true, winnerName: null, nextRoundInMs: 3_000, alive: 0 }))!;
    expect(view.status).toBe('RUNDE VORBEI · NEUE RUNDE IN 3 S');
  });
});

describe('Royale-Text auf dem Death-Screen', () => {
  /**
   * Der Anlass: Der Server schiebt `canRespawnAt` im Royale auf Unendlich, und
   * der Death-Screen rechnete daraus "Respawn verfuegbar in Infinitys".
   */
  it('erklaert das Ausscheiden, statt einen Countdown zu behaupten', () => {
    const text = royaleDeathText(zone({ alive: 7 }))!;
    expect(text).toContain('Ausgeschieden');
    expect(text).toContain('Noch 7 im Spiel');
    expect(text).toContain('Runde');
    expect(text).not.toContain('Infinity');
  });

  it('zaehlt richtig, wenn nur noch einer lebt', () => {
    expect(royaleDeathText(zone({ alive: 1 }))!).toContain('Noch einer im Spiel');
  });

  it('nennt dem Ausgeschiedenen den Sieger und die Wartezeit', () => {
    const text = royaleDeathText(zone({ roundOver: true, winnerName: 'Nova', nextRoundInMs: 5_200 }))!;
    expect(text).toBe('Nova gewinnt die Runde · neue Runde in 6 s');
  });

  it('kommt auch hier ohne Sieger aus', () => {
    const text = royaleDeathText(zone({ roundOver: true, winnerName: null, nextRoundInMs: 1_000 }))!;
    expect(text).toBe('Die Zone hat den Rest geholt · neue Runde in 1 s');
  });
});
