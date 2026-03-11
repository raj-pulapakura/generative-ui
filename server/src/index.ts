import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { DEFAULT_MODELS, LLMService, type LLMProvider, isProvider } from './llm-service.js';

interface StreamRouteInput {
  provider: LLMProvider;
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

const port = Number(process.env.PORT) || 3001;
const llmService = new LLMService();
const defaultProvider = parseDefaultProvider(process.env.LLM_PROVIDER);
let requestCounter = 0;

logInfo('server.boot', {
  port,
  defaultProvider,
  defaultModel: resolveDefaultModel(defaultProvider),
  availableProviders: Object.keys(DEFAULT_MODELS)
});

const server = createServer(async (req, res) => {
  const requestId = nextRequestId();
  const startedAt = Date.now();
  const url = new URL(req.url || '/', 'http://localhost');

  logInfo('request.start', {
    requestId,
    method: req.method,
    path: url.pathname
  });

  res.on('finish', () => {
    logInfo('request.finish', {
      requestId,
      method: req.method,
      path: url.pathname,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/llm/stream') {
    await handleLLMStreamRoute(req, res, requestId);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/llm/providers') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        providers: Object.keys(DEFAULT_MODELS),
        defaultProvider,
        defaultModels: DEFAULT_MODELS
      })
    );
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      message: 'Server is running',
      method: req.method,
      path: req.url,
      timestamp: new Date().toISOString(),
      endpoints: ['POST /api/llm/stream', 'GET /api/llm/providers']
    })
  );
});

server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

async function handleLLMStreamRoute(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string
): Promise<void> {
  const streamStartedAt = Date.now();
  let payload: unknown;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    logWarn('stream.bad_request_body', { requestId, error: errorMessage(error, 'Invalid request body.') });
    sendJsonError(res, 400, errorMessage(error, 'Invalid request body.'));
    return;
  }

  let request: StreamRouteInput;
  try {
    request = parseStreamRouteInput(payload);
  } catch (error) {
    logWarn('stream.bad_request_payload', {
      requestId,
      error: errorMessage(error, 'Invalid stream request.')
    });
    sendJsonError(res, 400, errorMessage(error, 'Invalid stream request.'));
    return;
  }

  const controller = new AbortController();
  req.on('close', () => {
    if (!controller.signal.aborted) {
      logWarn('stream.client_disconnected', { requestId });
      controller.abort();
    }
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  logInfo('stream.start', {
    requestId,
    provider: request.provider,
    model: request.model,
    promptLength: request.prompt.length,
    systemLength: request.system?.length ?? 0,
    temperature: request.temperature,
    maxTokens: request.maxTokens
  });

  res.write(`event: meta\ndata: ${JSON.stringify({ provider: request.provider, model: request.model })}\n\n`);

  try {
    let totalChars = 0;
    for await (const delta of llmService.streamText(request, controller.signal)) {
      if (controller.signal.aborted || res.writableEnded) {
        return;
      }

      totalChars += delta.length;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }

    if (!res.writableEnded) {
      logInfo('stream.complete', {
        requestId,
        provider: request.provider,
        model: request.model,
        outputChars: totalChars,
        durationMs: Date.now() - streamStartedAt
      });
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  } catch (error) {
    if (controller.signal.aborted || res.writableEnded) {
      return;
    }

    logError('stream.error', {
      requestId,
      provider: request.provider,
      model: request.model,
      durationMs: Date.now() - streamStartedAt,
      error: errorMessage(error, 'Stream failed.')
    });
    res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage(error, 'Stream failed.') })}\n\n`);
    res.end();
  }
}

function parseStreamRouteInput(payload: unknown): StreamRouteInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Body must be a JSON object.');
  }

  const body = payload as Record<string, unknown>;
  const providerRaw = body.provider;
  if (providerRaw !== undefined && !isProvider(providerRaw)) {
    throw new Error('provider must be one of: openai, anthropic, gemini.');
  }

  const provider = providerRaw === undefined ? defaultProvider : providerRaw;
  if (!isProvider(provider)) {
    throw new Error('provider must be one of: openai, anthropic, gemini.');
  }

  const prompt = parseNonEmptyString(body.prompt, 'prompt');
  const model = parseOptionalString(body.model, 'model') || resolveDefaultModel(provider);
  const system = parseOptionalString(body.system, 'system');
  const temperature = parseOptionalFiniteNumber(body.temperature, 'temperature');
  const maxTokens = parseOptionalPositiveInt(body.maxTokens, 'maxTokens');

  return {
    provider,
    model,
    prompt,
    system,
    temperature,
    maxTokens
  };
}

function resolveDefaultModel(provider: LLMProvider): string {
  if (process.env.LLM_MODEL && process.env.LLM_MODEL.trim().length > 0) {
    return process.env.LLM_MODEL.trim();
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

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    throw new Error('Request body is required.');
  }

  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalFiniteNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return value;
}

function parseOptionalPositiveInt(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return value;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function nextRequestId(): string {
  requestCounter += 1;
  return `${Date.now()}-${requestCounter}`;
}

function logInfo(event: string, details?: Record<string, unknown>): void {
  writeLog('INFO', event, details);
}

function logWarn(event: string, details?: Record<string, unknown>): void {
  writeLog('WARN', event, details);
}

function logError(event: string, details?: Record<string, unknown>): void {
  writeLog('ERROR', event, details);
}

function writeLog(level: 'INFO' | 'WARN' | 'ERROR', event: string, details?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] [${level}] ${event}`;
  if (!details) {
    console.log(line);
    return;
  }

  console.log(`${line} ${JSON.stringify(details)}`);
}
