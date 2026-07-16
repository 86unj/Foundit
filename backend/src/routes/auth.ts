import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { TokenExpiredError } from 'jsonwebtoken';
import { prisma } from '../db';
import { validate } from '../validators/shared';
import {
  loginSchema,
  registerSchema,
  refreshSchema,
  logoutSchema,
} from '../validators/auth';
import { comparePassword, hashPassword } from '../utils/password';
import { generateUniqueUsername } from '../utils/username';
import {
  signAccessToken,
  signRefreshToken,
  hashTokenForStorage,
  verifyRefreshToken,
} from '../utils/token';
import { writeAuditLog } from '../utils/auditLog';
import {
  generateVerifyToken,
  getVerifyTokenExpiry,
} from '../utils/emailVerification';
import { sendVerificationEmail } from '../lib/email';

// Limits login attempts to 10 per IP per 15 minutes to slow down brute-force attacks.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Too many login attempts. Try again in 15 minutes.',
  },
});

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: student@myseneca.ca
 *               password:
 *                 type: string
 *                 example: Secret@1234
 *     responses:
 *       '200':
 *         description: Login successful — returns access token, refresh token, and user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [student, security, admin]
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     campusId:
 *                       type: string
 *                       nullable: true
 *       '400':
 *         description: Validation error (e.g. not a @myseneca.ca email)
 *       '401':
 *         description: Email or password is incorrect
 *       '403':
 *         description: Account has been deactivated or email is not verified
 *
 *
 *       '429':
 *         description: Too many login attempts — rate limited for 15 minutes
 */
