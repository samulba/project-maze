import { Application, Container, Graphics } from 'pixi.js';
import { GAME, type PlayerSnapshot, type Vector2, type WorldSnapshot } from '@project-maze/shared';
import type { GameplayWorldExtension } from '@project-maze/shared/gameplay';
import { GUARDIAN_COLOR, arenaEventStyle } from './arena-event-style';
import { DEFAULT_VIEW_MODE, computeViewport, type ViewMode } from './viewport';

type ExtendedSnapshot = WorldSnapshot & Partial<GameplayWorldExtension>;

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

export class GameplayEffects {
  private readonly container = new Container();
  private readonly graphics = new Graphics();
  private readonly mask = new Graphics();
  private snapshot: ExtendedSnapshot | null = null;
  private receivedAt = performance.now();
  private time = 0;

  /**
   * Woher der Sichtfeld-Modus kommt. Die Effekte rechnen Weltpunkte auf den
   * Bildschirm um und müssen dabei **exakt** dieselbe Geometrie benutzen wie
   * der Renderer – zwei Kopien derselben Rechnung wären genau die Art Fehler,
   * die sich als „die Zone sitzt nicht auf dem Kreis" zeigt.
   */
  constructor(private readonly app: Application, private readonly mode: () => ViewMode = () => DEFAULT_VIEW_MODE) {
    this.container.addChild(this.graphics);
    this.container.mask = this.mask;
    this.app.stage.addChild(this.container, this.mask);
    this.app.ticker.add((ticker) => this.render(Math.min(0.05, ticker.deltaMS / 1000)));
  }

  update(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot as ExtendedSnapshot;
    this.receivedAt = performance.now();
  }

  private viewport(): Viewport {
    const { rect, scale } = computeViewport(
      this.app.screen.width || window.innerWidth,
      this.app.screen.height || window.innerHeight,
      this.mode()
    );
    return { ...rect, scale };
  }

  private toScreen(position: Vector2, self: PlayerSnapshot, viewport: Viewport): Vector2 {
    return {
      x: viewport.x + viewport.width / 2 + (position.x - self.position.x) * viewport.scale,
      y: viewport.y + viewport.height / 2 + (position.y - self.position.y) * viewport.scale
    };
  }

