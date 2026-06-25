import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusPill, ModeBanner, type StatusKind } from '@/components/primitives';

afterEach(cleanup);

// MBI-38: the global sandbox banner shows only on the sandbox apps; on the production
// apps (live) there is no banner.
describe('ModeBanner — sandbox-only indicator (MBI-38)', () => {
  it('shows the sandbox indicator in sandbox mode', () => {
    render(<ModeBanner mode="sandbox" />);
    expect(screen.getByText(/sandbox/i)).toBeTruthy();
  });

  it('renders nothing in live mode', () => {
    const { container } = render(<ModeBanner mode="live" />);
    expect(container.firstChild).toBeNull();
  });
});

// MBI-21 — status/severity must NEVER be conveyed by color alone. Every status renders a
// distinct text label (and a lucide icon alongside it), so the colorblind owner can read it
// without relying on hue. This guards the accessibility primitive against regressions.
const KINDS: { kind: StatusKind; label: string }[] = [
  { kind: 'overdue', label: 'Overdue' },
  { kind: 'due-today', label: 'Due today' },
  { kind: 'upcoming', label: 'Upcoming' },
  { kind: 'done', label: 'Done' },
  { kind: 'urgent', label: 'Urgent' },
];

describe('StatusPill — never color alone (MBI-21)', () => {
  for (const { kind, label } of KINDS) {
    it(`renders a text label + icon for "${kind}"`, () => {
      const { container } = render(<StatusPill kind={kind} />);
      // text label present (not color-only)
      expect(screen.getByText(label)).toBeTruthy();
      // an accompanying icon (lucide renders an <svg>) reinforces the label by shape
      expect(container.querySelector('svg')).not.toBeNull();
    });
  }
});
