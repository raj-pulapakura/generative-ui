import { assertPreviewDocument, composeGeneratedDocument } from './generated-webpage';

export function runPreviewCompositionCheck(): void {
  const sample = {
    html: '<main id="sample-root"><button id="sample-btn">Tap</button></main>',
    css: '#sample-root { padding: 8px; }',
    js: 'document.getElementById("sample-btn")?.addEventListener("click", () => {});'
  };
  const document = composeGeneratedDocument(sample);
  assertPreviewDocument(sample, document);
}
