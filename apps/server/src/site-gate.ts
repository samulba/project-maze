import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Request, RequestHandler, Response } from 'express';
import { clientIpFrom } from './rate-limits.js';

/**
 * Passwort-Tor vor der ganzen Seite (Sams Auftrag vom 17.08.).
 *
 * Das Projekt liegt auf Eis, das Repository ist oeffentlich, und der Dienst
 * laeuft weiter. Genau diese Kombination ist das Problem: Jeder, der die
 * Adresse kennt, kann die Arena belegen, Bots gegen sich spielen lassen und
 * dabei Rechenzeit und Datenbankzeilen verbrauchen, ohne dass jemand hinsieht.
 * Das Tor macht daraus eine Tuer mit Schluessel.
 *
 * ## Was es schuetzt
 *
 * **Alles ausser `/health`.** Die Ausnahme ist keine Bequemlichkeit: Railway
 * prueft darueber, ob der Dienst lebt (`railway.json`), und die Deploy-Wache
 * in der CI liest denselben Endpunkt. Ein Tor davor wuerde den Dienst bei
 * jedem Deploy als tot melden. `/health` verraet Zaehlerstaende und
 * Feature-Schalter, keine Spieldaten – das ist der Preis, und er ist bekannt.
 *
 * Geschuetzt sind damit auch die Wege, die vorher offen waren und es aus
 * Versehen geblieben waeren: `/metrics`, `/leaderboard`, `/profile/:id`,
 * `/map`, `/client-metrics` und der WebSocket. Der WebSocket ist der
 * wichtigste davon – ohne ihn waere das Tor Fassade, weil ein eigener Client
 * die HTML-Seite gar nicht braucht, um mitzuspielen.
 *
 * ## Wie es funktioniert
 *
 * Ein Passwort, ein signiertes Cookie, kein Konto. Der Server haelt keine
 * Sitzungsliste: Das Cookie traegt sein eigenes Ablaufdatum und eine
 * HMAC-Signatur darueber. Faelschen heisst den Schluessel raten, und der
 * Schluessel wird aus dem Passwort abgeleitet – wer das Passwort aendert,
 * entwertet damit automatisch jedes ausgegebene Cookie. Das ist die
 * Eigenschaft, die man beim Einfrieren wirklich braucht: einmal
 * `SITE_PASSWORD` umstellen, und alle sind draussen.
 *
 * ## Was es nicht ist
 *
 * Kein Ersatz fuer den Admin-Login. `/admin` bleibt zusaetzlich hinter
 * Google-Login und Allowlist (`admin.ts`); das Tor ist die aeussere Tuer, der
 * Admin-Guard die innere. Und es ist keine Verschluesselung – wer das Passwort
 * hat, sieht alles. Bei einem gemeinsamen Passwort fuer eine Handvoll Leute
 * ist genau das gewollt.
 */

/** Name des Cookies. Bewusst unauffaellig und ohne Bezug zum Passwort. */
export const GATE_COOKIE = 'maze_zugang';
/** Steht im signierten Teil, damit ein spaeteres Format alte Cookies entwertet. */
const TOKEN_VERSION = 'v1';

/**
 * Voreingestelltes Passwort, wenn `SITE_PASSWORD` nicht gesetzt ist.
 *
 * Es steht hier im Klartext, und das ist Absicht statt Nachlaessigkeit: Das
 * Repository ist oeffentlich, also waere auch ein Hash davon in Sekunden
 * zurueckgerechnet – „123456789" steht in jeder Wortliste, die es gibt. Ein
 * Hash wuerde hier nur Sicherheit vortaeuschen.
 *
 * Der Zweck des Standards ist ein anderer: Das Tor ist **von sich aus zu**.
 * Waere es ohne gesetzte Variable offen, haenge die ganze Absperrung an einem
 * Handgriff in der Railway-Oberflaeche, den niemand mehr macht, sobald das
 * Projekt eingefroren ist. Lieber ein schwaches Passwort, das sicher greift,
 * als ein starkes, das nie gesetzt wird.
 *
 * Wer echten Schutz will, setzt `SITE_PASSWORD` in Railway auf etwas
 * Zufaelliges. Dann steht das Geheimnis nur dort, und dieser Standard ist
 * wirkungslos. Das Log sagt beim Start, welcher der beiden Faelle vorliegt.
 */
export const DEFAULT_PASSWORD = '123456789';

/** So lange gilt ein Cookie, bevor erneut gefragt wird. */
const DEFAULT_MAX_AGE_DAYS = 30;

