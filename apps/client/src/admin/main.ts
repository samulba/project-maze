import { AuthClient } from '../auth';
import './admin.css';
import { renderPortal, renderTor, TAFELN, type BacklogAntwort, type TafelName, type ViewState } from './view';
import { icon } from './icons';
import { zahl } from './format';
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
 *
 * ## Was hier über das reine Laden hinaus passiert
 *
 * Das Portal zeichnet sich alle zwanzig Sekunden neu, und zwar komplett. Das
 * ist die einfachste Art, Zahlen aktuell zu halten – und sie hat einen Preis,
 * den man bezahlen muss statt ihn zu ignorieren: Alles, was der Mensch vor dem
 * Bildschirm gerade eingestellt hat, läge sonst danach zurückgesetzt da. Die
 * offene Tafel, ein halb getippter Suchbegriff samt Schreibmarke, der gewählte
 * Filter in Sams Liste. Diese Dinge stehen deshalb hier in Modulvariablen und
 * werden nach jedem Zeichnen wieder angelegt (`stelleWiederHer`).
 */

const WURZEL = document.querySelector<HTMLElement>('#admin-root');
/** Wie oft nachgeladen wird. Kurz genug für „läuft es gerade", lang genug
 *  für die 15-Sekunden-Zwischenspeicherung des Servers. */
const INTERVALL_MS = 20_000;

let auth: AuthClient | null = null;
let tage = 30;
let sortierung: 'new' | 'active' = 'active';
let tafel: TafelName = 'uebersicht';
let suchtext = '';
let standFilter = 'alle';
let konto: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let laeuft = false;

const TAFEL_NAMEN = new Set<string>(TAFELN.map((eintrag) => eintrag.name));

const tagesWahl = (): number => {
  const gespeichert = Number.parseInt(window.localStorage.getItem('mazers-admin-tage') ?? '', 10);
  return [7, 14, 30, 90].includes(gespeichert) ? gespeichert : 30;
};

/**
 * Welche Tafel offen ist, steht in der Adresse.
 *
 * Nicht aus Prinzip, sondern weil ein Portal, das man mit einem Lesezeichen auf
 * „Sams Liste" öffnen kann, ein anderes Werkzeug ist als eines, das immer bei
 * der Übersicht anfängt. Der Zurück-Knopf des Browsers tut nebenbei das
 * Erwartbare.
 */
const tafelAusAdresse = (): TafelName => {
  const roh = window.location.hash.replace(/^#\/?/, '');
  return TAFEL_NAMEN.has(roh) ? (roh as TafelName) : 'uebersicht';
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
    const beschriftung = knopf.querySelector('span');
    void navigator.clipboard.writeText(zustand.userId ?? '').then(() => {
      if (beschriftung) beschriftung.textContent = 'kopiert';
      window.setTimeout(() => { if (beschriftung) beschriftung.textContent = 'ID kopieren'; }, 1800);
    }).catch(() => { if (beschriftung) beschriftung.textContent = 'ging nicht – von Hand markieren'; });
  });
}

/**
 * Das Gerüst, solange die erste Antwort unterwegs ist.
 *
 * Ein leerer Bildschirm mit „lädt" darunter sagt nichts darüber, was gleich
 * kommt. Die Platzhalter haben die Maße der echten Kacheln, damit beim
 * Eintreffen der Zahlen nichts springt.
 */
function zeigeSkelett(): void {
  if (!WURZEL) return;
  const reihe = (anzahl: number, hoehe: number): string =>
    `<div class="skelett-reihe">${Array.from({ length: anzahl }, () => `<div class="skelett-block" style="--h:${hoehe}px"></div>`).join('')}</div>`;
  WURZEL.innerHTML = `<div class="portal" data-offen="uebersicht">
    <aside class="seitenleiste">
      <div class="marken-block">
        <span class="marken-glyphe" aria-hidden="true">M</span>
        <span class="marken-text"><b>MAZERS</b><i>Zentrale</i></span>
      </div>
      <div class="skelett">${reihe(1, 34)}${reihe(1, 34)}${reihe(1, 34)}</div>
    </aside>
    <div class="haupt">
      <main class="inhalt">
        <div class="skelett" aria-busy="true" aria-label="Zahlen werden geladen">
          ${reihe(4, 112)}${reihe(4, 112)}${reihe(1, 300)}
        </div>
      </main>
    </div>
  </div>`;
}

