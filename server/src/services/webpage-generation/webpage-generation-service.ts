import type { StreamTextRequest } from '../llm/llm-service.js';

export interface GenerateWebpageRequest {
  provider: StreamTextRequest['provider'];
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

export interface TextStreamingClient {
  streamText(request: StreamTextRequest, signal?: AbortSignal): AsyncGenerator<string>;
}

const GENERATED_WEBPAGE_SYSTEM_PROMPT = [
  'You generate runnable single-file web apps.',
  'Output must be valid JSON with exactly these top-level string keys: html, css, js.',
  'Do not wrap in markdown code fences.',
  'HTML should be body-safe markup only (no <html>, <head>, or <body> tags).',
  'CSS should style the generated HTML only.',
  'JavaScript should make the page interactive and run in a browser without external libraries.',
  'Design bias: visual-first, not text-first.',
  'Keep on-screen text minimal: short labels, short headings, no long paragraphs.',
  'Prioritize interactivity over explanation.',
  'Include direct manipulation controls (for example sliders, toggles, drag, hover, clickable cards, animated states).',
  'Every generated page should have at least two interactive UI elements with immediate visual feedback.',
  'Prefer visual communication (motion, color, layout change, charts/indicators made with native HTML/CSS/SVG/canvas) over descriptive text.'
].join(' ');

const GENERATED_WEBPAGE_MAX_CHARS = 150_000;
const GENERATED_WEBPAGE_PART_MAX_CHARS = 60_000;
const GENERATED_WEBPAGE_DEFAULT_MAX_TOKENS = 4_096;
const GENERATED_WEBPAGE_OPENAI_DEFAULT_MAX_TOKENS = 8_192;
const GENERATED_WEBPAGE_OPENAI_RETRY_MAX_TOKENS = 16_384;
const GENERATED_WEBPAGE_OPENAI_REASONING_EFFORT = 'low';
const GENERATED_WEBPAGE_OPENAI_VERBOSITY = 'low';
const GENERATED_WEBPAGE_ANTHROPIC_DEFAULT_MAX_TOKENS = 8_192;
const GENERATED_WEBPAGE_ANTHROPIC_RETRY_MAX_TOKENS = 16_384;
const GENERATED_WEBPAGE_RETRY_CONCISION_HINT =
  'Retry requirement: keep the implementation concise. Avoid comments and keep total HTML/CSS/JS under roughly 12,000 characters.';
const WEBPAGE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['html', 'css', 'js'],
  properties: {
    html: { type: 'string' },
    css: { type: 'string' },
    js: { type: 'string' }
  }
} as const;

export class WebpageGenerationService {
  constructor(private readonly textStreamingClient: TextStreamingClient) {}

  async generateWebpage(
    request: GenerateWebpageRequest,
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
    const mockedResponse = process.env.LLM_GENERATE_WEBPAGE_MOCK_RESPONSE?.trim();
    if (mockedResponse) {
      return parseGeneratedWebpagePayload(mockedResponse);
    }

    const hasUserDefinedMaxTokens = typeof request.maxTokens === 'number';
    const maxTokens = request.maxTokens ?? defaultMaxTokensForProvider(request.provider);
    const prompt = buildGeneratedWebpagePrompt(request.prompt);
    const system = request.system
      ? `${GENERATED_WEBPAGE_SYSTEM_PROMPT}\n\nAdditional constraints from caller:\n${request.system}`
      : GENERATED_WEBPAGE_SYSTEM_PROMPT;

    if (request.provider === 'openai') {
      return this.generateOpenAIStructuredWebpageWithRetry(
        {
          ...request,
          system,
          prompt,
          maxTokens,
          hasUserDefinedMaxTokens
        },
        signal
      );
    }

    if (request.provider === 'anthropic') {
      return this.generateAnthropicStructuredWebpageWithRetry(
        {
          ...request,
          system,
          prompt,
          maxTokens,
          hasUserDefinedMaxTokens
        },
        signal
      );
    }

    const output = await this.collectText(
      {
        provider: request.provider,
        model: request.model,
        prompt,
        system,
        temperature: request.temperature,
        maxTokens
      },
      signal
    );

    return parseGeneratedWebpagePayload(output);
  }

