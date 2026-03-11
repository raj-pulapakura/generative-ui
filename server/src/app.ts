import cors from 'cors';
import express, { type Express } from 'express';
import { type AppConfig } from './config/env.js';
import { LlmController } from './controllers/llm-controller.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { createLlmRoutes } from './routes/llm-routes.js';
import { DEFAULT_MODELS, LLMService } from './services/llm/llm-service.js';

const API_ENDPOINTS = [
  'POST /api/llm/stream',
  'POST /api/llm/generate-webpage',
  'GET /api/llm/providers'
] as const;

export function createApp(config: AppConfig): Express {
  const app = express();
  const llmService = new LLMService();
  const controller = new LlmController(llmService, {
    defaultProvider: config.defaultProvider,
    modelOverride: config.modelOverride
  });

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestContextMiddleware);
  app.use('/api/llm', createLlmRoutes(controller));

  app.get('/', (req, res) => {
    res.json({
      message: 'Server is running',
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString(),
      defaultProvider: config.defaultProvider,
      defaultModel: config.modelOverride || DEFAULT_MODELS[config.defaultProvider],
      endpoints: API_ENDPOINTS
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
