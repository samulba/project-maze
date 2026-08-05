/**
 * Ruhige Arena-Andeutung hinter dem Startscreen: zweistufiges Gitter und ein
 * paar langsam driftende Formen in den Farben der echten Shapes.
 *
 * Bewusst zurückhaltend – nichts blinkt, nichts pulst. Die Bewegung soll man
 * erst bemerken, wenn man hinschaut.
 */

export interface BackdropShape {
  x: number;
  y: number;
  radius: number;
  sides: number;
  rotation: number;
  /** Umdrehungen pro Sekunde (Bogenmaß). */
  spin: number;
  driftX: number;
  driftY: number;
  color: string;
  alpha: number;
}

/**
 * Farben der echten Arena-Formen – in derselben gedeckten Stufe wie im
 * Spielfeld. Der Marken-Akzent ist hier bewusst raus: Auf dem Startscreen
 * leuchtet nur der Knopf.
 */
const SHAPE_COLORS = ['#a8a8a8', '#b3ad8f', '#9fa3bc', '#adadad'] as const;
const GRID_FINE = 68;
const GRID_COARSE = 340;

/**
 * Erzeugt die Formen deterministisch aus einer übergebenen Zufallsquelle –
 * so lässt sich das Layout ohne Flackern testen.
 */
export function createBackdropShapes(
  width: number,
  height: number,
  count: number,
  random: () => number
): BackdropShape[] {
  const shapes: BackdropShape[] = [];
  for (let index = 0; index < count; index += 1) {
    const sides = 3 + Math.floor(random() * 3);
    const angle = random() * Math.PI * 2;
    const speed = 5 + random() * 13;
    shapes.push({
      x: random() * width,
      y: random() * height,
      radius: 14 + random() * 42,
      sides,
      rotation: random() * Math.PI * 2,
      spin: (random() - 0.5) * 0.32,
      driftX: Math.cos(angle) * speed,
      driftY: Math.sin(angle) * speed,
      color: SHAPE_COLORS[index % SHAPE_COLORS.length] ?? SHAPE_COLORS[0],
      // Bewusst sehr blass: Die Formen sollen Tiefe geben, nicht mit dem
      // Schriftzug konkurrieren, über den sie gelegentlich hinwegziehen.
      alpha: 0.032 + random() * 0.042
    });
  }
  return shapes;
}

/** Lässt Formen am gegenüberliegenden Rand wieder eintreten. */
export function wrapShape(shape: BackdropShape, width: number, height: number): void {
  const margin = shape.radius + 20;
  if (shape.x < -margin) shape.x = width + margin;
  else if (shape.x > width + margin) shape.x = -margin;
  if (shape.y < -margin) shape.y = height + margin;
  else if (shape.y > height + margin) shape.y = -margin;
}

/** Wie viele Formen bei dieser Fläche angemessen sind (klein = weniger). */
export function shapeCountFor(width: number, height: number): number {
  const area = Math.max(1, width * height);
  return Math.max(6, Math.min(18, Math.round(area / 90_000)));
}

export class StartBackdrop {
  private readonly canvas: HTMLCanvasElement;
  private shapes: BackdropShape[] = [];
  private frame: number | null = null;
  private lastFrameAt = 0;
  private width = 0;
  private height = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly onResize = (): void => this.resize();
  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause();
    else if (this.running) this.schedule();
  };
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resize();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    // Bei reduzierter Bewegung bleibt es bei einem einzigen, ruhigen Bild.
    if (this.reducedMotion) this.draw();
    else this.schedule();
  }

  /** Beendet die Animation endgültig – nach dem Start wird der Screen entfernt. */
  stop(): void {
    this.running = false;
    this.pause();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private pause(): void {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private schedule(): void {
    if (this.frame !== null) return;
    this.lastFrameAt = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    this.frame = null;
    if (!this.running) return;
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFrameAt) / 1000));
    this.lastFrameAt = now;
    for (const shape of this.shapes) {
      shape.x += shape.driftX * delta;
      shape.y += shape.driftY * delta;
      shape.rotation += shape.spin * delta;
      wrapShape(shape, this.width, this.height);
    }
    this.draw();
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const changed = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    if (changed || this.shapes.length === 0) {
      this.shapes = createBackdropShapes(width, height, shapeCountFor(width, height), Math.random);
    }
    this.draw();
  }

  private draw(): void {
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(0,0,0,.035)';
    context.beginPath();
    for (let x = 0; x <= this.width; x += GRID_FINE) { context.moveTo(x, 0); context.lineTo(x, this.height); }
    for (let y = 0; y <= this.height; y += GRID_FINE) { context.moveTo(0, y); context.lineTo(this.width, y); }
    context.stroke();

    context.strokeStyle = 'rgba(40,50,80,.06)';
    context.beginPath();
    for (let x = 0; x <= this.width; x += GRID_COARSE) { context.moveTo(x, 0); context.lineTo(x, this.height); }
    for (let y = 0; y <= this.height; y += GRID_COARSE) { context.moveTo(0, y); context.lineTo(this.width, y); }
    context.stroke();

    for (const shape of this.shapes) {
      context.save();
      context.translate(shape.x, shape.y);
      context.rotate(shape.rotation);
      context.beginPath();
      for (let index = 0; index < shape.sides; index += 1) {
        const angle = (index / shape.sides) * Math.PI * 2;
        const px = Math.cos(angle) * shape.radius;
        const py = Math.sin(angle) * shape.radius;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.globalAlpha = shape.alpha;
      context.fillStyle = shape.color;
      context.fill();
      context.globalAlpha = shape.alpha * 1.7;
      context.lineWidth = 1.5;
      context.strokeStyle = shape.color;
      context.stroke();
      context.restore();
    }
    context.globalAlpha = 1;
  }
}
