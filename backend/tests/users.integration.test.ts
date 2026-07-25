import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import usersRouter from '../src/routes/users';
import { UserRole } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  authUser: { user_id: 'student-1', role: 'student' } as {
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

vi.mock('../src/utils/auditLog', () => ({
  writeAuditLog: vi.fn(),
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
}));

// The profile DTO resolves the stored photo key through this helper, which
// pulls in the R2 client (and its required env vars) at import time.
vi.mock('../src/utils/imageUrl', () => ({
  resolveImageUrl: vi.fn(
    async (key: string) => `https://cdn.test.local/${key}`
  ),
}));

vi.mock('../src/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../src/db';
import { writeAuditLog } from '../src/utils/auditLog';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
}

const userRow = {
  userId: 'student-1',
  campusId: 'campus-1',
  email: 'student@myseneca.ca',
  username: 'casey',
  passwordHash: 'hashed-password',
  role: UserRole.student,
  firstName: 'Casey',
  lastName: 'Hsu',
  studentNumber: BigInt(123456789),
  employeeId: null,
  phone: null,
  profilePhotoUrl: null,
  emailNotificationOptIn: true,
  isActive: true,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  isEmailVerified: true,
  emailVerifyToken: null,
  emailVerifyTokenExpiresAt: null,
  campus: {
    campusId: 'campus-1',
    campusName: 'Newnham',
    address: null,
    retentionDays: 30,
  },
};

describe('users routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'student-1', role: 'student' };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    );
  });

  test('GET /api/users/me returns 401 if user is not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('GET /api/users/me returns 404 if user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('GET /api/users/me returns 403 if account is inactive', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...userRow,
      isActive: false,
    });

    const app = createTestApp();

    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  test('GET /api/users/me returns current user profile', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);

    const app = createTestApp();

    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('student-1');
    expect(res.body.email).toBe('student@myseneca.ca');
    expect(res.body.campusName).toBe('Newnham');
    expect(res.body.studentNumber).toBe(123456789);
    expect(res.body.phone).toBeUndefined();
  });

  test('PUT /api/users/me updates profile', async () => {
    const updatedUser = {
      ...userRow,
      firstName: 'Maggie',
      lastName: 'Hsu',
      studentNumber: BigInt(123456789),
    };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);
    vi.mocked(prisma.user.update).mockResolvedValueOnce(updatedUser);

    const app = createTestApp();

    const res = await request(app).put('/api/users/me').send({
      firstName: 'Maggie',
      lastName: 'Hsu',
      studentNumber: 123456789,
    });

    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Maggie');
    expect(res.body.studentNumber).toBe(123456789);
    expect(res.body.phone).toBeUndefined();

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1' },
        data: {
          firstName: 'Maggie',
          lastName: 'Hsu',
          studentNumber: BigInt(123456789),
        },
      })
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'student-1',
        action: 'user_profile_updated',
        entityType: 'user',
        entityId: 'student-1',
      }),
      prisma
    );
  });

  test('PUT /api/users/me returns 409 when student number is taken', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);
    vi.mocked(prisma.user.update).mockRejectedValueOnce({ code: 'P2002' });

    const app = createTestApp();

    const res = await request(app).put('/api/users/me').send({
      firstName: 'Casey',
      lastName: 'Hsu',
      studentNumber: 987654321,
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STUDENT_NUMBER_TAKEN');
  });

  test('PATCH /api/users/me/notifications updates student email opt-in', async () => {
    const updatedUser = {
      ...userRow,
      emailNotificationOptIn: false,
    };
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(userRow),
        update: vi.fn().mockResolvedValue(updatedUser),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app).patch('/api/users/me/notifications').send({
      emailNotificationOptIn: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.emailNotificationOptIn).toBe(false);
    expect(tx.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1' },
      })
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'student-1' },
        data: { emailNotificationOptIn: false },
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'student-1',
        action: 'user_notification_preferences_updated',
        entityType: 'user',
        entityId: 'student-1',
      }),
      tx
    );
  });

  describe('PATCH /api/users/me/photo', () => {
    const avatarKey = 'avatars/2f6c1b90-1f7c-4a1f-9a6e-6f0f2d1c9b11.webp';

    test('returns 401 if user is not authenticated', async () => {
      mocks.authUser = null;

      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: avatarKey });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    test('stores the object key and returns a resolved URL', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...userRow,
        profilePhotoUrl: avatarKey,
      });

      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: avatarKey });

      expect(res.status).toBe(200);
      expect(res.body.profilePhotoUrl).toBe(
        `https://cdn.test.local/${avatarKey}`
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'student-1' },
          data: { profilePhotoUrl: avatarKey },
        })
      );
    });

    test('clears the photo when sent null', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...userRow,
        profilePhotoUrl: avatarKey,
      });
      vi.mocked(prisma.user.update).mockResolvedValueOnce(userRow);

      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: null });

      expect(res.status).toBe(200);
      expect(res.body.profilePhotoUrl).toBeNull();
      expect(writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user_profile_photo_updated',
          details: { operation: 'cleared' },
        }),
        expect.anything()
      );
    });

    test('never records the object key in the audit trail', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(userRow);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...userRow,
        profilePhotoUrl: avatarKey,
      });

      await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: avatarKey });

      expect(JSON.stringify(vi.mocked(writeAuditLog).mock.calls)).not.toContain(
        avatarKey
      );
    });

    // The profile DTO returns a resolved (often presigned, expiring) URL, so a
    // client echoing that value back must be rejected rather than persisted.
    test('rejects an absolute URL', async () => {
      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: `https://cdn.test.local/${avatarKey}` });

      expect(res.status).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test('rejects a key outside the avatars prefix', async () => {
      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: 'reports/some-item-photo.png' });

      expect(res.status).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    test('allows a security user to set a photo', async () => {
      mocks.authUser = { user_id: 'security-1', role: 'security' };
      const securityRow = {
        ...userRow,
        userId: 'security-1',
        role: UserRole.security,
        studentNumber: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(securityRow);
      vi.mocked(prisma.user.update).mockResolvedValueOnce({
        ...securityRow,
        profilePhotoUrl: avatarKey,
      });

      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: avatarKey });

      expect(res.status).toBe(200);
    });

    test('returns 403 when the account is deactivated', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...userRow,
        isActive: false,
      });

      const res = await request(createTestApp())
        .patch('/api/users/me/photo')
        .send({ profilePhotoUrl: avatarKey });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_INACTIVE');
    });
  });
});
