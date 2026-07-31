/**
 * One-off backfill for rows created before semantic matching existed.
 *
 * Items and claims whose `embedding` column is still NULL force the match
 * endpoint to compute embeddings inline, which is slow and capped. Running
 * this primes them up front so the first "generate match suggestions" click in
 * production is fast.
 *
 * Usage (from backend/):
 *   pnpm backfill:embeddings
 *   pnpm backfill:embeddings -- --batch-size=100
 *   pnpm backfill:embeddings -- --allow-hash-fallback   # local dev only
 *
 * Properties:
 *   - Idempotent: only rows with no embedding are selected, so re-running
 *     after a full pass does nothing.
 *   - Interrupt-safe: every row is written in its own statement and the
 *     keyset cursor is recomputed from the database on each batch, so Ctrl-C
 *     leaves no partial state. Re-run to continue where it stopped.
 *   - Failures are logged and skipped, never retried in a loop.
 */
import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { logger } from '../lib/logger';
import { isSemanticMatchingDegraded } from '../lib/matching/embeddings';
import {
  mapWithConcurrency,
  resolveInlineEmbeddingLimits,
} from '../lib/matching/inlineEmbedding';

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;

interface ScriptOptions {
  batchSize: number;
  allowHashFallback: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    allowHashFallback: false,
  };

  for (const arg of argv) {
    if (arg === '--allow-hash-fallback') {
      options.allowHashFallback = true;
      continue;
    }

    const batchSize = /^--batch-size=(\d+)$/.exec(arg);
    if (batchSize) {
      options.batchSize = Math.min(
        Math.max(Number(batchSize[1]), 1),
        MAX_BATCH_SIZE
      );
      continue;
    }

    logger.warn({ arg }, 'Ignoring unrecognised argument');
  }

  return options;
}

let stopRequested = false;

function requestStop(signal: string): void {
  stopRequested = true;
  logger.warn(
    { signal },
    'Stop requested; finishing in-flight rows then exiting. Re-run to continue.'
  );
}

interface BackfillTarget {
  label: 'item' | 'claim';
  /** Rows with no embedding whose id sorts after `afterId`, ordered by id. */
  fetchBatch(afterId: string | null, take: number): Promise<string[]>;
  ingest(id: string): Promise<unknown>;
}

interface BackfillResult {
  embedded: number;
  failed: number;
}

async function backfillEntity(
  target: BackfillTarget,
  batchSize: number,
  concurrency: number
): Promise<BackfillResult> {
  // Keyset pagination on the primary key. Successfully embedded rows drop out
  // of the filter, and failed rows are stepped over by the cursor, so the loop
  // always terminates even when some rows keep failing.
  let afterId: string | null = null;
  const result: BackfillResult = { embedded: 0, failed: 0 };

  while (!stopRequested) {
    const batch = await target.fetchBatch(afterId, batchSize);
    if (batch.length === 0) {
      break;
    }
    afterId = batch[batch.length - 1];

    const outcomes = await mapWithConcurrency(
      batch,
      concurrency,
      async (id) => {
        if (stopRequested) {
          return 'skipped' as const;
        }

        try {
          await target.ingest(id);
          return 'embedded' as const;
        } catch (error) {
          logger.error(
            { entity: target.label, id, err: error },
            'Failed to embed row; skipping it'
          );
          return 'failed' as const;
        }
      }
    );

    for (const outcome of outcomes) {
      if (outcome === 'embedded') result.embedded += 1;
      if (outcome === 'failed') result.failed += 1;
    }

    logger.info(
      {
        entity: target.label,
        embedded: result.embedded,
        failed: result.failed,
      },
      'Backfill progress'
    );
  }

  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL?.trim()) {
    logger.error(
      'DATABASE_URL is not set. Point it at the target database (backend/.env or the environment) and re-run.'
    );
    process.exitCode = 1;
    return;
  }

  if (isSemanticMatchingDegraded() && !options.allowHashFallback) {
    logger.error(
      'OPENROUTER_API_KEY is not set, so this would store meaningless hash vectors and permanently mark the rows as indexed. Set the key, or pass --allow-hash-fallback if this is a local development database.'
    );
    process.exitCode = 1;
    return;
  }

  process.once('SIGINT', () => requestStop('SIGINT'));
  process.once('SIGTERM', () => requestStop('SIGTERM'));

  // Imported lazily: constructing the Prisma client requires DATABASE_URL, and
  // the checks above must be able to fail cleanly before that happens.
  const { prisma } = await import('../db');
  const { ingestClaimSearchIndex, ingestItemSearchIndex } =
    await import('../lib/matching/ingest');

  const { concurrency } = resolveInlineEmbeddingLimits();
  logger.info(
    { batchSize: options.batchSize, concurrency },
    'Starting embedding backfill'
  );

  const targets: BackfillTarget[] = [
    {
      label: 'item',
      async fetchBatch(afterId, take) {
        const rows = await prisma.item.findMany({
          where: {
            embedding: { equals: Prisma.AnyNull },
            ...(afterId ? { itemId: { gt: afterId } } : {}),
          },
          orderBy: { itemId: 'asc' },
          take,
          select: { itemId: true },
        });
        return rows.map((row) => row.itemId);
      },
      ingest: (id) => ingestItemSearchIndex(id),
    },
    {
      label: 'claim',
      async fetchBatch(afterId, take) {
        const rows = await prisma.claim.findMany({
          where: {
            embedding: { equals: Prisma.AnyNull },
            ...(afterId ? { claimId: { gt: afterId } } : {}),
          },
          orderBy: { claimId: 'asc' },
          take,
          select: { claimId: true },
        });
        return rows.map((row) => row.claimId);
      },
      ingest: (id) => ingestClaimSearchIndex(id),
    },
  ];

  try {
    for (const target of targets) {
      const result = await backfillEntity(
        target,
        options.batchSize,
        concurrency
      );
      logger.info(
        { entity: target.label, ...result },
        'Finished entity backfill'
      );
      if (result.failed > 0) {
        process.exitCode = 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (stopRequested) {
    logger.warn(
      'Backfill interrupted. Already-embedded rows are skipped on the next run.'
    );
    process.exitCode = 130;
  }
}

void main().catch((error) => {
  logger.error({ err: error }, 'Embedding backfill failed');
  process.exitCode = 1;
});
