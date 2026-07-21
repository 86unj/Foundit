import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import photoSessionsRouter from '../src/routes/photoSessions';

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
  default: vi.fn((role: string) => (req, res, next) => {
    if (req.user?.role !== role) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  }),
}));

vi.mock('../src/lib/r2', () => ({
  r2: {},
  R2_BUCKET: 'test-bucket',
}));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn().mockImplementation(function (
    this: { input: unknown },
    input
  ) {
    this.input = input;
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock('../src/utils/reportLinkToken', () => ({
  generateReportLinkToken: vi.fn(),
}));

vi.mock('../src/utils/imageUrl', () => ({
  resolveImageUrl: vi.fn(async (url: string) => `signed-${url}`),
}));

vi.mock('../src/utils/auditLog', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogBestEffort: vi.fn(),
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
}));

vi.mock('../src/db', () => ({
  prisma: {
    photoUploadSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    photoSessionImage: {
      count: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateReportLinkToken } from '../src/utils/reportLinkToken';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/photo-sessions', photoSessionsRouter);
  return app;
}

const token = 'abc123token';
const sessionId = 'session-1';

const photoSession = {
  sessionId,
  token,
  createdBy: 'security-1',
  expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  createdAt: new Date(),
};

const photoImage = {
  imageId: 'image-1',
  sessionId,
  imageUrl: 'reports/550e8400-e29b-41d4-a716-446655440000.png',
  fileType: 'png',
  fileSizeKb: 500,
  createdAt: new Date('2026-07-06T05:00:00Z'),
};

describe('photoSessions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'security-1', role: 'security' };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    );
  });

  test('POST /api/photo-sessions returns 401 if not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).post('/api/photo-sessions').send({
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('POST /api/photo-sessions returns 403 if user is not security', async () => {
    mocks.authUser = { user_id: 'student-1', role: 'student' };

    const app = createTestApp();

    const res = await request(app).post('/api/photo-sessions').send({
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('POST /api/photo-sessions creates a photo session', async () => {
    vi.mocked(generateReportLinkToken).mockReturnValueOnce(token);

    vi.mocked(prisma.photoUploadSession.create).mockResolvedValueOnce({
      ...photoSession,
      expiresAt: new Date('2026-07-06T06:00:00Z'),
    });

    const app = createTestApp();

    const res = await request(app).post('/api/photo-sessions').send({
      expiresInMinutes: 30,
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe(token);
    expect(res.body.expiresAt).toBe('2026-07-06T06:00:00.000Z');
  });

  test('GET /api/photo-sessions/:token/validate returns available session', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      _count: {
        images: 0,
      },
    });

    const app = createTestApp();

    const res = await request(app).get(`/api/photo-sessions/${token}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.reason).toBe('available');
    expect(res.body.maxImages).toBe(3);
  });

  test('GET /api/photo-sessions/:token/validate returns not_found', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get(`/api/photo-sessions/${token}/validate`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toBe('not_found');
  });

  test('POST /api/photo-sessions/:token/presigned-url returns 404 if session is missing', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/photo-sessions/${token}/presigned-url`)
      .send({
        fileName: 'test-image.png',
        contentType: 'image/png',
        fileSizeKb: 500,
        fileSizeBytes: 512000,
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PHOTO_SESSION_NOT_FOUND');
  });

  test('POST /api/photo-sessions/:token/presigned-url returns upload data', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      _count: {
        images: 0,
      },
    });

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) => {
      return callback({
        photoSessionImage: {
          count: vi.fn().mockResolvedValueOnce(0),
          create: vi.fn().mockResolvedValueOnce(photoImage),
        },
      });
    });

    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      'https://fake-upload-url.com'
    );

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/photo-sessions/${token}/presigned-url`)
      .send({
        fileName: 'test-image.png',
        contentType: 'image/png',
        fileSizeKb: 500,
        fileSizeBytes: 512000,
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://fake-upload-url.com');
    expect(res.body.imageUrl).toBe(
      'reports/550e8400-e29b-41d4-a716-446655440000.png'
    );
    expect(res.body.fileType).toBe('png');
    expect(res.body.fileSizeKb).toBe(500);
  });

  test('POST /api/photo-sessions/:token/images returns 404 if pending image is missing', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      _count: {
        images: 1,
      },
    });

    vi.mocked(prisma.photoSessionImage.findFirst).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/photo-sessions/${token}/images`)
      .send({
        imageUrl: 'reports/550e8400-e29b-41d4-a716-446655440000.png',
        fileType: 'png',
        fileSizeKb: 500,
      });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PHOTO_SESSION_IMAGE_NOT_FOUND');
  });

  test('POST /api/photo-sessions/:token/images registers image', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      _count: {
        images: 1,
      },
    });

    vi.mocked(prisma.photoSessionImage.findFirst).mockResolvedValueOnce(
      photoImage
    );

    const app = createTestApp();

    const res = await request(app)
      .post(`/api/photo-sessions/${token}/images`)
      .send({
        imageUrl: 'reports/550e8400-e29b-41d4-a716-446655440000.png',
        fileType: 'png',
        fileSizeKb: 500,
      });

    expect(res.status).toBe(201);
    expect(res.body.imageId).toBe('image-1');
    expect(res.body.imageUrl).toBe(
      'reports/550e8400-e29b-41d4-a716-446655440000.png'
    );
  });

  test('GET /api/photo-sessions/:token/images returns 403 if session belongs to another user', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      createdBy: 'other-security',
      images: [],
    });

    const app = createTestApp();

    const res = await request(app).get(`/api/photo-sessions/${token}/images`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('GET /api/photo-sessions/:token/images returns images', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
      images: [photoImage],
    });

    const app = createTestApp();

    const res = await request(app).get(`/api/photo-sessions/${token}/images`);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].previewUrl).toBe(
      'signed-reports/550e8400-e29b-41d4-a716-446655440000.png'
    );
  });

  test('DELETE /api/photo-sessions/:token/images/:imageId returns 204', async () => {
    vi.mocked(prisma.photoUploadSession.findUnique).mockResolvedValueOnce({
      ...photoSession,
    });

    vi.mocked(prisma.photoSessionImage.deleteMany).mockResolvedValueOnce({
      count: 1,
    });

    const app = createTestApp();

    const res = await request(app).delete(
      `/api/photo-sessions/${token}/images/image-1`
    );

    expect(res.status).toBe(204);
  });
});
