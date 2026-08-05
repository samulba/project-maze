import type { WorldSnapshot } from '@project-maze/shared';
import {
  KILLCAM_WINDOW_MS,
  KillcamRecorder,
  buildReplay,
  resolveKillerId,
  type KillcamActor,
  type KillcamFrame
} from './killcam';

/** Wiedergabegeschwindigkeit – langsam genug, um den tödlichen Moment zu lesen. */
const PLAYBACK_SPEED = 0.55;
/** Standbild am Ende, bevor die Schleife neu startet. */
const FREEZE_MS = 900;
/** 0 = Kamera auf dem Killer, 1 = auf dem Opfer. */
const KILLER_BIAS = 0.35;
/** Luft um beide Tanks herum, in Weltkoordinaten. */
const FRAME_PADDING = 190;

interface ReplayState {
  frames: KillcamFrame[];
  victimId: string;
  killerId: string | null;
  killerName: string;
  /** Letzte bekannte Position des Killers – hält die Kamera ruhig, wenn er in
   *  einem Frame fehlt (außerhalb des Aufzeichnungsradius oder verdeckt). */
  killerAnchor: KillcamActor | null;
  startedAt: number;
  duration: number;
}

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;

const cssColor = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
};

/**
 * Zeichnet den gepufferten Rückblick in ein eigenes 2D-Canvas im Death-Screen.
 * Bewusst getrennt vom Pixi-Renderer: Die Wiedergabe läuft, während die Arena
 * im Hintergrund normal weiterläuft.
 */
export class KillcamView {
  private readonly recorder = new KillcamRecorder();
  private readonly figure: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly caption: HTMLElement;
  private readonly progress: HTMLElement;
  private replay: ReplayState | null = null;
  private frameHandle: number | null = null;
  private wasDead = false;
  private mounted = false;

  constructor(private readonly root: HTMLElement) {
    this.figure = document.createElement('figure');
    this.figure.className = 'killcam';
    this.figure.hidden = true;
    this.figure.innerHTML = `
      <canvas class="killcam-canvas"></canvas>
      <span class="killcam-badge">KILLCAM · ${Math.round(PLAYBACK_SPEED * 100)}%</span>
      <figcaption class="killcam-caption" data-killcam-caption></figcaption>
      <span class="killcam-progress"><i data-killcam-progress></i></span>`;
    this.canvas = this.figure.querySelector<HTMLCanvasElement>('.killcam-canvas')!;
    this.caption = this.figure.querySelector<HTMLElement>('[data-killcam-caption]')!;
    this.progress = this.figure.querySelector<HTMLElement>('[data-killcam-progress]')!;
  }

  /** Aufzeichnen und – beim Übergang ins Sterben – Wiedergabe starten. */
  update(snapshot: WorldSnapshot): void {
    const self = snapshot.players.find((player) => player.id === snapshot.selfId);
    if (!self) return;
    this.mount();

    if (!self.dead) {
      this.recorder.record(snapshot);
      if (this.wasDead) this.stop();
      this.wasDead = false;
      return;
    }

    if (!this.wasDead) {
      this.wasDead = true;
      this.start(self.id, self.killerName);
    }
  }

  /** Bei Verbindungsverlust: Puffer verwerfen, damit kein fremder Run nachwirkt. */
  reset(): void {
    this.stop();
    this.recorder.clear();
    this.wasDead = false;
  }

  private mount(): void {
    if (this.mounted) return;
    const card = this.root.querySelector<HTMLElement>('.death-card');
    if (!card) return;
    const stats = card.querySelector<HTMLElement>('.death-stats');
    if (stats) card.insertBefore(this.figure, stats);
    else card.append(this.figure);
    this.mounted = true;
  }

