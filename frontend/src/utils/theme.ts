import { secureLocalStorage } from '@/utils/secureStorage';

// Single source of truth for the app's display preferences (theme + color-vision
// palette). Applied at boot (main.tsx) so the very first paint — including the login
// screen, which never mounts the in-app Display menu — respects the saved choice.
// Defaults to dark + color-vision-friendly when nothing is stored yet.

export const THEME_KEY = 'madison_theme';
export const COLORS_KEY = 'madison_colors';

// Color-vision-friendly palette: retunes status + chart hues. Status is ALWAYS also
// conveyed by icon, shape and label, never color alone.
export const CV_FRIENDLY_VARS: Record<string, string> = {
  '--color-success': '#1f6fb2',
  '--color-warning': '#9a6700',
  '--color-destructive': '#b3541e',
  '--color-chart-1': '#0072b2',
  '--color-chart-2': '#56b4e9',
  '--color-chart-3': '#e69f00',
  '--color-chart-4': '#d55e00',
  '--color-chart-5': '#8e44ad',
};

export function getDarkPref(): boolean {
  const saved = secureLocalStorage.getItem(THEME_KEY);
  return saved === null ? true : saved === 'dark';
}

export function getFriendlyPref(): boolean {
  // Default OFF so the customer's true command-center palette (green/amber/crimson)
  // shows out of the box. Status is also conveyed by icon + label, so this stays
  // accessible; the color-vision-friendly palette remains a one-tap toggle.
  const saved = secureLocalStorage.getItem(COLORS_KEY);
  return saved === null ? false : saved === 'friendly';
}

export function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

export function applyFriendly(friendly: boolean) {
  const root = document.documentElement;
  if (friendly) {
    Object.entries(CV_FRIENDLY_VARS).forEach(([k, v]) => root.style.setProperty(k, v));
  } else {
    Object.keys(CV_FRIENDLY_VARS).forEach((k) => root.style.removeProperty(k));
  }
}

export function setDarkPref(dark: boolean) {
  secureLocalStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  applyDark(dark);
}

export function setFriendlyPref(friendly: boolean) {
  secureLocalStorage.setItem(COLORS_KEY, friendly ? 'friendly' : 'standard');
  applyFriendly(friendly);
}

// Apply persisted (or default) preferences immediately. Call once at app boot.
export function initTheme() {
  applyDark(getDarkPref());
  applyFriendly(getFriendlyPref());
}
