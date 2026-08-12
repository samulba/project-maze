import { afterEach, describe, expect, it, vi } from 'vitest';
import { MazeGame } from './game.js';
import {
  MIN_SESSION_SECONDS,
  beginSession,
  endSession,
  flushSessions,
  linkSessionToUser,
  sessionsStats,
  stopSessions,
  tuneSessions,
  validDeviceId,
  type SessionRecord,
  type SessionsClient
} from './sessions.js';

/** Ein Client, der nur mitschreibt – kein Netz, keine Datenbank. */
function fakeClient(): SessionsClient & { geschrieben: SessionRecord[]; fehler: boolean } {
  const zustand = {
    geschrieben: [] as SessionRecord[],
    fehler: false,
    async insertSessions(sessions: readonly SessionRecord[]): Promise<void> {
      if (zustand.fehler) throw new Error('Datenbank weg');
      zustand.geschrieben.push(...sessions);
    },
    async daily(): Promise<[]> { return []; },
    async classDaily(): Promise<[]> { return []; },
    async devices(): Promise<[]> { return []; },
    async countDevices(): Promise<number> { return 0; },
    async countSessions(): Promise<number> { return 0; }
  };
  return zustand;
}

const spiele = (): { game: MazeGame; client: ReturnType<typeof fakeClient> } => {
  const client = fakeClient();
  const game = tuneSessions(new MazeGame(0), { client, flushIntervalMs: 300_000, log: () => {} });
  return { game, client };
};

const spieler = (game: MazeGame): Map<string, { id: string; dead: boolean; score: number; level: number; kills: number }> =>
  (game as unknown as { players: Map<string, { id: string; dead: boolean; score: number; level: number; kills: number }> }).players;

afterEach(() => vi.restoreAllMocks());

describe('Geräte-ID', () => {
  it('nimmt an, was der Client erzeugt, und lehnt alles andere ab', () => {
    expect(validDeviceId('a1b2c3d4e5f60718a1b2c3d4e5f60718')).not.toBeNull();
    expect(validDeviceId('kurz')).toBeNull();
    expect(validDeviceId('hat leerzeichen drin!')).toBeNull();
    expect(validDeviceId('x'.repeat(65))).toBeNull();
    expect(validDeviceId(undefined)).toBeNull();
    expect(validDeviceId(42)).toBeNull();
  });
});

