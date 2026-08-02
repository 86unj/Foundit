import crypto from 'crypto';
import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { prisma } from '../db';
import { r2, R2_BUCKET } from '../lib/r2';
import { generateReportLinkToken } from '../utils/reportLinkToken';
import { resolveImageUrl } from '../utils/imageUrl';
import { validate } from '../validators/shared';
import {
  createPhotoSessionSchema,
  photoSessionPresignSchema,
  photoSessionTokenParamsSchema,
  registerPhotoSessionImageSchema,
} from '../validators/photoSessions';
import {
  auditContextFromRequest,
  writeAuditLog,
  writeAuditLogBestEffort,
} from '../utils/auditLog';
import { getUploadSizeCategory } from '../utils/uploadMetadata';

const MAX_IMAGES_PER_SESSION = 3;

class PhotoSessionFullError extends Error {
  readonly code = 'PHOTO_SESSION_FULL';

  constructor() {
    super(`Maximum ${MAX_IMAGES_PER_SESSION} images per session.`);
    this.name = 'PhotoSessionFullError';
  }
}

const router = Router();

const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many photo session requests. Try again later.',
  },
});

const sessionSelect = {
  sessionId: true,
  token: true,
  createdBy: true,
  expiresAt: true,
} as const;

function setNoStoreHeader(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
}

function parseParamsToken(rawToken: unknown): string | null {
  const parsed = photoSessionTokenParamsSchema.safeParse({ token: rawToken });
  return parsed.success ? parsed.data.token : null;
}

function getSessionAvailability(session: { expiresAt: Date } | null) {
  if (!session) {
    return { valid: false, reason: 'not_found' as const };
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    return { valid: false, reason: 'expired' as const };
  }

  return { valid: true, reason: 'available' as const };
}

async function findActiveSession(token: string) {
  const session = await prisma.photoUploadSession.findUnique({
    where: { token },
    select: {
      ...sessionSelect,
      _count: { select: { images: true } },
    },
  });

  if (!session) return null;

  const availability = getSessionAvailability(session);
  if (!availability.valid) return null;

  return session;
}

async function createPresignedReportUpload(
  key: string,
  contentType: string,
  fileSizeKb: number
) {
  const ext = contentType.split('/')[1];

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(r2, command, {
    expiresIn: 60 * 60,
  });

  return {
    uploadUrl,
    imageUrl: key,
    fileType: ext,
    fileSizeKb,
  };
}

