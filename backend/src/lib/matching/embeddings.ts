import { logger } from '../logger';

const EMBEDDING_DIMENSIONS = 1536;
const OPENROUTER_API_URL =
  process.env.OPENROUTER_API_URL ?? 'https://openrouter.ai/api/v1';
const OPENROUTER_EMBEDDING_MODEL =
  process.env.OPENROUTER_EMBEDDING_MODEL ?? 'openai/text-embedding-3-small';
const OPENROUTER_IMAGE_EMBEDDING_MODEL =
  process.env.OPENROUTER_IMAGE_EMBEDDING_MODEL ??
  'nvidia/llama-nemotron-embed-vl-1b-v2';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const referer =
    process.env.APP_URL?.trim() || process.env.FRONTEND_URL?.trim();
  if (referer) {
    headers['HTTP-Referer'] = referer;
    headers['X-Title'] = 'Foundit';
  }

  return headers;
}

function parseEmbeddingPayload(payload: unknown): number[] {
  const embedding = (
    payload as { data?: Array<{ embedding?: number[] }> } | null
  )?.data?.[0]?.embedding;

  if (!embedding || embedding.length === 0) {
    throw new Error('OpenRouter embedding response did not include a vector.');
  }

  return normalizeVector(embedding);
}

/** Deterministic local fallback when OPENROUTER_API_KEY is not configured. */
export function buildLocalEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    const index = hash % EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

async function embedTextWithOpenRouter(
  text: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch(`${OPENROUTER_API_URL}/embeddings`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: OPENROUTER_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter embedding request failed (${response.status}): ${errorBody}`
    );
  }

  return parseEmbeddingPayload(await response.json());
}

async function embedImageWithOpenRouter(
  imageUrl: string,
  apiKey: string
): Promise<number[]> {
  if (OPENROUTER_IMAGE_EMBEDDING_MODEL.endsWith(':free')) {
    logger.warn(
      {
        model: OPENROUTER_IMAGE_EMBEDDING_MODEL,
      },
      'OPENROUTER_IMAGE_EMBEDDING_MODEL uses a :free endpoint that may log prompts. Prefer a non-free multimodal embedding model for claim/item photos.'
    );
  }

  const response = await fetch(`${OPENROUTER_API_URL}/embeddings`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: OPENROUTER_IMAGE_EMBEDDING_MODEL,
      encoding_format: 'float',
      input: [
        {
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter image embedding request failed (${response.status}): ${errorBody}`
    );
  }

  return parseEmbeddingPayload(await response.json());
}

/**
 * True when no OPENROUTER_API_KEY is configured, which means embedText() hands
 * back a deterministic hash vector instead of a real semantic one. Matching
 * keeps "working" in that state, but the ranking carries no meaning — so this
 * predicate exists to make the degradation checkable instead of invisible.
 */
export function isSemanticMatchingDegraded(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return !env.OPENROUTER_API_KEY?.trim();
}

let degradationWarned = false;

/**
 * Logs the hash-fallback warning at most once per process. Called at startup
 * and again on first fallback use; the fallback itself is left untouched
 * because local development legitimately depends on it.
 */
export function warnIfSemanticMatchingDegraded(): void {
  if (degradationWarned || !isSemanticMatchingDegraded()) {
    return;
  }

  degradationWarned = true;
  logger.warn(
    'OPENROUTER_API_KEY is not set: semantic matching is DEGRADED. Embeddings fall back to a local hash vector, so match suggestions are close to random. Set OPENROUTER_API_KEY and run `pnpm backfill:embeddings` to restore real semantic matching.'
  );
}

export async function embedText(text: string): Promise<number[]> {
  const normalized = text.trim();
  if (!normalized) {
    return new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (apiKey) {
    return embedTextWithOpenRouter(normalized, apiKey);
  }

  warnIfSemanticMatchingDegraded();
  return buildLocalEmbedding(normalized);
}

/**
 * Multimodal image embedding. Returns null when there is no API key or the
 * request fails — there is no local hash fallback for images (it would poison
 * similarity scores).
 */
export async function embedImage(imageUrl: string): Promise<number[] | null> {
  const normalized = imageUrl.trim();
  if (!normalized) {
    return null;
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    warnIfSemanticMatchingDegraded();
    return null;
  }

  try {
    return await embedImageWithOpenRouter(normalized, apiKey);
  } catch (error) {
    logger.warn(
      { err: error },
      'Failed to compute image embedding; continuing without image similarity'
    );
    return null;
  }
}

export const embeddingDimensions = EMBEDDING_DIMENSIONS;
export const imageEmbeddingModel = OPENROUTER_IMAGE_EMBEDDING_MODEL;
