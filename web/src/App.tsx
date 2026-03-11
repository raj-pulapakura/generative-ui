import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import LlmTestingPage from './pages/LlmTestingPage';
import GenerativeUIPage from './pages/GenerativeUIPage';
import { runPreviewCompositionCheck, runRouteLevelChecks } from './lib/route-checks';
import { APP_ROUTE_PATHS, normalizeRoutePath, type AppRoutePath } from './lib/routes';

let checksRan = false;

function App() {
  const [currentPath, setCurrentPath] = useState<AppRoutePath>(() => resolvePath(window.location.pathname));

  useEffect(() => {
    const onPopState = (): void => {
      setCurrentPath(resolvePath(window.location.pathname));
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useEffect(() => {
    if (checksRan) {
      return;
    }

    runRouteLevelChecks(APP_ROUTE_PATHS);
    runPreviewCompositionCheck();
    checksRan = true;
  }, []);

  const navigate = (path: AppRoutePath): void => {
    if (path === currentPath) {
      return;
    }
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  if (currentPath === '/llm-testing') {
    return <LlmTestingPage />;
  }

  if (currentPath === '/generative-ui') {
    return <GenerativeUIPage />;
  }

  return <HomePage onNavigate={navigate} />;
}

function resolvePath(pathname: string): AppRoutePath {
  return normalizeRoutePath(pathname) ?? '/';
}

export default App;
