import { UPGRADE_IDS, type InputMessage, type UpgradeId, type Vector2 } from '@project-maze/shared';

interface StickState extends Vector2 {
  active: boolean;
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  return length < 0.001 ? { x: 0, y: 0 } : { x: vector.x / Math.max(1, length), y: vector.y / Math.max(1, length) };
}

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
  private readonly moveStick: StickState = { x: 0, y: 0, active: false };
  private readonly aimStick: StickState = { x: 1, y: 0, active: false };
  private readonly getAimOrigin: () => Vector2;
  private readonly finePointer = window.matchMedia('(pointer: fine)').matches;
  private sequence = 0;
  private autoFire = false;
  private cameraZoom = 0.94;

  constructor(
    canvas: HTMLCanvasElement,
    onUpgrade: (upgrade: UpgradeId) => void,
    onAutoFireChanged: (enabled: boolean) => void,
    getAimOrigin: () => Vector2
  ) {
    this.getAimOrigin = getAimOrigin;
    canvas.tabIndex = 0;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
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
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer.down = false;
    });
    window.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    });
    canvas.addEventListener('pointerdown', (event) => {
      canvas.focus({ preventScroll: true });
      if (event.pointerType === 'mouse' && event.button === 0) this.pointer.down = true;
    });
    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button === 0) this.pointer.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cameraZoom = Math.max(0.7, Math.min(1.18, this.cameraZoom - Math.sign(event.deltaY) * 0.055));
    }, { passive: false });

    this.bindStick('move-stick', this.moveStick, false);
    this.bindStick('aim-stick', this.aimStick, true);
  }

  nextMessage(): InputMessage {
    return {
      type: 'input',
      sequence: ++this.sequence,
      move: this.getMovement(),
      aim: this.getAim(),
      shooting: this.isShooting
    };
  }

  getMovement(): Vector2 {
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
    if (this.aimStick.active) return { x: this.aimStick.x, y: this.aimStick.y };
    const origin = this.getAimOrigin();
    return { x: this.pointer.x - origin.x, y: this.pointer.y - origin.y };
  }

  getPointerPosition(): Vector2 {
    if (!this.aimStick.active) return { x: this.pointer.x, y: this.pointer.y };
    const origin = this.getAimOrigin();
    return { x: origin.x + this.aimStick.x * 130, y: origin.y + this.aimStick.y * 130 };
  }

  get zoom(): number {
    return this.cameraZoom;
  }

  get isShooting(): boolean {
    return this.pointer.down || this.aimStick.active || this.autoFire;
  }

  get showCrosshair(): boolean {
    return this.finePointer && !this.aimStick.active;
  }

  toggleAutoFire(): boolean {
    this.autoFire = !this.autoFire;
    return this.autoFire;
  }

  private bindStick(id: string, state: StickState, fires: boolean): void {
    const area = document.querySelector<HTMLElement>(`#${id}`);
    const knob = area?.querySelector<HTMLElement>('.stick-knob');
    if (!area || !knob) return;
    let pointerId: number | null = null;
    const maxDistance = 42;
    const deadzone = fires ? 0.08 : 0.14;

    const update = (event: PointerEvent): void => {
      const rect = area.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const rawLength = Math.hypot(dx, dy);
      const limitedLength = Math.min(maxDistance, rawLength);
      const direction = rawLength < 0.001 ? { x: 0, y: 0 } : { x: dx / rawLength, y: dy / rawLength };
      const normalizedLength = limitedLength / maxDistance;
      const adjustedLength = normalizedLength <= deadzone ? 0 : Math.pow((normalizedLength - deadzone) / (1 - deadzone), 1.08);
      const px = direction.x * limitedLength;
      const py = direction.y * limitedLength;
      state.x = direction.x * adjustedLength;
      state.y = direction.y * adjustedLength;
      state.active = fires ? normalizedLength > deadzone : adjustedLength > 0;
      knob.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    };

    area.addEventListener('pointerdown', (event) => {
      pointerId = event.pointerId;
      area.setPointerCapture(pointerId);
      update(event);
    });
    area.addEventListener('pointermove', (event) => {
      if (event.pointerId === pointerId) update(event);
    });
    const release = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      state.x = fires ? 1 : 0;
      state.y = 0;
      state.active = false;
      knob.style.transform = '';
    };
    area.addEventListener('pointerup', release);
    area.addEventListener('pointercancel', release);
  }
}
