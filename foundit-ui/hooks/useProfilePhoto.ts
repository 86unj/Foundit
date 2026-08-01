'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/utils/auth';
import {
  getProfilePhotoSnapshot,
  hasLoadedProfilePhoto,
  setProfilePhoto,
  subscribeToProfilePhoto,
} from '@/utils/profilePhotoStore';
import type { UserProfile } from '@/types/users';

// Module-level so a navigation between pages that both mount the navbar
// doesn't fire a second request.
let inFlight: Promise<void> | null = null;

async function loadOnce() {
  if (hasLoadedProfilePhoto() || inFlight) return inFlight ?? undefined;

  inFlight = (async () => {
    try {
      const profile = await apiFetch<UserProfile>('/api/users/me');
      setProfilePhoto(profile.profilePhotoUrl ?? null);
    } catch {
      // Avatar falls back to the account icon; nothing to surface here.
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Current user's profile photo URL, or null when unset or not yet loaded.
 * Fetches once per session on first use; updates live when the profile page
 * changes the photo.
 *
 * @param enabled pass false for signed-out views so no request is made.
 */
export function useProfilePhoto(enabled = true): string | null {
  const photoUrl = useSyncExternalStore(
    subscribeToProfilePhoto,
    getProfilePhotoSnapshot,
    () => null
  );

  useEffect(() => {
    if (!enabled || !getAccessToken()) return;
    loadOnce();
  }, [enabled]);

  return photoUrl;
}
