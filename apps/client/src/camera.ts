import { GAME, type Vector2 } from '@project-maze/shared';

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y);
  return length < 0.001 ? { x: 0, y: 0 } : { x: vector.x / length, y: vector.y / length };
};

function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, delta: number): [number, number] {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * delta;
  const exponential = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temporary = (velocity + omega * change) * delta;
  return [target + (change + temporary) * exponential, (velocity - omega * temporary) * exponential];
}

export interface CameraFrame {
  pivot: Vector2;
  zoom: number;
}

export class CameraRig {
  private position: Vector2 = { x: GAME.worldWidth / 2, y: GAME.worldHeight / 2 };
  private velocity: Vector2 = { x: 0, y: 0 };
  private kick: Vector2 = { x: 0, y: 0 };
  private zoom = 0.94;
  private zoomVelocity = 0;
  private trauma = 0;
  private initialized = false;

  snap(): void {
    this.initialized = false;
    this.velocity = { x: 0, y: 0 };
  }

  shot(direction: Vector2, strength: number): void {
    this.kick.x -= direction.x * strength;
    this.kick.y -= direction.y * strength;
    this.trauma = Math.max(this.trauma, strength > 7 ? 0.2 : 0.09);
  }

  hit(strength = 0.42): void {
    this.trauma = Math.max(this.trauma, strength);
  }

  update(
    player: Vector2,
    velocity: Vector2,
    aim: Vector2,
    requestedZoom: number,
    desktopAim: boolean,
    screen: Vector2,
    delta: number,
    time: number
  ): CameraFrame {
    const aimDirection = normalize(aim);
    const aimLength = Math.hypot(aim.x, aim.y);
    const reference = Math.max(220, Math.min(screen.x, screen.y) * 0.48);
    const aimStrength = desktopAim ? clamp(aimLength / reference, 0, 1) : aimLength > 0.1 ? 0.72 : 0;
    const movementDirection = normalize(velocity);
    const movementStrength = clamp(Math.hypot(velocity.x, velocity.y) / 320, 0, 1);
    const lookAhead = 24 + aimStrength * 86;
    const target = {
      x: player.x + aimDirection.x * lookAhead + movementDirection.x * movementStrength * 28,
      y: player.y + aimDirection.y * lookAhead + movementDirection.y * movementStrength * 28
    };

    const targetZoom = clamp(requestedZoom * (1 - movementStrength * 0.035), 0.68, 1.18);
    [this.zoom, this.zoomVelocity] = smoothDamp(this.zoom, targetZoom, this.zoomVelocity, 0.16, delta);
    const clamped = this.clampPosition(target, screen, this.zoom);
    if (!this.initialized || Math.hypot(clamped.x - this.position.x, clamped.y - this.position.y) > 720) {
      this.position = clamped;
      this.velocity = { x: 0, y: 0 };
      this.initialized = true;
    } else {
      [this.position.x, this.velocity.x] = smoothDamp(this.position.x, clamped.x, this.velocity.x, 0.115, delta);
      [this.position.y, this.velocity.y] = smoothDamp(this.position.y, clamped.y, this.velocity.y, 0.115, delta);
    }

    this.kick.x *= Math.exp(-13 * delta);
    this.kick.y *= Math.exp(-13 * delta);
    this.trauma = Math.max(0, this.trauma - 1.65 * delta);
    const shake = this.trauma * this.trauma;
    return {
      pivot: {
        x: this.position.x + this.kick.x + Math.sin(time * 79.3) * 10 * shake,
        y: this.position.y + this.kick.y + Math.cos(time * 63.7) * 8 * shake
      },
      zoom: this.zoom
    };
  }

  private clampPosition(target: Vector2, screen: Vector2, zoom: number): Vector2 {
    const halfWidth = screen.x / Math.max(0.01, zoom) / 2;
    const halfHeight = screen.y / Math.max(0.01, zoom) / 2;
    return {
      x: clamp(target.x, Math.min(halfWidth, GAME.worldWidth / 2), Math.max(GAME.worldWidth - halfWidth, GAME.worldWidth / 2)),
      y: clamp(target.y, Math.min(halfHeight, GAME.worldHeight / 2), Math.max(GAME.worldHeight - halfHeight, GAME.worldHeight / 2))
    };
  }
}
