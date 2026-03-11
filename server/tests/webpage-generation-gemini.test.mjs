import assert from 'node:assert/strict';
import test from 'node:test';
import { WebpageGenerationService } from '../dist/services/webpage-generation/webpage-generation-service.js';

const DUMMY_STREAM_CLIENT = {
  async *streamText() {
    yield '';
  }
};

test('Gemini webpage generation uses structured JSON mode with schema', async (t) => {
  process.env.GOOGLE_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    html: '<main id="demo"></main>',
                    css: '#demo { width: 120px; height: 120px; background: #0ad; }',
                    js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
                  })
                }
              ]
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const service = new WebpageGenerationService(DUMMY_STREAM_CLIENT);
  const webpage = await service.generateWebpage({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(typeof webpage.css, 'string');
  assert.equal(typeof webpage.js, 'string');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].generationConfig.maxOutputTokens, 16384);
  assert.equal(requests[0].generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(requests[0].generationConfig.responseJsonSchema.required, ['html', 'css', 'js']);
});

test('Gemini webpage generation retries once on MAX_TOKENS when maxTokens is not provided', async (t) => {
  process.env.GOOGLE_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '' }] } }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    html: '<main id="demo"></main>',
                    css: '#demo { width: 140px; height: 140px; background: #0ad; }',
                    js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
                  })
                }
              ]
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const service = new WebpageGenerationService(DUMMY_STREAM_CLIENT);
  const webpage = await service.generateWebpage({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].generationConfig.maxOutputTokens, 16384);
  assert.equal(requests[1].generationConfig.maxOutputTokens, 32768);
  assert.match(String(requests[1].systemInstruction?.parts?.[0]?.text), /Retry requirement/i);
});

test('Gemini webpage generation can retry multiple times on MAX_TOKENS', async (t) => {
  process.env.GOOGLE_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    if (requests.length <= 2) {
      return new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '' }] } }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    html: '<main id="demo"></main>',
                    css: '#demo { width: 140px; height: 140px; background: #0ad; }',
                    js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
                  })
                }
              ]
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const service = new WebpageGenerationService(DUMMY_STREAM_CLIENT);
  const webpage = await service.generateWebpage({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(requests.length, 3);
  assert.equal(requests[0].generationConfig.maxOutputTokens, 16384);
  assert.equal(requests[1].generationConfig.maxOutputTokens, 32768);
  assert.equal(requests[2].generationConfig.maxOutputTokens, 65535);
});

test('Gemini webpage generation returns actionable error when user maxTokens is too low', async (t) => {
  process.env.GOOGLE_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(
      JSON.stringify({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '' }] } }]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const service = new WebpageGenerationService(DUMMY_STREAM_CLIENT);

  await assert.rejects(
    () =>
      service.generateWebpage({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        prompt: 'Build an interactive color tile.',
        maxTokens: 1200
      }),
    /Increase maxTokens or simplify the prompt/i
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].generationConfig.maxOutputTokens, 1200);
});
