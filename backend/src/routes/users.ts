import { Router, Response } from 'express';
import { z } from 'zod';
import { User } from '@prisma/client';
import { prisma } from '../db';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { validate } from '../validators/shared';
import {
  replaceProfileSchema,
  updateNotificationSchema,
} from '../validators/users';
import { writeAuditLog } from '../utils/auditLog';

const router = Router();

/** Public profile fields — never expose passwordHash. */
const userProfileSelect = {
  userId: true,
  email: true,
  username: true,
  role: true,
  firstName: true,
  lastName: true,
  campusId: true,
  phone: true,
  studentNumber: true,
  employeeId: true,
  emailNotificationOptIn: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserProfileRow = Pick<User, keyof typeof userProfileSelect> & {
  campus?: { campusName: string } | null;
};

function toUserProfileDto(user: UserProfileRow) {
  return {
    userId: user.userId,
    email: user.email,
    username: user.username,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    campusId: user.campusId,
    campusName: user.campus?.campusName ?? null,
    phone: user.phone,
    studentNumber:
      user.studentNumber !== null ? Number(user.studentNumber) : null,
    employeeId: user.employeeId,
    emailNotificationOptIn: user.emailNotificationOptIn,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function loadActiveUserProfile(
  userId: string,
  res: Response
): Promise<UserProfileRow | null> {
  const user = await prisma.user.findUnique({
    where: { userId },
    select: {
      ...userProfileSelect,
      campus: { select: { campusName: true } },
    },
  });

  if (!user) {
    res.status(404).json({
      code: 'USER_NOT_FOUND',
      message: 'User account no longer exists.',
    });
    return null;
  }

  if (!user.isActive) {
    res.status(403).json({
      code: 'ACCOUNT_INACTIVE',
      message: 'Your account has been deactivated. Contact an administrator.',
    });
    return null;
  }

  return user;
}

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current user's profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                 username:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [student, security, admin]
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 campusId:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *                 phone:
 *                   type: string
 *                   nullable: true
 *                 studentNumber:
 *                   type: integer
 *                   nullable: true
 *                 employeeId:
 *                   type: string
 *                   nullable: true
 *                 emailNotificationOptIn:
 *                   type: boolean
 *                 isActive:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       '401':
 *         description: Missing or invalid access token
 *       '403':
 *         description: Account has been deactivated
 *       '404':
 *         description: User no longer exists
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await loadActiveUserProfile(req.user!.user_id, res);
    if (!user) {
      return;
    }

    res.status(200).json(toUserProfileDto(user));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/users/me:
 *   put:
 *     summary: Replace the authenticated user's editable profile fields
 *     description: Updates `firstName`, `lastName`, and `phone` only. Send `phone` as `null` to clear it.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, phone]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *                 nullable: true
 *                 example: '4161234567'
 *     responses:
 *       '200':
 *         description: Updated user profile
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid access token
 *       '403':
 *         description: Account has been deactivated
 *       '404':
 *         description: User no longer exists
 */
router.put(
  '/me',
  authenticate,
  validate(replaceProfileSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.user_id;
      const existing = await loadActiveUserProfile(userId, res);
      if (!existing) {
        return;
      }

      const { firstName, lastName, phone } = req.body as z.infer<
        typeof replaceProfileSchema
      >;

      const updated = await prisma.user.update({
        where: { userId },
        data: { firstName, lastName, phone },
        select: {
          ...userProfileSelect,
          campus: { select: { campusName: true } },
        },
      });

      await writeAuditLog({
        actorId: userId,
        action: 'user_profile_updated',
        entityType: 'user',
        entityId: userId,
        details: {
          previous: {
            firstName: existing.firstName,
            lastName: existing.lastName,
            phone: existing.phone,
          },
          updated: { firstName, lastName, phone },
        },
        ipAddress: req.ip,
      });

      res.status(200).json(toUserProfileDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/me/notifications',
  authenticate,
  requireRole('student'),
  validate(updateNotificationSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.user_id;
      const existing = await loadActiveUserProfile(userId, res);
      if (!existing) {
        return;
      }

      const { emailNotificationOptIn } = req.body as z.infer<
        typeof updateNotificationSchema
      >;

      const updated = await prisma.user.update({
        where: { userId },
        data: { emailNotificationOptIn },
        select: {
          ...userProfileSelect,
          campus: { select: { campusName: true } },
        },
      });

      await writeAuditLog({
        actorId: userId,
        action: 'user_notification_preferences_updated',
        entityType: 'user',
        entityId: userId,
        details: {
          previous: {
            emailNotificationOptIn: existing.emailNotificationOptIn,
          },
          updated: { emailNotificationOptIn },
        },
        ipAddress: req.ip,
      });

      res.status(200).json(toUserProfileDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
