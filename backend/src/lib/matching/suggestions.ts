import { ClaimStatus } from '@prisma/client';
import { prisma } from '../../db';
import { generateMatchCandidates } from './matching';
import { randomUUID } from 'node:crypto';
import { writeAuditLog } from '../../utils/auditLog';

const pendingMatchStatuses = [
  ClaimStatus.submitted,
  ClaimStatus.under_review,
] as const;

export async function refreshClaimMatchSuggestions(
  claimId: string,
  audit?: {
    actorId?: string;
    actorType: 'user' | 'system';
    requestId?: string;
    runId?: string;
    ipAddress?: string;
  }
): Promise<{ candidateCount: number; suggestionCount: number }> {
  const claim = await prisma.claim.findUnique({
    where: { claimId },
    select: { claimId: true, status: true, itemId: true },
  });

  if (
    !claim ||
    claim.itemId ||
    !pendingMatchStatuses.includes(
      claim.status as (typeof pendingMatchStatuses)[number]
    )
  ) {
    return { candidateCount: 0, suggestionCount: 0 };
  }

  const { candidates: scoredCandidates, candidateCount } =
    await generateMatchCandidates(claim.claimId);

  const keepItemIds = scoredCandidates.map((candidate) => candidate.itemId);

  await prisma.$transaction(async (tx) => {
    await tx.matchSuggestion.deleteMany({
      where: {
        claimId: claim.claimId,
        ...(keepItemIds.length > 0 ? { itemId: { notIn: keepItemIds } } : {}),
      },
    });

    if (scoredCandidates.length > 0) {
      await Promise.all(
        scoredCandidates.map((candidate) =>
          tx.matchSuggestion.upsert({
            where: {
              claimId_itemId: {
                claimId: claim.claimId,
                itemId: candidate.itemId,
              },
            },
            update: {
              matchScore: candidate.score,
              matchCriteria: candidate.criteria || null,
            },
            create: {
              claimId: claim.claimId,
              itemId: candidate.itemId,
              matchScore: candidate.score,
              matchCriteria: candidate.criteria || null,
            },
          })
        )
      );

      await tx.claim.updateMany({
        where: {
          claimId: claim.claimId,
          status: ClaimStatus.submitted,
        },
        data: { status: ClaimStatus.under_review },
      });
    } else {
      // No qualifying matches — return to unmatched/submitted so the UI
      // does not stay stuck in "under review" with an empty suggestion list.
      await tx.claim.updateMany({
        where: {
          claimId: claim.claimId,
          status: ClaimStatus.under_review,
          itemId: null,
        },
        data: { status: ClaimStatus.submitted },
      });
    }

    if (audit) {
      await writeAuditLog(
        {
          ...audit,
          action: 'claim_match_suggestions_generated',
          entityType: 'claim',
          entityId: claim.claimId,
          outcome: 'success',
          details: {
            candidateCount,
            suggestionCount: scoredCandidates.length,
          },
        },
        tx
      );
    }
  });

  return {
    candidateCount,
    suggestionCount: scoredCandidates.length,
  };
}

export function scheduleMatchRefreshForCampus(campusId: string) {
  void (async () => {
    const runId = randomUUID();
    try {
      const claims = await prisma.claim.findMany({
        where: {
          itemId: null,
          status: { in: [...pendingMatchStatuses] },
        },
        select: { claimId: true },
      });

      for (const claim of claims) {
        try {
          await refreshClaimMatchSuggestions(claim.claimId, {
            actorType: 'system',
            runId,
          });
        } catch (error) {
          console.error('Failed to refresh claim match suggestions', {
            claimId: claim.claimId,
            error,
          });
        }
      }
    } catch (error) {
      console.error('Failed to schedule match refresh for pending claims', {
        campusId,
        error,
      });
    }
  })();
}
