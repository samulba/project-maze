import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot, WorldSnapshot } from '@project-maze/shared';
import { spectatedName, spectatedPlayer } from './spectator';

/**
 * `spectatedName` entscheidet zwei Dinge: ob das Zuschauer-Band erscheint und
 * – seit Sams Befund – ob der Death-Screen sich in die Ecke zusammenzieht.
 * Beides hängt an derselben Antwort, deshalb steht sie hier fest.
 */

const spieler = (id: string, name: string, position = { x: 0, y: 0 }): PlayerSnapshot =>
  ({ id, name, position } as unknown as PlayerSnapshot);

const snapshot = (
  selfId: string | null,
  players: PlayerSnapshot[],
  spectatorTargetId?: string
): WorldSnapshot => ({ selfId, players, ...(spectatorTargetId ? { spectatorTargetId } : {}) } as unknown as WorldSnapshot);

describe('Zuschauer-Ziel', () => {
  it('meldet den Namen des beobachteten Spielers in Großbuchstaben', () => {
    expect(spectatedName(snapshot('1', [spieler('1', 'Ich'), spieler('7', 'Nova')], '7'))).toBe('NOVA');
  });

  it('meldet nichts, wenn gar nicht zugeschaut wird', () => {
    expect(spectatedName(snapshot('1', [spieler('1', 'Ich')]))).toBeNull();
  });

  it('meldet nichts, wenn das Ziel der eigene Tank ist', () => {
    // Der Server setzt das Feld auch auf den eigenen Tank zurück – daraus darf
    // kein „DU SIEHST DIR SELBST ZU" werden.
    expect(spectatedName(snapshot('1', [spieler('1', 'Ich')], '1'))).toBeNull();
  });

  it('meldet nichts, wenn das Ziel nicht mehr im Snapshot steht', () => {
    // Direkt nach dem Verlassen fehlt der Spieler. Lieber kein Band als eines
    // ohne Namen – und der Death-Screen bleibt dann in voller Größe.
    expect(spectatedName(snapshot('1', [spieler('1', 'Ich')], '9'))).toBeNull();
  });

  it('meldet nichts bei leerem Namen', () => {
    expect(spectatedName(snapshot('1', [spieler('1', 'Ich'), spieler('7', '   ')], '7'))).toBeNull();
  });

  /**
   * Der Radar rechnete gegen die eigene Leiche statt gegen die Kamera. Weil
   * der Server den Snapshot eines Toten aus der Perspektive des Killers baut,
   * lag dort nichts mehr -- ein leeres Rechteck an einer Stelle, an der
   * niemand ist. `spectatedPlayer` ist derselbe Punkt, den auch der Renderer
   * als Kamera nimmt.
   */
  it('nennt den beobachteten Spieler als Kamerapunkt, nicht die eigene Leiche', () => {
    const ich = spieler('1', 'Ich', { x: 2000, y: 2000 });
    const killer = spieler('7', 'Nova', { x: 6100, y: 3400 });
    const welt = snapshot('1', [ich, killer], '7');
    expect(spectatedPlayer(welt)?.position).toEqual({ x: 6100, y: 3400 });
    // Ohne Zuschauen bleibt es beim eigenen Tank -- der Aufrufer faellt auf
    // `self` zurueck, und genau dieses `null` ist das Signal dafuer.
    expect(spectatedPlayer(snapshot('1', [ich]))).toBeNull();
    expect(spectatedPlayer(snapshot('1', [ich], '1'))).toBeNull();
    expect(spectatedPlayer(snapshot('1', [ich], '9'))).toBeNull();
  });
});
