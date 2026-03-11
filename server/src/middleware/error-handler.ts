import type { ErrorRequestHandler } from 'express';
import { isHttpError } from '../lib/http-error.js';
import { logError, logWarn } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isInvalidJsonBodyError(error)) {
    logWarn('request.invalid_json', {
      requestId: req.requestId,
      path: req.path
    });
    res.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }

  if (isHttpError(error)) {
    logWarn('request.validation_error', {
      requestId: req.requestId,
      path: req.path,
      statusCode: error.statusCode,
      error: error.message
    });
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  logError('request.unhandled_error', {
    requestId: req.requestId,
    path: req.path,
    error: error instanceof Error ? error.message : 'Unknown error'
  });
  res.status(500).json({ error: 'Internal server error.' });
};

function isInvalidJsonBodyError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const candidate = error as SyntaxError & { status?: number; body?: string };
  return candidate.status === 400 && typeof candidate.body === 'string';
}
