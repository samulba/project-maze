import type { MapInfo } from '@project-maze/shared';

/**
 * Statisches Kartenlayout (`GET /map`) – einmal geholt statt bei jedem
 * Snapshot. Sam: „Die Minimap unten rechts sollte die GANZE Map zeigen und
 * nicht nur, wo man gerade ist." `WorldSnapshot.walls` liefert dafür nur die
 * nahen Wände (siehe `wallsInView` im Server); die ganze Karte ändert sich
 * während einer laufenden Session nie, ein einziger Abruf reicht also.
 */

export interface OriginLike {
  protocol: string;
  hostname: string;
  host: string;
}

/** Spiegelt dieselbe Adresslogik wie leaderboardUrl/profileUpdateUrl. */
export function mapUrl(origin: OriginLike, dev: boolean): string {
  const base = dev ? `${origin.protocol}//${origin.hostname}:2567` : `${origin.protocol}//${origin.host}`;
  return `${base}/map`;
}

/**
 * `null` bei jedem Fehler (kein Netz, älterer Server ohne den Endpunkt,
 * Zeitüberschreitung) – die Minimap fällt dann auf die alte, kameranahe
 * Ansicht zurück statt zu zerbrechen.
 */
export async function fetchMapInfo(origin: OriginLike, dev: boolean): Promise<MapInfo | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(mapUrl(origin, dev), { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<MapInfo>;
    if (!Array.isArray(data.walls) || !Array.isArray(data.plazas) || !data.worldWidth || !data.worldHeight) return null;
    return data as MapInfo;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
