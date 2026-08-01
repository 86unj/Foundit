import { apiFetch } from '@/lib/api/client';
import type { UserProfile } from '@/types/users';

/**
 * Sets or clears the signed-in user's profile photo.
 *
 * `objectKey` must be the key returned by the presigned-url request (e.g.
 * `avatars/<uuid>.webp`), not the resolved URL from a previous profile fetch —
 * the backend rejects absolute URLs because resolved URLs can expire. Pass
 * `null` to remove the photo.
 */
export async function updateProfilePhoto(
  objectKey: string | null
): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/users/me/photo', {
    method: 'PATCH',
    body: JSON.stringify({ profilePhotoUrl: objectKey }),
  });
}