  private start(victimId: string, killerName: string): void {
    const frames = buildReplay(this.recorder.takeFrames(), victimId, KILLCAM_WINDOW_MS);
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last || last.time - first.time < 400) {
      this.figure.hidden = true;
      return;
    }
    const killerId = resolveKillerId(frames, victimId, killerName);
    this.replay = {
      frames,
      victimId,
      killerId,
      killerName: killerName.trim(),
      killerAnchor: killerId ? lastKnownActor(frames, killerId) : null,
      startedAt: performance.now(),
      duration: last.time - first.time
    };
    this.figure.hidden = false;
    this.caption.textContent = this.replay.killerId
      ? `Letzte ${(this.replay.duration / 1000).toFixed(1)}s – Blick auf ${this.replay.killerName}`
      : `Letzte ${(this.replay.duration / 1000).toFixed(1)}s deines Runs`;
    if (this.frameHandle === null) this.frameHandle = requestAnimationFrame(() => this.draw());
  }

  private stop(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.replay = null;
    this.figure.hidden = true;
  }

  private draw(): void {
    this.frameHandle = null;
    const replay = this.replay;
    if (!replay) return;
    this.frameHandle = requestAnimationFrame(() => this.draw());
    // Solange der Death-Screen ausgeblendet ist, nicht rendern (spart Akku).
    if (this.figure.clientWidth <= 0) return;

    const context = this.resizeCanvas();
    if (!context) return;

    const cycle = replay.duration / PLAYBACK_SPEED + FREEZE_MS;
    const position = (performance.now() - replay.startedAt) % cycle;
    const elapsed = Math.min(replay.duration, position * PLAYBACK_SPEED);
    const first = replay.frames[0];
    if (!first) return;
    const frame = sampleFrame(replay.frames, first.time + elapsed);
    if (!frame) return;

    const width = this.canvas.width / devicePixelScale();
    const height = this.canvas.height / devicePixelScale();
    const victim = frame.actors.find((actor) => actor.id === replay.victimId) ?? null;
    const killer = replay.killerId ? frame.actors.find((actor) => actor.id === replay.killerId) ?? null : null;
    // Fürs Framing zählt auch der zuletzt bekannte Standort – gezeichnet wird
    // aber nur, wer im Frame wirklich da ist.
    const view = framing(victim, killer ?? replay.killerAnchor, width, height);

    const accent = cssColor('--accent', '#7d88ff');
    const danger = cssColor('--danger', '#ef687c');
    const text = cssColor('--text', '#f3f5fb');

    context.setTransform(devicePixelScale(), 0, 0, devicePixelScale(), 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = cssColor('--bg', '#070910');
    context.fillRect(0, 0, width, height);

    const toScreen = (x: number, y: number): [number, number] => [
      width / 2 + (x - view.centerX) * view.scale,
      height / 2 + (y - view.centerY) * view.scale
    ];

    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();

    // Kulisse: Wände als ruhige Flächen, damit die Szene verortbar bleibt.
    context.fillStyle = 'rgba(255,255,255,.07)';
    for (const wall of frame.walls) {
      const [x, y] = toScreen(wall.x, wall.y);
      context.fillRect(x, y, wall.width * view.scale, wall.height * view.scale);
    }

    for (const shot of frame.shots) {
      const [x, y] = toScreen(shot.x, shot.y);
      context.beginPath();
      context.fillStyle = shot.ownerId === replay.victimId ? accent : danger;
      context.globalAlpha = shot.ownerId === replay.killerId ? 1 : 0.55;
      context.arc(x, y, Math.max(1.5, shot.radius * view.scale), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    for (const actor of frame.actors) {
      if (actor.dead) continue;
      const isVictim = actor.id === replay.victimId;
      const isKiller = actor.id === replay.killerId;
      const [x, y] = toScreen(actor.x, actor.y);
      const radius = Math.max(4, actor.radius * view.scale);

      context.beginPath();
      context.fillStyle = isVictim ? accent : isKiller ? danger : 'rgba(255,255,255,.34)';
      context.globalAlpha = isVictim || isKiller ? 1 : 0.6;
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;

      // Laufrichtung – zeigt, worauf der Killer gezielt hat.
      if (isVictim || isKiller) {
        context.beginPath();
        context.strokeStyle = isVictim ? accent : danger;
        context.lineWidth = Math.max(2, radius * 0.36);
        context.moveTo(x, y);
        context.lineTo(x + Math.cos(actor.angle) * radius * 1.9, y + Math.sin(actor.angle) * radius * 1.9);
        context.stroke();

        context.beginPath();
        context.strokeStyle = isVictim ? accent : danger;
        context.globalAlpha = 0.5;
        context.lineWidth = 1.5;
        context.arc(x, y, radius + 6, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;

        context.fillStyle = text;
        context.font = '600 11px Inter, system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText(isVictim ? 'DU' : actor.name, x, y - radius - 10);
      }
    }
    context.restore();

    this.progress.style.width = `${Math.round((elapsed / Math.max(1, replay.duration)) * 100)}%`;
  }

  private resizeCanvas(): CanvasRenderingContext2D | null {
    const ratio = devicePixelScale();
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    return this.canvas.getContext('2d');
  }
}

const devicePixelScale = (): number => Math.min(window.devicePixelRatio || 1, 2);

/**
 * Kamera: auf den Killer schauen, das Opfer aber im Bild behalten.
 * Ohne Killer (Arena-Tod) bleibt die Kamera beim Opfer.
 */
export function framing(
  victim: KillcamActor | null,
  killer: KillcamActor | null,
  width: number,
  height: number
): { centerX: number; centerY: number; scale: number } {
  const focus = killer ?? victim;
  if (!focus) return { centerX: 0, centerY: 0, scale: 0.24 };
  if (!killer || !victim) return { centerX: focus.x, centerY: focus.y, scale: 0.3 };

  const centerX = lerp(killer.x, victim.x, KILLER_BIAS);
  const centerY = lerp(killer.y, victim.y, KILLER_BIAS);
  // Die Spanne muss von der tatsächlichen – zum Killer verschobenen – Mitte aus
  // gerechnet werden, sonst rutscht das Opfer aus dem Bild.
  const spanX = 2 * Math.max(Math.abs(killer.x - centerX), Math.abs(victim.x - centerX)) + FRAME_PADDING;
  const spanY = 2 * Math.max(Math.abs(killer.y - centerY), Math.abs(victim.y - centerY)) + FRAME_PADDING;
  const scale = Math.min(0.42, Math.max(0.1, Math.min(width / spanX, height / spanY)));
  return { centerX, centerY, scale };
}

/** Der jüngste aufgezeichnete Zustand eines Tanks – oder `null`, wenn er nie auftaucht. */
export function lastKnownActor(frames: KillcamFrame[], id: string): KillcamActor | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const found = frames[index]?.actors.find((actor) => actor.id === id);
    if (found) return found;
  }
  return null;
}

/** Interpoliert zwischen den beiden Frames um `time`. */
export function sampleFrame(frames: KillcamFrame[], time: number): KillcamFrame | null {
  if (frames.length === 0) return null;
  let index = 0;
  while (index < frames.length - 2 && (frames[index + 1]?.time ?? Infinity) <= time) index += 1;
  const current = frames[index];
  const next = frames[index + 1];
  if (!current) return null;
  if (!next) return current;

  const span = next.time - current.time;
  const alpha = span <= 0 ? 0 : Math.max(0, Math.min(1, (time - current.time) / span));
  const upcoming = new Map(next.actors.map((actor) => [actor.id, actor] as const));
  return {
    time,
    actors: current.actors.map((actor) => {
      const target = upcoming.get(actor.id);
      if (!target) return actor;
      return {
        ...actor,
        x: lerp(actor.x, target.x, alpha),
        y: lerp(actor.y, target.y, alpha),
        angle: actor.angle + angleDelta(actor.angle, target.angle) * alpha,
        health: lerp(actor.health, target.health, alpha),
        dead: alpha > 0.5 ? target.dead : actor.dead
      };
    }),
    shots: alpha < 0.5 ? current.shots : next.shots,
    walls: alpha < 0.5 ? current.walls : next.walls
  };
}

function angleDelta(from: number, to: number): number {
  let difference = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}
