import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProvider } from '../testUtils';
import VerifyEmailPage from '@/app/verify-email/page';
import { verifyEmail } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/lib/api/auth', () => ({ verifyEmail: vi.fn() }));
vi.mock('@/components/Navbar', () => ({ default: () => null }));
vi.mock('@/components/Footer', () => ({ default: () => null }));
vi.mock('@/components/PageBackground', () => ({
  FixedPageBackground: () => null,
}));

beforeEach(() => {
  vi.mocked(verifyEmail).mockReset();
  vi.mocked(verifyEmail).mockResolvedValue({ message: 'Verified' });
});

afterEach(() => window.history.replaceState(null, '', '/'));

describe('email verification page', () => {
  it.each([
    ['/verify-email#token=fragment%2Btoken', 'fragment+token'],
    ['/verify-email?token=legacy%2Btoken', 'legacy+token'],
    ['/verify-email?token=legacy#token=fragment', 'fragment'],
    ['/verify-email?token=legacy#section', 'legacy'],
  ])('verifies %s', async (url, token) => {
    window.history.replaceState(null, '', url);
    renderWithProvider(<VerifyEmailPage />);

    await waitFor(() => expect(verifyEmail).toHaveBeenCalledWith(token));
    expect(
      await screen.findByRole('heading', { name: 'Welcome' })
    ).toBeTruthy();
  });

  it.each(['/verify-email', '/verify-email#token=%20'])(
    'rejects a missing token at %s',
    async (url) => {
      window.history.replaceState(null, '', url);
      renderWithProvider(<VerifyEmailPage />);

      expect(
        await screen.findByText(/This verification link is missing a token/)
      ).toBeTruthy();
      expect(verifyEmail).not.toHaveBeenCalled();
    }
  );

  it('shows API verification errors', async () => {
    window.history.replaceState(null, '', '/verify-email#token=expired');
    vi.mocked(verifyEmail).mockRejectedValueOnce(
      new ApiError(400, 'Verification token has expired.', 'TOKEN_EXPIRED')
    );
    renderWithProvider(<VerifyEmailPage />);

    expect(
      await screen.findByText('Verification token has expired.')
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Verification failed' })
    ).toBeTruthy();
  });
});
