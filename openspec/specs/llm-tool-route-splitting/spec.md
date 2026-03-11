# llm-tool-route-splitting Specification

## Purpose
TBD - created by archiving change add-sandboxed-generative-ui-route. Update Purpose after archive.
## Requirements
### Requirement: Main Route Navigation
The frontend SHALL provide a main route that presents navigation options to both `/generative-ui` and `/llm-testing`.

#### Scenario: User chooses generative UI experience
- **WHEN** a user visits the main page and selects the generative UI option
- **THEN** the application navigates to `/generative-ui`

#### Scenario: User chooses LLM testing experience
- **WHEN** a user visits the main page and selects the LLM testing option
- **THEN** the application navigates to `/llm-testing`

### Requirement: Existing Console Re-Homed to `/llm-testing`
The existing LLM testing interface SHALL be available at `/llm-testing` with equivalent functional behavior to the pre-routing implementation.

#### Scenario: Direct route load of LLM testing page
- **WHEN** a user opens `/llm-testing` directly
- **THEN** the page renders the existing prompt controls and stream output workflow

### Requirement: Dedicated Generative UI Route
The frontend SHALL expose `/generative-ui` as a dedicated page for prompt-driven webpage generation and preview.

#### Scenario: Direct route load of generative page
- **WHEN** a user opens `/generative-ui` directly
- **THEN** the page renders the prompt input and preview area for generated apps

