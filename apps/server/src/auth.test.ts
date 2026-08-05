import { createServer, type Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyObject } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  authConfig,
  authStatus,
  initAuth,
  localKeySource,
  resetAuth,
  verifyAuthToken
} from './auth';

const PROJECT_URL = 'https://abcdefghijkl.supabase.co';
const ISSUER = `${PROJECT_URL}/auth/v1`;
const USER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const SECRET = 'super-secret-supabase-jwt-secret-value';

const secretKey = new TextEncoder().encode(SECRET);

interface TokenOptions {
  issuer?: string;
  audience?: string;
  role?: string;
  subject?: string;
  expiresIn?: string;
  /** Absolute Ablaufzeit in Unix-Sekunden – für „längst abgelaufen". */
  expiresAt?: number;
  issuedAt?: number;
  userMetadata?: Record<string, unknown>;
}

const signHs256 = (options: TokenOptions = {}): Promise<string> => {
  const payload: Record<string, unknown> = { role: options.role ?? 'authenticated' };
  if (options.userMetadata) payload['user_metadata'] = options.userMetadata;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'authenticated')
    .setSubject(options.subject ?? USER_ID)
    .setIssuedAt(options.issuedAt)
    .setExpirationTime(options.expiresAt ?? options.expiresIn ?? '1h')
    .sign(secretKey);
};

const enableSharedSecret = (): void => {
  initAuth({
    config: { url: PROJECT_URL, issuer: ISSUER, jwksUrl: `${ISSUER}/.well-known/jwks.json`, sharedSecret: SECRET }
  });
};

afterEach(() => {
  resetAuth();
  delete process.env.AUTH_ENABLED;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_JWT_SECRET;
});

describe('auth feature flag', () => {
  it('stays off without AUTH_ENABLED, even with a valid token', async () => {
    process.env.SUPABASE_URL = PROJECT_URL;
    process.env.SUPABASE_JWT_SECRET = SECRET;
    expect(authConfig()).toBeNull();

    const status = initAuth();
    expect(status).toEqual({ enabled: false, mode: 'off', verified: 0, rejected: 0, lastRejectionReason: null });
    await expect(verifyAuthToken(await signHs256())).resolves.toBeNull();
    // Ein abgelehnter Login würde gezählt – hier passiert schlicht nichts.
    expect(authStatus().rejected).toBe(0);
  });

  it('stays off when AUTH_ENABLED is set but the project URL is missing', () => {
    process.env.AUTH_ENABLED = 'true';
    expect(authConfig()).toBeNull();
    expect(initAuth().enabled).toBe(false);
  });

  it('turns on with flag plus project URL and reports its mode', () => {
    process.env.AUTH_ENABLED = 'true';
    process.env.SUPABASE_URL = `${PROJECT_URL}/`;
    const config = authConfig();
    expect(config).toEqual({
      url: PROJECT_URL,
      issuer: ISSUER,
      jwksUrl: `${ISSUER}/.well-known/jwks.json`,
      sharedSecret: null
    });
    expect(initAuth().mode).toBe('jwks');

    process.env.SUPABASE_JWT_SECRET = SECRET;
    expect(initAuth().mode).toBe('shared-secret');
  });
});

