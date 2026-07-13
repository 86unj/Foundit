import {
  FoundReportStatus,
  ItemStatus,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { prisma } from '../db';
import { writeAuditLog } from '../utils/auditLog';
import { scheduleItemSearchIndexIngest } from '../lib/matching/ingest';
import { scheduleMatchRefreshForCampus } from '../lib/matching/suggestions';
import { generateReportLinkToken } from '../utils/reportLinkToken';
import { validate } from '../validators/shared';
import {
  CreateReportLinkInput,
  createReportLinkSchema,
  reportLinkTokenParamsSchema,
  SubmitFoundItemReportInput,
  submitFoundItemReportSchema,
} from '../validators/reportLinks';

function buildDescriptionInternal(
  description: string,
  additionalNotes?: string
): string {
  const base = description.trim();
  if (additionalNotes?.trim()) {
    return `${base}\n${additionalNotes.trim()}`;
  }
  return base;
}

/** Combined snapshot stored on found-item reports for audit. */
function combineReportItemDescription(
  title: string,
  description: string
): string {
  return [title.trim(), description.trim()].filter(Boolean).join('\n\n');
}

function computeRetentionExpiryDate(
  dateFound: Date,
  retentionDays: number
): Date {
  const expiry = new Date(dateFound);
  expiry.setUTCDate(expiry.getUTCDate() + retentionDays);
  return expiry;
}

const router = Router();
const validateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many report-link validation attempts. Try again later.',
  },
});
const submitRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many report submissions. Try again later.',
  },
});

const reportLinkSelect = {
  linkId: true,
  campusId: true,
  generatedBy: true,
  expiresAt: true,
  isUsed: true,
  usedAt: true,
  generator: {
    select: {
      firstName: true,
      lastName: true,
    },
  },
} as const;

const submitterSelect = {
  userId: true,
  campusId: true,
  isActive: true,
} as const;

const actorSelect = {
  userId: true,
  role: true,
  campusId: true,
  isActive: true,
} as const;

type ActorUser = {
  userId: string;
  role: UserRole;
  campusId: string | null;
  isActive: boolean;
};

function parseParamsToken(rawToken: unknown): string | null {
  const parsed = reportLinkTokenParamsSchema.safeParse({ token: rawToken });
  return parsed.success ? parsed.data.token : null;
}