  private async generateOpenAIStructuredWebpageWithRetry(
    request: GenerateWebpageRequest & {
      prompt: string;
      system?: string;
      maxTokens: number;
      hasUserDefinedMaxTokens: boolean;
    },
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
    try {
      return await this.generateOpenAIStructuredWebpage(request, signal);
    } catch (error) {
      if (!(error instanceof GeneratedWebpageMaxTokensError)) {
        throw error;
      }

      if (request.hasUserDefinedMaxTokens) {
        throw new GeneratedWebpageFormatError(
          `OpenAI hit max_output_tokens (${request.maxTokens}) before completing structured JSON output. Increase maxTokens or simplify the prompt.`
        );
      }

      const retryMaxTokens = Math.min(request.maxTokens * 2, GENERATED_WEBPAGE_OPENAI_RETRY_MAX_TOKENS);

      if (retryMaxTokens <= request.maxTokens) {
        throw new GeneratedWebpageFormatError(
          `OpenAI hit max_output_tokens (${request.maxTokens}) before completing structured JSON output.`
        );
      }

      return this.generateOpenAIStructuredWebpage(
        {
          ...request,
          maxTokens: retryMaxTokens,
          system: request.system
            ? `${request.system}\n\n${GENERATED_WEBPAGE_RETRY_CONCISION_HINT}`
            : GENERATED_WEBPAGE_RETRY_CONCISION_HINT
        },
        signal
      );
    }
  }

  private async generateOpenAIStructuredWebpage(
    request: GenerateWebpageRequest & {
      prompt: string;
      system?: string;
      maxTokens: number;
    },
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
    const apiKey = this.requireApiKey(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        temperature: request.temperature,
        max_output_tokens: request.maxTokens,
        reasoning: {
          effort: GENERATED_WEBPAGE_OPENAI_REASONING_EFFORT
        },
        input: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt }
        ],
        text: {
          verbosity: GENERATED_WEBPAGE_OPENAI_VERBOSITY,
          format: {
            type: 'json_schema',
            name: 'generated_webpage_payload',
            strict: true,
            schema: WEBPAGE_OUTPUT_SCHEMA
          }
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.getProviderError('OpenAI', response));
    }

    const payload = (await response.json()) as OpenAIWebpageResponse;
    if (
      payload.status === 'incomplete' &&
      payload.incomplete_details &&
      payload.incomplete_details.reason === 'max_output_tokens'
    ) {
      throw new GeneratedWebpageMaxTokensError(
        `OpenAI hit max_output_tokens (${request.maxTokens}) before completing structured JSON output.`
      );
    }

    const refusalReason = extractOpenAIRefusalReason(payload.output);
    if (refusalReason) {
      throw new GeneratedWebpageFormatError(`OpenAI refused this generation request: ${refusalReason}`);
    }

    const text = extractOpenAITextOutput(payload);
    if (text.length === 0) {
      throw new GeneratedWebpageFormatError('OpenAI returned no text content.');
    }

    return parseGeneratedWebpagePayload(text);
  }

  private async generateAnthropicStructuredWebpageWithRetry(
    request: GenerateWebpageRequest & {
      prompt: string;
      system?: string;
      maxTokens: number;
      hasUserDefinedMaxTokens: boolean;
    },
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
    try {
      return await this.generateAnthropicStructuredWebpage(request, signal);
    } catch (error) {
      if (!(error instanceof GeneratedWebpageMaxTokensError)) {
        throw error;
      }

      if (request.hasUserDefinedMaxTokens) {
        throw new GeneratedWebpageFormatError(
          `Anthropic hit max_tokens (${request.maxTokens}) before completing structured JSON output. Increase maxTokens or simplify the prompt.`
        );
      }

      const retryMaxTokens = Math.min(
        request.maxTokens * 2,
        GENERATED_WEBPAGE_ANTHROPIC_RETRY_MAX_TOKENS
      );

      if (retryMaxTokens <= request.maxTokens) {
        throw new GeneratedWebpageFormatError(
          `Anthropic hit max_tokens (${request.maxTokens}) before completing structured JSON output.`
        );
      }

      return this.generateAnthropicStructuredWebpage(
        {
          ...request,
          maxTokens: retryMaxTokens,
          system: request.system
            ? `${request.system}\n\n${GENERATED_WEBPAGE_RETRY_CONCISION_HINT}`
            : GENERATED_WEBPAGE_RETRY_CONCISION_HINT
        },
        signal
      );
    }
  }

  private async collectText(request: StreamTextRequest, signal?: AbortSignal): Promise<string> {
    let text = '';
    for await (const delta of this.textStreamingClient.streamText(request, signal)) {
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

  private async generateAnthropicStructuredWebpage(
    request: GenerateWebpageRequest & {
      prompt: string;
      system?: string;
      maxTokens: number;
    },
    signal?: AbortSignal
  ): Promise<GeneratedWebpage> {
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
        max_tokens: request.maxTokens,
        system: request.system,
        temperature: request.temperature,
        messages: [{ role: 'user', content: request.prompt }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: WEBPAGE_OUTPUT_SCHEMA
          }
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(await this.getProviderError('Anthropic', response));
    }

    const payload = (await response.json()) as {
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
    };

    if (payload.stop_reason === 'max_tokens') {
      throw new GeneratedWebpageMaxTokensError(
        `Anthropic hit max_tokens (${request.maxTokens}) before completing structured JSON output.`
      );
    }

    if (payload.stop_reason === 'refusal') {
      throw new GeneratedWebpageFormatError('Anthropic refused this generation request.');
    }

    const text = Array.isArray(payload.content)
      ? payload.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text as string)
          .join('')
          .trim()
      : '';

    if (text.length === 0) {
      throw new GeneratedWebpageFormatError('Anthropic returned no text content.');
    }

    return parseGeneratedWebpagePayload(text);
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

class GeneratedWebpageMaxTokensError extends GeneratedWebpageFormatError {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedWebpageMaxTokensError';
  }
}

