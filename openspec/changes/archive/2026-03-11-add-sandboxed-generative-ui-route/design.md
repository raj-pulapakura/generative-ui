## Context

The current frontend is a single-page LLM streaming console mounted at the root, and the backend exposes `POST /api/llm/stream` plus provider metadata. The new requirement adds a second, distinct experience: users describe an app and receive runnable HTML/CSS/JS that must be rendered interactively and safely. The project already includes guidance recommending sandboxed iframes for generated content.

## Goals / Non-Goals

**Goals:**
- Split the frontend into explicit routes so `/llm-testing` preserves current behavior and `/generative-ui` hosts the new generator workflow.
- Add a generation API that returns a structured webpage payload (`html`, `css`, `js`) produced by an LLM from a user prompt.
- Render generated content in a sandboxed iframe using `srcdoc` with interactivity enabled.
- Keep generation failures bounded and actionable through validation and explicit API errors.

**Non-Goals:**
- Building a full app-hosting platform (publishing, version history, sharing links).
- Supporting multi-file frameworks/bundlers inside generated output.
- Allowing generated code to directly access parent-window state, cookies, or app DOM.
- Replacing or redesigning the existing `/api/llm/stream` experience.

## Decisions

1. **Use `react-router-dom` with three routes (`/`, `/llm-testing`, `/generative-ui`).**
Rationale: cleanly separates user journeys and satisfies the requirement that the main page is a router/navigation entry.
Alternatives considered:
- Manual in-component view toggles: simpler short term, but no URL-level deep links and poorer UX.
- Hash-based routing: unnecessary when Vite/browser routing is already suitable.

2. **Create a dedicated backend endpoint for webpage generation (`POST /api/llm/generate-webpage`).**
Rationale: generation has different request/response semantics than token streaming and needs strict structured output handling.
Alternatives considered:
- Reusing `/api/llm/stream`: would force client-side parsing of partially emitted JSON and complicate validation.

3. **Enforce a strict output contract from the LLM.**
Decision: backend will instruct the model to return JSON with required keys (`html`, `css`, `js`) and parse/validate before responding.
Rationale: deterministic client rendering and simpler error handling.
Alternatives considered:
- Returning free-form markdown/code fences and parsing heuristically: fragile and high failure rate.

4. **Render via sandboxed iframe using `srcdoc` and `sandbox=\"allow-scripts\"`.**
Rationale: keeps generated CSS/JS isolated from the host app while preserving interactivity.
Alternatives considered:
- Direct DOM injection: rejected due to style bleed and high script/XSS risk.
- `allow-same-origin` sandbox permission: rejected to avoid increasing parent-surface access.

5. **Apply defensive content assembly before `srcdoc` render.**
Decision: build full document shell server/client side with viewport/meta defaults and place generated pieces into `<style>`, body HTML, and inline `<script>`.
Rationale: predictable execution context for interactive generated apps.
Alternatives considered:
- Accepting a full document only: reduces flexibility and increases malformed document risk.

## Risks / Trade-offs

- [Model returns malformed JSON or missing keys] → Validate shape on server; return 422 with clear error details and no partial payload.
- [Generated JS hangs UI inside iframe] → Keep preview isolated in iframe, provide regenerate/reset action, and recreate iframe document per run.
- [Prompt-injection style attempts in generated code] → Use restrictive sandbox (`allow-scripts` only) and avoid exposing parent secrets/tokens to iframe content.
- [Large generated payloads degrade performance] → Enforce max prompt length and response size caps; reject oversized payloads with explicit errors.
- [Routing changes break direct navigation in dev/prod] → Configure SPA fallback for frontend container/server routing and test deep-link loads for both routes.

## Migration Plan

1. Introduce route components and move existing console into `/llm-testing` while keeping behavior unchanged.
2. Add `/generative-ui` UI shell with prompt form, generation trigger, loading/error states, and iframe preview.
3. Implement `POST /api/llm/generate-webpage` backend route and LLM service method for structured webpage generation.
4. Add contract validation and iframe document assembly utilities.
5. Verify end-to-end flow locally with representative prompts (calculator, quiz, chart-like interactions).
6. Deploy with rollback path: if needed, disable new route link and endpoint while keeping existing `/llm-testing` route fully operational.

## Open Questions

- Should generated pages be allowed to load external scripts/styles (for example CDN charts), or should first version restrict to self-contained code only?
- Should provider/model controls on `/generative-ui` mirror `/llm-testing`, or default to one provider for simpler UX initially?
- Do we need server-side moderation/filtering for unsafe prompts before generation in this iteration?