  private render(delta: number): void {
    this.time += delta;
    const snapshot = this.snapshot;
    if (!snapshot) return;
    const self = snapshot.players.find((player) => player.id === snapshot.selfId);
    if (!self) return;

    const viewport = this.viewport();
    this.mask.clear().rect(viewport.x, viewport.y, viewport.width, viewport.height).fill(0xffffff);
    this.graphics.clear();
    const estimatedServerNow = snapshot.serverTime + (performance.now() - this.receivedAt);

    const event = snapshot.arenaEvent;
    if (event && arenaEventStyle(event.kind).zoned) {
      const style = arenaEventStyle(event.kind);
      const active = event.phase === 'active';
      const center = this.toScreen(event.center, self, viewport);
      const radius = event.radius * viewport.scale;
      const pulse = 0.72 + Math.sin(this.time * 3.2) * 0.12;
      this.graphics.circle(center.x, center.y, radius)
        .fill({ color: style.ring, alpha: active ? 0.045 : 0.02 })
        .stroke({ color: style.ring, alpha: pulse, width: active ? 3 : 2 });
      this.graphics.circle(center.x, center.y, Math.max(8, radius * 0.08))
        .fill({ color: style.core, alpha: 0.16 + Math.sin(this.time * 4) * 0.05 });
      if (event.kind === 'overcharge') this.drawChargedRim(center, radius, active);
      if (event.kind === 'hunterSignal') this.drawHunterRim(center, radius, active);
    } else if (event) {
      this.drawArenaWideHint(viewport, arenaEventStyle(event.kind), event.phase === 'active');
    }

    const eliteIds = new Set(snapshot.eliteShapeIds ?? []);
    for (const shape of snapshot.shapes) {
      if (!eliteIds.has(shape.id)) continue;
      const position = this.toScreen(shape.position, self, viewport);
      const radius = shape.radius * viewport.scale;
      const pulse = 1 + Math.sin(this.time * 5 + shape.position.x * 0.01) * 0.08;
      this.graphics.circle(position.x, position.y, radius * pulse + 6)
        .fill({ color: 0xf0bd58, alpha: 0.08 })
        .stroke({ color: 0xf4c866, alpha: 0.9, width: 3 });
      this.graphics.circle(position.x, position.y, radius * pulse + 11)
        .stroke({ color: 0xffe3a0, alpha: 0.25, width: 1 });
    }

    for (const player of snapshot.players) {
      if (player.dead) continue;
      const position = this.toScreen(player.position, self, viewport);
      const gameplay = snapshot.gameplay?.[player.id];
      const color = player.id === snapshot.selfId ? 0x7d88ff : 0xe7677b;

      if (player.id === snapshot.arenaGuardianId) {
        const pulse = 1 + Math.sin(this.time * 2.6) * 0.05;
        const radius = (GAME.playerRadius + 18) * viewport.scale * pulse;
        this.graphics.circle(position.x, position.y, radius)
          .fill({ color: GUARDIAN_COLOR, alpha: 0.05 })
          .stroke({ color: GUARDIAN_COLOR, alpha: 0.95, width: 4 });
        this.graphics.circle(position.x, position.y, radius + 7 * viewport.scale)
          .stroke({ color: 0xffe3a0, alpha: 0.35, width: 1.5 });
        const healthRatio = player.maxHealth > 0 ? Math.max(0, Math.min(1, player.health / player.maxHealth)) : 0;
        const barWidth = 110 * viewport.scale;
        const barY = position.y - (GAME.playerRadius + 34) * viewport.scale;
        this.graphics.roundRect(position.x - barWidth / 2, barY, barWidth, 6, 3).fill({ color: 0x000000, alpha: 0.55 });
        this.graphics.roundRect(position.x - barWidth / 2, barY, barWidth * healthRatio, 6, 3).fill({ color: GUARDIAN_COLOR, alpha: 0.95 });
      }

      if (player.id === snapshot.bountyTargetId) {
        const pulse = 1 + Math.sin(this.time * 4) * 0.06;
        this.graphics.circle(position.x, position.y, (GAME.playerRadius + 14) * viewport.scale * pulse)
          .stroke({ color: 0xf3c45f, alpha: 0.9, width: 3 });
        const top = position.y - (GAME.playerRadius + 24) * viewport.scale;
        this.graphics.poly([
          position.x - 8, top + 7,
          position.x - 4, top,
          position.x, top + 5,
          position.x + 4, top,
          position.x + 8, top + 7
        ]).fill({ color: 0xf3c45f, alpha: 0.95 });
      }

      if (!gameplay || gameplay.moduleActiveUntil <= estimatedServerNow) continue;
      const remainingRatio = clamp((gameplay.moduleActiveUntil - estimatedServerNow) / 3_000, 0, 1);
      if (gameplay.activeModule === 'repulse') {
        const radius = 195 * viewport.scale * (0.82 + Math.sin(this.time * 10) * 0.04);
        this.graphics.circle(position.x, position.y, radius)
          .fill({ color: 0x73e3bd, alpha: 0.035 })
          .stroke({ color: 0x73e3bd, alpha: 0.68, width: 3 });
      } else if (gameplay.activeModule === 'barrier') {
        const radius = (GAME.playerRadius + 17) * viewport.scale;
        const ratio = gameplay.barrierMaxHealth > 0 ? gameplay.barrierHealth / gameplay.barrierMaxHealth : 0;
        this.drawArc(position, radius, player.angle - 1.15, player.angle + 1.15, {
          color: 0x81a7ff,
          alpha: 0.45 + ratio * 0.5,
          width: 5
        });
      } else if (gameplay.activeModule === 'repair') {
        const radius = (GAME.playerRadius + 12 + (1 - remainingRatio) * 5) * viewport.scale;
        this.graphics.circle(position.x, position.y, radius)
          .fill({ color: 0x69d79b, alpha: 0.045 })
          .stroke({ color: 0x69d79b, alpha: 0.72, width: 3 });
      } else {
        const radius = (GAME.playerRadius + 10) * viewport.scale;
        this.graphics.circle(position.x, position.y, radius)
          .stroke({ color, alpha: 0.58, width: 3 });
      }
    }
  }

