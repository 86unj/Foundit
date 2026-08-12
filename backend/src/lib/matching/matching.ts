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

/** Items still physically retained and eligible for matching / linking. */
export const CLAIMABLE_ITEM_STATUSES = [
  ItemStatus.stored,
  ItemStatus.expired,
] as const;

export interface GeneratedMatchCandidate {
  itemId: string;
  score: number;
  criteria: string;
}

interface ScoredMatchCandidate extends GeneratedMatchCandidate {
  status: ItemStatus;
}

/** Stored items first (by score), then expired (by score). */
export function compareClaimableMatchCandidates(
  left: Pick<ScoredMatchCandidate, 'status' | 'score'>,
  right: Pick<ScoredMatchCandidate, 'status' | 'score'>
): number {
  const leftExpired = left.status === ItemStatus.expired ? 1 : 0;
  const rightExpired = right.status === ItemStatus.expired ? 1 : 0;
  if (leftExpired !== rightExpired) {
    return leftExpired - rightExpired;
  }
  return right.score - left.score;
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
  imageEmbedding: Prisma.JsonValue | null;
}

interface ResolvedItemVectors {
  textEmbeddings: Map<string, number[]>;
  imageEmbeddings: Map<string, number[]>;
}

/**
 * Resolves text (and any already-stored image) embeddings for every candidate.
 *
 * Rows that already have a text embedding cost nothing. Rows that do not are
 * embedded and the result is written back through the ingest helper, so a
 * second run of the same request finds them indexed instead of paying for the
 * API call again. That work is capped per request; whatever exceeds the cap is
 * still scored, using the offline hash embedding, and the shortfall is logged.
 *
 * Image embeddings are never computed inline here beyond what ingest already
 * wrote — missing image vectors simply drop the match into the text-only
 * hybrid weights.
 *
 * Writing here is safe: generateMatchCandidates() runs before — never inside —
 * the transaction in suggestions.ts, and this path already persisted the
 * claim's own embedding the same way.
 */
async function resolveItemEmbeddings(
  items: readonly MatchItemRow[]
): Promise<ResolvedItemVectors> {
  const textEmbeddings = new Map<string, number[]>();
  const imageEmbeddings = new Map<string, number[]>();
  const pending: MatchItemRow[] = [];

  for (const item of items) {
    const imageEmbedding = parseEmbedding(item.imageEmbedding);
    if (imageEmbedding) {
      imageEmbeddings.set(item.itemId, imageEmbedding);
    }

    const embedding = parseEmbedding(item.embedding);
    if (embedding) {
      textEmbeddings.set(item.itemId, embedding);
    } else {
      pending.push(item);
    }
  }

  if (pending.length === 0) {
    return { textEmbeddings, imageEmbeddings };
  }

  if (isSemanticMatchingDegraded()) {
    // No API key: embedding never leaves the process, so there is nothing to
    // bound. Deliberately not persisted — storing hash vectors would make the
    // rows look indexed and stop the backfill fixing them once a key is set.
    for (const item of pending) {
      textEmbeddings.set(
        item.itemId,
        buildLocalEmbedding(buildItemSearchText(item))
      );
    }
    return { textEmbeddings, imageEmbeddings };
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
      textEmbeddings.set(
        item.itemId,
        computed[index] ?? buildLocalEmbedding(buildItemSearchText(item))
      );
    });

    // Ingest also writes imageEmbedding when a photo exists; reload those.
    const refreshed = await prisma.item.findMany({
      where: {
        itemId: { in: compute.map((item) => item.itemId) },
      },
      select: { itemId: true, imageEmbedding: true },
    });
    for (const row of refreshed) {
      const imageEmbedding = parseEmbedding(row.imageEmbedding);
      if (imageEmbedding) {
        imageEmbeddings.set(row.itemId, imageEmbedding);
      }
    }
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
      textEmbeddings.set(
        item.itemId,
        buildLocalEmbedding(buildItemSearchText(item))
      );
    }
  }

  return { textEmbeddings, imageEmbeddings };
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
      imageEmbedding: true,
    },
  });

  if (!claim) {
    return { candidates: [], candidateCount: 0 };
  }

  let claimEmbedding = parseEmbedding(claim.embedding);
  let claimImageEmbedding = parseEmbedding(claim.imageEmbedding);
  if (!claimEmbedding) {
    claimEmbedding = await ingestClaimSearchIndex(claimId);
    // Re-read image embedding after ingest so a just-computed vector is used.
    const refreshed = await prisma.claim.findUnique({
      where: { claimId },
      select: { imageEmbedding: true },
    });
    claimImageEmbedding = parseEmbedding(refreshed?.imageEmbedding ?? null);
  }

  if (!claimEmbedding) {
    return { candidates: [], candidateCount: 0 };
  }

  const today = getTodayUtcDate();
  const items = await prisma.item.findMany({
    where: {
      status: { in: [...CLAIMABLE_ITEM_STATUSES] },
      claims: {
        none: { status: ClaimStatus.approved },
      },
    },
    select: {
      itemId: true,
      status: true,
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
      imageEmbedding: true,
    },
  });

  const { textEmbeddings, imageEmbeddings } =
    await resolveItemEmbeddings(items);
  const scored: ScoredMatchCandidate[] = [];

  for (const item of items) {
    const itemEmbedding = textEmbeddings.get(item.itemId);
    if (!itemEmbedding) {
      continue;
    }

    const semanticSimilarity = cosineSimilarity(claimEmbedding, itemEmbedding);
    const date = dateProximityScore(claim.dateLost, item.dateFound);
    if (!date.valid) {
      continue;
    }

    const itemImageEmbedding = imageEmbeddings.get(item.itemId) ?? null;
    const imageSimilarity =
      claimImageEmbedding && itemImageEmbedding
        ? cosineSimilarity(claimImageEmbedding, itemImageEmbedding)
        : null;

    const hybridInput = {
      semanticSimilarity,
      dateProximity: date.score,
      retention: retentionUrgencyScore(item.retentionExpiryDate, today),
      imageSimilarity,
    };

    const score = combineHybridScore(hybridInput);
    if (score < MIN_MATCH_SCORE) {
      continue;
    }

    const criteria = buildMatchCriteria(hybridInput);
    scored.push({
      itemId: item.itemId,
      score,
      criteria:
        item.status === ItemStatus.expired
          ? criteria
            ? `${criteria},expired`
            : 'expired'
          : criteria,
      status: item.status,
    });
  }

  // Stored first (by score), then expired at the bottom (by score).
  scored.sort(compareClaimableMatchCandidates);

  return {
    candidates: scored
      .slice(0, MAX_SUGGESTIONS)
      .map(({ itemId, score, criteria }) => ({
        itemId,
        score,
        criteria,
      })),
    candidateCount: items.length,
  };
}
