import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '@project-maze/shared';
import type { RoyaleZoneSnapshot } from '@project-maze/shared/gameplay';
import { royaleBannerCopy, royaleDeathHint } from './royale-banner';

/**
 * Die Royale-Zeile ist die einzige Anzeige, die im Battle Royale jede Sekunde
 * zählt. Sie sagt drei Dinge, die man sonst nirgends ablesen kann: wie viele
 * noch leben, ob man selbst gerade Schaden nimmt, und wann es weitergeht.
 */

const zone = (over: Partial<RoyaleZoneSnapshot> = {}): RoyaleZoneSnapshot => ({
  center: { x: 1000, y: 1000 },
  radius: 500,
  targetRadius: 500,
  phase: 'haelt',
  damagePerSecond: 7.5,
  stage: 2,
  alive: 12,
  roundOver: false,
  winnerName: null,
  nextRoundInMs: 0,
  ...over
});

const spieler = (x: number, y: number, dead = false): PlayerSnapshot =>
  ({ position: { x, y }, dead } as unknown as PlayerSnapshot);

describe('Royale-Banner', () => {
  it('zeigt in anderen Modi gar nichts', () => {
    expect(royaleBannerCopy(null, spieler(0, 0))).toBeNull();
  });

  it('nennt die Zahl der Lebenden und die Phase der Zone', () => {
    const copy = royaleBannerCopy(zone({ phase: 'schrumpft' }), spieler(1000, 1000))!;
    expect(copy.state).toBe('schrumpft');
    expect(copy.title).toBe('NOCH 12');
    expect(copy.line).toBe('Zone schrumpft');
  });

  it('warnt mit dem Schaden pro Sekunde, sobald man draussen steht', () => {
    // 501 Pixel vom Mittelpunkt bei Radius 500: einen Pixel zu weit.
    const copy = royaleBannerCopy(zone(), spieler(1501, 1000))!;
    expect(copy.state).toBe('outside');
    expect(copy.line).toContain('-8 HP/s');
    expect(copy.line).toContain('noch 12 im Rennen');
  });

  it('zaehlt genau auf dem Rand noch als drinnen', () => {
    // Der Server nimmt Schaden erst jenseits des Radius. Stuende hier ">=",
    // warnte das HUD vor einem Schaden, den es nicht gibt.
    expect(royaleBannerCopy(zone(), spieler(1500, 1000))!.state).toBe('haelt');
  });

  it('warnt in der Schonfrist nicht, auch wenn man geometrisch draussen steht', () => {
    // Der Server teilt bei Stufe 0 keinen Zonenschaden aus. Eine Warnung waere
    // hier eine Zahl, die nie eintritt.
    const copy = royaleBannerCopy(zone({ stage: 0, phase: 'wartet' }), spieler(9000, 9000))!;
    expect(copy.state).toBe('wartet');
    expect(copy.line).toBe('Zone startet gleich');
  });

  it('warnt Tote nicht vor der Zone', () => {
    // Wer raus ist, nimmt keinen Zonenschaden mehr - eine Warnung waere Laerm.
    const copy = royaleBannerCopy(zone(), spieler(9000, 9000, true))!;
    expect(copy.state).toBe('haelt');
    expect(copy.title).toBe('NOCH 12');
  });

  it('nennt den Sieger und den Countdown, sobald die Runde entschieden ist', () => {
    const copy = royaleBannerCopy(zone({ roundOver: true, winnerName: 'Nova', nextRoundInMs: 8200 }), spieler(9000, 9000))!;
    expect(copy.state).toBe('over');
    expect(copy.title).toBe('Nova GEWINNT');
    expect(copy.line).toBe('Neue Runde in 9s');
  });

  it('kommt ohne Sieger aus, wenn die Zone den Letzten geholt hat', () => {
    const copy = royaleBannerCopy(zone({ roundOver: true, winnerName: null, nextRoundInMs: 3000 }), spieler(0, 0, true))!;
    expect(copy.title).toBe('RUNDE VORBEI');
  });

  it('meldet keinen negativen Countdown, wenn der Server spaet dran ist', () => {
    const copy = royaleBannerCopy(zone({ roundOver: true, winnerName: 'Nova', nextRoundInMs: -400 }), spieler(0, 0))!;
    expect(copy.line).toBe('Neue Runde in 0s');
  });

  it('schlaegt das Rundenende der Zonenwarnung vor', () => {
    // In der Rundenpause ruht der Zonenschaden. Eine Warnung waere dann falsch,
    // auch wenn man geometrisch weit draussen steht.
    const copy = royaleBannerCopy(zone({ roundOver: true, nextRoundInMs: 5000 }), spieler(9000, 9000))!;
    expect(copy.state).toBe('over');
  });
});

describe('Royale-Hinweis im Death-Screen', () => {
  it('sagt waehrend der Runde, dass es kein Zurueck gibt', () => {
    expect(royaleDeathHint(zone({ alive: 4 }))).toBe('Ausgeschieden · noch 4 im Rennen');
  });

  it('nennt nach dem Rundenende Sieger und Countdown', () => {
    expect(royaleDeathHint(zone({ roundOver: true, winnerName: 'Nova', nextRoundInMs: 8200 })))
      .toBe('Nova gewinnt · nächste Runde in 9s');
  });

  it('kommt auch hier ohne Sieger aus', () => {
    expect(royaleDeathHint(zone({ roundOver: true, winnerName: null, nextRoundInMs: 1200 })))
      .toBe('Runde vorbei · nächste Runde in 2s');
  });
});
