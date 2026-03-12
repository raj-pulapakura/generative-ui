import assert from 'node:assert/strict';
import test from 'node:test';
import { WebpageGenerationService } from '../dist/services/webpage-generation/webpage-generation-service.js';

const DUMMY_STREAM_CLIENT = {
  async *streamText() {
    yield '';
  }
};

test('OpenAI webpage generation uses structured JSON schema format', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.OPENAI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(
      JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({
          html: '<main id="demo"></main>',
          css: '#demo { width: 120px; height: 120px; background: #0ad; }',
          js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
        })
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
    provider: 'openai',
    model: 'gpt-5.4',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(typeof webpage.css, 'string');
  assert.equal(typeof webpage.js, 'string');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].max_output_tokens, 8192);
  assert.equal(requests[0].reasoning.effort, 'medium');
  assert.equal(requests[0].text.verbosity, 'medium');
  assert.equal(requests[0].text.format.type, 'json_schema');
  assert.equal(requests[0].text.format.name, 'generated_webpage_payload');
  assert.equal(requests[0].text.format.strict, true);
  assert.deepEqual(requests[0].text.format.schema.required, ['html', 'css', 'js']);
});

test('OpenAI webpage generation uses the consistent design system prompt when requested', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.OPENAI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(
      JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({
          html: '<main id="demo"></main>',
          css: '#demo { width: 120px; height: 120px; background: #0ad; }',
          js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
        })
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
  await service.generateWebpage({
    provider: 'openai',
    model: 'gpt-5.4',
    prompt: 'Build an interactive color tile.',
    consistentDesign: true
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].input?.[0]?.role, 'system');
  assert.match(String(requests[0].input?.[0]?.content), /Space Grotesk/i);
  assert.match(String(requests[0].input?.[0]?.content), /#d76c40/i);
  assert.match(String(requests[0].input?.[0]?.content), /black hole simulator/i);
});

test('OpenAI webpage generation retries once on max_output_tokens when maxTokens is not provided', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.OPENAI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    if (requests.length === 1) {
      return new Response(
        JSON.stringify({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: []
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'completed',
        output_text: JSON.stringify({
          html: '<main id="demo"></main>',
          css: '#demo { width: 120px; height: 120px; background: #0ad; }',
          js: 'document.getElementById("demo")?.addEventListener("click", () => {});'
        })
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
    provider: 'openai',
    model: 'gpt-5.4',
    prompt: 'Build an interactive color tile.'
  });

  assert.equal(typeof webpage.html, 'string');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_output_tokens, 8192);
  assert.equal(requests[1].max_output_tokens, 16384);
  assert.match(String(requests[1].input?.[0]?.content), /Retry requirement/i);
});

test('OpenAI webpage generation returns actionable error when user maxTokens is too low', async (t) => {
  process.env.OPENAI_API_KEY = 'test-key';
  t.after(() => {
    delete process.env.OPENAI_API_KEY;
  });

  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    requests.push(body);

    return new Response(
      JSON.stringify({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: []
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
        provider: 'openai',
        model: 'gpt-5.4',
        prompt: 'Build an interactive color tile.',
        maxTokens: 2000
      }),
    /Increase maxTokens or simplify the prompt/i
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].max_output_tokens, 2000);
});
