import React from 'react';
import { JobTrackerPage } from '@aicoe/aihub-platform/tracker';
import { translationJobSource } from '../features/jobs/jobSource';

/** `/translation/tracker`: every translation run, and only those. */
const TranslationTrackerRoute: React.FC = () => <JobTrackerPage source={translationJobSource} />;

export default TranslationTrackerRoute;
