import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { secureLocalStorage } from '@/utils/secureStorage';
import {
  COLORS_KEY,
  THEME_KEY,
  getFriendlyPref,
  setFriendlyPref,
  initTheme,
} from '@/utils/theme';

beforeEach(() => {
  secureLocalStorage.clear();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});
afterEach(() => {
  secureLocalStorage.clear();
});

// MBI-21 — the practice owner is colorblind, so the Color-Vision-Friendly palette is the
// out-of-the-box scheme. Status is still also conveyed by icon + shape + label, so the
// standard palette stays accessible and one tap away.
describe('Color-Vision-Friendly is the default-on scheme (MBI-21)', () => {
  it('defaults to friendly when nothing is stored', () => {
    expect(getFriendlyPref()).toBe(true);
  });

  it('honors an explicit Standard choice (persisted)', () => {
    setFriendlyPref(false);
    expect(secureLocalStorage.getItem(COLORS_KEY)).toBe('standard');
    expect(getFriendlyPref()).toBe(false);
  });

  it('honors an explicit Friendly choice (persisted)', () => {
    setFriendlyPref(true);
    expect(secureLocalStorage.getItem(COLORS_KEY)).toBe('friendly');
    expect(getFriendlyPref()).toBe(true);
  });
});

// MBI-21 — the app ships one canonical dark "command-center" palette; the Light/Dark
// toggle is gone. A returning visitor who once chose Light must not resurface a light
// state — the legacy preference is retired at boot.
describe('Single canonical dark theme — light mode removed (MBI-21)', () => {
  it('retires a legacy Light preference at boot so no light state can resurface', () => {
    secureLocalStorage.setItem(THEME_KEY, 'light'); // value written by the old toggle
    initTheme();
    expect(secureLocalStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('boots without error and applies the color-vision default', () => {
    initTheme();
    // friendly default is applied (inline custom property is set on <html>)
    expect(
      document.documentElement.style.getPropertyValue('--color-destructive'),
    ).not.toBe('');
  });
});