/** Eine Meldung unten rechts, die von selbst wieder geht. */
let meldungsTimer: ReturnType<typeof setTimeout> | null = null;
function melde(text: string): void {
  document.querySelector('.meldung')?.remove();
  const knoten = document.createElement('div');
  knoten.className = 'meldung';
  knoten.setAttribute('role', 'status');
  knoten.innerHTML = `${icon('warnung')}<span></span>`;
  knoten.querySelector('span')!.textContent = text;
  document.body.append(knoten);
  if (meldungsTimer) clearTimeout(meldungsTimer);
  meldungsTimer = setTimeout(() => knoten.remove(), 6000);
}

/* ------------------------------------------------------------------ *
 * Verdrahtung
 * ------------------------------------------------------------------ */

function zeigeTafel(ziel: TafelName): void {
  if (!WURZEL) return;
  tafel = ziel;
  const portal = WURZEL.querySelector<HTMLElement>('.portal');
  if (!portal) return;
  portal.dataset['offen'] = ziel;
  portal.removeAttribute('data-navi');
  portal.querySelector<HTMLElement>('.navi-schleier')?.setAttribute('hidden', '');
  for (const abschnitt of portal.querySelectorAll<HTMLElement>('.tafel')) {
    abschnitt.toggleAttribute('hidden', abschnitt.dataset['tafel'] !== ziel);
  }
  for (const knopf of portal.querySelectorAll<HTMLButtonElement>('[data-ziel]')) {
    knopf.setAttribute('aria-current', String(knopf.dataset['ziel'] === ziel));
  }
  if (window.location.hash !== `#/${ziel}`) window.history.replaceState(null, '', `#/${ziel}`);
  // Beim Wechsel nach oben – sonst steht man auf einer frischen Tafel mitten
  // im Text, weil die vorherige länger war.
  window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
}

/** Die Suche filtert die schon geladenen Zeilen – kein Rundgang zum Server. */
function wendeSucheAn(): void {
  if (!WURZEL) return;
  const begriff = suchtext.trim().toLowerCase();
  const zeilen = WURZEL.querySelectorAll<HTMLTableRowElement>('.tabelle-spieler tbody tr');
  let sichtbar = 0;
  for (const zeile of zeilen) {
    const passt = begriff === '' || (zeile.dataset['suche'] ?? '').includes(begriff);
    zeile.toggleAttribute('hidden', !passt);
    if (passt) sichtbar += 1;
  }
  const bilanz = WURZEL.querySelector<HTMLElement>('#spieler-bilanz');
  if (bilanz) {
    const gesamt = Number(bilanz.dataset['gesamt'] ?? 0);
    const sortiert = bilanz.dataset['sortierung'] ?? '';
    bilanz.textContent = begriff === ''
      ? `${zahl(zeilen.length)} von ${zahl(gesamt)} Geräten, sortiert nach ${sortiert}.`
      : `${zahl(sichtbar)} von ${zahl(zeilen.length)} geladenen Geräten passen zu „${suchtext.trim()}".`;
  }
}

/** Der Filter in Sams Liste blendet Einträge aus – und leere Gruppen gleich mit. */
function wendeStandFilterAn(): void {
  if (!WURZEL) return;
  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-stand-filter]')) {
    const an = knopf.dataset['standFilter'] === standFilter;
    knopf.classList.toggle('an', an);
    knopf.setAttribute('aria-pressed', String(an));
  }
  for (const gruppe of WURZEL.querySelectorAll<HTMLElement>('.wunsch-gruppe')) {
    let sichtbar = 0;
    for (const eintrag of gruppe.querySelectorAll<HTMLElement>('.wunsch')) {
      const passt = standFilter === 'alle' || eintrag.dataset['stand'] === standFilter;
      eintrag.toggleAttribute('hidden', !passt);
      if (passt) sichtbar += 1;
    }
    gruppe.toggleAttribute('hidden', sichtbar === 0);
  }
}

