/**
 * Shared profile-photo state for the session.
 *
 * The navbar avatar and the profile page both need the current photo, and the
 * profile page changes it. Threading a prop through every page that renders
 * <Navbar> would touch a dozen call sites and still not update the navbar
 * live, so the value lives in a tiny external store that both read via
 * useSyncExternalStore.
 *
 * Intentionally dependency-free — `utils/auth.ts` imports it to clear the
 * photo on sign-out, so importing auth here would create a cycle.
 */

let photoUrl: string | null = null;
/** Distinguishes "not fetched yet" from "fetched, user has no photo". */
let hasLoaded = false;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToProfilePhoto(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProfilePhotoSnapshot(): string | null {
  return photoUrl;
}

export function hasLoadedProfilePhoto(): boolean {
  return hasLoaded;
}

export function setProfilePhoto(url: string | null) {
  hasLoaded = true;
  if (url === photoUrl) return;
  photoUrl = url;
  emit();
}

/** Resets on sign-out so the next account never inherits this avatar. */
export function clearProfilePhoto() {
  hasLoaded = false;
  if (photoUrl === null) return;
  photoUrl = null;
  emit();
}