router.post(
  '/login',
  loginRateLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;

      // Look up the user by email — same generic error for not found and wrong password
      // to avoid leaking whether an email is registered.
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (!user) {
        res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect.',
        });
        return;
      }

      // Check is_active before bcrypt to avoid unnecessary hashing work
      if (!user.isActive) {
        res.status(403).json({
          code: 'ACCOUNT_INACTIVE',
          message:
            'Your account has been deactivated. Contact an administrator.',
        });
        return;
      }

      const passwordMatch = await comparePassword(password, user.passwordHash);
      if (!passwordMatch) {
        res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message: 'Email or password is incorrect.',
        });
        return;
      }
      if (!user.isEmailVerified) {
        res.status(403).json({
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please verify your email before logging in.',
        });
        return;
      }

      const accessToken = signAccessToken({
        user_id: user.userId,
        role: user.role,
        campus_id: user.campusId ?? null,
        email: user.email,
      });

      const refreshToken = signRefreshToken(user.userId);
      const tokenHash = hashTokenForStorage(refreshToken);
      const refreshDays =
        parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7') || 7;

      await prisma.refreshTokenLog.create({
        data: {
          userId: user.userId,
          tokenHash,
          expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        },
      });

      await writeAuditLog({
        actorId: user.userId,
        action: 'user_login',
        entityType: 'user',
        entityId: user.userId,
        ipAddress: req.ip,
      });

      res.status(200).json({
        accessToken,
        refreshToken,
        user: {
          userId: user.userId,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          campusId: user.campusId,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Self-register a new user account
 *     description: Creates a new student or security account. Admin role is not available via self-registration. Call POST /api/auth/login separately to obtain tokens.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName]
 *             properties:
 *               email:
 *                 type: string
 *                 example: jane@myseneca.ca
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Must contain at least one uppercase letter, one lowercase letter, and one digit
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               campusId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional — campus can be assigned later by an admin
 *               phone:
 *                 type: string
 *                 example: '4161234567'
 *     responses:
 *       '201':
 *         description: Account created — check your email and verify before logging in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: string
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *                     role:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     campusId:
 *                       type: string
 *                       nullable: true
 *       '400':
 *         description: Validation error
 *       '409':
 *         description: Email already in use
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof registerSchema>;

    // Reject duplicate emails early — findUnique is faster than catching a DB unique constraint error
    const normalizedEmail = data.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { userId: true },
    });
    if (existing) {
      res.status(409).json({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
      });
      return;
    }

    const passwordHash = await hashPassword(data.password);

    // Auto-generate a username from the user's name — e.g. "janedoe4521"
    const username = await generateUniqueUsername(
      data.firstName,
      data.lastName
    );
    const securityEmails = ['rvelasco6@myseneca.ca'];
    const role = securityEmails.includes(data.email.toLowerCase())
      ? 'security'
      : 'student';

    const verifyToken = generateVerifyToken();
    const verifyTokenHash = hashTokenForStorage(verifyToken);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          username,
          role,
          firstName: data.firstName,
          lastName: data.lastName,
          // campusId is optional at registration — null until assigned by an admin
          campus: data.campusId
            ? { connect: { campusId: data.campusId } }
            : undefined,
          phone: data.phone,
          emailVerifyToken: verifyTokenHash,
          emailVerifyTokenExpiresAt: getVerifyTokenExpiry(),
          isEmailVerified: false,
        },
      });
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        res.status(409).json({
          code: 'EMAIL_TAKEN',
          message: 'An account with this email already exists.',
        });
        return;
      }
      throw err;
    }

    try {
      await sendVerificationEmail(user.email, verifyToken);
      console.log(`Verification email sent to ${user.userId}`);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);

      await prisma.user.delete({
        where: { userId: user.userId },
      });

      res.status(500).json({
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to send verification email. Please try again.',
      });
      return;
    }

    await writeAuditLog({
      actorId: user.userId,
      action: 'user_registered',
      entityType: 'user',
      entityId: user.userId,
      ipAddress: req.ip,
    });

    // Return user profile only — no tokens issued at registration.
    // The frontend must call POST /api/auth/login separately to obtain tokens.
    res.status(201).json({
      user: {
        userId: user.userId,
        email: user.email,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        campusId: user.campusId,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify email address via token link
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '302':
 *         description: Email verified successfully. Redirects to the frontend email verified page.
 *       '400':
 *         description: Token missing, invalid, or expired
 */
router.get('/verify-email', async (req, res, next) => {
  try {
    const token = req.query.token as string;

    if (!token) {
      res.status(400).json({
        code: 'MISSING_TOKEN',
        message: 'Verification token is required.',
      });
      return;
    }

    const tokenHash = hashTokenForStorage(token);
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: tokenHash },
    });

    if (!user) {
      res.status(400).json({
        code: 'INVALID_TOKEN',
        message: 'Verification token is invalid.',
      });
      return;
    }

    if (user.emailVerifyTokenExpiresAt! < new Date()) {
      res.status(400).json({
        code: 'TOKEN_EXPIRED',
        message: 'Verification token has expired. Please register again.',
      });
      return;
    }

    await prisma.user.update({
      where: { userId: user.userId },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyTokenExpiresAt: null,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/email-verified`);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     summary: Exchange a refresh token for a new access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Returns a new access token (refresh token is rotated)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Refresh token is invalid, expired, or already revoked
 *       '501':
 *         description: Not yet implemented
 */
// Verify refresh token, rotate, and issue a new access token
router.post('/refresh', validate(refreshSchema), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>;

    let payload: { userId: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        res.status(401).json({
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please log in again.',
        });
        return;
      }

      res.status(401).json({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid.',
      });
      return;
    }

    const tokenHash = hashTokenForStorage(refreshToken);
    const log = await prisma.refreshTokenLog.findUnique({
      where: { tokenHash },
    });

    if (
      !log ||
      log.revoked ||
      log.expiresAt < new Date() ||
      log.userId !== payload.userId
    ) {
      res.status(401).json({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or has been revoked.',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { userId: payload.userId },
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or has been revoked.',
      });
      return;
    }

    const accessToken = signAccessToken({
      user_id: user.userId,
      role: user.role,
      campus_id: user.campusId ?? null,
      email: user.email,
    });

    const newRefreshToken = signRefreshToken(user.userId);
    const newTokenHash = hashTokenForStorage(newRefreshToken);
    const refreshDays =
      parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? '7') || 7;

    await prisma.$transaction([
      prisma.refreshTokenLog.update({
        where: { logId: log.logId },
        data: { revoked: true },
      }),
      prisma.refreshTokenLog.create({
        data: {
          userId: user.userId,
          tokenHash: newTokenHash,
          expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Revoke a refresh token and log out
 *     description: No access token required. The provided refresh token is revoked and cannot be used again.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       '204':
 *         description: Logged out successfully — no response body
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Refresh token is invalid or already revoked
 *       '501':
 *         description: Not yet implemented
 */
// TODO: Revoke refresh token (no access token required)
router.post('/logout', validate(logoutSchema), (_req, res) => {
  res.status(501).json({
    code: 'NOT_IMPLEMENTED',
    message: 'POST /api/auth/logout not yet implemented',
  });
});

export default router;
