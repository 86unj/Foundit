/** Used when CORS_ORIGIN is unset or contains no usable entries (local dev). */
export const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:3000';

/**
 * Parses the CORS_ORIGIN environment variable into the origin allowlist handed
 * to the `cors` middleware.
 *
 * Production is reachable on more than one host (the frontend subdomain, and
 * potentially the apex / `www.` host), and a single-origin allowlist makes
 * every API call from the other hosts fail CORS — which looks like a totally
 * broken site, with nothing in the backend logs. So the variable is treated as
 * a comma-separated list. A single value still works exactly as before.
 *
 * Entries are trimmed and empty ones dropped, so `"a, ,b,"` is just `[a, b]`.
 * A trailing slash is stripped because browsers send the `Origin` header
 * without one and the `cors` middleware compares origins as exact strings —
 * `https://example.com/` would otherwise silently never match.
 *
 * The result is always a finite allowlist: unknown origins stay rejected, this
 * never reflects an arbitrary request origin back.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);

  return origins.length > 0 ? origins : [DEFAULT_ALLOWED_ORIGIN];
}
