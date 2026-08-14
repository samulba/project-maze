import type { PlayerSnapshot, WorldSnapshot } from '@project-maze/shared';
import {
  ACTIVE_MODULE_DEFINITIONS,
  ACTIVE_MODULE_IDS,
  DEFAULT_ACTIVE_MODULE,
  DEFAULT_PASSIVE_MODIFIER,
  PASSIVE_MODIFIER_DEFINITIONS,
  PASSIVE_MODIFIER_IDS,
  type ActiveModuleId,
  type EquipLoadoutMessage,
  type GameplayWorldExtension,
  type PassiveModifierId
} from '@project-maze/shared/gameplay';
import { vibrate } from './input';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;
type SendMessage = (message: object) => void;

// Auch Knöpfe und Links zählen: Ein `<button>` wird per Spezifikation von der
// Leertaste aktiviert – wer per Tab auf RESPAWN oder ARENA BETRETEN steht,
// dessen Space gehört dem Knopf, nicht dem Fähigkeits-Hotkey (Befund 70).
const editableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, button, [role="button"], a[href], [contenteditable="true"]'));
};

const EVENT_COPY: Partial<Record<string, { name: string; active: string; where: string }>> = {
  // „Formen" wie im Onboarding – dieselben Dinger hießen hier „Shapes",
  // und der Neuling musste übersetzen (Befund 45).
  coreSurge: { name: 'CORE SURGE', active: 'mehr Formen und Eliten im Zentrum', where: 'Zentrum' },
  overcharge: { name: 'OVERCHARGE', active: 'Geschosse löschen sich in der Zone nicht mehr aus', where: 'Zentrum' },
  hunterSignal: { name: 'HUNTER SIGNAL', active: 'neutraler Guardian im Zentrum · 600 Bonus-XP', where: 'Zentrum' },
  // Fracture ist ortlos – ein "Zentrum"-Hinweis würde Spieler an eine Stelle schicken, an der nichts passiert.
  fracture: { name: 'FRACTURE', active: 'einzelne Wände sind arenaweit aufgebrochen', where: 'arenaweit' }
};

/** Eine Kachel in einer `Wahlreihe`. */
interface Wahlkachel<T extends string> {
  id: T;
  /** Kurzwort auf der Kachel – muss in eine Viertelbreite passen. */
  label: string;
  /** Zweite, leisere Zeile; leer lassen, wenn es nichts zu sagen gibt. */
  note: string;
  /** Vollständige Beschreibung, im Tooltip. */
  title: string;
}

/**
 * Eine Reihe Kacheln als Ersatz für ein Auswahlfeld (Sams Punkt 3 vom 14.08.).
 *
 * Warum eine eigene kleine Klasse und kein verstecktes `<select>` daneben: Ein
 * unsichtbares Formularfeld neben einer eigenen Anzeige sind zwei Wahrheiten,
 * die auseinanderlaufen können, sobald jemand nur eine davon setzt. Hier hält
 * die Reihe ihren Wert selbst, und `setzen` ist der einzige Weg hinein.
 *
 * Tastatur: Die Kacheln sind `role="radio"` in einer `radiogroup`. Pfeiltasten
 * wandern durch die Reihe, weil jede Kachel ein eigener Knopf ist und der
 * Fokus damit ohnehin durchläuft – bewusst ohne eigene Tastensteuerung, die
 * mitten im Spiel eine weitere Stelle wäre, an der Eingaben abgefangen werden.
 */
class Wahlreihe<T extends string> {
  private auswahl: T;
  private readonly knoepfe = new Map<T, HTMLButtonElement>();

  constructor(wurzel: HTMLElement, kacheln: ReadonlyArray<Wahlkachel<T>>, start: T, beiWechsel: () => void) {
    this.auswahl = start;
    for (const kachel of kacheln) {
      const knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.setAttribute('role', 'radio');
      knopf.dataset.wahl = kachel.id;
      knopf.title = kachel.title;
      knopf.innerHTML = `<b>${kachel.label}</b>${kachel.note ? `<small>${kachel.note}</small>` : ''}`;
      knopf.addEventListener('click', () => {
        if (this.auswahl === kachel.id) return;
        this.setzen(kachel.id);
        beiWechsel();
      });
      this.knoepfe.set(kachel.id, knopf);
      wurzel.append(knopf);
    }
    this.zeichnen();
  }

  get wert(): T { return this.auswahl; }

  /**
   * Sperrt die Reihe, solange ein Wechsel nichts brächte – das Loadout gilt ab
   * dem Respawn, mitten im Lauf ist es nicht umstellbar.
   */
  sperren(gesperrt: boolean): void {
    for (const knopf of this.knoepfe.values()) knopf.disabled = gesperrt;
  }

