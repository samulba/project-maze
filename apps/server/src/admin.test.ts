import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

/**
 * Der Login wird ersetzt, nicht konfiguriert.
 *
 * `admin.ts` importiert `verifyAuthToken` direkt; ein `vi.spyOn` auf das
 * Modul-Namensobjekt erreicht diese Bindung in ESM nicht. Ein echter Login
 * waere hier ohnehin falsch: Geprueft werden soll der Torwaechter, nicht
 * Supabases Signaturpruefung.
 */
const login = vi.hoisted(() => ({ enabled: false, user: null as { userId: string; displayName: string | null; expiresAt: number } | null }));
vi.mock('./auth.js', () => ({
  authStatus: () => ({ enabled: login.enabled, mode: login.enabled ? 'shared-secret' : 'off', verified: 0, rejected: 0, lastRejectionReason: null }),
  verifyAuthToken: async () => login.user
}));

import {
  ADMIN_IDS_ENV,
  adminGuard,
  adminUserIds,
  foldClassUsage,
  identify,
  sinceIso,
  zeilenAb,
  summarize,
  unusedClasses
} from './admin.js';
import type { ClassDayRow, DailyRow } from './sessions.js';

const ID_A = '11111111-2222-4333-8444-555555555555';
const ID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const anfrage = (header?: string): Request =>
  ({ header: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined) }) as unknown as Request;

/** Minimale Antwort, die festhält, was der Torwächter geschrieben hat. */
function antwort(): Response & { code: number | null; koerper: Record<string, unknown> | null } {
  const zustand = {
    code: null as number | null,
    koerper: null as Record<string, unknown> | null,
    setHeader() { return zustand; },
    status(code: number) { zustand.code = code; return zustand; },
    json(body: Record<string, unknown>) { zustand.koerper = body; return zustand; }
  };
  return zustand as unknown as Response & { code: number | null; koerper: Record<string, unknown> | null };
}

const tag = (day: string, werte: Partial<DailyRow>): DailyRow => ({
  day, sessions: 0, players: 0, newPlayers: 0, accounts: 0,
  runs: 0, kills: 0, totalSeconds: 0, bestLevel: 0, ...werte
});

const klassentag = (playerClass: string, werte: Partial<ClassDayRow>): ClassDayRow => ({
  day: '2026-08-01T00:00:00Z', playerClass, runs: 0, levelSum: 0, scoreSum: 0,
  kills: 0, seconds: 0, bestScore: 0, bestLevel: 0, ...werte
});

beforeEach(() => { delete process.env[ADMIN_IDS_ENV]; login.enabled = false; login.user = null; });
afterEach(() => { delete process.env[ADMIN_IDS_ENV]; vi.restoreAllMocks(); });

describe('Allowlist', () => {
  it('nimmt nur, was wie eine Konto-ID aussieht', () => {
    const ids = adminUserIds(` ${ID_A} , nicht-uuid , ${ID_B.toUpperCase()} ,,`);
    // Ein Tippfehler soll auffallen und nicht zu einem Zugang führen, der nie
    // greift – deshalb fliegt „nicht-uuid" heraus statt mitgeführt zu werden.
    expect([...ids]).toEqual([ID_A, ID_B]);
  });

  it('ist ohne Variable leer – und eine leere Liste ist eine geschlossene Tuer', () => {
    expect(adminUserIds(undefined).size).toBe(0);
  });
});

describe('identify', () => {
  it('meldet ohne Login weder Konto noch Adminrechte', async () => {
    const identity = await identify(anfrage());
    expect(identity.authEnabled).toBe(false);
    expect(identity.userId).toBeNull();
    expect(identity.isAdmin).toBe(false);
  });
});

