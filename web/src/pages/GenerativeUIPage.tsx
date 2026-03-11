import { type FormEvent, useMemo, useState } from 'react';
import { API_BASE_URL, MODEL_OPTIONS, PROVIDERS, type Provider } from '../lib/llm-config';
import {
  assertPreviewDocument,
  composeGeneratedDocument,
  composePlaceholderDocument,
  isGeneratedWebpagePayload,
  type GeneratedWebpagePayload
} from '../lib/generated-webpage';
import './GenerativeUIPage.css';

function GenerativeUIPage() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState(MODEL_OPTIONS.openai[0]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [previewDoc, setPreviewDoc] = useState(composePlaceholderDocument());
  const [previewKey, setPreviewKey] = useState(0);
  const [latestPayload, setLatestPayload] = useState<GeneratedWebpagePayload | null>(null);

  const modelsForProvider = useMemo(() => MODEL_OPTIONS[provider], [provider]);

  const handleProviderChange = (nextProvider: Provider): void => {
    setProvider(nextProvider);
    setModel(MODEL_OPTIONS[nextProvider][0]);
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/generate-webpage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          prompt: trimmedPrompt
        })
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Generation failed (${response.status}).`);
      }

      const payload = (await response.json()) as unknown;
      if (!isGeneratedWebpagePayload(payload)) {
        throw new Error('Server returned an invalid webpage payload.');
      }

      const nextPreviewDoc = composeGeneratedDocument(payload);
      assertPreviewDocument(payload, nextPreviewDoc);

      setLatestPayload(payload);
      setPreviewDoc(nextPreviewDoc);
      setPreviewKey((current) => current + 1);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error && caughtError.message.length > 0
          ? caughtError.message
          : 'Failed to generate webpage.';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="generative-page">
      <section className="generative-controls">
        <header className="generative-header">
          <p className="generative-eyebrow">Sandboxed Preview</p>
          <h1>Generative UI Builder</h1>
          <p className="generative-subtext">
            Describe an app idea and render the generated HTML/CSS/JS in an isolated iframe.
          </p>
        </header>

        <form className="generative-form" onSubmit={handleGenerate}>
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) => handleProviderChange(event.target.value as Provider)}
              disabled={isGenerating}
            >
              {PROVIDERS.map((providerOption) => (
                <option key={providerOption} value={providerOption}>
                  {providerOption}
                </option>
              ))}
            </select>
          </label>

          <label>
            Model
            <select value={model} onChange={(event) => setModel(event.target.value)} disabled={isGenerating}>
              {modelsForProvider.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
          </label>

          <label>
            App Prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="I want to calculate compound interest with sliders and a live chart."
              rows={7}
              required
              disabled={isGenerating}
            />
          </label>

          <button type="submit" disabled={isGenerating || prompt.trim().length === 0}>
            {isGenerating ? 'Generating...' : 'Generate Webpage'}
          </button>
        </form>

        {error ? <p className="generative-error">{error}</p> : null}

        <details className="generated-code" open={latestPayload !== null}>
          <summary>Generated code payload</summary>
          <div className="code-panels">
            <section>
              <h2>HTML</h2>
              <pre>{latestPayload?.html || 'Generate a page to view HTML.'}</pre>
            </section>
            <section>
              <h2>CSS</h2>
              <pre>{latestPayload?.css || 'Generate a page to view CSS.'}</pre>
            </section>
            <section>
              <h2>JavaScript</h2>
              <pre>{latestPayload?.js || 'Generate a page to view JavaScript.'}</pre>
            </section>
          </div>
        </details>
      </section>

      <section className="preview-panel">
        <header>
          <h2>Sandboxed Preview</h2>
        </header>
        <div className="preview-stage">
          <iframe
            key={previewKey}
            title="AI Generated Webpage Preview"
            sandbox="allow-scripts"
            srcDoc={previewDoc}
          />
          {isGenerating ? (
            <div className="preview-loading" role="status" aria-live="polite">
              <div className="loading-orbit" aria-hidden="true">
                <span className="loading-core" />
                <span className="loading-ring loading-ring-a" />
                <span className="loading-ring loading-ring-b" />
                <span className="loading-dot loading-dot-a" />
                <span className="loading-dot loading-dot-b" />
                <span className="loading-dot loading-dot-c" />
              </div>
              <div className="loading-caption">
                <p>Designing your app</p>
              </div>
              <div className="loading-track" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default GenerativeUIPage;
