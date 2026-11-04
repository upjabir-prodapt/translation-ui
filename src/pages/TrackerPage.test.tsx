import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@aicoe/aihub-platform/i18n';
import TranslationTrackerRoute from './TrackerPage';
import {
  TranslationJobsContext,
  type TranslationJobsContextValue,
} from '../features/jobs/translationJobsContextValue';

/**
 * "Load more" on the tracker: `GET /jobs` pages six months of history with an
 * opaque `next_cursor`; each click appends the next page, with no duplicates.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function row(id: string, filename: string, createdAt: string) {
  return {
    job_id: id,
    status: 'completed',
    progress: 1,
    current_stage: 'completed',
    user: '',
    department: 'bu',
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: createdAt,
    error_message: null,
    filename,
    target_language: 'de',
  };
}

const PAGE_1 = {
  jobs: [row('j1', 'newest.pdf', '2026-11-03T10:00:00Z'), row('j2', 'second.pdf', '2026-11-02T10:00:00Z')],
  next_cursor: 'cursor-1',
};
const PAGE_2 = {
  // j2 again: a page boundary must never produce a duplicate row.
  jobs: [row('j2', 'second.pdf', '2026-11-02T10:00:00Z'), row('j3', 'older.pdf', '2026-06-01T10:00:00Z')],
  next_cursor: 'cursor-2',
};
const PAGE_3 = { jobs: [row('j4', 'oldest.pdf', '2026-05-10T10:00:00Z')], next_cursor: null };

function stubJobsApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('cursor=cursor-2')) return jsonResponse(PAGE_3);
    if (url.includes('cursor=cursor-1')) return jsonResponse(PAGE_2);
    return jsonResponse(PAGE_1);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderTracker() {
  const ctx = { jobOrder: [], jobs: {}, cancelJob: vi.fn() } as unknown as TranslationJobsContextValue;
  return render(
    <TranslationJobsContext.Provider value={ctx}>
      <TranslationTrackerRoute />
    </TranslationJobsContext.Provider>,
  );
}

describe('Translation tracker paging', () => {
  it('appends the next page on "Load more" without duplicates, then hides the control', async () => {
    const fetchMock = stubJobsApi();
    renderTracker();

    expect(await screen.findByText('newest.pdf')).toBeInTheDocument();
    expect(screen.getByText('second.pdf')).toBeInTheDocument();
    expect(screen.queryByText('older.pdf')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('older.pdf')).toBeInTheDocument();
    expect(screen.getByText('newest.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('second.pdf')).toHaveLength(1);
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain(
      '/api/translation/v1/jobs?limit=100&cursor=cursor-1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('oldest.pdf')).toBeInTheDocument();
    expect(screen.getByText('older.pdf')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument(),
    );
  }, 20_000);

  it('shows no "Load more" when the first page is the last', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ jobs: [row('j1', 'only.pdf', '2026-11-03T10:00:00Z')] })),
    );
    renderTracker();
    expect(await screen.findByText('only.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  }, 20_000);
});
