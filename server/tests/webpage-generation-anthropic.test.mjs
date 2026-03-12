import assert from 'node:assert/strict';
import test from 'node:test';
import { WebpageGenerationService } from '../dist/services/webpage-generation/webpage-generation-service.js';

const DUMMY_STREAM_CLIENT = {
  async *streamText() {
    yield '';
  }
};

test('Anthropic webpage generation retries once on max_tokens when maxTokens is not provided', async (t) => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    if (requests.length === 1) {
      return new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              html: '<main id="demo"></main>',
              css: '#demo { width: 140px; height: 140px; background: #0ad; }',
              js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
            })
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
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(typeof webpage.css, 'string');
  assert.equal(typeof webpage.js, 'string');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_tokens, 8192);
  assert.equal(requests[1].max_tokens, 16384);
  assert.match(String(requests[1].system), /Retry requirement/i);
});

test('Anthropic webpage generation returns actionable error when user maxTokens is too low', async (t) => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const service = new WebpageGenerationService(DUMMY_STREAM_CLIENT);

  await assert.rejects(
    () =>
      service.generateWebpage({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        prompt: 'Build an interactive color tile.',
        maxTokens: 3000
      }),
    /Increase maxTokens or simplify the prompt/i
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].max_tokens, 3000);
});
