/**
 * Lokal gemerkte Achievement-Freischaltungen (Befund 49).
 *
 * Der Server schickt Freischaltungen als `freshAchievements`, der Client
 * zeigte sie 4,6 Sekunden als Popup – und warf sie dann weg. Die Galerie
 * eines Gasts stand danach wieder auf 0/7: eine sichtbare Lüge über die
 * eigene Leistung, zwei Minuten nach der Gratulation. Serverseitig ist der
 * Fortschritt für Gäste bewusst flüchtig (je Verbindung, achievements.ts);
 * dieses Modul merkt ihn im Browser – kein Konto, keine Migration.
 *
 * Der Storage ist injizierbar, damit die Logik ohne DOM testbar ist
 * (dasselbe Muster wie quality-panel.ts).
 */
import type { AchievementId } from '@project-maze/shared/gameplay';
import { achievementInfo } from './achievements';
import type { UnlockedAchievement } from './profile';

const KEY = 'mazers-achievements';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): StorageLike | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** Liest die lokalen Freischaltungen; Unbekanntes und Kaputtes fällt still raus. */
export function readLocalUnlocks(storage: StorageLike | null = defaultStorage()): UnlockedAchievement[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((eintrag): eintrag is { id: AchievementId; unlockedAt: string } =>
        typeof eintrag === 'object' && eintrag !== null
        && typeof (eintrag as { id?: unknown }).id === 'string'
        && achievementInfo((eintrag as { id: AchievementId }).id) !== null
        && typeof (eintrag as { unlockedAt?: unknown }).unlockedAt === 'string')
      .map((eintrag) => {
        // Name und Beschreibung kommen aus dem Katalog – gespeichert wird nur
        // die Identität, damit veraltete Texte nicht im Storage überwintern.
        const info = achievementInfo(eintrag.id)!;
        return { id: eintrag.id, name: info.name, description: info.description, unlockedAt: eintrag.unlockedAt };
      });
  } catch {
    return [];
  }
}

/**
 * Merkt eine Freischaltung. Die erste Zeit bleibt stehen – wer „Allrounder"
 * letzte Woche geschafft hat, hat es nicht heute noch einmal geschafft.
 */
export function rememberUnlock(
  id: AchievementId,
  unlockedAt: string = new Date().toISOString(),
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage || achievementInfo(id) === null) return;
  const bestand = readLocalUnlocks(storage);
  if (bestand.some((eintrag) => eintrag.id === id)) return;
  try {
    storage.setItem(KEY, JSON.stringify([...bestand, { id, unlockedAt }]));
  } catch {
    /* Ohne Storage bleibt es beim Popup – mehr war es vorher auch nicht. */
  }
}
