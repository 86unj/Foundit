import { apiFetch } from '@/lib/api/client';

export interface VerifyEmailResponse {
  message: string;
}

/**
 * Dedupes concurrent verifies for the same token (React Strict Mode remounts)
 * and caches successes for the page session so a remount after settle still works.
 */
const verifyEmailCache = new Map<string, Promise<VerifyEmailResponse>>();

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  const existing = verifyEmailCache.get(token);
  if (existing) {
    return existing;
  }

  const request = apiFetch<VerifyEmailResponse>(
    `/api/auth/verify-email?token=${encodeURIComponent(token)}`,
    { auth: false }
  ).catch((err: unknown) => {
    verifyEmailCache.delete(token);
    throw err;
  });

  verifyEmailCache.set(token, request);
  return request;
}
