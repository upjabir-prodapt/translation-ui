import React, { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AccessDenied, RequireRole } from '@aicoe/aihub-platform/auth';
import { AppShell, pathMatches } from '@aicoe/aihub-platform/shell';
import { APP_BASE_PATH, APP_LABEL, APP_NAV, APP_ROLES, APP_SLUG } from './config';
import { leaveApp } from './leaveApp';

/**
 * This app's routes.
 *
 * There is deliberately NO router `basename`. The routes (`translation/tracker`),
 * the sidebar entries (`/translation/tracker`) and the pages' own links
 * (`navigate('/translation/tracker')`) are all written as paths on the shared
 * host. A basename of `/translation` would prefix every one of them a second
 * time (`/translation/translation`). The load balancer only ever sends
 * `/translation/*` here, so host paths and router paths are the same thing.
 *
 * Two consequences handled below:
 *
 *   `/denied`  RequireRole redirects to the absolute `/denied`, which on this
 *              host belongs to the hub. It is forwarded to `/translation/denied`
 *              so the page stays in this app (and survives a reload here).
 *   other      A client-side navigation out of `/translation` (e.g. the page's
 *              "back" calling `navigate('/')`) cannot be rendered by this app,
 *              so it becomes a full-page load that the load balancer routes
 *              to whichever app owns that path.
 */

/** Each page is its own chunk; nothing loads until its route is hit. */
const TranslationPage = lazy(() => import('../pages/TranslationPage'));
const TrackerPage = lazy(() => import('../pages/TrackerPage'));

/**
 * `null` matches RequireRole, which also renders nothing rather than flashing
 * a spinner between the session probe and the first paint.
 */
const Lazy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

const TranslationRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Lazy>
      <TranslationPage
        onOpenTracker={() => navigate('/translation/tracker')}
        onBack={() => navigate('/')}
      />
    </Lazy>
  );
};

const TrackerRoute: React.FC = () => (
  <Lazy>
    <TrackerPage />
  </Lazy>
);

/** Keeps RequireRole's `state.service` so the page can name what was refused. */
const DeniedRedirect: React.FC = () => {
  const location = useLocation();
  return <Navigate to={`${APP_BASE_PATH}/denied`} replace state={location.state} />;
};

/** No route matched: back to the app root, or out to the app that owns the path. */
const Unmatched: React.FC = () => {
  const { pathname, search, hash } = useLocation();
  const inside = pathMatches(pathname, APP_BASE_PATH, false);

  useEffect(() => {
    if (!inside) leaveApp(`${pathname}${search}${hash}`);
  }, [inside, pathname, search, hash]);

  return inside ? <Navigate to={APP_BASE_PATH} replace /> : null;
};

export const AppRoutes: React.FC = () => (
  <Routes>
    <Route
      element={
        <AppShell
          appSlug={APP_SLUG}
          basePath={APP_BASE_PATH}
          appLabel={APP_LABEL}
          navItems={APP_NAV}
        />
      }
    >
      <Route element={<RequireRole anyOf={APP_ROLES} service={APP_SLUG} />}>
        <Route path="translation" element={<TranslationRoute />} />
        <Route path="translation/tracker" element={<TrackerRoute />} />
      </Route>

      <Route path={`${APP_BASE_PATH}/denied`} element={<AccessDenied />} />
    </Route>

    <Route path="/denied" element={<DeniedRedirect />} />
    <Route path="*" element={<Unmatched />} />
  </Routes>
);
