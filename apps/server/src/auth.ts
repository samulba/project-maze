import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

/**
 * Supabase-Login (Sprint B, Etappe 3) – nur die Verifikation.
 *
 * Der Client holt sein Zugriffstoken direkt bei Supabase und schickt es später
 * in der Join-Message mit. Dieses Modul prüft das Token und liefert die
 * Konto-ID zurück. Drei Eigenschaften sind dabei nicht verhandelbar:
 *
 * 1. **Feature-Flag:** Ohne `AUTH_ENABLED=true` (und ohne `SUPABASE_URL`) ist
 *    das Modul komplett inaktiv – `verifyAuthToken` liefert immer `null`, und
 *    der Server verhält sich exakt wie heute.
 * 2. **Kein Netzwerk-Roundtrip pro Join:** Verifiziert wird lokal. Der
 *    öffentliche Schlüsselsatz (JWKS) wird einmal geholt und gecacht;
 *    `supabase.auth.getUser()` – ein HTTP-Aufruf je Join – ist ausdrücklich
 *    nicht das, was hier passiert.
 * 3. **Ein einziger Aufrufpunkt:** `verifyAuthToken(token)` ist die gesamte
 *    Schnittstelle. Sie wirft nie und braucht kein try/catch beim Aufrufer.
 *
 * Gast bleibt immer möglich: Ein fehlendes Token ist kein Fehler, sondern der
 * Normalfall.
 */

/** Supabase setzt diese Audience für angemeldete Nutzer. */
const EXPECTED_AUDIENCE = 'authenticated';
/** Und diese Rolle – ein Service-Role-Token darf nie als Spieler durchgehen. */
const EXPECTED_ROLE = 'authenticated';
/** Toleranz für Uhrendrift zwischen Supabase und Spielserver. */
const CLOCK_TOLERANCE_SECONDS = 10;
/** Frühestens nach dieser Zeit wird ein unbekannter `kid` neu geholt. */
const JWKS_COOLDOWN_MS = 30_000;
/** So lange gilt ein geholter Schlüsselsatz als frisch. */
const JWKS_CACHE_MS = 10 * 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AuthConfig {
  /** Projekt-URL, z. B. https://abcdefghijkl.supabase.co */
  url: string;
  /** Erwarteter Issuer: <url>/auth/v1 */
  issuer: string;
  /** JWKS-Endpunkt des Projekts. */
  jwksUrl: string;
  /**
   * Symmetrisches JWT-Secret für Projekte, die noch mit HS256 signieren.
   * Ist es gesetzt, wird lokal damit geprüft – ganz ohne JWKS.
   */
  sharedSecret: string | null;
}

export interface AuthenticatedUser {
  /** `sub` aus dem Token – die Konto-ID aus auth.users. */
  userId: string;
  /** Anzeigename aus den Google-Metadaten, falls vorhanden. */
  displayName: string | null;
  /** Läuft ab (Unix-Sekunden) – nützlich fürs Logging, nicht fürs Spiel. */
  expiresAt: number;
}

export interface AuthStatus {
  enabled: boolean;
  mode: 'off' | 'jwks' | 'shared-secret';
  verified: number;
  rejected: number;
  lastRejectionReason: string | null;
}

interface AuthState {
  config: AuthConfig | null;
  keys: JWTVerifyGetKey | null;
  verified: number;
  rejected: number;
  lastRejectionReason: string | null;
}

const state: AuthState = {
  config: null,
  keys: null,
  verified: 0,
  rejected: 0,
  lastRejectionReason: null
};

const flagEnabled = (): boolean => {
  const value = process.env.AUTH_ENABLED?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
};

/**
 * Liest die Konfiguration. `AUTH_ENABLED=true` allein reicht nicht – ohne
 * `SUPABASE_URL` ist weder Issuer noch Schlüsselquelle bekannt, und dann bleibt
 * der Login aus, statt halb konfiguriert zu laufen.
 */
export function authConfig(): AuthConfig | null {
  if (!flagEnabled()) return null;
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  if (!url) return null;
  return {
    url,
    issuer: `${url}/auth/v1`,
    jwksUrl: `${url}/auth/v1/.well-known/jwks.json`,
    sharedSecret: process.env.SUPABASE_JWT_SECRET?.trim() || null
  };
}