describe('token verification', () => {
  beforeEach(() => { enableSharedSecret(); });

  it('accepts a genuine token and maps it to the account id', async () => {
    const user = await verifyAuthToken(await signHs256({
      userMetadata: { full_name: 'Ada Lovelace', avatar_url: 'https://example.com/a.png' }
    }));

    expect(user?.userId).toBe(USER_ID);
    expect(user?.displayName).toBe('Ada Lovelace');
    expect(user?.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(authStatus().verified).toBe(1);
  });

  it('falls back through the name claims Google may deliver', async () => {
    const named = await verifyAuthToken(await signHs256({ userMetadata: { name: 'Grace' } }));
    expect(named?.displayName).toBe('Grace');

    const anonymous = await verifyAuthToken(await signHs256({ userMetadata: { avatar_url: 'x' } }));
    expect(anonymous?.userId).toBe(USER_ID);
    expect(anonymous?.displayName).toBeNull();
  });

  it('treats a missing token as a guest, not as an error', async () => {
    for (const value of [undefined, null, '', '   ']) {
      await expect(verifyAuthToken(value)).resolves.toBeNull();
    }
    expect(authStatus().rejected).toBe(0);
  });

  it('rejects a token from a different project', async () => {
    const foreign = await verifyAuthToken(await signHs256({ issuer: 'https://evil.supabase.co/auth/v1' }));
    expect(foreign).toBeNull();
    expect(authStatus().lastRejectionReason).toBe('ERR_JWT_CLAIM_VALIDATION_FAILED');
  });

  it('rejects a wrong audience', async () => {
    expect(await verifyAuthToken(await signHs256({ audience: 'anon' }))).toBeNull();
    expect(authStatus().rejected).toBe(1);
  });

  it('rejects a service-role token that would otherwise look valid', async () => {
    expect(await verifyAuthToken(await signHs256({ role: 'service_role' }))).toBeNull();
    expect(authStatus().lastRejectionReason).toBe('role');
  });

  it('rejects an expired token', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 7_200;
    const expired = await signHs256({ issuedAt, expiresAt: issuedAt + 3_600 });
    expect(await verifyAuthToken(expired)).toBeNull();
    expect(authStatus().lastRejectionReason).toBe('ERR_JWT_EXPIRED');
  });

  it('rejects a tampered signature', async () => {
    const token = await signHs256();
    const tampered = `${token.slice(0, -4)}AAAA`;
    expect(await verifyAuthToken(tampered)).toBeNull();
    expect(authStatus().verified).toBe(0);
  });

  it('rejects a token signed with someone else\'s secret', async () => {
    const foreign = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject(USER_ID)
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('a-completely-different-secret-value!!'));

    expect(await verifyAuthToken(foreign)).toBeNull();
  });

  it('rejects a subject that is not a uuid', async () => {
    expect(await verifyAuthToken(await signHs256({ subject: 'not-a-uuid' }))).toBeNull();
    expect(authStatus().lastRejectionReason).toBe('subject');
  });

  it('discards garbage without attempting verification', async () => {
    expect(await verifyAuthToken('not.a.jwt.at.all')).toBeNull();
    expect(await verifyAuthToken('a'.repeat(5_000))).toBeNull();
    expect(authStatus().lastRejectionReason).toBe('malformed');
  });
});

describe('JWKS verification', () => {
  let jwksServer: Server;
  let requests = 0;
  let privateKey: KeyObject | CryptoKey;
  let publicJwk: JWK;
  let port = 0;

  beforeEach(async () => {
    requests = 0;
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };

    jwksServer = createServer((request, response) => {
      requests += 1;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    const address = jwksServer.address();
    if (typeof address === 'string' || address === null) throw new Error('no port');
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  const signEs256 = (): Promise<string> => new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setSubject(USER_ID)
    .setExpirationTime('1h')
    .sign(privateKey);

  it('verifies an asymmetrically signed token against the project JWKS', async () => {
    initAuth({
      config: {
        url: PROJECT_URL,
        issuer: ISSUER,
        jwksUrl: `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`,
        sharedSecret: null
      }
    });

    const user = await verifyAuthToken(await signEs256());
    expect(user?.userId).toBe(USER_ID);
    expect(authStatus().mode).toBe('jwks');
  });

  it('fetches the key set once and never again per join', async () => {
    initAuth({
      config: {
        url: PROJECT_URL,
        issuer: ISSUER,
        jwksUrl: `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`,
        sharedSecret: null
      }
    });

    const token = await signEs256();
    for (let join = 0; join < 25; join += 1) {
      expect(await verifyAuthToken(token)).not.toBeNull();
    }

    // Das ist die Kernzusage: 25 Joins, ein einziger Netzwerkabruf.
    expect(requests).toBe(1);
    expect(authStatus().verified).toBe(25);
  });

  it('does not hit the network for a token with an unknown key id', async () => {
    initAuth({
      config: {
        url: PROJECT_URL,
        issuer: ISSUER,
        jwksUrl: `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`,
        sharedSecret: null
      },
      // Statischer Schlüsselsatz: garantiert offline.
      keys: localKeySource({ keys: [publicJwk] })
    });

    const foreign = await generateKeyPair('ES256', { extractable: true });
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'unknown-key' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject(USER_ID)
      .setExpirationTime('1h')
      .sign(foreign.privateKey);

    expect(await verifyAuthToken(token)).toBeNull();
    expect(requests).toBe(0);
  });
});
