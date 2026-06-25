import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UserProvider } from '@/context/UserContext';
import Tasks from '@/pages/Tasks';

afterEach(cleanup);

function renderTasks() {
  return render(
    <MemoryRouter>
      <UserProvider>
        <Tasks />
      </UserProvider>
    </MemoryRouter>,
  );
}

// MBI-37 (AC1/AC3): zero tasks → a friendly empty state, never an error or "sample data".
describe('Tasks — empty + error states (MBI-37)', () => {
  it('shows a friendly empty state when there are no tasks', async () => {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.includes('/api/tasks') ? [] : { displayName: 'Dr. Romano', mail: '' };
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
    renderTasks();
    expect(await screen.findByText('No tasks found')).toBeTruthy();
    expect(screen.queryByText(/sample data/i)).toBeNull();
  });

  it('shows the error view on a failed fetch', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }),
    );
    renderTasks();
    expect(await screen.findByText("Couldn't load this view")).toBeTruthy();
  });
});
