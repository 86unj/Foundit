import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TokenExpiredError } from 'jsonwebtoken';
import authRouter from '../src/routes/auth';

vi.mock('../src/lib/email', () => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock('../src/utils/username', () => ({
  generateUniqueUsername: vi.fn(),
}));

vi.mock('../src/utils/emailVerification', () => ({
  generateVerifyToken: vi.fn(),
  getVerifyTokenExpiry: vi.fn(),
}));

vi.mock('../src/utils/password', () => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('../src/utils/token', () => ({
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  hashTokenForStorage: vi.fn(),
  verifyRefreshToken: vi.fn(),
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
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    refreshTokenLog: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';
import { sendVerificationEmail } from '../src/lib/email';
import { generateUniqueUsername } from '../src/utils/username';
import {
  generateVerifyToken,
  getVerifyTokenExpiry,
} from '../src/utils/emailVerification';
import { hashPassword } from '../src/utils/password';
import {
  hashTokenForStorage,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../src/utils/token';
import { writeAuditLog, writeAuditLogBestEffort } from '../src/utils/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const userRow = {
  userId: 'user-1',
  email: 'student@myseneca.ca',
  username: 'caseyhsu123',
  role: 'student',
  firstName: 'Casey',
  lastName: 'Hsu',
  campusId: null,
  isActive: true,
  emailVerifyTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

describe('auth extra routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRONTEND_URL = 'http://localhost:3000';
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    );
  });

  test('POST /api/auth/register returns 409 if email already exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      userId: 'user-1',
    });

    const app = createTestApp();

    const res = await request(app).post('/api/auth/register').send({
      email: 'student@myseneca.ca',
      password: 'Password123',
      firstName: 'Casey',
      lastName: 'Hsu',
      agreedToLegal: true,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  test('POST /api/auth/register creates user and sends verification email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(hashPassword).mockResolvedValueOnce('hashed-password');
    vi.mocked(generateUniqueUsername).mockResolvedValueOnce('caseyhsu123');
    vi.mocked(generateVerifyToken).mockReturnValueOnce('verify-token');
    vi.mocked(hashTokenForStorage).mockReturnValueOnce('verify-token-hash');
    vi.mocked(getVerifyTokenExpiry).mockReturnValueOnce(
      new Date('2026-07-06T08:00:00Z')
    );
    vi.mocked(prisma.user.create).mockResolvedValueOnce(userRow);
    vi.mocked(sendVerificationEmail).mockResolvedValueOnce(undefined);

    const app = createTestApp();

    const res = await request(app).post('/api/auth/register').send({
      email: 'student@myseneca.ca',
      password: 'Password123',
      firstName: 'Casey',
      lastName: 'Hsu',
      agreedToLegal: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('student@myseneca.ca');
    expect(res.body.user.username).toBe('caseyhsu123');
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      'student@myseneca.ca',
      'verify-token'
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'anonymous',
        action: 'user_registered',
        entityId: 'user-1',
        outcome: 'success',
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
      prisma
    );
    expect(JSON.stringify(vi.mocked(writeAuditLog).mock.calls)).not.toContain(
      'verify-token'
    );
  });

  test('POST /api/auth/register compensates atomically when email delivery fails', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(hashPassword).mockResolvedValueOnce('hashed-password');
    vi.mocked(generateUniqueUsername).mockResolvedValueOnce('caseyhsu123');
    vi.mocked(generateVerifyToken).mockReturnValueOnce('verify-token');
    vi.mocked(hashTokenForStorage).mockReturnValueOnce('verify-token-hash');
    vi.mocked(getVerifyTokenExpiry).mockReturnValueOnce(
      new Date('2026-07-06T08:00:00Z')
    );
    vi.mocked(prisma.user.create).mockResolvedValueOnce(userRow);
    vi.mocked(sendVerificationEmail).mockRejectedValueOnce(
      new Error('smtp unavailable')
    );

    const res = await request(createTestApp()).post('/api/auth/register').send({
      email: 'student@myseneca.ca',
      password: 'Password123',
      firstName: 'Casey',
      lastName: 'Hsu',
      agreedToLegal: true,
    });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('EMAIL_SEND_FAILED');
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_registration_rolled_back',
        entityId: 'user-1',
        outcome: 'failure',
        reasonCode: 'email_delivery_failed',
      }),
      prisma
    );
  });

  test('GET /api/auth/verify-email returns 400 if token is missing', async () => {
    const app = createTestApp();

    const res = await request(app).get('/api/auth/verify-email');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_TOKEN');
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email_verification_denied',
        entityId: null,
        reasonCode: 'missing_token',
      })
    );
  });

  test('GET /api/auth/verify-email returns 400 if token is invalid', async () => {
    vi.mocked(hashTokenForStorage).mockReturnValueOnce('token-hash');
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get('/api/auth/verify-email?token=abc');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email_verification_denied',
        reasonCode: 'invalid_token',
      })
    );
  });

  test('GET /api/auth/verify-email redirects after successful verification', async () => {
    vi.mocked(hashTokenForStorage).mockReturnValueOnce('token-hash');
    vi.mocked(prisma.user.findFirst).mockResolvedValueOnce(userRow);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      ...userRow,
      isEmailVerified: true,
    });

    const app = createTestApp();

    const res = await request(app).get('/api/auth/verify-email?token=abc');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/email-verified');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'email_verification_succeeded',
        entityId: 'user-1',
        outcome: 'success',
      }),
      prisma
    );
  });

  test('POST /api/auth/refresh returns 401 if refresh token is expired', async () => {
    vi.mocked(verifyRefreshToken).mockImplementationOnce(() => {
      throw new TokenExpiredError('expired', new Date());
    });

    const app = createTestApp();

    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: 'old-refresh-token',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_EXPIRED');
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refresh_token_denied',
        reasonCode: 'expired_token',
      })
    );
  });

  test('POST /api/auth/refresh returns 401 if refresh token log is missing', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValueOnce({ userId: 'user-1' });
    vi.mocked(hashTokenForStorage).mockReturnValueOnce('old-token-hash');
    vi.mocked(prisma.refreshTokenLog.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: 'old-refresh-token',
    });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'refresh_token_denied',
        reasonCode: 'missing_log',
      })
    );
  });

  test('POST /api/auth/refresh returns new access and refresh token', async () => {
    vi.mocked(verifyRefreshToken).mockReturnValueOnce({ userId: 'user-1' });
    vi.mocked(hashTokenForStorage)
      .mockReturnValueOnce('old-token-hash')
      .mockReturnValueOnce('new-token-hash');

    vi.mocked(prisma.refreshTokenLog.findUnique).mockResolvedValueOnce({
      logId: 'log-1',
      userId: 'user-1',
      tokenHash: 'old-token-hash',
      revoked: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);
    vi.mocked(signAccessToken).mockReturnValueOnce('new-access-token');
    vi.mocked(signRefreshToken).mockReturnValueOnce('new-refresh-token');
    const app = createTestApp();

    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: 'old-refresh-token',
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('new-access-token');
    expect(res.body.refreshToken).toBe('new-refresh-token');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: 'refresh_token_rotated',
        entityId: 'user-1',
        outcome: 'success',
        requestId: '11111111-1111-4111-8111-111111111111',
      }),
      prisma
    );
    expect(JSON.stringify(vi.mocked(writeAuditLog).mock.calls)).not.toContain(
      'old-refresh-token'
    );
  });

  test('POST /api/auth/logout returns 501', async () => {
    const app = createTestApp();

    const res = await request(app).post('/api/auth/logout').send({
      refreshToken: 'refresh-token',
    });

    expect(res.status).toBe(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
  });
});
