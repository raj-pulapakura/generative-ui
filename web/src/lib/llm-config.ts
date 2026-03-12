export type Provider = 'openai' | 'anthropic' | 'gemini';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3001';

export const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];

export const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: ['gpt-5.4', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-nano'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: [
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash'
  ]
};
