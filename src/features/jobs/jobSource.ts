import { useMemo } from 'react';
import {
  type JobSource,
  type JobSourceActions,
  type UnifiedJob,
  type UnifiedJobDetail,
  type UnifiedJobStatus,
  fractionToPercent,
  shortRunLabel,
} from '@aicoe/aihub-platform/jobs';
import type { JobStatusResponse, LegacyJobStatusResponse } from '../../api/types';
import { translationApi } from '../../api/client';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';
import { ApiError, apiDownload } from '@aicoe/aihub-platform/api';
import { useTranslationJobs } from './useTranslationJobs';

/**
 * Builds the lazily-fetched detail fields from a translation job's full
 * detail response (`GET /translate/{job_id}`) — the only endpoint that
 * carries cost/tokens/model metadata.
 */
export function extractTranslationDetail(job: JobStatusResponse): UnifiedJobDetail {
  const result = job.result;
  const labels = result?.labels;
  const meta = result?.metadata;

  // The backend often leaves labels.processing_time_seconds null, so fall
  // back to deriving elapsed time from submitted_at → completed_at.
  let processingTimeSeconds = typeof labels?.processing_time_seconds === 'number'
    ? labels.processing_time_seconds
    : null;
  if (processingTimeSeconds === null && job.submitted_at && job.completed_at) {
    const diffMs = new Date(job.completed_at).getTime() - new Date(job.submitted_at).getTime();
    if (diffMs > 0) processingTimeSeconds = diffMs / 1000;
  }

  return {
    costUsd: typeof labels?.cost_usd === 'number' ? labels.cost_usd : null,
    tokenCount: typeof labels?.token_count === 'number' ? labels.token_count : null,
    processingTimeSeconds,
    modelUsed: meta?.model_used ?? null,
    modelVersion: meta?.model_version ?? null,
    qualityScore: typeof meta?.quality_score === 'number' ? meta.quality_score : null,
  };
}

/**
 * "Available until <date>" for a job's `expires_at` (submission + the
 * backend's retention period), in the browser's locale; '' when absent so an
 * older backend that does not send it changes nothing.
 */
export function availableUntilLabel(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '';
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `Available until ${formatted}`;
}

const TRANSLATION_STATUS_MAP: Record<string, UnifiedJobStatus> = {
  queued: 'queued',
  pending: 'queued',
  processing: 'running',
  running: 'running',
  completed: 'completed',
  human_review_required: 'review',
  failed: 'failed',
  cancelled: 'cancelled',
};

/** Normalizes an item from `GET /jobs` (history, richer/legacy shape). */
export function normalizeTranslationHistoryItem(item: LegacyJobStatusResponse): UnifiedJob {
  const status = TRANSLATION_STATUS_MAP[item.status?.toLowerCase?.() ?? ''] ?? 'queued';

  // Prefer the real source filename returned by the backend; fall back to a
  // truncated run id (a full UUID as the row title is unreadable) when absent.
  const filename = item.filename?.trim() || '';

  const languagePair =
    item.source_language && item.target_language
      ? `${item.source_language} → ${item.target_language}`
      : item.target_language
        ? `→ ${item.target_language}`
        : '';

  const subtitle = ['Translation', languagePair, item.current_stage, availableUntilLabel(item.expires_at)]
    .filter((part) => !!part && part.trim() !== '')
    .join(' · ');

  return {
    key: `translation:${item.job_id}`,
    id: item.job_id,
    service: 'translation',
    serviceLabel: 'Translation',
    title: filename || shortRunLabel(item.job_id),
    subtitle,
    status,
    progress: fractionToPercent(item.progress),
    createdAt: item.created_at ?? null,
    completedAt: item.completed_at ?? null,
    errorMessage: item.error_message ?? null,
    canCancel: status === 'queued' || status === 'running',
    canDownload: status === 'completed',
    canReview: status === 'completed',
    startedBy: item.user ?? null,
  };
}

