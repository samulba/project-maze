import type { AuthClient, AuthUser } from './auth';

/**
 * Login-Zeile auf dem Startscreen. Bewusst leise: „ARENA BETRETEN“ bleibt die
 * eine große Aktion, der Login ist ein Angebot daneben.
 *
 * Der Container bleibt ausgeblendet, bis ein konfigurierter Client existiert –
 * ein Knopf, der nichts tun kann, wäre schlimmer als kein Knopf.
 */

/** Offizielles Google-„G“ als Inline-SVG (keine externen Requests im Artifact-Sinn). */
const GOOGLE_MARK = `
  <svg viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>`;

export type ToastFn = (title: string, message: string, tone: 'normal' | 'danger' | 'success') => void;

export class AuthPanel {
  private readonly host: HTMLElement;
  private busy = false;

  constructor(
    root: HTMLElement,
    private readonly auth: AuthClient,
    private readonly toast: ToastFn,
    private readonly prefillName: (name: string) => void
  ) {
    this.host = root.querySelector<HTMLElement>('#start-auth')!;
    this.host.hidden = false;
    this.render(this.auth.user);
    this.auth.onChange((user) => this.render(user));
  }

  private render(user: AuthUser | null): void {
    this.host.replaceChildren();
    if (user) {
      // Der Google-Name ist ein Vorschlag, kein Zwang: Wer schon getippt hat,
      // behält seinen Namen.
      if (user.name) this.prefillName(user.name);

      const label = document.createElement('span');
      label.className = 'start-auth-user';
      const who = document.createElement('b');
      who.textContent = user.name || user.email || 'Angemeldet';
      label.append('Angemeldet als ', who);

      const signOut = document.createElement('button');
      signOut.type = 'button';
      signOut.className = 'start-auth-link';
      signOut.textContent = 'Abmelden';
      signOut.addEventListener('click', () => void this.run(
        () => this.auth.signOut(),
        'Abmelden fehlgeschlagen'
      ));

      this.host.append(label, signOut);
      return;
    }

    const signIn = document.createElement('button');
    signIn.type = 'button';
    signIn.className = 'start-auth-button';
    signIn.innerHTML = `${GOOGLE_MARK}<span>Mit Google anmelden</span>`;
    signIn.addEventListener('click', () => void this.run(
      () => this.auth.signIn(),
      'Anmeldung fehlgeschlagen'
    ));

    const hint = document.createElement('small');
    hint.className = 'start-auth-hint';
    hint.textContent = 'optional – als Gast spielen geht immer';

    this.host.append(signIn, hint);
  }

  /**
   * Fehler beim Login sind nie fatal: Sie erzeugen einen Hinweis, danach ist
   * der Startscreen unverändert benutzbar und der Gast-Weg offen.
   */
  private async run(action: () => Promise<void>, failureTitle: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.host.classList.add('is-busy');
    try {
      await action();
    } catch (error) {
      console.error(failureTitle, error);
      this.toast(failureTitle, 'Du kannst trotzdem als Gast spielen.', 'danger');
    } finally {
      this.busy = false;
      this.host.classList.remove('is-busy');
    }
  }
}
