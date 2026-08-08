import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Zwei Einstiegspunkte, zwei Bündel.
 *
 * `index.html` ist das Spiel (rund 680 kB, davon der größte Teil PixiJS),
 * `admin.html` das Portal für Sam. Sie teilen sich nur, was beide wirklich
 * brauchen – den Klassenkatalog aus `shared` und den Supabase-Login. Ein
 * gemeinsames Bündel hätte bedeutet, dass ein Blick auf die Spielerzahlen die
 * gesamte Render-Engine lädt.
 */
export default defineConfig({
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html')
      }
    }
  }
});
