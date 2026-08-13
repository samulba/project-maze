import { AuthClient } from '../auth';
import './admin.css';
import { renderPortal, renderTor, type BacklogAntwort, type ViewState } from './view';
import type { AdminSession, Overview, PlayersResponse } from './types';

/**
 * Admin-Portal – Einstieg.
 *
 * Ablauf: Login-Client bauen → `/admin/api/session` fragen → je nach Antwort
 * das Tor oder das Portal zeigen. Danach alle 20 Sekunden nachladen.
 *
 * Der Login ist derselbe wie im Spiel (`../auth`), nur mit einem anderen
 * Rückkehrziel. Das Zugriffstoken geht als `Authorization: Bearer` an die
 * Admin-Routen; der Server prüft es und schlägt in seiner Allowlist nach.
 */

const WURZEL = document.querySelector<HTMLElement>('#admin-root');
/** Wie oft nachgeladen wird. Kurz genug für „läuft es gerade", lang genug
 *  für die 15-Sekunden-Zwischenspeicherung des Servers. */
const INTERVALL_MS = 20_000;

let auth: AuthClient | null = null;
let tage = 30;
let sortierung: 'new' | 'active' = 'active';
let timer: ReturnType<typeof setInterval> | null = null;
let laeuft = false;

const tagesWahl = (): number => {
  const gespeichert = Number.parseInt(window.localStorage.getItem('mazers-admin-tage') ?? '', 10);
  return [7, 14, 30, 90].includes(gespeichert) ? gespeichert : 30;
};

async function hole<T>(pfad: string): Promise<T> {
  const token = auth ? await auth.accessToken() : null;
  const antwort = await fetch(pfad, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: 'no-store'
  });
  if (!antwort.ok) {
    const koerper = await antwort.json().catch(() => ({}));
    throw new Error(String((koerper as { message?: string }).message ?? `HTTP ${antwort.status}`));
  }
  return antwort.json() as Promise<T>;
}

function zeigeTor(zustand: Parameters<typeof renderTor>[0]): void {
  if (!WURZEL) return;
  WURZEL.innerHTML = renderTor(zustand);
  WURZEL.querySelector('#anmelden')?.addEventListener('click', () => {
    // Zurück auf /admin und nicht auf /, sonst landet man nach der Anmeldung
    // im Spiel und muss von Hand zurücknavigieren.
    void auth?.signIn('/admin').catch((error: unknown) => {
      zeigeTor({ ...zustand, fehler: error instanceof Error ? error.message : String(error) });
    });
  });
  WURZEL.querySelector('#abmelden')?.addEventListener('click', () => {
    void auth?.signOut().then(() => window.location.reload());
  });
  WURZEL.querySelector('#kopieren')?.addEventListener('click', (ereignis) => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void navigator.clipboard.writeText(zustand.userId ?? '').then(() => {
      knopf.textContent = 'kopiert';
      window.setTimeout(() => { knopf.textContent = 'ID kopieren'; }, 1800);
    }).catch(() => { knopf.textContent = 'ging nicht – von Hand markieren'; });
  });
}

function verdrahtePortal(state: ViewState): void {
  if (!WURZEL) return;
  WURZEL.querySelector('#neu')?.addEventListener('click', () => { void laden(); });
  WURZEL.querySelector('#abmelden')?.addEventListener('click', () => {
    void auth?.signOut().then(() => window.location.reload());
  });
  WURZEL.querySelector<HTMLSelectElement>('#tage')?.addEventListener('change', (ereignis) => {
    tage = Number((ereignis.currentTarget as HTMLSelectElement).value);
    window.localStorage.setItem('mazers-admin-tage', String(tage));
    void laden();
  });
  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-sort]')) {
    knopf.addEventListener('click', () => {
      sortierung = knopf.dataset.sort === 'new' ? 'new' : 'active';
      void laden();
    });
  }
  void state;
}

async function laden(): Promise<void> {
  if (!WURZEL || laeuft) return;
  laeuft = true;
  try {
    const [overview, players, backlog] = await Promise.all([
      hole<Overview>(`/admin/api/overview?days=${tage}`),
      hole<PlayersResponse>(`/admin/api/players?sort=${sortierung}&limit=50`),
      // Die Liste darf das Portal nicht mitreissen, wenn sie einmal fehlt –
      // sie ist eine Beigabe, kein Betriebswert.
      hole<BacklogAntwort>('/admin/api/backlog').catch(() => null)
    ]);
    const state: ViewState = {
      overview,
      players: players.players,
      playersTotal: players.total,
      sortierung,
      tage,
      aktualisiert: Date.now(),
      backlog
    };
    WURZEL.innerHTML = renderPortal(state);
    verdrahtePortal(state);
  } catch (error) {
    // Ein Fehler beim Nachladen darf die Seite nicht leeren – sonst steht Sam
    // bei einem kurzen Netzhänger vor einem weißen Portal. Nur beim allerersten
    // Laden gibt es nichts zu behalten.
    const nachricht = error instanceof Error ? error.message : String(error);
    if (WURZEL.childElementCount === 0 || WURZEL.querySelector('.tor')) {
      zeigeTor({ authEnabled: true, userId: null, allowlistSize: 0, fehler: nachricht, laedt: false });
    } else {
      const fuss = WURZEL.querySelector('.fuss');
      if (fuss) fuss.textContent = `Aktualisierung fehlgeschlagen: ${nachricht}`;
    }
  } finally {
    laeuft = false;
  }
}

function starteTakt(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void laden(); }, INTERVALL_MS);
}

function stoppeTakt(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function start(): Promise<void> {
  if (!WURZEL) return;
  tage = tagesWahl();
  zeigeTor({ authEnabled: true, userId: null, allowlistSize: 0, fehler: null, laedt: true });

  auth = await AuthClient.create();
  if (!auth) {
    // Ohne VITE_SUPABASE_* gibt es im Client gar keinen Login-Pfad. Das ist
    // eine Bau-Konfiguration und nichts, was man zur Laufzeit reparieren kann.
    zeigeTor({
      authEnabled: false, userId: null, allowlistSize: 0, laedt: false,
      fehler: 'Dieser Client wurde ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY gebaut.'
    });
    return;
  }

  const session = await hole<AdminSession>('/admin/api/session').catch(() => null);
  if (!session || !session.isAdmin) {
    zeigeTor({
      authEnabled: session?.authEnabled ?? true,
      userId: session?.userId ?? null,
      allowlistSize: session?.allowlistSize ?? 0,
      fehler: null,
      laedt: false
    });
    return;
  }

  await laden();
  starteTakt();
  // Im Hintergrund nicht weiterpollen: Ein offener Tab soll den Server nicht
  // stundenlang befragen, nur weil ihn jemand vergessen hat. Beim Zurückkommen
  // wird sofort einmal geladen, damit man nie veraltete Zahlen ansieht.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void laden();
      starteTakt();
    } else {
      stoppeTakt();
    }
  });
}

void start();
