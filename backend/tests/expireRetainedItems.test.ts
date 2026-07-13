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
      updateMany: vi.fn(),
    },
    claim: {
      findMany: vi.fn().mockResolvedValue([
        {
          claimId: '550e8400-e29b-41d4-a716-446655440000',
          studentId: 'student-1',
          itemName: 'iPhone 15',
        },
      ]),
      updateMany: vi.fn(),
    },
    matchSuggestion: {
      updateMany: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([{ userId: 'security-1' }]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ logId: 'log-1' }),
    },
  };
}

describe('expireDueItems notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('notifies auto-rejected students and campus security', async () => {
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
          recipientId: 'student-1',
          type: 'claim_status_update',
          message: 'Your claim for "iPhone 15" is now rejected.',
        }),
      ],
    });
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
  });

  test('creates nothing when no items are due', async () => {
    (prisma.item.findMany as Mock).mockResolvedValue([]);

    const count = await expireDueItems();

    expect(count).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
