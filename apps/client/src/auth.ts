import type { Session, SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Google-Login über Supabase – vollständig optional.
 *
 * Ohne `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` gibt es keinen
 * Login-Pfad: kein Client, kein Knopf, kein Token. Gäste spielen wie bisher.
 * Das ist kein Sonderfall, sondern der Normalzustand einer lokalen Entwicklung.
 *
 * Der Login darf außerdem nie im Weg stehen. Jede Operation ist zeitlich
 * begrenzt; wer nicht antwortet, wird als Gast behandelt statt zu blockieren.
 */

/** Zeitfenster für Session-Abfragen. Danach wird als Gast weitergemacht. */
export const AUTH_TIMEOUT_MS = 2000;
/** Der Server begrenzt Namen auf 18 Zeichen. */
export const MAX_NAME_LENGTH = 18;

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
}

export interface AuthConfig {
  url: string;
  anonKey: string;
}

/** Beide Variablen zusammen schalten den Login ein – eine allein reicht nicht. */
export function authConfig(env: Record<string, unknown>): AuthConfig | null {
  const url = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const anonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY.trim() : '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Der Anzeigename aus dem Google-Profil. Supabase legt ihn je nach Anbieter in
 * unterschiedliche Felder, deshalb die Kette – am Ende notfalls der lokale Teil
 * der Mailadresse.
 */
export function displayNameFrom(user: Pick<User, 'user_metadata' | 'email'> | null): string {
  if (!user) return '';
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [metadata.full_name, metadata.name, metadata.preferred_username, metadata.user_name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return tidyName(candidate);
  }
  const email = user.email ?? (typeof metadata.email === 'string' ? metadata.email : '');
  const local = email.split('@')[0] ?? '';
  return local ? tidyName(local) : '';
}

const tidyName = (value: string): string => value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);

/** Löst mit `fallback` auf, wenn das Versprechen zu lange braucht oder scheitert. */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type AuthListener = (user: AuthUser | null) => void;

export class AuthClient {
  private readonly listeners = new Set<AuthListener>();
  private currentUser: AuthUser | null = null;

  private constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Baut den Client nur, wenn er konfiguriert ist. Der Import liegt bewusst
   * hinter der Prüfung: Ohne Login-Konfiguration wird supabase-js nie geladen.
   */
  static async create(env: Record<string, unknown> = import.meta.env): Promise<AuthClient | null> {
    const config = authConfig(env);
    if (!config) return null;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(config.url, config.anonKey, {
        auth: {
          // Nach der Rückkehr von Google steckt die Sitzung in der URL und wird
          // von supabase-js selbst eingelöst und wieder aus der Adresszeile entfernt.
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true
        }
      });
      const client = new AuthClient(supabase);
      await client.initialize();
      return client;
    } catch (error) {
      console.error('Login-Client konnte nicht geladen werden', error);
      return null;
    }
  }

  private async initialize(): Promise<void> {
    const result = await withTimeout(this.supabase.auth.getSession(), AUTH_TIMEOUT_MS, null);
    this.currentUser = toAuthUser(result?.data.session ?? null);
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUser = toAuthUser(session);
      for (const listener of this.listeners) listener(this.currentUser);
    });
  }

  get user(): AuthUser | null {
    return this.currentUser;
  }

  onChange(listener: AuthListener): void {
    this.listeners.add(listener);
  }

  /** Schickt den Browser zu Google. Kehrt im Erfolgsfall gar nicht zurück. */
  async signIn(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` }
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
    this.currentUser = null;
    for (const listener of this.listeners) listener(null);
  }

  /**
   * Frisches Zugriffstoken für die Join-Nachricht. `getSession` erneuert ein
   * abgelaufenes Token selbst – wichtig beim Auto-Reconnect nach längerer Pause.
   * Antwortet Supabase nicht rechtzeitig, wird als Gast gejoint.
   */
  async accessToken(timeoutMs = AUTH_TIMEOUT_MS): Promise<string | null> {
    const result = await withTimeout(this.supabase.auth.getSession(), timeoutMs, null);
    return result?.data.session?.access_token ?? null;
  }
}

function toAuthUser(session: Session | null): AuthUser | null {
  const user = session?.user;
  if (!user) return null;
  return { id: user.id, name: displayNameFrom(user), email: user.email ?? null };
}
