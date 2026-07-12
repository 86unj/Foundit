import { Router } from 'express';
import { prisma } from '../db';
import authenticate from '../middleware/authenticate';
import {
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
      const { unreadOnly } = req.query as ListNotificationsQuery;

      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: {
            recipientId,
            ...(unreadOnly === 'true' ? { isRead: false } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: notificationSelect,
        }),
        prisma.notification.count({
          where: { recipientId, isRead: false },
        }),
      ]);

      res.status(200).json({ notifications, unreadCount });
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
      where: { recipientId: req.user!.user_id, isRead: false },
      data: { isRead: true },
    });

    res.status(200).json({ updatedCount: result.count });
  } catch (err) {
    next(err);
  }
});

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
router.patch('/:notificationId/read', authenticate, async (req, res, next) => {
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
      where: { notificationId, recipientId: req.user!.user_id },
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
      data: { isRead: true },
      select: notificationSelect,
    });

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
