import { resolveDefaultModel } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { isProvider, type LLMProvider } from '../services/llm/llm-service.js';
import type { GenerateWebpageRouteInput, StreamRouteInput } from '../types/llm.js';

interface ParseOptions {
  defaultProvider: LLMProvider;
  modelOverride?: string;
}

const GENERATIVE_PROMPT_MAX_CHARS = 4_000;

export function parseStreamRouteInput(payload: unknown, options: ParseOptions): StreamRouteInput {
  const body = asBodyObject(payload);
  const provider = parseProvider(body.provider, options.defaultProvider);
  const prompt = parseNonEmptyString(body.prompt, 'prompt');
  const model = parseOptionalString(body.model, 'model') || resolveDefaultModel(provider, options.modelOverride);
  const system = parseOptionalString(body.system, 'system');
  const temperature = parseOptionalFiniteNumber(body.temperature, 'temperature');
  const maxTokens = parseOptionalPositiveInt(body.maxTokens, 'maxTokens');

  return {
    provider,
    model,
    prompt,
    system,
    temperature,
    maxTokens
  };
}

export function parseGenerateWebpageRouteInput(
  payload: unknown,
  options: ParseOptions
): GenerateWebpageRouteInput {
  const body = asBodyObject(payload);
  const provider = parseProvider(body.provider, options.defaultProvider);
  const prompt = parseNonEmptyString(body.prompt, 'prompt');
  if (prompt.length > GENERATIVE_PROMPT_MAX_CHARS) {
    throw new HttpError(400, `prompt must be ${GENERATIVE_PROMPT_MAX_CHARS} characters or fewer.`);
  }

  const model = parseOptionalString(body.model, 'model') || resolveDefaultModel(provider, options.modelOverride);
  const consistentDesign = parseOptionalBoolean(body.consistentDesign, 'consistentDesign');
  const system = parseOptionalString(body.system, 'system');
  const temperature = parseOptionalFiniteNumber(body.temperature, 'temperature');
  const maxTokens = parseOptionalPositiveInt(body.maxTokens, 'maxTokens');

  return {
    provider,
    model,
    prompt,
    consistentDesign,
    system,
    temperature,
    maxTokens
  };
}

function asBodyObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(400, 'Body must be a JSON object.');
  }

  return payload as Record<string, unknown>;
}

function parseProvider(value: unknown, fallback: LLMProvider): LLMProvider {
  if (value === undefined) {
    return fallback;
  }

  if (!isProvider(value)) {
    throw new HttpError(400, 'provider must be one of: openai, anthropic, gemini.');
  }

  return value;
}

function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${fieldName} must be a finite number.`);
  }

  return value;
}

function parseOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${fieldName} must be a boolean.`);
  }

  return value;
}

function parseOptionalPositiveInt(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `${fieldName} must be a positive integer.`);
  }

  return value;
}
