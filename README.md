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
2. Add your API keys in `server/.env`: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`.
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

## Useful Commands

- `docker compose -f docker-compose.dev.yml up --build`
- `docker compose -f docker-compose.dev.yml down`
- `cd server && npm test`
- `cd server && npm run build`
- `cd web && npm run build`

## Notes

- The frontend now points directly to the Generative UI Builder on `/`.
- For low-latency synchronous generation, use non-pro models (for example `gpt-5.4`).
