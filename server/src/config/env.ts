import { DEFAULT_MODELS, isProvider, type LLMProvider } from '../services/llm/llm-service.js';

export interface AppConfig {
  port: number;
  defaultProvider: LLMProvider;
  modelOverride?: string;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT) || 3001;
  const defaultProvider = parseDefaultProvider(process.env.LLM_PROVIDER);
  const modelOverride = parseOptionalTrimmed(process.env.LLM_MODEL);

  return {
    port,
    defaultProvider,
    modelOverride
  };
}

export function resolveDefaultModel(provider: LLMProvider, modelOverride?: string): string {
  if (modelOverride && modelOverride.length > 0) {
    return modelOverride;
  }

  return DEFAULT_MODELS[provider];
}

function parseDefaultProvider(rawProvider: string | undefined): LLMProvider {
  if (!rawProvider) {
    return 'openai';
  }

  const normalized = rawProvider.trim().toLowerCase();
  return isProvider(normalized) ? normalized : 'openai';
}

function parseOptionalTrimmed(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