/** So viele Fehlversuche je IP sind frei, bevor gesperrt wird. */
const FREIE_VERSUCHE = 5;
/** Erste Sperre nach dem letzten freien Versuch. Verdoppelt sich danach. */
const BASIS_SPERRE_MS = 30_000;
/** Laenger als das wird nie gesperrt – sonst sperrt man sich selbst aus. */
const MAX_SPERRE_MS = 15 * 60_000;
/** Nach so langer Ruhe ist die Weste wieder weiss. */
const VERGESSEN_MS = 60 * 60_000;
/** Obergrenze der Fehlversuchs-Tabelle, damit sie kein Speicherleck wird. */
const MAX_IPS = 5_000;

export interface SiteGateConfig {
  enabled: boolean;
  password: string;
  /** Schluessel fuer die Cookie-Signatur – aus dem Passwort abgeleitet. */
  secret: Buffer;
  maxAgeMs: number;
  /** Laeuft das Tor mit dem oeffentlich bekannten Standardpasswort? */
  usesDefaultPassword: boolean;
}

const flagAus = (wert: string | undefined): boolean =>
  ['false', '0', 'off'].includes((wert ?? '').trim().toLowerCase());

/**
 * Liest die Konfiguration aus der Umgebung.
 *
 * Opt-out nach der Hausregel: alles ausser `false`/`0`/`off` laesst das Tor an.
 * Ein Tippfehler in `SITE_GATE_ENABLED` darf die Seite nicht kommentarlos
 * aufsperren.
 */
export function siteGateConfig(env: NodeJS.ProcessEnv = process.env): SiteGateConfig {
  const password = (env.SITE_PASSWORD ?? '').trim() || DEFAULT_PASSWORD;
  const tage = Number.parseInt(env.SITE_GATE_MAX_AGE_DAYS ?? '', 10);
  const maxAgeTage = Number.isFinite(tage) ? Math.max(1, Math.min(365, tage)) : DEFAULT_MAX_AGE_DAYS;
  // Der Signaturschluessel haengt am Passwort, nicht am Prozess: Ein Redeploy
  // (Railway macht davon viele) darf niemanden auslogggen, ein Passwortwechsel
  // muss jeden auslogggen. Ein zusaetzliches SITE_GATE_SECRET geht mit ein,
  // falls jemand die Cookies unabhaengig vom Passwort entwerten will.
  const secret = createHash('sha256')
    .update(`maze-site-gate:${TOKEN_VERSION}:${(env.SITE_GATE_SECRET ?? '').trim()}:${password}`)
    .digest();
  return {
    enabled: !flagAus(env.SITE_GATE_ENABLED),
    password,
    secret,
    maxAgeMs: maxAgeTage * 24 * 60 * 60_000,
    usesDefaultPassword: password === DEFAULT_PASSWORD
  };
}

/** Cookie-Header in ein Objekt zerlegen. Wirft nie. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const teil of header.split(';')) {
    const index = teil.indexOf('=');
    if (index < 1) continue;
    const name = teil.slice(0, index).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(teil.slice(index + 1).trim());
    } catch {
      // Ein kaputt kodiertes Cookie ist kein Grund, die Anfrage abzubrechen –
      // es zaehlt einfach als nicht vorhanden.
    }
  }
  return out;
}

/** Vergleich in konstanter Zeit, ohne bei Laengenunterschied zu werfen. */
function gleich(a: string, b: string): boolean {
  const links = Buffer.from(a, 'utf8');
  const rechts = Buffer.from(b, 'utf8');
  // Auf gleiche Laenge bringen: `timingSafeEqual` wirft sonst, und der Wurf
  // selbst waere schon die Laengeninformation, die wir nicht verraten wollen.
  const laenge = Math.max(links.length, rechts.length, 1);
  const linksFest = Buffer.alloc(laenge);
  const rechtsFest = Buffer.alloc(laenge);
  links.copy(linksFest);
  rechts.copy(rechtsFest);
  return timingSafeEqual(linksFest, rechtsFest) && links.length === rechts.length;
}

/** Baut das Cookie: Ablaufzeitpunkt plus HMAC darueber. */
export function signGateToken(secret: Buffer, expiresAtMs: number): string {
  const exp = String(Math.floor(expiresAtMs));
  const mac = createHmac('sha256', secret).update(`${TOKEN_VERSION}.${exp}`).digest('hex');
  return `${exp}.${mac}`;
}

