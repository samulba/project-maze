/**
 * Navigation des Startscreens (Sams Befund 2).
 *
 * Vorher stand alles auf einer Seite: Name, Play, Login, Profil mit
 * Achievements-Galerie, Bestenliste und ein Aufklapper mit Sound, Loadout,
 * Grafikstufe, Vollbild, Sichtfeld und Vorhersage. Sam dazu: „nicht alles auf
 * eine Seite reinballern."
 *
 * Jetzt trägt die Startseite **nur** Logo, Name und ARENA BETRETEN. Darunter
 * steht eine ruhige Zeile mit vier Wegen; jeder führt auf eine eigene Seite mit
 * einem Zurück-Pfeil. Der Weg ins Spiel wird dadurch keinen Klick länger – er
 * ist genau derselbe wie vorher.
 *
 * Diese Datei enthält die Logik: welche Seiten es gibt, welche gerade gilt und
 * was beim Zurückgehen passiert. Das DOM-Stück darunter hängt nur noch
 * Klassen und `hidden` daran.
 */

export const START_PAGES = ['start', 'profil', 'achievements', 'bestenliste', 'einstellungen'] as const;
export type StartPage = (typeof START_PAGES)[number];

export interface StartPageInfo {
  id: StartPage;
  /** Beschriftung in der Navigation und Überschrift der Seite. */
  label: string;
  /** Eine Zeile darunter – sagt, was einen erwartet, bevor man klickt. */
  hint: string;
}

/**
 * Reihenfolge der Navigation. Bewusst nach Nähe zum Spieler sortiert: erst was
 * mir gehört (Profil, Achievements), dann der Vergleich mit anderen
 * (Bestenliste), dann die Technik.
 */
export const START_NAV: readonly StartPageInfo[] = [
  { id: 'profil', label: 'Profil', hint: 'Konto, Bestwerte, Anzeigename' },
  { id: 'achievements', label: 'Achievements', hint: 'Alles, was es zu holen gibt' },
  { id: 'bestenliste', label: 'Bestenliste', hint: 'Die besten Läufe' },
  { id: 'einstellungen', label: 'Einstellungen', hint: 'Sound, Grafik, Sichtfeld, Loadout' }
];

export function isStartPage(value: unknown): value is StartPage {
  return typeof value === 'string' && (START_PAGES as readonly string[]).includes(value);
}

/** Unbekannte Ziele führen zur Startseite, nicht ins Leere. */
export function resolvePage(raw: unknown): StartPage {
  return isStartPage(raw) ? raw : 'start';
}

/**
 * Die Navigation ist genau eine Ebene tief – von jeder Unterseite geht es
 * zurück zum Start, nirgends tiefer. Das ist Absicht: Ein Startscreen mit
 * Verlaufsstapel wäre ein zweites Problem, kein gelöstes erstes.
 */
export function pageAfterBack(): StartPage {
  return 'start';
}

export interface StartNavHost {
  /** Wurzel, in der die Seiten und die Navigation liegen. */
  root: HTMLElement;
}

/**
 * Hängt die Navigation an das Markup aus `ui.ts`.
 *
 * Kein eigenes Markup: Die Seiten stehen bereits im DOM, hier werden nur
 * `hidden` und die aktive Markierung gesetzt. Damit bleibt der Startscreen
 * ohne JavaScript-Fehler benutzbar, falls eine Seite fehlt.
 */
export class StartNav {
  private current: StartPage = 'start';
  private readonly pages = new Map<StartPage, HTMLElement>();
  private readonly buttons = new Map<StartPage, HTMLElement>();
  private readonly listeners: Array<(page: StartPage) => void> = [];

  constructor(root: HTMLElement) {
    for (const id of START_PAGES) {
      const page = root.querySelector<HTMLElement>(`[data-view="${id}"]`);
      if (page) this.pages.set(id, page);
    }
    for (const button of root.querySelectorAll<HTMLElement>('[data-goto]')) {
      const ziel = resolvePage(button.dataset.goto);
      this.buttons.set(ziel, button);
      button.addEventListener('click', () => this.go(ziel));
    }
    for (const button of root.querySelectorAll<HTMLElement>('[data-back]')) {
      button.addEventListener('click', () => this.go(pageAfterBack()));
    }
    // Escape führt zurück – auf einer Unterseite erwartet man das, und es ist
    // der kürzeste Weg zurück zum Play-Knopf.
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.current !== 'start') {
        event.preventDefault();
        this.go(pageAfterBack());
      }
    });
    this.apply();
  }

  get page(): StartPage { return this.current; }

  go(page: StartPage): void {
    const ziel = resolvePage(page);
    if (ziel === this.current) return;
    this.current = ziel;
    this.apply();
    for (const listener of this.listeners) listener(ziel);
  }

  onChange(listener: (page: StartPage) => void): void {
    this.listeners.push(listener);
  }

  /** Beschriftung rechts am Navigationseintrag – etwa „GAST" oder „Top 10". */
  setBadge(page: StartPage, text: string): void {
    const badge = this.buttons.get(page)?.querySelector<HTMLElement>('[data-nav-badge]');
    if (badge) badge.textContent = text;
  }

  private apply(): void {
    for (const [id, element] of this.pages) element.hidden = id !== this.current;
    for (const [id, button] of this.buttons) {
      button.classList.toggle('is-active', id === this.current);
    }
    // Der Fokus muss mitwandern, sonst hängt er auf einem Knopf, den man nicht
    // mehr sieht – und die Tastatur landet im Nichts.
    const ziel = this.pages.get(this.current);
    ziel?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }
}
