import { Router, Response } from 'express';
import { z } from 'zod';
import { User } from '@prisma/client';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../db';
import { r2, R2_BUCKET } from '../lib/r2';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { validate } from '../validators/shared';
import {
  AVATAR_KEY_PATTERN,
  replaceProfileSchema,
  updateNotificationSchema,
  updateProfilePhotoSchema,
} from '../validators/users';
import { auditContextFromRequest, writeAuditLog } from '../utils/auditLog';
import { resolveImageUrl } from '../utils/imageUrl';

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
  studentNumber: true,
  employeeId: true,
  profilePhotoUrl: true,
  emailNotificationOptIn: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type UserProfileRow = Pick<User, keyof typeof userProfileSelect> & {
  campus?: { campusName: string } | null;
};

/**
 * `profilePhotoUrl` is stored as a bucket key but returned resolved (public or
 * presigned GET), matching how items and claims expose image URLs. The resolve
 * step is async, so every call site awaits.
 */
async function toUserProfileDto(user: UserProfileRow) {
  return {
    userId: user.userId,
    email: user.email,
    username: user.username,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    campusId: user.campusId,
    campusName: user.campus?.campusName ?? null,
    studentNumber:
      user.studentNumber !== null ? Number(user.studentNumber) : null,
    employeeId: user.employeeId,
    profilePhotoUrl: user.profilePhotoUrl
      ? await resolveImageUrl(user.profilePhotoUrl)
      : null,
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
 *                 studentNumber:
 *                   type: integer
 *                   nullable: true
 *                 employeeId:
 *                   type: string
 *                   nullable: true
 *                 profilePhotoUrl:
 *                   type: string
 *                   nullable: true
 *                   description: Resolved image URL, or null when no photo is set
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

    res.status(200).json(await toUserProfileDto(user));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/users/me:
 *   put:
 *     summary: Replace the authenticated user's editable profile fields
 *     description: Updates `firstName` and `lastName`. Students may also set `studentNumber` (9-digit Seneca ID) or send `null` to clear it.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               studentNumber:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 100000000
 *                 maximum: 999999999
 *                 description: Seneca student number (students only)
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
 *       '409':
 *         description: Student number already in use
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

      const { firstName, lastName, studentNumber } = req.body as z.infer<
        typeof replaceProfileSchema
      >;

      const isStudent = existing.role === 'student';
      const data: {
        firstName: string;
        lastName: string;
        studentNumber?: bigint | null;
      } = { firstName, lastName };

      if (isStudent && studentNumber !== undefined) {
        data.studentNumber =
          studentNumber === null ? null : BigInt(studentNumber);
      }

      let updated;
      try {
        const context = auditContextFromRequest(req);
        const changedFields = [
          ...(existing.firstName !== firstName ? ['firstName'] : []),
          ...(existing.lastName !== lastName ? ['lastName'] : []),
          ...(isStudent && studentNumber !== undefined
            ? ['studentNumber']
            : []),
        ];
        updated = await prisma.$transaction(async (tx) => {
          const profile = await tx.user.update({
            where: { userId },
            data,
            select: {
              ...userProfileSelect,
              campus: { select: { campusName: true } },
            },
          });
          await writeAuditLog(
            {
              actorId: userId,
              actorType: 'user',
              actorRole: req.user!.role,
              action: 'user_profile_updated',
              entityType: 'user',
              entityId: userId,
              outcome: 'success',
              details: { changedFields },
              ...context,
            },
            tx
          );
          return profile;
        });
      } catch (err: unknown) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: string }).code === 'P2002'
        ) {
          res.status(409).json({
            code: 'STUDENT_NUMBER_TAKEN',
            message: 'That student ID is already linked to another account.',
          });
          return;
        }
        throw err;
      }

      res.status(200).json(await toUserProfileDto(updated));
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
      const { emailNotificationOptIn } = req.body as z.infer<
        typeof updateNotificationSchema
      >;

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { userId },
          select: {
            ...userProfileSelect,
            campus: { select: { campusName: true } },
          },
        });

        if (!existing) {
          return {
            updated: undefined,
            error: {
              status: 404,
              body: {
                code: 'USER_NOT_FOUND',
                message: 'User account no longer exists.',
              },
            },
          } as const;
        }

        if (!existing.isActive) {
          return {
            updated: undefined,
            error: {
              status: 403,
              body: {
                code: 'ACCOUNT_INACTIVE',
                message:
                  'Your account has been deactivated. Contact an administrator.',
              },
            },
          } as const;
        }

        const updated = await tx.user.update({
          where: { userId },
          data: { emailNotificationOptIn },
          select: {
            ...userProfileSelect,
            campus: { select: { campusName: true } },
          },
        });

        await writeAuditLog(
          {
            actorId: userId,
            actorRole: req.user!.role,
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
          },
          tx
        );

        return { updated, error: undefined } as const;
      });

      if (result.error) {
        res.status(result.error.status).json(result.error.body);
        return;
      }

      res.status(200).json(await toUserProfileDto(result.updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/users/me/photo:
 *   patch:
 *     summary: Set or clear the authenticated user's profile photo
 *     description: >
 *       Accepts the object key returned by `POST /api/uploads/presigned-url`
 *       with `purpose: avatar`, or `null` to remove the photo. Absolute URLs
 *       are rejected — the profile response returns a resolved (and possibly
 *       expiring) URL that must not be written back.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [profilePhotoUrl]
 *             properties:
 *               profilePhotoUrl:
 *                 type: string
 *                 nullable: true
 *                 example: avatars/2f6c1b90-1f7c-4a1f-9a6e-6f0f2d1c9b11.webp
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
router.patch(
  '/me/photo',
  // No requireRole — every role has a profile photo.
  authenticate,
  validate(updateProfilePhotoSchema),
  async (req, res, next) => {
    try {
      const userId = req.user!.user_id;
      const existing = await loadActiveUserProfile(userId, res);
      if (!existing) {
        return;
      }

      const { profilePhotoUrl } = req.body as z.infer<
        typeof updateProfilePhotoSchema
      >;
      const context = auditContextFromRequest(req);
      const avatarToDelete =
        profilePhotoUrl === null &&
        existing.profilePhotoUrl &&
        AVATAR_KEY_PATTERN.test(existing.profilePhotoUrl)
          ? existing.profilePhotoUrl
          : null;

      const updated = await prisma.$transaction(async (tx) => {
        if (avatarToDelete) {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: R2_BUCKET,
              Key: avatarToDelete,
            })
          );
        }

        const profile = await tx.user.update({
          where: { userId },
          data: { profilePhotoUrl },
          select: {
            ...userProfileSelect,
            campus: { select: { campusName: true } },
          },
        });

        await writeAuditLog(
          {
            actorId: userId,
            actorType: 'user',
            actorRole: req.user!.role,
            action: 'user_profile_photo_updated',
            entityType: 'user',
            entityId: userId,
            outcome: 'success',
            details: {
              operation: profilePhotoUrl === null ? 'cleared' : 'set',
            },
            ...context,
          },
          tx
        );

        return profile;
      });

      res.status(200).json(await toUserProfileDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
