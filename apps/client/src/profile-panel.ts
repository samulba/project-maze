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
import { readLocalUnlocks } from './local-achievements';

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
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  /** Zweite Fläche: Die Galerie hat seit Befund 2 eine eigene Unterseite. */
  private readonly galerieHost: HTMLElement | null;
  /** Kurzhinweis am Navigationseintrag („GAST", „12 LÄUFE"). */
  private readonly summaryHint: HTMLElement | null;
  private readonly galerieHint: HTMLElement | null;
  private user: AuthUser | null = null;
  /** Verhindert, dass eine langsame Antwort ein neueres Konto überschreibt. */
  private ladelauf = 0;
  /** Vergibt der verbundene Server Erfolge? Bis zum welcome: optimistisch ja. */
  private serverAchievements = true;
  /** Zuletzt gezeigtes Profil – für den Neuaufbau der Galerie. */
  private letztesProfil: PublicProfile | null = null;

  constructor(
    root: HTMLElement,
    private readonly toast: ToastFn,
    private readonly onNameChanged: (name: string) => void
  ) {
    this.panel = root.querySelector<HTMLElement>('#start-profile')!;
    this.body = this.panel.querySelector<HTMLElement>('[data-profile-body]')!;
    this.galerieHost = root.querySelector<HTMLElement>('[data-achievements-body]');
    this.summaryHint = root.querySelector<HTMLElement>('[data-profile-hint]');
    this.galerieHint = root.querySelector<HTMLElement>('[data-achievements-hint]');
    // Die Galerie steht auch ohne Anmeldung – als Vorschau auf das, was es zu
    // holen gibt. Sie ist Katalogwissen und braucht keinen Server.
    this.zeigeGalerie(null);
    // Ohne konfigurierten Login wird `setUser` nie gerufen. Dann bleibt die
    // Profilfläche leer und die Seite erklärt selbst, warum.
    this.body.replaceChildren(this.absatz(
      'profile-guest',
      'Auf diesem Server ist keine Anmeldung eingerichtet. Du spielst als Gast – Läufe werden nicht gespeichert.'
    ));
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
    if (this.summaryHint) this.summaryHint.textContent = 'GAST';
    this.body.replaceChildren(this.absatz(
      'profile-guest',
      'Melde dich an, um Bestwerte, Spielzeit und freigeschaltete Achievements zu behalten. Spielen geht auch ohne.'
    ));
    this.zeigeGalerie(null);
  }

  /**
   * Vom welcome der Verbindung (Befund 60): Vergibt dieser Server überhaupt
   * Erfolge? Bei `false` bekommt die Galerie einen ehrlichen Satz, statt
   * sieben Bedingungen zu zeigen, auf die niemand hinspielen kann.
   */
  setServerAchievements(enabled: boolean): void {
    if (this.serverAchievements === enabled) return;
    this.serverAchievements = enabled;
    this.zeigeGalerie(this.letztesProfil);
  }

  private renderSignedIn(user: AuthUser, profil: PublicProfile | null): void {
    if (this.summaryHint) this.summaryHint.textContent = profil?.stats.runs ? `${profil.stats.runs} LÄUFE` : 'ANGEMELDET';
    const name = profil?.displayName ?? user.name ?? '';
    const teile: HTMLElement[] = [this.karte(name, profil)];
    if (profil) teile.push(this.werte(profil));
    else teile.push(this.absatz('profile-note', 'Noch keine Läufe gespeichert – spiel eine Runde, dann steht hier deine Bilanz.'));
    this.body.replaceChildren(...teile);
    this.zeigeGalerie(profil);
  }

  /**
   * Achievements-Seite. Ohne Profil steht dort die vollständige Galerie in
   * gesperrtem Zustand – der Katalog liegt im Client, und zu sehen, was es zu
   * holen gibt, ist für einen Gast wertvoller als eine leere Seite.
   */
  private zeigeGalerie(profil: PublicProfile | null): void {
    this.letztesProfil = profil;
    // Gäste sehen ihre lokal gemerkten Freischaltungen (Befund 49): Vorher
    // stand die Galerie eine Sekunde nach dem Gratulations-Popup wieder auf
    // 0/7. Mit Konto ist der Server die Autorität.
    const eintraege = achievementGallery(profil?.achievements ?? readLocalUnlocks());
    const offen = eintraege.filter((eintrag) => eintrag.unlockedAt !== null).length;
    if (this.galerieHint) this.galerieHint.textContent = `${offen} / ${eintraege.length}`;
    if (this.galerieHost) {
      const teile: HTMLElement[] = [];
      if (!this.serverAchievements) {
        // Befund 60: Ein Versprechen, das dieser Server nicht einlösen kann,
        // steht nicht kommentarlos auf der Seite.
        teile.push(this.absatz('profile-note', 'Dieser Server vergibt keine Achievements – die Galerie zeigt nur den Katalog.'));
      }
      teile.push(this.galerie(profil));
      this.galerieHost.replaceChildren(...teile);
    }
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

  private galerie(profil: PublicProfile | null): HTMLElement {
    // Dieselbe Quelle wie zeigeGalerie: Gäste zählen ihre lokalen Unlocks.
    const eintraege = achievementGallery(profil?.achievements ?? readLocalUnlocks());
    const offen = eintraege.filter((eintrag) => eintrag.unlockedAt !== null).length;
    const block = document.createElement('div');
    block.className = 'profile-achievements';

    // Auf der eigenen Seite trägt die Überschrift schon das Wort – hier steht
    // nur noch, wie weit man ist.
    const kopf = document.createElement('div');
    kopf.className = 'profile-section';
    const titel = document.createElement('span');
    titel.textContent = 'FREIGESCHALTET';
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
      // Der Weg dorthin steht jetzt sichtbar dabei, nicht nur im Tooltip: Auf
      // einer Seite, die „alles, was es zu holen gibt" verspricht, ist die
      // Bedingung die eigentliche Information.
      const wie = document.createElement('small');
      wie.textContent = eintrag.description;
      badge.append(symbol, name, wie);
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
