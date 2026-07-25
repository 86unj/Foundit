import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileForm } from '@/hooks/useProfileForm';
import { updateProfilePhoto } from '@/lib/api/users';
import { getAccessToken } from '@/utils/auth';
import handleImageUpload from '@/utils/handleImageUpload';
import type { UserProfile } from '@/types/users';
import { clearProfilePhoto } from '@/utils/profilePhotoStore';

vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>();
  return { ...actual, getAccessToken: vi.fn(), getLoggedInUser: vi.fn() };
});

vi.mock('@/utils/handleImageUpload', () => ({ default: vi.fn() }));
vi.mock('@/lib/api/users', () => ({ updateProfilePhoto: vi.fn() }));

const getAccessTokenMock = vi.mocked(getAccessToken);
const handleImageUploadMock = vi.mocked(handleImageUpload);
const updateProfilePhotoMock = vi.mocked(updateProfilePhoto);

const AVATAR_KEY = 'avatars/2f6c1b90-1f7c-4a1f-9a6e-6f0f2d1c9b11.webp';
const RESOLVED_URL = `https://cdn.test.local/${AVATAR_KEY}`;

const profileResponse: UserProfile = {
  firstName: 'Casey',
  lastName: 'Hsu',
  email: 'casey@myseneca.ca',
  studentNumber: 123456789,
  profilePhotoUrl: null,
  emailNotificationOptIn: true,
};

function mockProfileFetch(overrides: Partial<typeof profileResponse> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...profileResponse, ...overrides }),
    })
  );
}

/** Renders the hook and waits for the mount-time profile fetch to settle. */
async function renderLoadedForm() {
  const view = renderHook(() => useProfileForm());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The photo lives in a module-level store shared with the navbar; without
  // this, one test's photo would satisfy the next test's assertion.
  clearProfilePhoto();
  getAccessTokenMock.mockReturnValue('test-access-token');
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  mockProfileFetch();
});

describe('useProfileForm photo handling', () => {
  it('seeds the photo from the profile fetch', async () => {
    mockProfileFetch({ profilePhotoUrl: RESOLVED_URL });

    const { result } = await renderLoadedForm();

    expect(result.current.photoUrl).toBe(RESOLVED_URL);
  });

  it('uploads under the avatar purpose and persists the returned key', async () => {
    handleImageUploadMock.mockResolvedValueOnce({
      imageUrl: AVATAR_KEY,
      fileType: 'webp',
      fileSizeKb: 120,
    });
    updateProfilePhotoMock.mockResolvedValueOnce({
      ...profileResponse,
      profilePhotoUrl: RESOLVED_URL,
    });

    const { result } = await renderLoadedForm();
    const file = new File(['x'], 'me.webp', { type: 'image/webp' });

    await act(() => result.current.handlePhotoSelected(file));

    expect(handleImageUploadMock).toHaveBeenCalledWith(
      file,
      'test-access-token',
      { purpose: 'avatar' }
    );
    expect(updateProfilePhotoMock).toHaveBeenCalledWith(AVATAR_KEY);
    expect(result.current.photoUrl).toBe(RESOLVED_URL);
    expect(result.current.photoError).toBe('');
    expect(result.current.photoStatus).toBe('idle');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('restores the previous photo when the upload fails', async () => {
    mockProfileFetch({ profilePhotoUrl: RESOLVED_URL });
    handleImageUploadMock.mockRejectedValueOnce(new Error('R2 unavailable'));

    const { result } = await renderLoadedForm();

    await act(() =>
      result.current.handlePhotoSelected(
        new File(['x'], 'me.webp', { type: 'image/webp' })
      )
    );

    expect(updateProfilePhotoMock).not.toHaveBeenCalled();
    expect(result.current.photoUrl).toBe(RESOLVED_URL);
    expect(result.current.photoError).toBe('R2 unavailable');
    expect(result.current.photoStatus).toBe('idle');
  });

  it('restores the previous photo when persisting fails', async () => {
    mockProfileFetch({ profilePhotoUrl: RESOLVED_URL });
    handleImageUploadMock.mockResolvedValueOnce({
      imageUrl: AVATAR_KEY,
      fileType: 'webp',
      fileSizeKb: 120,
    });
    updateProfilePhotoMock.mockRejectedValueOnce(new Error('Save rejected'));

    const { result } = await renderLoadedForm();

    await act(() =>
      result.current.handlePhotoSelected(
        new File(['x'], 'me.webp', { type: 'image/webp' })
      )
    );

    expect(result.current.photoUrl).toBe(RESOLVED_URL);
    expect(result.current.photoError).toBe('Save rejected');
  });

  it('clears the photo on remove', async () => {
    mockProfileFetch({ profilePhotoUrl: RESOLVED_URL });
    updateProfilePhotoMock.mockResolvedValueOnce(profileResponse);

    const { result } = await renderLoadedForm();

    await act(() => result.current.handlePhotoRemove());

    expect(updateProfilePhotoMock).toHaveBeenCalledWith(null);
    expect(result.current.photoUrl).toBeNull();
  });

  it('keeps the photo when remove fails', async () => {
    mockProfileFetch({ profilePhotoUrl: RESOLVED_URL });
    updateProfilePhotoMock.mockRejectedValueOnce(new Error('Network down'));

    const { result } = await renderLoadedForm();

    await act(() => result.current.handlePhotoRemove());

    expect(result.current.photoUrl).toBe(RESOLVED_URL);
    expect(result.current.photoError).toBe('Network down');
  });
});
