import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../src/db', () => ({
  prisma: { $transaction: vi.fn() },
}));
vi.mock('../src/utils/auditLog', () => ({ writeAuditLogs: vi.fn() }));

import { prisma } from '../src/db';
import { writeAuditLogs } from '../src/utils/auditLog';
import { cleanupUnverifiedUsers } from '../src/jobs/cleanupUnverifiedUsers';

describe('cleanupUnverifiedUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  test('audits each target before deleting the same ids', async () => {
    const tx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]),
      user: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    await expect(cleanupUnverifiedUsers()).resolves.toBe(2);
    expect(writeAuditLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          actorType: 'system',
          action: 'unverified_user_deleted',
          entityId: 'user-1',
          runId: expect.any(String),
        }),
        expect.objectContaining({ entityId: 'user-2' }),
      ]),
      tx
    );
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['user-1', 'user-2'] },
        isEmailVerified: false,
        emailVerifyTokenExpiresAt: { lt: expect.any(Date) },
      },
    });
  });

  test('rejects the transaction when the required audit fails', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ userId: 'user-1' }]),
      user: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );
    vi.mocked(writeAuditLogs).mockRejectedValueOnce(new Error('audit failed'));

    await expect(cleanupUnverifiedUsers()).rejects.toThrow('audit failed');
    expect(tx.user.deleteMany).toHaveBeenCalledOnce();
  });
});
