import type { User } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, authConfig, displayNameFrom, withTimeout } from './auth';

describe('authConfig', () => {
  it('needs both variables to enable the login path', () => {
    expect(authConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'key' }))
      .toEqual({ url: 'https://x.supabase.co', anonKey: 'key' });
  });

  it('stays off when either one is missing or blank', () => {
    expect(authConfig({})).toBeNull();
    expect(authConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(authConfig({ VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
    expect(authConfig({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
    expect(authConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '' })).toBeNull();
  });

  it('ignores values that are not strings', () => {
    expect(authConfig({ VITE_SUPABASE_URL: 1, VITE_SUPABASE_ANON_KEY: 'key' })).toBeNull();
    expect(authConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: null })).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(authConfig({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_ANON_KEY: ' key ' }))
      .toEqual({ url: 'https://x.supabase.co', anonKey: 'key' });
  });
});

const user = (metadata: Record<string, unknown>, email: string | null = null) =>
  ({ user_metadata: metadata, email } as unknown as Pick<User, 'user_metadata' | 'email'>);

describe('displayNameFrom', () => {
  it('prefers the full name Google provides', () => {
    expect(displayNameFrom(user({ full_name: 'Sam Liba', name: 'sam' }))).toBe('Sam Liba');
  });

  it('walks the fallback chain', () => {
    expect(displayNameFrom(user({ name: 'Sam' }))).toBe('Sam');
    expect(displayNameFrom(user({ preferred_username: 'samu' }))).toBe('samu');
    expect(displayNameFrom(user({ user_name: 'sammy' }))).toBe('sammy');
  });

  it('falls back to the local part of the mail address', () => {
    expect(displayNameFrom(user({}, 'sam.liba@example.com'))).toBe('sam.liba');
    expect(displayNameFrom(user({ email: 'meta@example.com' }))).toBe('meta');
  });

  it('returns an empty string when there is nothing usable', () => {
    expect(displayNameFrom(user({}))).toBe('');
    expect(displayNameFrom(null)).toBe('');
    expect(displayNameFrom(user({ full_name: '   ' }))).toBe('');
  });

  it('fits the name limit the server enforces', () => {
    const long = displayNameFrom(user({ full_name: 'Maximilian Alexander von Habsburg-Lothringen' }));
    expect(long.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
  });

  it('collapses stray whitespace', () => {
    expect(displayNameFrom(user({ full_name: '  Sam    Liba  ' }))).toBe('Sam Liba');
  });
});

describe('withTimeout', () => {
  it('passes a fast result through', async () => {
    await expect(withTimeout(Promise.resolve('token'), 50, null)).resolves.toBe('token');
  });

  it('falls back when the promise takes too long', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200));
    await expect(withTimeout(slow, 20, null)).resolves.toBeNull();
  });

  it('falls back when the promise rejects – a login error must not throw at the join', async () => {
    await expect(withTimeout(Promise.reject(new Error('offline')), 50, null)).resolves.toBeNull();
  });

  it('keeps a falsy but valid result', async () => {
    await expect(withTimeout(Promise.resolve(''), 50, 'fallback')).resolves.toBe('');
  });
});
