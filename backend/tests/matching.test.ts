import { describe, expect, test } from 'vitest';
import {
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

  test('dateProximityScore rejects impossible found-before-lost dates', () => {
    const result = dateProximityScore(
      new Date('2026-07-10T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z')
    );
    expect(result).toEqual({ score: 0, valid: false });
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
});
