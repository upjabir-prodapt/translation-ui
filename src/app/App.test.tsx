import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@aicoe/aihub-platform/i18n';
import App from './App';

/**
 * The whole app as main.tsx mounts it, at the path the load balancer forwards
 * here, with only the BFF faked. Proves the composition (router, descriptor,
 * platform providers, the job provider, shell, role gate, lazy page) hangs
 * together; the routing rules themselves are pinned in routes.test.tsx.
 */

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function sessionFor(roles: string[]) {
  return {
    subjectId: 'subject-1',
    email: 'person@colt.net',
    name: 'A Person',
    department: 'AI CoE',
    companyName: 'Colt Technology Services',
    roles,
    csrfToken: 'csrf-token-value',
    absoluteExpiresAt: '2030-01-01T00:00:00Z',
  };
}

/** `/auth/session` answers with `roles`; every other BFF call is an empty list. */
function stubBff(roles: string[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('/auth/session')) return jsonResponse(sessionFor(roles));
    return jsonResponse({ jobs: [], tickets: [], unreadCount: 0 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function calledUrls(fetchMock: ReturnType<typeof stubBff>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

/**
 * The first visit to a route compiles its lazy chunk, which on a cold cache
 * takes longer than Testing Library's 1 s default; the per-test timeout leaves
 * room for that wait (beyond Vitest's 5 s) on a slow runner.
 */
const LAZY_ROUTE = { timeout: 10_000 };
const TEST_TIMEOUT = 20_000;

describe('App', () => {
  it('signs in through the BFF session and renders the app under /translation', async () => {
    window.history.pushState({}, '', '/translation');
    const fetchMock = stubBff(['Translation.User']);

    render(<App />);

    // The lazily loaded Translation page, inside the shell with its own sidebar,
    // having listed its jobs through the BFF.
    expect(await screen.findByText(/No runs yet/, {}, LAZY_ROUTE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Job Tracker' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI Hub' })).toHaveAttribute('href', '/');
    expect(calledUrls(fetchMock)).toEqual(
      expect.arrayContaining(['/auth/session', '/api/translation/v1/jobs?limit=100']),
    );
    expect(window.location.pathname).toBe('/translation');
  }, TEST_TIMEOUT);

  it('serves the job tracker deep link', async () => {
    window.history.pushState({}, '', '/translation/tracker');
    stubBff(['Translation.User']);

    render(<App />);

    expect(
      await screen.findByText(/No runs in the last 7 days/, {}, LAZY_ROUTE),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/translation/tracker');
  }, TEST_TIMEOUT);

  it('keeps a user without the Translation role inside the app at /translation/denied', async () => {
    window.history.pushState({}, '', '/translation');
    stubBff([]);

    render(<App />);

    expect(await screen.findByText('Access Denied', {}, LAZY_ROUTE)).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe('/translation/denied'));
  }, TEST_TIMEOUT);
});
