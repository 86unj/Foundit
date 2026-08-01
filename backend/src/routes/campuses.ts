import { Router } from 'express';
import { prisma } from '../db';

const router = Router();

/** Sentinel campus used when a student has no campus yet — not selectable in UI. */
const MISSING_CAMPUS_ID = '00000000-0000-0000-0000-000000000000';

/**
 * @openapi
 * /api/campuses:
 *   get:
 *     summary: List campuses
 *     tags: [Campuses]
 *     responses:
 *       '200':
 *         description: Campus list
 */
router.get('/', async (_req, res, next) => {
  try {
    const campuses = await prisma.campus.findMany({
      where: {
        campusId: { not: MISSING_CAMPUS_ID },
      },
      select: {
        campusId: true,
        campusName: true,
      },
      orderBy: { campusName: 'asc' },
    });

    res.status(200).json(campuses);
  } catch (err) {
    next(err);
  }
});

export default router;
