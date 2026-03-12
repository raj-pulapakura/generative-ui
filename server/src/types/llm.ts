import type { LLMProvider } from '../services/llm/llm-service.js';

export interface StreamRouteInput {
  provider: LLMProvider;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateWebpageRouteInput {
  provider: LLMProvider;
  model: string;
  prompt: string;
  consistentDesign?: boolean;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}
