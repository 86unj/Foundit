import { ClaimStatus, ItemStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { embedText } from './embeddings';
import { ingestClaimSearchIndex } from './ingest';
import { buildItemSearchText } from './searchText';
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
    await ingestClaimSearchIndex(claimId);
    const refreshed = await prisma.claim.findUnique({
      where: { claimId },
      select: { embedding: true },
    });
    claimEmbedding = parseEmbedding(refreshed?.embedding ?? null);
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

  const scored: GeneratedMatchCandidate[] = [];

  for (const item of items) {
    let itemEmbedding = parseEmbedding(item.embedding);
    if (!itemEmbedding) {
      itemEmbedding = await embedText(buildItemSearchText(item));
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