router.post(
  '/',
  authenticate,
  requireRole('security'),
  validate(createPhotoSessionSchema),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);

      const { expiresInMinutes } = req.body as { expiresInMinutes: number };
      const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

      let token = generateReportLinkToken();
      const context = auditContextFromRequest(req);
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const session = await prisma.$transaction(async (tx) => {
            const created = await tx.photoUploadSession.create({
              data: {
                token,
                createdBy: req.user!.user_id,
                expiresAt,
              },
              select: sessionSelect,
            });
            await writeAuditLog(
              {
                actorId: req.user!.user_id,
                actorType: 'user',
                actorRole: req.user!.role,
                action: 'photo_session_created',
                entityType: 'photo_session',
                entityId: created.sessionId,
                outcome: 'success',
                details: { expiresAt: expiresAt.toISOString() },
                ...context,
              },
              tx
            );
            return created;
          });

          res.status(201).json({
            token: session.token,
            expiresAt: session.expiresAt.toISOString(),
          });
          return;
        } catch (err) {
          if (
            err instanceof Error &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            token = generateReportLinkToken();
            continue;
          }
          throw err;
        }
      }

      res.status(500).json({
        code: 'SESSION_CREATE_FAILED',
        message: 'Could not create photo session. Please try again.',
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:token/validate', publicRateLimiter, async (req, res, next) => {
  try {
    setNoStoreHeader(res);
    const token = parseParamsToken(req.params.token);
    if (!token) {
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ path: ['token'], message: 'Token is required' }],
      });
      return;
    }

    const session = await prisma.photoUploadSession.findUnique({
      where: { token },
      select: { expiresAt: true },
    });

    const availability = getSessionAvailability(session);

    res.status(200).json({
      ...availability,
      expiresAt: session?.expiresAt.toISOString() ?? null,
      maxImages: MAX_IMAGES_PER_SESSION,
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:token/presigned-url',
  publicRateLimiter,
  validate(photoSessionPresignSchema),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);
      const token = parseParamsToken(req.params.token);
      if (!token) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: ['token'], message: 'Token is required' }],
        });
        return;
      }

      const session = await findActiveSession(token);
      if (!session) {
        res.status(404).json({
          code: 'PHOTO_SESSION_NOT_FOUND',
          message: 'Photo session does not exist or has expired.',
        });
        return;
      }

      const { contentType, fileSizeKb } = req.body as {
        contentType: string;
        fileSizeKb: number;
      };

      try {
        const placeholder = await prisma.$transaction(async (tx) => {
          const imageCount = await tx.photoSessionImage.count({
            where: { sessionId: session.sessionId },
          });
          if (imageCount >= MAX_IMAGES_PER_SESSION) {
            throw new PhotoSessionFullError();
          }

          const ext = contentType.split('/')[1];
          const key = `reports/${crypto.randomUUID()}.${ext}`;

          return tx.photoSessionImage.create({
            data: {
              sessionId: session.sessionId,
              imageUrl: key,
              fileType: ext,
              fileSizeKb,
            },
            select: { imageId: true, imageUrl: true },
          });
        });

        try {
          const result = await createPresignedReportUpload(
            placeholder.imageUrl,
            contentType,
            fileSizeKb
          );
          await writeAuditLogBestEffort({
            actorType: 'anonymous',
            action: 'photo_upload_authorized',
            entityType: 'photo_session',
            entityId: session.sessionId,
            entityLabel: `photo session ${session.sessionId}`,
            outcome: 'success',
            details: {
              imageId: placeholder.imageId,
              contentType,
              sizeCategory: getUploadSizeCategory(fileSizeKb),
            },
            ...auditContextFromRequest(req),
          });
          res.status(200).json(result);
        } catch (err) {
          await prisma.photoSessionImage.delete({
            where: { imageId: placeholder.imageId },
          });
          throw err;
        }
      } catch (err) {
        if (err instanceof PhotoSessionFullError) {
          res.status(409).json({
            code: err.code,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:token/images',
  publicRateLimiter,
  validate(registerPhotoSessionImageSchema),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);
      const token = parseParamsToken(req.params.token);
      if (!token) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: ['token'], message: 'Token is required' }],
        });
        return;
      }

      const session = await findActiveSession(token);
      if (!session) {
        res.status(404).json({
          code: 'PHOTO_SESSION_NOT_FOUND',
          message: 'Photo session does not exist or has expired.',
        });
        return;
      }

      const { imageUrl, fileType, fileSizeKb } = req.body as {
        imageUrl: string;
        fileType: string;
        fileSizeKb: number;
      };

      const image = await prisma.photoSessionImage.findFirst({
        where: {
          sessionId: session.sessionId,
          imageUrl,
        },
        select: {
          imageId: true,
          imageUrl: true,
          fileType: true,
          fileSizeKb: true,
          createdAt: true,
        },
      });

      if (!image) {
        res.status(404).json({
          code: 'PHOTO_SESSION_IMAGE_NOT_FOUND',
          message:
            'No pending upload found for this image. Request a new upload URL.',
        });
        return;
      }

      if (image.fileType !== fileType || image.fileSizeKb !== fileSizeKb) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Image metadata does not match the reserved upload.',
        });
        return;
      }

      await writeAuditLog({
        actorType: 'anonymous',
        action: 'photo_image_registered',
        entityType: 'photo_session_image',
        entityId: image.imageId,
        entityLabel: `photo session ${session.sessionId}`,
        outcome: 'success',
        details: {
          sessionId: session.sessionId,
          fileType,
          sizeCategory: getUploadSizeCategory(fileSizeKb),
        },
        ...auditContextFromRequest(req),
      });

      res.status(201).json(image);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:token/images',
  authenticate,
  requireRole('security'),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);
      const token = parseParamsToken(req.params.token);
      if (!token) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: ['token'], message: 'Token is required' }],
        });
        return;
      }

      const session = await prisma.photoUploadSession.findUnique({
        where: { token },
        select: {
          sessionId: true,
          createdBy: true,
          expiresAt: true,
          images: {
            select: {
              imageId: true,
              imageUrl: true,
              fileType: true,
              fileSizeKb: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!session) {
        res.status(404).json({
          code: 'PHOTO_SESSION_NOT_FOUND',
          message: 'Photo session does not exist.',
        });
        return;
      }

      if (session.createdBy !== req.user!.user_id) {
        await writeAuditLogBestEffort({
          actorId: req.user!.user_id,
          actorType: 'user',
          actorRole: req.user!.role,
          action: 'photo_session_access_denied',
          entityType: 'photo_session',
          entityId: session.sessionId,
          entityLabel: `photo session ${session.sessionId}`,
          outcome: 'denied',
          reasonCode: 'session_ownership_mismatch',
          ...auditContextFromRequest(req),
        });
        res.status(403).json({
          code: 'FORBIDDEN',
          message: 'You do not have access to this photo session.',
        });
        return;
      }

      const availability = getSessionAvailability(session);

      const images = await Promise.all(
        session.images.map(async (image) => ({
          ...image,
          previewUrl: await resolveImageUrl(image.imageUrl),
        }))
      );

      res.status(200).json({
        ...availability,
        expiresAt: session.expiresAt.toISOString(),
        images,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:token/images/:imageId',
  authenticate,
  requireRole('security'),
  async (req, res, next) => {
    try {
      setNoStoreHeader(res);
      const token = parseParamsToken(req.params.token);
      const imageId = req.params.imageId;

      if (!token) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ path: ['token'], message: 'Token is required' }],
        });
        return;
      }

      const session = await prisma.photoUploadSession.findUnique({
        where: { token },
        select: { sessionId: true, createdBy: true },
      });

      if (!session) {
        res.status(404).json({
          code: 'PHOTO_SESSION_NOT_FOUND',
          message: 'Photo session does not exist.',
        });
        return;
      }

      if (session.createdBy !== req.user!.user_id) {
        await writeAuditLogBestEffort({
          actorId: req.user!.user_id,
          actorType: 'user',
          actorRole: req.user!.role,
          action: 'photo_image_access_denied',
          entityType: 'photo_session_image',
          entityId: imageId,
          entityLabel: `photo session ${session.sessionId}`,
          outcome: 'denied',
          reasonCode: 'session_ownership_mismatch',
          ...auditContextFromRequest(req),
        });
        res.status(403).json({
          code: 'FORBIDDEN',
          message: 'You do not have access to this photo session.',
        });
        return;
      }

      const deleteContext = auditContextFromRequest(req);
      const deleted = await prisma.$transaction(async (tx) => {
        const result = await tx.photoSessionImage.deleteMany({
          where: { imageId, sessionId: session.sessionId },
        });
        if (result.count > 0) {
          await writeAuditLog(
            {
              actorId: req.user!.user_id,
              actorType: 'user',
              actorRole: req.user!.role,
              action: 'photo_image_deleted',
              entityType: 'photo_session_image',
              entityId: imageId,
              outcome: 'success',
              details: { sessionId: session.sessionId },
              ...deleteContext,
            },
            tx
          );
        }
        return result;
      });

      if (deleted.count === 0) {
        res.status(404).json({
          code: 'PHOTO_SESSION_IMAGE_NOT_FOUND',
          message: 'Image not found in this session.',
        });
        return;
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