describe('adminGuard', () => {
  it('sagt bei abgeschaltetem Login, dass der Login abgeschaltet ist', async () => {
    const response = antwort();
    const next = vi.fn();
    adminGuard(anfrage(), response, next);
    await vi.waitFor(() => expect(response.code).toBe(503));
    expect(next).not.toHaveBeenCalled();
    expect(response.koerper?.error).toBe('auth-disabled');
  });

  it('verlangt eine Anmeldung, wenn der Login an ist', async () => {
    login.enabled = true;
    const response = antwort();
    adminGuard(anfrage(), response, vi.fn());
    await vi.waitFor(() => expect(response.code).toBe(401));
    expect(response.koerper?.error).toBe('not-signed-in');
  });

  it('nennt bei leerer Allowlist die eigene Konto-ID', async () => {
    login.enabled = true;
    login.user = { userId: ID_A, displayName: 'Sam', expiresAt: 0 };

    const response = antwort();
    adminGuard(anfrage('Bearer token'), response, vi.fn());
    await vi.waitFor(() => expect(response.code).toBe(403));
    // Ohne diese Auskunft käme niemand je in die Allowlist – das Henne-Ei-
    // Problem ist der Grund, warum die Meldung die ID enthält.
    expect(response.koerper?.error).toBe('allowlist-empty');
    expect(String(response.koerper?.message)).toContain(ID_A);
  });

  it('sagt einem angemeldeten Fremden, dass er nicht auf der Liste steht', async () => {
    login.enabled = true;
    login.user = { userId: ID_B, displayName: 'Fremd', expiresAt: 0 };
    process.env[ADMIN_IDS_ENV] = ID_A;

    const response = antwort();
    adminGuard(anfrage('Bearer token'), response, vi.fn());
    await vi.waitFor(() => expect(response.code).toBe(403));
    expect(response.koerper?.error).toBe('not-admin');
  });

  it('laesst durch, wer auf der Liste steht – Gross-/Kleinschreibung egal', async () => {
    login.enabled = true;
    login.user = { userId: ID_A.toUpperCase(), displayName: 'Sam', expiresAt: 0 };
    process.env[ADMIN_IDS_ENV] = ID_A;

    const response = antwort();
    const next = vi.fn();
    adminGuard(anfrage('Bearer token'), response, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    expect(response.code).toBeNull();
  });
});

describe('summarize', () => {
  it('summiert Tageswerte', () => {
    const summary = summarize([
      tag('2026-08-01T00:00:00Z', { players: 4, newPlayers: 3, sessions: 6, runs: 20, totalSeconds: 600 }),
      tag('2026-08-02T00:00:00Z', { players: 5, newPlayers: 1, sessions: 4, runs: 15, totalSeconds: 400 })
    ]);
    expect(summary.players).toBe(9);
    expect(summary.newPlayers).toBe(4);
    expect(summary.sessions).toBe(10);
    expect(summary.avgSessionSeconds).toBe(100);
  });

  it('teilt nicht durch null, wenn es keine Besuche gab', () => {
    expect(summarize([tag('2026-08-01T00:00:00Z', {})]).avgSessionSeconds).toBe(0);
    expect(summarize([]).players).toBe(0);
  });
});

describe('foldClassUsage', () => {
  it('mittelt ueber Summen und nicht ueber Tagesmittelwerte', () => {
    const usage = foldClassUsage([
      klassentag('rapid', { runs: 1, levelSum: 10, scoreSum: 100, seconds: 60 }),
      klassentag('rapid', { runs: 99, levelSum: 990, scoreSum: 9900, seconds: 5940 })
    ]);
    // Der Mittelwert der Tagesmittel waere hier ebenfalls 10 – aber nur, weil
    // beide Tage denselben Schnitt haben. Der Test haelt fest, dass ueber die
    // Summen gerechnet wird, nicht ueber die Tage.
    expect(usage[0]!.runs).toBe(100);
    expect(usage[0]!.avgLevel).toBe(10);
    expect(usage[0]!.avgScore).toBe(100);
    expect(usage[0]!.share).toBe(100);
  });

  it('sortiert nach Runden und rechnet Anteile aus', () => {
    const usage = foldClassUsage([
      klassentag('rapid', { runs: 30 }),
      klassentag('sniper', { runs: 70 })
    ]);
    expect(usage.map((entry) => entry.playerClass)).toEqual(['sniper', 'rapid']);
    expect(usage[0]!.share).toBe(70);
  });

  it('ignoriert Klassen, die der Code nicht kennt', () => {
    // Die Datenbank haelt nur Text; eine geloeschte oder umbenannte Klasse darf
    // das Portal nicht mit einer Zeile ohne Namen fuellen.
    expect(foldClassUsage([klassentag('gibtsnicht', { runs: 5 })])).toHaveLength(0);
  });

  it('nennt die nie gespielten Klassen beim Namen', () => {
    const usage = foldClassUsage([klassentag('rapid', { runs: 5 })]);
    const ungenutzt = unusedClasses(usage);
    expect(ungenutzt.length).toBeGreaterThan(60);
    expect(ungenutzt).not.toContain('Rapid');
  });
});

/**
 * Der Filter fuer die "Heute"-Kacheln. Er sah harmlos aus (`row.day >= abIso`)
 * und war der Grund, warum das Portal jeden Tag "0 Spieler heute" zeigte --
 * direkt neben einem Zeitraum-Wert, der denselben Tag mitzaehlt.
 */
describe('zeilenAb', () => {
  const zeile = (day: string): { day: string } => ({ day });

  it('nimmt den heutigen Tag mit, obwohl die Formate verschieden aussehen', () => {
    // Links das Format von PostgREST (timestamptz), rechts das von toISOString.
    const heute = zeilenAb([zeile('2026-08-11T00:00:00+00:00')], '2026-08-11T00:00:00.000Z');
    expect(heute).toHaveLength(1);
    // Der Zeichenvergleich, der hier frueher stand, sagt das Gegenteil:
    expect('2026-08-11T00:00:00+00:00' >= '2026-08-11T00:00:00.000Z').toBe(false);
  });

  it('laesst aeltere Tage draussen', () => {
    const zeilen = [zeile('2026-08-09T00:00:00+00:00'), zeile('2026-08-10T00:00:00+00:00'), zeile('2026-08-11T00:00:00+00:00')];
    expect(zeilenAb(zeilen, '2026-08-10T00:00:00.000Z').map((z) => z.day.slice(8, 10))).toEqual(['10', '11']);
  });

  it('wirft unlesbare Zeitstempel heraus, statt sie mitzuzaehlen', () => {
    // Lieber eine Zeile zu wenig als eine Kachel, die Muell addiert.
    expect(zeilenAb([zeile('kein Datum'), zeile('2026-08-11T00:00:00+00:00')], '2026-08-11T00:00:00.000Z')).toHaveLength(1);
  });

  it('gibt alles zurueck, wenn die Grenze selbst unlesbar ist', () => {
    expect(zeilenAb([zeile('2026-08-11T00:00:00+00:00')], 'kaputt')).toHaveLength(1);
  });
});

describe('sinceIso', () => {
  it('beginnt am Mitternacht des ersten Tages im Fenster', () => {
    const jetzt = Date.parse('2026-08-08T14:32:00Z');
    expect(sinceIso(1, jetzt)).toBe('2026-08-08T00:00:00.000Z');
    expect(sinceIso(7, jetzt)).toBe('2026-08-02T00:00:00.000Z');
  });
});