/** Prueft Signatur **und** Ablauf. Beides, oder das Cookie waere ewig gueltig. */
export function gateTokenValid(secret: Buffer, token: string | undefined, now: number): boolean {
  if (!token) return false;
  const punkt = token.indexOf('.');
  if (punkt < 1) return false;
  const exp = token.slice(0, punkt);
  const mac = token.slice(punkt + 1);
  if (!/^\d{1,15}$/.test(exp)) return false;
  const erwartet = createHmac('sha256', secret).update(`${TOKEN_VERSION}.${exp}`).digest('hex');
  if (!gleich(mac, erwartet)) return false;
  return Number(exp) > now;
}

interface Fehlversuche {
  anzahl: number;
  /** Bis wann gesperrt (ms seit Epoche). 0 = nicht gesperrt. */
  gesperrtBis: number;
  zuletzt: number;
}

export interface SiteGate {
  readonly enabled: boolean;
  readonly usesDefaultPassword: boolean;
  /** Express-Schicht: laesst durch, wer darf, und zeigt sonst die Tuer. */
  readonly middleware: RequestHandler;
  /** Fuer den WebSocket-Upgrade: darf diese Verbindung ueberhaupt aufgebaut werden? */
  darfVerbinden(request: IncomingMessage, now?: number): boolean;
  /** Zaehlerstaende fuer `/health`. Nie das Passwort, nie einzelne IPs. */
  stats(): { enabled: boolean; defaultPassword: boolean; gesperrteIps: number; abgewiesen: number };
  /** Stoppt den Aufraeum-Timer – fuer Shutdown und Tests. */
  stop(): void;
}

/** Pfade, die auch ohne Cookie erreichbar bleiben muessen. */
function immerFrei(pfad: string): boolean {
  // Nur exakt /health. Kein Praefix-Vergleich: `/healthcheck-irgendwas` waere
  // sonst ebenfalls frei, und das ist genau die Art Luecke, die man erst
  // bemerkt, wenn jemand sie benutzt hat.
  return pfad === '/health';
}


