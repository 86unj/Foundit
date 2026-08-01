import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, authFetch } from '@/lib/api/client';
import { getAccessToken, setTokens } from '@/utils/auth';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('apiFetch', () => {
  it('resolves with the parsed JSON body on success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([{ campusId: 'c1' }]));

    const data = await apiFetch<{ campusId: string }[]>('/api/campuses', {
      auth: false,
    });

    expect(data).toEqual([{ campusId: 'c1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/campuses',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('throws ApiError with status, code and backend message on failure', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'NO_CAMPUS', message: 'Campus required.' }, 409)
    );

    const err = await apiFetch('/api/claims', {
      method: 'POST',
      auth: false,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).code).toBe('NO_CAMPUS');
    expect((err as ApiError).message).toBe('Campus required.');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));

    const err = await apiFetch('/api/items', { auth: false }).catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('Request failed (500)');
  });

  it('wraps network failures in ApiError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const err = await apiFetch('/api/campuses', { auth: false }).catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe('Unable to connect to server.');
  });

  it('reports missing API configuration without leaking env or file details', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.resetModules();
    const client = await import('@/lib/api/client');

    const err = await client
      .apiFetch('/api/campuses', { auth: false })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(client.ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).code).toBe('API_NOT_CONFIGURED');
    expect((err as ApiError).message).toBe(
      'Service is temporarily unavailable. Please try again later or contact support.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('authFetch', () => {
  it('throws ApiError(401) when no access token is stored', async () => {
    const err = await authFetch('http://api.test/api/items').catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).code).toBe('NOT_AUTHENTICATED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches the stored access token as a bearer header', async () => {
    setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await authFetch('http://api.test/api/items');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/items',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-1',
        }),
      })
    );
  });

  it('refreshes an expired token and retries the request once', async () => {
    setTokens('stale-access', 'refresh-1');
    fetchMock
      // Original request: expired token.
      .mockResolvedValueOnce(jsonResponse({ code: 'TOKEN_EXPIRED' }, 401))
      // Refresh call succeeds.
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh' })
      )
      // Retried request succeeds.
      .mockResolvedValueOnce(jsonResponse({ itemId: 'i1' }));

    const res = await authFetch('http://api.test/api/items/i1');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/api/auth/refresh',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/api/items/i1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer new-access',
        }),
      })
    );
    expect(getAccessToken()).toBe('new-access');
  });

  it('passes non-expiry 401s through to the caller', async () => {
    setTokens('access-1', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'FORBIDDEN', message: 'Nope' }, 401)
    );

    const res = await authFetch('http://api.test/api/items');

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
