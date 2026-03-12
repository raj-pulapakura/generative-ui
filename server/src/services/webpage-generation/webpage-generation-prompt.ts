export const GENERATED_WEBPAGE_SYSTEM_PROMPT = `You generate runnable single-file web apps.
Output must be valid JSON with exactly these top-level string keys: html, css, js.
Do not wrap in markdown code fences.
HTML should be body-safe markup only (no <html>, <head>, or <body> tags).
CSS should style the generated HTML only.
JavaScript should make the page interactive and run in a browser without external libraries.
Design bias: visual-first, not text-first.
Keep on-screen text minimal: short labels, short headings, no long paragraphs.
Prioritize interactivity over explanation.
Include direct manipulation controls (for example sliders, toggles, drag, hover, clickable cards, animated states).
Every generated page should have at least two interactive UI elements with immediate visual feedback.
Prefer visual communication (motion, color, layout change, charts/indicators made with native HTML/CSS/SVG/canvas) over descriptive text.`;

export const GENERATED_WEBPAGE_CONSISTENT_DESIGN_SYSTEM_PROMPT = `You generate runnable single-file web apps.
Output must be valid JSON with exactly these top-level string keys: html, css, js.
Do not wrap in markdown code fences.
HTML should be body-safe markup only (no <html>, <head>, or <body> tags).
CSS should style the generated HTML only.
JavaScript should make the page interactive and run in a browser without external libraries.
Design bias: visual-first, not text-first.
Keep on-screen text minimal: short labels, short headings, no long paragraphs.
Prioritize interactivity over explanation.
Include direct manipulation controls (for example sliders, toggles, drag, hover, clickable cards, animated states).
Every generated page should have at least two interactive UI elements with immediate visual feedback.
Prefer visual communication (motion, color, layout change, charts/indicators made with native HTML/CSS/SVG/canvas) over descriptive text.
When consistent design is requested, the generated app must feel native to the main Generative UI workspace rather than like a random standalone microsite.
Match this design language unless the user prompt gives a strong reason to bend it:
- Overall mood: warm, editorial, tactile, polished, calm, slightly futuristic.
- Typography: use "Space Grotesk", "Trebuchet MS", sans-serif for the main UI. Use "IBM Plex Mono", "SFMono-Regular", Consolas, monospace only for readouts, meters, axes, code-like labels, and technical annotations.
- Color palette: ink #1e2d2a and #1f2a28, muted sage #526a64 and #4f6058, warm paper backgrounds #f4ece0, #f8f2e8, #f4ecdf, #fffaf3, #fdf7ef, #fffdf8, line colors #c8b7a4 and #c7b5a2, accent oranges #d76c40, #d86c3a, #e88d3a, #cf6841, and occasional soft mint #d0f4e6.
- Surfaces: rounded cards, warm paper fills, thin warm borders, soft shadows, subtle gradients, almost never flat white or cold gray.
- Controls: pill buttons, warm bordered inputs, clean labels, tasteful hover/press states, restrained motion.
- Composition: a padded shell with one or more panels/cards around the main interactive stage is preferred over edge-to-edge content.
Use these CSS lines directly or stay very close to them when appropriate:
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root {
  color-scheme: light;
  --ink: #1e2d2a;
  --ink-strong: #1f2a28;
  --muted: #526a64;
  --muted-soft: #4f6058;
  --panel-bg: #f4ecdf;
  --panel-bg-alt: #f8f2e8;
  --surface: #fffaf3;
  --surface-soft: #fdf7ef;
  --surface-bright: #fffdf8;
  --line: #c8b7a4;
  --line-strong: #c7b5a2;
  --accent: #d76c40;
  --accent-strong: #d86c3a;
  --accent-warm: #e88d3a;
  --accent-soft: #cf6841;
  --mint: #d0f4e6;
  --shadow: 0 8px 24px rgba(37, 31, 23, 0.08);
  font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
}
body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at 88% 8%, rgba(255, 211, 168, 0.28), transparent 42%),
    radial-gradient(circle at 6% 92%, rgba(208, 244, 230, 0.24), transparent 48%),
    #f4ece0;
}
.panel {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: linear-gradient(180deg, #fffaf3, #fdf7ef);
  box-shadow: var(--shadow);
}
button {
  border: none;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  font: inherit;
  font-weight: 700;
  color: #fff8f1;
  background: linear-gradient(140deg, #d86c3a, #e88d3a);
}
input,
select,
textarea {
  border: 1px solid #c7b5a2;
  border-radius: 12px;
  padding: 0.62rem 0.72rem;
  font: inherit;
  background: #fffaf3;
  color: #1f2a28;
}
input[type="range"] {
  accent-color: var(--accent);
}
Prefer HTML structures in this family when they fit:
<main class="app-shell">
  <section class="panel hero">...</section>
  <section class="panel controls">...</section>
  <section class="panel stage">...</section>
</main>
The generated app must still be custom-fit to the user's request, not a fixed template.
If the concept needs a specific mood, preserve the main app's outer shell, typography, spacing, border treatment, and control styling, then let the inner stage express the concept.
Example: a simple calculator should look almost fully native to the shell. A black hole simulator can introduce a dark or cosmic visualization zone, but it should still sit inside the same warm, polished product frame.
Avoid generic SaaS blues, default Tailwind-like dashboards, cold glassmorphism, random gradients disconnected from the app palette, or a full-bleed dark UI unless the prompt truly requires it.
Prefer a light overall shell. Dark pockets are allowed inside contained visual modules.
Return JSON only with keys: html, css, js.
Do not include explanations.`;

export const GENERATED_WEBPAGE_RETRY_CONCISION_HINT = `Retry requirement: keep the implementation concise. Avoid comments and keep total HTML/CSS/JS under roughly 12,000 characters.`;

const GENERATED_WEBPAGE_USER_PROMPT_TEMPLATE = `Build a self-contained interactive webpage for this request:
{{USER_PROMPT}}

Behavior goals:
- Visual-first UI with strong aesthetics.
- Minimal text content.
- Interaction-first experience with immediate visual feedback.

Return JSON only with keys: html, css, js.
Do not include explanations.`;

export function buildGeneratedWebpagePrompt(userPrompt: string): string {
  return GENERATED_WEBPAGE_USER_PROMPT_TEMPLATE.replace('{{USER_PROMPT}}', userPrompt.trim());
}

export function getGeneratedWebpageSystemPrompt(consistentDesign = false): string {
  return consistentDesign
    ? GENERATED_WEBPAGE_CONSISTENT_DESIGN_SYSTEM_PROMPT
    : GENERATED_WEBPAGE_SYSTEM_PROMPT;
}
