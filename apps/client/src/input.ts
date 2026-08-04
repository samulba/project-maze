import { UPGRADE_IDS, type InputMessage, type UpgradeId, type Vector2 } from '@project-maze/shared';

interface StickState extends Vector2 {
  active: boolean;
}

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
  private readonly moveStick: StickState = { x: 0, y: 0, active: false };
  private readonly aimStick: StickState = { x: 1, y: 0, active: false };
  private sequence = 0;
  private autoFire = false;
  private cameraZoom = 1;

  constructor(canvas: HTMLCanvasElement, onUpgrade: (upgrade: UpgradeId) => void, onAutoFireChanged: (enabled: boolean) => void) {
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
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button === 0) this.pointer.down = true;
    });
    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'mouse' && event.button === 0) this.pointer.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.cameraZoom = Math.max(0.72, Math.min(1.22, this.cameraZoom - Math.sign(event.deltaY) * 0.06));
    }, { passive: false });

    this.bindStick('move-stick', this.moveStick, false);
    this.bindStick('aim-stick', this.aimStick, true);
  }

  nextMessage(): InputMessage {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.moveStick.active) {
      x = this.moveStick.x;
      y = this.moveStick.y;
    }
    const aim = this.getAim();
    return {
      type: 'input',
      sequence: ++this.sequence,
      move: { x, y },
      aim,
      shooting: this.pointer.down || this.aimStick.active || this.autoFire
    };
  }

  getAim(): Vector2 {
    return this.aimStick.active
      ? { x: this.aimStick.x, y: this.aimStick.y }
      : { x: this.pointer.x - window.innerWidth / 2, y: this.pointer.y - window.innerHeight / 2 };
  }

  get zoom(): number {
    return this.cameraZoom;
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

    const update = (event: PointerEvent): void => {
      const rect = area.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const length = Math.max(1, Math.hypot(dx, dy));
      const scale = Math.min(1, maxDistance / length);
      const px = dx * scale;
      const py = dy * scale;
      state.x = px / maxDistance;
      state.y = py / maxDistance;
      state.active = fires || Math.hypot(px, py) > 4;
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
