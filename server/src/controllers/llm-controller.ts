import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_MODELS, LLMService, type LLMProvider } from '../services/llm/llm-service.js';
import { GeneratedWebpageFormatError, WebpageGenerationService } from '../services/webpage-generation/webpage-generation-service.js';
import { HttpError } from '../lib/http-error.js';
import { logError, logInfo, logWarn } from '../lib/logger.js';
import { parseGenerateWebpageRouteInput, parseStreamRouteInput } from '../validators/llm-request-validator.js';

interface LlmControllerOptions {
  defaultProvider: LLMProvider;
  modelOverride?: string;
}

export class LlmController {
  constructor(
    private readonly llmService: LLMService,
    private readonly webpageGenerationService: WebpageGenerationService,
    private readonly options: LlmControllerOptions
  ) {}

  readonly providers = (_req: Request, res: Response): void => {
    res.json({
      providers: Object.keys(DEFAULT_MODELS),
      defaultProvider: this.options.defaultProvider,
      defaultModels: DEFAULT_MODELS
    });
  };

  readonly stream = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const streamStartedAt = Date.now();
    let requestInput;
    try {
      requestInput = parseStreamRouteInput(req.body, this.options);
    } catch (error) {
      next(error);
      return;
    }

    const controller = new AbortController();
    bindAbortOnClientDisconnect(req, res, controller, 'stream.client_disconnected');

    configureSSEHeaders(res);
    logInfo('stream.start', {
      requestId: req.requestId,
      provider: requestInput.provider,
      model: requestInput.model,
      promptLength: requestInput.prompt.length,
      systemLength: requestInput.system?.length ?? 0,
      temperature: requestInput.temperature,
      maxTokens: requestInput.maxTokens
    });

    res.write(`event: meta\ndata: ${JSON.stringify({ provider: requestInput.provider, model: requestInput.model })}\n\n`);

    try {
      let totalChars = 0;
      let firstTokenLatencyMs: number | null = null;
      for await (const delta of this.llmService.streamText(requestInput, controller.signal)) {
        if (controller.signal.aborted || res.writableEnded) {
          return;
        }

        if (firstTokenLatencyMs === null) {
          firstTokenLatencyMs = Date.now() - streamStartedAt;
          logInfo('stream.first_token', {
            requestId: req.requestId,
            provider: requestInput.provider,
            model: requestInput.model,
            firstTokenLatencyMs
          });
        }

        totalChars += delta.length;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }

      if (!res.writableEnded) {
        const streamLatencyMs = Date.now() - streamStartedAt;
        const routeLatencyMs = Date.now() - req.startedAt;
        logInfo('stream.complete', {
          requestId: req.requestId,
          provider: requestInput.provider,
          model: requestInput.model,
          outputChars: totalChars,
          durationMs: routeLatencyMs,
          routeLatencyMs,
          streamLatencyMs,
          firstTokenLatencyMs
        });
        res.write('event: done\ndata: {}\n\n');
        res.end();
      }
    } catch (error) {
      if (controller.signal.aborted || res.writableEnded) {
        return;
      }

      const message = errorMessage(error, 'Stream failed.');
      const streamLatencyMs = Date.now() - streamStartedAt;
      const routeLatencyMs = Date.now() - req.startedAt;
      logError('stream.error', {
        requestId: req.requestId,
        provider: requestInput.provider,
        model: requestInput.model,
        durationMs: routeLatencyMs,
        routeLatencyMs,
        streamLatencyMs,
        error: message
      });
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  };

  readonly generateWebpage = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const generationStartedAt = Date.now();
    let requestInput;
    try {
      requestInput = parseGenerateWebpageRouteInput(req.body, this.options);
    } catch (error) {
      next(error);
      return;
    }

    const controller = new AbortController();
    bindAbortOnClientDisconnect(req, res, controller, 'generate.client_disconnected');

    logInfo('generate.start', {
      requestId: req.requestId,
      provider: requestInput.provider,
      model: requestInput.model,
      promptLength: requestInput.prompt.length,
      maxTokens: requestInput.maxTokens
    });

    try {
      const webpage = await this.webpageGenerationService.generateWebpage(requestInput, controller.signal);
      if (controller.signal.aborted || res.writableEnded) {
        return;
      }

      const generationLatencyMs = Date.now() - generationStartedAt;
      const routeLatencyMs = Date.now() - req.startedAt;
      logInfo('generate.complete', {
        requestId: req.requestId,
        provider: requestInput.provider,
        model: requestInput.model,
        durationMs: routeLatencyMs,
        routeLatencyMs,
        generationLatencyMs,
        htmlLength: webpage.html.length,
        cssLength: webpage.css.length,
        jsLength: webpage.js.length
      });

      res.status(200).json(webpage);
    } catch (error) {
      if (controller.signal.aborted || res.writableEnded) {
        return;
      }

      const message = errorMessage(error, 'Webpage generation failed.');
      const statusCode = error instanceof GeneratedWebpageFormatError ? 422 : 502;
      const generationLatencyMs = Date.now() - generationStartedAt;
      const routeLatencyMs = Date.now() - req.startedAt;
      logError('generate.error', {
        requestId: req.requestId,
        provider: requestInput.provider,
        model: requestInput.model,
        durationMs: routeLatencyMs,
        routeLatencyMs,
        generationLatencyMs,
        statusCode,
        error: message
      });
      next(new HttpError(statusCode, message));
    }
  };
}

function configureSSEHeaders(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function bindAbortOnClientDisconnect(
  req: Request,
  res: Response,
  controller: AbortController,
  eventName: 'stream.client_disconnected' | 'generate.client_disconnected'
): void {
  const abort = (source: 'req.aborted' | 'res.close'): void => {
    if (controller.signal.aborted) {
      return;
    }

    logWarn(eventName, {
      requestId: req.requestId,
      source
    });
    controller.abort();
  };

  req.on('aborted', () => {
    abort('req.aborted');
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      abort('res.close');
    }
  });
}
