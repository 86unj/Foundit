import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import { expireDueItems } from '../src/jobs/expireRetainedItems';

vi.mock('../src/db', () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';

function createTx() {
  return {
    item: {
      findMany: vi.fn().mockResolvedValue([
        {
          itemId: 'item-1',
          retentionExpiryDate: new Date('2026-07-01'),
          campusId: 'campus-1',
        },
      ]),
    },
    notification: {
      createMany: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ userId: 'security-1' }]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ logId: 'log-1' }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      {
        itemId: 'item-1',
        campusId: 'campus-1',
        retentionExpiryDate: new Date('2026-07-01'),
      },
    ]),
  };
}

describe('expireDueItems notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('marks items expired and notifies campus security without closing claims', async () => {
    (prisma.item.findMany as Mock).mockResolvedValue([
      { itemId: 'item-1', retentionExpiryDate: new Date('2026-07-01') },
    ]);

    const tx = createTx();
    (prisma.$transaction as Mock).mockImplementation(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const count = await expireDueItems();

    expect(count).toBe(1);
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientId: 'security-1',
          type: 'item_expiring',
          title: 'Item retention expired',
          message:
            '1 stored item reached the end of retention and was marked expired.',
        }),
      ],
    });
    const auditRows = tx.auditLog.createMany.mock.calls.flatMap(
      ([input]) => input.data
    );
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'item_auto_expired',
          actorType: 'system',
          entityId: 'item-1',
          runId: expect.any(String),
          details: expect.objectContaining({
            entityLabel: expect.stringContaining('campus-1'),
          }),
        }),
      ])
    );
    expect(auditRows).not.toContainEqual(
      expect.objectContaining({
        action: 'claim_status_updated',
      })
    );
    expect(
      auditRows.every((row) => !('actorRole' in (row.details ?? {})))
    ).toBe(true);
  });

  test('creates nothing when no items are due', async () => {
    (prisma.item.findMany as Mock).mockResolvedValue([]);

    const count = await expireDueItems();

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('does not create side effects for an item that no longer expires', async () => {
    (prisma.item.findMany as Mock).mockResolvedValue([
      { itemId: 'item-1', retentionExpiryDate: new Date('2026-07-01') },
    ]);

    const tx = createTx();
    tx.$queryRaw.mockResolvedValue([]);
    (prisma.$transaction as Mock).mockImplementation(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const count = await expireDueItems();

    expect(count).toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  test('uses only successfully expired items for follow-up work', async () => {
    (prisma.item.findMany as Mock).mockResolvedValue([
      { itemId: 'item-1', retentionExpiryDate: new Date('2026-07-01') },
      { itemId: 'item-2', retentionExpiryDate: new Date('2026-07-01') },
    ]);

    const tx = createTx();
    tx.item.findMany.mockResolvedValue([
      {
        itemId: 'item-1',
        retentionExpiryDate: new Date('2026-07-01'),
        campusId: 'campus-1',
      },
      {
        itemId: 'item-2',
        retentionExpiryDate: new Date('2026-07-01'),
        campusId: 'campus-2',
      },
    ]);
    tx.$queryRaw.mockResolvedValue([
      {
        itemId: 'item-2',
        campusId: 'campus-current',
        retentionExpiryDate: new Date('2026-07-02'),
      },
    ]);
    (prisma.$transaction as Mock).mockImplementation(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const count = await expireDueItems();

    expect(count).toBe(1);
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campusId: 'campus-current' }),
      })
    );
    const auditRows = tx.auditLog.createMany.mock.calls.flatMap(
      ([input]) => input.data
    );
    expect(auditRows).toContainEqual(
      expect.objectContaining({
        action: 'item_auto_expired',
        entityId: 'item-2',
      })
    );
    expect(auditRows).not.toContainEqual(
      expect.objectContaining({
        action: 'item_auto_expired',
        entityId: 'item-1',
      })
    );
  });
});
