## Why

The current app is a single LLM streaming console and does not provide the requested "generate a runnable webpage from a prompt" workflow. We need a dedicated, safer experience that can execute AI-generated HTML/CSS/JS while isolating it from the host app.

## What Changes

- Add top-level client routing and make the current UI available at `/llm-testing`.
- Add a new `/generative-ui` route where users submit a prompt (for example, "I want to calculate compound interest") to generate webpage code.
- Add a backend API endpoint that asks the selected LLM for structured webpage output (`html`, `css`, `js`) and returns it as JSON.
- Render generated output in a sandboxed iframe (`srcdoc`) so generated CSS/JS cannot directly affect the parent application.
- Add request/response validation, generation error handling, and generation constraints (format and payload size) for reliability and safety.

## Capabilities

### New Capabilities
- `ai-generated-webpage-rendering`: Generate interactive webpage code from a user prompt and render it in a sandboxed iframe preview.
- `llm-tool-route-splitting`: Route users between `/generative-ui` and `/llm-testing`, with the main page acting as navigation.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `web/src/main.tsx` and route/page components for navigation and route split.
  - `web/src/App.tsx` (or extracted replacement) for moving existing LLM console to `/llm-testing`.
  - `server/src/index.ts` and `server/src/llm-service.ts` for a new webpage-generation API flow.
- APIs:
  - New endpoint for generated webpage responses (JSON code payload).
  - Existing streaming endpoint remains intact.
- Dependencies:
  - Likely add `react-router-dom` for frontend routing (if not already present).
- Security/runtime systems:
  - Browser iframe sandboxing and guarded prompt/response parsing for untrusted generated code.
