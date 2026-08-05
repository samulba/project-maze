import { MAX_NAME_LENGTH, type AuthUser } from './auth';
import { formatScore } from './start-leaderboard';
import {
  achievementGallery,
  favoriteClassLine,
  formatMemberSince,
  formatPlaytime,
  profileUpdateUrl,
  profileUrl,
  updateMessage,
  usableProfile,
  type PublicProfile
} from './profile';

export type ToastFn = (title: string, message: string, tone: 'normal' | 'danger' | 'success') => void;

/**
 * Profil-Panel auf dem Startscreen (K2).
 *
 * Gast: ein einziger, leiser Satz – der Login-Knopf steht schon darüber, ein
 * zweiter Aufruf wäre Werbung. Angemeldet: Profilkarte, Bestwerte und die
 * Achievements-Galerie.
 *
 * Kein Profil beim Server (frisches Konto, Persistenz aus, Zeitüberschreitung)
 * heißt: Karte mit Namen, aber ohne Zahlen. Ein Fehlertext auf dem Startscreen
 * beschreibt einen Zustand, den niemand beheben kann.
 */
export class ProfilePanel {
  private readonly panel: HTMLDetailsElement;
  private readonly body: HTMLElement;
  private readonly summaryHint: HTMLElement;
  private user: AuthUser | null = null;
  /** Verhindert, dass eine langsame Antwort ein neueres Konto überschreibt. */
  private ladelauf = 0;

  constructor(
    root: HTMLElement,
    private readonly toast: ToastFn,
    private readonly onNameChanged: (name: string) => void
  ) {
    this.panel = root.querySelector<HTMLDetailsElement>('#start-profile')!;
    this.body = this.panel.querySelector<HTMLElement>('[data-profile-body]')!;
    this.summaryHint = this.panel.querySelector<HTMLElement>('[data-profile-hint]')!;
    this.panel.open = window.matchMedia('(min-width: 901px)').matches;
    // Bleibt versteckt, bis `setUser` es zeigt. Ohne konfigurierten Login wird
    // das nie aufgerufen – dann gäbe es hier einen Hinweis auf eine Anmeldung,
    // die es gar nicht gibt.
    this.panel.hidden = true;
  }

  /** Anmeldung hat sich geändert – Panel neu aufbauen und Profil holen. */
  setUser(user: AuthUser | null, fetchImpl: typeof fetch = fetch.bind(window)): void {
    this.user = user;
    this.ladelauf += 1;
    const lauf = this.ladelauf;
    if (!user) {
      this.renderGuest();
      return;
    }
    this.panel.hidden = false;
    this.renderSignedIn(user, null);
    void this.load(user, lauf, fetchImpl);
  }

