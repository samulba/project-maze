import { Graphics } from 'pixi.js';
import type { Vector2 } from '@project-maze/shared';

interface Particle {
  position: Vector2;
  velocity: Vector2;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  drag: number;
}

export class ParticleField {
  readonly graphics = new Graphics();
  private readonly particles: Particle[] = [];

  muzzle(origin: Vector2, direction: Vector2, color: number): void {
    const point = { x: origin.x + direction.x * 42, y: origin.y + direction.y * 42 };
    for (let index = 0; index < 5; index += 1) {
      const angle = Math.atan2(direction.y, direction.x) + (Math.random() - 0.5) * 0.7;
      const speed = 80 + Math.random() * 150;
      this.add(point, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, 0.12 + Math.random() * 0.12, 2 + Math.random() * 2.5, color, 6);
    }
  }

  burst(origin: Vector2, color: number, count: number, power: number, life: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.3 + Math.random() * 0.7);
      this.add(origin, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, life * (0.65 + Math.random() * 0.55), 2.5 + Math.random() * 4.5, color, 4.5 + Math.random() * 4);
    }
  }

  update(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      if (!particle) continue;
      particle.life -= delta;
      if (particle.life <= 0) {
        this.particles.splice(index, 1);
        continue;
      }
      const damping = Math.exp(-particle.drag * delta);
      particle.velocity.x *= damping;
      particle.velocity.y *= damping;
      particle.position.x += particle.velocity.x * delta;
      particle.position.y += particle.velocity.y * delta;
    }
    if (this.particles.length > 360) this.particles.splice(0, this.particles.length - 360);
  }

  draw(): void {
    this.graphics.clear();
    for (const particle of this.particles) {
      const progress = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      this.graphics.circle(particle.position.x, particle.position.y, particle.size * (0.45 + progress * 0.55)).fill({ color: particle.color, alpha: progress * 0.8 });
    }
  }

  private add(position: Vector2, velocity: Vector2, life: number, size: number, color: number, drag: number): void {
    this.particles.push({ position: { ...position }, velocity, life, maxLife: life, size, color, drag });
  }
}
