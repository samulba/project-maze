import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD,
  GATE_COOKIE,
  createSiteGate,
  gateTokenValid,
  loginSeite,
  parseCookies,
  signGateToken,
  siteGateConfig
} from './site-gate.js';

/**
 * Was hier geprueft wird, ist die Frage „kommt jemand ohne Passwort hinein?" –
 * einmal fuer jeden Weg, den es gibt. Die Tests sind bewusst nah an der
 * Angreifersicht geschrieben und nicht an der Implementierung: gefaelschtes
 * Cookie, abgelaufenes Cookie, falsches Passwort, Dauerfeuer, Umleitung auf
 * eine fremde Seite.
 */

const konfig = (env: Record<string, string | undefined> = {}) =>
  siteGateConfig({ SITE_PASSWORD: 'geheim', ...env } as NodeJS.ProcessEnv);

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  cookies: Record<string, unknown>;
  body: unknown;
  redirectedTo: string | null;
  cleared: string[];
}

function fakeAntwort(): FakeResponse & Record<string, any> {
  const state: FakeResponse = {
    statusCode: 200,
    headers: {},
    cookies: {},
    body: null,
    redirectedTo: null,
    cleared: []
  };
  const response: any = state;
  response.status = (code: number) => { state.statusCode = code; return response; };
  response.setHeader = (name: string, value: string) => { state.headers[name.toLowerCase()] = String(value); };
  response.cookie = (name: string, value: string, options: unknown) => {
    state.cookies[name] = { value, options };
    return response;
  };
  response.clearCookie = (name: string) => { state.cleared.push(name); return response; };
  response.redirect = (code: number, ziel: string) => { state.statusCode = code; state.redirectedTo = ziel; };
  response.json = (payload: unknown) => { state.body = payload; return response; };
  response.type = () => response;
  response.send = (payload: unknown) => { state.body = payload; return response; };
  return response;
}

function anfrage(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    path: '/',
    originalUrl: '/',
    headers: { accept: 'text/html' },
    socket: { remoteAddress: '203.0.113.7' },
    body: undefined,
    ...overrides
  };
}

/** Schickt eine Anfrage durch die Torschicht und gibt zurueck, was passiert ist. */
function durchs(gate: ReturnType<typeof createSiteGate>, request: any) {
  const response = fakeAntwort();
  let weiter = false;
  gate.middleware(request, response, () => { weiter = true; });
  return { response, weiter };
}

describe('siteGateConfig', () => {
  it('ist ohne Variablen an und benutzt das Standardpasswort', () => {
    const config = siteGateConfig({} as NodeJS.ProcessEnv);
    expect(config.enabled).toBe(true);
    expect(config.password).toBe(DEFAULT_PASSWORD);
    expect(config.usesDefaultPassword).toBe(true);
  });

  it('laesst sich nur mit false/0/off abschalten – ein Tippfehler haelt zu', () => {
    for (const wert of ['false', 'FALSE', '0', 'off', ' Off ']) {
      expect(siteGateConfig({ SITE_GATE_ENABLED: wert } as NodeJS.ProcessEnv).enabled).toBe(false);
    }
    for (const wert of ['flase', 'nein', 'no', '', 'true']) {
      expect(siteGateConfig({ SITE_GATE_ENABLED: wert } as NodeJS.ProcessEnv).enabled).toBe(true);
    }
  });

  it('leitet den Schluessel aus dem Passwort ab – ein Wechsel entwertet alle Cookies', () => {
    const alt = konfig({ SITE_PASSWORD: 'altes-passwort' });
    const neu = konfig({ SITE_PASSWORD: 'neues-passwort' });
    const token = signGateToken(alt.secret, Date.now() + 60_000);
    expect(gateTokenValid(alt.secret, token, Date.now())).toBe(true);
    expect(gateTokenValid(neu.secret, token, Date.now())).toBe(false);
  });

  it('liefert bei gleichem Passwort denselben Schluessel – ein Redeploy loggt niemanden aus', () => {
    expect(konfig().secret.equals(konfig().secret)).toBe(true);
  });
});

