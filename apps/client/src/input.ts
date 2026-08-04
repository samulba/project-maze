import {
  GAME,
  UPGRADE_IDS,
  type InputMessage,
  type UpgradeId,
  type Vector2
} from '@project-maze/shared';

interface StickState extends Vector2 {
  active: boolean;
}

const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.001) return { x: 0, y: 0 };
  return { x: vector.x / Math.max(1, length), y: vector.y / Math.max(1, length) };
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
};

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  private readonly moveStick: StickState = { x: 0, y: 0, active: false };
  private readonly aimStick: StickState = { x: 1, y: 0, active: false };
  private readonly getWorldAim: (pointer: Vector2) => Vector2;
  private readonly finePointer = window.matchMedia('(pointer: fine)').matches;
  private readonly resetSticks: Array<() => void> = [];
  private sequence = 0;
  private primaryDown = false;
  private secondaryDown = false;
  private autoFire = false;
  private enabled = false;

  constructor(
    canvas: HTMLCanvasElement,
    getWorldAim: (pointer: Vector2) => Vector2,
    onUpgrade: (upgrade: UpgradeId) => void,
    onAutoFireChanged: (enabled: boolean) => void
  ) {
    this.getWorldAim = getWorldAim;
    canvas.tabIndex = 0;

    window.addEventListener('keydown', (event) => {
      if (isEditableTarget(event.target) || !this.enabled) return;
      this.keys.add(event.code);
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown' || event.code === 'ArrowLeft' || event.code === 'ArrowRight') event.preventDefault();
      if (!event.repeat && event.code === 'KeyE') {
        this.autoFire = !this.autoFire;
        onAutoFireChanged(this.autoFire);
      }
      if (!event.repeat && event.code.startsWith('Digit')) {
        const index = Number(event.code.slice(5)) - 1;
        const upgrade = UPGRADE_IDS[index];
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

    this.bindStick('move-stick', this.moveStick, false);
    this.bindStick('aim-stick', this.aimStick, true);

    const secondaryButton = document.querySelector<HTMLElement>('#secondary-action');
    secondaryButton?.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.secondaryDown = true;
      secondaryButton.setPointerCapture(event.pointerId);
    });
    const releaseSecondary = (): void => { this.secondaryDown = false; };
    secondaryButton?.addEventListener('pointerup', releaseSecondary);
    secondaryButton?.addEventListener('pointercancel', releaseSecondary);
    secondaryButton?.addEventListener('lostpointercapture', releaseSecondary);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.resetTransient();
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
    if (this.moveStick.active) return { x: this.moveStick.x, y: this.moveStick.y };
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    return normalize({ x, y });
  }

  getAim(): Vector2 {
    if (this.aimStick.active) return { x: this.aimStick.x * GAME.maxAimDistance, y: this.aimStick.y * GAME.maxAimDistance };
    return this.getWorldAim(this.pointer);
  }

  getPointerPosition(): Vector2 {
    if (!this.aimStick.active) return { ...this.pointer };
    const direction = normalize(this.aimStick);
    return { x: window.innerWidth / 2 + direction.x * 150, y: window.innerHeight / 2 + direction.y * 150 };
  }

  get isPrimary(): boolean { return this.enabled && (this.primaryDown || this.aimStick.active || this.autoFire); }
  get isSecondary(): boolean { return this.enabled && this.secondaryDown; }
  get showCrosshair(): boolean { return this.finePointer && !this.aimStick.active; }

  toggleAutoFire(): boolean {
    if (!this.enabled) return this.autoFire;
    this.autoFire = !this.autoFire;
    return this.autoFire;
  }

  resetTransient(): void {
    this.keys.clear();
    this.primaryDown = false;
    this.secondaryDown = false;
    for (const reset of this.resetSticks) reset();
  }

  resetAll(): boolean {
    this.resetTransient();
    const changed = this.autoFire;
    this.autoFire = false;
    return changed;
  }

  private bindStick(id: string, state: StickState, fires: boolean): void {
    const area = document.querySelector<HTMLElement>(`#${id}`);
    const knob = area?.querySelector<HTMLElement>('.stick-knob');
    if (!area || !knob) return;
    let pointerId: number | null = null;
    const maxDistance = 44;
    const deadzone = fires ? 0.08 : 0.14;
    const reset = (): void => {
      pointerId = null;
      state.x = fires ? 1 : 0;
      state.y = 0;
      state.active = false;
      knob.style.transform = '';
    };
    this.resetSticks.push(reset);
    const update = (event: PointerEvent): void => {
      if (!this.enabled) { reset(); return; }
      const rect = area.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const rawLength = Math.hypot(dx, dy);
      const limited = Math.min(maxDistance, rawLength);
      const direction = rawLength < 0.001 ? { x: 0, y: 0 } : { x: dx / rawLength, y: dy / rawLength };
      const normalizedLength = limited / maxDistance;
      const adjusted = normalizedLength <= deadzone ? 0 : Math.pow((normalizedLength - deadzone) / (1 - deadzone), 1.06);
      state.x = direction.x * adjusted;
      state.y = direction.y * adjusted;
      state.active = fires ? normalizedLength > deadzone : adjusted > 0;
      knob.style.transform = `translate3d(${direction.x * limited}px, ${direction.y * limited}px, 0)`;
    };
    area.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      pointerId = event.pointerId;
      area.setPointerCapture(pointerId);
      update(event);
    });
    area.addEventListener('pointermove', (event) => { if (event.pointerId === pointerId) update(event); });
    const release = (event: PointerEvent): void => { if (event.pointerId === pointerId) reset(); };
    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
    area.addEventListener('lostpointercapture', reset);
  }
}
