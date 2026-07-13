import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest';
import notificationsRouter from '../src/routes/notifications';
import { NotificationType } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  authUser: { user_id: 'user-1' } as { user_id: string } | null,
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
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from '../src/db';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationsRouter);
  return app;
}

const notificationId = '550e8400-e29b-41d4-a716-446655440111';

const unreadNotification = {
  notificationId,
  type: NotificationType.claim_status_update,
  title: 'New Claim Submitted',
  message: 'A claim was submitted by a student.',
  referenceType: 'claim',
  referenceId: '550e8400-e29b-41d4-a716-446655440000',
  isRead: false,
  createdAt: new Date('2026-07-10T12:00:00Z'),
};

describe('notifications routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = { user_id: 'user-1' };
  });

  test('GET /api/notifications returns 401 if user is not authenticated', async () => {
    mocks.authUser = null;

    const res = await request(createTestApp()).get('/api/notifications');

    expect(res.status).toBe(401);
  });

  test('GET /api/notifications returns own notifications newest first with unread count', async () => {
    (prisma.notification.findMany as Mock).mockResolvedValue([
      unreadNotification,
    ]);
    (prisma.notification.count as Mock).mockResolvedValue(3);

    const res = await request(createTestApp()).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(3);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].title).toBe('New Claim Submitted');

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      })
    );
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { recipientId: 'user-1', isRead: false },
    });
  });

  test('GET /api/notifications?unreadOnly=true filters to unread', async () => {
    (prisma.notification.findMany as Mock).mockResolvedValue([]);
    (prisma.notification.count as Mock).mockResolvedValue(0);

    const res = await request(createTestApp()).get(
      '/api/notifications?unreadOnly=true'
    );

    expect(res.status).toBe(200);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipientId: 'user-1', isRead: false },
      })
    );
  });

  test('GET /api/notifications rejects an invalid unreadOnly value', async () => {
    const res = await request(createTestApp()).get(
      '/api/notifications?unreadOnly=maybe'
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('PATCH /api/notifications/:id/read rejects a non-uuid id', async () => {
    const res = await request(createTestApp()).patch(
      '/api/notifications/not-a-uuid/read'
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  test("PATCH /api/notifications/:id/read returns 404 for another user's notification", async () => {
    (prisma.notification.findFirst as Mock).mockResolvedValue(null);

    const res = await request(createTestApp()).patch(
      `/api/notifications/${notificationId}/read`
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
    expect(prisma.notification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notificationId, recipientId: 'user-1' },
      })
    );
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  test('PATCH /api/notifications/:id/read marks an owned notification read', async () => {
    (prisma.notification.findFirst as Mock).mockResolvedValue({
      notificationId,
    });
    (prisma.notification.update as Mock).mockResolvedValue({
      ...unreadNotification,
      isRead: true,
    });

    const res = await request(createTestApp()).patch(
      `/api/notifications/${notificationId}/read`
    );

    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(true);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notificationId },
        data: { isRead: true },
      })
    );
  });

  test('PATCH /api/notifications/:id/unread marks an owned notification unread', async () => {
    (prisma.notification.findFirst as Mock).mockResolvedValue({
      notificationId,
    });
    (prisma.notification.update as Mock).mockResolvedValue({
      ...unreadNotification,
      isRead: false,
    });

    const res = await request(createTestApp()).patch(
      `/api/notifications/${notificationId}/unread`
    );

    expect(res.status).toBe(200);
    expect(res.body.isRead).toBe(false);
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notificationId },
        data: { isRead: false },
      })
    );
  });

  test("PATCH /api/notifications/:id/unread returns 404 for another user's notification", async () => {
    (prisma.notification.findFirst as Mock).mockResolvedValue(null);

    const res = await request(createTestApp()).patch(
      `/api/notifications/${notificationId}/unread`
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  test('PATCH /api/notifications/:id/unread rejects a non-uuid id', async () => {
    const res = await request(createTestApp()).patch(
      '/api/notifications/not-a-uuid/unread'
    );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  test("PATCH /api/notifications/read-all marks all of the user's unread notifications read", async () => {
    (prisma.notification.updateMany as Mock).mockResolvedValue({ count: 4 });

    const res = await request(createTestApp()).patch(
      '/api/notifications/read-all'
    );

    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(4);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: 'user-1', isRead: false },
      data: { isRead: true },
    });
  });
});
