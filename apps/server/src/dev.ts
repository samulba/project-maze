process.env.ENABLE_DEV_TOOLS ??= 'true';
/*
 * Das Passwort-Tor ist in der Entwicklung aus.
 *
 * Nicht aus Bequemlichkeit: In der Entwicklung liefert Vite die Seite auf Port
 * 5173 aus, der Spielserver hoert auf 2567. Das Tor-Cookie wird beim Login auf
 * 2567 gesetzt – wer nur die Vite-Seite oeffnet, hat es nie und faellt beim
 * WebSocket-Handshake mit `1008 Locked` heraus. Das Spiel waere lokal
 * unbenutzbar, ohne dass die Ursache irgendwo sichtbar wuerde.
 *
 * Dieser Weg ist sicher, weil Produktion diese Datei nie anfasst: Das Image
 * startet `node apps/server/dist/index.js` (siehe Dockerfile und
 * railway.json), nicht `dev.ts`. Und `??=` heisst: Wer das Tor lokal doch
 * pruefen will, setzt `SITE_GATE_ENABLED=true` und bekommt es.
 */
process.env.SITE_GATE_ENABLED ??= 'false';
await import('./index.js');

export {};
