import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { embedText } from './embeddings';
import {
  buildClaimSearchText,
  buildItemSearchText,
  type ClaimSearchInput,
  type ItemSearchInput,
} from './searchText';

async function saveSearchIndex(
  entity: 'claim' | 'item',
  id: string,
  searchText: string,
  embedding: number[]
) {
  const data = {
    searchText,
    embedding: embedding as unknown as Prisma.InputJsonValue,
  };

  if (entity === 'claim') {
    await prisma.claim.update({
      where: { claimId: id },
      data,
    });
    return;
  }

  await prisma.item.update({
    where: { itemId: id },
    data,
  });
}

/**
 * Computes and persists a claim's search text + embedding, returning the
 * embedding so callers that need it immediately do not have to re-read the row
 * (or, worse, recompute it).
 */
export async function ingestClaimSearchIndex(
  claimId: string,
  input?: ClaimSearchInput
): Promise<number[] | null> {
  const claim =
    input ??
    (await prisma.claim.findUnique({
      where: { claimId },
      select: {
        category: true,
        itemName: true,
        description: true,
        additionalInfo: true,
        locationLost: true,
      },
    }));

  if (!claim) {
    return null;
  }

  const searchText = buildClaimSearchText(claim);
  const embedding = await embedText(searchText);
  await saveSearchIndex('claim', claimId, searchText, embedding);
  return embedding;
}

/** Item counterpart of {@link ingestClaimSearchIndex}. */
export async function ingestItemSearchIndex(
  itemId: string,
  input?: ItemSearchInput
): Promise<number[] | null> {
  const item =
    input ??
    (await prisma.item.findUnique({
      where: { itemId },
      select: {
        category: true,
        title: true,
        descriptionPublic: true,
        descriptionInternal: true,
        brand: true,
        color: true,
        locationFound: true,
      },
    }));

  if (!item) {
    return null;
  }

  const searchText = buildItemSearchText(item);
  const embedding = await embedText(searchText);
  await saveSearchIndex('item', itemId, searchText, embedding);
  return embedding;
}

function logIngestFailure(
  entity: 'claim' | 'item',
  id: string,
  error: unknown
) {
  console.error(`Failed to ingest ${entity} search index`, { id, error });
}

export function scheduleClaimSearchIndexIngest(
  claimId: string,
  input?: ClaimSearchInput
) {
  void ingestClaimSearchIndex(claimId, input).catch((error) => {
    logIngestFailure('claim', claimId, error);
  });
}

export function scheduleItemSearchIndexIngest(
  itemId: string,
  input?: ItemSearchInput
) {
  void ingestItemSearchIndex(itemId, input).catch((error) => {
    logIngestFailure('item', itemId, error);
  });
}
