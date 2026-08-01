/**
 * Bounds on the embedding work a single request is allowed to do inline.
 *
 * Generating match suggestions scores every stored item, and any item whose
 * embedding was never persisted needs one remote embedding call. Unbounded,
 * that is N round-trips inside one HTTP request, which is how the endpoint
 * reaches the reverse proxy's read timeout. These helpers cap how many of
 * those calls one request may make and run the rest with limited concurrency.
 *
 * Kept free of Prisma and network access so it can be unit tested directly.
 */

export const DEFAULT_INLINE_EMBEDDING_LIMIT = 25;
export const DEFAULT_EMBEDDING_CONCURRENCY = 4;

const MIN_INLINE_EMBEDDING_LIMIT = 0;
const MAX_INLINE_EMBEDDING_LIMIT = 1000;
const MIN_EMBEDDING_CONCURRENCY = 1;
const MAX_EMBEDDING_CONCURRENCY = 16;

export interface InlineEmbeddingLimits {
  /** Maximum embeddings a single request may compute and persist inline. */
  maxInline: number;
  /** How many of those calls may be in flight at once. */
  concurrency: number;
}

/**
 * Parses an integer env value. Missing, blank or malformed values fall back to
 * the default; in-range-but-extreme values are clamped rather than rejected so
 * a typo can never uncap the work.
 */
function parseBoundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === undefined) {
    return fallback;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export function resolveInlineEmbeddingLimits(
  env: NodeJS.ProcessEnv = process.env
): InlineEmbeddingLimits {
  return {
    maxInline: parseBoundedInt(
      env.MATCH_INLINE_EMBEDDING_LIMIT,
      DEFAULT_INLINE_EMBEDDING_LIMIT,
      MIN_INLINE_EMBEDDING_LIMIT,
      MAX_INLINE_EMBEDDING_LIMIT
    ),
    concurrency: parseBoundedInt(
      env.MATCH_EMBEDDING_CONCURRENCY,
      DEFAULT_EMBEDDING_CONCURRENCY,
      MIN_EMBEDDING_CONCURRENCY,
      MAX_EMBEDDING_CONCURRENCY
    ),
  };
}

export interface InlineEmbeddingPlan<T> {
  /** Entries this request will embed for real. */
  compute: T[];
  /** Entries left over; callers must still score them, not drop them. */
  skipped: T[];
}

export function planInlineEmbeddingWork<T>(
  pending: readonly T[],
  maxInline: number
): InlineEmbeddingPlan<T> {
  const limit = Math.max(0, Math.floor(maxInline));

  return {
    compute: pending.slice(0, limit),
    skipped: pending.slice(limit),
  };
}

/**
 * Runs `worker` over `items` with at most `concurrency` calls in flight,
 * preserving input order in the returned array.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) {
    return results;
  }

  const requested = Math.floor(concurrency);
  const workerCount = Math.min(
    Number.isFinite(requested) ? Math.max(requested, 1) : 1,
    items.length
  );

  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return results;
}
