import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  signOut,
} from '@/utils/auth';
import { debugError, debugLog, debugTimer, debugWarn } from '@/utils/debug';

/** Backend base URL. Import this instead of reading the env var directly. */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * Error thrown by apiFetch (and authFetch session failures).
 * `status` is the HTTP status; 0 means the request never reached the server
 * (missing configuration or network failure) and `code` says which.
 * `message` is user-facing — keep configuration details out of it.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      debugWarn('auth', 'token refresh skipped — no refresh token in storage');
      return null;
    }

    try {
      debugLog('auth', 'access token expired — refreshing');
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        debugWarn('auth', `token refresh failed (${res.status})`);
        return null;
      }

      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };

      setTokens(data.accessToken, data.refreshToken);
      debugLog('auth', 'token refresh succeeded');
      return data.accessToken;
    } catch (err) {
      debugError('auth', 'token refresh threw', err);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function parseErrorBody(
  res: Response
): Promise<{ code?: string; message?: string }> {
  try {
    return (await res.json()) as { code?: string; message?: string };
  } catch {
    return {};
  }
}

export async function authFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const method = init.method ?? 'GET';
  const token = getAccessToken();
  if (!token) {
    debugWarn('api', `${method} ${url} aborted — not authenticated`);
    throw new ApiError(401, 'Not authenticated', 'NOT_AUTHENTICATED');
  }

  const withAuth = (accessToken: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

  const done = debugTimer('api', `${method} ${url}`);
  let res = await withAuth(token);

  if (res.status === 401) {
    const body = await parseErrorBody(res.clone());

    if (body.code === 'TOKEN_EXPIRED') {
      if (!getRefreshToken()) {
        done('401 TOKEN_EXPIRED, no refresh token — signing out');
        signOut();
        throw new ApiError(
          401,
          'Session expired. Please log in again.',
          'SESSION_EXPIRED'
        );
      }

      const newToken = await refreshAccessToken();
      if (newToken) {
        debugLog('api', `retrying ${method} ${url} with refreshed token`);
        res = await withAuth(newToken);
      } else {
        done('401 TOKEN_EXPIRED, refresh failed — signing out');
        signOut();
        throw new ApiError(
          401,
          'Session expired. Please log in again.',
          'SESSION_EXPIRED'
        );
      }
    }
  }

  done(`${res.status}${res.ok ? '' : ' ' + res.statusText}`);
  if (!res.ok) {
    // Clone so callers can still consume the body themselves.
    debugWarn(
      'api',
      `${method} ${url} failed`,
      await parseErrorBody(res.clone())
    );
  }

  return res;
}

export async function parseApiError(res: Response): Promise<string> {
  const body = await parseErrorBody(res);
  return body.message ?? `Request failed (${res.status})`;
}

export interface ApiFetchInit extends RequestInit {
  /** Attach the access token (with refresh-and-retry). Default true. */
  auth?: boolean;
}

/**
 * JSON request against the backend. Resolves with the parsed body on 2xx and
 * throws ApiError otherwise, so callers handle one error shape:
 *
 *   try {
 *     const claim = await apiFetch<Claim>('/api/claims', {
 *       method: 'POST',
 *       body: JSON.stringify(input),
 *     });
 *   } catch (err) {
 *     if (err instanceof ApiError) show(err.status, err.message);
 *   }
 */
export async function apiFetch<T>(
  path: string,
  init: ApiFetchInit = {}
): Promise<T> {
  if (!API_BASE) {
    // Config detail stays in the dev console — users get a plain message.
    debugError(
      'api',
      `${init.method ?? 'GET'} ${path} aborted — NEXT_PUBLIC_API_URL is empty. Set it in foundit-ui/.env.local.`
    );
    throw new ApiError(
      0,
      'Service is temporarily unavailable. Please try again later or contact support.',
      'API_NOT_CONFIGURED'
    );
  }

  const { auth = true, headers, ...rest } = init;
  const url = `${API_BASE}${path}`;
  const withJson = {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers },
  };

  let res: Response;
  try {
    res = auth ? await authFetch(url, withJson) : await fetch(url, withJson);
  } catch (err) {
    if (err instanceof ApiError) throw err; // session errors from authFetch
    debugError('api', `${rest.method ?? 'GET'} ${url} network failure`, err);
    throw new ApiError(0, 'Unable to connect to server.');
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiError(
      res.status,
      body.message ?? `Request failed (${res.status})`,
      body.code
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
