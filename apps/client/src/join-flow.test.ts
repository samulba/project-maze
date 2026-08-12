import { describe, expect, it } from 'vitest';
import {
  JOIN_BACKOFF_MAX_MS,
  JOIN_BACKOFF_START_MS,
  joinRejectionAction,
  joinRejectionLabel,
  nextJoinBackoff
} from './join-flow';

describe('Abgelehnter Beitritt', () => {
  it('schickt einen Neuling mit der Begruendung zurueck auf den Startscreen', () => {
    expect(joinRejectionAction({ enteredGame: false, joined: false })).toBe('startscreen');
  });

  /**
   * Der Kern des Befunds: Wer schon gespielt hat, hat keinen Startscreen mehr,
   * auf den er zurueckfallen koennte. Ohne Wiederholung endet die Sitzung hier
   * -- Arena steht, Toast weg, nichts passiert je wieder.
   */
  it('versucht es fuer einen Rueckkehrer erneut, statt stehen zu bleiben', () => {
    expect(joinRejectionAction({ enteredGame: true, joined: false })).toBe('wiederholen');
  });

  it('laesst ein laufendes Spiel in Ruhe', () => {
    expect(joinRejectionAction({ enteredGame: true, joined: true })).toBe('ignorieren');
  });

  it('nennt den Grund, statt eine Verbindung fuer verloren zu erklaeren', () => {
    expect(joinRejectionLabel('Die Arena ist voll.')).toBe('ARENA VOLL · NEUER VERSUCH');
    expect(joinRejectionLabel('Zu viele Beitritte. Bitte kurz warten.')).toBe('ZU VIELE VERSUCHE · WARTET');
    expect(joinRejectionLabel('Beitritt nicht möglich.')).toBe('BEITRITT ABGELEHNT · NEUER VERSUCH');
    // Nirgends darf die Leitung beschuldigt werden -- sie steht ja.
    for (const text of ['Die Arena ist voll.', 'Zu viele Beitritte.', 'Irgendwas.']) {
      expect(joinRejectionLabel(text)).not.toContain('VERLOREN');
    }
  });

  it('waechst bis zum Deckel und laeuft nicht in einen Sekundentakt', () => {
    let wert = JOIN_BACKOFF_START_MS;
    const folge = [wert];
    for (let i = 0; i < 8; i += 1) {
      wert = nextJoinBackoff(wert);
      folge.push(wert);
    }
    expect(folge[1]).toBeGreaterThan(folge[0]!);
    expect(Math.max(...folge)).toBe(JOIN_BACKOFF_MAX_MS);
    // Nach einer Minute Ablehnungen duerfen es hoechstens so viele Versuche
    // sein, wie das serverseitige Join-Limit je IP erlaubt (20/min).
    let zeit = 0;
    let versuche = 0;
    let takt = JOIN_BACKOFF_START_MS;
    while (zeit < 60_000) {
      zeit += takt;
      versuche += 1;
      takt = nextJoinBackoff(takt);
    }
    expect(versuche).toBeLessThanOrEqual(20);
  });
});
