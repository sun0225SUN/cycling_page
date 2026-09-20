import { lazy, Suspense } from 'react';
import { LocaleProvider } from './hooks/useLocale';
import { THEME_PRESET } from './config';
import { ErrorBoundary } from './components/ErrorBoundary';
import Dashboard from './themes/dashboard';

const Classic = lazy(() => import('./themes/classic'));

export default function App() {
  return (
    <LocaleProvider>
      <ErrorBoundary>
        {/* No full-screen black loader: body already has the page background.
            Dashboard is eager; only classic stays lazy. Suspense covers data fetch. */}
        <Suspense fallback={null}>
          {THEME_PRESET === 'classic' ? <Classic /> : <Dashboard />}
        </Suspense>
      </ErrorBoundary>
    </LocaleProvider>
  );
}
