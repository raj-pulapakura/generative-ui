import { useEffect } from 'react';
import GenerativeUIPage from './pages/GenerativeUIPage';
import { runPreviewCompositionCheck } from './lib/route-checks';

let checksRan = false;

function App() {
  useEffect(() => {
    if (checksRan) {
      return;
    }

    runPreviewCompositionCheck();
    checksRan = true;
  }, []);

  return <GenerativeUIPage />;
}

export default App;
