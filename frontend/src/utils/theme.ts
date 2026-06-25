import { secureLocalStorage } from '@/utils/secureStorage';

// Single source of truth for the app's display preferences. The app ships ONE canonical
// dark "command-center" palette (Dr. Romano's v2 mockup) — there is no light mode (MBI-21:
// the owner wants a single dark mode). The only display preference is the Color-Vision-
// Friendly palette, which is ON by default and persisted, applied at boot (main.tsx) so the
// very first paint — including the login screen, which never mounts the in-app menu —
// respects it.

export const COLORS_KEY = 'madison_colors';
// Legacy key written by the removed Light/Dark toggle. Retired on boot so a stored "light"
// can never resurface a light state now that the app is dark-only.
export const THEME_KEY = 'madison_theme';

// Color-vision-friendly palette: retunes status + chart hues (Okabe-Ito, safe across
// deuteranopia/protanopia/tritanopia). Status is ALWAYS also conveyed by icon, shape and
// label, never color alone.
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

export function getFriendlyPref(): boolean {
  // Default ON (MBI-21): the practice owner is colorblind, so the color-vision-friendly
  // palette is the out-of-the-box scheme. Status is also conveyed by icon + shape + label,
  // so the standard command-center palette stays accessible and is one tap away in Display.
  const saved = secureLocalStorage.getItem(COLORS_KEY);
  return saved === null ? true : saved === 'friendly';
}

export function applyFriendly(friendly: boolean) {
  const root = document.documentElement;
  if (friendly) {
    Object.entries(CV_FRIENDLY_VARS).forEach(([k, v]) => root.style.setProperty(k, v));
  } else {
    Object.keys(CV_FRIENDLY_VARS).forEach((k) => root.style.removeProperty(k));
  }
}

export function setFriendlyPref(friendly: boolean) {
  secureLocalStorage.setItem(COLORS_KEY, friendly ? 'friendly' : 'standard');
  applyFriendly(friendly);
}

// The app is dark-only; retire any legacy Light/Dark preference left in storage so it can't
// resurface a light state. The dark palette itself is the canonical theme in index.css.
function retireLegacyThemePref() {
  if (secureLocalStorage.getItem(THEME_KEY) !== null) {
    secureLocalStorage.removeItem(THEME_KEY);
  }
}

// Apply persisted (or default) preferences immediately. Call once at app boot.
export function initTheme() {
  retireLegacyThemePref();
  applyFriendly(getFriendlyPref());
}
