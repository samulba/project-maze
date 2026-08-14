/**
 * Zahlen so schreiben, wie man sie im Vorbeigehen liest.
 *
 * Ein Portal, in das Sam täglich zehn Sekunden schaut, lebt davon, dass keine
 * Zahl entziffert werden muss. Deshalb: Tausenderpunkte, Dauern in Einheiten
 * statt Sekunden, und Veränderungen mit Vorzeichen.
 */

const NUMBER = new Intl.NumberFormat('de-DE');
const DECIMAL = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const zahl = (value: number): string => NUMBER.format(Math.round(value));
export const komma = (value: number): string => DECIMAL.format(value);

/** Dauer in der größten sinnvollen Einheit: 45 s, 12 min, 3,4 h, 2,1 d. */
export function dauer(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 s';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${komma(hours)} h`;
  return `${komma(hours / 24)} d`;
}

/** „vor 3 min", „vor 2 h", „gerade eben". Für Zeitpunkte in der Vergangenheit. */
export function seit(iso: string | null, now = Date.now()): string {
  if (!iso) return '–';
  const stamp = Date.parse(iso);
  if (!Number.isFinite(stamp)) return '–';
  const seconds = Math.max(0, (now - stamp) / 1000);
  if (seconds < 45) return 'gerade eben';
  return `vor ${dauer(seconds)}`;
}

/** Tagesbeschriftung für die Verlaufskurve: „7.8." */
export function tag(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return '';
  return `${stamp.getUTCDate()}.${stamp.getUTCMonth() + 1}.`;
}

/** Datum und Uhrzeit, kurz. */
export function zeitpunkt(iso: string | null): string {
  if (!iso) return '–';
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return '–';
  return stamp.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Veränderung gegen einen Vergleichswert, in Prozent und mit Vorzeichen.
 * `null` heißt „kein Vergleich möglich" – ein Wachstum von 0 auf 5 ist keine
 * Steigerung um unendlich Prozent, sondern schlicht ein Anfang.
 */
export function trend(current: number, previous: number): { text: string; richtung: 'hoch' | 'runter' | 'gleich' } | null {
  if (previous <= 0) return null;
  const change = (current - previous) / previous * 100;
  if (Math.abs(change) < 1) return { text: '±0 %', richtung: 'gleich' };
  const richtung = change > 0 ? 'hoch' : 'runter';
  return { text: `${change > 0 ? '+' : '−'}${Math.round(Math.abs(change))} %`, richtung };
}

/** Kürzt eine Geräte-ID auf etwas, das man vorlesen kann. */
export const kurzId = (value: string): string => (value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value);

/**
 * Kurzform für enge Stellen – Achsenbeschriftungen, Kacheln in der Seitenleiste.
 * `1.200` braucht dort dreimal so viel Platz wie `1,2k` und sagt dasselbe.
 */
export function kompakt(value: number): string {
  const betrag = Math.abs(value);
  if (betrag < 1_000) return zahl(value);
  if (betrag < 1_000_000) return `${komma(value / 1_000)}k`;
  return `${komma(value / 1_000_000)}M`;
}

/**
 * Initialen für den Kreis vor einem Spielernamen.
 *
 * Ein Avatar ist hier kein Schmuck: Die Spielerliste ist die einzige Tabelle,
 * in der die erste Spalte kein Wert ist, sondern ein Mensch. Ein Anker fürs
 * Auge macht aus 50 Zeilen 50 unterscheidbare Zeilen.
 */
export function initialen(name: string | null): string {
  const teile = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  if (teile.length === 1) return teile[0]!.slice(0, 2).toUpperCase();
  return `${teile[0]![0]}${teile[teile.length - 1]![0]}`.toUpperCase();
}

/**
 * Ein stabiler Farbton je Name – gleiche Person, gleiche Farbe, über Neuladen
 * hinweg. Bewusst ein Hash und keine Zufallszahl: Ein Avatar, der bei jedem
 * Poll die Farbe wechselt, ist schlimmer als gar keiner.
 */
export function farbton(saat: string): number {
  let hash = 0;
  for (let index = 0; index < saat.length; index += 1) hash = (hash * 31 + saat.charCodeAt(index)) % 360;
  return hash;
}