  /**
   * Hinweis für ortlose Events (Fracture): ein langsam atmender Rahmen am
   * Sichtfeldrand. Er zeigt „überall“, ohne auf eine Stelle zu deuten, und
   * bleibt aus dem Blickfeld der Arena heraus.
   */
  private drawArenaWideHint(
    viewport: Viewport,
    style: { ring: number; core: number },
    active: boolean
  ): void {
    const breath = 0.5 + Math.sin(this.time * 1.5) * 0.5;
    const base = active ? 0.46 : 0.2;
    for (let index = 0; index < 3; index += 1) {
      const inset = 3 + index * 7;
      const alpha = base * (1 - index * 0.3) * (0.55 + breath * 0.45);
      this.graphics
        .roundRect(
          viewport.x + inset,
          viewport.y + inset,
          viewport.width - inset * 2,
          viewport.height - inset * 2,
          10
        )
        .stroke({ color: index === 0 ? style.core : style.ring, alpha, width: index === 0 ? 2 : 1.5 });
    }
  }

  /**
   * Overcharge: kurze Speichen am Zonenrand, die im Takt wandern – liest sich
   * als Spannung, ohne den Blick auf die Arena zu stören.
   */
  private drawChargedRim(center: Vector2, radius: number, active: boolean): void {
    const spokes = 18;
    const drift = this.time * (active ? 0.9 : 0.35);
    const length = radius * (active ? 0.075 : 0.045);
    for (let index = 0; index < spokes; index += 1) {
      const angle = drift + (index / spokes) * Math.PI * 2;
      const flicker = 0.35 + Math.abs(Math.sin(this.time * 7 + index)) * 0.5;
      const inner = radius - length;
      this.graphics
        .moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner)
        .lineTo(center.x + Math.cos(angle) * (radius + length * 0.5), center.y + Math.sin(angle) * (radius + length * 0.5))
        .stroke({ color: 0x9ce4ff, alpha: (active ? 0.7 : 0.3) * flicker, width: 2 });
    }
  }

  /** Hunter Signal: langsam rotierendes Fadenkreuz auf der Zone. */
  private drawHunterRim(center: Vector2, radius: number, active: boolean): void {
    const alpha = active ? 0.72 : 0.32;
    const sweep = this.time * 0.55;
    for (let index = 0; index < 4; index += 1) {
      const angle = sweep + (index / 4) * Math.PI * 2;
      const inner = radius * 0.82;
      const outer = radius * 1.04;
      this.graphics
        .moveTo(center.x + Math.cos(angle) * inner, center.y + Math.sin(angle) * inner)
        .lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer)
        .stroke({ color: 0xf7c766, alpha, width: 2.5 });
    }
    this.graphics.circle(center.x, center.y, radius * 0.82)
      .stroke({ color: 0xff6b4a, alpha: alpha * 0.5, width: 1.5 });
  }

  private drawArc(
    center: Vector2,
    radius: number,
    start: number,
    end: number,
    style: { color: number; alpha: number; width: number }
  ): void {
    const segments = 24;
    for (let index = 0; index <= segments; index += 1) {
      const ratio = index / segments;
      const angle = start + (end - start) * ratio;
      const x = center.x + Math.cos(angle) * radius;
      const y = center.y + Math.sin(angle) * radius;
      if (index === 0) this.graphics.moveTo(x, y);
      else this.graphics.lineTo(x, y);
    }
    this.graphics.stroke(style);
  }
}