function defaultMaxTokensForProvider(provider: StreamTextRequest['provider']): number {
  if (provider === 'openai') {
    return GENERATED_WEBPAGE_OPENAI_DEFAULT_MAX_TOKENS;
  }

  if (provider === 'anthropic') {
    return GENERATED_WEBPAGE_ANTHROPIC_DEFAULT_MAX_TOKENS;
  }

  return GENERATED_WEBPAGE_DEFAULT_MAX_TOKENS;
}

interface OpenAIWebpageResponse {
  status?: string;
  output_text?: string;
  incomplete_details?: {
    reason?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
}

function extractOpenAITextOutput(payload: OpenAIWebpageResponse): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const text = Array.isArray(payload.output)
    ? payload.output
        .filter((item) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item) => item.content as Array<{ type?: string; text?: string }>)
        .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('')
        .trim()
    : '';

  return text;
}

function extractOpenAIRefusalReason(output: OpenAIWebpageResponse['output']): string | null {
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part?.type === 'refusal' && typeof part.refusal === 'string' && part.refusal.length > 0) {
        return part.refusal;
      }
    }
  }

  return null;
}

function buildGeneratedWebpagePrompt(userPrompt: string): string {
  return [
    'Build a self-contained interactive webpage for this request:',
    userPrompt.trim(),
    '',
    'Behavior goals:',
    '- Visual-first UI with strong aesthetics.',
    '- Minimal text content.',
    '- Interaction-first experience with immediate visual feedback.',
    '',
    'Return JSON only with keys: html, css, js.',
    'Do not include explanations.'
  ].join('\n');
}

function parseGeneratedWebpagePayload(rawOutput: string): GeneratedWebpage {
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