/**
 * Der Tooltip am Verlauf.
 *
 * Vorher stand hier nur ein `<title>` im SVG: Der Browser blendet den nach rund
 * einer Sekunde ein, an der Mausspitze, in Systemschrift. Für ein Diagramm, an
 * dem man entlangfährt, ist das unbrauchbar – man wartet an jedem Tag neu.
 * Jetzt steht die Karte sofort und über der Säule, zu der sie gehört. Das
 * `<title>` bleibt trotzdem im Markup: Es ist der Text, den Vorleseprogramme
 * bekommen.
 */
function verdrahteVerlauf(): void {
  if (!WURZEL) return;
  const flaeche = WURZEL.querySelector<HTMLElement>('.verlauf-flaeche');
  const tipp = flaeche?.querySelector<HTMLElement>('.verlauf-tipp');
  const svg = flaeche?.querySelector('svg');
  if (!flaeche || !tipp || !svg) return;

  const verstecke = (): void => {
    tipp.hidden = true;
    for (const gruppe of svg.querySelectorAll('.saeule')) gruppe.classList.remove('an');
  };

  for (const gruppe of svg.querySelectorAll<SVGGElement>('.saeule')) {
    const zeige = (): void => {
      for (const andere of svg.querySelectorAll('.saeule')) andere.classList.remove('an');
      gruppe.classList.add('an');
      const d = gruppe.dataset;
      tipp.innerHTML = `<b></b><dl>
        <div><dt><i class="punkt alt"></i>wiederkehrend</dt><dd>${zahl(Number(d['spieler'] ?? 0) - Number(d['neu'] ?? 0))}</dd></div>
        <div><dt><i class="punkt neu"></i>neu</dt><dd>${zahl(Number(d['neu'] ?? 0))}</dd></div>
        <div><dt>Besuche</dt><dd>${zahl(Number(d['besuche'] ?? 0))}</dd></div>
        <div><dt>Runden</dt><dd>${zahl(Number(d['runden'] ?? 0))}</dd></div>
      </dl>`;
      tipp.querySelector('b')!.textContent = d['tag'] ?? '';
      tipp.hidden = false;
      // Die Mitte kommt als Anteil der viewBox-Breite, nicht als Pixelwert:
      // Das SVG skaliert mit der Spalte, ein Pixelwert wäre nach dem ersten
      // Fensterwechsel falsch.
      const breite = flaeche.clientWidth;
      const roh = Number(d['mitte'] ?? 0.5) * breite;
      const halb = tipp.offsetWidth / 2;
      tipp.style.left = `${Math.min(breite - halb - 4, Math.max(halb + 4, roh))}px`;
    };
    gruppe.addEventListener('pointerenter', zeige);
    gruppe.addEventListener('focus', zeige);
    gruppe.setAttribute('tabindex', '0');
  }
  flaeche.addEventListener('pointerleave', verstecke);
  svg.addEventListener('focusout', verstecke);
}

