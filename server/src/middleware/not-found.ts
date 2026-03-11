import type { Request, Response } from 'express';

const API_ENDPOINTS = [
  'POST /api/llm/stream',
  'POST /api/llm/generate-webpage',
  'GET /api/llm/providers'
] as const;

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found.',
    method: req.method,
    path: req.path,
    endpoints: API_ENDPOINTS
  });
}
