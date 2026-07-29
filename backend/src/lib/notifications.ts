import { NotificationType, Prisma, UserRole } from '@prisma/client';
import { writeAuditLog } from '../utils/auditLog';

/** Short human-readable fallback when a claim has no item name. */
export function shortClaimRef(claimId: string): string {
  return `#${claimId.slice(0, 8).toUpperCase()}`;
}

/**
 * Notification input for a claim status change, addressed to the student.
 * Copy prefers the item name; the raw UUID never appears in messages.
 */
export function createClaimStatusUpdateInput(
  claim: { claimId: string; studentId: string; itemName: string | null },
  statusText: string,
  options: { reason?: string | null } = {}
) {
  const claimLabel = claim.itemName
    ? `Your claim for "${claim.itemName}"`
    : `Your claim ${shortClaimRef(claim.claimId)}`;
  const reason = options.reason?.trim();
  const reasonText = reason ? ` Reason: ${reason}` : '';

  return {
    recipientId: claim.studentId,
    type: NotificationType.claim_status_update,
    title: `Claim status updated: ${statusText}`,
    message: `${claimLabel} is now ${statusText}.${reasonText}`,
    referenceType: 'claim',
    referenceId: claim.claimId,
  } as const;
}

/**
 * Creates one notification per active security/admin user at the given
 * campus. No-op when the campus has no staff. Runs inside the caller's
 * transaction so notifications commit atomically with the triggering event.
 */
export async function fanOutToCampusSecurity(
  tx: Prisma.TransactionClient,
  campusId: string,
  input: {
    type: NotificationType;
    title: string;
    message: string;
    referenceType?: string | null;
    referenceId?: string | null;
  },
  audit?: {
    actorId?: string | null;
    actorType: 'user' | 'system';
    actorRole?: 'student' | 'security' | 'admin';
    entityLabel?: string;
    requestId?: string;
    runId?: string;
    ipAddress?: string;
  }
): Promise<number> {
  const recipients = await tx.user.findMany({
    where: {
      role: { in: [UserRole.security, UserRole.admin] },
      campusId,
      isActive: true,
    },
    select: { userId: true },
  });

  if (recipients.length === 0) {
    return 0;
  }

  await tx.notification.createMany({
    data: recipients.map(({ userId }) => ({
      recipientId: userId,
      type: input.type,
      title: input.title,
      message: input.message,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
    })),
  });

  if (audit) {
    await writeAuditLog(
      {
        ...audit,
        action: 'notification_fanout_created',
        entityType: 'notification',
        entityId: null,
        outcome: 'success',
        details: {
          recipientCount: recipients.length,
          sourceEntityType: input.referenceType ?? null,
          sourceEntityId: input.referenceId ?? null,
          notificationType: input.type,
        },
      },
      tx
    );
  }

  return recipients.length;
}
