import { type PlayerClass } from '@project-maze/shared';
import { ClassWheel, renderClassCard, type WheelSelection } from './class-wheel';

/**
 * Die beiden Orte, an denen das Rad steht (MASTERPLAN KL3).
 *
 * `ClassCodex` ist die Enzyklopädie auf dem Startscreen – Ruhe, Platz, zum
 * Lesen. `ClassOverlay` ist dasselbe Rad im Spiel auf Taste `C` – schnell auf,
 * schnell zu, und **ohne das Spiel anzuhalten**.
 *
 * Der Unterschied ist nur der Rahmen. Das Rad selbst kommt aus `class-wheel.ts`
 * und ist beide Male dasselbe Bauteil.
 */

/** Gemeinsamer Aufbau: Rad links, Karte rechts (auf schmalen Schirmen untereinander). */
function baueRahmen(klasse: string): { wurzel: HTMLElement; radHost: HTMLElement; kartenHost: HTMLElement } {
  const wurzel = document.createElement('div');
  wurzel.className = klasse;
  const radHost = document.createElement('div');
  radHost.className = 'codex-wheel';
  const kartenHost = document.createElement('div');
  kartenHost.className = 'codex-card';
  wurzel.append(radHost, kartenHost);
  return { wurzel, radHost, kartenHost };
}

export class ClassCodex {
  private readonly wheel: ClassWheel;
  private readonly kartenHost: HTMLElement;

  constructor(host: HTMLElement) {
    const { wurzel, radHost, kartenHost } = baueRahmen('codex');
    this.kartenHost = kartenHost;
    this.wheel = new ClassWheel((auswahl) => this.zeige(auswahl));
    radHost.append(this.wheel.element);
    host.replaceChildren(wurzel);
  }

  private zeige(auswahl: WheelSelection): void {
    this.kartenHost.replaceChildren(renderClassCard(auswahl));
  }
}

/**
 * Das Rad im Spiel.
 *
 * Drei Dinge, die aus der UI-Fehlersuche kommen und hier von Anfang an gelten:
 *
 * 1. **Es hält das Spiel nicht an.** Der Server läuft weiter, die Eingabe auch.
 * 2. **Es schluckt keine Klicks, die ins Spielfeld gehören.** Die Fläche ist
 *    durchlässig; nur das Rad selbst, die Karte und der Schließen-Knopf nehmen
 *    Klicks. Genau der Fehler, der bei der Klassenwahl 35 % des Bildes
 *    lahmgelegt hat.
 * 3. **Es baut sich einmal auf.** Geöffnet wird durch Einblenden, nicht durch
 *    Neuzeichnen – ein Overlay, das mitten im Gefecht 90 SVG-Knoten anlegt,
 *    wäre ein Ruckler an der schlechtesten Stelle.
 */
export class ClassOverlay {
  private readonly wurzel: HTMLElement;
  private readonly wheel: ClassWheel;
  private readonly kartenHost: HTMLElement;
  private offen = false;

  constructor(host: HTMLElement, private readonly onToggle?: (offen: boolean) => void) {
    const { wurzel, radHost, kartenHost } = baueRahmen('class-overlay codex');
    this.wurzel = wurzel;
    this.kartenHost = kartenHost;
    this.wurzel.hidden = true;
    this.wurzel.setAttribute('role', 'dialog');
    this.wurzel.setAttribute('aria-label', 'Klassenbaum');

    // Auf Touch gibt es kein `C` – dort schließt ein Tipp auf die Fläche.
    this.wurzel.addEventListener('pointerdown', (ereignis) => {
      if (ereignis.target === this.wurzel) this.setOpen(false);
    });

    const schliessen = document.createElement('button');
    schliessen.type = 'button';
    schliessen.className = 'class-overlay-close';
    schliessen.setAttribute('aria-label', 'Klassenbaum schließen');
    schliessen.textContent = '✕';
    schliessen.addEventListener('click', () => this.setOpen(false));

    const fuss = document.createElement('p');
    fuss.className = 'class-overlay-hint';
    // Auf Touch tritt die Bedienung mit zurück (class-tree.css) – dann muss
    // der Hinweis das auch sagen, statt etwas zu versprechen, was nicht gilt.
    fuss.textContent = window.matchMedia('(pointer: coarse)').matches
      ? 'Tippen zum Schließen · die Arena läuft weiter, du fährst nicht'
      : 'C oder Esc schließt · das Spiel läuft weiter';

    this.wheel = new ClassWheel((auswahl) => this.zeige(auswahl));
    radHost.append(this.wheel.element);
    kartenHost.append(fuss);
    this.wurzel.append(schliessen);
    host.append(this.wurzel);
  }

  get isOpen(): boolean { return this.offen; }

  setOpen(offen: boolean): void {
    if (offen === this.offen) return;
    this.offen = offen;
    this.wurzel.hidden = !offen;
    this.onToggle?.(offen);
  }

  toggle(): void { this.setOpen(!this.offen); }

  /** Klasse des Spielers – hebt den eigenen Pfad hervor. */
  setCurrent(playerClass: PlayerClass): void {
    this.wheel.setCurrent(playerClass);
  }

  private zeige(auswahl: WheelSelection): void {
    const hinweis = this.kartenHost.querySelector('.class-overlay-hint');
    this.kartenHost.replaceChildren(renderClassCard(auswahl));
    if (hinweis) this.kartenHost.append(hinweis);
  }
}
