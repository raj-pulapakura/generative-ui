import { createGeminiClientFromEnv } from './gemini-client.js';

export const SUPPORTED_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;

export type LLMProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface StreamTextRequest {
  provider: LLMProvider;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

interface SSEEvent {
  event?: string;
  data: string;
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: process.env.OPENAI_MODEL?.trim() || 'gpt-5.4',
  anthropic: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5',
  gemini: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
};

export function isProvider(value: unknown): value is LLMProvider {
  return typeof value === 'string' && (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

export class LLMService {
  async *streamText(request: StreamTextRequest, signal?: AbortSignal): AsyncGenerator<string> {
    if (request.provider === 'openai') {
      yield* this.streamOpenAI(request, signal);
      return;
    }

    if (request.provider === 'anthropic') {
      yield* this.streamAnthropic(request, signal);
      return;
    }

    yield* this.streamGemini(request, signal);
  }

  private async *streamOpenAI(
    request: StreamTextRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const apiKey = this.requireApiKey(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        stream: true,
        temperature: request.temperature,
        max_output_tokens: request.maxTokens,
        input: [
          ...(request.system
            ? [{ role: 'system', content: [{ type: 'input_text', text: request.system }] }]
            : []),
          { role: 'user', content: [{ type: 'input_text', text: request.prompt }] }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.getProviderError('OpenAI', response));
    }

    if (!response.body) {
      throw new Error('OpenAI returned an empty response body.');
    }

    for await (const event of parseSSE(response.body)) {
      if (event.data === '[DONE]') {
        break;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (
        payload.type === 'response.output_text.delta' &&
        typeof payload.delta === 'string' &&
        payload.delta.length > 0
      ) {
        yield payload.delta;
      }

      if (payload.type === 'response.error') {
        const errorObject =
          typeof payload.error === 'object' && payload.error !== null
            ? (payload.error as Record<string, unknown>)
            : null;
        const message =
          errorObject && typeof errorObject.message === 'string'
            ? errorObject.message
            : 'Unknown OpenAI stream error.';
        throw new Error(message);
      }
    }
  }

  private async *streamAnthropic(
    request: StreamTextRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const apiKey = this.requireApiKey(process.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model,
        stream: true,
        system: request.system,
        temperature: request.temperature,
        max_tokens: request.maxTokens ?? 1024,
        messages: [{ role: 'user', content: request.prompt }]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.getProviderError('Anthropic', response));
    }

    if (!response.body) {
      throw new Error('Anthropic returned an empty response body.');
    }

    for await (const event of parseSSE(response.body)) {
      if (event.data === '[DONE]') {
        break;
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        continue;
      }

      if (
        payload.type === 'content_block_delta' &&
        typeof payload.delta === 'object' &&
        payload.delta !== null
      ) {
        const delta = payload.delta as Record<string, unknown>;
        if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
          yield delta.text;
        }
      }

      if (payload.type === 'error') {
        const errorObject =
          typeof payload.error === 'object' && payload.error !== null
            ? (payload.error as Record<string, unknown>)
            : null;
        const message =
          errorObject && typeof errorObject.message === 'string'
            ? errorObject.message
            : 'Unknown Anthropic stream error.';
        throw new Error(message);
      }
    }
  }

  private async *streamGemini(
    request: StreamTextRequest,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const client = createGeminiClientFromEnv();

    try {
      const stream = await client.models.generateContentStream({
        model: request.model,
        contents: request.prompt,
        config: {
          systemInstruction: request.system,
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          abortSignal: signal
        }
      });

      let accumulated = '';
      for await (const chunk of stream) {
        const blockReason = chunk.promptFeedback?.blockReason;
        if (typeof blockReason === 'string' && blockReason.length > 0) {
          throw new Error(`Gemini blocked this generation request: ${blockReason}.`);
        }

        const text = chunk.text ?? '';
        if (text.length === 0) {
          continue;
        }

        if (text.startsWith(accumulated)) {
          const delta = text.slice(accumulated.length);
          if (delta.length > 0) {
            accumulated = text;
            yield delta;
          }
          continue;
        }

        accumulated += text;
        yield text;
      }
    } catch (error) {
      const detail = error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error.';
      throw new Error(`Gemini request failed: ${detail}`);
    }
  }

  private requireApiKey(apiKey: string | undefined, envName: string): string {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(`${envName} is not set.`);
    }

    return apiKey.trim();
  }

  private async getProviderError(providerName: string, response: Response): Promise<string> {
    const errorText = await response.text().catch(() => '');
    const detail = errorText.length > 0 ? errorText : `HTTP ${response.status}`;
    return `${providerName} request failed: ${detail}`;
  }
}

async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSSEEvent(rawEvent);
      if (parsed) {
        yield parsed;
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  const tail = parseSSEEvent(buffer.replace(/\r\n/g, '\n'));
  if (tail) {
    yield tail;
  }
}

function parseSSEEvent(rawEvent: string): SSEEvent | null {
  if (!rawEvent.trim()) {
    return null;
  }

  const lines = rawEvent.split('\n');
  const dataLines: string[] = [];
  let eventName: string | undefined;

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join('\n')
  };
}
