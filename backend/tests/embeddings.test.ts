import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));

vi.mock('../src/lib/logger', () => ({
  logger: { warn: warnSpy, info: vi.fn(), error: vi.fn() },
}));

type EmbeddingsModule = typeof import('../src/lib/matching/embeddings');

/** Fresh module instance so the warn-once latch starts unset each time. */
async function loadEmbeddings(): Promise<EmbeddingsModule> {
  vi.resetModules();
  return import('../src/lib/matching/embeddings');
}

const originalApiKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  warnSpy.mockClear();
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalApiKey;
  }
  vi.restoreAllMocks();
});

describe('isSemanticMatchingDegraded', () => {
  test('reports degraded when the key is missing', async () => {
    const { isSemanticMatchingDegraded } = await loadEmbeddings();
    expect(isSemanticMatchingDegraded({})).toBe(true);
  });

  test('reports degraded when the key is blank or whitespace', async () => {
    const { isSemanticMatchingDegraded } = await loadEmbeddings();
    expect(isSemanticMatchingDegraded({ OPENROUTER_API_KEY: '' })).toBe(true);
    expect(isSemanticMatchingDegraded({ OPENROUTER_API_KEY: '   ' })).toBe(
      true
    );
  });

  test('reports healthy when the key is set', async () => {
    const { isSemanticMatchingDegraded } = await loadEmbeddings();
    expect(isSemanticMatchingDegraded({ OPENROUTER_API_KEY: 'sk-test' })).toBe(
      false
    );
  });

  test('defaults to reading process.env', async () => {
    const { isSemanticMatchingDegraded } = await loadEmbeddings();
    expect(isSemanticMatchingDegraded()).toBe(true);

    process.env.OPENROUTER_API_KEY = 'sk-test';
    expect(isSemanticMatchingDegraded()).toBe(false);
  });
});

describe('warnIfSemanticMatchingDegraded', () => {
  test('warns once, not per call', async () => {
    const { warnIfSemanticMatchingDegraded } = await loadEmbeddings();

    warnIfSemanticMatchingDegraded();
    warnIfSemanticMatchingDegraded();
    warnIfSemanticMatchingDegraded();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('OPENROUTER_API_KEY');
  });

  test('stays silent when the key is configured', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
    const { warnIfSemanticMatchingDegraded } = await loadEmbeddings();

    warnIfSemanticMatchingDegraded();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('embedText fallback', () => {
  test('warns and uses the local hash embedding without any network call', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network calls are not allowed in tests'));

    const { embedText, buildLocalEmbedding, embeddingDimensions } =
      await loadEmbeddings();

    const vector = await embedText('category:bag | title:black backpack');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vector).toHaveLength(embeddingDimensions);
    expect(vector).toEqual(
      buildLocalEmbedding('category:bag | title:black backpack')
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
