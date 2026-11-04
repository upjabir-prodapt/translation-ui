import { useCallback, useMemo, useRef, useState } from 'react';
import { type JobSource, type UnifiedJob, mergeJobLists } from '@aicoe/aihub-platform/jobs';
import { translationApi } from '../../api/client';
import { normalizeTranslationHistoryItem, translationJobSource } from './jobSource';

/**
 * `translationJobSource` with "Load more" paging over `GET /jobs`.
 *
 * The backend keeps six months of jobs and pages them with an opaque
 * `next_cursor`. The platform tracker only knows `listHistory()`, so this
 * keeps the older pages itself: `listHistory` re-fetches the newest page (as
 * every refresh does) and merges in everything already loaded, keyed by job,
 * so a row never appears twice and fresh status wins. `loadMore` fetches the
 * page after the last loaded one and swaps the source, which makes the
 * tracker call `listHistory` again.
 */
export function usePagedTranslationJobSource() {
  /** Every row loaded via `loadMore`, plus the newest page as it was then. */
  const loadedRef = useRef<UnifiedJob[]>([]);
  const firstPageRef = useRef<UnifiedJob[]>([]);
  const pagedRef = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const source: JobSource = useMemo(
    () => ({
      ...translationJobSource,
      listHistory: async () => {
        const page = await translationApi.listJobsPage();
        const fresh = page.jobs.map(normalizeTranslationHistoryItem);
        firstPageRef.current = fresh;
        // Until "Load more" is used the cursor is the newest page's; after
        // that it belongs to the last older page and must not be reset.
        if (!pagedRef.current) {
          setNextCursor(page.nextCursor);
          return fresh;
        }
        return mergeJobLists(loadedRef.current, fresh);
      },
    }),
    // `version` is the point: a new source object re-runs the tracker's load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await translationApi.listJobsPage(nextCursor);
      loadedRef.current = mergeJobLists(
        firstPageRef.current,
        loadedRef.current,
        page.jobs.map(normalizeTranslationHistoryItem),
      );
      pagedRef.current = true;
      setNextCursor(page.nextCursor);
      setVersion((v) => v + 1);
    } catch (err) {
      setLoadMoreError(err instanceof Error ? err.message : 'Could not load more runs.');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  return { source, hasMore: nextCursor !== null, loadMore, loadingMore, loadMoreError };
}
