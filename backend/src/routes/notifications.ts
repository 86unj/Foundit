import { Router, Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import authenticate from '../middleware/authenticate';
import {
  dismissNotificationsSchema,
  listNotificationsQuerySchema,
  notificationParamsSchema,
  type ListNotificationsQuery,
} from '../validators/notifications';
import { validateQuery } from '../validators/shared';

const router = Router();

const notificationSelect = {
  notificationId: true,
  type: true,
  title: true,
  message: true,
  referenceType: true,
  referenceId: true,
  isRead: true,
  createdAt: true,
} as const;

const notificationListOrderBy: Prisma.NotificationOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { notificationId: 'desc' },
];

async function getNotificationListCursorWhere(
  cursorNotificationId: string
): Promise<Prisma.NotificationWhereInput> {
  const cursorNotification = await prisma.notification.findUnique({
    where: { notificationId: cursorNotificationId },
    select: { createdAt: true, notificationId: true },
  });

  if (!cursorNotification) {
    return {};
  }

  return {
    OR: [
      { createdAt: { lt: cursorNotification.createdAt } },
      {
        createdAt: cursorNotification.createdAt,
        notificationId: { lt: cursorNotification.notificationId },
      },
    ],
  };
}

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: List the authenticated user's notifications (newest first)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *         description: notificationId of the last item from the previous page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       '200':
 *         description: Notifications plus the caller's unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       notificationId:
 *                         type: string
 *                         format: uuid
 *                       type:
 *                         type: string
 *                         enum:
 *                           [
 *                             claim_status_update,
 *                             match_found,
 *                             item_expiring,
 *                             report_confirmation,
 *                           ]
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       referenceType:
 *                         type: string
 *                         nullable: true
 *                       referenceId:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       isRead:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 unreadCount:
 *                   type: integer
 *                 nextCursor:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *       '400':
 *         description: Invalid query parameters
 *       '401':
 *         description: Missing or invalid access token
 */
router.get(
  '/',
  authenticate,
  validateQuery(listNotificationsQuerySchema),
  async (req, res, next) => {
    try {
      const recipientId = req.user!.user_id;
      const { unreadOnly, cursor, limit } =
        req.query as unknown as ListNotificationsQuery;

      const baseWhere: Prisma.NotificationWhereInput = {
        recipientId,
        dismissedAt: null,
        ...(unreadOnly === 'true' ? { isRead: false } : {}),
      };

      const cursorWhere = cursor
        ? await getNotificationListCursorWhere(cursor)
        : {};

      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: {
            AND: [baseWhere, cursorWhere],
          },
          orderBy: notificationListOrderBy,
          take: limit + 1,
          select: notificationSelect,
        }),
        prisma.notification.count({
          where: { recipientId, isRead: false, dismissedAt: null },
        }),
      ]);

      const nextCursor =
        notifications.length > limit
          ? notifications[limit].notificationId
          : null;

      res.status(200).json({
        notifications: notifications.slice(0, limit),
        unreadCount,
        nextCursor,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all of the authenticated user's notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Number of notifications that were marked read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 updatedCount:
 *                   type: integer
 *       '401':
 *         description: Missing or invalid access token
 */
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        recipientId: req.user!.user_id,
        isRead: false,
        dismissedAt: null,
      },
      data: { isRead: true },
    });

    res.status(200).json({ updatedCount: result.count });
  } catch (err) {
    next(err);
  }
});

/**
 * Soft-removes selected notifications from the authenticated user's feed.
 * The rows and delivery metadata remain available as an audit history.
 */
router.patch('/dismiss', authenticate, async (req, res, next) => {
  try {
    const body = dismissNotificationsSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: body.error.issues,
      });
      return;
    }

    const result = await prisma.notification.updateMany({
      where: {
        notificationId: { in: body.data.notificationIds },
        recipientId: req.user!.user_id,
        dismissedAt: null,
      },
      data: { dismissedAt: new Date() },
    });

    res.status(200).json({ updatedCount: result.count });
  } catch (err) {
    next(err);
  }
});

// Shared by /read and /unread — same ownership check, opposite flag.
async function setReadState(
  req: Request,
  res: Response,
  next: NextFunction,
  isRead: boolean
) {
  try {
    const params = notificationParamsSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: params.error.issues,
      });
      return;
    }

    const { notificationId } = params.data;
    const existing = await prisma.notification.findFirst({
      where: {
        notificationId,
        recipientId: req.user!.user_id,
        dismissedAt: null,
      },
      select: { notificationId: true },
    });

    if (!existing) {
      res.status(404).json({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification not found.',
      });
      return;
    }

    const updated = await prisma.notification.update({
      where: { notificationId },
      data: { isRead },
      select: notificationSelect,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

/**
 * @openapi
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     summary: Mark one of the authenticated user's notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: The updated notification
 *       '400':
 *         description: Invalid notification id
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Notification not found for this user
 */
router.patch('/:notificationId/read', authenticate, (req, res, next) =>
  setReadState(req, res, next, true)
);

/**
 * @openapi
 * /api/notifications/{notificationId}/unread:
 *   patch:
 *     summary: Mark one of the authenticated user's notifications as unread
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: The updated notification
 *       '400':
 *         description: Invalid notification id
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: Notification not found for this user
 */
router.patch('/:notificationId/unread', authenticate, (req, res, next) =>
  setReadState(req, res, next, false)
);

export default router;
