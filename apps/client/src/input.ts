import {
  GAME,
  type InputMessage,
  type Vector2
} from '@project-maze/shared';
import { UPGRADE_SLOT_IDS, upgradeHotkeySlots, type UpgradeSlotId } from './family-upgrades';
import {
  AIM_TUNING,
  MOVE_TUNING,
  floatingOrigin,
  smoothDirection,
  stickEngaged,
  stickMagnitude,
  type StickTuning
} from './stick-math';

interface StickState {
  /** Richtung als Einheitsvektor – behält in Ruhelage die zuletzt gezeigte Richtung. */
  direction: Vector2;
  /** Auslenkung 0..1 nach Deadzone und Antwortkurve. */
  magnitude: number;
  /** Der Zeiger liegt auf dem Stick. */
  active: boolean;
  /** Hysterese-Schwelle überschritten (Aim-Stick: feuert). */
  engaged: boolean;
}

const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) return { x: 0, y: 0 };
  return { x: vector.x / Math.max(1, length), y: vector.y / Math.max(1, length) };
};

/** Kurzes haptisches Signal, wo der Browser es unterstützt – sonst still. */
export const vibrate = (durationMs: number): void => {
  try {
    navigator.vibrate?.(durationMs);
  } catch {
    /* Manche Browser werfen ohne Nutzergeste – Haptik ist rein optional. */
  }
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  private readonly moveStick: StickState = { direction: { x: 0, y: 0 }, magnitude: 0, active: false, engaged: false };
  private readonly aimStick: StickState = { direction: { x: 1, y: 0 }, magnitude: 0, active: false, engaged: false };
  private readonly getWorldAim: (pointer: Vector2) => Vector2;
  private readonly finePointer = window.matchMedia('(pointer: fine)').matches;
  private readonly resetSticks: Array<() => void> = [];
  /** Weiche Variante: Eingabewerte auf null, aber der liegende Daumen bleibt gebucht. */
  private readonly calmSticks: Array<() => void> = [];
  /** Nach `setEnabled(true)` die noch liegenden Daumen wieder scharf schalten. */
  private readonly resyncSticks: Array<() => void> = [];
  private sequence = 0;
  private primaryDown = false;
  private secondaryDown = false;
  private autoFire = false;
  private enabled = false;
  /** Aktuelle Zifferntasten-Belegung – wandert mit der Klasse (Befund 17). */
  private hotkeySlots: readonly UpgradeSlotId[] = upgradeHotkeySlots('core');

  constructor(
    canvas: HTMLCanvasElement,
    getWorldAim: (pointer: Vector2) => Vector2,
    onUpgrade: (upgrade: UpgradeSlotId) => void,
    onAutoFireChanged: (enabled: boolean) => void,
    /** Taste C: Klassenbaum auf und zu (KL3). */
    onToggleClassTree: () => void = () => {}
  ) {
    this.getWorldAim = getWorldAim;
    canvas.tabIndex = 0;

    window.addEventListener('keydown', (event) => {
      if (isEditableTarget(event.target)) return;
      // VOR der `enabled`-Prüfung: Das Rad soll auch im Tod und beim Zuschauen
      // aufgehen – da liest man es am ehesten, und es greift nicht ins Spiel ein.
      if (!event.repeat && event.code === 'KeyC') onToggleClassTree();
      if (!this.enabled) return;
      this.keys.add(event.code);
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown' || event.code === 'ArrowLeft' || event.code === 'ArrowRight') event.preventDefault();
      if (!event.repeat && event.code === 'KeyE') {
        this.autoFire = !this.autoFire;
        onAutoFireChanged(this.autoFire);
      }
      if (!event.repeat && event.code.startsWith('Digit')) {
        // Der zehnte Platz liegt auf der 0: `Number('Digit0'.slice(5)) - 1` wäre
        // -1, und die Taste bliebe tot. Solange es weniger als zehn Werte gibt,
        // greift der Zugriff ins Leere und es passiert schlicht nichts.
        const index = event.code === 'Digit0' ? 9 : Number(event.code.slice(5)) - 1;
        // Klassenabhängige Belegung (Befund 17): dieselbe Zuordnung, die das
        // Panel als kbd-Marken zeigt – bei core liegen 9/0 auf Reichweite und
        // Fähigkeit statt auf den gesperrten Familien-Slots.
        const upgrade = this.hotkeySlots[index] ?? UPGRADE_SLOT_IDS[index];
        if (upgrade) onUpgrade(upgrade);
      }
    });

    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.resetTransient());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetTransient();
    });
    window.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      canvas.focus({ preventScroll: true });
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        if (event.button === 0) this.primaryDown = true;
        if (event.button === 2) this.secondaryDown = true;
      }
    });
    const releasePointer = (event: PointerEvent): void => {
      if (event.button === 0) this.primaryDown = false;
      if (event.button === 2) this.secondaryDown = false;
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });

    this.bindStick('move-stick', this.moveStick, MOVE_TUNING, false);
    this.bindStick('aim-stick', this.aimStick, AIM_TUNING, true);

    const secondaryButton = document.querySelector<HTMLElement>('#secondary-action');
    secondaryButton?.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.secondaryDown = true;
      secondaryButton.setPointerCapture(event.pointerId);
      if (event.pointerType === 'touch') vibrate(8);
    });
    const releaseSecondary = (): void => { this.secondaryDown = false; };
    secondaryButton?.addEventListener('pointerup', releaseSecondary);
    secondaryButton?.addEventListener('pointercancel', releaseSecondary);
    secondaryButton?.addEventListener('lostpointercapture', releaseSecondary);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetTransient();
    // Ein Daumen, der ueber den Tod hinweg liegen blieb, erzeugt kein zweites
    // pointerdown -- ohne Resync waeren beide Sticks nach jedem Respawn tot,
    // bis der Spieler beide Finger hebt und neu aufsetzt (Befund 61).
    else for (const resync of this.resyncSticks) resync();
  }

  nextMessage(): InputMessage {
    return {
      type: 'input',
      sequence: ++this.sequence,
      move: this.enabled ? this.getMovement() : { x: 0, y: 0 },
      aim: this.getAim(),
      primary: this.enabled && this.isPrimary,
      secondary: this.enabled && this.isSecondary
    };
  }

  getMovement(): Vector2 {
    if (!this.enabled) return { x: 0, y: 0 };
    if (this.moveStick.active) {
      return { x: this.moveStick.direction.x * this.moveStick.magnitude, y: this.moveStick.direction.y * this.moveStick.magnitude };
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    return normalize({ x, y });
  }

  /**
   * Auf Touch zählt nur die Richtung: Der Server nutzt die Ziel-Länge auch als
   * Drohnen-Zielpunkt, ein kurzer Vektor würde Drohnen auf den eigenen Tank ziehen.
   */
  getAim(): Vector2 {
    if (this.aimStick.active) {
      return { x: this.aimStick.direction.x * GAME.maxAimDistance, y: this.aimStick.direction.y * GAME.maxAimDistance };
    }
    return this.getWorldAim(this.pointer);
  }

  getPointerPosition(): Vector2 {
    if (!this.aimStick.active) return { ...this.pointer };
    const direction = this.aimStick.direction;
    return { x: window.innerWidth / 2 + direction.x * 150, y: window.innerHeight / 2 + direction.y * 150 };
  }

  get isPrimary(): boolean { return this.enabled && (this.primaryDown || this.aimStick.engaged || this.autoFire); }
  get isSecondary(): boolean { return this.enabled && this.secondaryDown; }
  get showCrosshair(): boolean { return this.finePointer && !this.aimStick.active; }
  /** Für Onboarding-Hinweise: Hat der Spieler den Bewegungs-Input schon benutzt? */
  get isMoving(): boolean {
    const movement = this.getMovement();
    return Math.hypot(movement.x, movement.y) > 0.2;
  }

  toggleAutoFire(): boolean {
    if (!this.enabled) return this.autoFire;
    this.autoFire = !this.autoFire;
    return this.autoFire;
  }

  /** Von main je Snapshot gesetzt, wenn sich die Klasse ändert. */
  setHotkeySlots(slots: readonly UpgradeSlotId[]): void {
    this.hotkeySlots = slots;
  }

  /**
   * Räumt flüchtigen Eingabezustand: Tasten, Maustasten, Stick-WERTE. Die
   * Stick-BUCHFÜHRUNG (welcher Zeiger, welcher Ursprung) ist nicht flüchtig --
   * sie beschreibt einen physisch auf dem Glas liegenden Finger und bleibt
   * stehen, damit `setEnabled(true)` ihn wieder scharf schalten kann.
   * Autofire bleibt als bewusste Einstellung ebenfalls stehen.
   */
  resetTransient(): void {
    this.keys.clear();
    this.primaryDown = false;
    this.secondaryDown = false;
    for (const calm of this.calmSticks) calm();
  }

  /**
   * Alles auf Anfang -- nur für den Verbindungsabbruch (main.ts), wo wirklich
   * keine Sitzung mehr weiterläuft. Beim Tod wäre das falsch: Es würde
   * Autofire abschalten (Befund 68) und liegende Daumen entwaffnen (Befund 61).
   */
  resetAll(): boolean {
    this.keys.clear();
    this.primaryDown = false;
    this.secondaryDown = false;
    for (const reset of this.resetSticks) reset();
    const changed = this.autoFire;
    this.autoFire = false;
    return changed;
  }

  /**
   * Bindet einen schwebenden virtuellen Stick: Der Stick entsteht dort, wo der Daumen
   * aufsetzt, statt eine feste Mitte treffen zu müssen. Das ist der spürbarste
   * Unterschied auf dem Handy, weil der Blick auf der Arena bleiben kann.
   */
  private bindStick(id: string, state: StickState, tuning: StickTuning, fires: boolean): void {
    const area = document.querySelector<HTMLElement>(`#${id}`);
    const ring = area?.querySelector<HTMLElement>('.stick-ring');
    const knob = area?.querySelector<HTMLElement>('.stick-knob');
    if (!area || !ring || !knob) return;
    let pointerId: number | null = null;
    let origin: Vector2 | null = null;
    let lastClient: Vector2 | null = null;
    const travel = 46;

    const reset = (): void => {
      if (pointerId !== null) {
        try {
          if (area.hasPointerCapture(pointerId)) area.releasePointerCapture(pointerId);
        } catch {
          /* Zeiger schon weg – der Rest des Resets muss trotzdem laufen. */
        }
      }
      pointerId = null;
      origin = null;
      lastClient = null;
      state.direction = fires ? { x: 1, y: 0 } : { x: 0, y: 0 };
      state.magnitude = 0;
      state.active = false;
      state.engaged = false;
      knob.style.transform = '';
      ring.style.transform = '';
      area.classList.remove('touching', 'engaged');
    };
    this.resetSticks.push(reset);

    // Weich: Werte auf null, Zeiger und Ursprung bleiben -- der Daumen liegt ja noch.
    const calm = (): void => {
      state.magnitude = 0;
      state.engaged = false;
      knob.style.transform = '';
      area.classList.remove('engaged');
    };
    this.calmSticks.push(calm);

    const update = (event: { clientX: number; clientY: number }): void => {
      if (!origin) { reset(); return; }
      lastClient = { x: event.clientX, y: event.clientY };
      // Im Tod laeuft nichts weiter, aber die Position wird gemerkt: Beim
      // Respawn rechnet der Resync aus genau diesem Stand weiter.
      if (!this.enabled) return;
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      const rawLength = Math.hypot(dx, dy);
      const limited = Math.min(travel, rawLength);
      const ratio = limited / travel;
      const magnitude = stickMagnitude(ratio, tuning);
      const engaged = stickEngaged(ratio, state.engaged, tuning);

      if (rawLength >= 0.001) {
        const raw = { x: dx / rawLength, y: dy / rawLength };
        // In Ruhelage bleibt die letzte Richtung stehen, damit das Zielen nicht wegspringt.
        state.direction = magnitude > 0
          ? smoothDirection(state.active ? state.direction : null, raw, ratio, tuning)
          : state.direction;
      }
      state.magnitude = magnitude;
      state.active = true;
      if (engaged !== state.engaged) {
        state.engaged = engaged;
        area.classList.toggle('engaged', engaged);
        if (fires && engaged) vibrate(6);
      }
      knob.style.transform = `translate3d(${(rawLength < 0.001 ? 0 : dx / rawLength) * limited}px, ${(rawLength < 0.001 ? 0 : dy / rawLength) * limited}px, 0)`;
    };

    area.addEventListener('pointerdown', (event) => {
      // Auch im Tod buchen: Die Eingabe bleibt aus (`update` prueft enabled),
      // aber der Finger ist beim Respawn sofort wieder scharf.
      if (pointerId !== null) return;
      event.preventDefault();
      pointerId = event.pointerId;
      try {
        area.setPointerCapture(pointerId);
      } catch {
        // Ohne Capture funktioniert der Stick weiter, solange der Zeiger im Feld bleibt.
      }
      const rect = area.getBoundingClientRect();
      origin = floatingOrigin(
        { x: event.clientX, y: event.clientY },
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        travel
      );
      // Der sichtbare Ring wandert unter den Daumen – ohne ihn zu verdecken.
      ring.style.transform = `translate3d(${origin.x - (rect.left + rect.width / 2)}px, ${origin.y - (rect.top + rect.height / 2)}px, 0)`;
      area.classList.add('touching');
      update(event);
    });
    area.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
    const release = (event: PointerEvent): void => { if (event.pointerId === pointerId) reset(); };
    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
    area.addEventListener('lostpointercapture', release);

    // Nach `setEnabled(true)`: Liegt der Daumen noch, aus der letzten bekannten
    // Position weiterrechnen, statt auf ein pointerdown zu warten, das nie kommt.
    this.resyncSticks.push((): void => {
      if (pointerId !== null && origin && lastClient) update({ clientX: lastClient.x, clientY: lastClient.y });
    });
  }
}
