import { GAME } from '@project-maze/shared';

/**
 * Geometrie des Sichtfelds – wie viel Bildschirm das Spielfeld bekommt und wie
 * viel Welt darin steckt.
 *
 * Das lag bisher als Rechnung mitten in `renderer.ts` und war damit nur über
 * Screenshots prüfbar. Hier ist es eine Funktion über zwei Zahlen: Aus
 * Bildschirmbreite und -höhe fallen das Rechteck auf dem Schirm und der
 * sichtbare Weltausschnitt heraus, sonst nichts.
 *
 * ## Die beiden Modi
 *
 * `fest` ist der bisherige Zustand: ein starres 16:9-Rechteck, mittig, der Rest
 * bleibt schwarz. Der MASTERPLAN begründet das mit Fairness – wer breiter
 * sieht, sieht Gegner früher. Auf einem 21:9-Schirm kostet das ein Viertel der
 * Fläche (2560×1080: je 320 px links und rechts).
 *
 * `flaechengleich` behält die Fairness, ohne die Fläche zu verschenken: Nicht
 * die *Form* des Ausschnitts ist fest, sondern seine **Fläche**. Ein breiter
 * Schirm sieht weiter zur Seite und dafür weniger nach oben und unten; das
 * Produkt bleibt bei 1600 × 900 Einheiten. Bei 16:9 kommt exakt dieselbe Sicht
 * heraus wie bisher – nachgewiesen im Test, nicht nur behauptet.
 */

export type ViewMode = 'fest' | 'flaechengleich';

export const DEFAULT_VIEW_MODE: ViewMode = 'fest';

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  fest: 'Fest 16:9',
  flaechengleich: 'Bildschirmfüllend'
};

/** Sichtbare Weltfläche in Quadrat-Einheiten. Über alle Seitenverhältnisse gleich. */
export const VIEW_AREA = GAME.visibleWorldWidth * GAME.visibleWorldHeight;

/**
 * Grenzen des Seitenverhältnisses.
 *
 * Sie kommen **nicht** aus dem Geschmack, sondern aus der Sichtgrenze des
 * Servers: `wallsInView` schneidet Wände bei `visibleWorldWidth · 0,62`
 * (992 Einheiten) und `visibleWorldHeight · 0,72` (648) ab, Entitäten fallen
 * bei `viewRadius` (1100) weg. Sieht der Client weiter als das, tauchen Wände
 * am Bildrand aus dem Nichts auf. `viewportLimits()` rechnet nach, dass die
 * Grenzen unterhalb bleiben – ein Test hält es fest, damit eine spätere
 * Änderung an den Server-Konstanten hier auffällt und nicht im Spiel.
 */
export const MIN_ASPECT = 1;
export const MAX_ASPECT = 2.4;

export interface ViewportRect { x: number; y: number; width: number; height: number }
/** Ausschnitt der Welt, der in das Rechteck passt. */
export interface WorldView { width: number; height: number }
export interface Viewport { rect: ViewportRect; world: WorldView; scale: number }

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/** Weltausschnitt zu einem Seitenverhältnis – Fläche konstant. */
export function worldViewFor(aspect: number): WorldView {
  const safe = clamp(Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9, MIN_ASPECT, MAX_ASPECT);
  return { width: Math.sqrt(VIEW_AREA * safe), height: Math.sqrt(VIEW_AREA / safe) };
}

/**
 * Rechteck und Weltausschnitt für einen Bildschirm.
 *
 * Alle Kanten liegen auf ganzen Pixeln: Krumme Werte aus der Zentrierung waren
 * einer der beiden Gründe für die sichtbaren Striche an den Bildschirmrändern.
 */
export function computeViewport(screenWidth: number, screenHeight: number, mode: ViewMode): Viewport {
  const sw = Math.max(1, Math.round(screenWidth));
  const sh = Math.max(1, Math.round(screenHeight));
  const target = mode === 'fest'
    ? 16 / 9
    : clamp(sw / sh, MIN_ASPECT, MAX_ASPECT);
  // In das Fenster einpassen: Entweder die Breite oder die Höhe wird knapp.
  let width = Math.max(1, Math.floor(Math.min(sw, sh * target)));
  let height = Math.max(1, Math.floor(width / target));
  if (height > sh) {
    height = sh;
    width = Math.max(1, Math.floor(height * target));
  }
  const world = mode === 'fest'
    ? { width: GAME.visibleWorldWidth, height: GAME.visibleWorldHeight }
    : worldViewFor(target);
  return {
    rect: { x: Math.floor((sw - width) / 2), y: Math.floor((sh - height) / 2), width, height },
    world,
    scale: height / world.height
  };
}

/**
 * Wie weit der Client im ungünstigsten erlaubten Fall sieht, gegen das, was der
 * Server liefert. Grundlage des Tests, der die Seitenverhältnis-Grenzen
 * absichert – gerechnet, nicht geraten.
 */
export function viewportLimits(): {
  halbeBreite: number; halbeHoehe: number; halbeDiagonale: number;
  serverWandBreite: number; serverWandHoehe: number; serverRadius: number;
} {
  const breit = worldViewFor(MAX_ASPECT);
  const hoch = worldViewFor(MIN_ASPECT);
  return {
    halbeBreite: breit.width / 2,
    halbeHoehe: hoch.height / 2,
    halbeDiagonale: Math.hypot(breit.width / 2, breit.height / 2),
    serverWandBreite: GAME.visibleWorldWidth * 0.62,
    serverWandHoehe: GAME.visibleWorldHeight * 0.72,
    serverRadius: GAME.viewRadius
  };
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === 'fest' || value === 'flaechengleich';
}

/** Gespeicherte Wahl; alles Unbekannte fällt auf den bisherigen Zustand zurück. */
export function readViewMode(raw: string | null): ViewMode {
  return isViewMode(raw) ? raw : DEFAULT_VIEW_MODE;
}
