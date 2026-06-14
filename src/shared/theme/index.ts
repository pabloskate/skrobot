/**
 * Theme: light/dark palette toggle. The palettes themselves are CSS variables in
 * globals.css (:root = light, [data-theme="dark"] = dark). This module owns the
 * React side — applying `data-theme`, persisting the choice, and the topbar button.
 */
export { ThemeToggle } from './ThemeToggle';
export { useTheme, themeInitScript, THEME_STORAGE_KEY } from './useTheme';
export type { Theme } from './useTheme';
