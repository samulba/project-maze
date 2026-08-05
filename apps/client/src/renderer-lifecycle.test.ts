// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { GameRenderer } from './renderer';

/**
 * Regression: Vor `init()` existiert kein PixiJS-Renderer. `setTheme` wurde beim
 * Beitritt aufgerufen und griff ungeprüft auf `app.renderer.background` zu – auf
 * langsamen Geräten (PixiJS lädt seine Renderer-Chunks dynamisch nach) starb damit
 * der komplette Join-Klick, ohne dass eine Verbindung aufgebaut wurde.
 */
describe('renderer lifecycle', () => {
  it('survives setTheme before init and reports not ready', () => {
    const renderer = new GameRenderer();
    expect(renderer.ready).toBe(false);
    expect(() => renderer.setTheme('neon')).not.toThrow();
    expect(() => renderer.setTheme('midnight')).not.toThrow();
  });

  it('falls back to a known palette for an unknown theme', () => {
    const renderer = new GameRenderer();
    expect(() => renderer.setTheme('gibt-es-nicht' as never)).not.toThrow();
  });
});
