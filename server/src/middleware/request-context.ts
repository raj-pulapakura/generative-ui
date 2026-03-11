import type { NextFunction, Request, Response } from 'express';
import { logInfo } from '../lib/logger.js';

let requestCounter = 0;

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = nextRequestId();
  req.startedAt = Date.now();

  logInfo('request.start', {
    requestId: req.requestId,
    method: req.method,
    path: req.path
  });

  res.on('finish', () => {
    logInfo('request.finish', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.startedAt
    });
  });

  next();
}

function nextRequestId(): string {
  requestCounter += 1;
  return `${Date.now()}-${requestCounter}`;
}
