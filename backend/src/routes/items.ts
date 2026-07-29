import { Router, Response } from 'express';
import { ClaimStatus, ItemStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { validateQuery, validate } from '../validators/shared';
import { resolveImageUrl } from '../utils/imageUrl';
import {
  auditContextFromRequest,
  type AuditLogParams,
  writeAuditLog,
  writeAuditLogs,
  writeAuditLogBestEffort,
} from '../utils/auditLog';
import { scheduleItemSearchIndexIngest } from '../lib/matching/ingest';
import { scheduleMatchRefreshForCampus } from '../lib/matching/suggestions';
import {
  itemParamsSchema,
  listSecurityItemsQuerySchema,
  publicItemsQuerySchema,
  expiredItemCountQuerySchema,
  updateSecurityItemSchema,
  createSecurityItemSchema,
  walkInReleaseSchema,
  updateSecurityItemStatusSchema,
  UpdateSecurityItemInput,
  UpdateSecurityItemStatusInput,
  CreateSecurityItemInput,
  WalkInReleaseInput,
} from '../validators/items';

function computeRetentionExpiryDate(
  dateFound: Date,
  retentionDays: number
): Date {
  const expiry = new Date(dateFound);
  expiry.setUTCDate(expiry.getUTCDate() + retentionDays);
  return expiry;
}

const router = Router();
const publicItemStatuses = [ItemStatus.stored] as const;

const validItemStatusTransitions: Record<ItemStatus, ItemStatus[]> = {
  [ItemStatus.pending_report]: [ItemStatus.expired, ItemStatus.disposed],
  [ItemStatus.stored]: [ItemStatus.expired, ItemStatus.disposed],
  [ItemStatus.expired]: [ItemStatus.disposed],
  [ItemStatus.claimed]: [],
  [ItemStatus.disposed]: [],
};

const publicItemSelect = {
  itemId: true,
  campusId: true,
  category: true,
  title: true,
  descriptionPublic: true,
  color: true,
  brand: true,
  locationFound: true,
  dateFound: true,
  status: true,
} as const;

const securityItemListSelect = {
  itemId: true,
  campusId: true,
  category: true,
  title: true,
  dateFound: true,
  status: true,
  retentionExpiryDate: true,
  campus: {
    select: {
      campusName: true,
    },
  },
  images: {
    select: {
      imageUrl: true,
    },
    take: 1,
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
} as const;

const securityItemDetailSelect = {
  itemId: true,
  campusId: true,
  category: true,
  title: true,
  descriptionPublic: true,
  descriptionInternal: true,
  color: true,
  brand: true,
  locationFound: true,
  dateFound: true,
  status: true,
  foundItemReportId: true,
  retentionExpiryDate: true,
  createdAt: true,
  updatedAt: true,
  campus: {
    select: {
      campusName: true,
    },
  },
  registrar: {
    select: {
      userId: true,
      firstName: true,
      lastName: true,
    },
  },
  images: {
    select: {
      imageId: true,
      imageUrl: true,
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
  claims: {
    select: {
      claimId: true,
      status: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc' as const,
    },
  },
  foundItemReport: {
    select: {
      finder: {
        select: {
          userId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
} as const;

type SecurityItemListRow = Prisma.ItemGetPayload<{
  select: typeof securityItemListSelect;
}>;

type SecurityItemDetailRow = Prisma.ItemGetPayload<{
  select: typeof securityItemDetailSelect;
}>;

function sendValidationError(res: Response, details: unknown) {
  res.status(400).json({
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details,
  });
}

function buildPublicItemWhere(query: { category?: string; campusId?: string }) {
  const where: Prisma.ItemWhereInput = {
    status: { in: [...publicItemStatuses] },
  };

  if (query.category) {
    where.category = query.category;
  }

  if (query.campusId) {
    where.campusId = query.campusId;
  }

  return where;
}

function buildSecurityItemListWhere(query: {
  status?: ItemStatus;
  campusId?: string;
  category?: string;
}) {
  const where: Prisma.ItemWhereInput = {};

  if (query.status) {
    where.status = query.status;
  } else {
    // Default list: inventory still in workflow (excludes released and discarded).
    where.status = { notIn: [ItemStatus.claimed, ItemStatus.disposed] };
  }

  if (query.campusId) {
    where.campusId = query.campusId;
  }

  if (query.category) {
    where.category = query.category;
  }

  return where;
}

async function toSecurityItemListDto(item: SecurityItemListRow) {
  const storedImageUrl = item.images[0]?.imageUrl ?? null;
  return {
    itemId: item.itemId,
    campusId: item.campusId,
    campusName: item.campus.campusName,
    category: item.category,
    title: item.title,
    dateFound: item.dateFound,
    status: item.status,
    retentionExpiryDate: item.retentionExpiryDate,
    imageUrl: storedImageUrl ? await resolveImageUrl(storedImageUrl) : null,
  };
}

async function toSecurityItemDetailDto(item: SecurityItemDetailRow) {
  const storedImageUrl = item.images[0]?.imageUrl ?? null;
  const resolvedImages = await Promise.all(
    item.images.map(async (image) => ({
      imageId: image.imageId,
      imageUrl: await resolveImageUrl(image.imageUrl),
    }))
  );

  return {
    itemId: item.itemId,
    campusId: item.campusId,
    campusName: item.campus.campusName,
    category: item.category,
    title: item.title,
    descriptionPublic: item.descriptionPublic,
    descriptionInternal: item.descriptionInternal,
    color: item.color,
    brand: item.brand,
    locationFound: item.locationFound,
    dateFound: item.dateFound,
    status: item.status,
    foundItemReportId: item.foundItemReportId,
    retentionExpiryDate: item.retentionExpiryDate,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    imageUrl: storedImageUrl ? await resolveImageUrl(storedImageUrl) : null,
    images: resolvedImages,
    registeredBy: {
      userId: item.registrar.userId,
      firstName: item.registrar.firstName,
      lastName: item.registrar.lastName,
    },
    claims: item.claims.map((claim) => ({
      claimId: claim.claimId,
      status: claim.status,
      studentName:
        `${claim.student.firstName} ${claim.student.lastName}`.trim(),
    })),
    finder: item.foundItemReport
      ? {
          userId: item.foundItemReport.finder.userId,
          firstName: item.foundItemReport.finder.firstName,
          lastName: item.foundItemReport.finder.lastName,
          email: item.foundItemReport.finder.email,
          phone: item.foundItemReport.finder.phone,
        }
      : null,
  };
}

/**
 * @openapi
 * /api/public/items:
 *   get:
 *     summary: Browse public-safe found items
 *     tags: [Public Items]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: campusId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Public-safe item list
 *       '400':
 *         description: Invalid query parameters
 */
router.get(
  '/public/items',
  validateQuery(publicItemsQuerySchema),
  async (req, res, next) => {
    try {
      const query = req.query as { category?: string; campusId?: string };

      const items = await prisma.item.findMany({
        where: buildPublicItemWhere(query),
        select: publicItemSelect,
        orderBy: [{ dateFound: 'desc' }, { createdAt: 'desc' }],
      });

      res.status(200).json(items);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/category-stats:
 *   get:
 *     summary: Get public-safe item counts grouped by category
 *     tags: [Public Items]
 *     parameters:
 *       - in: query
 *         name: campusId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Category counts for public browse
 *       '400':
 *         description: Invalid query parameters
 */
router.get(
  '/items/category-stats',
  validateQuery(publicItemsQuerySchema.pick({ campusId: true })),
  async (req, res, next) => {
    try {
      const { campusId } = req.query as { campusId?: string };

      const rows = await prisma.item.groupBy({
        by: ['category'],
        where: {
          status: { in: [...publicItemStatuses] },
          ...(campusId ? { campusId } : {}),
        },
        _count: {
          category: true,
        },
        orderBy: {
          category: 'asc',
        },
      });

      res.status(200).json(
        rows.map((row) => ({
          category: row.category,
          count: row._count.category,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items:
 *   get:
 *     summary: List items for security staff
 *     description: When status is omitted, released (claimed) and disposed items are excluded.
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_report, stored, claimed, expired, disposed]
 *       - in: query
 *         name: campusId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
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
 *         description: Paginated security item list
 *       '400':
 *         description: Invalid query parameters
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 */
router.get(
  '/items',
  authenticate,
  requireRole('security', 'admin'),
  validateQuery(listSecurityItemsQuerySchema),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as {
        status?: ItemStatus;
        campusId?: string;
        category?: string;
        cursor?: string;
        limit: number;
      };

      const items = await prisma.item.findMany({
        where: buildSecurityItemListWhere(query),
        orderBy: [
          { dateFound: 'desc' },
          { createdAt: 'desc' },
          { itemId: 'desc' },
        ],
        take: query.limit + 1,
        ...(query.cursor
          ? {
              cursor: { itemId: query.cursor },
              skip: 1,
            }
          : {}),
        select: securityItemListSelect,
      });

      const nextCursor =
        items.length > query.limit ? items[query.limit].itemId : null;
      const data = await Promise.all(
        items.slice(0, query.limit).map((item) => toSecurityItemListDto(item))
      );

      res.status(200).json({ data, nextCursor });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items:
 *   post:
 *     summary: Register a found item into inventory (security direct intake)
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [campusId, title, description, category, locationFound, dateFound]
 *             properties:
 *               campusId:
 *                 type: string
 *                 format: uuid
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
 *               images:
 *                 type: array
 *     responses:
 *       '201':
 *         description: Created security item detail
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Campus not found
 */
router.post(
  '/items',
  authenticate,
  requireRole('security', 'admin'),
  validate(createSecurityItemSchema),
  async (req, res, next) => {
    try {
      const {
        campusId,
        title,
        description,
        category,
        locationFound,
        dateFound,
        images,
      } = req.body as CreateSecurityItemInput;

      const campus = await prisma.campus.findUnique({
        where: { campusId },
        select: { campusId: true, retentionDays: true },
      });

      if (!campus) {
        res.status(404).json({
          code: 'CAMPUS_NOT_FOUND',
          message: 'Campus not found.',
        });
        return;
      }

      const createContext = auditContextFromRequest(req);
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.item.create({
          data: {
            campusId,
            category,
            title,
            descriptionInternal: description.trim(),
            locationFound,
            dateFound,
            status: ItemStatus.stored,
            foundItemReportId: null,
            registeredBy: req.user!.user_id,
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
              itemId: created.itemId,
              imageUrl: image.imageUrl,
              uploadedBy: req.user!.user_id,
              fileType: image.fileType,
              fileSizeKb: image.fileSizeKb,
            })),
          });
        }

        await writeAuditLog(
          {
            actorId: req.user!.user_id,
            actorType: 'user',
            actorRole: req.user!.role,
            action: 'item_created',
            entityType: 'item',
            entityId: created.itemId,
            entityLabel: `${title} (${category})`,
            outcome: 'success',
            details: {
              category,
              campusId,
              dateFound: dateFound.toISOString().slice(0, 10),
              imageCount: images.length,
              source: 'security_direct_intake',
            },
            ...createContext,
          },
          tx
        );

        return created;
      });

      const detail = await prisma.item.findUnique({
        where: { itemId: item.itemId },
        select: securityItemDetailSelect,
      });

      if (!detail) {
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Item was created but could not be loaded.',
        });
        return;
      }

      scheduleItemSearchIndexIngest(detail.itemId, {
        category: detail.category,
        title: detail.title,
        descriptionPublic: detail.descriptionPublic,
        descriptionInternal: detail.descriptionInternal,
        brand: detail.brand,
        color: detail.color,
        locationFound: detail.locationFound,
      });
      scheduleMatchRefreshForCampus(campusId);

      res.status(201).json(await toSecurityItemDetailDto(detail));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/expired-count:
 *   get:
 *     summary: Count items with expired retention status
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: campusId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Expired item count
 *       '400':
 *         description: Invalid query parameters
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 */
router.get(
  '/items/expired-count',
  authenticate,
  requireRole('security', 'admin'),
  validateQuery(expiredItemCountQuerySchema),
  async (req, res, next) => {
    try {
      const { campusId } = req.query as { campusId?: string };

      const count = await prisma.item.count({
        where: {
          status: ItemStatus.expired,
          ...(campusId ? { campusId } : {}),
        },
      });

      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/{itemId}:
 *   get:
 *     summary: Get item detail for security staff
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Security item detail
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Item not found
 */
router.get(
  '/items/:itemId',
  authenticate,
  requireRole('security', 'admin'),
  async (req, res, next) => {
    try {
      const params = itemParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const item = await prisma.item.findUnique({
        where: { itemId: params.data.itemId },
        select: securityItemDetailSelect,
      });

      if (!item) {
        res.status(404).json({
          code: 'ITEM_NOT_FOUND',
          message: 'Item not found.',
        });
        return;
      }

      res.status(200).json(await toSecurityItemDetailDto(item));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/{itemId}/status:
 *   patch:
 *     summary: Update item inventory status (expire or dispose)
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
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
 *                 enum: [expired, disposed]
 *               note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Updated security item detail
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Item not found
 *       '409':
 *         description: Invalid transition or item has approved claim
 */
router.patch(
  '/items/:itemId/status',
  authenticate,
  requireRole('security', 'admin'),
  validate(updateSecurityItemStatusSchema),
  async (req, res, next) => {
    try {
      const params = itemParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const existing = await prisma.item.findUnique({
        where: { itemId: params.data.itemId },
        select: {
          itemId: true,
          title: true,
          category: true,
          status: true,
          retentionExpiryDate: true,
        },
      });

      if (!existing) {
        res.status(404).json({
          code: 'ITEM_NOT_FOUND',
          message: 'Item not found.',
        });
        return;
      }

      const existingLabel = `${existing.title} (${existing.category})`;

      const { status: targetStatus, note } =
        req.body as UpdateSecurityItemStatusInput;

      const allowedTargets = validItemStatusTransitions[existing.status];
      if (!allowedTargets.includes(targetStatus)) {
        const context = auditContextFromRequest(req);
        await writeAuditLogBestEffort({
          actorId: req.user!.user_id,
          actorType: 'user',
          actorRole: req.user!.role,
          action: 'item_status_denied',
          entityType: 'item',
          entityId: existing.itemId,
          entityLabel: existingLabel,
          outcome: 'denied',
          reasonCode: 'invalid_status_transition',
          details: {
            previousStatus: existing.status,
            requestedStatus: targetStatus,
          },
          ...context,
        });
        const isTerminal =
          existing.status === ItemStatus.claimed ||
          existing.status === ItemStatus.disposed;
        res.status(409).json({
          code: isTerminal
            ? 'ITEM_ALREADY_TERMINAL'
            : 'INVALID_STATUS_TRANSITION',
          message: isTerminal
            ? 'This item status can no longer be changed.'
            : `Cannot change item status from ${existing.status} to ${targetStatus}.`,
        });
        return;
      }

      const rejectionReason =
        note ??
        (targetStatus === ItemStatus.expired
          ? 'Item was marked expired by security.'
          : 'Item was marked disposed by security.');

      const statusContext = auditContextFromRequest(req);
      const result = await prisma.$transaction(async (tx) => {
        const approvedClaim = await tx.claim.findFirst({
          where: {
            itemId: existing.itemId,
            status: ClaimStatus.approved,
          },
          select: { claimId: true },
        });

        if (approvedClaim) {
          return { blocked: true as const };
        }

        const affectedClaims = await tx.claim.findMany({
          where: {
            itemId: existing.itemId,
            status: {
              in: [ClaimStatus.submitted, ClaimStatus.under_review],
            },
          },
          select: { claimId: true, status: true },
        });

        await tx.claim.updateMany({
          where: {
            itemId: existing.itemId,
            status: {
              in: [
                ClaimStatus.submitted,
                ClaimStatus.under_review,
                ClaimStatus.approved,
              ],
            },
          },
          data: {
            status: ClaimStatus.rejected,
            rejectionReason,
            reviewedBy: req.user!.user_id,
            reviewedAt: new Date(),
          },
        });

        const item = await tx.item.update({
          where: { itemId: existing.itemId },
          data: { status: targetStatus },
          select: securityItemDetailSelect,
        });

        await writeAuditLogs(
          [
            {
              actorId: req.user!.user_id,
              actorType: 'user',
              actorRole: req.user!.role,
              action: 'item_status_updated',
              entityType: 'item',
              entityId: item.itemId,
              entityLabel: `${item.title} (${item.category})`,
              outcome: 'success',
              details: {
                previousStatus: existing.status,
                nextStatus: targetStatus,
                reasonCategory: note
                  ? 'security_note_supplied'
                  : 'security_action',
                retentionExpiryDate:
                  existing.retentionExpiryDate?.toISOString() ?? null,
              },
              ...statusContext,
            },
            ...affectedClaims.map(
              (claim): AuditLogParams => ({
                actorId: req.user!.user_id,
                actorType: 'user',
                actorRole: req.user!.role,
                action: 'claim_status_updated',
                entityType: 'claim',
                entityId: claim.claimId,
                entityLabel: `${item.title} (${item.category})`,
                outcome: 'success',
                details: {
                  previousStatus: claim.status,
                  nextStatus: ClaimStatus.rejected,
                  reasonCategory: 'item_lifecycle_transition',
                  itemId: existing.itemId,
                },
                ...statusContext,
              })
            ),
          ],
          tx
        );

        return { blocked: false as const, item };
      });

      if (result.blocked) {
        await writeAuditLogBestEffort({
          actorId: req.user!.user_id,
          actorType: 'user',
          actorRole: req.user!.role,
          action: 'item_status_denied',
          entityType: 'item',
          entityId: existing.itemId,
          entityLabel: existingLabel,
          outcome: 'denied',
          reasonCode: 'approved_claim_conflict',
          details: {
            previousStatus: existing.status,
            requestedStatus: targetStatus,
          },
          ...statusContext,
        });
        res.status(409).json({
          code: 'ITEM_HAS_APPROVED_CLAIM',
          message:
            'This item has an approved claim and cannot be expired or disposed.',
        });
        return;
      }

      const updated = result.item;

      res.status(200).json(await toSecurityItemDetailDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/{itemId}:
 *   patch:
 *     summary: Update item fields for security staff
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
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
 *             required: [title, category, dateFound, locationFound, descriptionInternal]
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               dateFound:
 *                 type: string
 *                 format: date
 *               locationFound:
 *                 type: string
 *                 nullable: true
 *               descriptionInternal:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Updated security item detail
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Item not found
 */
router.patch(
  '/items/:itemId',
  authenticate,
  requireRole('security', 'admin'),
  validate(updateSecurityItemSchema),
  async (req, res, next) => {
    try {
      const params = itemParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const existing = await prisma.item.findUnique({
        where: { itemId: params.data.itemId },
        select: {
          itemId: true,
          campusId: true,
          dateFound: true,
        },
      });

      if (!existing) {
        res.status(404).json({
          code: 'ITEM_NOT_FOUND',
          message: 'Item not found.',
        });
        return;
      }

      const { title, category, dateFound, locationFound, descriptionInternal } =
        req.body as UpdateSecurityItemInput;

      const campus = await prisma.campus.findUnique({
        where: { campusId: existing.campusId },
        select: { retentionDays: true },
      });

      if (!campus) {
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Item campus is no longer available.',
        });
        return;
      }

      const dateChanged =
        existing.dateFound.toISOString().slice(0, 10) !==
        dateFound.toISOString().slice(0, 10);

      const updateContext = auditContextFromRequest(req);
      const changedFields = [
        'title',
        'category',
        'dateFound',
        'locationFound',
        'descriptionInternal',
        ...(dateChanged ? ['retentionExpiryDate'] : []),
      ];
      const updated = await prisma.$transaction(async (tx) => {
        const item = await tx.item.update({
          where: { itemId: existing.itemId },
          data: {
            title,
            category,
            dateFound,
            locationFound,
            descriptionInternal,
            ...(dateChanged
              ? {
                  retentionExpiryDate: computeRetentionExpiryDate(
                    dateFound,
                    campus.retentionDays
                  ),
                }
              : {}),
          },
          select: securityItemDetailSelect,
        });
        await writeAuditLog(
          {
            actorId: req.user!.user_id,
            actorType: 'user',
            actorRole: req.user!.role,
            action: 'item_updated',
            entityType: 'item',
            entityId: item.itemId,
            entityLabel: `${item.title} (${item.category})`,
            outcome: 'success',
            details: { changedFields },
            ...updateContext,
          },
          tx
        );
        return item;
      });

      scheduleItemSearchIndexIngest(updated.itemId, {
        category: updated.category,
        title: updated.title,
        descriptionPublic: updated.descriptionPublic,
        descriptionInternal: updated.descriptionInternal,
        brand: updated.brand,
        color: updated.color,
        locationFound: updated.locationFound,
      });

      res.status(200).json(await toSecurityItemDetailDto(updated));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/items/{itemId}/walk-in-release:
 *   post:
 *     summary: Release an item to a walk-in student without a prior claim
 *     tags: [Items]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
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
 *             required: [studentFullName, idVerified, contactNumber]
 *             properties:
 *               studentFullName:
 *                 type: string
 *               idVerified:
 *                 type: string
 *               contactNumber:
 *                 type: string
 *               verificationNote:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       '200':
 *         description: Updated security item detail
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Missing or invalid token
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Item not found
 *       '409':
 *         description: Item is not in storage
 */
router.post(
  '/items/:itemId/walk-in-release',
  authenticate,
  requireRole('security', 'admin'),
  validate(walkInReleaseSchema),
  async (req, res, next) => {
    try {
      const params = itemParamsSchema.safeParse(req.params);
      if (!params.success) {
        sendValidationError(res, params.error.issues);
        return;
      }

      const { studentFullName, idVerified, contactNumber, verificationNote } =
        req.body as WalkInReleaseInput;

      const actor = await prisma.user.findUnique({
        where: { userId: req.user!.user_id },
        select: { userId: true, firstName: true, lastName: true },
      });

      if (!actor) {
        res.status(401).json({
          code: 'USER_NOT_FOUND',
          message: 'Authenticated user not found.',
        });
        return;
      }

      const existing = await prisma.item.findUnique({
        where: { itemId: params.data.itemId },
        select: { itemId: true },
      });

      if (!existing) {
        res.status(404).json({
          code: 'ITEM_NOT_FOUND',
          message: 'Item not found.',
        });
        return;
      }

      const releasedAt = new Date();
      const releaseContext = auditContextFromRequest(req);

      const result = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.item.updateMany({
          where: {
            itemId: existing.itemId,
            status: ItemStatus.stored,
          },
          data: { status: ItemStatus.claimed },
        });

        if (updateResult.count === 0) {
          return { released: false as const };
        }

        const updated = await tx.item.findUniqueOrThrow({
          where: { itemId: existing.itemId },
          select: securityItemDetailSelect,
        });

        await writeAuditLog(
          {
            actorId: actor.userId,
            actorType: 'user',
            actorRole: req.user!.role,
            action: 'item_walk_in_released',
            entityType: 'item',
            entityId: updated.itemId,
            entityLabel: `${updated.title} (${updated.category})`,
            outcome: 'success',
            details: {
              releaseType: 'walk_in_no_claim',
              idVerified,
              verificationNoteProvided: Boolean(verificationNote),
              contactProvided: Boolean(contactNumber),
              studentNameProvided: Boolean(studentFullName),
              releasedAt: releasedAt.toISOString(),
            },
            ...releaseContext,
          },
          tx
        );

        return { released: true as const, item: updated };
      });

      if (!result.released) {
        res.status(409).json({
          code: 'ITEM_NOT_STORED',
          message: 'Only items in storage can be released.',
        });
        return;
      }

      res.status(200).json(await toSecurityItemDetailDto(result.item));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
