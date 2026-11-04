import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProviders } from '@aicoe/aihub-platform/shell';
import { CSRF_HEADER, setCsrfToken } from '@aicoe/aihub-platform/api';
import { TranslationJobsProvider } from './TranslationJobsContext';

/**
 * Regression for the BFF's occasional `403 missing X-CSRF-Token header` on
 * `POST /api/translation/v1/jobs/status`: resuming a batch saved in
 * localStorage fired on mount, before `GET /auth/session` had returned the
 * CSRF token, so the platform client sent the POST without the header.
 */

const STORAGE_KEY = 'colt_translation_active_batch';
const CSRF = 'csrf-token-value';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

afterEach(() => {
  setCsrfToken(null);
  localStorage.clear();
});

describe('TranslationJobsProvider batch resume', () => {
  it('waits for the session, then polls /jobs/status with the CSRF header', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, batchId: 'b1', jobOrder: ['j1'], savedAt: '2026-11-04T00:00:00Z' }),
    );

    let releaseSession: () => void = () => {};
    const sessionGate = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = urlOf(input);
      if (url.startsWith('/auth/session')) {
        await sessionGate;
        return jsonResponse({
          subjectId: 's1',
          email: 'person@colt.net',
          name: 'A Person',
          department: null,
          companyName: null,
          roles: ['Translation.User'],
          csrfToken: CSRF,
          absoluteExpiresAt: '2030-01-01T00:00:00Z',
        });
      }
      return jsonResponse({ jobs: [{ job_id: 'j1', target_language: 'de', status: 'processing' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <PlatformProviders>
        <TranslationJobsProvider>
          <div />
        </TranslationJobsProvider>
      </PlatformProviders>,
    );

    const statusCalls = () =>
      fetchMock.mock.calls.filter(([input]) => urlOf(input).endsWith('/api/translation/v1/jobs/status'));

    // Session probe in flight: nothing may be POSTed yet.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => urlOf(input).startsWith('/auth/session'))).toBe(true),
    );
    expect(statusCalls()).toHaveLength(0);

    releaseSession();

    await waitFor(() => expect(statusCalls().length).toBeGreaterThan(0));
    for (const [, init] of statusCalls()) {
      expect(new Headers(init?.headers).get(CSRF_HEADER)).toBe(CSRF);
    }
  });
});
