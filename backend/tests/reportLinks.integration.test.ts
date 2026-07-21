import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import reportLinksRouter from '../src/routes/reportLinks';

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

vi.mock('../src/middleware/requireRole', () => ({
  default: vi.fn((...roles: string[]) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  }),
}));

vi.mock('../src/utils/reportLinkToken', () => ({
  generateReportLinkToken: vi.fn(),
}));

vi.mock('../src/utils/auditLog', () => ({
  writeAuditLog: vi.fn(),
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
}));

vi.mock('../src/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    campus: {
      findUnique: vi.fn(),
    },
    reportLink: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';
import { generateReportLinkToken } from '../src/utils/reportLinkToken';
import { writeAuditLog } from '../src/utils/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/report-links', reportLinksRouter);
  return app;
}

const campusId = '550e8400-e29b-41d4-a716-446655440000';
const token = 'abc123token';

const activeSecurity = {
  userId: 'security-1',
  role: 'security',
  campusId,
  isActive: true,
};

const activeStudent = {
  userId: 'student-1',
  campusId,
  isActive: true,
};

describe('report links routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'security-1', role: 'security' };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    );
  });

  test('POST /api/report-links returns 401 if not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).post('/api/report-links').send({
      campusId,
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('POST /api/report-links returns 403 if user is student', async () => {
    mocks.authUser = { user_id: 'student-1', role: 'student' };

    const app = createTestApp();

    const res = await request(app).post('/api/report-links').send({
      campusId,
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('POST /api/report-links returns 404 if campus does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).post('/api/report-links').send({
      campusId,
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CAMPUS_NOT_FOUND');
  });

  test('POST /api/report-links creates report link', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce({ campusId });
    vi.mocked(generateReportLinkToken).mockReturnValueOnce(token);
    vi.mocked(prisma.reportLink.create).mockResolvedValueOnce({
      linkId: 'link-1',
      token,
      campusId,
      expiresAt: new Date('2026-07-06T07:00:00Z'),
      createdAt: new Date('2026-07-06T06:30:00Z'),
    });

    const app = createTestApp();

    const res = await request(app).post('/api/report-links').send({
      campusId,
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(201);
    expect(res.body.linkId).toBe('link-1');
    expect(res.body.token).toBe(token);
    expect(res.body.reportUrl).toContain(`/report-found/${token}`);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'security-1',
        action: 'report_link_created',
        entityType: 'report_link',
      }),
      prisma
    );
  });

  test('GET /api/report-links/:token/validate returns not_found', async () => {
    vi.mocked(prisma.reportLink.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get(`/api/report-links/${token}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toBe('not_found');
    expect(res.body.campusId).toBe(null);
  });

  test('GET /api/report-links/:token/validate returns available', async () => {
    vi.mocked(prisma.reportLink.findUnique).mockResolvedValueOnce({
      linkId: 'link-1',
      campusId,
      generatedBy: 'security-1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isUsed: false,
      usedAt: null,
      generator: {
        firstName: 'Casey',
        lastName: 'Hsu',
      },
    });

    const app = createTestApp();

    const res = await request(app).get(`/api/report-links/${token}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.reason).toBe('available');
    expect(res.body.campusId).toBe(campusId);
    expect(res.body.registrant).toEqual({
      firstName: 'Casey',
      lastName: 'Hsu',
    });
  });

  test('POST /api/report-links/:token/submit returns 403 if user is not student', async () => {
    mocks.authUser = { user_id: 'security-1', role: 'security' };

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/report-links/${token}/submit`)
      .send({
        title: 'iPhone',
        description: 'Black iPhone',
        category: 'Electronics',
        locationFound: 'Library',
        dateFound: '2026-07-01',
        images: [],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('POST /api/report-links/:token/submit returns 404 if report link does not exist', async () => {
    mocks.authUser = { user_id: 'student-1', role: 'student' };

    vi.mocked(prisma.reportLink.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/report-links/${token}/submit`)
      .send({
        title: 'iPhone',
        description: 'Black iPhone',
        category: 'Electronics',
        locationFound: 'Library',
        dateFound: '2026-07-01',
        images: [],
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REPORT_LINK_NOT_FOUND');
  });

  test('POST /api/report-links/:token/submit returns 409 if report link is used', async () => {
    mocks.authUser = { user_id: 'student-1', role: 'student' };

    vi.mocked(prisma.reportLink.findUnique).mockResolvedValueOnce({
      linkId: 'link-1',
      campusId,
      generatedBy: 'security-1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isUsed: true,
      usedAt: new Date(),
      generator: {
        firstName: 'Casey',
        lastName: 'Hsu',
      },
    });

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/report-links/${token}/submit`)
      .send({
        title: 'iPhone',
        description: 'Black iPhone',
        category: 'Electronics',
        locationFound: 'Library',
        dateFound: '2026-07-01',
        images: [],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REPORT_LINK_USED');
  });

  test('POST /api/report-links/:token/submit creates report and item', async () => {
    mocks.authUser = { user_id: 'student-1', role: 'student' };

    vi.mocked(prisma.reportLink.findUnique).mockResolvedValueOnce({
      linkId: 'link-1',
      campusId,
      generatedBy: 'security-1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      isUsed: false,
      usedAt: null,
      generator: {
        firstName: 'Casey',
        lastName: 'Hsu',
      },
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);

    const notificationCreate = vi
      .fn()
      .mockResolvedValue({ notificationId: 'notification-1' });
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
      return callback({
        campus: {
          findUnique: vi.fn().mockResolvedValueOnce({
            retentionDays: 30,
          }),
        },
        notification: {
          create: notificationCreate,
        },
        foundItemReport: {
          create: vi.fn().mockResolvedValueOnce({
            reportId: 'report-1',
          }),
          update: vi.fn().mockResolvedValueOnce({
            reportId: 'report-1',
            reportLinkId: 'link-1',
            finderId: 'student-1',
            category: 'Electronics',
            locationFound: 'Library',
            dateFound: '2026-07-01',
            timeFound: null,
            status: 'linked_to_item',
            createdAt: '2026-07-06T06:30:00.000Z',
          }),
        },
        item: {
          create: vi.fn().mockResolvedValueOnce({
            itemId: 'item-1',
          }),
        },
        itemImage: {
          createMany: vi.fn(),
        },
        reportLink: {
          updateMany: vi.fn().mockResolvedValueOnce({
            count: 1,
          }),
        },
      });
    });

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/report-links/${token}/submit`)
      .send({
        title: 'iPhone',
        description: 'Black iPhone',
        category: 'Electronics',
        locationFound: 'Library',
        dateFound: '2026-07-01',
        images: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.reportId).toBe('report-1');
    expect(res.body.itemId).toBe('item-1');
    expect(res.body.status).toBe('linked_to_item');
    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: 'student-1',
        type: 'report_confirmation',
        title: 'Report received',
        referenceType: 'item',
        referenceId: 'item-1',
      }),
    });
  });
});
