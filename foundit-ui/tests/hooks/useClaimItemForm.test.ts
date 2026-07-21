import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from '@/lib/api/client';
import { useClaimItemForm } from '@/hooks/useClaimItemForm';
import { getAccessToken } from '@/utils/auth';
import handleImageUpload from '@/utils/handleImageUpload';

const pushMock = vi.fn();
const backMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>();
  return { ...actual, getAccessToken: vi.fn() };
});

vi.mock('@/utils/handleImageUpload', () => ({ default: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);
const getAccessTokenMock = vi.mocked(getAccessToken);
const handleImageUploadMock = vi.mocked(handleImageUpload);

beforeEach(() => {
  vi.clearAllMocks();
  getAccessTokenMock.mockReturnValue('test-access-token');
});

describe('useClaimItemForm', () => {
  it('flags missing required fields and skips the request', async () => {
    const { result } = renderHook(() => useClaimItemForm());

    await act(() => result.current.handleSubmit());

    expect(result.current.errors.category).toBe('Category is a required field');
    expect(result.current.errors.itemName).toBe(
      'Item Name is a required field'
    );
    expect(result.current.errors.description).toBe(
      'Description is a required field'
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('rejects an item name longer than the backend Item.title cap (100)', async () => {
    const { result } = renderHook(() => useClaimItemForm());

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('x'.repeat(101));
      result.current.setDescription('Black backpack');
    });
    await act(() => result.current.handleSubmit());

    expect(result.current.errors.itemName).toBe(
      'Item Name must be 100 characters or fewer'
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('submits trimmed values and navigates to the confirmation screen', async () => {
    apiFetchMock.mockResolvedValueOnce({ claimId: 'claim-1' });
    const { result } = renderHook(() => useClaimItemForm());

    act(() => {
      result.current.setCategory('  Electronics  ');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('  Black backpack  ');
    });
    await act(() => result.current.handleSubmit());

    expect(apiFetchMock).toHaveBeenCalledWith('/api/claims', {
      method: 'POST',
      body: JSON.stringify({
        category: 'Electronics',
        itemName: 'MacBook Pro',
        description: 'Black backpack',
        images: [],
      }),
    });
    expect(pushMock).toHaveBeenCalledWith('/student/claim-item/submitted');
    // Stays true through the route transition to block duplicate submits.
    expect(result.current.isSubmitting).toBe(true);
  });

  it('uploads staged images to R2 and includes them in the claim payload', async () => {
    handleImageUploadMock.mockResolvedValueOnce({
      imageUrl: 'reports/abc.jpg',
      fileType: 'jpg',
      fileSizeKb: 120,
    });
    apiFetchMock.mockResolvedValueOnce({ claimId: 'claim-1' });
    const { result } = renderHook(() => useClaimItemForm());
    const file = new File(['x'], 'proof.jpg', { type: 'image/jpeg' });

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('Black backpack');
      result.current.setImageFiles([file]);
    });
    await act(() => result.current.handleSubmit());

    expect(handleImageUploadMock).toHaveBeenCalledWith(
      file,
      'test-access-token'
    );
    expect(apiFetchMock).toHaveBeenCalledWith('/api/claims', {
      method: 'POST',
      body: JSON.stringify({
        category: 'Electronics',
        itemName: 'MacBook Pro',
        description: 'Black backpack',
        images: [
          { imageUrl: 'reports/abc.jpg', fileType: 'jpg', fileSizeKb: 120 },
        ],
      }),
    });
  });

  it('blocks submission and shows the login message when there is no access token', async () => {
    getAccessTokenMock.mockReturnValue(null);
    const { result } = renderHook(() => useClaimItemForm());
    const file = new File(['x'], 'proof.jpg', { type: 'image/jpeg' });

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('Black backpack');
      result.current.setImageFiles([file]);
    });
    await act(() => result.current.handleSubmit());

    expect(handleImageUploadMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.submitError).toBe(
      'Please log in as a student to submit a claim.'
    );
  });

  it('maps backend statuses to user-facing copy', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(409, 'conflict'));
    const { result } = renderHook(() => useClaimItemForm());

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('Black backpack');
    });
    await act(() => result.current.handleSubmit());

    expect(result.current.submitError).toBe(
      'A campus must be assigned to your account before you can submit a claim.'
    );
    expect(result.current.isSubmitting).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('surfaces configuration/network failures with their own message', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError(0, 'Unable to connect to server.')
    );
    const { result } = renderHook(() => useClaimItemForm());

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('Black backpack');
    });
    await act(() => result.current.handleSubmit());

    expect(result.current.submitError).toBe('Unable to connect to server.');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('shows the generic message (not the login copy) when an image upload fails', async () => {
    handleImageUploadMock.mockRejectedValueOnce(
      new Error('Failed to upload image: 403 Forbidden')
    );
    const { result } = renderHook(() => useClaimItemForm());

    act(() => {
      result.current.setCategory('Electronics');
      result.current.setItemName('MacBook Pro');
      result.current.setDescription('Black backpack');
      result.current.setImageFiles([
        new File(['x'], 'proof.png', { type: 'image/png' }),
      ]);
    });
    await act(() => result.current.handleSubmit());

    expect(result.current.submitError).toBe(
      'Something went wrong submitting your claim. Please try again.'
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });
});
