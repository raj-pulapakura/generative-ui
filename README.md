# Generative UI Builder

This project generates interactive web apps from a prompt.

You type something like:

`"I want to calculate compound interest"`

The server calls an LLM and returns structured JSON:

- `html`
- `css`
- `js`

The web client renders that output inside a sandboxed iframe (`allow-scripts`) so users can interact with the generated app safely.

## What This App Includes

- React + Vite frontend (`web/`) with a single main route (`/`).
- Express + TypeScript backend (`server/`) with OpenAI, Anthropic, and Gemini provider support.
- Structured webpage generation endpoint: `POST /api/llm/generate-webpage`.

## Quick Start (Docker Dev)

This is the easiest way to run locally with hot reload.

1. Create server env file (if missing):
```bash
cp server/.env.example server/.env
```
2. Add your API keys in `server/.env`:
   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`.
   For Vertex AI mode with `@google/genai`, also set:
   `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`.
   (`GEMINI_API_KEY` is still accepted as a legacy fallback.)
3. Start both services:
```bash
docker compose -f docker-compose.dev.yml up --build
```
4. Open web app at `http://localhost:5173` (API server runs at `http://localhost:3001`).

## Local Run (Without Docker)

1. Install dependencies:
```bash
cd server && npm install
cd ../web && npm install
```
2. Configure env:
```bash
cp server/.env.example server/.env
```
3. Start backend:
```bash
cd server
npm run dev
```
4. In another terminal, start frontend:
```bash
cd web
npm run dev
```
5. Open `http://localhost:5173`

## Core API

### `POST /api/llm/generate-webpage`

Request body:

```json
{
  "provider": "openai",
  "model": "gpt-5.4",
  "prompt": "Build a compound interest calculator with sliders.",
  "system": "optional extra constraints",
  "temperature": 0.7,
  "maxTokens": 8192
}
```

Response body:

```json
{
  "html": "<main>...</main>",
  "css": "main { ... }",
  "js": "document.querySelector(...)"
}
```

## My experimentation notes

I have tested these models:
- Openai GPT 5.2
- Openai GPT 5.4
- Openai GPT 5.2 Pro
- Anthropic Sonnet 4.5
- Anthropic Opus 4.5

Of these models, Openai GPT 5.4 produced the highest quality apps.

Notes on the other models:
- Openai GPT 5.2: simply inferior to 5.4 from an output quality perspective.
- Openai GPT 5.2 Pro: I didn't even get to verify the output of this because it took so damn long and it timed out. Not even worth trying to look at the output because the latency is so trash (like 5 mins+). And it's so bloody expensive.
- Anthropic models: just worse than Openai from an output quality perspective.

I have not tested the Gemini models yet since I'm still working out some billing stuff.

### Latency

In this section I'm strictly talking about my experiments with Openai GPT 5.4, since it's the best overall from what I've tested.

Latency has been anywhere from 60s to 300s. Just based on looking at logs, I would estimate `P90` response time to be 90s.

The main contributing factor  to latency is, of course, the model. But since we're pinning this to Openai GPT 5.4, let's not consider this.

Specifically using Openai GPT 5.4, there are two parameters one can toggle: `reasoning` and `verbosity`.

Generally, as you increase the reasoning and/or verbosity, latency goes up.

My experience has been that setting `reasoning` and `verbosity` both to `"low"` provides *okay* results. The sweet spot I have found is setting both of these values to `"medium"`.

## App quality

There are many factors affecting app quality:

- Type of apps requested (are they simple calculators, or more complex interactive explainers?)
- The model
- The system prompt (what general guidelines is the developer feeding the model? are we giving it style guides, or code generation guides?)
- The prompt (how detailed is the prompt given by the user? they could be entering in one sentence or a whole essay)

Since in this project we want to cater for:
- Lots of different apps
- A dumb user

Our main knobs for app quality are the model and the system prompt.

I've already established that Openai GPT 5.4 is the best model for app quality.
