import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const SERVER_CWD = new URL('../', import.meta.url);

test('POST /api/llm/generate-webpage rejects missing prompt', async (t) => {
  const server = await startServer({
    LLM_GENERATE_WEBPAGE_MOCK_RESPONSE: JSON.stringify({
      html: '<main>ok</main>',
      css: 'main { color: #111; }',
      js: 'console.log("ok");'
    })
  });
  t.after(() => server.stop());

  const response = await fetch(`${server.baseUrl}/api/llm/generate-webpage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /prompt/i);
});

test('POST /api/llm/generate-webpage rejects malformed model output', async (t) => {
  const server = await startServer({
    LLM_GENERATE_WEBPAGE_MOCK_RESPONSE: '{"html":"<main>bad</main>","css":"","js":"console.log(1);"}'
  });
  t.after(() => server.stop());

  const response = await fetch(`${server.baseUrl}/api/llm/generate-webpage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Build a click counter.' })
  });

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.match(body.error, /non-empty string/i);
});

test('POST /api/llm/generate-webpage returns html/css/js on success', async (t) => {
  const server = await startServer({
    LLM_GENERATE_WEBPAGE_MOCK_RESPONSE: JSON.stringify({
      html: '<main><h1 id="title">Compound Interest</h1><button id="go">Run</button></main>',
      css: 'body { font-family: sans-serif; } #title { color: #274; }',
      js: 'document.getElementById("go")?.addEventListener("click", () => alert("ok"));'
    })
  });
  t.after(() => server.stop());

  const response = await fetch(`${server.baseUrl}/api/llm/generate-webpage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Build a compound interest calculator.' })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.html, 'string');
  assert.equal(typeof body.css, 'string');
  assert.equal(typeof body.js, 'string');
  assert.ok(body.html.length > 0);
  assert.ok(body.css.length > 0);
  assert.ok(body.js.length > 0);
});

async function startServer(extraEnv = {}) {
  const port = await findOpenPort();
  const child = spawn('node', ['dist/index.js'], {
    cwd: SERVER_CWD,
    env: {
      ...process.env,
      PORT: String(port),
      LLM_PROVIDER: 'openai',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForServer(`http://127.0.0.1:${port}`);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(2000)]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }
  };
}

async function waitForServer(baseUrl) {
  const timeoutMs = 5000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/llm/providers`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await delay(80);
  }

  throw new Error(`Server did not start within ${timeoutMs}ms.`);
}

async function findOpenPort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate ephemeral port.'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}