  private async load(user: AuthUser, lauf: number, fetchImpl: typeof fetch): Promise<void> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetchImpl(profileUrl(window.location, import.meta.env.DEV, user.id), {
        signal: controller.signal,
        headers: { accept: 'application/json' }
      });
      if (!response.ok) return;
      const profil = usableProfile(await response.json());
      // Zwischenzeitlich abgemeldet oder Konto gewechselt: Antwort verwerfen.
      if (!profil || lauf !== this.ladelauf) return;
      this.renderSignedIn(user, profil);
    } catch {
      /* Kein Netz, keine Persistenz, Zeitüberschreitung: Karte bleibt ohne Zahlen. */
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private renderGuest(): void {
    this.panel.hidden = false;
    this.panel.open = false;
    this.summaryHint.textContent = 'GAST';
    this.body.replaceChildren(this.absatz(
      'profile-guest',
      'Melde dich an, um Bestwerte, Spielzeit und freigeschaltete Achievements zu sehen.'
    ));
  }

  private renderSignedIn(user: AuthUser, profil: PublicProfile | null): void {
    this.summaryHint.textContent = profil?.stats.runs ? `${profil.stats.runs} LÄUFE` : 'ANGEMELDET';
    const name = profil?.displayName ?? user.name ?? '';
    const teile: HTMLElement[] = [this.karte(name, profil)];
    if (profil) {
      teile.push(this.werte(profil), this.galerie(profil));
    } else {
      teile.push(this.absatz('profile-note', 'Noch keine Läufe gespeichert – spiel eine Runde, dann steht hier deine Bilanz.'));
    }
    this.body.replaceChildren(...teile);
  }

  /** Kopf der Karte: Anzeigename (änderbar), Mitglied seit, Lieblingsklasse. */
  private karte(name: string, profil: PublicProfile | null): HTMLElement {
    const karte = document.createElement('div');
    karte.className = 'profile-card';

    const form = document.createElement('form');
    form.className = 'profile-name';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = 'ANZEIGENAME';
    label.htmlFor = 'profile-name-input';
    const eingabe = document.createElement('input');
    eingabe.id = 'profile-name-input';
    eingabe.maxLength = MAX_NAME_LENGTH;
    eingabe.autocomplete = 'off';
    eingabe.value = name;
    const speichern = document.createElement('button');
    speichern.type = 'submit';
    speichern.className = 'profile-save';
    speichern.textContent = 'SPEICHERN';
    form.append(label, eingabe, speichern);
    form.addEventListener('submit', (ereignis) => {
      ereignis.preventDefault();
      void this.speichereNamen(eingabe, speichern);
    });
    karte.append(form);

    const zeilen: string[] = [];
    const seit = formatMemberSince(profil?.memberSince ?? null);
    if (seit) zeilen.push(seit);
    const klasse = profil ? favoriteClassLine(profil.stats) : null;
    if (klasse) zeilen.push(klasse);
    if (zeilen.length > 0) karte.append(this.absatz('profile-meta', zeilen.join(' · ')));
    return karte;
  }

  private werte(profil: PublicProfile): HTMLElement {
    const raster = document.createElement('div');
    raster.className = 'profile-stats';
    const werte: [string, string][] = [
      ['Bestscore', formatScore(profil.stats.bestScore)],
      ['Bestes Level', String(profil.stats.bestLevel)],
      ['Kills gesamt', formatScore(profil.stats.totalKills)],
      ['Beste Serie', String(profil.stats.bestStreak)],
      ['Längster Lauf', formatPlaytime(profil.stats.longestRunSeconds)],
      ['Spielzeit', formatPlaytime(profil.stats.totalSeconds)]
    ];
    for (const [titel, wert] of werte) {
      const zelle = document.createElement('div');
      const beschriftung = document.createElement('span');
      const zahl = document.createElement('b');
      beschriftung.textContent = titel;
      zahl.textContent = wert;
      zelle.append(beschriftung, zahl);
      raster.append(zelle);
    }
    return raster;
  }

  private galerie(profil: PublicProfile): HTMLElement {
    const eintraege = achievementGallery(profil.achievements);
    const offen = eintraege.filter((eintrag) => eintrag.unlockedAt !== null).length;
    const block = document.createElement('div');
    block.className = 'profile-achievements';

    const kopf = document.createElement('div');
    kopf.className = 'profile-section';
    const titel = document.createElement('span');
    titel.textContent = 'ACHIEVEMENTS';
    const stand = document.createElement('small');
    stand.textContent = `${offen} / ${eintraege.length}`;
    kopf.append(titel, stand);
    block.append(kopf);

    const raster = document.createElement('div');
    raster.className = 'profile-badges';
    for (const eintrag of eintraege) {
      const badge = document.createElement('div');
      badge.className = eintrag.unlockedAt ? 'profile-badge unlocked' : 'profile-badge';
      badge.title = eintrag.unlockedAt ? eintrag.description : `Noch offen: ${eintrag.description}`;
      const symbol = document.createElement('i');
      symbol.textContent = eintrag.unlockedAt ? '★' : '·';
      const name = document.createElement('span');
      name.textContent = eintrag.name;
      badge.append(symbol, name);
      raster.append(badge);
    }
    block.append(raster);
    return block;
  }

  private absatz(klasse: string, text: string): HTMLElement {
    const element = document.createElement('p');
    element.className = klasse;
    element.textContent = text;
    return element;
  }

  /**
   * Namensänderung. Der Server antwortet `202` („angenommen, noch nicht
   * geschrieben") – die Anzeige übernimmt das optimistisch, weil ein Warten
   * auf den nächsten Flush für den Spieler wie ein Fehler aussähe.
   */
  private async speichereNamen(eingabe: HTMLInputElement, knopf: HTMLButtonElement): Promise<void> {
    const user = this.user;
    if (!user || knopf.disabled) return;
    const wunsch = eingabe.value.trim();
    if (!wunsch) {
      this.toast('Name fehlt', 'Gib einen Namen ein, bevor du speicherst.', 'danger');
      return;
    }
    knopf.disabled = true;
    try {
      const token = await this.tokenGeber();
      if (!token) {
        this.toast('Nicht angemeldet', 'Melde dich neu an und versuche es noch einmal.', 'danger');
        return;
      }
      const response = await fetch(profileUpdateUrl(window.location, import.meta.env.DEV), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName: wunsch })
      });
      const meldung = updateMessage(response.status);
      this.toast(meldung.title, meldung.text, meldung.ok ? 'success' : 'danger');
      if (!meldung.ok) return;
      // Der Server bereinigt den Namen (18 Zeichen, keine Steuerzeichen) –
      // angezeigt wird, was er zurückgibt, nicht was getippt wurde.
      const bereinigt = await response.json().then(
        (daten: { displayName?: unknown }) => (typeof daten.displayName === 'string' ? daten.displayName : wunsch),
        () => wunsch
      );
      eingabe.value = bereinigt;
      this.onNameChanged(bereinigt);
    } catch {
      this.toast('Nicht gespeichert', 'Der Server war gerade nicht erreichbar.', 'danger');
    } finally {
      knopf.disabled = false;
    }
  }

  /** Wird von außen gesetzt – das Panel kennt Supabase nicht. */
  private tokenGeber: () => Promise<string | null> = async () => null;

  setTokenProvider(provider: () => Promise<string | null>): void {
    this.tokenGeber = provider;
  }
}
