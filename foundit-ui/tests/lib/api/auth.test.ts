import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('verifyEmail', () => {
  it('POSTs a JSON token without putting it in the URL or requiring authentication', async () => {
    const { verifyEmail } = await import('@/lib/api/auth');
    const response = { message: 'Email verified successfully.' };
    fetchMock.mockResolvedValueOnce(Response.json(response));

    await expect(verifyEmail('private+token/&=?')).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://api.test/api/auth/verify-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'private+token/&=?' }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('deduplicates concurrent requests and reuses successful verification', async () => {
    const { verifyEmail } = await import('@/lib/api/auth');
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'Verified' }));

    const first = verifyEmail('same-token');
    expect(verifyEmail('same-token')).toBe(first);
    await first;
    await verifyEmail('same-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows retry after a failed request', async () => {
    const { verifyEmail } = await import('@/lib/api/auth');
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ message: 'Try again' }, { status: 500 })
      )
      .mockResolvedValueOnce(Response.json({ message: 'Verified' }));

    await expect(verifyEmail('retry-token')).rejects.toThrow('Try again');
    await expect(verifyEmail('retry-token')).resolves.toEqual({
      message: 'Verified',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
