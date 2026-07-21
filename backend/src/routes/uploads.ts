import { Router } from 'express';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2, R2_BUCKET } from '../lib/r2';
import authenticate from '../middleware/authenticate';
import {
  auditContextFromRequest,
  writeAuditLogBestEffort,
} from '../utils/auditLog';
import { getUploadSizeCategory } from '../utils/uploadMetadata';

const router = Router();

/**
 * @openapi
 * /api/uploads/presigned-url:
 *   post:
 *     summary: Create a presigned upload URL for an image
 *     tags: [Uploads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileName, contentType, fileSizeKb]
 *             properties:
 *               fileName:
 *                 type: string
 *                 example: cat.png
 *               contentType:
 *                 type: string
 *                 example: image/png
 *               fileSizeKb:
 *                 type: integer
 *                 example: 350
 *     responses:
 *       '200':
 *         description: Presigned upload URL created
 *       '400':
 *         description: Invalid file information
 *       '401':
 *         description: Unauthorized
 */
router.post('/presigned-url', authenticate, async (req, res, next) => {
  try {
    const { fileName, contentType, fileSizeKb } = req.body;

    if (!fileName || !contentType || !fileSizeKb) {
      res.status(400).json({
        code: 'MISSING_FILE_INFO',
        message: 'fileName, contentType, and fileSizeKb are required.',
      });
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      res.status(400).json({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are supported.',
      });
      return;
    }

    const maxFileSizeKb = 5 * 1024;
    if (fileSizeKb > maxFileSizeKb) {
      res.status(400).json({
        code: 'FILE_TOO_LARGE',
        message: 'Image must be 5MB or smaller.',
      });
      return;
    }

    const ext = contentType.split('/')[1];
    const key = `reports/${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
      // NOTE: fileSizeKb is client-reported and not independently verified.
      // Adding ContentLength + signableHeaders pins the presigned URL to this
      // declared size — if the client sends a different Content-Length header
      // during the actual PUT, the signature becomes invalid and the upload
      // is rejected. This does not prevent a client from declaring a small
      // fileSizeKb and then omitting/spoofing the Content-Length header entirely
      // in non-browser clients. Full enforcement would require a post-upload
      // HeadObject check (or R2 lifecycle rule) to verify actual object size
      // and delete oversized objects. Tracked as a follow-up; out of scope here.
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: 60 * 60,
    });

    await writeAuditLogBestEffort({
      actorId: req.user!.user_id,
      actorType: 'user',
      action: 'upload_authorized',
      entityType: 'upload',
      entityId: null,
      outcome: 'success',
      details: {
        contentType,
        sizeCategory: getUploadSizeCategory(fileSizeKb),
      },
      ...auditContextFromRequest(req),
    });

    res.status(200).json({
      uploadUrl,
      imageUrl: key,
      fileType: ext,
      fileSizeKb,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
