import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import '../App.css';
import { API_BASE_URL, MODEL_OPTIONS, PROVIDERS, type Provider } from '../lib/llm-config';

function LlmTestingPage() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [model, setModel] = useState<string>(MODEL_OPTIONS.openai[0]);
  const [prompt, setPrompt] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('512');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const modelsForProvider = useMemo(() => MODEL_OPTIONS[provider], [provider]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleProviderChange = (nextProvider: Provider): void => {
    setProvider(nextProvider);
    setModel(MODEL_OPTIONS[nextProvider][0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!prompt.trim()) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setError('');
    setOutput('');

    const body: Record<string, unknown> = {
      provider,
      model,
      prompt: prompt.trim()
    };

    if (systemPrompt.trim()) {
      body.system = systemPrompt.trim();
    }

    if (temperature.trim()) {
      const parsed = Number(temperature);
      if (!Number.isFinite(parsed)) {
        setIsStreaming(false);
        setError('Temperature must be a valid number.');
        return;
      }
      body.temperature = parsed;
    }

    if (maxTokens.trim()) {
      const parsed = Number(maxTokens);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setIsStreaming(false);
        setError('Max tokens must be a positive integer.');
        return;
      }
      body.maxTokens = parsed;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/llm/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Stream response body is missing.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let shouldStop = false;

      while (!shouldStop) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let splitIndex = buffer.indexOf('\n\n');
        while (splitIndex !== -1) {
          const rawEvent = buffer.slice(0, splitIndex);
          buffer = buffer.slice(splitIndex + 2);
          const parsed = parseSSEEvent(rawEvent);

          if (parsed?.error) {
            throw new Error(parsed.error);
          }

          if (parsed?.delta) {
            setOutput((current) => current + parsed.delta);
          }

          if (parsed?.done) {
            shouldStop = true;
            break;
          }

          splitIndex = buffer.indexOf('\n\n');
        }
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return;
      }

      const message =
        caughtError instanceof Error && caughtError.message
          ? caughtError.message
          : 'Failed to stream response.';
      setError(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="left-panel">
        <header className="panel-header">
          <p className="eyebrow">Proof Of Work</p>
          <h1>LLM Streaming Console</h1>
          <p className="subtext">Send one prompt, stream the response, replace output each run.</p>
        </header>

        <form className="prompt-form" onSubmit={handleSubmit}>
          <label>
            Provider
            <select
              value={provider}
              onChange={(event) => handleProviderChange(event.target.value as Provider)}
              disabled={isStreaming}
            >
              {PROVIDERS.map((providerValue) => (
                <option key={providerValue} value={providerValue}>
                  {providerValue}
                </option>
              ))}
            </select>
          </label>

          <label>
            Model
            <select value={model} onChange={(event) => setModel(event.target.value)} disabled={isStreaming}>
              {modelsForProvider.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
          </label>

          <label>
            System Prompt (optional)
            <input
              type="text"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              placeholder="You are concise and direct."
              disabled={isStreaming}
            />
          </label>

          <label>
            Prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Explain quicksort in 5 bullets."
              rows={5}
              required
              disabled={isStreaming}
            />
          </label>

          <div className="tuning-row">
            <label>
              Temperature
              <input
                type="number"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(event.target.value)}
                disabled={isStreaming}
              />
            </label>

            <label>
              Max Tokens
              <input
                type="number"
                step="1"
                value={maxTokens}
                onChange={(event) => setMaxTokens(event.target.value)}
                disabled={isStreaming}
              />
            </label>
          </div>

          <button type="submit" disabled={isStreaming || !prompt.trim()}>
            {isStreaming ? 'Streaming...' : 'Send Prompt'}
          </button>
        </form>

        <section className="output-section">
          <div className="output-header">
            <h2>Stream Output</h2>
            <p>{isStreaming ? 'Receiving tokens...' : 'Idle'}</p>
          </div>

          <pre className="output-box">
            {output || 'No output yet. Submit a prompt to verify streaming from the API.'}
          </pre>

          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </section>

      <section className="right-panel" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </section>
    </main>
  );
}

interface ParsedStreamEvent {
  delta?: string;
  error?: string;
  done?: boolean;
}

function parseSSEEvent(rawEvent: string): ParsedStreamEvent | null {
  if (!rawEvent.trim()) {
    return null;
  }

  const lines = rawEvent.split('\n');
  const dataLines: string[] = [];
  let eventName = 'message';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  const data = dataLines.join('\n');
  if (!data) {
    return null;
  }

  if (eventName === 'done') {
    return { done: true };
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    if (eventName === 'error') {
      return { error: data };
    }
    return { delta: data };
  }

  if (eventName === 'error') {
    const message = typeof payload.error === 'string' ? payload.error : 'Unknown stream error.';
    return { error: message };
  }

  if (typeof payload.delta === 'string') {
    return { delta: payload.delta };
  }

  if (typeof payload.error === 'string') {
    return { error: payload.error };
  }

  return null;
}

export default LlmTestingPage;
