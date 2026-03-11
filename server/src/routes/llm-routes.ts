import { Router } from 'express';
import { LlmController } from '../controllers/llm-controller.js';

export function createLlmRoutes(controller: LlmController): Router {
  const router = Router();

  router.post('/stream', controller.stream);
  router.post('/generate-webpage', controller.generateWebpage);
  router.get('/providers', controller.providers);

  return router;
}
