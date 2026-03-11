export const APP_ROUTE_PATHS = ['/', '/llm-testing', '/generative-ui'] as const;

export type AppRoutePath = (typeof APP_ROUTE_PATHS)[number];

export function normalizeRoutePath(pathname: string): AppRoutePath | null {
  const trimmed = pathname.trim();
  if (trimmed === '/') {
    return '/';
  }

  const normalized = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  if ((APP_ROUTE_PATHS as readonly string[]).includes(normalized)) {
    return normalized as AppRoutePath;
  }

  return null;
}
