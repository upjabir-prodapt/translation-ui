import type {
  MultiTranslateResponse,
  MultiJobStatusRequest,
  MultiJobStatusResponse,
  JobStatusResponse,
  LegacyJobStatusResponse,
} from './types';
import { apiFetch, apiJson, apiPostJson } from '@aicoe/aihub-platform/api';

/**
 * Same-origin `/api/translation/v1/*`, proxied by the BFF to Apigee.
 *
 * There is no auth code left in here. The session cookie is attached by the
 * browser, the CSRF token by `shared/api/client`, and the Entra bearer token
 * plus `x-colt-user-*` headers are injected server-side by the BFF. The old
 * Google metadata-server ID token fetch and its 401-retry loop are gone with
 * the architecture that needed them.
 */
const API_BASE = '/api/translation/v1';

export const translationApi = {
  async startTranslation(formData: FormData): Promise<MultiTranslateResponse> {
    // No Content-Type header: the browser must set the multipart boundary.
    return await apiJson<MultiTranslateResponse>(`${API_BASE}/translate`, {
      method: 'POST',
      body: formData,
      errorMessage: 'Failed to submit translation job',
    });
  },

  async getMultipleJobStatuses(jobIds: string[]): Promise<MultiJobStatusResponse> {
    const requestBody: MultiJobStatusRequest = { job_ids: jobIds };
    return await apiPostJson<MultiJobStatusResponse>(`${API_BASE}/jobs/status`, requestBody, {
      errorMessage: 'Failed to fetch job statuses',
    });
  },

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return await apiJson<JobStatusResponse>(`${API_BASE}/translate/${jobId}`, {
      errorMessage: 'Failed to fetch job status',
    });
  },

  /**
   * `GET /jobs` — this user's job history for the Job Tracker. Accepts either a
   * bare array or a `{ jobs: [...] }` envelope; the live service's exact shape
   * was never confirmed, and the mock upstream emits the envelope.
   */
  async listJobs(): Promise<LegacyJobStatusResponse[]> {
    const data = await apiJson<{ jobs?: LegacyJobStatusResponse[] } | LegacyJobStatusResponse[]>(
      // `limit` is explicit because the service defaults it to 10, which
      // silently truncated the Job Tracker's history. 100 is the server max.
      // No `status` filter: the backend's filter regex rejects
      // `human_review_required`, so filtering happens client-side.
      `${API_BASE}/jobs?limit=100`,
      { errorMessage: 'Failed to fetch job history' },
    );
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.jobs)) return data.jobs;
    return [];
  },

  async cancelJob(jobId: string, reason?: string): Promise<{ message: string }> {
    return await apiPostJson<{ message: string }>(
      `${API_BASE}/jobs/${jobId}`,
      { reason: reason ?? 'Cancelled by user' },
      { method: 'DELETE', errorMessage: 'Failed to cancel job' },
    );
  },

  /** Escape hatch for callers that need the raw `Response`. */
  raw: (path: string, init?: Parameters<typeof apiFetch>[1]) => apiFetch(`${API_BASE}${path}`, init),
};
