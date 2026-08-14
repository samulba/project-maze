/**
 * Die Symbole des Portals.
 *
 * Inline-SVG und keine Icon-Schrift: Das Portal ist ein eigenes Bündel von rund
 * 15 kB, und eine Schriftdatei wäre um ein Vielfaches größer als alles andere
 * auf dieser Seite zusammen. Ein Strich-Set in einem Stil (24er-Raster, 1.7
 * Strichstärke, runde Enden) hält die Navigation ruhig – das ist der halbe
 * Unterschied zwischen „Werkzeug" und „Bastelei".
 */

export type IconName =
  | 'uebersicht'
  | 'spieler'
  | 'klassen'
  | 'liste'
  | 'betrieb'
  | 'aktualisieren'
  | 'abmelden'
  | 'suche'
  | 'warnung'
  | 'haken'
  | 'kopieren'
  | 'google'
  | 'puls'
  | 'menue'
  | 'wiederkehr';

const PFADE: Record<IconName, string> = {
  // Tachometer – „läuft es gerade?"
  uebersicht: '<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="m13.4 10.6 4-4"/><path d="M20.5 17a9 9 0 1 0-17 0"/>',
  spieler: '<path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19"/><circle cx="10" cy="7.5" r="3.5"/><path d="M20 19v-1.4a3.5 3.5 0 0 0-2.6-3.4"/><path d="M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>',
  klassen: '<path d="M4 19V9"/><path d="M9.7 19V5"/><path d="M15.3 19v-7"/><path d="M21 19v-4"/>',
  liste: '<path d="M9.5 6.5H20"/><path d="M9.5 12H20"/><path d="M9.5 17.5H20"/><path d="m4 6.3 1.3 1.3L7.5 5.2"/><path d="m4 11.8 1.3 1.3 2.2-2.4"/><path d="m4 17.3 1.3 1.3 2.2-2.4"/>',
  betrieb: '<rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/><path d="M7 7.25h.01"/><path d="M7 16.75h.01"/>',
  aktualisieren: '<path d="M20 11.5A8 8 0 1 0 18.4 17"/><path d="M20 5.5v6h-6"/>',
  abmelden: '<path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14"/><path d="M17 15.5 20.5 12 17 8.5"/><path d="M20 12H10"/>',
  suche: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m19.5 19.5-4.2-4.2"/>',
  warnung: '<path d="M12 4.8 3.2 19.2h17.6L12 4.8Z"/><path d="M12 10.4v4"/><path d="M12 17h.01"/>',
  haken: '<path d="m5 12.8 4.2 4.2L19 7.2"/>',
  kopieren: '<rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M5.5 15A2 2 0 0 1 4 13V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 1.6"/>',
  // Bewusst gefüllt statt gestrichelt: das Google-G ist eine Marke, keine Ikone.
  google: '<path fill="currentColor" stroke="none" d="M21.6 12.2c0-.7-.06-1.35-.18-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.74 3-4.3 3-7.4Z"/><path fill="currentColor" stroke="none" d="M12 22c2.7 0 4.96-.9 6.6-2.4l-3.2-2.5c-.9.6-2.05.96-3.4.96-2.6 0-4.8-1.76-5.6-4.13H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="currentColor" stroke="none" d="M6.4 13.93a6 6 0 0 1 0-3.84V7.5H3.1a10 10 0 0 0 0 9l3.3-2.57Z"/><path fill="currentColor" stroke="none" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.84-2.84C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.1 7.5l3.3 2.59C7.2 7.73 9.4 5.98 12 5.98Z"/>',
  puls: '<path d="M3 12.5h4l2.2-5.5 4 11 2.4-5.5H21"/>',
  menue: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/>',
  // Ein Pfeil, der umkehrt – „kommt wieder".
  wiederkehr: '<path d="M4 12.5a8 8 0 1 0 2.3-5.6"/><path d="M4 4.5v5h5"/><path d="m10 12.5 2 2 3.5-4"/>'
};

/** Ein Symbol, 24×24, in der Farbe seiner Umgebung. */
export function icon(name: IconName, extra = ''): string {
  return `<svg class="icon${extra ? ` ${extra}` : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PFADE[name]}</svg>`;
}
