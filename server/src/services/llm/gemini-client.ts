import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';

const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

export function createGeminiClientFromEnv(): GoogleGenAI {
  const googleApiKey = process.env.GOOGLE_API_KEY?.trim();
  const legacyApiKey = process.env.GEMINI_API_KEY?.trim();
  const apiKey = googleApiKey || legacyApiKey;
  const useVertexAI = isTruthyEnv(process.env.GOOGLE_GENAI_USE_VERTEXAI);

  const options: GoogleGenAIOptions = {};

  if (useVertexAI) {
    options.vertexai = true;
    options.project = emptyToUndefined(process.env.GOOGLE_CLOUD_PROJECT);
    options.location = emptyToUndefined(process.env.GOOGLE_CLOUD_LOCATION);

    // Vertex AI can authenticate with ADC; API key is optional.
    if (apiKey) {
      options.apiKey = apiKey;
    }

    return new GoogleGenAI(options);
  }

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not set (legacy fallback: GEMINI_API_KEY).');
  }

  options.apiKey = apiKey;
  return new GoogleGenAI(options);
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
