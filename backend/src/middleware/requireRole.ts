import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import {
  auditContextFromRequest,
  writeAuditLogBestEffort,
} from '../utils/auditLog';

const requireRole = (...roles: UserRole[]) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res
        .status(401)
        .json({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      const context = auditContextFromRequest(req);
      await writeAuditLogBestEffort({
        actorId: req.user.user_id,
        actorType: 'user',
        action: 'authorization_denied',
        entityType: 'route',
        entityId: null,
        outcome: 'denied',
        reasonCode: 'insufficient_role',
        details: {
          method: req.method,
          routePurpose: `${req.baseUrl}${req.route?.path ?? req.path}`,
          requiredRoles: roles,
          actualRole: req.user.role,
        },
        ...context,
      });
      res
        .status(403)
        .json({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export default requireRole;