  /** Setzt die Auswahl, ohne den Wechsel-Rückruf auszulösen. */
  setzen(wert: T): void {
    if (!this.knoepfe.has(wert) || this.auswahl === wert) return;
    this.auswahl = wert;
    this.zeichnen();
  }

  private zeichnen(): void {
    for (const [id, knopf] of this.knoepfe) {
      const aktiv = id === this.auswahl;
      knopf.setAttribute('aria-checked', aktiv ? 'true' : 'false');
      knopf.dataset.aktiv = aktiv ? 'true' : 'false';
      // Nur die gewählte Kachel ist per Tab erreichbar – das ist das
      // Tastaturverhalten einer Radiogruppe.
      knopf.tabIndex = aktiv ? 0 : -1;
    }
  }
}

export class GameplayUI {
  private readonly root: HTMLElement;
  private readonly send: SendMessage;
  private readonly loadoutPanel: HTMLElement;
  private readonly moduleChoices: Wahlreihe<ActiveModuleId>;
  private readonly modifierChoices: Wahlreihe<PassiveModifierId>;
  private readonly abilityButton: HTMLButtonElement;
  private readonly abilityLabel: HTMLElement;
  private readonly abilityCooldown: HTMLElement;
  private readonly eventBanner: HTMLElement;
  private readonly bountyBanner: HTMLElement;
  private self: PlayerSnapshot | null = null;
  private connected = false;

