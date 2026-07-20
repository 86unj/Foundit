export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftMagnitude += left[i] * left[i];
    rightMagnitude += right[i] * right[i];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function daysBetween(left: Date, right: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs(Math.round((left.getTime() - right.getTime()) / msPerDay));
}

export function dateProximityScore(
  dateLost: Date | null,
  dateFound: Date
): { score: number; valid: boolean } {
  if (!dateLost) {
    return { score: 0.5, valid: true };
  }

  if (dateFound < dateLost) {
    return { score: 0, valid: false };
  }

  const diff = daysBetween(dateLost, dateFound);
  if (diff <= 7) return { score: 1, valid: true };
  if (diff <= 30) return { score: 0.7, valid: true };
  if (diff <= 90) return { score: 0.4, valid: true };
  return { score: 0.1, valid: true };
}

export function retentionUrgencyScore(
  retentionExpiryDate: Date | null,
  today: Date
): number {
  if (!retentionExpiryDate) {
    return 1;
  }

  const daysLeft = Math.ceil(
    (retentionExpiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft <= 7) {
    return 0.7;
  }

  return 1;
}

export interface HybridScoreInput {
  semanticSimilarity: number;
  dateProximity: number;
  retention: number;
}

export function combineHybridScore(input: HybridScoreInput): number {
  const weighted =
    0.8 * input.semanticSimilarity +
    0.15 * input.dateProximity +
    0.05 * input.retention;

  return Math.round(Math.max(0, Math.min(1, weighted)) * 100);
}

export function buildMatchCriteria(input: HybridScoreInput): string {
  const criteria: string[] = ['semantic'];

  if (input.dateProximity >= 0.7) criteria.push('date');
  if (input.retention < 1) criteria.push('retention');

  return criteria.join(',');
}
