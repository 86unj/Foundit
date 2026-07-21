import { describe, expect, test, vi } from 'vitest';
import requireRole from '../src/middleware/requireRole';

vi.mock('../src/utils/auditLog', () => ({
  auditContextFromRequest: vi.fn(() => ({
    requestId: '11111111-1111-4111-8111-111111111111',
    ipAddress: '127.0.0.1',
  })),
  writeAuditLogBestEffort: vi.fn(),
}));

import { writeAuditLogBestEffort } from '../src/utils/auditLog';

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
}

describe('requireRole middleware', () => {
  test('returns 401 if user is not logged in', async () => {
    const req = {};
    const res = mockRes();
    const next = vi.fn();

    await requireRole('student' as never)(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(writeAuditLogBestEffort).not.toHaveBeenCalled();
  });

  test('returns 403 if user has wrong role', async () => {
    const req = {
      method: 'POST',
      baseUrl: '/api/items',
      path: '/',
      user: { user_id: 'user-1', role: 'student' },
    };
    const res = mockRes();
    const next = vi.fn();

    await requireRole('admin' as never)(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(writeAuditLogBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        action: 'authorization_denied',
        outcome: 'denied',
        reasonCode: 'insufficient_role',
      })
    );
  });

  test('calls next if user has correct role', async () => {
    const req = {
      user: { role: 'admin' },
    };
    const res = mockRes();
    const next = vi.fn();

    await requireRole('admin' as never)(req as never, res as never, next);

    expect(next).toHaveBeenCalled();
  });
});
