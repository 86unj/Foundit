import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export default function requestContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = randomUUID();
  req.auditContext = { requestId, ipAddress: req.ip };
  res.setHeader('X-Request-Id', requestId);
  next();
}
