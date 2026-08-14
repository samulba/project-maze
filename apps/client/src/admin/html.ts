/**
 * Zwei Handgriffe, die jede Datei des Portals braucht.
 *
 * Eigene Datei, weil `view.ts`, `panels.ts` und `charts.ts` sie alle brauchen
 * und ein Kreisimport zwischen ihnen sonst unvermeidlich wäre.
 */

/**
 * Alles, was aus Daten kommt, geht hier durch, bevor es in eine Vorlage fällt.
 * Auch das Apostroph: Attribute stehen im Portal zwar durchweg in doppelten
 * Anführungszeichen, aber diese Regel muss man dann bei jedem neuen Attribut
 * neu einhalten – billiger ist, sie gar nicht erst zu brauchen.
 */
export const escape = (value: unknown): string => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Klassenliste aus Bedingungen – spart das `${x ? ' an' : ''}` an jeder Stelle. */
export const klassen = (...teile: Array<string | false | null | undefined>): string =>
  teile.filter(Boolean).join(' ');
