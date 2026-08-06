import type { ThemeId } from '@project-maze/shared';

/**
 * Themes sind rein clientseitig – der Server erfährt nie, welches Theme gewählt wurde.
 * `ThemeId` liegt in `packages/shared` und bleibt unangetastet; zusätzliche Client-Themes
 * werden hier ergänzt.
 */
export type ClientThemeId = ThemeId | 'neon';

export const CLIENT_THEME_IDS = ['midnight', 'void', 'classic', 'neon'] as const satisfies readonly ClientThemeId[];

export const CLIENT_THEME_LABELS: Record<ClientThemeId, string> = {
  midnight: 'Midnight',
  void: 'Void',
  classic: 'Classic',
  neon: 'Neon'
};

/** Browser-UI-Farbe (Adressleiste auf Mobilgeräten) je Theme. */
export const CLIENT_THEME_BROWSER_COLORS: Record<ClientThemeId, string> = {
  midnight: '#070910',
  void: '#030407',
  classic: '#e8ebf0',
  neon: '#08041a'
};

export const DEFAULT_THEME: ClientThemeId = 'midnight';

const STORAGE_KEY = 'project-maze-theme';

export function isClientThemeId(value: unknown): value is ClientThemeId {
  return typeof value === 'string' && (CLIENT_THEME_IDS as readonly string[]).includes(value);
}

export function readStoredTheme(): ClientThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isClientThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: ClientThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private-Mode ohne Storage: Theme gilt dann nur für diese Sitzung. */
  }
}

/** Setzt `data-theme` und die passende Browser-UI-Farbe. */
export function applyTheme(theme: ClientThemeId): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = CLIENT_THEME_BROWSER_COLORS[theme];
}
