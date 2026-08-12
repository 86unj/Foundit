import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import { ClaimStatus, MatchStatus, NotificationType } from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLog, writeAuditLogs } from '../utils/auditLog';
import { createClaimStatusUpdateInput } from '../lib/notifications';

/** Days after submit before an unmatched open claim is auto-rejected. */
export const OPEN_CLAIM_EXPIRY_DAYS = 35;

const AUTO_EXPIRE_REJECTION_REASON =
  'Claim expired after 35 days with no confirmed match.';

const OPEN_CLAIM_STATUSES = [
  ClaimStatus.submitted,
  ClaimStatus.under_review,
] as const;

function getOpenClaimExpiryCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - OPEN_CLAIM_EXPIRY_DAYS);
  return cutoff;
}

/**
 * Auto-rejects open claims (`submitted` / `under_review`) that are still
 * unmatched after the open-claim window. Does not touch approved, picked_up,
 * or already-rejected claims.
 */
export async function expireOpenClaims(now = new Date()): Promise<number> {
  const cutoff = getOpenClaimExpiryCutoff(now);
  const runId = randomUUID();

  const candidates = await prisma.claim.findMany({
    where: {
      status: { in: [...OPEN_CLAIM_STATUSES] },
      createdAt: { lte: cutoff },
    },
    select: {
      claimId: true,
      studentId: true,
      itemName: true,
      itemId: true,
      status: true,
    },
  });

  if (candidates.length === 0) {
    return 0;
  }

  const candidateClaimIds = candidates.map((claim) => claim.claimId);

  return prisma.$transaction(async (tx) => {
    const eligibleClaims = await tx.claim.findMany({
      where: {
        claimId: { in: candidateClaimIds },
        status: { in: [...OPEN_CLAIM_STATUSES] },
        createdAt: { lte: cutoff },
      },
      select: {
        claimId: true,
        studentId: true,
        itemName: true,
        itemId: true,
        status: true,
      },
    });

    if (eligibleClaims.length === 0) {
      return 0;
    }

    const expiredClaims: typeof eligibleClaims = [];

    for (const claim of eligibleClaims) {
      const rejectResult = await tx.claim.updateMany({
        where: {
          claimId: claim.claimId,
          status: { in: [...OPEN_CLAIM_STATUSES] },
          createdAt: { lte: cutoff },
        },
        data: {
          status: ClaimStatus.rejected,
          rejectionReason: AUTO_EXPIRE_REJECTION_REASON,
          reviewedAt: new Date(),
          reviewedBy: null,
        },
      });

      if (rejectResult.count === 0) {
        continue;
      }

      expiredClaims.push(claim);

      await tx.matchSuggestion.updateMany({
        where: {
          claimId: claim.claimId,
          status: MatchStatus.suggested,
        },
        data: { status: MatchStatus.dismissed },
      });
    }

    if (expiredClaims.length === 0) {
      return 0;
    }

    await tx.notification.createMany({
      data: expiredClaims.map((claim) =>
        createClaimStatusUpdateInput(claim, 'rejected', {
          reason: AUTO_EXPIRE_REJECTION_REASON,
        })
      ),
    });

    await writeAuditLog(
      {
        actorType: 'system',
        action: 'notification_fanout_created',
        entityType: 'notification',
        entityId: null,
        outcome: 'success',
        runId,
        details: {
          recipientCount: expiredClaims.length,
          sourceEntityType: 'claim',
          notificationType: NotificationType.claim_status_update,
        },
      },
      tx
    );

    await writeAuditLogs(
      expiredClaims.map((claim) => ({
        actorType: 'system',
        action: 'claim_status_updated',
        entityType: 'claim',
        entityId: claim.claimId,
        outcome: 'success',
        reasonCode: 'claim_open_expired',
        runId,
        entityLabel: claim.itemName ?? undefined,
        details: {
          previousStatus: claim.status,
          nextStatus: ClaimStatus.rejected,
          itemId: claim.itemId,
          reasonCategory: 'open_claim_expired',
        },
      })),
      tx
    );

    return expiredClaims.length;
  });
}

export function startExpireOpenClaimsJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const count = await expireOpenClaims();
      console.log(`Auto-expired ${count} open claim${count === 1 ? '' : 's'}`);
    } catch (error) {
      console.error('Failed to auto-expire open claims', error);
    }
  });
}
