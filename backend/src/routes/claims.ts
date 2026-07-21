import { Router, Response } from 'express';
import {
  ClaimStatus,
  ItemStatus,
  MatchStatus,
  NotificationType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../db';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { writeAuditLog } from '../utils/auditLog';
import {
  createClaimStatusUpdateInput,
  fanOutToCampusSecurity,
  shortClaimRef,
} from '../lib/notifications';
import {
  deliverStudentClaimEmail,
  studentNotificationEmailSelect,
  type StudentNotificationEmailRow,
} from '../lib/claimEmailNotifications';
import { scheduleClaimSearchIndexIngest } from '../lib/matching/ingest';
import { refreshClaimMatchSuggestions } from '../lib/matching/suggestions';
import { resolveImageUrl } from '../utils/imageUrl';
import {
  claimAndMatchParamsSchema,
  claimParamsSchema,
  createClaimSchema,
  type CreateClaimInput,
  linkClaimItemSchema,
  listClaimsQuerySchema,
  reviewMatchSuggestionSchema,
  updateClaimStatusSchema,
} from '../validators/claims';
import { validate, validateQuery } from '../validators/shared';

const router = Router();
const MISSING_CAMPUS_ID = '00000000-0000-0000-0000-000000000000';

const claimListSelect = {
  claimId: true,
  studentId: true,
  itemId: true,
  category: true,
  itemName: true,
  campusId: true,
  campus: {
    select: {
      campusId: true,
      campusName: true,
    },
  },
  description: true,
  additionalInfo: true,
  notificationPreference: true,
  dateLost: true,
  locationLost: true,
  status: true,
  reviewedAt: true,
  rejectionReason: true,
  pickedUpAt: true,
  createdAt: true,
  updatedAt: true,
  student: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
      emailNotificationOptIn: true,
      studentNumber: true,
    },
  },
  item: {
    select: {
      itemId: true,
      campusId: true,
      campus: {
        select: {
          campusId: true,
          campusName: true,
        },
      },
      category: true,
      title: true,
      status: true,
      brand: true,
      color: true,
      locationFound: true,
      dateFound: true,
    },
  },
  images: {
    select: {
      imageId: true,
      imageUrl: true,
      fileType: true,
      fileSizeKb: true,
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const;

const claimDetailSelect = {
  ...claimListSelect,
  reviewedBy: true,
  verifiedBy: true,
  reviewer: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  verifier: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

const matchSuggestionSelect = {
  matchId: true,
  claimId: true,
  itemId: true,
  matchScore: true,
  matchCriteria: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAt: true,
  item: {
    select: {
      itemId: true,
      campusId: true,
      category: true,
      title: true,
      status: true,
      brand: true,
      color: true,
      locationFound: true,
      dateFound: true,
      descriptionPublic: true,
    },
  },
  reviewer: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

type RequestUser = {
  userId: string;
  role: UserRole;
  campusId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
};

type ClaimListRow = Prisma.ClaimGetPayload<{ select: typeof claimListSelect }>;
type ClaimDetailRow = Prisma.ClaimGetPayload<{
  select: typeof claimDetailSelect;
}>;
type MatchSuggestionRow = Prisma.MatchSuggestionGetPayload<{
  select: typeof matchSuggestionSelect;
}>;

function sendValidationError(res: Response, details: unknown) {
  res.status(400).json({
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details,
  });
}

async function toClaimListItemDto(claim: ClaimListRow) {
  const images = await Promise.all(
    claim.images.map(async (image) => ({
      imageId: image.imageId,
      imageUrl: await resolveImageUrl(image.imageUrl),
      fileType: image.fileType,
      fileSizeKb: image.fileSizeKb,
    }))
  );

  return {
    claimId: claim.claimId,
    studentId: claim.studentId,
    itemId: claim.itemId,
    category: claim.category,
    itemName: claim.itemName,
    campusId: claim.campusId,
    campus: {
      campusId: claim.campus.campusId,
      campusName: claim.campus.campusName,
    },
    description: claim.description,
    additionalInfo: claim.additionalInfo,
    notificationPreference: claim.notificationPreference,
    dateLost: claim.dateLost,
    locationLost: claim.locationLost,
    status: claim.status,
    reviewedAt: claim.reviewedAt,
    rejectionReason: claim.rejectionReason,
    pickedUpAt: claim.pickedUpAt,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    student: {
      userId: claim.student.userId,
      firstName: claim.student.firstName,
      lastName: claim.student.lastName,
      email: claim.student.email,
      studentNumber:
        claim.student.studentNumber !== null
          ? Number(claim.student.studentNumber)
          : null,
    },
    item: claim.item
      ? {
          itemId: claim.item.itemId,
          campusId: claim.item.campusId,
          campus: {
            campusId: claim.item.campus.campusId,
            campusName: claim.item.campus.campusName,
          },
          category: claim.item.category,
          title: claim.item.title,
          status: claim.item.status,
          brand: claim.item.brand,
          color: claim.item.color,
          locationFound: claim.item.locationFound,
          dateFound: claim.item.dateFound,
        }
      : null,
    images,
  };
}

async function toClaimDetailDto(claim: ClaimDetailRow) {
  const base = await toClaimListItemDto(claim);
  return {
    ...base,
    reviewedBy: claim.reviewedBy,
    verifiedBy: claim.verifiedBy,
    reviewer: claim.reviewer
      ? {
          userId: claim.reviewer.userId,
          firstName: claim.reviewer.firstName,
          lastName: claim.reviewer.lastName,
          email: claim.reviewer.email,
        }
      : null,
    verifier: claim.verifier
      ? {
          userId: claim.verifier.userId,
          firstName: claim.verifier.firstName,
          lastName: claim.verifier.lastName,
          email: claim.verifier.email,
        }
      : null,
  };
}

function toMatchSuggestionDto(match: MatchSuggestionRow) {
  return {
    matchId: match.matchId,
    claimId: match.claimId,
    itemId: match.itemId,
    matchScore: Number(match.matchScore),
    matchCriteria: match.matchCriteria,
    status: match.status,
    reviewedBy: match.reviewedBy,
    reviewedAt: match.reviewedAt,
    createdAt: match.createdAt,
    item: {
      itemId: match.item.itemId,
      campusId: match.item.campusId,
      category: match.item.category,
      title: match.item.title,
      status: match.item.status,
      brand: match.item.brand,
      color: match.item.color,
      locationFound: match.item.locationFound,
      dateFound: match.item.dateFound,
      descriptionPublic: match.item.descriptionPublic,
    },
    reviewer: match.reviewer
      ? {
          userId: match.reviewer.userId,
          firstName: match.reviewer.firstName,
          lastName: match.reviewer.lastName,
          email: match.reviewer.email,
        }
      : null,
  };
}

async function loadRequestUser(userId: string): Promise<RequestUser | null> {
  return prisma.user.findUnique({
    where: { userId },
    select: {
      userId: true,
      role: true,
      campusId: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
    },
  });
}

function ensureActiveRequestUser(
  user: RequestUser | null,
  res: Response
): user is RequestUser {
  if (!user) {
    res.status(404).json({
      code: 'USER_NOT_FOUND',
      message: 'User account no longer exists.',
    });
    return false;
  }

  if (!user.isActive) {
    res.status(403).json({
      code: 'ACCOUNT_INACTIVE',
      message: 'Your account has been deactivated. Contact an administrator.',
    });
    return false;
  }

  return true;
}

function canAccessClaim(user: RequestUser, claim: { studentId: string }) {
  if (user.role === 'student') {
    return claim.studentId === user.userId;
  }

  return user.role === 'security' || user.role === 'admin';
}

const claimListOrderBy: Prisma.ClaimOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { claimId: 'desc' },
];

async function getClaimListCursorWhere(
  cursorClaimId: string
): Promise<Prisma.ClaimWhereInput> {
  const cursorClaim = await prisma.claim.findUnique({
    where: { claimId: cursorClaimId },
    select: { createdAt: true, claimId: true },
  });

  if (!cursorClaim) {
    return {};
  }

  return {
    OR: [
      { createdAt: { lt: cursorClaim.createdAt } },
      {
        createdAt: cursorClaim.createdAt,
        claimId: { lt: cursorClaim.claimId },
      },
    ],
  };
}

function getClaimListWhere(
  user: RequestUser,
  query: {
    status?: ClaimStatus;
    campusId?: string;
    studentId?: string;
    itemId?: string;
  }
): Prisma.ClaimWhereInput {
  if (user.role === 'student') {
    return {
      studentId: user.userId,
      ...(query.status ? { status: query.status } : {}),
    };
  }

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.campusId ? { campusId: query.campusId } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
  };
}

const cancellableClaimStatuses = new Set<ClaimStatus>([ClaimStatus.submitted]);

const validStatusTransitions: Record<ClaimStatus, ClaimStatus[]> = {
  [ClaimStatus.submitted]: [ClaimStatus.rejected],
  [ClaimStatus.under_review]: [ClaimStatus.approved, ClaimStatus.rejected],
  [ClaimStatus.approved]: [ClaimStatus.picked_up, ClaimStatus.rejected],
  [ClaimStatus.rejected]: [],
  [ClaimStatus.picked_up]: [],
};

function createClaimSubmittedNotificationInput(claim: ClaimDetailRow) {
  return {
    recipientId: claim.studentId,
    type: NotificationType.claim_status_update,
    title: 'Claim submitted',
    message: `Your claim ${shortClaimRef(claim.claimId)} has been submitted.`,
    referenceType: 'claim',
    referenceId: claim.claimId,
  } as const;
}

function createMatchFoundNotificationInput(claim: {
  claimId: string;
  studentId: string;
  item: { campus: { campusName: string } } | null;
}) {
  const campusName = claim.item?.campus.campusName;
  const officeLocation = campusName
    ? `the ${campusName} campus security office`
    : 'the campus security office';

  return {
    recipientId: claim.studentId,
    type: NotificationType.match_found,
    title: 'Your matched item is ready for pickup',
    message: `A found item has been matched to your claim. Visit ${officeLocation} with your student ID during office hours to collect it.`,
    referenceType: 'claim',
    referenceId: claim.claimId,
  } as const;
}

async function reserveItemForClaim(
  tx: Prisma.TransactionClient,
  itemId: string
) {
  const updateResult = await tx.item.updateMany({
    where: {
      itemId,
      status: ItemStatus.stored,
    },
    data: { status: ItemStatus.claimed },
  });

  if (updateResult.count > 0) {
    return;
  }

  const item = await tx.item.findUnique({
    where: { itemId },
    select: { itemId: true },
  });

  if (!item) {
    throw new Error('LINKED_ITEM_NOT_FOUND');
  }

  const conflictError = new Error('LINKED_ITEM_NOT_STORED');
  conflictError.name = 'LINKED_ITEM_NOT_STORED';
  throw conflictError;
}

async function applyMatchConfirmation(
  tx: Prisma.TransactionClient,
  claim: { claimId: string; studentId: string },
  itemId: string,
  actorId: string
) {
  await reserveItemForClaim(tx, itemId);

  const now = new Date();
  const updatedClaim = await tx.claim.update({
    where: { claimId: claim.claimId },
    data: {
      itemId,
      status: ClaimStatus.approved,
      reviewedBy: actorId,
      reviewedAt: now,
    },
    select: claimDetailSelect,
  });

  const matchNotification = await tx.notification.create({
    data: createMatchFoundNotificationInput(updatedClaim),
    select: studentNotificationEmailSelect,
  });

  const statusNotification = await tx.notification.create({
    data: createClaimStatusNotificationInput(
      updatedClaim,
      ClaimStatus.approved
    ),
    select: studentNotificationEmailSelect,
  });

  return { claim: updatedClaim, matchNotification, statusNotification };
}

function createClaimStatusNotificationInput(
  claim: ClaimDetailRow,
  nextStatus: ClaimStatus
) {
  return createClaimStatusUpdateInput(claim, nextStatus.replace('_', ' '), {
    reason:
      nextStatus === ClaimStatus.rejected ? claim.rejectionReason : undefined,
  });
}

async function notifySecurityOfNewClaim(
  tx: Prisma.TransactionClient,
  claim: { claimId: string; campusId: string }
) {
  await fanOutToCampusSecurity(tx, claim.campusId, {
    type: NotificationType.claim_status_update,
    title: 'New Claim Submitted',
    message: 'A claim was submitted by a student.',
    referenceType: 'claim',
    referenceId: claim.claimId,
  });
}

async function notifySecurityOfClaimCancellation(
  tx: Prisma.TransactionClient,
  claim: { claimId: string; campusId: string; itemName: string | null }
) {
  // The claim row is deleted right after this runs, so the message carries
  // the item name — referenceId is kept only for traceability.
  const claimLabel = claim.itemName
    ? `their claim for "${claim.itemName}"`
    : `claim ${shortClaimRef(claim.claimId)}`;

  await fanOutToCampusSecurity(tx, claim.campusId, {
    type: NotificationType.claim_status_update,
    title: 'Claim Cancelled',
    message: `A student cancelled ${claimLabel}.`,
    referenceType: 'claim',
    referenceId: claim.claimId,
  });
}

/**
 * @openapi
 * /api/claims:
 *   post:
 *     summary: Submit a lost-item claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category:
 *                 type: string
 *               itemName:
 *                 type: string
 *               description:
 *                 type: string
 *               additionalInfo:
 *                 type: string
 *               notificationPreference:
 *                 type: string
 *                 enum: [email]
 *               dateLost:
 *                 type: string
 *                 format: date
 *               locationLost:
 *                 type: string
 *               images:
 *                 type: array
 *                 maxItems: 3
 *                 items:
 *                   type: object
 *                   required: [imageUrl, fileType, fileSizeKb]
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                     fileType:
 *                       type: string
 *                     fileSizeKb:
 *                       type: integer
 *     responses:
 *       '201':
 *         description: Claim created
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Role or account is not allowed
 */
router.post(
  '/',
  authenticate,
  requireRole('student'),
  validate(createClaimSchema),
  async (req, res, next) => {
    try {
      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      // Claims are campus-agnostic at submission time. Store them under the
      // sentinel "missing" campus until campus selection is modeled explicitly.
      const campusId = MISSING_CAMPUS_ID;

      const payload = req.body as CreateClaimInput;

      const { claim, notification } = await prisma.$transaction(async (tx) => {
        const created = await tx.claim.create({
          data: {
            studentId: actor.userId,
            campusId,
            category: payload.category,
            itemName: payload.itemName,
            description: payload.description,
            additionalInfo: payload.additionalInfo,
            ...(payload.notificationPreference
              ? { notificationPreference: payload.notificationPreference }
              : {}),
            dateLost: payload.dateLost,
            locationLost: payload.locationLost,
          },
          select: { claimId: true },
        });

        if (payload.images.length > 0) {
          await tx.itemImage.createMany({
            data: payload.images.map((image) => ({
              claimId: created.claimId,
              imageUrl: image.imageUrl,
              uploadedBy: actor.userId,
              fileType: image.fileType,
              fileSizeKb: image.fileSizeKb,
            })),
          });
        }

        await notifySecurityOfNewClaim(tx, {
          claimId: created.claimId,
          campusId,
        });

        const nextClaim = await tx.claim.findUniqueOrThrow({
          where: { claimId: created.claimId },
          select: claimDetailSelect,
        });

        const studentNotification = await tx.notification.create({
          data: createClaimSubmittedNotificationInput(nextClaim),
          select: studentNotificationEmailSelect,
        });

        return { claim: nextClaim, notification: studentNotification };
      });

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_created',
        entityType: 'claim',
        entityId: claim.claimId,
        details: {
          category: claim.category,
          campusId: claim.campusId,
          status: claim.status,
        },
        ipAddress: req.ip,
      });

      await deliverStudentClaimEmail(notification, claim, {
        actorId: actor.userId,
        ipAddress: req.ip,
        event: 'claim_created',
      });

      scheduleClaimSearchIndexIngest(claim.claimId, {
        category: claim.category,
        itemName: claim.itemName,
        description: claim.description,
        additionalInfo: claim.additionalInfo,
        locationLost: claim.locationLost,
      });

      res.status(201).json(await toClaimDetailDto(claim));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims:
 *   get:
 *     summary: List claims for the current role scope
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [submitted, under_review, approved, rejected, picked_up]
 *       - in: query
 *         name: campusId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: itemId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       '200':
 *         description: Paginated claim list
 *       '400':
 *         description: Invalid query parameters
 *       '401':
 *         description: Missing or invalid token
 */
router.get(
  '/',
  authenticate,
  validateQuery(listClaimsQuerySchema),
  async (req, res, next) => {
    try {
      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const query = req.query as unknown as {
        status?: ClaimStatus;
        campusId?: string;
        studentId?: string;
        itemId?: string;
        cursor?: string;
        limit: number;
      };

      const baseWhere = getClaimListWhere(actor, query);
      const cursorWhere = query.cursor
        ? await getClaimListCursorWhere(query.cursor)
        : {};

      const claims = await prisma.claim.findMany({
        where: {
          AND: [baseWhere, cursorWhere],
        },
        orderBy: claimListOrderBy,
        take: query.limit + 1,
        select: claimListSelect,
      });

      const nextCursor =
        claims.length > query.limit ? claims[query.limit].claimId : null;
      const data = await Promise.all(
        claims.slice(0, query.limit).map((claim) => toClaimListItemDto(claim))
      );

      res.status(200).json({ data, nextCursor });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}:
 *   get:
 *     summary: Get claim detail
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Claim detail
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim not found
 */
router.get('/:claimId', authenticate, async (req, res, next) => {
  try {
    const params = claimParamsSchema.safeParse(req.params);
    if (!params.success) {
      sendValidationError(res, params.error.issues);
      return;
    }

    const actor = await loadRequestUser(req.user!.user_id);
    if (!ensureActiveRequestUser(actor, res)) {
      return;
    }

    const claim = await prisma.claim.findUnique({
      where: { claimId: params.data.claimId },
      select: claimDetailSelect,
    });

    if (!claim) {
      res.status(404).json({
        code: 'CLAIM_NOT_FOUND',
        message: 'Claim not found.',
      });
      return;
    }

    if (!canAccessClaim(actor, claim)) {
      res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
      return;
    }

    res.status(200).json(await toClaimDetailDto(claim));
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/claims/{claimId}:
 *   delete:
 *     summary: Delete a cancellable claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Claim deleted
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim not found
 *       '409':
 *         description: Claim can no longer be deleted
 */
router.delete(
  '/:claimId',
  authenticate,
  requireRole('student'),
  async (req, res, next) => {
    try {
      const params = claimParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: params.data.claimId },
        select: claimDetailSelect,
      });

      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      if (claim.studentId !== actor.userId) {
        res.status(403).json({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        });
        return;
      }

      if (!cancellableClaimStatuses.has(claim.status)) {
        res.status(409).json({
          code: 'CLAIM_NOT_CANCELLABLE',
          message: 'Only submitted claims can be deleted.',
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await notifySecurityOfClaimCancellation(tx, claim);
        await tx.matchSuggestion.deleteMany({
          where: { claimId: claim.claimId },
        });
        await tx.claim.delete({
          where: { claimId: claim.claimId },
        });
      });

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_deleted',
        entityType: 'claim',
        entityId: claim.claimId,
        details: {
          previousStatus: claim.status,
        },
        ipAddress: req.ip,
      });

      res.status(200).json({ deleted: true, claimId: claim.claimId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}:
 *   patch:
 *     summary: Link a stored item to a claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [itemId]
 *             properties:
 *               itemId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       '200':
 *         description: Linked claim
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim or item not found
 *       '409':
 *         description: Item cannot be linked
 */
router.patch(
  '/:claimId',
  authenticate,
  requireRole('security', 'admin'),
  validate(linkClaimItemSchema),
  async (req, res, next) => {
    try {
      const params = claimParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: params.data.claimId },
        select: claimDetailSelect,
      });
      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      if (claim.status === ClaimStatus.picked_up) {
        res.status(409).json({
          code: 'CLAIM_LOCKED',
          message: 'A picked-up claim can no longer be relinked.',
        });
        return;
      }

      const { itemId } = req.body as { itemId: string };
      const item = await prisma.item.findUnique({
        where: { itemId },
        select: {
          itemId: true,
          status: true,
        },
      });

      if (!item) {
        res.status(404).json({
          code: 'ITEM_NOT_FOUND',
          message: 'Item not found.',
        });
        return;
      }

      if (item.status !== ItemStatus.stored) {
        res.status(409).json({
          code: 'ITEM_NOT_STORED',
          message: 'Only stored items can be linked to a claim.',
        });
        return;
      }

      const {
        claim: updated,
        matchNotification,
        statusNotification,
      } = await prisma.$transaction(async (tx) =>
        applyMatchConfirmation(tx, claim, item.itemId, actor.userId)
      );

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_item_linked',
        entityType: 'claim',
        entityId: claim.claimId,
        details: {
          previousItemId: claim.itemId,
          nextItemId: item.itemId,
        },
        ipAddress: req.ip,
      });

      await Promise.all([
        deliverStudentClaimEmail(matchNotification, updated, {
          actorId: actor.userId,
          ipAddress: req.ip,
          event: 'match_confirmed',
        }),
        deliverStudentClaimEmail(statusNotification, updated, {
          actorId: actor.userId,
          ipAddress: req.ip,
          event: 'claim_status_approved',
        }),
      ]);

      res.status(200).json(await toClaimDetailDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}/status:
 *   patch:
 *     summary: Transition a claim status
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [submitted, under_review, approved, rejected, picked_up]
 *               rejectionReason:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Updated claim
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim not found
 *       '409':
 *         description: Invalid status transition
 */
router.patch(
  '/:claimId/status',
  authenticate,
  requireRole('security', 'admin'),
  validate(updateClaimStatusSchema),
  async (req, res, next) => {
    try {
      const params = claimParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: params.data.claimId },
        select: claimDetailSelect,
      });
      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      const { status, rejectionReason } = req.body as {
        status: ClaimStatus;
        rejectionReason?: string;
      };

      if (!validStatusTransitions[claim.status].includes(status)) {
        res.status(409).json({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot change claim status from ${claim.status} to ${status}.`,
        });
        return;
      }

      if (status === ClaimStatus.rejected && !rejectionReason) {
        res.status(400).json({
          code: 'REJECTION_REASON_REQUIRED',
          message: 'A rejection reason is required when rejecting a claim.',
        });
        return;
      }

      if (
        (status === ClaimStatus.approved || status === ClaimStatus.picked_up) &&
        !claim.itemId
      ) {
        res.status(409).json({
          code: 'CLAIM_ITEM_REQUIRED',
          message: 'A claim must be linked to an item before it can advance.',
        });
        return;
      }

      const { claim: updated, notification } = await prisma.$transaction(
        async (tx) => {
          if (status === ClaimStatus.approved && claim.itemId) {
            await reserveItemForClaim(tx, claim.itemId);
          }

          if (status === ClaimStatus.picked_up && claim.itemId) {
            const item = await tx.item.findUnique({
              where: { itemId: claim.itemId },
              select: { itemId: true, status: true },
            });

            if (!item) {
              throw new Error('LINKED_ITEM_NOT_FOUND');
            }

            if (item.status === ItemStatus.stored) {
              await tx.item.update({
                where: { itemId: item.itemId },
                data: { status: ItemStatus.claimed },
              });
            }
          }

          const nextClaim = await tx.claim.update({
            where: { claimId: claim.claimId },
            data: {
              status,
              rejectionReason:
                status === ClaimStatus.rejected ? rejectionReason : null,
              reviewedBy: actor.userId,
              reviewedAt: new Date(),
              ...(status === ClaimStatus.picked_up
                ? {
                    pickedUpAt: new Date(),
                    verifiedBy: actor.userId,
                  }
                : {}),
            },
            select: claimDetailSelect,
          });

          const notification = await tx.notification.create({
            data: createClaimStatusNotificationInput(nextClaim, status),
            select: studentNotificationEmailSelect,
          });

          await writeAuditLog(
            {
              actorId: actor.userId,
              action: 'claim_notification_sent',
              entityType: 'notification',
              entityId: notification.notificationId,
              details: {
                claimId: nextClaim.claimId,
                recipientId: nextClaim.studentId,
                claimStatus: status,
              },
              ipAddress: req.ip,
            },
            tx
          );

          return { claim: nextClaim, notification };
        }
      );

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_status_updated',
        entityType: 'claim',
        entityId: claim.claimId,
        details: {
          previousStatus: claim.status,
          nextStatus: status,
          rejectionReason: rejectionReason ?? null,
        },
        ipAddress: req.ip,
      });

      await deliverStudentClaimEmail(notification, updated, {
        actorId: actor.userId,
        ipAddress: req.ip,
        event: `claim_status_${status}`,
      });

      res.status(200).json(await toClaimDetailDto(updated));
    } catch (err) {
      if (err instanceof Error && err.name === 'LINKED_ITEM_NOT_STORED') {
        res.status(409).json({
          code: 'LINKED_ITEM_NOT_STORED',
          message: 'The linked item must still be stored before approval.',
        });
        return;
      }

      if (err instanceof Error && err.message === 'LINKED_ITEM_NOT_FOUND') {
        res.status(404).json({
          code: 'LINKED_ITEM_NOT_FOUND',
          message: 'The linked item no longer exists.',
        });
        return;
      }

      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}/match-suggestions:
 *   get:
 *     summary: List match suggestions for a claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Match suggestions
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim not found
 */
router.get(
  '/:claimId/match-suggestions',
  authenticate,
  requireRole('security', 'admin'),
  async (req, res, next) => {
    try {
      const params = claimParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: params.data.claimId },
        select: { claimId: true },
      });
      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      const matches = await prisma.matchSuggestion.findMany({
        where: { claimId: claim.claimId },
        orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
        select: matchSuggestionSelect,
      });

      res.status(200).json(matches.map((match) => toMatchSuggestionDto(match)));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}/match-suggestions:
 *   post:
 *     summary: Generate match suggestions for a claim
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Generated match suggestions
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Claim not found
 */
router.post(
  '/:claimId/match-suggestions',
  authenticate,
  requireRole('security', 'admin'),
  async (req, res, next) => {
    try {
      const params = claimParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: params.data.claimId },
        select: claimDetailSelect,
      });
      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      const { candidateCount, suggestionCount } =
        await refreshClaimMatchSuggestions(claim.claimId);

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_match_suggestions_generated',
        entityType: 'claim',
        entityId: claim.claimId,
        details: {
          candidateCount,
          suggestionCount,
        },
        ipAddress: req.ip,
      });

      const matches = await prisma.matchSuggestion.findMany({
        where: { claimId: claim.claimId },
        orderBy: [{ matchScore: 'desc' }, { createdAt: 'desc' }],
        select: matchSuggestionSelect,
      });

      res.status(200).json(matches.map((match) => toMatchSuggestionDto(match)));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/claims/{claimId}/match-suggestions/{matchId}:
 *   patch:
 *     summary: Review a match suggestion
 *     tags: [Claims]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: claimId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [confirmed, dismissed, rejected]
 *     responses:
 *       '200':
 *         description: Reviewed match suggestion
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Match suggestion not found
 *       '409':
 *         description: Suggested item can no longer be confirmed
 */
router.patch(
  '/:claimId/match-suggestions/:matchId',
  authenticate,
  requireRole('security', 'admin'),
  validate(reviewMatchSuggestionSchema),
  async (req, res, next) => {
    try {
      const params = claimAndMatchParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const actor = await loadRequestUser(req.user!.user_id);
      if (!ensureActiveRequestUser(actor, res)) {
        return;
      }

      const match = await prisma.matchSuggestion.findFirst({
        where: {
          claimId: params.data.claimId,
          matchId: params.data.matchId,
        },
        select: matchSuggestionSelect,
      });

      if (!match) {
        res.status(404).json({
          code: 'MATCH_SUGGESTION_NOT_FOUND',
          message: 'Match suggestion not found.',
        });
        return;
      }

      const claim = await prisma.claim.findUnique({
        where: { claimId: match.claimId },
        select: { claimId: true, studentId: true },
      });

      if (!claim) {
        res.status(404).json({
          code: 'CLAIM_NOT_FOUND',
          message: 'Claim not found.',
        });
        return;
      }

      const { status } = req.body as { status: MatchStatus };

      const { updated, confirmedMatchEmail } = await prisma.$transaction(
        async (tx) => {
          let matchEmail: {
            claim: ClaimDetailRow;
            matchNotification: StudentNotificationEmailRow;
            statusNotification: StudentNotificationEmailRow;
          } | null = null;

          if (status === MatchStatus.confirmed) {
            const item = await tx.item.findUnique({
              where: { itemId: match.itemId },
              select: { itemId: true, status: true },
            });

            if (!item) {
              throw new Error('MATCH_ITEM_NOT_FOUND');
            }

            if (item.status !== ItemStatus.stored) {
              const conflictError = new Error('MATCH_ITEM_NOT_STORED');
              conflictError.name = 'MATCH_ITEM_NOT_STORED';
              throw conflictError;
            }

            matchEmail = await applyMatchConfirmation(
              tx,
              { claimId: match.claimId, studentId: claim.studentId },
              match.itemId,
              actor.userId
            );
          }

          await tx.matchSuggestion.updateMany({
            where: {
              claimId: match.claimId,
              matchId: { not: match.matchId },
              status: MatchStatus.confirmed,
            },
            data: {
              status: MatchStatus.dismissed,
              reviewedBy: actor.userId,
              reviewedAt: new Date(),
            },
          });

          const updatedSuggestion = await tx.matchSuggestion.update({
            where: { matchId: match.matchId },
            data: {
              status,
              reviewedBy: actor.userId,
              reviewedAt: new Date(),
            },
            select: matchSuggestionSelect,
          });

          return {
            updated: updatedSuggestion,
            confirmedMatchEmail: matchEmail,
          };
        }
      );

      await writeAuditLog({
        actorId: actor.userId,
        action: 'claim_match_suggestion_reviewed',
        entityType: 'match_suggestion',
        entityId: match.matchId,
        details: {
          claimId: match.claimId,
          previousStatus: match.status,
          nextStatus: status,
        },
        ipAddress: req.ip,
      });

      if (confirmedMatchEmail) {
        await Promise.all([
          deliverStudentClaimEmail(
            confirmedMatchEmail.matchNotification,
            confirmedMatchEmail.claim,
            {
              actorId: actor.userId,
              ipAddress: req.ip,
              event: 'match_confirmed',
            }
          ),
          deliverStudentClaimEmail(
            confirmedMatchEmail.statusNotification,
            confirmedMatchEmail.claim,
            {
              actorId: actor.userId,
              ipAddress: req.ip,
              event: 'claim_status_approved',
            }
          ),
        ]);
      }

      res.status(200).json(toMatchSuggestionDto(updated));
    } catch (err) {
      if (err instanceof Error && err.name === 'MATCH_ITEM_NOT_STORED') {
        res.status(409).json({
          code: 'MATCH_ITEM_NOT_STORED',
          message: 'Only stored items can be confirmed as a match.',
        });
        return;
      }

      if (err instanceof Error && err.message === 'MATCH_ITEM_NOT_FOUND') {
        res.status(404).json({
          code: 'MATCH_ITEM_NOT_FOUND',
          message: 'The matched item no longer exists.',
        });
        return;
      }

      next(err);
    }
  }
);

export default router;