function verdrahtePortal(): void {
  if (!WURZEL) return;

  WURZEL.querySelector('#neu')?.addEventListener('click', (ereignis) => {
    (ereignis.currentTarget as HTMLElement).classList.add('laedt');
    void laden();
  });
  WURZEL.querySelector('#abmelden')?.addEventListener('click', () => {
    void auth?.signOut().then(() => window.location.reload());
  });

  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-ziel]')) {
    knopf.addEventListener('click', () => zeigeTafel(knopf.dataset['ziel'] as TafelName));
  }

  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-tage]')) {
    knopf.addEventListener('click', () => {
      tage = Number(knopf.dataset['tage']);
      window.localStorage.setItem('mazers-admin-tage', String(tage));
      void laden();
    });
  }

  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-sort]')) {
    knopf.addEventListener('click', () => {
      sortierung = knopf.dataset['sort'] === 'new' ? 'new' : 'active';
      void laden();
    });
  }

  for (const knopf of WURZEL.querySelectorAll<HTMLButtonElement>('[data-stand-filter]')) {
    knopf.addEventListener('click', () => {
      standFilter = knopf.dataset['standFilter'] ?? 'alle';
      wendeStandFilterAn();
    });
  }

  const suche = WURZEL.querySelector<HTMLInputElement>('#spieler-suche');
  suche?.addEventListener('input', () => {
    suchtext = suche.value;
    wendeSucheAn();
  });

  // Schmale Bildschirme: Die Seitenleiste fährt über den Inhalt.
  const portal = WURZEL.querySelector<HTMLElement>('.portal');
  const schleier = WURZEL.querySelector<HTMLElement>('.navi-schleier');
  WURZEL.querySelector('#navi-auf')?.addEventListener('click', () => {
    if (!portal) return;
    portal.dataset['navi'] = 'auf';
    schleier?.removeAttribute('hidden');
  });
  schleier?.addEventListener('click', () => {
    portal?.removeAttribute('data-navi');
    schleier.setAttribute('hidden', '');
  });

  verdrahteVerlauf();
}

/**
 * Nach dem Zeichnen alles zurücklegen, was der Mensch eingestellt hatte.
 * Reihenfolge zählt: erst die Tafel (sie blendet ganze Abschnitte ein), dann
 * die Filter innerhalb der Abschnitte.
 */
function stelleWiederHer(fokusSuche: { start: number | null; ende: number | null } | null): void {
  if (!WURZEL) return;
  zeigeTafel(tafel);
  const suche = WURZEL.querySelector<HTMLInputElement>('#spieler-suche');
  if (suche && suchtext) {
    suche.value = suchtext;
    if (fokusSuche) {
      suche.focus();
      suche.setSelectionRange(fokusSuche.start, fokusSuche.ende);
    }
  }
  wendeSucheAn();
  wendeStandFilterAn();
}

async function laden(): Promise<void> {
  if (!WURZEL || laeuft) return;
  laeuft = true;
  // Wer gerade tippt, soll weitertippen können: Position der Schreibmarke
  // merken, sonst steht sie nach dem Zeichnen am Anfang.
  const aktiv = document.activeElement as HTMLInputElement | null;
  const fokusSuche = aktiv?.id === 'spieler-suche'
    ? { start: aktiv.selectionStart, ende: aktiv.selectionEnd }
    : null;
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
      backlog,
      tafel,
      konto
    };
    WURZEL.innerHTML = renderPortal(state);
    verdrahtePortal();
    stelleWiederHer(fokusSuche);
  } catch (error) {
    // Ein Fehler beim Nachladen darf die Seite nicht leeren – sonst steht Sam
    // bei einem kurzen Netzhänger vor einem weißen Portal. Nur beim allerersten
    // Laden gibt es nichts zu behalten.
    const nachricht = error instanceof Error ? error.message : String(error);
    if (WURZEL.childElementCount === 0 || WURZEL.querySelector('.tor') || WURZEL.querySelector('[aria-busy]')) {
      zeigeTor({ authEnabled: true, userId: null, allowlistSize: 0, fehler: nachricht, laedt: false });
    } else {
      melde(`Aktualisierung fehlgeschlagen: ${nachricht}`);
      WURZEL.querySelector('.fuss')?.classList.add('fehler');
    }
  } finally {
    laeuft = false;
    WURZEL.querySelector('#neu')?.classList.remove('laedt');
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
  tafel = tafelAusAdresse();
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

  konto = session.displayName ?? null;
  zeigeSkelett();
  await laden();
  starteTakt();

  // Der Zurück-Knopf soll zwischen den Tafeln zurückgehen, nicht die Seite
  // verlassen.
  window.addEventListener('hashchange', () => {
    const ziel = tafelAusAdresse();
    if (ziel !== tafel) zeigeTafel(ziel);
  });

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
