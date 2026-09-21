import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import {
  ClaimStatus,
  ItemStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLogs } from '../utils/auditLog';
import { fanOutToCampusSecurity } from '../lib/notifications';

function getTodayUtcDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

export async function expireDueItems(): Promise<number> {
  const today = getTodayUtcDate();
  const runId = randomUUID();

  const candidates = await prisma.item.findMany({
    where: {
      status: ItemStatus.stored,
      retentionExpiryDate: { lte: today },
      claims: {
        none: { status: ClaimStatus.approved },
      },
    },
    select: {
      itemId: true,
      retentionExpiryDate: true,
    },
  });

  if (candidates.length === 0) {
    return 0;
  }

  const candidateItemIds = candidates.map((item) => item.itemId);

  const expiredCount = await prisma.$transaction(async (tx) => {
    const eligibleItems = await tx.item.findMany({
      where: {
        itemId: { in: candidateItemIds },
        status: ItemStatus.stored,
        retentionExpiryDate: { lte: today },
        claims: {
          none: { status: ClaimStatus.approved },
        },
      },
      select: {
        itemId: true,
        retentionExpiryDate: true,
        campusId: true,
      },
    });

    if (eligibleItems.length === 0) {
      return 0;
    }

    const expiredItems = await tx.$queryRaw<
      Array<{
        itemId: string;
        campusId: string;
        retentionExpiryDate: Date | null;
      }>
    >(
      Prisma.sql`
        UPDATE "item"
        SET
          "status" = ${ItemStatus.expired}::"item_status",
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "item_id" IN (${Prisma.join(
          eligibleItems.map((item) => Prisma.sql`${item.itemId}::uuid`)
        )})
          AND "status" = ${ItemStatus.stored}::"item_status"
          AND "retention_expiry_date" <= ${today}
          AND NOT EXISTS (
            SELECT 1
            FROM "claim"
            WHERE "claim"."item_id" = "item"."item_id"
              AND "claim"."status" = ${ClaimStatus.approved}::"claim_status"
          )
        RETURNING
          "item_id" AS "itemId",
          "campus_id" AS "campusId",
          "retention_expiry_date" AS "retentionExpiryDate"
      `
    );

    if (expiredItems.length === 0) {
      return 0;
    }

    // Expired items remain physically retained and claimable until disposed.
    // Do not dismiss match suggestions or auto-reject open claims here.

    // Notify security at each affected campus, batched per campus.
    const expiredCountByCampus = new Map<string, number>();
    for (const item of expiredItems) {
      expiredCountByCampus.set(
        item.campusId,
        (expiredCountByCampus.get(item.campusId) ?? 0) + 1
      );
    }

    for (const [campusId, count] of expiredCountByCampus) {
      await fanOutToCampusSecurity(
        tx,
        campusId,
        {
          type: NotificationType.item_expiring,
          title: 'Item retention expired',
          message: `${count} stored item${count === 1 ? '' : 's'} reached the end of retention and ${count === 1 ? 'was' : 'were'} marked expired.`,
        },
        { actorType: 'system', runId }
      );
    }

    await writeAuditLogs(
      expiredItems.map((item) => ({
        action: 'item_auto_expired',
        actorType: 'system',
        entityType: 'item',
        entityId: item.itemId,
        outcome: 'success',
        runId,
        entityLabel: `campus ${item.campusId}${
          item.retentionExpiryDate
            ? `, retention expired ${item.retentionExpiryDate.toISOString().slice(0, 10)}`
            : ''
        }`,
        details: {
          previousStatus: ItemStatus.stored,
          nextStatus: ItemStatus.expired,
          retentionExpiryDate: item.retentionExpiryDate?.toISOString() ?? null,
        },
      })),
      tx
    );

    return expiredItems.length;
  });

  return expiredCount;
}

export function startExpireRetainedItemsJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const count = await expireDueItems();
      console.log(
        `Auto-expired ${count} retained item${count === 1 ? '' : 's'}`
      );
    } catch (error) {
      console.error('Failed to auto-expire retained items', error);
    }
  });
}
