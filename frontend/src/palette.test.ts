import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Node `fs`/`process` are typed via src/test-node-shims.d.ts (the app tsconfig has no Node
// types). Reading the shipped stylesheet text is the most robust way to pin the actual
// custom-property values (a ?raw import is swallowed by the Tailwind Vite plugin).

// MBI-21 — the production palette must match Dr. Romano's own madison_medical_jarvis_v2.html
// mockup EXACTLY (strong black / crimson / white), as a single canonical theme. This pins the
// CSS custom properties so a future edit can't silently drift off his design or reintroduce a
// light variant. (vitest runs from the frontend/ root.)
const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8');

function tokenValue(name: string): string | null {
  const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  return m ? m[1].toLowerCase() : null;
}

// WCAG relative luminance + contrast ratio.
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const rgb = [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Exact hex from the v2 mockup (kept verbatim, including the original muted gray).
const EXACT: Record<string, string> = {
  '--color-background': '#0a0a0c', // strong black canvas
  '--color-foreground': '#e8e8ea', // strong white text
  '--color-card': '#121216', // panel
  '--color-muted': '#17171d', // panel-alt / inset
  '--color-border': '#25252d',
  '--color-primary': '#c0002a', // Madison crimson "M"
  '--color-muted-foreground': '#8a8a94', // original faded gray — kept exact per decision
};

describe('Palette matches the v2 mockup exactly — single canonical theme (MBI-21)', () => {
  for (const [name, hex] of Object.entries(EXACT)) {
    it(`${name} is the exact mockup value ${hex}`, () => {
      expect(tokenValue(name)).toBe(hex);
    });
  }

  it('the light palette is removed (no light-only neutrals like #faf9f9 remain)', () => {
    expect(css).not.toContain('#faf9f9');
    expect(css).not.toContain('.dark {');
  });

  it('primary body text meets WCAG AA on the near-black canvas (>= 4.5:1)', () => {
    expect(contrast(EXACT['--color-background'], EXACT['--color-foreground'])).toBeGreaterThanOrEqual(4.5);
  });
});