export function createSiteGate(config: SiteGateConfig = siteGateConfig()): SiteGate {
  if (!config.enabled) {
    return {
      enabled: false,
      usesDefaultPassword: false,
      middleware: (_request, _response, next) => next(),
      darfVerbinden: () => true,
      stats: () => ({ enabled: false, defaultPassword: false, gesperrteIps: 0, abgewiesen: 0 }),
      stop: () => {}
    };
  }

  const fehlversuche = new Map<string, Fehlversuche>();
  let abgewiesen = 0;

  const aufraeumen = setInterval(() => {
    const jetzt = Date.now();
    for (const [ip, eintrag] of fehlversuche) {
      if (jetzt - eintrag.zuletzt > VERGESSEN_MS && eintrag.gesperrtBis <= jetzt) fehlversuche.delete(ip);
    }
  }, 5 * 60_000);
  aufraeumen.unref();

  const sperreBis = (eintrag: Fehlversuche): number => {
    if (eintrag.anzahl <= FREIE_VERSUCHE) return 0;
    const stufe = eintrag.anzahl - FREIE_VERSUCHE - 1;
    // Verdopplung mit Deckel: 30 s, 1 min, 2 min, … bis 15 min. Ein Mensch,
    // der sich vertippt, merkt davon nichts; ein Skript kommt auf hoechstens
    // ein paar hundert Versuche pro Tag statt Millionen.
    return eintrag.zuletzt + Math.min(MAX_SPERRE_MS, BASIS_SPERRE_MS * 2 ** stufe);
  };

  const gesperrt = (ip: string, now: number): number => {
    const eintrag = fehlversuche.get(ip);
    if (!eintrag) return 0;
    if (now - eintrag.zuletzt > VERGESSEN_MS) {
      fehlversuche.delete(ip);
      return 0;
    }
    const bis = sperreBis(eintrag);
    return bis > now ? bis : 0;
  };

  const merkeFehlversuch = (ip: string, now: number): void => {
    const eintrag = fehlversuche.get(ip);
    if (eintrag && now - eintrag.zuletzt <= VERGESSEN_MS) {
      eintrag.anzahl += 1;
      eintrag.zuletzt = now;
      eintrag.gesperrtBis = sperreBis(eintrag);
      return;
    }
    // Deckel gegen ein Speicherleck aus verteilten Versuchen: Ist die Tabelle
    // voll, fliegt der aelteste Eintrag. Map behaelt die Einfuegereihenfolge.
    if (fehlversuche.size >= MAX_IPS) {
      const aeltester = fehlversuche.keys().next();
      if (!aeltester.done) fehlversuche.delete(aeltester.value);
    }
    fehlversuche.set(ip, { anzahl: 1, gesperrtBis: 0, zuletzt: now });
  };

  const angemeldet = (request: IncomingMessage | Request, now: number): boolean =>
    gateTokenValid(config.secret, parseCookies(request.headers.cookie)[GATE_COOKIE], now);

  const setzeCookie = (response: Response, now: number): void => {
    const ablauf = now + config.maxAgeMs;
    response.cookie(GATE_COOKIE, signGateToken(config.secret, ablauf), {
      httpOnly: true,
      // `strict` statt `lax`: Es gibt keinen Anwendungsfall, in dem jemand von
      // einer fremden Seite direkt in das Spiel navigiert – und wenn doch,
      // kostet es einen Klick auf der Torseite.
      sameSite: 'strict',
      // Ueber HTTPS ausgeliefert immer `secure`. Lokal (http://localhost)
      // wuerde der Browser das Cookie dann verwerfen, deshalb die Abfrage.
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: config.maxAgeMs
    });
  };

  const middleware: RequestHandler = (request, response, next) => {
    const now = Date.now();
    if (immerFrei(request.path)) return next();

    if (request.path === '/gate/logout') {
      response.clearCookie(GATE_COOKIE, { path: '/' });
      response.setHeader('Cache-Control', 'no-store');
      return response.redirect(302, '/gate');
    }

    /*
     * Nur fuer nginx (`auth_request`, siehe apps/client/nginx.conf).
     *
     * Im Compose-Stack liefert nginx die statischen Dateien selbst aus – der
     * Node-Prozess sieht diese Anfragen nie, und damit auch dieses Tor nicht.
     * Statt das Passwort ein zweites Mal in die nginx-Konfiguration zu legen
     * (zwei Wahrheiten, die auseinanderlaufen), fragt nginx hier nach: 204
     * heisst „darf", 401 heisst „zur Tuer schicken".
     *
     * Bewusst ohne Body und ohne jede Auskunft darueber, WARUM – die Antwort
     * geht an nginx, nicht an den Browser.
     */
    if (request.path === '/gate/check') {
      response.setHeader('Cache-Control', 'no-store');
      return void response.status(angemeldet(request, now) ? 204 : 401).end();
    }

    if (request.path === '/gate/login') {
      if (request.method !== 'POST') return response.redirect(302, '/gate');
      const ip = clientIpFrom(request as unknown as IncomingMessage, trustProxyHops()) || 'unknown';
      const bis = gesperrt(ip, now);
      if (bis) {
        abgewiesen += 1;
        const sekunden = Math.ceil((bis - now) / 1000);
        response.setHeader('Retry-After', String(sekunden));
        return antworteTuer(request, response, 429, `Zu viele Fehlversuche. Bitte ${sekunden} Sekunden warten.`);
      }
      const eingabe = passwortAusBody(request.body);
      if (eingabe !== null && gleich(eingabe, config.password)) {
        fehlversuche.delete(ip);
        setzeCookie(response, now);
        response.setHeader('Cache-Control', 'no-store');
        // Nur relative, eigene Ziele – ein offener Redirect waere hier der
        // einzige Weg, das Tor gegen seine eigenen Besucher zu verwenden.
        return response.redirect(302, sicheresZiel(request.body));
      }
      merkeFehlversuch(ip, now);
      abgewiesen += 1;
      return antworteTuer(request, response, 401, 'Falsches Passwort.');
    }

    if (angemeldet(request, now)) {
      if (request.path === '/gate') return response.redirect(302, '/');
      return next();
    }

    if (request.path === '/gate') return antworteTuer(request, response, 200, null);

    abgewiesen += 1;
    return antworteTuer(request, response, 401, null);
  };

  return {
    enabled: true,
    usesDefaultPassword: config.usesDefaultPassword,
    middleware,
    darfVerbinden: (request, now = Date.now()) => angemeldet(request, now),
    stats: () => {
      const jetzt = Date.now();
      let gesperrteIps = 0;
      for (const [, eintrag] of fehlversuche) if (sperreBis(eintrag) > jetzt) gesperrteIps += 1;
      return { enabled: true, defaultPassword: config.usesDefaultPassword, gesperrteIps, abgewiesen };
    },
    stop: () => clearInterval(aufraeumen)
  };
}

