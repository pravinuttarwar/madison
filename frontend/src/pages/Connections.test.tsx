import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Connections from '@/pages/Connections';

afterEach(cleanup);

function renderConnections() {
  return render(
    <MemoryRouter>
      <Connections />
    </MemoryRouter>,
  );
}

// MBI-38: with the sample path gone, the Connections badges have only sandbox/live
// states. Under the default env the apps are sandbox → badges read "Sandbox", and no
// chrome implies "sample data".
describe('Connections — sandbox badges, no sample-data copy (MBI-38)', () => {
  it('renders Sandbox badges for the source panels', async () => {
    renderConnections();
    // Microsoft 365 + QuickBooks panels each carry a Sandbox badge.
    expect((await screen.findAllByText('Sandbox')).length).toBeGreaterThanOrEqual(2);
  });

  it('contains no "sample data" copy anywhere', async () => {
    renderConnections();
    await screen.findAllByText('Sandbox');
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });
});
