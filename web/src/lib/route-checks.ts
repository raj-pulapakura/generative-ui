import { assertPreviewDocument, composeGeneratedDocument } from './generated-webpage';
import { APP_ROUTE_PATHS, normalizeRoutePath, type AppRoutePath } from './routes';

export function runRouteLevelChecks(paths: readonly AppRoutePath[]): void {
  const missing = APP_ROUTE_PATHS.filter((path) => !paths.includes(path));
  if (missing.length > 0) {
    throw new Error(`Router is missing required paths: ${missing.join(', ')}`);
  }

  if (normalizeRoutePath('/llm-testing/') !== '/llm-testing') {
    throw new Error('Router path normalization failed for /llm-testing/.');
  }

  if (normalizeRoutePath('/generative-ui/') !== '/generative-ui') {
    throw new Error('Router path normalization failed for /generative-ui/.');
  }
}

export function runPreviewCompositionCheck(): void {
  const sample = {
    html: '<main id="sample-root"><button id="sample-btn">Tap</button></main>',
    css: '#sample-root { padding: 8px; }',
    js: 'document.getElementById("sample-btn")?.addEventListener("click", () => {});'
  };
  const document = composeGeneratedDocument(sample);
  assertPreviewDocument(sample, document);
}
