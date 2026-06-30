// MAD-40 — self-hosted fonts. The crimson accent + Fraunces/JetBrains-Mono tokens already
// ship (MBI-21 palette); this slice removes the runtime Google Fonts CDN dependency and
// serves the fonts from our own origin via @fontsource. jsdom can't load real fonts, so we
// pin the build-artifact contract: no third-party CDN, fonts wired at entry, theme intact.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// vitest runs with cwd = frontend/
const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');

describe('MAD-40 — self-hosted fonts', () => {
  it('[AC-1] index.html has no third-party font CDN links (no Google Fonts at runtime)', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fonts\.googleapis\.com/);
    expect(html).not.toMatch(/fonts\.gstatic\.com/);
  });

  it('[AC-2] fonts are self-hosted via @fontsource — deps present, imported at entry, tokens intact', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['@fontsource-variable/fraunces']).toBeTruthy();
    expect(deps['@fontsource-variable/jetbrains-mono']).toBeTruthy();
    // Imported at the app entry so the @font-face faces are bundled + served from our origin.
    const main = read('src/main.tsx');
    expect(main).toMatch(/@fontsource-variable\/fraunces/);
    expect(main).toMatch(/@fontsource-variable\/jetbrains-mono/);
    // Theme tokens still name the families (Fraunces / JetBrains Mono).
    const css = read('src/index.css');
    expect(css).toMatch(/--font-display:[^;]*Fraunces/);
    expect(css).toMatch(/--font-mono:[^;]*JetBrains Mono/);
  });

  it('[AC-3] the crimson accent + Fraunces heading treatment are unchanged', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/--color-primary:\s*#c0002a/i);
    // Headings still bound to the display font.
    expect(css).toMatch(/h1,\s*h2,\s*h3[\s\S]*var\(--font-display\)/);
  });
});
