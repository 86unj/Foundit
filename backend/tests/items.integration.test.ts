import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import itemsRouter from '../src/routes/items';
import { ItemStatus } from '@prisma/client';
import { auditSummaries } from '../src/utils/auditSummaries';

const mocks = vi.hoisted(() => ({
  authUser: { user_id: 'security-1', role: 'security' } as {
    user_id: string;
    role: string;
  } | null,
}));

vi.mock('../src/middleware/authenticate', () => ({
  default: vi.fn((req, res, next) => {
    if (!mocks.authUser) {
      res.status(401).json({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
      return;
    }

    req.user = mocks.authUser;
    next();
  }),
}));

vi.mock('../src/utils/imageUrl', () => ({
  resolveImageUrl: vi.fn(async (url: string) => url),
}));

vi.mock('../src/utils/auditLog', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogs: vi.fn(),
  writeAuditLogBestEffort: vi.fn(),
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
}));

vi.mock('../src/lib/matching/ingest', () => ({
  scheduleItemSearchIndexIngest: vi.fn(),
}));

vi.mock('../src/lib/matching/suggestions', () => ({
  scheduleMatchRefreshForCampus: vi.fn(),
}));

vi.mock('../src/db', () => ({
  prisma: {
    item: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
    },
    campus: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';
import {
  writeAuditLog,
  writeAuditLogs,
  writeAuditLogBestEffort,
} from '../src/utils/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', itemsRouter);
  return app;
}

const itemId = '550e8400-e29b-41d4-a716-446655440000';
const campusId = '550e8400-e29b-41d4-a716-446655440001';

const itemListRow = {
  itemId,
  campusId,
  category: 'Electronics',
  title: 'iPhone',
  descriptionPublic: 'Black iPhone',
  descriptionInternal: null,
  color: 'Black',
  brand: 'Apple',
  locationFound: 'Library',
  dateFound: new Date('2026-07-01'),
  status: ItemStatus.stored,
  foundItemReportId: null,
  registeredBy: 'security-1',
  retentionExpiryDate: new Date('2026-07-31'),
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  campus: {
    campusId,
    campusName: 'Newnham',
    address: null,
    retentionDays: 30,
  },
  images: [],
};

const itemDetailRow = {
  ...itemListRow,
  descriptionPublic: 'Black iPhone found near library',
  descriptionInternal: 'Has cracked case',
  color: 'Black',
  brand: 'Apple',
  locationFound: 'Library',
  foundItemReportId: null,
  registeredBy: 'security-1',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  registrar: {
    userId: 'security-1',
    firstName: 'Security',
    lastName: 'User',
  },
  claims: [],
  foundItemReport: null,
};

describe('items routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'security-1', role: 'security' };
  });

  test('GET /api/public/items returns public stored items', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([itemListRow]);

    const app = createTestApp();

    const res = await request(app).get('/api/public/items');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('iPhone');

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: [ItemStatus.stored] },
        },
      })
    );
  });

  test('GET /api/items/category-stats returns public category counts', async () => {
    vi.mocked(prisma.item.groupBy).mockResolvedValueOnce([
      {
        category: 'Electronics',
        _count: {
          category: 2,
        },
      },
    ] as never);

    const app = createTestApp();

    const res = await request(app).get('/api/items/category-stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        category: 'Electronics',
        count: 2,
      },
    ]);
  });

  test('GET /api/items returns 401 if user is not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).get('/api/items');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('GET /api/items returns security item list', async () => {
    vi.mocked(prisma.item.findMany).mockResolvedValueOnce([itemListRow]);

    const app = createTestApp();

    const res = await request(app).get('/api/items');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].itemId).toBe(itemId);
    expect(res.body.data[0].title).toBe('iPhone');
    expect(res.body.nextCursor).toBe(null);
  });

  test('GET /api/items/:itemId returns 404 if item does not exist', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get(`/api/items/${itemId}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ITEM_NOT_FOUND');
  });

  test('GET /api/items/:itemId returns item detail', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(itemDetailRow);

    const app = createTestApp();

    const res = await request(app).get(`/api/items/${itemId}`);

    expect(res.status).toBe(200);
    expect(res.body.itemId).toBe(itemId);
    expect(res.body.title).toBe('iPhone');
    expect(res.body.campusName).toBe('Newnham');
    expect(res.body.registeredBy.userId).toBe('security-1');
  });

  test('POST /api/items creates the item and required audit in one transaction', async () => {
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce({
      campusId,
      retentionDays: 30,
    });
    const tx = {
      item: { create: vi.fn().mockResolvedValue({ itemId }) },
      itemImage: { createMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(itemDetailRow);

    const res = await request(createTestApp()).post('/api/items').send({
      campusId,
      title: 'iPhone',
      description: 'Black iPhone',
      category: 'Electronics',
      locationFound: 'Library',
      dateFound: '2026-07-01',
      images: [],
    });

    expect(res.status).toBe(201);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'security-1',
        actorRole: 'security',
        action: 'item_created',
        entityId: itemId,
        entityLabel: 'iPhone (Electronics)',
        outcome: 'success',
        requestId: '11111111-1111-4111-8111-111111111111',
        details: expect.objectContaining({
          imageCount: 0,
          source: 'security_direct_intake',
        }),
      }),
      tx
    );
  });

  test('PATCH /api/items/:itemId audits only changed field names', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
      itemId,
      campusId,
      dateFound: new Date('2026-07-01'),
    });
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce({
      retentionDays: 30,
    });
    const tx = {
      item: { update: vi.fn().mockResolvedValue(itemDetailRow) },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    const res = await request(createTestApp())
      .patch(`/api/items/${itemId}`)
      .send({
        title: 'Updated iPhone',
        category: 'Electronics',
        dateFound: '2026-07-01',
        locationFound: 'Library',
        descriptionInternal: 'Private description',
      });

    expect(res.status).toBe(200);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'item_updated',
        entityId: itemId,
        actorRole: 'security',
        entityLabel: 'iPhone (Electronics)',
        details: {
          changedFields: [
            'title',
            'category',
            'dateFound',
            'locationFound',
            'descriptionInternal',
          ],
        },
      }),
      tx
    );
    expect(JSON.stringify(vi.mocked(writeAuditLog).mock.calls)).not.toContain(
      'Private description'
    );

    // The generated summary should name the changed fields, not restate the
    // full record (e.g. the private description text must never appear).
    const call = vi.mocked(writeAuditLog).mock.calls[0][0];
    const summary = auditSummaries.item_updated({
      actorType: 'user',
      actorRole: call.actorRole,
      entityLabel: call.entityLabel,
      outcome: 'success',
      reasonCode: null,
      details: call.details as Record<string, unknown>,
    });
    expect(summary).toContain(
      'title, category, dateFound, locationFound, descriptionInternal'
    );
    expect(summary).not.toContain('Private description');
  });

  test('PATCH /api/items/:itemId/status audits item and affected claims together', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
      itemId,
      status: ItemStatus.stored,
      retentionExpiryDate: new Date('2026-07-31'),
    });
    const tx = {
      claim: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([
          {
            claimId: '550e8400-e29b-41d4-a716-446655440099',
            status: 'submitted',
          },
        ]),
        updateMany: vi.fn(),
      },
      item: {
        update: vi.fn().mockResolvedValue({
          ...itemDetailRow,
          status: ItemStatus.expired,
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    const res = await request(createTestApp())
      .patch(`/api/items/${itemId}/status`)
      .send({ status: 'expired' });

    expect(res.status).toBe(200);
    expect(writeAuditLogs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'item_status_updated',
          entityId: itemId,
          requestId: '11111111-1111-4111-8111-111111111111',
        }),
        expect.objectContaining({
          action: 'claim_status_updated',
          entityId: '550e8400-e29b-41d4-a716-446655440099',
          requestId: '11111111-1111-4111-8111-111111111111',
        }),
      ]),
      tx
    );
  });

  test('PATCH /api/items/:itemId/status audits invalid transitions without mutation', async () => {
    vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({
      itemId,
      status: ItemStatus.claimed,
      retentionExpiryDate: new Date('2026-07-31'),
    });

    const res = await request(createTestApp())
      .patch(`/api/items/${itemId}/status`)
      .send({ status: 'disposed' });

    expect(res.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'item_status_denied',
        entityId: itemId,
        outcome: 'denied',
        reasonCode: 'invalid_status_transition',
      })
    );
  });
});
