import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../lib/logger';
import {
  auditEvents,
  type AuditAction,
  prohibitedAuditDetailKeys,
} from './auditEvents';
import { auditSummaries } from './auditSummaries';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';

export interface AuditLogParams {
  actorId?: string | null;
  actorType?: 'anonymous' | 'user' | 'system' | 'unknown';
  actorRole?: 'student' | 'security' | 'admin';
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  entityLabel?: string;
  outcome?: 'success' | 'denied' | 'failure';
  reasonCode?: string | null;
  requestId?: string | null;
  runId?: string | null;
  details?: Prisma.InputJsonObject;
  ipAddress?: string;
}

export function auditContextFromRequest(req: Request): {
  requestId: string;
  ipAddress?: string;
} {
  req.auditContext ??= { requestId: randomUUID(), ipAddress: req.ip };
  return req.auditContext;
}

function assertSafeDetails(
  action: AuditAction,
  value: unknown,
  path = 'details'
): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    if (prohibitedAuditDetailKeys.some((term) => normalized === term)) {
      throw new Error(`Prohibited audit detail at ${path}.${key}`);
    }
    if (
      path === 'details' &&
      !auditEvents[action].detailKeys.includes(key as never)
    ) {
      throw new Error(`Audit detail is not allowed for ${action}: ${key}`);
    }
    assertSafeDetails(action, nested, `${path}.${key}`);
  }
}

function assertRequiredDetails(
  action: AuditAction,
  details: Prisma.InputJsonObject | undefined
): void {
  for (const key of auditEvents[action].requiredDetailKeys) {
    if (!details || !(key in details)) {
      throw new Error(`Required audit detail is missing for ${action}: ${key}`);
    }
  }
}

function resolveActorType(params: AuditLogParams) {
  return params.actorType ?? (params.actorId ? 'user' : 'unknown');
}

// Builds the human-readable details a reader sees alongside the caller's own
// structured fields: a role label (only when an authenticated actor supplied
// one), an entity label (only when the call site supplied one), and a
// one-line summary sentence from the auditSummaries registry. actorRole and
// entityLabel are separate AuditLogParams fields rather than caller-supplied
// `details` keys, so they never pass through assertSafeDetails's per-action
// allowlist at all -- no 40-entry catalog change is needed to support them.
function enrichDetails(
  params: AuditLogParams,
  actorType: NonNullable<AuditLogParams['actorType']>,
  outcome: NonNullable<AuditLogParams['outcome']>
): Prisma.InputJsonObject {
  const summary = auditSummaries[params.action]({
    actorType,
    actorRole: params.actorRole,
    entityLabel: params.entityLabel,
    outcome,
    reasonCode: params.reasonCode ?? null,
    details: params.details as Record<string, unknown> | undefined,
  });

  return {
    ...(params.details ?? {}),
    ...(params.actorRole ? { actorRole: params.actorRole } : {}),
    ...(params.entityLabel ? { entityLabel: params.entityLabel } : {}),
    summary,
  };
}

function toAuditData(params: AuditLogParams) {
  const event = auditEvents[params.action];
  if (params.entityType !== event.entityType) {
    throw new Error(
      `Audit entity type mismatch for ${params.action}: expected ${event.entityType}`
    );
  }
  assertSafeDetails(params.action, params.details);
  assertRequiredDetails(params.action, params.details);
  const actorType = resolveActorType(params);
  const outcome = params.outcome ?? 'success';
  return {
    actorId: params.actorId ?? null,
    actorType,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    outcome,
    reasonCode: params.reasonCode ?? null,
    requestId: params.requestId ?? null,
    runId: params.runId ?? null,
    details: enrichDetails(params, actorType, outcome),
    ipAddress: params.ipAddress,
  };
}

// Writes a single audit log entry to the database.
// Pass a transaction client to include the insert in an existing transaction.
export async function writeAuditLog(
  params: AuditLogParams,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx ?? prisma;
  const record = await client.auditLog.create({
    data: toAuditData(params),
  });

  logger.info(
    {
      logId: record.logId,
      action: params.action,
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      outcome: params.outcome ?? 'success',
      requestId: params.requestId,
      runId: params.runId,
    },
    params.action
  );
}

export async function writeAuditLogs(
  params: AuditLogParams[],
  tx: Prisma.TransactionClient
): Promise<void> {
  if (params.length === 0) return;
  await tx.auditLog.createMany({ data: params.map(toAuditData) });
  logger.info(
    {
      auditCount: params.length,
      actions: [...new Set(params.map(({ action }) => action))],
      requestId: params[0]?.requestId,
      runId: params[0]?.runId,
    },
    'audit_logs_created'
  );
}

export async function writeAuditLogBestEffort(
  params: AuditLogParams
): Promise<void> {
  const data = toAuditData(params);
  try {
    const record = await prisma.auditLog.create({ data });
    logger.info(
      {
        logId: record.logId,
        action: params.action,
        actorId: params.actorId,
        entityType: params.entityType,
        entityId: params.entityId,
        outcome: params.outcome ?? 'success',
        requestId: params.requestId,
        runId: params.runId,
      },
      params.action
    );
  } catch (error) {
    const errorMetadata =
      error instanceof Error
        ? {
            errorName: error.name,
            errorCode:
              'code' in error && typeof error.code === 'string'
                ? error.code
                : undefined,
          }
        : { errorName: 'UnknownError' };
    logger.error(
      {
        ...errorMetadata,
        action: params.action,
        outcome: params.outcome ?? 'success',
        actorType: resolveActorType(params),
        entityType: params.entityType,
        entityId: params.entityId,
        reasonCode: params.reasonCode,
        requestId: params.requestId,
        runId: params.runId,
      },
      'audit_log_persistence_failed'
    );
  }
}
