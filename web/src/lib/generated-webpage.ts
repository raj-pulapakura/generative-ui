export interface GeneratedWebpagePayload {
  html: string;
  css: string;
  js: string;
}

const UTF8_META = '<meta charset="UTF-8" />';
const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';

export function isGeneratedWebpagePayload(value: unknown): value is GeneratedWebpagePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.html === 'string' &&
    candidate.html.trim().length > 0 &&
    typeof candidate.css === 'string' &&
    candidate.css.trim().length > 0 &&
    typeof candidate.js === 'string' &&
    candidate.js.trim().length > 0
  );
}

export function composeGeneratedDocument(payload: GeneratedWebpagePayload): string {
  const html = payload.html.trim();
  const css = payload.css.trim();
  const js = escapeScriptCloseTag(payload.js.trim());

  return `<!doctype html>
<html lang="en">
  <head>
    ${UTF8_META}
    ${VIEWPORT_META}
    <style>
${css}
    </style>
  </head>
  <body>
${html}
    <script>
${js}
    </script>
  </body>
</html>`;
}

export function composePlaceholderDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    ${UTF8_META}
    ${VIEWPORT_META}
    <style>
      :root {
        color-scheme: light;
        font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(140deg, #f6ecdf, #efe4d3);
        color: #2f322f;
      }

      .placeholder {
        max-width: 42ch;
        border: 1px solid #cab8a2;
        border-radius: 16px;
        padding: 1rem 1.1rem;
        background: #fffbf4;
        box-shadow: 0 8px 24px rgba(37, 31, 23, 0.08);
      }
    </style>
  </head>
  <body>
    <article class="placeholder">
      Submit a prompt to generate an interactive webpage preview.
    </article>
  </body>
</html>`;
}

export function assertPreviewDocument(payload: GeneratedWebpagePayload, document: string): void {
  const htmlSnippet = payload.html.trim().slice(0, 12);
  const cssSnippet = payload.css.trim().slice(0, 12);
  const jsSnippet = payload.js.trim().slice(0, 12);

  if (!document.startsWith('<!doctype html>')) {
    throw new Error('Generated preview document must start with <!doctype html>.');
  }

  if (!document.includes('<style>') || !document.includes('</style>')) {
    throw new Error('Generated preview document must include a style block.');
  }

  if (!document.includes('<script>') || !document.includes('</script>')) {
    throw new Error('Generated preview document must include a script block.');
  }

  if (htmlSnippet.length > 0 && !document.includes(htmlSnippet)) {
    throw new Error('Generated preview document is missing HTML content.');
  }

  if (cssSnippet.length > 0 && !document.includes(cssSnippet)) {
    throw new Error('Generated preview document is missing CSS content.');
  }

  if (jsSnippet.length > 0 && !document.includes(jsSnippet)) {
    throw new Error('Generated preview document is missing JS content.');
  }
}

function escapeScriptCloseTag(scriptText: string): string {
  return scriptText.replace(/<\/script/gi, '<\\/script');
}
