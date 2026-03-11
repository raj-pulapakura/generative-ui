export type Provider = 'openai' | 'anthropic' | 'gemini';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3001';

export const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];

export const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: ['gpt-5.4', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano'],
  anthropic: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
  gemini: [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview'
  ]
};
