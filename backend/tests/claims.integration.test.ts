import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import claimsRouter from '../src/routes/claims';
import { UserRole, ClaimStatus, ItemStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  authUser: { user_id: 'student-1' } as {
    user_id: string;
    role?: string;
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

vi.mock('../src/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    claim: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    campus: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ logId: 'log-1' }),
    },
    notification: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../src/lib/matching/ingest', () => ({
  scheduleClaimSearchIndexIngest: vi.fn(),
  scheduleItemSearchIndexIngest: vi.fn(),
}));

vi.mock('../src/lib/matching/suggestions', () => ({
  refreshClaimMatchSuggestions: vi.fn(),
}));

vi.mock('../src/lib/email', () => ({
  sendNotificationEmail: vi.fn(),
}));

import { prisma } from '../src/db';
import { sendNotificationEmail } from '../src/lib/email';

const MISSING_CAMPUS_ID = '00000000-0000-0000-0000-000000000000';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/claims', claimsRouter);
  return app;
}

const activeStudent = {
  userId: 'student-1',
  campusId: 'campus-1',
  email: 'student@myseneca.ca',
  username: 'student1',
  passwordHash: 'hashed-password',
  role: UserRole.student,
  firstName: 'Casey',
  lastName: 'Hsu',
  studentNumber: null,
  employeeId: null,
  phone: null,
  emailNotificationOptIn: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  isEmailVerified: true,
  emailVerifyToken: null,
  emailVerifyTokenExpiresAt: null,
};

const activeSecurity = {
  userId: 'security-1',
  campusId: 'campus-1',
  email: 'security@myseneca.ca',
  username: 'security1',
  passwordHash: 'hashed-password',
  role: UserRole.security,
  firstName: 'Security',
  lastName: 'User',
  studentNumber: null,
  employeeId: 'E000000001',
  phone: null,
  emailNotificationOptIn: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  isEmailVerified: true,
  emailVerifyToken: null,
  emailVerifyTokenExpiresAt: null,
};

const claimRow = {
  claimId: '550e8400-e29b-41d4-a716-446655440000',
  studentId: 'student-1',
  itemId: null,
  category: 'Electronics',
  itemName: 'iPhone 15',
  campusId: 'campus-1',
  campus: {
    campusId: 'campus-1',
    campusName: 'Newnham',
    address: null,
    retentionDays: 30,
  },
  description: 'Lost my iPhone',
  additionalInfo: null,
  notificationPreference: 'email' as const,
  dateLost: new Date('2026-07-01'),
  locationLost: 'Library',
  status: ClaimStatus.submitted,
  reviewedAt: null,
  rejectionReason: null,
  pickedUpAt: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  student: {
    userId: 'student-1',
    firstName: 'Casey',
    lastName: 'Hsu',
    email: 'student@myseneca.ca',
    emailNotificationOptIn: false,
    studentNumber: null,
  },
  item: null,
  images: [],
  reviewedBy: null,
  verifiedBy: null,
  reviewer: null,
  verifier: null,
};

const optedInClaimRow = {
  ...claimRow,
  student: {
    ...claimRow.student,
    emailNotificationOptIn: true,
  },
};

