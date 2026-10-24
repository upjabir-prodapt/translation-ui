import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@aicoe/aihub-platform/i18n';
import { AuthContext, type AuthState } from '@aicoe/aihub-platform/auth';
import { UseCasesContext } from '@aicoe/aihub-platform/usecases';
import { APP_DESCRIPTOR } from './config';
import { AppRoutes } from './routes';

const leaveApp = vi.fn();
vi.mock('./leaveApp', () => ({ leaveApp: (url: string) => leaveApp(url) }));

/**
 * Stand-in pages, so the routing is tested independently of what the pages
 * render and fetch. The translation page's two callbacks are exposed as
 * buttons so the route's wiring of them can be pinned.
 */
vi.mock('../pages/TranslationPage', () => ({
  default: ({ onOpenTracker, onBack }: { onOpenTracker?: () => void; onBack?: () => void }) => (
    <div>
      <p>translation page</p>
      <button onClick={onOpenTracker}>open tracker</button>
      <button onClick={onBack}>back</button>
    </div>
  ),
}));
vi.mock('../pages/TrackerPage', () => ({ default: () => <p>tracker page</p> }));

/**
 * The app mounts its routes without a router basename, so the host-absolute
 * paths work unchanged. These pin where `/denied` lands and what happens to a
 * path the app does not own.
 */

function authAs(roles: string[]): AuthState {
  return {
    status: 'authenticated',
    user: {
      subjectId: 'subject-1',
      email: 'person@colt.net',
      name: 'A Person',
      department: null,
      companyName: null,
      roles,
      csrfToken: 'csrf',
      absoluteExpiresAt: '2030-01-01T00:00:00Z',
    },
    error: null,
    roles,
    hasRole: (...wanted: string[]) => wanted.some((role) => roles.includes(role)),
    refresh: async () => {},
    logout: async () => {},
  };
}

const CurrentPath: React.FC = () => <output data-testid="path">{useLocation().pathname}</output>;

function renderAt(path: string, roles: string[]) {
  return render(
    <AuthContext.Provider value={authAs(roles)}>
      <UseCasesContext.Provider value={[APP_DESCRIPTOR]}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
          <CurrentPath />
        </MemoryRouter>
      </UseCasesContext.Provider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  leaveApp.mockReset();
  // The shell's user menu polls the hub's unread-ticket count.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ tickets: [], unreadCount: 0 }), {
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
});

describe('AppRoutes', () => {
  it('renders a page at its host path, inside the app shell', async () => {
    renderAt('/translation/tracker', ['Translation.User']);

    expect(await screen.findByText('tracker page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI Hub' })).toHaveAttribute('href', '/');
  });

  it('keeps a refused user inside the app at /translation/denied', async () => {
    renderAt('/translation', []);

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent('/translation/denied'),
    );
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText(/permission to access Translation/)).toBeInTheDocument();
    expect(leaveApp).not.toHaveBeenCalled();
  });

  it("opens the job tracker from the translation page's link", async () => {
    renderAt('/translation', ['Translation.User']);

    fireEvent.click(await screen.findByRole('button', { name: 'open tracker' }));

    expect(await screen.findByText('tracker page')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/translation\/tracker$/);
  });

  it("turns the translation page's back link into a full page load of the hub", async () => {
    renderAt('/translation', ['Translation.User']);

    fireEvent.click(await screen.findByRole('button', { name: 'back' }));

    await waitFor(() => expect(leaveApp).toHaveBeenCalledWith('/'));
  });

  it('sends an unknown path under the app back to its root', async () => {
    renderAt('/translation/no/such/page', ['Translation.User']);

    expect(await screen.findByText('translation page')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/translation$/);
  });

  it('hands a path outside the app to a full page load', async () => {
    renderAt('/support?usecase=translation', ['Translation.User']);

    await waitFor(() => expect(leaveApp).toHaveBeenCalledWith('/support?usecase=translation'));
  });
});