describe('Sitzungserfassung', () => {
  it('haengt sich ohne Konfiguration gar nicht erst ein', () => {
    const game = tuneSessions(new MazeGame(0));
    expect(sessionsStats(game).enabled).toBe(false);
  });

  it('schreibt einen Besuch mit Dauer, Runden und Bestwerten', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 1_000);

    const spieler_ = spieler(game).get(id)!;
    spieler_.score = 420;
    spieler_.level = 17;

    endSession(game, id, 1_000 + 90_000);
    await flushSessions(game);

    expect(client.geschrieben).toHaveLength(1);
    const eintrag = client.geschrieben[0]!;
    expect(eintrag.durationSeconds).toBe(90);
    expect(eintrag.deviceId).toBe('a1b2c3d4e5f60718');
    expect(eintrag.playerName).toBe('Sam');
    stopSessions(game);
  });

  it('zaehlt jeden Tod als Runde – auch den ohne Punkte', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);

    const intern = game as unknown as {
      killPlayer(t: unknown, a: string | null, n: number, e: string): void;
    };
    const ziel = spieler(game).get(id)!;
    ziel.score = 0;
    intern.killPlayer(ziel, null, 5_000, 'Arena');
    ziel.dead = false;
    ziel.score = 250;
    intern.killPlayer(ziel, null, 9_000, 'Arena');

    endSession(game, id, 60_000);
    await flushSessions(game);

    const eintrag = client.geschrieben[0]!;
    // Genau das kann das Leaderboard nicht: Die Nullrunde ist dort nicht
    // gespeichert, hier zaehlt sie mit.
    expect(eintrag.runs).toBe(2);
    expect(eintrag.bestScore).toBe(250);
    stopSessions(game);
  });

  /**
   * `player.kills` laeuft ueber die ganze Sitzung weiter -- `respawn()` setzt
   * Score, Streak und Level zurueck, die Abschuesse nicht. Wer bei jedem Tod
   * ADDIERT, zaehlt dieselben Abschuesse erneut, und der Fehler waechst
   * dreieckig mit der Zahl der Leben.
   */
  it('zaehlt Abschuesse einmal, nicht bei jedem Tod erneut', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);

    const intern = game as unknown as {
      killPlayer(t: unknown, a: string | null, n: number, e: string): void;
    };
    const ziel = spieler(game).get(id)!;

    // Drei Leben mit 2, 3 und 2 Abschuessen -- kumulativ also 2, 5, 7.
    for (const stand of [2, 5, 7]) {
      ziel.kills = stand;
      ziel.dead = false;
      intern.killPlayer(ziel, null, 1_000 * stand, 'Arena');
    }

    endSession(game, id, 60_000);
    await flushSessions(game);

    const eintrag = client.geschrieben[0]!;
    expect(eintrag.runs).toBe(3);
    // Addiert waeren es 14 -- die Zahl, die vorher in der Datenbank stand.
    expect(eintrag.kills).toBe(7);
    stopSessions(game);
  });

  it('nimmt die Abschuesse auch von dem mit, der nie stirbt', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);

    const ziel = spieler(game).get(id)!;
    ziel.kills = 9;
    ziel.score = 3_000;

    // Verlassen ohne Tod: Genau der Spieler, der gut war, haette sonst 0.
    game.removePlayer(id);
    endSession(game, id, 60_000);
    await flushSessions(game);

    expect(client.geschrieben[0]!.kills).toBe(9);
    stopSessions(game);
  });

  it('verwirft zu kurze Besuche, statt sie als Spieler zu zaehlen', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    endSession(game, id, (MIN_SESSION_SECONDS - 1) * 1000);
    await flushSessions(game);

    expect(client.geschrieben).toHaveLength(0);
    expect(sessionsStats(game).discarded).toBe(1);
    stopSessions(game);
  });

  it('zaehlt ohne Geraete-ID gar nicht erst mit', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, null, 'Sam', 0);
    endSession(game, id, 120_000);
    await flushSessions(game);
    expect(client.geschrieben).toHaveLength(0);
    stopSessions(game);
  });

  it('traegt das Konto nach, wenn die Token-Pruefung zurueckkommt', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    linkSessionToUser(game, id, '11111111-2222-4333-8444-555555555555');
    endSession(game, id, 60_000);
    await flushSessions(game);
    expect(client.geschrieben[0]!.userId).toBe('11111111-2222-4333-8444-555555555555');
    stopSessions(game);
  });

  it('haelt den Bestwert fest, auch wenn jemand aufhoert ohne zu sterben', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    const ziel = spieler(game).get(id)!;
    ziel.score = 900;
    ziel.level = 31;

    // Verlassen statt sterben – ohne diesen Pfad staende best_level auf 1.
    vi.spyOn(Date, 'now').mockReturnValue(60_000);
    game.removePlayer(id);
    await flushSessions(game);

    expect(client.geschrieben[0]!.bestLevel).toBe(31);
    expect(client.geschrieben[0]!.bestScore).toBe(900);
    stopSessions(game);
  });

  it('behaelt Sitzungen im Puffer, wenn das Schreiben scheitert', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    endSession(game, id, 60_000);

    client.fehler = true;
    await flushSessions(game);
    expect(sessionsStats(game).queued).toBe(1);
    expect(sessionsStats(game).failedFlushes).toBe(1);

    client.fehler = false;
    await flushSessions(game);
    expect(client.geschrieben).toHaveLength(1);
    expect(sessionsStats(game).queued).toBe(0);
    stopSessions(game);
  });

  it('schreibt beim Herunterfahren auch die laufenden Besuche weg', async () => {
    const { game, client } = spiele();
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    // Kein endSession – der Deploy kommt dazwischen.
    await flushSessions(game, 120_000);
    expect(client.geschrieben).toHaveLength(1);
    expect(client.geschrieben[0]!.durationSeconds).toBe(120);
    stopSessions(game);
  });

  /**
   * `flush` gibt einen bereits LAUFENDEN Durchlauf unveraendert zurueck. Faengt
   * der periodische Flush kurz vor dem SIGTERM an, hat er seinen Batch schon
   * aus der Queue genommen -- die Sitzungen, die `flushSessions` danach
   * hineinlegt, waren in keinem Insert. Der Shutdown wartete auf den falschen
   * Insert, meldete Erfolg und ging.
   */
  it('verliert keinen Besuch, wenn beim Herunterfahren schon ein Flush laeuft', async () => {
    const client = fakeClient();
    let freigeben: (() => void) | null = null;
    const haengt = new Promise<void>((resolve) => { freigeben = resolve; });
    const echtesInsert = client.insertSessions.bind(client);
    let erster = true;
    client.insertSessions = async (sessions) => {
      if (erster) {
        erster = false;
        await haengt;
      }
      await echtesInsert(sessions);
    };
    const game = tuneSessions(new MazeGame(0), { client, flushIntervalMs: 300_000, log: () => {} });

    // Ein abgeschlossener Besuch liegt im Puffer, sein Insert haengt.
    const alt = game.addPlayer('Frueher');
    beginSession(game, alt, 'a1b2c3d4e5f60718', 'Frueher', 0);
    endSession(game, alt, 60_000);
    const laufend = flushSessions(game, 60_000);

    // Jetzt kommt der Deploy -- mit drei Leuten in der Arena.
    for (const name of ['A', 'B', 'C']) {
      const id = game.addPlayer(name);
      beginSession(game, id, 'a1b2c3d4e5f60718', name, 0);
    }
    const shutdown = flushSessions(game, 120_000);
    freigeben!();
    await Promise.all([laufend, shutdown]);

    expect(client.geschrieben.map((eintrag) => eintrag.playerName).sort()).toEqual(['A', 'B', 'C', 'Frueher']);
    stopSessions(game);
  });

  it('stoert das Spiel nicht, wenn die Datenbank dauerhaft weg ist', async () => {
    const { game, client } = spiele();
    client.fehler = true;
    const id = game.addPlayer('Sam');
    beginSession(game, id, 'a1b2c3d4e5f60718', 'Sam', 0);
    endSession(game, id, 60_000);
    await expect(flushSessions(game)).resolves.toBeUndefined();
    expect(() => game.step(1 / 40)).not.toThrow();
    stopSessions(game);
  });
});
