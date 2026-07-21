import cron from 'node-cron';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { writeAuditLogs } from '../utils/auditLog';

export async function cleanupUnverifiedUsers(): Promise<number> {
  const runId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
      SELECT "user_id" AS "userId"
      FROM "user"
      WHERE "is_email_verified" = false
        AND "email_verify_token_expires_at" < ${new Date()}
      FOR UPDATE
    `);

    if (users.length === 0) return 0;

    const deleted = await tx.user.deleteMany({
      where: {
        userId: { in: users.map(({ userId }) => userId) },
        isEmailVerified: false,
        emailVerifyTokenExpiresAt: { lt: new Date() },
      },
    });

    await writeAuditLogs(
      users.map((user) => ({
        actorType: 'system',
        action: 'unverified_user_deleted',
        entityType: 'user',
        entityId: user.userId,
        outcome: 'success',
        reasonCode: 'verification_expired',
        runId,
      })),
      tx
    );
    return deleted.count;
  });
}

export function startCleanupJob() {
  cron.schedule('0 0 * * *', async () => {
    try {
      const count = await cleanupUnverifiedUsers();
      console.log(`Cleaned up ${count} unverified accounts`);
    } catch (error) {
      console.error('Failed to clean up unverified accounts', error);
    }
  });
}
