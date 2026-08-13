import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMapInfo, mapUrl } from './world-map';

const origin = { protocol: 'https:', hostname: 'www.mazers.de', host: 'www.mazers.de' };

describe('mapUrl', () => {
  it('uses the same origin in production', () => {
    expect(mapUrl(origin, false)).toBe('https://www.mazers.de/map');
  });

  it('talks to the game server port in dev', () => {
    const local = { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173' };
    expect(mapUrl(local, true)).toBe('http://localhost:2567/map');
  });
});

const karte = { walls: [{ id: 'v1', x: 0, y: 0, width: 160, height: 400 }], plazas: [], worldWidth: 9000, worldHeight: 6000 };

describe('fetchMapInfo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liefert die Karte bei einer erfolgreichen Antwort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(karte), { status: 200 })));
    await expect(fetchMapInfo(origin, false)).resolves.toEqual(karte);
  });

  it('liefert null bei einer Fehlerantwort statt zu werfen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(fetchMapInfo(origin, false)).resolves.toBeNull();
  });

  it('liefert null bei einer unvollständigen Antwort (alter Server ohne den Endpunkt)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await expect(fetchMapInfo(origin, false)).resolves.toBeNull();
  });

  it('liefert null statt zu werfen, wenn fetch selbst fehlschlägt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('kein Netz'); }));
    await expect(fetchMapInfo(origin, false)).resolves.toBeNull();
  });
});
