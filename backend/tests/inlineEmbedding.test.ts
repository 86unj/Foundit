import { describe, expect, test } from 'vitest';
import {
  DEFAULT_EMBEDDING_CONCURRENCY,
  DEFAULT_INLINE_EMBEDDING_LIMIT,
  mapWithConcurrency,
  planInlineEmbeddingWork,
  resolveInlineEmbeddingLimits,
} from '../src/lib/matching/inlineEmbedding';

describe('resolveInlineEmbeddingLimits', () => {
  test('falls back to defaults when the env vars are absent', () => {
    expect(resolveInlineEmbeddingLimits({})).toEqual({
      maxInline: DEFAULT_INLINE_EMBEDDING_LIMIT,
      concurrency: DEFAULT_EMBEDDING_CONCURRENCY,
    });
  });

  test('reads valid integer overrides', () => {
    expect(
      resolveInlineEmbeddingLimits({
        MATCH_INLINE_EMBEDDING_LIMIT: '5',
        MATCH_EMBEDDING_CONCURRENCY: ' 8 ',
      })
    ).toEqual({ maxInline: 5, concurrency: 8 });
  });

  test('accepts zero as "compute nothing inline"', () => {
    expect(
      resolveInlineEmbeddingLimits({ MATCH_INLINE_EMBEDDING_LIMIT: '0' })
        .maxInline
    ).toBe(0);
  });

  test('falls back to defaults for blank and malformed values', () => {
    expect(
      resolveInlineEmbeddingLimits({
        MATCH_INLINE_EMBEDDING_LIMIT: '',
        MATCH_EMBEDDING_CONCURRENCY: 'four',
      })
    ).toEqual({
      maxInline: DEFAULT_INLINE_EMBEDDING_LIMIT,
      concurrency: DEFAULT_EMBEDDING_CONCURRENCY,
    });

    expect(
      resolveInlineEmbeddingLimits({ MATCH_INLINE_EMBEDDING_LIMIT: '2.5' })
        .maxInline
    ).toBe(DEFAULT_INLINE_EMBEDDING_LIMIT);
  });

  test('clamps out-of-range values instead of uncapping the work', () => {
    expect(
      resolveInlineEmbeddingLimits({
        MATCH_INLINE_EMBEDDING_LIMIT: '100000',
        MATCH_EMBEDDING_CONCURRENCY: '512',
      })
    ).toEqual({ maxInline: 1000, concurrency: 16 });

    expect(
      resolveInlineEmbeddingLimits({
        MATCH_INLINE_EMBEDDING_LIMIT: '-1',
        MATCH_EMBEDDING_CONCURRENCY: '0',
      })
    ).toEqual({ maxInline: 0, concurrency: 1 });
  });
});

describe('planInlineEmbeddingWork', () => {
  test('splits pending work at the cap and keeps the remainder', () => {
    const plan = planInlineEmbeddingWork(['a', 'b', 'c', 'd'], 2);
    expect(plan.compute).toEqual(['a', 'b']);
    expect(plan.skipped).toEqual(['c', 'd']);
  });

  test('computes everything when the cap is not reached', () => {
    const plan = planInlineEmbeddingWork(['a', 'b'], 10);
    expect(plan.compute).toEqual(['a', 'b']);
    expect(plan.skipped).toEqual([]);
  });

  test('skips everything when the cap is zero', () => {
    const plan = planInlineEmbeddingWork(['a', 'b'], 0);
    expect(plan.compute).toEqual([]);
    expect(plan.skipped).toEqual(['a', 'b']);
  });

  test('never drops an entry', () => {
    const pending = ['a', 'b', 'c'];
    const plan = planInlineEmbeddingWork(pending, 1);
    expect([...plan.compute, ...plan.skipped]).toEqual(pending);
  });
});

describe('mapWithConcurrency', () => {
  test('returns results in input order', async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (value) => value * 2
    );
    expect(results).toEqual([2, 4, 6, 8]);
  });

  test('never exceeds the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(
      Array.from({ length: 12 }, (_, index) => index),
      3,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
      }
    );

    expect(peak).toBe(3);
  });

  test('runs work in parallel rather than strictly serially', async () => {
    let peak = 0;
    let inFlight = 0;

    await mapWithConcurrency([1, 2, 3, 4], 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });

    expect(peak).toBeGreaterThan(1);
  });

  test('treats a non-positive concurrency as serial', async () => {
    let peak = 0;
    let inFlight = 0;

    await mapWithConcurrency([1, 2, 3], 0, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });

    expect(peak).toBe(1);
  });

  test('calls the worker exactly once per item', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([10, 20, 30], 8, async (value, index) => {
      seen.push(index);
      return value;
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  test('handles an empty input without invoking the worker', async () => {
    let calls = 0;
    const results = await mapWithConcurrency([], 4, async () => {
      calls += 1;
    });
    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });
});
