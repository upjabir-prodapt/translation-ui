import { Activity, Languages } from 'lucide-react';
import type { ShellNavItem } from '@aicoe/aihub-platform/shell';
import type { UseCaseDescriptor } from '@aicoe/aihub-platform/usecases';

/**
 * Who this app is on the AI Hub host. Everything in `src/` that needs the
 * slug, the roles or the sidebar reads it from here.
 */

/**
 * The path segment the app owns on the shared host (`/translation/*`), and the
 * `/api/translation/` prefix whose responses carry quota headers. Must match
 * `SLUG` in vite.config.ts.
 */
export const APP_SLUG = 'translation';

export const APP_BASE_PATH = `/${APP_SLUG}`;

export const APP_LABEL = 'Translation';

/**
 * Any one of these grants access. Must equal the roles Apigee's gate accepts
 * for /translation/** (pinned by config.test.ts).
 */
export const APP_ROLES = ['Translation.User', 'Platform.Admin'] as const;

/** The sidebar. Absolute paths on the shared host. */
export const APP_NAV: readonly ShellNavItem[] = [
  { id: 'translation', label: 'Translation', icon: Languages, path: '/translation', end: true },
  {
    id: 'translation-tracker',
    label: 'Job Tracker',
    icon: Activity,
    path: '/translation/tracker',
  },
];

/**
 * This app as the platform's `UseCasesContext` expects to find it: the role
 * check (`RequireRole`, `useEntitlements`) reads `slug` and `roles`, and
 * `AccessDenied` names the refused service from `hub.name`.
 */
export const APP_DESCRIPTOR: UseCaseDescriptor = {
  slug: APP_SLUG,
  roles: APP_ROLES,
  nav: APP_NAV,
  hub: {
    name: APP_LABEL,
    category: 'Language',
    description: 'Documents and copy translated across supported languages, formatting intact.',
    tags: ['txt', 'docx', 'pdf'],
    icon: Languages,
  },
};