function getReportLinkAvailability(
  link: {
    isUsed: boolean;
    expiresAt: Date;
    usedAt: Date | null;
  } | null
) {
  if (!link) {
    return { valid: false, reason: 'not_found' as const };
  }

  if (link.isUsed) {
    return {
      valid: false,
      reason: 'used' as const,
      usedAt: link.usedAt?.toISOString() ?? null,
    };
  }

  if (link.expiresAt <= new Date()) {
    return {
      valid: false,
      reason: 'expired' as const,
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  return {
    valid: true,
    reason: 'available' as const,
    expiresAt: link.expiresAt.toISOString(),
  };
}

function toPrismaTime(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return new Date(`1970-01-01T${value}:00.000Z`);
}

function setNoStoreHeader(res: Response) {
  res.set('Cache-Control', 'no-store');
}

async function loadActor(userId: string): Promise<ActorUser | null> {
  return prisma.user.findUnique({
    where: { userId },
    select: actorSelect,
  });
}

function ensureActiveActor(
  actor: ActorUser | null,
  res: Response
): actor is ActorUser {
  if (!actor) {
    res.status(404).json({
      code: 'USER_NOT_FOUND',
      message: 'User account no longer exists.',
    });
    return false;
  }

  if (!actor.isActive) {
    res.status(403).json({
      code: 'ACCOUNT_INACTIVE',
      message: 'Your account has been deactivated. Contact an administrator.',
    });
    return false;
  }

  return true;
}

function buildReportUrl(token: string): string {
  const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
  return `${base}/report-found/${token}`;
}

function isUniqueTokenError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

async function createReportLinkRecord(
  data: {
    token: string;
    generatedBy: string;
    campusId: string;
    expiresAt: Date;
  },
  retryOnCollision = true
) {
  try {
    return await prisma.reportLink.create({
      data,
      select: {
        linkId: true,
        token: true,
        campusId: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  } catch (err) {
    if (retryOnCollision && isUniqueTokenError(err)) {
      return createReportLinkRecord(
        { ...data, token: generateReportLinkToken() },
        false
      );
    }
    throw err;
  }
}

/**
 * @openapi
 * /api/report-links:
 *   post:
 *     summary: Generate a one-time report link for a campus
 *     tags: [Report Links]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               campusId:
 *                 type: string
 *                 format: uuid
 *                 description: Campus for the report link; defaults to the user's assigned campus
 *               expiresInMinutes:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 1440
 *                 default: 30
 *     responses:
 *       '201':
 *         description: Report link created
 *       '401':
 *         description: Missing or invalid access token
 *       '403':
 *         description: Security or admin role required
 *       '404':
 *         description: Campus not found
 */
router.post(
  '/',
  authenticate,
  requireRole('security', 'admin'),
  validate(createReportLinkSchema),
  async (req, res, next) => {
    try {
      const actor = await loadActor(req.user!.user_id);
      if (!ensureActiveActor(actor, res)) {
        return;
      }

      const { campusId: bodyCampusId, expiresInMinutes } =
        req.body as CreateReportLinkInput;

      const campusId = bodyCampusId ?? actor.campusId ?? '';

      if (!campusId) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            {
              path: ['campusId'],
              message: 'campusId is required',
            },
          ],
        });
        return;
      }

      const campus = await prisma.campus.findUnique({
        where: { campusId },
        select: { campusId: true },
      });

      if (!campus) {
        res.status(404).json({
          code: 'CAMPUS_NOT_FOUND',
          message: 'Campus not found.',
        });
        return;
      }

      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
      const token = generateReportLinkToken();

      const link = await createReportLinkRecord({
        token,
        generatedBy: actor.userId,
        campusId,
        expiresAt,
      });

      await writeAuditLog({
        actorId: actor.userId,
        action: 'report_link_created',
        entityType: 'report_link',
        entityId: link.linkId,
        details: { campusId, expiresAt: expiresAt.toISOString() },
        ipAddress: req.ip,
      });

      res.status(201).json({
        linkId: link.linkId,
        token: link.token,
        campusId: link.campusId,
        expiresAt: link.expiresAt.toISOString(),
        createdAt: link.createdAt.toISOString(),
        reportUrl: buildReportUrl(link.token),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/report-links/{token}/validate:
 *   get:
 *     summary: Check whether a report-link token can still be used
 *     tags: [Report Links]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Token availability status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 reason:
 *                   type: string
 *                   enum: [available, not_found, used, expired]
 *                 campusId:
 *                   type: string
 *                   format: uuid
 *                   nullable: true
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 usedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       '400':
 *         description: Invalid token path parameter
 *       '429':
 *         description: Too many validation attempts
 */
router.get('/:token/validate', validateRateLimiter, async (req, res, next) => {
  try {
    setNoStoreHeader(res);
    const token = parseParamsToken(req.params.token);
    if (!token) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          {
            path: ['token'],
            message: 'Token is required',
          },
        ],
      });
      return;
    }

    const link = await prisma.reportLink.findUnique({
      where: { token },
      select: reportLinkSelect,
    });

    const availability = getReportLinkAvailability(link);

    res.status(200).json({
      ...availability,
      campusId: link?.campusId ?? null,
      registrant: link
        ? {
            firstName: link.generator.firstName,
            lastName: link.generator.lastName,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/report-links/{token}/submit:
 *   post:
 *     summary: Submit a found-item report from a valid report-link token
 *     tags: [Report Links]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, category, locationFound, dateFound]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               locationFound:
 *                 type: string
 *               dateFound:
 *                 type: string
 *                 format: date
 *               timeFound:
 *                 type: string
 *                 example: "14:30"
 *               additionalNotes:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Found-item report created and report link consumed
 *       '400':
 *         description: Validation error
 *       '404':
 *         description: Report link not found
 *       '409':
 *         description: Report link already used or expired
 *       '429':
 *         description: Too many submission attempts
 */
router.post(
  '/:token/submit',
  submitRateLimiter,
  validate(submitFoundItemReportSchema),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);
      const token = parseParamsToken(req.params.token);
      if (!token) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            {
              path: ['token'],
              message: 'Token is required',
            },
          ],
        });
        return;
      }

      const link = await prisma.reportLink.findUnique({
        where: { token },
        select: reportLinkSelect,
      });

      if (!link) {
        res.status(404).json({
          code: 'REPORT_LINK_NOT_FOUND',
          message: 'Report link does not exist.',
        });
        return;
      }

      if (link.isUsed) {
        res.status(409).json({
          code: 'REPORT_LINK_USED',
          message: 'Report link has already been used.',
        });
        return;
      }

      const now = new Date();
      if (link.expiresAt <= now) {
        res.status(409).json({
          code: 'REPORT_LINK_EXPIRED',
          message: 'Report link has expired.',
        });
        return;
      }

      const submitter = await prisma.user.findUnique({
        where: { userId: req.user!.user_id },
        select: submitterSelect,
      });

      if (!submitter) {
        res.status(404).json({
          code: 'USER_NOT_FOUND',
          message: 'User account no longer exists.',
        });
        return;
      }

      if (!submitter.isActive) {
        res.status(403).json({
          code: 'ACCOUNT_INACTIVE',
          message:
            'Your account has been deactivated. Contact an administrator.',
        });
        return;
      }

      // if (!submitter.campusId || submitter.campusId !== link.campusId) {
      //   res.status(403).json({
      //     code: 'FORBIDDEN',
      //     message: 'You cannot submit reports for this campus.',
      //   });
      //   return;
      // }

      const {
        title,
        description,
        category,
        locationFound,
        dateFound,
        timeFound,
        additionalNotes,
        images,
      } = req.body as SubmitFoundItemReportInput;

      const result = await prisma.$transaction(async (tx) => {
        const campus = await tx.campus.findUnique({
          where: { campusId: link.campusId },
          select: { retentionDays: true },
        });

        if (!campus) {
          throw new Error('CAMPUS_NOT_FOUND');
        }

        const report = await tx.foundItemReport.create({
          data: {
            reportLinkId: link.linkId,
            finderId: req.user!.user_id,
            itemDescription: combineReportItemDescription(title, description),
            category,
            locationFound,
            dateFound,
            timeFound: toPrismaTime(timeFound),
            additionalNotes,
            status: FoundReportStatus.submitted,
          },
          select: {
            reportId: true,
            reportLinkId: true,
            finderId: true,
            category: true,
            locationFound: true,
            dateFound: true,
            timeFound: true,
            status: true,
            createdAt: true,
          },
        });

        const item = await tx.item.create({
          data: {
            campusId: link.campusId,
            category,
            title,
            descriptionInternal: buildDescriptionInternal(
              description,
              additionalNotes
            ),
            locationFound,
            dateFound,
            status: ItemStatus.stored,
            foundItemReportId: report.reportId,
            registeredBy: link.generatedBy,
            retentionExpiryDate: computeRetentionExpiryDate(
              dateFound,
              campus.retentionDays
            ),
          },
          select: {
            itemId: true,
          },
        });

        if (images.length > 0) {
          await tx.itemImage.createMany({
            data: images.map((image) => ({
              itemId: item.itemId,
              imageUrl: image.imageUrl,
              uploadedBy: req.user!.user_id,
              fileType: image.fileType,
              fileSizeKb: image.fileSizeKb,
            })),
          });
        }

        const linkedReport = await tx.foundItemReport.update({
          where: { reportId: report.reportId },
          data: { status: FoundReportStatus.linked_to_item },
          select: {
            reportId: true,
            reportLinkId: true,
            finderId: true,
            category: true,
            locationFound: true,
            dateFound: true,
            timeFound: true,
            status: true,
            createdAt: true,
          },
        });

        const updateResult = await tx.reportLink.updateMany({
          where: {
            linkId: link.linkId,
            isUsed: false,
            expiresAt: { gt: now },
          },
          data: {
            isUsed: true,
            usedAt: now,
          },
        });

        if (updateResult.count !== 1) {
          throw new Error('REPORT_LINK_CONFLICT');
        }

        // Confirm receipt to the finder in the same transaction.
        await tx.notification.create({
          data: {
            recipientId: req.user!.user_id,
            type: NotificationType.report_confirmation,
            title: 'Report received',
            message: `Thanks! Your found-item report for "${title}" was received and the item is now in storage.`,
            referenceType: 'item',
            referenceId: item.itemId,
          },
        });

        return { report: linkedReport, itemId: item.itemId };
      });

      scheduleItemSearchIndexIngest(result.itemId, {
        category,
        title,
        descriptionInternal: buildDescriptionInternal(
          description,
          additionalNotes
        ),
        locationFound,
      });
      scheduleMatchRefreshForCampus(link.campusId);

      res.status(201).json({
        reportId: result.report.reportId,
        reportLinkId: result.report.reportLinkId,
        finderId: result.report.finderId,
        itemId: result.itemId,
        category: result.report.category,
        locationFound: result.report.locationFound,
        dateFound: result.report.dateFound,
        timeFound: result.report.timeFound,
        status: result.report.status,
        createdAt: result.report.createdAt,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'REPORT_LINK_CONFLICT') {
        res.status(409).json({
          code: 'REPORT_LINK_USED',
          message: 'Report link has already been used.',
        });
        return;
      }

      if (err instanceof Error && err.message === 'CAMPUS_NOT_FOUND') {
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Report link campus is no longer available.',
        });
        return;
      }

      next(err);
    }
  }
);

/**
 * Public-safe status gate for student/public browse.
 * Internal workflow states such as pending_report and closed-out records are excluded.
 */
export const publicItemStatuses = [ItemStatus.stored] as const;

export default router;