  constructor(root: HTMLElement, send: SendMessage) {
    this.root = root;
    this.send = send;

    const storedModule = window.localStorage.getItem('project-maze-module') as ActiveModuleId | null;
    const storedModifier = window.localStorage.getItem('project-maze-modifier') as PassiveModifierId | null;
    const initialModule = storedModule && ACTIVE_MODULE_IDS.includes(storedModule) ? storedModule : DEFAULT_ACTIVE_MODULE;
    const initialModifier = storedModifier && PASSIVE_MODIFIER_IDS.includes(storedModifier) ? storedModifier : DEFAULT_PASSIVE_MODIFIER;

    /*
     * Zwei Reihen Kacheln statt zweier Auswahlfelder – Sams Spieltest vom
     * 14.08., Punkt 3:
     *
     * > „RUN-BEENDET-KARTE, LINKS UNTEN DROPDOWN richtig hässlich, muss viel
     * > schöner gemacht werden."
     *
     * Das Panel wird beim Beitritt in die Todeskarte gehängt (`onWelcome`), und
     * es brachte zwei native `<select>` mit. Ein Betriebssystem-Dropdown mitten
     * in einer Glaskarte sieht zusammengesteckt aus, egal wie viel CSS man
     * darauf legt – und es kostet zwei Klicks und eine aufklappende Liste, um
     * unter vier Möglichkeiten eine zu wählen.
     *
     * Vier Module und vier Rahmen passen als Kachelreihe nebeneinander: ein
     * Klick statt zwei, alles gleichzeitig sichtbar, und die Reihe trägt
     * dieselbe Formsprache wie der Rest des HUD. Die `<select>` sind weg – nicht
     * versteckt: Ein unsichtbares Formularfeld neben einer eigenen Anzeige wäre
     * eine zweite Wahrheit, und genau davon lebt kein Fehler länger als von
     * zweien, die auseinanderlaufen.
     */
    const loadout = document.createElement('section');
    loadout.className = 'core-loadout';
    loadout.innerHTML = `
      <div class="core-loadout-heading"><span>CORE LOADOUT</span><small>1 Fähigkeit · 1 optionaler Trade-off</small></div>
      <div class="core-loadout-fields">
        <div class="core-loadout-group">
          <span class="core-loadout-label" id="core-loadout-module-label">AKTIVES MODUL</span>
          <div class="core-loadout-choices" role="radiogroup" aria-labelledby="core-loadout-module-label" data-module-choices></div>
        </div>
        <div class="core-loadout-group">
          <span class="core-loadout-label" id="core-loadout-frame-label">FRAME</span>
          <div class="core-loadout-choices" role="radiogroup" aria-labelledby="core-loadout-frame-label" data-modifier-choices></div>
        </div>
      </div>
      <div class="core-loadout-description" data-loadout-description></div>`;
    this.loadoutPanel = loadout;

    const playButton = root.querySelector('#join-button');
    playButton?.parentElement?.insertBefore(loadout, playButton);

    const updateDescription = (): void => {
      const module = ACTIVE_MODULE_DEFINITIONS[this.selectedModule];
      const modifier = PASSIVE_MODIFIER_DEFINITIONS[this.selectedModifier];
      const element = loadout.querySelector<HTMLElement>('[data-loadout-description]');
      if (element) element.textContent = `${module.description} ${modifier.description}`;
    };
    const changed = (): void => {
      window.localStorage.setItem('project-maze-module', this.selectedModule);
      window.localStorage.setItem('project-maze-modifier', this.selectedModifier);
      updateDescription();
      if (this.connected && (this.self?.dead || this.self?.invulnerable)) this.sendLoadout();
    };

    this.moduleChoices = new Wahlreihe(
      loadout.querySelector<HTMLElement>('[data-module-choices]')!,
      ACTIVE_MODULE_IDS.map((id) => ({
        id,
        label: ACTIVE_MODULE_DEFINITIONS[id].shortLabel,
        note: ACTIVE_MODULE_DEFINITIONS[id].roleLabel,
        title: `${ACTIVE_MODULE_DEFINITIONS[id].label} · ${ACTIVE_MODULE_DEFINITIONS[id].roleLabel}\n${ACTIVE_MODULE_DEFINITIONS[id].description}`
      })),
      initialModule,
      changed
    );
    this.modifierChoices = new Wahlreihe(
      loadout.querySelector<HTMLElement>('[data-modifier-choices]')!,
      PASSIVE_MODIFIER_IDS.map((id) => ({
        id,
        label: PASSIVE_MODIFIER_DEFINITIONS[id].shortLabel,
        note: PASSIVE_MODIFIER_DEFINITIONS[id].roleLabel,
        title: `${PASSIVE_MODIFIER_DEFINITIONS[id].label}\n${PASSIVE_MODIFIER_DEFINITIONS[id].description}`
      })),
      initialModifier,
      changed
    );
    updateDescription();

    const hud = root.querySelector<HTMLElement>('#hud') ?? root;
    this.abilityButton = document.createElement('button');
    this.abilityButton.type = 'button';
    this.abilityButton.className = 'core-ability';
    this.abilityButton.setAttribute('aria-label', 'Fähigkeit auslösen');
    this.abilityButton.innerHTML = `
      <span class="core-ability-key">SPACE</span>
      <strong data-ability-label>DASH</strong>
      <small data-ability-cooldown>READY</small>
      <i></i>`;
    hud.append(this.abilityButton);
    this.abilityLabel = this.abilityButton.querySelector<HTMLElement>('[data-ability-label]')!;
    this.abilityCooldown = this.abilityButton.querySelector<HTMLElement>('[data-ability-cooldown]')!;

    this.eventBanner = document.createElement('div');
    this.eventBanner.className = 'arena-event-banner';
    this.eventBanner.hidden = true;
    hud.append(this.eventBanner);

    this.bountyBanner = document.createElement('div');
    this.bountyBanner.className = 'bounty-banner';
    this.bountyBanner.hidden = true;
    hud.append(this.bountyBanner);

    // Auf Touch zählt der Moment des Aufsetzens: Warten auf `click` (Press *und* Release
    // am selben Punkt) kostet in einem Gefecht spürbar Zeit.
    let lastTouchActivation = 0;
    this.abilityButton.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return;
      event.preventDefault();
      lastTouchActivation = performance.now();
      if (this.activate()) vibrate(14);
    });
    this.abilityButton.addEventListener('click', () => {
      // Der synthetische Klick nach einer Touch-Auslösung darf nicht doppelt zünden.
      if (performance.now() - lastTouchActivation < 600) return;
      this.activate();
    });
    window.addEventListener('keydown', (event) => {
      if (event.repeat || editableTarget(event.target)) return;
      if (event.code !== 'Space' && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
      // preventDefault erst, wenn die Fähigkeit wirklich zündet: Vorher
      // unterdrückte der Handler das Space-Verhalten jedes fokussierten
      // Elements, obwohl `activate()` gleich darauf ausstieg (Befund 70).
      if (this.activate()) event.preventDefault();
    });
  }

  get selectedModule(): ActiveModuleId { return this.moduleChoices.wert; }
  get selectedModifier(): PassiveModifierId { return this.modifierChoices.wert; }

  onWelcome(): void {
    this.connected = true;
    const deathCard = this.root.querySelector<HTMLElement>('.death-card');
    /*
     * Eingehaengt wird vor dem KIND der Karte, in dem der Respawn-Knopf steckt
     * -- nicht vor dem Knopf selbst.
     *
     * `insertBefore` verlangt einen direkten Nachfahren; `querySelector`
     * findet dagegen in jeder Tiefe. Seit der Knopf in der klebenden
     * `.death-actions`-Leiste sitzt, war der gefundene Knopf kein Kind der
     * Karte mehr, und der Aufruf warf `NotFoundError` -- mitten in der
     * Snapshot-Verarbeitung, also fuer den Spieler als "Der Server hat
     * ungueltige Daten gesendet". Gefunden hat es `npm run wire-probe`,
     * nicht der Layout-Durchlauf: Es ist kein Layout-Fehler, sondern ein
     * Absturz beim ersten Snapshot nach dem Beitritt.
     */
    const anker = deathCard
      ?.querySelector<HTMLElement>('#respawn-button')
      ?.closest<HTMLElement>('.death-card > *') ?? null;
    if (deathCard && this.loadoutPanel.parentElement !== deathCard) {
      if (anker && anker.parentElement === deathCard) deathCard.insertBefore(this.loadoutPanel, anker);
      else deathCard.append(this.loadoutPanel);
    }
    this.sendLoadout();
  }

  onDisconnect(): void {
    this.connected = false;
    this.self = null;
    this.abilityButton.disabled = true;
  }

  update(snapshot: WorldSnapshot): void {
    const extended = snapshot as ExtendedSnapshot;
    const self = snapshot.players.find((player) => player.id === snapshot.selfId) ?? null;
    this.self = self;
    if (!self) return;

    const gameplay = extended.gameplay?.[self.id];
    if (!gameplay) return;
    // Der Server ist die Wahrheit: Was er meldet, steht in der Reihe. `setzen`
    // löst bewusst KEIN `changed` aus – sonst schickte jede Bestätigung des
    // Servers dieselbe Wahl gleich wieder zurück.
    this.moduleChoices.setzen(gameplay.activeModule);
    this.modifierChoices.setzen(gameplay.passiveModifier);

    const module = ACTIVE_MODULE_DEFINITIONS[gameplay.activeModule];
    const remaining = Math.max(0, gameplay.moduleReadyAt - snapshot.serverTime);
    const active = gameplay.moduleActiveUntil > snapshot.serverTime;
    const ready = remaining <= 0 && !self.dead;
    this.abilityLabel.textContent = module.shortLabel;
    // Zustandsanzeigen auf Deutsch – der Knopf zählte vorher abwechselnd auf
    // Deutsch und Englisch herunter (Befund 45).
    this.abilityCooldown.textContent = self.dead ? 'NACH RESPAWN' : active ? 'AKTIV' : ready ? 'BEREIT' : `${(remaining / 1000).toFixed(1)}S`;
    this.abilityButton.disabled = !ready || active;
    this.abilityButton.classList.toggle('active', active);
    this.abilityButton.style.setProperty('--charge', `${Math.round(gameplay.moduleCharge * 100)}%`);
    this.abilityButton.dataset.module = gameplay.activeModule;

    const event = extended.arenaEvent;
    if (event) {
      const remainingEvent = Math.max(0, (event.phase === 'warning' ? event.startsAt : event.endsAt) - snapshot.serverTime);
      const copy = EVENT_COPY[event.kind] ?? EVENT_COPY.coreSurge!;
      this.eventBanner.hidden = false;
      this.eventBanner.dataset.phase = event.phase;
      this.eventBanner.innerHTML = event.phase === 'warning'
        ? `<strong>${copy.name}</strong><span>startet in ${Math.ceil(remainingEvent / 1000)}s · ${copy.where}</span>`
        : `<strong>${copy.name} AKTIV</strong><span>${Math.ceil(remainingEvent / 1000)}s · ${copy.active}</span>`;
    } else {
      this.eventBanner.hidden = true;
    }

    const bountyId = extended.bountyTargetId;
    const bountyTarget = bountyId ? snapshot.players.find((player) => player.id === bountyId) : null;
    const bountyValue = extended.bountyValue ?? 0;
    if (bountyId && bountyValue > 0) {
      this.bountyBanner.hidden = false;
      this.bountyBanner.classList.toggle('self', bountyId === self.id);
      this.bountyBanner.innerHTML = bountyId === self.id
        ? `<strong>BOUNTY AUF DIR</strong><span>${bountyValue} Bonus</span>`
        : `<strong>BOUNTY</strong><span>${bountyTarget?.name ?? 'Dominanter Spieler'} · ${bountyValue} Bonus</span>`;
    } else {
      this.bountyBanner.hidden = true;
    }

    const canChange = self.dead || self.invulnerable;
    this.moduleChoices.sperren(!canChange);
    this.modifierChoices.sperren(!canChange);
  }

  /** Gibt zurück, ob die Fähigkeit tatsächlich ausgelöst wurde (für Haptik-Feedback). */
  private activate(): boolean {
    if (!this.connected || !this.self || this.self.dead || this.abilityButton.disabled) return false;
    this.send({ type: 'activateModule' });
    return true;
  }

  private sendLoadout(): void {
    const message: EquipLoadoutMessage = {
      type: 'equipLoadout',
      activeModule: this.selectedModule,
      passiveModifier: this.selectedModifier
    };
    this.send(message);
  }
}
