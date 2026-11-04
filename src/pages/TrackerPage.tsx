import React from 'react';
import { JobTrackerPage } from '@aicoe/aihub-platform/tracker';
import { usePagedTranslationJobSource } from '../features/jobs/usePagedTranslationJobSource';

const LOAD_MORE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '0 0 32px',
};

/**
 * `/translation/tracker`: every translation run, and only those, newest first.
 * The backend pages six months of history; "Load more" appends the next page.
 */
const TranslationTrackerRoute: React.FC = () => {
  const { source, hasMore, loadMore, loadingMore, loadMoreError } = usePagedTranslationJobSource();
  return (
    <>
      <JobTrackerPage source={source} />
      {(hasMore || loadMoreError) && (
        <div className="tracker-load-more" style={LOAD_MORE_STYLE}>
          {loadMoreError && <p role="alert">{loadMoreError}</p>}
          {hasMore && (
            <button
              type="button"
              className="tracker-refresh-btn"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default TranslationTrackerRoute;