function keySourceFor(config: AuthConfig): JWTVerifyGetKey {
  if (config.sharedSecret) {
    // HS256-Projekte: rein lokal, kein Netzwerk. createLocalJWKSet wäre hier
    // falsch – der geteilte Schlüssel ist kein JWKS, sondern ein Geheimnis.
    const secret = new TextEncoder().encode(config.sharedSecret);
    return (() => Promise.resolve(secret)) as unknown as JWTVerifyGetKey;
  }
  // Holt den Schlüsselsatz einmal und hält ihn im Speicher. Nur bei einem
  // unbekannten `kid` (Schlüsselrotation) wird erneut geladen – frühestens
  // nach dem Cooldown, damit ungültige Tokens keinen Request auslösen können.
  return createRemoteJWKSet(new URL(config.jwksUrl), {
    cooldownDuration: JWKS_COOLDOWN_MS,
    cacheMaxAge: JWKS_CACHE_MS
  });
}

/**
 * Initialisiert die Verifikation. Mehrfachaufrufe sind unschädlich; Tests
 * setzen mit `resetAuth()` zurück.
 */
export function initAuth(overrides: { config?: AuthConfig | null; keys?: JWTVerifyGetKey } = {}): AuthStatus {
  const config = overrides.config !== undefined ? overrides.config : authConfig();
  state.config = config;
  state.keys = config ? overrides.keys ?? keySourceFor(config) : null;
  return authStatus();
}

/** Setzt Konfiguration und Zähler zurück – für Tests und Neustarts. */
export function resetAuth(): void {
  state.config = null;
  state.keys = null;
  state.verified = 0;
  state.rejected = 0;
  state.lastRejectionReason = null;
}

export function authStatus(): AuthStatus {
  return {
    enabled: state.config !== null,
    mode: state.config === null ? 'off' : state.config.sharedSecret ? 'shared-secret' : 'jwks',
    verified: state.verified,
    rejected: state.rejected,
    lastRejectionReason: state.lastRejectionReason
  };
}

const reject = (reason: string): null => {
  state.rejected += 1;
  state.lastRejectionReason = reason;
  return null;
};

/** Google liefert den Namen je nach Provider unter verschiedenen Schlüsseln. */
function displayNameFrom(payload: JWTPayload): string | null {
  const metadata = payload['user_metadata'];
  if (!metadata || typeof metadata !== 'object') return null;
  const candidates = ['full_name', 'name', 'preferred_username'];
  for (const key of candidates) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * **Der einzige Aufrufpunkt.** Prüft Signatur, Issuer, Audience, Rolle und
 * Ablauf eines Supabase-Zugriffstokens und liefert die Konto-ID.
 *
 * Gibt `null` zurück, wenn der Login abgeschaltet ist, kein Token mitkam oder
 * das Token ungültig ist – wirft nie. Der Aufrufer behandelt `null` schlicht
 * als „spielt als Gast".
 */
export async function verifyAuthToken(token: string | undefined | null): Promise<AuthenticatedUser | null> {
  if (!state.config || !state.keys) return null;
  const raw = typeof token === 'string' ? token.trim() : '';
  if (!raw) return null;
  // Ein Zugriffstoken hat drei Segmente; alles andere ist Unsinn und kostet
  // keinen Verifikationsversuch.
  if (raw.length > 4_096 || raw.split('.').length !== 3) return reject('malformed');

  try {
    const { payload } = await jwtVerify(raw, state.keys, {
      issuer: state.config.issuer,
      audience: EXPECTED_AUDIENCE,
      clockTolerance: CLOCK_TOLERANCE_SECONDS
    });
    if (payload['role'] !== EXPECTED_ROLE) return reject('role');
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    if (!UUID_PATTERN.test(userId)) return reject('subject');

    state.verified += 1;
    return {
      userId,
      displayName: displayNameFrom(payload),
      expiresAt: typeof payload.exp === 'number' ? payload.exp : 0
    };
  } catch (error: unknown) {
    // jose kodiert den Grund in `code`, z. B. ERR_JWT_EXPIRED.
    const code = (error as { code?: string }).code;
    return reject(code ?? (error instanceof Error ? error.name : 'invalid'));
  }
}

/** Nur für Tests: baut eine Schlüsselquelle aus einem statischen JWKS. */
export function localKeySource(jwks: { keys: unknown[] }): JWTVerifyGetKey {
  return createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0]);
}