describe('claims routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'student-1' };
  });

  test('GET /api/claims returns 401 if user is not authenticated', async () => {
    mocks.authUser = null;

    const app = createTestApp();

    const res = await request(app).get('/api/claims');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  test('GET /api/claims returns claims for student scope', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.claim.findMany).mockResolvedValueOnce([claimRow]);

    const app = createTestApp();

    const res = await request(app).get('/api/claims');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].claimId).toBe(claimRow.claimId);
    expect(res.body.data[0].studentId).toBe('student-1');

    expect(prisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ studentId: 'student-1' }, {}],
        },
      })
    );
  });

  test('GET /api/claims returns claims for security scope', async () => {
    mocks.authUser = { user_id: 'security-1' };

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.claim.findMany).mockResolvedValueOnce([claimRow]);

    const app = createTestApp();

    const res = await request(app).get('/api/claims?status=submitted');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    expect(prisma.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ status: ClaimStatus.submitted }, {}],
        },
      })
    );
  });

  test('GET /api/claims/:claimId returns 404 if claim does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).get(
      '/api/claims/550e8400-e29b-41d4-a716-446655440000'
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CLAIM_NOT_FOUND');
  });

  test('GET /api/claims/:claimId returns 403 if student accesses another student claim', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce({
      ...claimRow,
      studentId: 'another-student',
    });

    const app = createTestApp();

    const res = await request(app).get(
      '/api/claims/550e8400-e29b-41d4-a716-446655440000'
    );

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  test('GET /api/claims/:claimId returns claim detail if user can access it', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce(claimRow);

    const app = createTestApp();

    const res = await request(app).get(
      '/api/claims/550e8400-e29b-41d4-a716-446655440000'
    );

    expect(res.status).toBe(200);
    expect(res.body.claimId).toBe(claimRow.claimId);
    expect(res.body.studentId).toBe('student-1');
    expect(res.body.category).toBe('Electronics');
  });

  function createClaimTx(securityRecipients: { userId: string }[]) {
    const createdClaim = {
      ...claimRow,
      campusId: MISSING_CAMPUS_ID,
      campus: {
        ...claimRow.campus,
        campusId: MISSING_CAMPUS_ID,
        campusName: 'missing',
      },
    };

    return {
      claim: {
        create: vi.fn().mockResolvedValue({ claimId: claimRow.claimId }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(createdClaim),
      },
      itemImage: {
        createMany: vi.fn(),
      },
      user: {
        findMany: vi.fn().mockResolvedValue(securityRecipients),
      },
      notification: {
        createMany: vi.fn(),
        create: vi.fn().mockResolvedValue({
          notificationId: '550e8400-e29b-41d4-a716-446655440099',
          type: 'claim_status_update',
          title: 'Claim submitted',
          message: 'Your claim #550E8400 has been submitted.',
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ logId: 'log-1' }),
      },
    };
  }

  test('POST /api/claims notifies active missing-campus security staff', async () => {
    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);

    const tx = createClaimTx([{ userId: 'security-1' }, { userId: 'admin-1' }]);
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .post('/api/claims')
      .send({ category: 'Electronics', description: 'Lost my iPhone' });

    expect(res.status).toBe(201);
    expect(tx.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campusId: MISSING_CAMPUS_ID,
        }),
      })
    );
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        role: { in: [UserRole.security, UserRole.admin] },
        campusId: MISSING_CAMPUS_ID,
        isActive: true,
      },
      select: { userId: true },
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientId: 'security-1',
          title: 'New Claim Submitted',
          referenceType: 'claim',
          referenceId: claimRow.claimId,
        }),
        expect.objectContaining({
          recipientId: 'admin-1',
          title: 'New Claim Submitted',
        }),
      ],
    });
  });

  test('POST /api/claims uses missing campus when student has no campusId', async () => {
    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      ...activeStudent,
      campusId: null,
    });

    const tx = createClaimTx([{ userId: 'security-1' }]);
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .post('/api/claims')
      .send({ category: 'Electronics', description: 'Lost my iPhone' });

    expect(res.status).toBe(201);
    expect(prisma.campus.findFirst).not.toHaveBeenCalled();
    expect(tx.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campusId: MISSING_CAMPUS_ID,
        }),
      })
    );
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        role: { in: [UserRole.security, UserRole.admin] },
        campusId: MISSING_CAMPUS_ID,
        isActive: true,
      },
      select: { userId: true },
    });
    const auditRows = tx.auditLog.create.mock.calls.map(
      ([input]) => input.data
    );
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'notification_fanout_created',
          entityId: null,
          details: expect.objectContaining({
            sourceEntityType: 'claim',
            sourceEntityId: expect.any(String),
            actorRole: 'student',
          }),
        }),
        expect.objectContaining({
          action: 'claim_created',
          details: expect.objectContaining({
            actorRole: 'student',
            entityLabel: 'iPhone 15',
            summary: expect.any(String),
          }),
        }),
        expect.objectContaining({
          action: 'notification_created',
          details: expect.objectContaining({ entityLabel: 'iPhone 15' }),
        }),
      ])
    );
    const [requestId] = [...new Set(auditRows.map((row) => row.requestId))];
    expect(requestId).toEqual(expect.any(String));
    expect(auditRows.every((row) => row.requestId === requestId)).toBe(true);
  });

  test('POST /api/claims uses the selected campus when campusId is provided', async () => {
    const selectedCampusId = '550e8400-e29b-41d4-a716-446655440042';

    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce({
      campusId: selectedCampusId,
    });

    const tx = createClaimTx([{ userId: 'security-1' }]);
    vi.mocked(tx.claim.findUniqueOrThrow).mockResolvedValueOnce({
      ...claimRow,
      campusId: selectedCampusId,
      campus: {
        ...claimRow.campus,
        campusId: selectedCampusId,
      },
      student: {
        ...claimRow.student,
        emailNotificationOptIn: true,
      },
    });
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app).post('/api/claims').send({
      campusId: selectedCampusId,
      category: 'Electronics',
      description: 'Lost my iPhone',
    });

    expect(res.status).toBe(201);
    expect(prisma.campus.findUnique).toHaveBeenCalledWith({
      where: { campusId: selectedCampusId },
      select: { campusId: true },
    });
    expect(tx.claim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campusId: selectedCampusId,
        }),
      })
    );
    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        role: { in: [UserRole.security, UserRole.admin] },
        campusId: selectedCampusId,
        isActive: true,
      },
      select: { userId: true },
    });
    const auditRows = tx.auditLog.create.mock.calls.map(
      ([input]) => input.data
    );
    const [requestId] = [...new Set(auditRows.map((row) => row.requestId))];
    expect(requestId).toEqual(expect.any(String));
    expect(auditRows.every((row) => row.requestId === requestId)).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'claim_email_notification_sent',
        requestId,
        details: expect.objectContaining({
          actorRole: 'student',
          entityLabel: 'iPhone 15',
        }),
      }),
    });
  });

  test('POST /api/claims rejects an unknown selected campus before the transaction', async () => {
    const selectedCampusId = '550e8400-e29b-41d4-a716-446655440043';

    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.campus.findUnique).mockResolvedValueOnce(null);

    const app = createTestApp();

    const res = await request(app).post('/api/claims').send({
      campusId: selectedCampusId,
      category: 'Electronics',
      description: 'Lost my iPhone',
    });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'CAMPUS_NOT_FOUND',
      message: 'Campus not found.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('DELETE /api/claims/:claimId notifies same-campus security of the cancellation', async () => {
    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce(claimRow);

    const tx = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'security-1' }]),
      },
      notification: {
        createMany: vi.fn(),
      },
      matchSuggestion: {
        deleteMany: vi.fn(),
      },
      claim: {
        delete: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ logId: 'log-1' }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app).delete(
      '/api/claims/550e8400-e29b-41d4-a716-446655440000'
    );

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientId: 'security-1',
          title: 'Claim Cancelled',
          message: 'A student cancelled their claim for "iPhone 15".',
          referenceType: 'claim',
          referenceId: claimRow.claimId,
        }),
      ],
    });
    expect(tx.claim.delete).toHaveBeenCalledWith({
      where: { claimId: claimRow.claimId },
    });
  });

  test('POST /api/claims creates no notifications when the campus has no security staff', async () => {
    mocks.authUser = { user_id: 'student-1', role: UserRole.student };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeStudent);

    const tx = createClaimTx([]);
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .post('/api/claims')
      .send({ category: 'Electronics', description: 'Lost my iPhone' });

    expect(res.status).toBe(201);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  test('PATCH /api/claims/:claimId/status emails students when rejected', async () => {
    mocks.authUser = { user_id: 'security-1', role: UserRole.security };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce(optedInClaimRow);

    const rejectedClaim = {
      ...optedInClaimRow,
      status: ClaimStatus.rejected,
      rejectionReason: 'Not enough ownership details.',
    };
    const notification = {
      notificationId: '550e8400-e29b-41d4-a716-446655440090',
      type: 'claim_status_update',
      title: 'Claim status updated: rejected',
      message:
        'Your claim for "iPhone 15" is now rejected. Reason: Not enough ownership details.',
    };

    const tx = {
      claim: {
        update: vi.fn().mockResolvedValue(rejectedClaim),
      },
      notification: {
        create: vi.fn().mockResolvedValue(notification),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ logId: 'log-2' }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .patch('/api/claims/550e8400-e29b-41d4-a716-446655440000/status')
      .send({
        status: 'rejected',
        rejectionReason: 'Not enough ownership details.',
      });

    expect(res.status).toBe(200);
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: 'student-1',
        type: 'claim_status_update',
        title: 'Claim status updated: rejected',
        message: notification.message,
        referenceType: 'claim',
        referenceId: claimRow.claimId,
      }),
      select: expect.anything(),
    });
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@myseneca.ca',
        subject: notification.title,
        text: expect.stringContaining(notification.message),
      })
    );
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { notificationId: notification.notificationId },
      data: expect.objectContaining({
        emailSent: true,
        emailDeliveryStatus: 'sent',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'claim_email_notification_sent',
        entityType: 'notification',
        entityId: notification.notificationId,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'claim_status_updated',
        actorId: 'security-1',
        entityId: claimRow.claimId,
        requestId: expect.any(String),
        details: expect.objectContaining({
          previousStatus: ClaimStatus.submitted,
          nextStatus: ClaimStatus.rejected,
          reasonCategory: 'manual_rejection',
          actorRole: 'security',
          entityLabel: 'iPhone 15',
          summary: expect.stringContaining('manual_rejection'),
        }),
      }),
    });
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(
      'Not enough ownership details.'
    );
  });

  test('PATCH /api/claims/:claimId/status emails students when picked up', async () => {
    mocks.authUser = { user_id: 'security-1', role: UserRole.security };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce({
      ...optedInClaimRow,
      itemId: '550e8400-e29b-41d4-a716-446655440010',
      status: ClaimStatus.approved,
    });

    const pickedUpClaim = {
      ...optedInClaimRow,
      itemId: '550e8400-e29b-41d4-a716-446655440010',
      status: ClaimStatus.picked_up,
      pickedUpAt: new Date('2026-07-02'),
      verifiedBy: 'security-1',
    };
    const notification = {
      notificationId: '550e8400-e29b-41d4-a716-446655440091',
      type: 'claim_status_update',
      title: 'Claim status updated: picked up',
      message: 'Your claim for "iPhone 15" is now picked up.',
    };

    const tx = {
      item: {
        findUnique: vi.fn().mockResolvedValue({
          itemId: '550e8400-e29b-41d4-a716-446655440010',
          status: 'stored',
        }),
        update: vi.fn(),
      },
      claim: {
        update: vi.fn().mockResolvedValue(pickedUpClaim),
      },
      notification: {
        create: vi.fn().mockResolvedValue(notification),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ logId: 'log-3' }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .patch('/api/claims/550e8400-e29b-41d4-a716-446655440000/status')
      .send({ status: 'picked_up' });

    expect(res.status).toBe(200);
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: 'student-1',
        type: 'claim_status_update',
        title: 'Claim status updated: picked up',
        message: notification.message,
        referenceType: 'claim',
        referenceId: claimRow.claimId,
      }),
      select: expect.anything(),
    });
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@myseneca.ca',
        subject: notification.title,
        text: expect.stringContaining(notification.message),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'item_status_updated',
        actorId: 'security-1',
        entityId: '550e8400-e29b-41d4-a716-446655440010',
        details: expect.objectContaining({
          previousStatus: ItemStatus.stored,
          nextStatus: ItemStatus.claimed,
          claimId: claimRow.claimId,
        }),
      }),
    });
  });

  test('PATCH /api/claims/:claimId/status audits claim-driven item reservation', async () => {
    mocks.authUser = { user_id: 'security-1', role: UserRole.security };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce({
      ...claimRow,
      itemId: '550e8400-e29b-41d4-a716-446655440010',
      status: ClaimStatus.under_review,
    });
    const approvedClaim = {
      ...claimRow,
      itemId: '550e8400-e29b-41d4-a716-446655440010',
      status: ClaimStatus.approved,
    };
    const notification = {
      notificationId: '550e8400-e29b-41d4-a716-446655440092',
      type: 'claim_status_update',
      title: 'Claim status updated: approved',
      message: 'Your claim for "iPhone 15" is now approved.',
    };
    const tx = {
      item: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      claim: { update: vi.fn().mockResolvedValue(approvedClaim) },
      notification: { create: vi.fn().mockResolvedValue(notification) },
      auditLog: { create: vi.fn().mockResolvedValue({ logId: 'log-4' }) },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
      callback(tx as never)
    );

    const res = await request(createTestApp())
      .patch('/api/claims/550e8400-e29b-41d4-a716-446655440000/status')
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientId: 'student-1',
        type: 'claim_status_update',
        title: 'Claim status updated: approved',
        message: notification.message,
        referenceType: 'claim',
        referenceId: claimRow.claimId,
      }),
      select: expect.anything(),
    });
    const auditRows = tx.auditLog.create.mock.calls.map(
      ([input]) => input.data
    );
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'claim_status_updated',
          entityId: claimRow.claimId,
        }),
        expect.objectContaining({
          action: 'item_status_updated',
          entityId: '550e8400-e29b-41d4-a716-446655440010',
        }),
      ])
    );
    expect(new Set(auditRows.map((row) => row.requestId)).size).toBe(1);
  });

  test('PATCH /api/claims/:claimId/status skips email when the student opted out', async () => {
    mocks.authUser = { user_id: 'security-1', role: UserRole.security };
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(activeSecurity);
    vi.mocked(prisma.claim.findUnique).mockResolvedValueOnce(claimRow);

    const rejectedClaim = {
      ...claimRow,
      status: ClaimStatus.rejected,
      rejectionReason: 'Not enough ownership details.',
    };

    const tx = {
      claim: {
        update: vi.fn().mockResolvedValue(rejectedClaim),
      },
      notification: {
        create: vi.fn().mockResolvedValue({
          notificationId: '550e8400-e29b-41d4-a716-446655440092',
          type: 'claim_status_update',
          title: 'Claim status updated: rejected',
          message:
            'Your claim for "iPhone 15" is now rejected. Reason: Not enough ownership details.',
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ logId: 'log-4' }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async (fn: (client: unknown) => unknown) => fn(tx)
    );

    const app = createTestApp();

    const res = await request(app)
      .patch('/api/claims/550e8400-e29b-41d4-a716-446655440000/status')
      .send({
        status: 'rejected',
        rejectionReason: 'Not enough ownership details.',
      });

    expect(res.status).toBe(200);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});
