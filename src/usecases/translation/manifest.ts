import { lazy } from 'react';
import { Activity, Languages } from 'lucide-react';
import type { UseCaseManifest } from '../base';
import { translationJobSource } from './jobSource';
import { TranslationJobsProvider } from './TranslationJobsContext';

export const ROLE_TRANSLATION = ['Translation.User', 'Platform.Admin'] as const;

export const manifest: UseCaseManifest = {
  slug: 'translation',
  order: 10,
  roles: ROLE_TRANSLATION,
  routes: [
    { path: 'translation', component: lazy(() => import('./TranslationRoute')) },
    { path: 'translation/tracker', component: lazy(() => import('./TranslationTrackerRoute')) },
  ],
  // The sidebar while inside Translation — identical in the hub today and in
  // the standalone Translation app after the split.
  nav: [
    { id: 'translation', label: 'Translation', icon: Languages, path: '/translation', end: true },
    {
      id: 'translation-tracker',
      label: 'Job Tracker',
      icon: Activity,
      path: '/translation/tracker',
    },
  ],
  jobSource: translationJobSource,
  // Must outlive navigation: a running translation keeps polling while the
  // user moves between /translation and /translation/tracker.
  Provider: TranslationJobsProvider,
  hub: {
    name: 'Translation',
    category: 'Language',
    description: 'Documents and copy translated across supported languages, formatting intact.',
    tags: ['txt', 'docx', 'pdf'],
    icon: Languages,
  },
};
