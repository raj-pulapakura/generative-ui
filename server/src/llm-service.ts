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

export interface GenerateWebpageRequest {
  provider: LLMProvider;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GeneratedWebpage {
  html: string;
  css: string;
  js: string;
}

export class GeneratedWebpageFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedWebpageFormatError';
  }
}

interface SSEEvent {
  event?: string;
  data: string;
}

const GENERATED_WEBPAGE_SYSTEM_PROMPT = [
  'You generate runnable single-file web apps.',
  'Output must be valid JSON with exactly these top-level string keys: html, css, js.',
  'Do not wrap in markdown code fences.',
  'HTML should be body-safe markup only (no <html>, <head>, or <body> tags).',
  'CSS should style the generated HTML only.',
  'JavaScript should make the page interactive and run in a browser without external libraries.'
].join(' ');

const GENERATED_WEBPAGE_MAX_CHARS = 150_000;
const GENERATED_WEBPAGE_PART_MAX_CHARS = 60_000;

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini',
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

  async generateWebpage(
    request: GenerateWebpageRequest,
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
    const mockedResponse = process.env.LLM_GENERATE_WEBPAGE_MOCK_RESPONSE?.trim();
    if (mockedResponse) {
      return parseGeneratedWebpagePayload(mockedResponse);
    }

    const prompt = buildGeneratedWebpagePrompt(request.prompt);
    const system = request.system
      ? `${GENERATED_WEBPAGE_SYSTEM_PROMPT}\n\nAdditional constraints from caller:\n${request.system}`
      : GENERATED_WEBPAGE_SYSTEM_PROMPT;

    const output = await this.collectText(
      {
        provider: request.provider,
        model: request.model,
        prompt,
        system,
        temperature: request.temperature,
        maxTokens: request.maxTokens
      },
      signal
    );

    return parseGeneratedWebpagePayload(output);
  }

  private async collectText(request: StreamTextRequest, signal?: AbortSignal): Promise<string> {
    let text = '';
    for await (const delta of this.streamText(request, signal)) {
      text += delta;
      if (text.length > GENERATED_WEBPAGE_MAX_CHARS) {
        throw new GeneratedWebpageFormatError(
          `Generated webpage output exceeded ${GENERATED_WEBPAGE_MAX_CHARS} characters.`
        );
      }
    }

    if (text.trim().length === 0) {
      throw new GeneratedWebpageFormatError('Model returned empty webpage output.');
    }

    return text;
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
    const apiKey = this.requireApiKey(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: request.system
          ? {
              parts: [{ text: request.system }]
            }
          : undefined,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: request.prompt }]
          }
        ]
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.getProviderError('Gemini', response));
    }

    if (!response.body) {
      throw new Error('Gemini returned an empty response body.');
    }

    let accumulated = '';
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

      const message = this.extractGeminiError(payload);
      if (message) {
        throw new Error(message);
      }

      const text = this.extractGeminiText(payload);
      if (!text) {
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
  }

  private extractGeminiText(payload: Record<string, unknown>): string {
    if (!Array.isArray(payload.candidates) || payload.candidates.length === 0) {
      return '';
    }

    const firstCandidate =
      typeof payload.candidates[0] === 'object' && payload.candidates[0] !== null
        ? (payload.candidates[0] as Record<string, unknown>)
        : null;
    if (!firstCandidate) {
      return '';
    }

    const content =
      typeof firstCandidate.content === 'object' && firstCandidate.content !== null
        ? (firstCandidate.content as Record<string, unknown>)
        : null;
    if (!content || !Array.isArray(content.parts)) {
      return '';
    }

    return content.parts
      .filter((part): part is Record<string, unknown> => typeof part === 'object' && part !== null)
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');
  }

  private extractGeminiError(payload: Record<string, unknown>): string | null {
    if (typeof payload.error !== 'object' || payload.error === null) {
      return null;
    }

    const errorObject = payload.error as Record<string, unknown>;
    if (typeof errorObject.message === 'string' && errorObject.message.length > 0) {
      return errorObject.message;
    }

    return 'Unknown Gemini stream error.';
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

function buildGeneratedWebpagePrompt(userPrompt: string): string {
  return [
    'Build a self-contained interactive webpage for this request:',
    userPrompt.trim(),
    '',
    'Return JSON only with keys: html, css, js.',
    'Do not include explanations.'
  ].join('\n');
}

export function parseGeneratedWebpagePayload(rawOutput: string): GeneratedWebpage {
  const payloadText = extractJsonObject(rawOutput);
  let parsed: unknown;

  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new GeneratedWebpageFormatError('Model output was not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new GeneratedWebpageFormatError('Model output must be a JSON object.');
  }

  const candidate = parsed as Record<string, unknown>;
  const html = asNonEmptyString(candidate.html, 'html');
  const css = asNonEmptyString(candidate.css, 'css');
  const js = asNonEmptyString(candidate.js, 'js');

  enforceMaxLength(html, 'html');
  enforceMaxLength(css, 'css');
  enforceMaxLength(js, 'js');

  return { html, css, js };
}

function extractJsonObject(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    throw new GeneratedWebpageFormatError('Model output was empty.');
  }

  if (trimmed.startsWith('```')) {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new GeneratedWebpageFormatError('Model output did not include a JSON object.');
}

function asNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GeneratedWebpageFormatError(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function enforceMaxLength(value: string, fieldName: string): void {
  if (value.length > GENERATED_WEBPAGE_PART_MAX_CHARS) {
    throw new GeneratedWebpageFormatError(
      `${fieldName} exceeds ${GENERATED_WEBPAGE_PART_MAX_CHARS} characters.`
    );
  }
}
