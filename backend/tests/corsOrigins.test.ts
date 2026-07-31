import { describe, expect, test } from 'vitest';
import {
  DEFAULT_ALLOWED_ORIGIN,
  parseAllowedOrigins,
} from '../src/utils/corsOrigins';

describe('parseAllowedOrigins', () => {
  test('falls back to the local dev origin when unset or blank', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([DEFAULT_ALLOWED_ORIGIN]);
    expect(parseAllowedOrigins('')).toEqual([DEFAULT_ALLOWED_ORIGIN]);
    expect(parseAllowedOrigins('   ')).toEqual([DEFAULT_ALLOWED_ORIGIN]);
    expect(parseAllowedOrigins(',, ,')).toEqual([DEFAULT_ALLOWED_ORIGIN]);
  });

  test('keeps a single origin working exactly as before', () => {
    expect(parseAllowedOrigins('https://foundit.garychang1214.com')).toEqual([
      'https://foundit.garychang1214.com',
    ]);
  });

  test('splits a comma-separated list and trims whitespace', () => {
    expect(
      parseAllowedOrigins(
        'https://foundit.garychang1214.com, https://garychang1214.com ,https://www.garychang1214.com'
      )
    ).toEqual([
      'https://foundit.garychang1214.com',
      'https://garychang1214.com',
      'https://www.garychang1214.com',
    ]);
  });

  test('ignores empty entries from stray commas', () => {
    expect(
      parseAllowedOrigins('https://a.example.com,,  ,https://b.example.com,')
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  test('strips trailing slashes so entries match the browser Origin header', () => {
    expect(
      parseAllowedOrigins('https://a.example.com/, https://b.example.com//')
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  test('never widens the allowlist to a wildcard', () => {
    const origins = parseAllowedOrigins(
      'https://foundit.garychang1214.com,https://garychang1214.com'
    );

    expect(origins).not.toContain('*');
    expect(origins).not.toContain('https://evil.example.com');
  });
});
