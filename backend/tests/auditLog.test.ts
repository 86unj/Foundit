import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/db', () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));

vi.mock('../src/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { prisma } from '../src/db';
import { logger } from '../src/lib/logger';
import {
  auditContextFromRequest,
  writeAuditLog,
  writeAuditLogBestEffort,
} from '../src/utils/auditLog';
import { auditEvents } from '../src/utils/auditEvents';
import { auditSummaries } from '../src/utils/auditSummaries';

describe('audit log helper', () => {
  beforeEach(() => vi.clearAllMocks());

  test('reuses a lazily generated request context', () => {
    const req = { ip: '127.0.0.1' } as never;

    const first = auditContextFromRequest(req);
    const second = auditContextFromRequest(req);

    expect(second).toEqual(first);
  });

  test('persists anonymous denied events with trusted context', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({
      logId: 'log-1',
    } as never);

    await writeAuditLog({
      actorType: 'anonymous',
      action: 'user_login_denied',
      entityType: 'user',
      entityId: null,
      outcome: 'denied',
      reasonCode: 'unknown_email',
      requestId: 'f3b625d1-7ec0-44bf-aa5e-e39137dcce74',
      ipAddress: '127.0.0.1',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        actorType: 'anonymous',
        entityId: null,
        outcome: 'denied',
        reasonCode: 'unknown_email',
      }),
    });
  });

  test('required writes propagate persistence failures', async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(
      new Error('database unavailable')
    );

    await expect(
      writeAuditLog({
        actorType: 'system',
        action: 'unverified_user_deleted',
        entityType: 'user',
        entityId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
        outcome: 'success',
        runId: '4cc23c6c-6d08-49e3-924d-926448fb7a64',
      })
    ).rejects.toThrow('database unavailable');
  });

  test('best-effort writes swallow persistence failures and log sanitized context', async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(
      new Error('database unavailable')
    );

    await expect(
      writeAuditLogBestEffort({
        actorType: 'anonymous',
        action: 'user_login_denied',
        entityType: 'user',
        entityId: null,
        outcome: 'denied',
        reasonCode: 'wrong_password',
        requestId: 'f3b625d1-7ec0-44bf-aa5e-e39137dcce74',
      })
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_login_denied',
        outcome: 'denied',
        requestId: 'f3b625d1-7ec0-44bf-aa5e-e39137dcce74',
      }),
      'audit_log_persistence_failed'
    );
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
      'database unavailable'
    );
  });

  test('best-effort writes reject invalid event contracts before persistence', async () => {
    await expect(
      writeAuditLogBestEffort({
        actorType: 'anonymous',
        action: 'user_login_denied',
        entityType: 'user',
        entityId: null,
        outcome: 'denied',
        details: { credentialType: 'password' },
      })
    ).rejects.toThrow('Audit detail is not allowed');

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test.each(['password', 'refreshToken', 'tokenHash', 'presignedUrl'])(
    'rejects prohibited detail key %s',
    async (key) => {
      await expect(
        writeAuditLog({
          actorType: 'user',
          actorId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
          action: 'user_profile_updated',
          entityType: 'user',
          entityId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
          outcome: 'success',
          details: { [key]: 'secret' },
        })
      ).rejects.toThrow(/prohibited audit detail/i);
    }
  );
});

describe('audit detail enrichment', () => {
  beforeEach(() => vi.clearAllMocks());

  test('every catalog action has a summary registry entry', () => {
    expect(Object.keys(auditSummaries).sort()).toEqual(
      Object.keys(auditEvents).sort()
    );
  });

  test('merges actorRole, entityLabel, and a generated summary into details', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({
      logId: 'log-1',
    } as never);

    await writeAuditLog({
      actorType: 'user',
      actorId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
      actorRole: 'security',
      action: 'item_status_updated',
      entityType: 'item',
      entityId: '5a1a4b2a-6c1a-4a1a-9a1a-6c1a4a1a9a1a',
      entityLabel: 'Blue backpack (electronics)',
      outcome: 'success',
      details: { previousStatus: 'stored', nextStatus: 'claimed' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: expect.objectContaining({
          previousStatus: 'stored',
          nextStatus: 'claimed',
          actorRole: 'security',
          entityLabel: 'Blue backpack (electronics)',
          summary: expect.any(String),
        }),
      }),
    });
  });

  test('still rejects an unrelated key not in the action detailKeys allowlist', async () => {
    await expect(
      writeAuditLog({
        actorType: 'user',
        actorId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
        actorRole: 'security',
        action: 'item_status_updated',
        entityType: 'item',
        entityId: '5a1a4b2a-6c1a-4a1a-9a1a-6c1a4a1a9a1a',
        outcome: 'success',
        details: { previousStatus: 'stored', unrelatedKey: 'nope' },
      })
    ).rejects.toThrow('Audit detail is not allowed');

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('generates a summary even when details are sparse or absent', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({
      logId: 'log-1',
    } as never);

    await writeAuditLog({
      actorType: 'user',
      actorId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
      actorRole: 'security',
      action: 'item_created',
      entityType: 'item',
      entityId: '5a1a4b2a-6c1a-4a1a-9a1a-6c1a4a1a9a1a',
      outcome: 'success',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: expect.objectContaining({ summary: expect.any(String) }),
      }),
    });
  });

  test('omits actorRole entirely when the caller does not supply one', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({
      logId: 'log-1',
    } as never);

    await writeAuditLog({
      actorType: 'system',
      action: 'unverified_user_deleted',
      entityType: 'user',
      entityId: '83cc0e8c-2a1e-4d69-864c-d3f374b105a6',
      outcome: 'success',
      runId: '4cc23c6c-6d08-49e3-924d-926448fb7a64',
    });

    const call = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0];
    expect(call?.data.details).not.toHaveProperty('actorRole');
    expect(call?.data.details).not.toHaveProperty('entityLabel');
  });
});