const trustProxyHops = (): number => {
  const parsed = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '', 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : 1;
};

/**
 * Holt das Passwort aus dem Body – Formular oder JSON, mehr gibt es nicht.
 * Alles andere (Arrays, Objekte, fehlendes Feld) ist `null` und damit falsch.
 */
function passwortAusBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const wert = (body as Record<string, unknown>).password;
  return typeof wert === 'string' ? wert : null;
}

/**
 * Wohin nach erfolgreichem Login? Nur eigene, relative Pfade.
 *
 * `//example.com` und `/\example.com` sind fuer den Browser fremde Hosts,
 * obwohl sie mit `/` anfangen – deshalb reicht die Pruefung auf das erste
 * Zeichen nicht.
 */
function sicheresZiel(body: unknown): string {
  const roh = body && typeof body === 'object' ? (body as Record<string, unknown>).next : null;
  if (typeof roh !== 'string' || !roh.startsWith('/') || roh.startsWith('//') || roh.startsWith('/\\')) return '/';
  if (roh.startsWith('/gate')) return '/';
  return roh;
}

/** Will der Aufrufer HTML sehen, oder ist das ein Fetch/Asset? */
function willHtml(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'POST') return false;
  // Ein `.js`, das die HTML-Tuer als Antwort bekaeme, scheitert im Browser mit
  // einem MIME-Fehler statt sichtbar zu werden – solche Anfragen bekommen JSON.
  if (/\.[a-z0-9]+$/i.test(request.path) && !request.path.endsWith('.html')) return false;
  return (request.headers.accept ?? '').includes('text/html');
}

function antworteTuer(request: Request, response: Response, status: number, hinweis: string | null): void {
  response.status(status);
  response.setHeader('Cache-Control', 'no-store');
  // Kein Suchmaschinen-Index fuer eine eingefrorene Seite.
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!willHtml(request)) {
    response.json({ error: 'locked', message: hinweis ?? 'Diese Seite ist mit einem Passwort geschuetzt.' });
    return;
  }
  const ziel = request.method === 'POST' ? '/' : request.originalUrl || '/';
  response.type('html').send(loginSeite(hinweis, ziel));
}

/**
 * Die Tuer selbst – eine einzelne, in sich geschlossene HTML-Seite.
 *
 * Ohne externe Datei, ohne Schrift von einem CDN, ohne Bundle: Alles, was das
 * Tor laedt, muesste sonst am Tor vorbei ausgeliefert werden, und jede solche
 * Ausnahme ist ein Loch. Eine Seite ohne Abhaengigkeiten hat keine.
 */
export function loginSeite(hinweis: string | null, ziel: string): string {
  const escaped = (text: string): string =>
    text.replace(/[&<>"']/g, (zeichen) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[zeichen] ?? zeichen);
  const meldung = hinweis ? `<p class="warn">${escaped(hinweis)}</p>` : '';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Project Maze – pausiert</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0d1117; color: #e6edf3; padding: 24px;
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  main { width: 100%; max-width: 380px; }
  h1 { font-size: 1.35rem; margin: 0 0 8px; letter-spacing: .01em; }
  p { margin: 0 0 20px; color: #9198a1; font-size: .92rem; }
  .warn { color: #ff8080; margin: 0 0 14px; }
  label { display: block; font-size: .82rem; color: #9198a1; margin-bottom: 6px; }
  input, button {
    width: 100%; font: inherit; border-radius: 8px; padding: 11px 13px; border: 1px solid #30363d;
  }
  input { background: #010409; color: #e6edf3; }
  input:focus { outline: 2px solid #3b82f6; outline-offset: 1px; border-color: #3b82f6; }
  button {
    margin-top: 12px; background: #238636; border-color: #2ea043; color: #fff;
    font-weight: 600; cursor: pointer;
  }
  button:hover { background: #2ea043; }
  footer { margin-top: 22px; font-size: .78rem; color: #6e7681; }
</style>
</head>
<body>
<main>
  <h1>Project Maze ist pausiert</h1>
  <p>Das Projekt ruht gerade. Zugang nur mit Passwort.</p>
  ${meldung}
  <form method="post" action="/gate/login" autocomplete="on">
    <input type="hidden" name="next" value="${escaped(ziel)}">
    <label for="pw">Passwort</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required maxlength="200">
    <button type="submit">Eintreten</button>
  </form>
  <footer>Kein Konto, kein Tracking – nur diese eine Abfrage.</footer>
</main>
</body>
</html>`;
}
