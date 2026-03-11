## 1. Frontend Routing Split

- [x] 1.1 Add router support in the web app entrypoint and define routes for `/`, `/llm-testing`, and `/generative-ui`.
- [x] 1.2 Move the current LLM streaming console UI into the `/llm-testing` route without changing its existing behavior.
- [x] 1.3 Implement a main landing route that links users to the two experiences (`/llm-testing` and `/generative-ui`).

## 2. Webpage Generation API

- [x] 2.1 Add backend request/response types and validation for webpage generation payloads (`prompt`, optional provider/model, and `html/css/js` output contract).
- [x] 2.2 Implement an LLM service method that requests structured webpage output and normalizes provider responses into `html`, `css`, and `js`.
- [x] 2.3 Add `POST /api/llm/generate-webpage` in the server with logging, error handling, and contract validation failures.

## 3. Sandboxed Generative UI Page

- [x] 3.1 Build the `/generative-ui` page form and state flow for prompt submission, loading state, and API error display.
- [x] 3.2 Compose iframe `srcdoc` from generated `html`, `css`, and `js`, and render with a sandbox that allows scripts but isolates host state.
- [x] 3.3 Ensure each new generation replaces the previous preview cleanly and keeps the generated app interactive.

## 4. Validation and Verification

- [x] 4.1 Add backend tests for generation endpoint validation (missing prompt, malformed model output, and successful structured response).
- [x] 4.2 Add frontend tests (or route-level checks) for navigation behavior and `/generative-ui` preview rendering flow.
- [x] 4.3 Run end-to-end manual verification for direct route loads (`/`, `/llm-testing`, `/generative-ui`) and at least one interactive generated app prompt.
