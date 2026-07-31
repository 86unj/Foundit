import { describe, expect, test, vi } from 'vitest';

// lib/r2 throws at import time when the R2_* variables are missing, and this
// suite only exercises the pure TTL parsing, so stub it out.
vi.mock('../src/lib/r2', () => ({
  r2: {},
  R2_BUCKET: 'test-bucket',
}));

import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_SIGNED_URL_TTL_SECONDS,
  parseSignedUrlTtlSeconds,
} from '../src/utils/imageUrl';

describe('parseSignedUrlTtlSeconds', () => {
  test('defaults to a full working day, comfortably longer than one hour', () => {
    expect(DEFAULT_SIGNED_URL_TTL_SECONDS).toBe(24 * 60 * 60);
    expect(DEFAULT_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(3600);
  });

  test('falls back to the default when unset or blank', () => {
    expect(parseSignedUrlTtlSeconds(undefined)).toBe(
      DEFAULT_SIGNED_URL_TTL_SECONDS
    );
    expect(parseSignedUrlTtlSeconds('')).toBe(DEFAULT_SIGNED_URL_TTL_SECONDS);
    expect(parseSignedUrlTtlSeconds('  ')).toBe(DEFAULT_SIGNED_URL_TTL_SECONDS);
  });

  test('accepts a valid positive integer', () => {
    expect(parseSignedUrlTtlSeconds('3600')).toBe(3600);
    expect(parseSignedUrlTtlSeconds(' 43200 ')).toBe(43200);
  });

  test('rejects non-integer and non-positive values', () => {
    for (const raw of ['abc', '1h', '0', '-60', '3600.5', 'NaN', 'Infinity']) {
      expect(parseSignedUrlTtlSeconds(raw)).toBe(
        DEFAULT_SIGNED_URL_TTL_SECONDS
      );
    }
  });

  test('clamps to the 7-day SigV4 ceiling instead of failing to sign', () => {
    expect(MAX_SIGNED_URL_TTL_SECONDS).toBe(604800);
    expect(parseSignedUrlTtlSeconds('604800')).toBe(604800);
    expect(parseSignedUrlTtlSeconds('999999999')).toBe(
      MAX_SIGNED_URL_TTL_SECONDS
    );
  });
});
