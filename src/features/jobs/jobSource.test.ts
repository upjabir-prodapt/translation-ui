import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedJob } from '@aicoe/aihub-platform/jobs';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';

vi.mock('@aicoe/aihub-platform/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aicoe/aihub-platform/api')>()),
  apiDownload: vi.fn(async () => {}),
}));

import { apiDownload } from '@aicoe/aihub-platform/api';
import { downloadTranslationOutput, translationJobSource } from './jobSource';
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
});
