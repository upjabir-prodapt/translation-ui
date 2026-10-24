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
import type { JobStatusResponse, LegacyJobStatusResponse } from './types';
import { translationApi } from './api';
import { useTranslationJobs } from './useTranslationJobs';
import ReviewModal from './ReviewModal';

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

  const subtitle = ['Translation', languagePair, item.current_stage]
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
    subtitle: targetLang ? `Translation · → ${targetLang}` : 'Translation',
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
        download: async (job: UnifiedJob) => {
          const url = await ctx.getValidDownloadUrl(job.id);
          if (!url) throw new Error('Download link is not available for this job.');
          window.open(url, '_blank', 'noopener');
        },
      }),
      [ctx],
    );
  },
  ReviewModal,
  label: 'Translation',
  fetchDetail: async (job) => extractTranslationDetail(await translationApi.getJobStatus(job.id)),
};
