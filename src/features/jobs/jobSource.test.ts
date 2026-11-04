import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedJob } from '@aicoe/aihub-platform/jobs';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';

vi.mock('@aicoe/aihub-platform/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aicoe/aihub-platform/api')>()),
  apiDownload: vi.fn(async () => {}),
}));

import { ApiError, apiDownload } from '@aicoe/aihub-platform/api';
import {
  RETENTION_EXPIRED_MESSAGE,
  availableUntilLabel,
  downloadTranslationOutput,
  normalizeTranslationActiveItem,
  normalizeTranslationHistoryItem,
  translationJobSource,
} from './jobSource';
import type { JobStatusResponse, LegacyJobStatusResponse } from '../../api/types';
import {
  TranslationJobsContext,
  type TranslationJobsContextValue,
} from './translationJobsContextValue';

const JOB_ID = '3f0c9a52-1b7e-4c1e-9d6a-0a1b2c3d4e5f';

function job(overrides: Partial<UnifiedJob> = {}): UnifiedJob {
  return {
    key: `translation:${JOB_ID}`,
    id: JOB_ID,
    service: 'translation',
    serviceLabel: 'Translation',
    title: 'contract.pdf',
    subtitle: 'Translation',
    status: 'completed',
    progress: 100,
    createdAt: null,
    completedAt: null,
    errorMessage: null,
    canCancel: false,
    canDownload: true,
    canReview: true,
    startedBy: null,
    ...overrides,
  };
}

describe('translationJobSource', () => {
  beforeEach(() => {
    vi.mocked(apiDownload).mockClear();
  });

  it('sends feedback on a run to the AI Hub ticket form, not a dialog of its own', () => {
    expect(translationJobSource.openFeedback).toBe(openRunFeedback);
    expect(translationJobSource.ReviewModal).toBeUndefined();
  });

  it('downloads through GET /jobs/{id}/output with apiDownload, never window.open', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const ctx = { cancelJob: vi.fn() } as unknown as TranslationJobsContextValue;
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(TranslationJobsContext.Provider, { value: ctx }, children);

    const { result } = renderHook(() => translationJobSource.useActions!(), { wrapper });
    await result.current.download!(job());

    expect(apiDownload).toHaveBeenCalledTimes(1);
    expect(apiDownload).toHaveBeenCalledWith(
      `/api/translation/v1/jobs/${JOB_ID}/output`,
      `${JOB_ID}_mono.pdf`,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to a bare {id}_mono name when the title carries no extension', async () => {
    await downloadTranslationOutput(job({ title: 'Run 3f0c9a52' }));
    expect(apiDownload).toHaveBeenCalledWith(
      `/api/translation/v1/jobs/${JOB_ID}/output`,
      `${JOB_ID}_mono`,
    );
  });

  it('propagates a failed download to the caller', async () => {
    vi.mocked(apiDownload).mockRejectedValueOnce(new Error('gone'));
    await expect(downloadTranslationOutput(job())).rejects.toThrow('gone');
  });

  it('shows the server\'s message when the download is 410 Gone', async () => {
    const detail = "This job's files were deleted after the 6-month retention period.";
    vi.mocked(apiDownload).mockRejectedValueOnce(
      new ApiError('Request failed (HTTP 410)', 410, { detail }),
    );
    await expect(downloadTranslationOutput(job())).rejects.toThrow(detail);
  });

  it('falls back to the retention message for a 410 without a readable body', async () => {
    vi.mocked(apiDownload).mockRejectedValueOnce(new ApiError('Request failed (HTTP 410)', 410, ''));
    await expect(downloadTranslationOutput(job())).rejects.toThrow(RETENTION_EXPIRED_MESSAGE);
  });

  it('leaves other download errors untouched', async () => {
    const err = new ApiError('Job is not completed yet', 400, { detail: 'Job is not completed yet' });
    vi.mocked(apiDownload).mockRejectedValueOnce(err);
    await expect(downloadTranslationOutput(job())).rejects.toBe(err);
  });
});

describe('Available until', () => {
  const EXPIRES = '2027-03-03T08:00:00Z';
  const localised = new Date(EXPIRES).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  function historyItem(overrides: Partial<LegacyJobStatusResponse> = {}): LegacyJobStatusResponse {
    return {
      job_id: JOB_ID,
      status: 'completed',
      progress: 1,
      current_stage: 'completed',
      user: '',
      department: 'bu',
      created_at: '2026-09-01T08:00:00Z',
      updated_at: '2026-09-01T08:00:00Z',
      completed_at: null,
      error_message: null,
      target_language: 'de',
      ...overrides,
    };
  }

  it('labels a date in the browser locale, or nothing without one', () => {
    expect(availableUntilLabel(EXPIRES)).toBe(`Available until ${localised}`);
    expect(availableUntilLabel(undefined)).toBe('');
    expect(availableUntilLabel(null)).toBe('');
    expect(availableUntilLabel('not a date')).toBe('');
  });

  it('adds it to each history row that carries expires_at', () => {
    const row = normalizeTranslationHistoryItem(historyItem({ expires_at: EXPIRES }));
    expect(row.subtitle).toBe(`Translation · → de · completed · Available until ${localised}`);
  });

  it('leaves the row as before when an older backend omits expires_at', () => {
    const row = normalizeTranslationHistoryItem(historyItem());
    expect(row.subtitle).toBe('Translation · → de · completed');
  });

  it('adds it to live in-session rows too', () => {
    const live: JobStatusResponse = {
      job_id: JOB_ID,
      status: 'queued',
      submitted_at: '2026-09-01T08:00:00Z',
      expires_at: EXPIRES,
    };
    expect(normalizeTranslationActiveItem(live).subtitle).toBe(
      `Translation · Available until ${localised}`,
    );
  });
});
