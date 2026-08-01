import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET } from '../lib/r2';

/**
 * SigV4 refuses to sign anything longer than 7 days, so this is a hard ceiling
 * rather than a policy choice.
 */
export const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * 24h, not the old 1h: without a public R2 domain every image on a page is a
 * presigned URL, so the TTL is how long a tab can stay open before every photo
 * turns into a broken image. Security staff leave a dashboard open all day.
 */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Parses R2_SIGNED_URL_TTL_SECONDS. Anything unset, blank, non-integer or
 * non-positive falls back to the default; anything above the SigV4 ceiling is
 * clamped down to it so a too-large value can't make signing fail outright.
 */
export function parseSignedUrlTtlSeconds(raw: string | undefined): number {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }

  return Math.min(parsed, MAX_SIGNED_URL_TTL_SECONDS);
}

// Set R2_PUBLIC_BASE_URL to serve stable, cacheable URLs straight from the
// bucket's public domain. Left empty (the current production state) we sign a
// short-lived GET URL per image instead — see parseSignedUrlTtlSeconds.
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
const SIGNED_URL_TTL_SECONDS = parseSignedUrlTtlSeconds(
  process.env.R2_SIGNED_URL_TTL_SECONDS
);

export async function resolveImageUrl(stored: string): Promise<string> {
  if (/^https?:\/\//i.test(stored)) {
    return stored;
  }

  if (PUBLIC_BASE) {
    return `${PUBLIC_BASE}/${stored}`;
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET!,
    Key: stored,
  });

  return getSignedUrl(r2, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}