describe('Cookie-Token', () => {
  it('akzeptiert nur die eigene Signatur', () => {
    const { secret } = konfig();
    const jetzt = Date.now();
    expect(gateTokenValid(secret, signGateToken(secret, jetzt + 60_000), jetzt)).toBe(true);
  });

  it('weist abgelaufene, verdrehte und erfundene Tokens ab', () => {
    const { secret } = konfig();
    const jetzt = Date.now();
    const gueltig = signGateToken(secret, jetzt + 60_000);
    const [exp, mac] = gueltig.split('.');
    expect(gateTokenValid(secret, signGateToken(secret, jetzt - 1_000), jetzt)).toBe(false);
    // Ablauf nach hinten geschoben, Signatur unveraendert – der klassische Versuch.
    expect(gateTokenValid(secret, `${Number(exp) + 999_999}.${mac}`, jetzt)).toBe(false);
    expect(gateTokenValid(secret, `${exp}.${'0'.repeat(64)}`, jetzt)).toBe(false);
    expect(gateTokenValid(secret, undefined, jetzt)).toBe(false);
    expect(gateTokenValid(secret, '', jetzt)).toBe(false);
    expect(gateTokenValid(secret, 'kein-punkt', jetzt)).toBe(false);
    expect(gateTokenValid(secret, `.${mac}`, jetzt)).toBe(false);
    expect(gateTokenValid(secret, `1e999.${mac}`, jetzt)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('liest Werte und uebersteht Muell', () => {
    expect(parseCookies('a=1; b=zwei')).toEqual({ a: '1', b: 'zwei' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('=leer; ; c=3')).toEqual({ c: '3' });
    expect(parseCookies('kaputt=%E0%A4%A')).toEqual({});
  });
});

describe('Torschicht', () => {
  it('laesst /health durch, sonst nichts', () => {
    const gate = createSiteGate(konfig());
    expect(durchs(gate, anfrage({ path: '/health' })).weiter).toBe(true);
    // Kein Praefix-Vergleich: eine erfundene Nachbarroute bleibt zu.
    expect(durchs(gate, anfrage({ path: '/healthcheck' })).weiter).toBe(false);
    for (const pfad of ['/', '/metrics', '/leaderboard', '/map', '/admin', '/profile/x']) {
      expect(durchs(gate, anfrage({ path: pfad })).weiter).toBe(false);
    }
    gate.stop();
  });

  it('antwortet auf Seitenaufrufe mit der Tuer, auf Fetch mit JSON', () => {
    const gate = createSiteGate(konfig());
    const seite = durchs(gate, anfrage({ path: '/leaderboard' })).response;
    expect(seite.statusCode).toBe(401);
    expect(String(seite.body)).toContain('<form');
    expect(seite.headers['cache-control']).toBe('no-store');
    expect(seite.headers['x-robots-tag']).toContain('noindex');

    const fetch = durchs(gate, anfrage({ path: '/leaderboard', headers: { accept: 'application/json' } })).response;
    expect(fetch.body).toMatchObject({ error: 'locked' });

    // Ein Asset darf nie HTML bekommen – das scheitert im Browser als MIME-Fehler.
    const asset = durchs(gate, anfrage({ path: '/assets/app.js', headers: { accept: 'text/html' } })).response;
    expect(asset.body).toMatchObject({ error: 'locked' });
    gate.stop();
  });

  it('laesst mit gueltigem Cookie durch', () => {
    const config = konfig();
    const gate = createSiteGate(config);
    const token = signGateToken(config.secret, Date.now() + 60_000);
    const ergebnis = durchs(gate, anfrage({ headers: { accept: 'text/html', cookie: `${GATE_COOKIE}=${token}` } }));
    expect(ergebnis.weiter).toBe(true);
    gate.stop();
  });

  it('setzt bei richtigem Passwort ein Cookie und leitet weiter', () => {
    const gate = createSiteGate(konfig());
    const { response, weiter } = durchs(gate, anfrage({
      method: 'POST',
      path: '/gate/login',
      body: { password: 'geheim' }
    }));
    expect(weiter).toBe(false);
    expect(response.statusCode).toBe(302);
    expect(response.redirectedTo).toBe('/');
    const cookie = response.cookies[GATE_COOKIE] as { options: Record<string, unknown> };
    expect(cookie).toBeTruthy();
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/' });
    gate.stop();
  });

  it('gibt bei falschem Passwort kein Cookie aus', () => {
    const gate = createSiteGate(konfig());
    const { response } = durchs(gate, anfrage({ method: 'POST', path: '/gate/login', body: { password: 'falsch' } }));
    expect(response.statusCode).toBe(401);
    expect(response.cookies[GATE_COOKIE]).toBeUndefined();
    gate.stop();
  });

  it('nimmt kein Passwort an, das kein String ist', () => {
    const gate = createSiteGate(konfig());
    for (const body of [{ password: ['geheim'] }, { password: { toString: () => 'geheim' } }, {}, null]) {
      const { response } = durchs(gate, anfrage({ method: 'POST', path: '/gate/login', body }));
      expect(response.cookies[GATE_COOKIE]).toBeUndefined();
    }
    gate.stop();
  });

  it('sperrt nach anhaltenden Fehlversuchen dieselbe IP', () => {
    const gate = createSiteGate(konfig());
    const versuch = () => durchs(gate, anfrage({
      method: 'POST',
      path: '/gate/login',
      body: { password: 'falsch' },
      socket: { remoteAddress: '198.51.100.4' }
    })).response;
    for (let i = 0; i < 6; i += 1) versuch();
    const gesperrt = versuch();
    expect(gesperrt.statusCode).toBe(429);
    expect(Number(gesperrt.headers['retry-after'])).toBeGreaterThan(0);
    expect(gate.stats().gesperrteIps).toBe(1);

    // Das richtige Passwort hilft waehrend der Sperre nicht – sonst waere die
    // Sperre nur eine Verzoegerung fuer den, der ohnehin gerade raet.
    const trotzdem = durchs(gate, anfrage({
      method: 'POST',
      path: '/gate/login',
      body: { password: 'geheim' },
      socket: { remoteAddress: '198.51.100.4' }
    })).response;
    expect(trotzdem.statusCode).toBe(429);

    // Eine andere IP ist davon unberuehrt.
    const andere = durchs(gate, anfrage({
      method: 'POST',
      path: '/gate/login',
      body: { password: 'geheim' },
      socket: { remoteAddress: '198.51.100.5' }
    })).response;
    expect(andere.statusCode).toBe(302);
    gate.stop();
  });

  it('leitet nach dem Login nur auf eigene Pfade weiter', () => {
    const gate = createSiteGate(konfig());
    const ziel = (next: unknown) => durchs(gate, anfrage({
      method: 'POST',
      path: '/gate/login',
      body: { password: 'geheim', next },
      socket: { remoteAddress: `192.0.2.${Math.floor(Math.random() * 200) + 1}` }
    })).response.redirectedTo;
    expect(ziel('/spielen')).toBe('/spielen');
    expect(ziel('//boese.example')).toBe('/');
    expect(ziel('/\\boese.example')).toBe('/');
    expect(ziel('https://boese.example')).toBe('/');
    expect(ziel('/gate')).toBe('/');
    expect(ziel(42)).toBe('/');
    gate.stop();
  });

  it('raeumt beim Abmelden das Cookie weg', () => {
    const gate = createSiteGate(konfig());
    const { response } = durchs(gate, anfrage({ path: '/gate/logout' }));
    expect(response.cleared).toContain(GATE_COOKIE);
    expect(response.redirectedTo).toBe('/gate');
    gate.stop();
  });

  it('schuetzt den WebSocket mit demselben Cookie', () => {
    const config = konfig();
    const gate = createSiteGate(config);
    const token = signGateToken(config.secret, Date.now() + 60_000);
    expect(gate.darfVerbinden({ headers: {} } as any)).toBe(false);
    expect(gate.darfVerbinden({ headers: { cookie: `${GATE_COOKIE}=egal` } } as any)).toBe(false);
    expect(gate.darfVerbinden({ headers: { cookie: `${GATE_COOKIE}=${token}` } } as any)).toBe(true);
    gate.stop();
  });

  it('ist abgeschaltet vollstaendig durchlaessig', () => {
    const gate = createSiteGate(konfig({ SITE_GATE_ENABLED: 'false' }));
    expect(durchs(gate, anfrage({ path: '/metrics' })).weiter).toBe(true);
    expect(gate.darfVerbinden({ headers: {} } as any)).toBe(true);
    expect(gate.stats().enabled).toBe(false);
    gate.stop();
  });
});

describe('loginSeite', () => {
  it('maskiert Hinweis und Rueckkehrziel', () => {
    const html = loginSeite('<script>alert(1)</script>', '/"><script>x</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('"><script>x');
  });

  it('laedt nichts von aussen nach', () => {
    const html = loginSeite(null, '/');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
  });
});
