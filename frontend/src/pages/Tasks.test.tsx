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
      // MAD-37: single-user wrapper with an empty list → the friendly empty state.
      const body = url.includes('/api/tasks') ? { multiOwner: false, tasks: [] } : { displayName: 'Dr. Romano', mail: '' };
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

// MAD-37 AC-3: the page renders BOTH DTO shapes — the multi-owner board and the single-user
// list — without crashing. Owner names come from the DTO (not a hardcoded owner).
describe('Tasks — renders both DTO shapes (MAD-37 AC-3)', () => {
  function stubTasks(payload: unknown) {
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.includes('/api/tasks') ? payload : { displayName: 'Dr. Romano', mail: '' };
      return Promise.resolve({ ok: true, status: 200, json: async () => body });
    });
  }

  it('[AC-3] multiOwner:true → "tasks by owner" board, one card per owner, isolated tasks', async () => {
    stubTasks({
      multiOwner: true,
      owners: [
        { upn: 'alice@clinic.test', name: 'Alice Adams', open: 2, overdue: 1, dueToday: 0, tasks: [
          { id: 'a1', title: 'Alice overdue A', owner: 'alice@clinic.test', due: 'Jun 27', status: 'overdue' },
          { id: 'a2', title: 'Alice upcoming', owner: 'alice@clinic.test', due: 'Jul 4', status: 'upcoming' },
        ] },
        { upn: 'bob@clinic.test', name: 'Bob Brown', open: 1, overdue: 0, dueToday: 0, tasks: [
          { id: 'b1', title: 'Bob upcoming', owner: 'bob@clinic.test', due: 'Jul 5', status: 'upcoming' },
        ] },
      ],
    });
    renderTasks();
    expect(await screen.findByText('Tasks by owner')).toBeTruthy();
    expect(screen.getByText('Alice Adams')).toBeTruthy();
    expect(screen.getByText('Bob Brown')).toBeTruthy();
    expect(screen.getByText('Alice overdue A')).toBeTruthy();
    expect(screen.getByText('Bob upcoming')).toBeTruthy();
  });

  it('[AC-3] multiOwner:false → single-user list, no crash, not the team board', async () => {
    stubTasks({
      multiOwner: false,
      tasks: [
        { id: 't1', title: 'My overdue thing', owner: 'DCR', due: 'Jun 28', status: 'overdue' },
        { id: 't2', title: 'My upcoming thing', owner: 'DCR', due: 'Jul 3', status: 'upcoming' },
      ],
    });
    renderTasks();
    expect(await screen.findByText('Your tasks')).toBeTruthy();
    expect(screen.getByText('My overdue thing')).toBeTruthy();
    expect(screen.queryByText('Tasks by owner')).toBeNull();
  });
});
