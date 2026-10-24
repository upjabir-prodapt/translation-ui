import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { PlatformProviders } from '@aicoe/aihub-platform/shell';
import { UseCasesContext } from '@aicoe/aihub-platform/usecases';
import { TranslationJobsProvider } from '../features/jobs/TranslationJobsContext';
import { APP_DESCRIPTOR } from './config';
import { AppRoutes } from './routes';

/**
 * What the platform's entitlement check and access-denied page read through
 * their port: just this app. Module scope so the context value is stable
 * across renders.
 */
const USE_CASES = [APP_DESCRIPTOR];

/**
 * Provider order: the router outermost so the auth provider and route guards
 * can navigate, the descriptor and platform providers next, and the job
 * provider inside them because it reads the session.
 *
 * **TranslationJobsProvider's position is load-bearing**: it mounts *above*
 * the routes, so a running job keeps polling when the user moves between
 * `/translation` and `/translation/tracker`. Moved inside a route element,
 * navigating away would unmount it and silently kill in-flight jobs.
 */
const App: React.FC = () => (
  <BrowserRouter>
    <UseCasesContext.Provider value={USE_CASES}>
      <PlatformProviders>
        <TranslationJobsProvider>
          <AppRoutes />
        </TranslationJobsProvider>
      </PlatformProviders>
    </UseCasesContext.Provider>
  </BrowserRouter>
);

export default App;
