import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import uploadsRouter from '../src/routes/uploads';

const mocks = vi.hoisted(() => ({
  authUser: { user_id: 'security-1' } as { user_id: string } | null,
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

vi.mock('../src/utils/auditLog', () => ({
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
  writeAuditLogBestEffort: vi.fn(),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { writeAuditLogBestEffort } from '../src/utils/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/uploads', uploadsRouter);
  return app;
}

describe('uploads routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'security-1' };
  });

  test('POST /api/uploads/presigned-url returns 401 if user is not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'phone.png',
      contentType: 'image/png',
      fileSizeKb: 500,
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('POST /api/uploads/presigned-url returns 400 if file info is missing', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'phone.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FILE_INFO');
  });

  test('POST /api/uploads/presigned-url returns 400 for unsupported file type', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'phone.gif',
      contentType: 'image/gif',
      fileSizeKb: 500,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  test('POST /api/uploads/presigned-url returns 400 if file is too large', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'phone.png',
      contentType: 'image/png',
      fileSizeKb: 6000,
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  test('POST /api/uploads/presigned-url returns presigned upload data', async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      'https://fake-upload-url.com'
    );

    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'phone.png',
      contentType: 'image/png',
      fileSizeKb: 500,
    });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBe('https://fake-upload-url.com');
    expect(res.body.imageUrl).toMatch(/^reports\/.+\.png$/);
    expect(res.body.fileType).toBe('png');
    expect(res.body.fileSizeKb).toBe(500);
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'upload_authorized',
        actorId: 'security-1',
        details: {
          contentType: 'image/png',
          sizeCategory: 'up_to_1mb',
          purpose: 'report',
        },
      })
    );
    expect(
      JSON.stringify(vi.mocked(writeAuditLogBestEffort).mock.calls)
    ).not.toContain('fake-upload-url');
    expect(
      JSON.stringify(vi.mocked(writeAuditLogBestEffort).mock.calls)
    ).not.toContain('phone.png');
  });

  test('POST /api/uploads/presigned-url keys avatar uploads under avatars/', async () => {
    vi.mocked(getSignedUrl).mockResolvedValueOnce(
      'https://fake-upload-url.com'
    );

    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'me.webp',
      contentType: 'image/webp',
      fileSizeKb: 200,
      purpose: 'avatar',
    });

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^avatars\/.+\.webp$/);
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ purpose: 'avatar' }),
      })
    );
  });

  test('POST /api/uploads/presigned-url rejects an unknown purpose', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/uploads/presigned-url').send({
      fileName: 'me.webp',
      contentType: 'image/webp',
      fileSizeKb: 200,
      purpose: 'constructor',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSUPPORTED_UPLOAD_PURPOSE');
  });
});
