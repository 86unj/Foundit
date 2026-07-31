import { ClaimStatus, ItemStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { logger } from '../logger';
import { buildLocalEmbedding, isSemanticMatchingDegraded } from './embeddings';
import { ingestClaimSearchIndex, ingestItemSearchIndex } from './ingest';
import {
  mapWithConcurrency,
  planInlineEmbeddingWork,
  resolveInlineEmbeddingLimits,
} from './inlineEmbedding';
import { buildItemSearchText, type ItemSearchInput } from './searchText';
import {
  buildMatchCriteria,
  combineHybridScore,
  cosineSimilarity,
  dateProximityScore,
  retentionUrgencyScore,
} from './scores';

const MIN_MATCH_SCORE = 55;
const MAX_SUGGESTIONS = 10;

export interface GeneratedMatchCandidate {
  itemId: string;
  score: number;
  criteria: string;
}

function getTodayUtcDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function parseEmbedding(value: Prisma.JsonValue | null): number[] | null {
  if (!value || !Array.isArray(value)) {
    return null;
  }

  if (!value.every((entry) => typeof entry === 'number')) {
    return null;
  }

  return value as number[];
}

interface MatchItemRow extends ItemSearchInput {
  itemId: string;
  embedding: Prisma.JsonValue | null;
}

/**
 * Resolves an embedding for every candidate item.
 *
 * Rows that already have one cost nothing. Rows that do not are embedded and
 * the result is written back through the ingest helper, so a second run of the
 * same request finds them indexed instead of paying for the API call again.
 * That work is capped per request; whatever exceeds the cap is still scored,
 * using the offline hash embedding, and the shortfall is logged.
 *
 * Writing here is safe: generateMatchCandidates() runs before — never inside —
 * the transaction in suggestions.ts, and this path already persisted the
 * claim's own embedding the same way.
 */
async function resolveItemEmbeddings(
  items: readonly MatchItemRow[]
): Promise<Map<string, number[]>> {
  const resolved = new Map<string, number[]>();
  const pending: MatchItemRow[] = [];

  for (const item of items) {
    const embedding = parseEmbedding(item.embedding);
    if (embedding) {
      resolved.set(item.itemId, embedding);
    } else {
      pending.push(item);
    }
  }

  if (pending.length === 0) {
    return resolved;
  }

  if (isSemanticMatchingDegraded()) {
    // No API key: embedding never leaves the process, so there is nothing to
    // bound. Deliberately not persisted — storing hash vectors would make the
    // rows look indexed and stop the backfill fixing them once a key is set.
    for (const item of pending) {
      resolved.set(item.itemId, buildLocalEmbedding(buildItemSearchText(item)));
    }
    return resolved;
  }

  const { maxInline, concurrency } = resolveInlineEmbeddingLimits();
  const { compute, skipped } = planInlineEmbeddingWork(pending, maxInline);

  if (compute.length > 0) {
    const computed = await mapWithConcurrency(
      compute,
      concurrency,
      async (item) => {
        try {
          return await ingestItemSearchIndex(item.itemId, item);
        } catch (error) {
          logger.warn(
            { itemId: item.itemId, err: error },
            'Failed to compute item embedding during match generation; scoring this item with the local fallback embedding'
          );
          return null;
        }
      }
    );

    compute.forEach((item, index) => {
      resolved.set(
        item.itemId,
        computed[index] ?? buildLocalEmbedding(buildItemSearchText(item))
      );
    });
  }

  if (skipped.length > 0) {
    logger.warn(
      {
        skippedCount: skipped.length,
        computedCount: compute.length,
        maxInline,
      },
      // Not merely "ranked lower": semantic similarity carries 0.8 of the
      // hybrid score, and a fallback vector scores ~0 against a real one, so
      // these items top out around 20 and cannot clear MIN_MATCH_SCORE. They
      // are effectively absent from the suggestions until they are backfilled.
      'Inline embedding cap reached during match generation; the remaining items fell back to a local embedding and therefore cannot reach the match threshold — they will not appear in suggestions. Run `pnpm backfill:embeddings` to prime them.'
    );

    for (const item of skipped) {
      resolved.set(item.itemId, buildLocalEmbedding(buildItemSearchText(item)));
    }
  }

  return resolved;
}

export async function generateMatchCandidates(claimId: string): Promise<{
  candidates: GeneratedMatchCandidate[];
  candidateCount: number;
}> {
  const claim = await prisma.claim.findUnique({
    where: { claimId },
    select: {
      claimId: true,
      dateLost: true,
      embedding: true,
    },
  });

  if (!claim) {
    return { candidates: [], candidateCount: 0 };
  }

  let claimEmbedding = parseEmbedding(claim.embedding);
  if (!claimEmbedding) {
    claimEmbedding = await ingestClaimSearchIndex(claimId);
  }

  if (!claimEmbedding) {
    return { candidates: [], candidateCount: 0 };
  }

  const today = getTodayUtcDate();
  const items = await prisma.item.findMany({
    where: {
      status: ItemStatus.stored,
      OR: [
        { retentionExpiryDate: null },
        { retentionExpiryDate: { gt: today } },
      ],
      claims: {
        none: { status: ClaimStatus.approved },
      },
    },
    select: {
      itemId: true,
      category: true,
      dateFound: true,
      locationFound: true,
      retentionExpiryDate: true,
      title: true,
      descriptionPublic: true,
      descriptionInternal: true,
      brand: true,
      color: true,
      embedding: true,
    },
  });

  const itemEmbeddings = await resolveItemEmbeddings(items);
  const scored: GeneratedMatchCandidate[] = [];

  for (const item of items) {
    const itemEmbedding = itemEmbeddings.get(item.itemId);
    if (!itemEmbedding) {
      continue;
    }

    const semanticSimilarity = cosineSimilarity(claimEmbedding, itemEmbedding);
    const date = dateProximityScore(claim.dateLost, item.dateFound);
    if (!date.valid) {
      continue;
    }

    const hybridInput = {
      semanticSimilarity,
      dateProximity: date.score,
      retention: retentionUrgencyScore(item.retentionExpiryDate, today),
    };

    const score = combineHybridScore(hybridInput);
    if (score < MIN_MATCH_SCORE) {
      continue;
    }

    scored.push({
      itemId: item.itemId,
      score,
      criteria: buildMatchCriteria(hybridInput),
    });
  }

  scored.sort((left, right) => right.score - left.score);

  return {
    candidates: scored.slice(0, MAX_SUGGESTIONS),
    candidateCount: items.length,
  };
}
