import { describe, expect, test, vi, afterEach } from 'vitest';
import { ItemStatus } from '@prisma/client';
import {
  buildMatchCriteria,
  combineHybridScore,
  cosineSimilarity,
  dateProximityScore,
} from '../src/lib/matching/scores';

describe('matching scores', () => {
  test('cosineSimilarity returns 1 for identical vectors', () => {
    const vector = [0.2, 0.5, 0.9];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  test('dateProximityScore treats missing dateLost as neutral', () => {
    const result = dateProximityScore(
      null,
      new Date('2026-07-01T00:00:00.000Z')
    );
    expect(result).toEqual({ score: 0.5, valid: true });
  });

  test('dateProximityScore soft-penalizes found-before-lost dates', () => {
    const result = dateProximityScore(
      new Date('2026-07-10T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z')
    );
    expect(result).toEqual({ score: 0.1, valid: true });
  });

  test('combineHybridScore returns a 0-100 score', () => {
    const score = combineHybridScore({
      semanticSimilarity: 0.9,
      dateProximity: 1,
      retention: 1,
    });

    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('combineHybridScore is driven mainly by semantic similarity', () => {
    const strongSemantic = combineHybridScore({
      semanticSimilarity: 0.85,
      dateProximity: 0.4,
      retention: 1,
    });
    const weakSemantic = combineHybridScore({
      semanticSimilarity: 0.4,
      dateProximity: 1,
      retention: 1,
    });

    expect(strongSemantic).toBeGreaterThan(weakSemantic);
    expect(weakSemantic).toBeLessThan(55);
  });

  test('combineHybridScore without imageSimilarity keeps text-only weights', () => {
    const withoutImage = combineHybridScore({
      semanticSimilarity: 1,
      dateProximity: 0,
      retention: 0,
    });
    const withNullImage = combineHybridScore({
      semanticSimilarity: 1,
      dateProximity: 0,
      retention: 0,
      imageSimilarity: null,
    });

    // 0.8 * 1 = 0.8 → 80
    expect(withoutImage).toBe(80);
    expect(withNullImage).toBe(80);
  });

  test('combineHybridScore blends imageSimilarity when present', () => {
    const withImage = combineHybridScore({
      semanticSimilarity: 1,
      dateProximity: 0,
      retention: 0,
      imageSimilarity: 1,
    });

    // 0.6 * 1 + 0.2 * 1 = 0.8 → 80
    expect(withImage).toBe(80);

    const weakTextStrongImage = combineHybridScore({
      semanticSimilarity: 0.4,
      dateProximity: 1,
      retention: 1,
      imageSimilarity: 1,
    });
    const weakTextNoImage = combineHybridScore({
      semanticSimilarity: 0.4,
      dateProximity: 1,
      retention: 1,
    });

    expect(weakTextStrongImage).toBeGreaterThan(weakTextNoImage);
  });

  test('buildMatchCriteria includes image when similarity is high', () => {
    expect(
      buildMatchCriteria({
        semanticSimilarity: 0.9,
        dateProximity: 0.4,
        retention: 1,
        imageSimilarity: 0.75,
      })
    ).toBe('semantic,image');

    expect(
      buildMatchCriteria({
        semanticSimilarity: 0.9,
        dateProximity: 0.4,
        retention: 1,
        imageSimilarity: 0.5,
      })
    ).toBe('semantic');
  });
});

describe('embedImage request shape', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_IMAGE_EMBEDDING_MODEL;
  });

  test('posts multimodal image_url content to OpenRouter', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_IMAGE_EMBEDDING_MODEL =
      'nvidia/llama-nemotron-embed-vl-1b-v2';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { embedImage } = await import('../src/lib/matching/embeddings');
    const vector = await embedImage('https://example.com/photo.jpg');

    expect(vector).toEqual(
      expect.arrayContaining([
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
      ])
    );
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      input: Array<{
        content: Array<{ type: string; image_url: { url: string } }>;
      }>;
    };

    expect(body.model).toBe('nvidia/llama-nemotron-embed-vl-1b-v2');
    expect(body.input[0].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/photo.jpg' },
    });
  });

  test('returns null when OPENROUTER_API_KEY is unset', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { embedImage } = await import('../src/lib/matching/embeddings');
    await expect(
      embedImage('https://example.com/photo.jpg')
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('compareClaimableMatchCandidates', () => {
  test('keeps stored items ahead of expired without changing scores', async () => {
    const { compareClaimableMatchCandidates } =
      await import('../src/lib/matching/matching');

    const candidates = [
      { status: ItemStatus.expired, score: 95 },
      { status: ItemStatus.stored, score: 70 },
      { status: ItemStatus.expired, score: 80 },
      { status: ItemStatus.stored, score: 90 },
    ];

    const sorted = [...candidates].sort(compareClaimableMatchCandidates);

    expect(sorted).toEqual([
      { status: ItemStatus.stored, score: 90 },
      { status: ItemStatus.stored, score: 70 },
      { status: ItemStatus.expired, score: 95 },
      { status: ItemStatus.expired, score: 80 },
    ]);
  });
});
