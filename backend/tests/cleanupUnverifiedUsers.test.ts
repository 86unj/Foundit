import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../src/db', () => ({
  prisma: { $transaction: vi.fn() },
}));

import { prisma } from '../src/db';
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
      auditLog: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    await expect(cleanupUnverifiedUsers()).resolves.toBe(2);
    expect(tx.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          actorType: 'system',
          action: 'unverified_user_deleted',
          entityId: 'user-1',
          runId: expect.any(String),
        }),
        expect.objectContaining({ entityId: 'user-2' }),
      ]),
    });
    const auditRows = tx.auditLog.createMany.mock.calls[0][0].data;
    console.error('DEBUG auditRows', JSON.stringify(auditRows, null, 2));
    expect(
      auditRows.every(
        (row: { details?: Record<string, unknown> }) =>
          typeof row.details?.summary === 'string' &&
          row.details.summary.length > 0
      )
    ).toBe(true);
    expect(
      auditRows.every(
        (row: { actorRole?: unknown; details?: Record<string, unknown> }) =>
          !('actorRole' in row) && !('actorRole' in (row.details ?? {}))
      )
    ).toBe(true);
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
      auditLog: {
        createMany: vi.fn().mockRejectedValueOnce(new Error('audit failed')),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    await expect(cleanupUnverifiedUsers()).rejects.toThrow('audit failed');
    expect(tx.user.deleteMany).toHaveBeenCalledOnce();
  });
});
