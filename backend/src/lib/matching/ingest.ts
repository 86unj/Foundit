import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { embedImage, embedText } from './embeddings';
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
  embedding: number[],
  imageEmbedding: number[] | null
) {
  const data = {
    searchText,
    embedding: embedding as unknown as Prisma.InputJsonValue,
    imageEmbedding:
      imageEmbedding === null
        ? Prisma.DbNull
        : (imageEmbedding as unknown as Prisma.InputJsonValue),
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

async function resolveFirstImageEmbedding(
  entity: 'claim' | 'item',
  id: string
): Promise<number[] | null> {
  const image =
    entity === 'claim'
      ? await prisma.itemImage.findFirst({
          where: { claimId: id },
          orderBy: { createdAt: 'asc' },
          select: { imageUrl: true },
        })
      : await prisma.itemImage.findFirst({
          where: { itemId: id },
          orderBy: { createdAt: 'asc' },
          select: { imageUrl: true },
        });

  if (!image?.imageUrl) {
    return null;
  }

  // Lazy-load so importing ingest (for schedule helpers) does not require R2
  // env vars at module evaluation time — important for unit/integration tests.
  const { resolveImageUrl } = await import('../../utils/imageUrl');
  const fetchableUrl = await resolveImageUrl(image.imageUrl);
  return embedImage(fetchableUrl);
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
  const [embedding, imageEmbedding] = await Promise.all([
    embedText(searchText),
    resolveFirstImageEmbedding('claim', claimId),
  ]);
  await saveSearchIndex(
    'claim',
    claimId,
    searchText,
    embedding,
    imageEmbedding
  );
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
  const [embedding, imageEmbedding] = await Promise.all([
    embedText(searchText),
    resolveFirstImageEmbedding('item', itemId),
  ]);
  await saveSearchIndex('item', itemId, searchText, embedding, imageEmbedding);
  return embedding;
}

/**
 * Recomputes only the image embedding for a claim/item (e.g. after photos are
 * attached). Text embedding is left untouched.
 */
export async function ingestClaimImageEmbedding(
  claimId: string
): Promise<number[] | null> {
  const imageEmbedding = await resolveFirstImageEmbedding('claim', claimId);
  await prisma.claim.update({
    where: { claimId },
    data: {
      imageEmbedding:
        imageEmbedding === null
          ? Prisma.DbNull
          : (imageEmbedding as unknown as Prisma.InputJsonValue),
    },
  });
  return imageEmbedding;
}

export async function ingestItemImageEmbedding(
  itemId: string
): Promise<number[] | null> {
  const imageEmbedding = await resolveFirstImageEmbedding('item', itemId);
  await prisma.item.update({
    where: { itemId },
    data: {
      imageEmbedding:
        imageEmbedding === null
          ? Prisma.DbNull
          : (imageEmbedding as unknown as Prisma.InputJsonValue),
    },
  });
  return imageEmbedding;
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

export function scheduleClaimImageEmbeddingIngest(claimId: string) {
  void ingestClaimImageEmbedding(claimId).catch((error) => {
    logIngestFailure('claim', claimId, error);
  });
}

export function scheduleItemImageEmbeddingIngest(itemId: string) {
  void ingestItemImageEmbedding(itemId).catch((error) => {
    logIngestFailure('item', itemId, error);
  });
}
