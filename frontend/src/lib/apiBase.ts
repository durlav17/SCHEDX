/**
 * Where the browser sends API requests.
 *
 * VITE_API_BASE_URL is empty or absent (local development, or a backend serving this build itself): requests use the
 * relative path `/api/...`, which the Vite dev server proxies to localhost:8000.
 * VITE_API_BASE_URL=https://YOUR-BACKEND.onrender.com (Netlify build): requests go to that origin's `/api/...`.
 * `/api` is appended exactly once, whether or not the variable already ends with a slash or with `/api`.
 * The value is compiled into the public bundle: never put a secret in it.
 */
export function normalizeApiBase(raw: string | undefined | null): string {
  let base = (raw ?? "").trim();
  while (base.endsWith("/")) base = base.slice(0, -1);
  if (base.toLowerCase().endsWith("/api")) base = base.slice(0, -4);
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

/** Full URL of an API path such as `/health` (a missing leading slash is tolerated). */
export function apiUrl(path: string, rawBase: string | undefined | null = import.meta.env.VITE_API_BASE_URL): string {
  return `${normalizeApiBase(rawBase)}/api${path.startsWith("/") ? path : `/${path}`}`;
}