/** Normalizes an item from the live in-session batch (TranslationJobsContext). */
export function normalizeTranslationActiveItem(item: JobStatusResponse): UnifiedJob {
  const status = TRANSLATION_STATUS_MAP[item.status] ?? 'queued';
  const targetLang = item.result?.metadata?.target_language;
  const filename = item.result?.translated_document?.filename;
  return {
    key: `translation:${item.job_id}`,
    id: item.job_id,
    service: 'translation',
    serviceLabel: 'Translation',
    title: filename || shortRunLabel(item.job_id),
    subtitle: [
      targetLang ? `Translation · → ${targetLang}` : 'Translation',
      availableUntilLabel(item.expires_at),
    ]
      .filter(Boolean)
      .join(' · '),
    status,
    // No numeric progress is exposed for in-flight jobs by this endpoint —
    // render an indeterminate bar rather than fabricate a percentage.
    progress: status === 'completed' ? 100 : null,
    createdAt: item.submitted_at || null,
    completedAt: item.completed_at ?? null,
    errorMessage: item.error_message ?? null,
    canCancel: status === 'queued' || status === 'running',
    canDownload: status === 'completed',
    canReview: status === 'completed',
    startedBy: null,
    detail: item.result ? extractTranslationDetail(item) : undefined,
    detailStatus: item.result ? 'loaded' : undefined,
  };
}


/** The translated file's extension, taken from the row title when it has one. */
function extensionOf(name: string): string {
  const match = /\.[A-Za-z0-9]{1,8}$/.exec(name.trim());
  return match ? match[0].toLowerCase() : '';
}

/**
 * Shown when `/output` answers 410 without a readable message: the job is past
 * its retention period, or its file was already deleted.
 */
export const RETENTION_EXPIRED_MESSAGE =
  "This job's files were deleted after the 6-month retention period.";

/**
 * Downloads a finished job's translated file through the BFF:
 * `GET /api/translation/v1/jobs/{id}/output` streams it with
 * `Content-Disposition: attachment`, and `apiDownload` saves it from a blob
 * with the session cookie. Never `window.open` on a signed GCS URL: that
 * rendered PDFs/TXT inline and handed out a link that bypassed auth.
 *
 * The fallback name mirrors the server's `{job_id}_mono{ext}` and is used only
 * if the response carries no filename. The jobs' own `download_url` fields are
 * deliberately not read.
 */
export async function downloadTranslationOutput(
  job: Pick<UnifiedJob, 'id' | 'title'>,
): Promise<void> {
  try {
    await apiDownload(
      `/api/translation/v1/jobs/${job.id}/output`,
      `${job.id}_mono${extensionOf(job.title)}`,
    );
  } catch (err) {
    // 410: the files are gone after the retention period. Surface the
    // server's own sentence rather than a generic "Request failed (HTTP 410)".
    if (err instanceof ApiError && err.status === 410) {
      const detail = (err.body as { detail?: unknown } | null)?.detail;
      throw new Error(
        typeof detail === 'string' && detail.trim() ? detail : RETENTION_EXPIRED_MESSAGE,
      );
    }
    throw err;
  }
}

export const translationJobSource: JobSource = {
  slug: 'translation',
  listHistory: async () => (await translationApi.listJobs()).map(normalizeTranslationHistoryItem),
  useActive: () => {
    const ctx = useTranslationJobs();
    return useMemo(
      () =>
        ctx.jobOrder
          .map((id) => ctx.jobs[id])
          .filter((j): j is NonNullable<typeof j> => !!j)
          .map(normalizeTranslationActiveItem),
      [ctx.jobOrder, ctx.jobs],
    );
  },
  useActions: (): JobSourceActions => {
    const ctx = useTranslationJobs();
    return useMemo(
      () => ({
        cancel: (job: UnifiedJob) => ctx.cancelJob(job.id),
        download: (job: UnifiedJob) => downloadTranslationOutput(job),
      }),
      [ctx],
    );
  },
  // Feedback on a finished run goes to the AI Hub's ticket form.
  openFeedback: openRunFeedback,
  label: 'Translation',
  // Backend keeps runs and outputs for JOB_RETENTION_DAYS (183); shown in the Job Tracker.
  historyWindow: '6 months',
  fetchDetail: async (job) => extractTranslationDetail(await translationApi.getJobStatus(job.id)),
};
